"""
Fyers TBT Depth Ingester Service
=================================

Standalone service that connects to Fyers TBT WebSocket for 50-level depth data
and publishes to Redis for consumption by FastAPI WebSocket endpoints.

Redis Publishing:
    - depth:{symbol} (Pub/Sub) - Real-time streaming to connected clients
    - cache:depth:{symbol} (String) - Latest snapshot for late joiners
    - depth:history:{symbol}:{YYYY-MM-DD} (Stream) - Full day history for replay

Usage:
    Development (Windows):
        uv run python services/depth_ingester.py --debug

    Production (Linux):
        uv run python services/depth_ingester.py --daemon \
            --logfile=/var/log/fin-terminal/depth-ingester.log
"""

import argparse
import asyncio
import json
import logging
import os
import signal
import sys
import time
from collections import OrderedDict
from datetime import datetime, timedelta, date
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

import redis.asyncio as aioredis

# Add project root to path for shared imports
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from shared.market_calendar import is_market_hours, get_trading_date, get_cache_ttl, is_trading_day, IST
from shared.depth_serialization import pack_depth_data, transform_fyers_depth
from shared.depth_subscription import (
    DEPTH_CONTROL_CHANNEL,
    DEPTH_RESPONSE_PREFIX,
    DEPTH_VIEWERS_HASH,
    DEPTH_SUBSCRIBED_SET,
    DEPTH_METRICS_HASH,
    MAX_DYNAMIC_SLOTS,
    TTL_SECONDS,
    validate_symbol,
    SubscriptionCommand,
    SubscriptionResponse,
    METRIC_EVICTIONS,
    METRIC_TTL_EXPIRATIONS,
    METRIC_SUBSCRIPTION_FAILURES,
    METRIC_SUBSCRIPTIONS_TOTAL,
)
from dotenv import load_dotenv

# Load environment variables
load_dotenv(PROJECT_ROOT / ".env")

# Fyers imports
try:
    from fyers_apiv3.FyersWebsocket.tbt_ws import FyersTbtSocket, SubscriptionModes
except ImportError:
    print("ERROR: fyers-apiv3 not installed. Run: uv add fyers-apiv3")
    sys.exit(1)


# =============================================================================
# DYNAMIC FUTURES SYMBOL GENERATION
# =============================================================================

def get_expiry_date(year: int, month: int) -> date:
    """
    Get the actual futures expiry date for a given month.

    NSE Index Futures expire on LAST TUESDAY of the month.
    If last Tuesday is a holiday, expiry moves to PREVIOUS trading day.

    Verified expiry dates from NSE:
    - Dec 2025: 30-Dec-2025 (Tuesday)
    - Jan 2026: 27-Jan-2026 (Tuesday)
    - Feb 2026: 24-Feb-2026 (Tuesday)

    Args:
        year: Year (e.g., 2025)
        month: Month (1-12)

    Returns:
        Expiry date
    """
    # Find last day of month
    if month == 12:
        next_month = date(year + 1, 1, 1)
    else:
        next_month = date(year, month + 1, 1)

    last_day = next_month - timedelta(days=1)

    # Find last Tuesday (weekday 1 = Tuesday)
    days_since_tuesday = (last_day.weekday() - 1) % 7
    last_tuesday = last_day - timedelta(days=days_since_tuesday)

    # If last Tuesday is a holiday, move to previous trading day
    expiry = last_tuesday
    while not is_trading_day(expiry):
        expiry -= timedelta(days=1)

    return expiry


def get_current_futures_symbol(index_name: str) -> str:
    """
    Get the current month's futures symbol for an index.

    Fyers format: NSE:{INDEX}{YY}{MMM}FUT
    Examples: NSE:NIFTY25DECFUT, NSE:BANKNIFTY26JANFUT

    NSE Index Futures expire on LAST TUESDAY of the month at 3:30 PM IST.
    If last Tuesday is a holiday, expiry moves to previous trading day.

    Args:
        index_name: Base index name (e.g., 'NIFTY', 'BANKNIFTY')

    Returns:
        Fyers futures symbol (e.g., 'NSE:NIFTY25DECFUT')
    """
    now = datetime.now(IST)

    # Get expiry date for current month
    expiry_date = get_expiry_date(now.year, now.month)
    expiry_time = IST.localize(datetime(
        expiry_date.year, expiry_date.month, expiry_date.day,
        15, 30, 0
    ))

    if now > expiry_time:
        # Rollover to next month
        if now.month == 12:
            target_month = 1
            target_year = now.year + 1
        else:
            target_month = now.month + 1
            target_year = now.year
    else:
        target_month = now.month
        target_year = now.year

    # Format: YY + MMM (uppercase)
    month_abbr = datetime(target_year, target_month, 1).strftime("%b").upper()
    year_short = str(target_year)[2:]  # Last 2 digits

    return f"NSE:{index_name}{year_short}{month_abbr}FUT"


def get_core_symbols() -> List[str]:
    """
    Get core symbols with dynamic futures for indices.

    Replaces static index symbols (which don't support depth) with
    current month futures contracts that have real order books.
    """
    return [
        get_current_futures_symbol("NIFTY"),      # e.g., NSE:NIFTY25DECFUT
        get_current_futures_symbol("BANKNIFTY"),  # e.g., NSE:BANKNIFTY25DECFUT
        'NSE:RELIANCE-EQ',
        'NSE:AQYLON-BE',
        'NSE:RAMASTEEL-EQ',
    ]


# =============================================================================
# CONFIGURATION
# =============================================================================

# Fyers API Configuration
FYERS_APP_ID = os.getenv("FYERS_APP_ID", "")
FYERS_SECRET_KEY = os.getenv("FYERS_SECRET_KEY", "")
FYERS_TOKEN_PATH = Path(os.getenv("FYERS_TOKEN_PATH", "./fyers_token.json"))

# Redis Configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
DEPTH_REDIS_CHANNEL_PREFIX = os.getenv("DEPTH_REDIS_CHANNEL_PREFIX", "depth")
DEPTH_HISTORY_TTL_SECONDS = int(os.getenv("DEPTH_HISTORY_TTL_SECONDS", "86400"))
DEPTH_STREAM_MAXLEN = int(os.getenv("DEPTH_STREAM_MAXLEN", "100000"))

# Core symbols to subscribe (high liquidity futures and stocks)
# Note: Index symbols don't support depth data in Fyers API, so we use futures instead
CORE_SYMBOLS = get_core_symbols()

# Reconnection settings
RECONNECT_INITIAL_DELAY = 5  # seconds
RECONNECT_MAX_DELAY = 300  # 5 minutes max
RECONNECT_MULTIPLIER = 2

# Market hours check interval
MARKET_CHECK_INTERVAL = 60  # seconds


# =============================================================================
# LOGGING SETUP
# =============================================================================

def setup_logging(debug: bool = False, logfile: Optional[str] = None) -> logging.Logger:
    """Configure logging for the ingester service."""
    logger = logging.getLogger("depth_ingester")
    logger.setLevel(logging.DEBUG if debug else logging.INFO)

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.DEBUG if debug else logging.INFO)
    console_format = logging.Formatter(
        "[%(asctime)s] %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    console_handler.setFormatter(console_format)
    logger.addHandler(console_handler)

    # File handler (if specified)
    if logfile:
        logpath = Path(logfile)
        logpath.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(logfile, encoding="utf-8")
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(console_format)
        logger.addHandler(file_handler)

    return logger


# =============================================================================
# TOKEN MANAGEMENT
# =============================================================================

def load_fyers_token() -> Optional[str]:
    """
    Load Fyers access token from cache file.

    Returns:
        Access token string or None if not available/expired
    """
    if not FYERS_TOKEN_PATH.exists():
        return None

    try:
        with open(FYERS_TOKEN_PATH, 'r') as f:
            token_data = json.load(f)

        access_token = token_data.get('access_token')
        expiry_str = token_data.get('expiry')

        if not access_token:
            return None

        if expiry_str:
            expiry = datetime.fromisoformat(expiry_str)
            if datetime.now() >= expiry:
                return None

        return access_token

    except Exception:
        return None


# =============================================================================
# FYERS CONNECTION POOL
# =============================================================================

SYMBOLS_PER_CONNECTION = 5  # Fyers TBT limit per WebSocket connection
MAX_FYERS_CONNECTIONS = 3   # 3 × 5 = 15 total symbol capacity


class FyersConnectionPool:
    """
    Pool of Fyers TBT WebSocket connections.

    Each Fyers TBT connection supports up to 5 symbols. This pool manages
    multiple connections to support core symbols (5) plus dynamic subscriptions
    (up to 10 more across 2 additional connections).

    Connections are created on demand:
      - Connection 0: Created at startup with core symbols
      - Connection 1-2: Created when dynamic subscriptions need more capacity
    """

    def __init__(self, ingester: 'DepthIngester'):
        self.ingester = ingester
        self.logger = ingester.logger
        self._access_token: Optional[str] = None
        self._connections: List[dict] = []
        self._symbol_conn: Dict[str, int] = {}  # symbol → connection index

    @property
    def is_any_connected(self) -> bool:
        return any(c['is_connected'] for c in self._connections)

    @property
    def all_symbols(self) -> Set[str]:
        """All symbols across all connections."""
        result: Set[str] = set()
        for c in self._connections:
            result.update(c['symbols'])
        return result

    @property
    def available_slots(self) -> int:
        """Total available slots across existing + potential connections."""
        existing = sum(
            SYMBOLS_PER_CONNECTION - len(c['symbols'])
            for c in self._connections
        )
        potential = (MAX_FYERS_CONNECTIONS - len(self._connections)) * SYMBOLS_PER_CONNECTION
        return existing + potential

    def connect(self, access_token: str, initial_symbols: List[str]):
        """Create the primary connection with core symbols."""
        self._access_token = access_token
        self._create_connection(initial_symbols)

    def _create_connection(self, initial_symbols: List[str] = None) -> int:
        """Create a new Fyers TBT WebSocket connection."""
        conn_id = len(self._connections)
        initial = list(initial_symbols or [])

        conn = {
            'id': conn_id,
            'fyers': None,
            'symbols': set(initial),
            'is_connected': False,
            'initial_symbols': initial,
        }
        self._connections.append(conn)

        for sym in initial:
            self._symbol_conn[sym] = conn_id

        self.logger.info(
            f"[Pool] Creating connection {conn_id} "
            f"({len(initial)} symbols: {initial})"
        )

        fyers = FyersTbtSocket(
            access_token=self._access_token,
            write_to_file=False,
            log_path="",
            on_open=lambda c=conn: self._on_open(c),
            on_close=lambda msg, c=conn: self._on_close(c, msg),
            on_error=lambda msg, c=conn: self._on_error(c, msg),
            on_depth_update=self.ingester._on_depth_update,
            on_error_message=lambda msg, c=conn: self._on_error_message(c, msg),
        )
        conn['fyers'] = fyers
        fyers.connect()

        return conn_id

    def _on_open(self, conn: dict):
        """Handle connection opened."""
        conn_id = conn['id']
        conn['is_connected'] = True
        fyers = conn['fyers']
        symbols = conn['initial_symbols']

        self.logger.info(f"[Pool-{conn_id}] Connected")

        if symbols:
            fyers.subscribe(
                symbol_tickers=symbols,
                channelNo='1',
                mode=SubscriptionModes.DEPTH
            )
            self.logger.info(f"[Pool-{conn_id}] Subscribed: {symbols}")

        fyers.switchChannel(resume_channels=['1'], pause_channels=[])
        fyers.keep_running()

        # Notify ingester
        self.ingester._on_pool_connection_ready(conn_id)

    def _on_close(self, conn: dict, message):
        """Handle connection closed."""
        conn_id = conn['id']
        conn['is_connected'] = False
        self.logger.warning(f"[Pool-{conn_id}] Closed: {message}")

        # Mark ingester as disconnected so main loop reconnects
        self.ingester.is_connected = False

        if self.ingester.is_running and self.ingester._loop:
            asyncio.run_coroutine_threadsafe(
                self.ingester._schedule_reconnect(),
                self.ingester._loop
            )

    def _on_error(self, conn: dict, message):
        self.logger.error(f"[Pool-{conn['id']}] Error: {message}")

    def _on_error_message(self, conn: dict, message):
        self.logger.error(f"[Pool-{conn['id']}] Server error: {message}")

    def subscribe(self, symbol: str) -> bool:
        """
        Subscribe to a symbol on a connection with available capacity.

        Returns True if subscribed (or queued for pending connection).
        """
        if symbol in self._symbol_conn:
            return True  # Already tracked

        # Try connected connections with capacity first
        for conn in self._connections:
            if conn['is_connected'] and len(conn['symbols']) < SYMBOLS_PER_CONNECTION:
                conn['symbols'].add(symbol)
                self._symbol_conn[symbol] = conn['id']
                conn['fyers'].subscribe(
                    symbol_tickers={symbol},
                    channelNo='1',
                    mode=SubscriptionModes.DEPTH
                )
                self.logger.info(
                    f"[Pool-{conn['id']}] +{symbol} "
                    f"({len(conn['symbols'])}/{SYMBOLS_PER_CONNECTION})"
                )
                return True

        # Try pending (connecting) connections with capacity
        for conn in self._connections:
            if not conn['is_connected'] and len(conn['symbols']) < SYMBOLS_PER_CONNECTION:
                conn['symbols'].add(symbol)
                conn['initial_symbols'].append(symbol)
                self._symbol_conn[symbol] = conn['id']
                self.logger.info(
                    f"[Pool-{conn['id']}] Queued {symbol} (pending connection)"
                )
                return True

        # Create new connection
        if len(self._connections) < MAX_FYERS_CONNECTIONS:
            self._create_connection([symbol])
            return True

        self.logger.warning(
            f"[Pool] Cannot subscribe {symbol} - "
            f"all {MAX_FYERS_CONNECTIONS} connections full"
        )
        return False

    def unsubscribe(self, symbol: str):
        """Unsubscribe from a symbol."""
        conn_id = self._symbol_conn.pop(symbol, None)
        if conn_id is None:
            return

        if conn_id >= len(self._connections):
            return

        conn = self._connections[conn_id]
        conn['symbols'].discard(symbol)

        if conn['fyers'] and conn['is_connected']:
            try:
                conn['fyers'].unsubscribe(
                    symbol_tickers={symbol},
                    channelNo='1',
                    mode=SubscriptionModes.DEPTH
                )
            except Exception as e:
                self.logger.error(f"[Pool-{conn_id}] Unsubscribe error for {symbol}: {e}")

        self.logger.info(
            f"[Pool-{conn_id}] -{symbol} "
            f"({len(conn['symbols'])}/{SYMBOLS_PER_CONNECTION})"
        )

    def close_all(self):
        """Close all connections."""
        for conn in self._connections:
            if conn['fyers']:
                try:
                    conn['fyers'].close_connection()
                except Exception:
                    pass
                conn['fyers'] = None
            conn['is_connected'] = False
            conn['symbols'].clear()
        self._connections.clear()
        self._symbol_conn.clear()
        self.logger.info("[Pool] All connections closed")


# =============================================================================
# SUBSCRIPTION MANAGER CLASS
# =============================================================================

class SubscriptionManager:
    """
    Manages dynamic symbol subscriptions with LRU eviction and TTL.

    Constraints:
        - Core symbols (5) are NEVER evicted
        - Dynamic slots (10) use LRU eviction when full
        - 15-minute TTL after last viewer disconnects
        - Viewer counts tracked in Redis for persistence

    Attributes:
        core_symbols: Set of protected symbols that are never unsubscribed
        dynamic_symbols: Set of currently subscribed dynamic symbols
        lru_order: OrderedDict tracking access order (most recent at end)
        ttl_timers: Dict of asyncio Tasks for TTL countdown
        viewer_counts: Local cache of viewer counts (synced with Redis)
    """

    def __init__(
        self,
        redis: aioredis.Redis,
        connection_pool: Optional["FyersConnectionPool"],
        logger: logging.Logger,
        core_symbols: List[str],
    ):
        self.redis = redis
        self.connection_pool = connection_pool
        self.logger = logger

        # Core symbols - protected from eviction
        self.core_symbols: Set[str] = set(core_symbols)

        # Dynamic subscriptions
        self.dynamic_symbols: Set[str] = set()

        # LRU tracking - most recently accessed at end
        self.lru_order: OrderedDict[str, None] = OrderedDict()

        # TTL timers - symbol -> Task that fires unsubscribe after TTL
        self.ttl_timers: Dict[str, asyncio.Task] = {}

        # Local viewer count cache (synced from Redis)
        self.viewer_counts: Dict[str, int] = {}

    @property
    def available_slots(self) -> int:
        """Number of available dynamic subscription slots."""
        return MAX_DYNAMIC_SLOTS - len(self.dynamic_symbols)

    @property
    def all_subscribed(self) -> Set[str]:
        """All currently subscribed symbols (core + dynamic)."""
        return self.core_symbols | self.dynamic_symbols

    async def restore_subscriptions(self) -> None:
        """
        Restore subscriptions from Redis on startup.

        Called after Redis connects to re-subscribe to symbols
        that had active viewers when the service was last running.
        """
        try:
            # Get symbols with active viewers
            viewers = await self.redis.hgetall(DEPTH_VIEWERS_HASH)
            restored_count = 0

            for symbol_bytes, count_bytes in viewers.items():
                # Decode if needed (Redis may return bytes)
                symbol = symbol_bytes.decode() if isinstance(symbol_bytes, bytes) else symbol_bytes
                count = int(count_bytes.decode() if isinstance(count_bytes, bytes) else count_bytes)

                if count > 0 and symbol not in self.core_symbols:
                    if self.available_slots > 0:
                        await self._subscribe_to_fyers(symbol)
                        self.viewer_counts[symbol] = count
                        restored_count += 1
                    else:
                        self.logger.warning(f"No slots to restore {symbol} (viewers={count})")

            self.logger.info(f"Restored {restored_count} dynamic subscriptions from Redis")

        except Exception as e:
            self.logger.error(f"Failed to restore subscriptions: {e}")

    async def viewer_joined(self, symbol: str) -> Tuple[bool, str]:
        """
        Handle a viewer joining a symbol.

        Called when a WebSocket client connects to watch a symbol.

        Args:
            symbol: The symbol to subscribe to

        Returns:
            Tuple of (success, message) where message is one of:
                - "subscribed": New subscription created
                - "already_subscribed": Symbol was already subscribed
                - "unavailable": All slots occupied, cannot subscribe
        """
        # Increment viewer count in Redis
        count = await self.redis.hincrby(DEPTH_VIEWERS_HASH, symbol, 1)
        self.viewer_counts[symbol] = count

        # Cancel any pending TTL timer
        self._cancel_ttl(symbol)

        # Touch LRU order
        self._touch_lru(symbol)

        # Check if already subscribed
        if symbol in self.all_subscribed:
            self.logger.debug(f"Viewer joined {symbol} (count={count}, already subscribed)")
            return (True, "already_subscribed")

        # Try to subscribe
        if self.available_slots > 0:
            await self._subscribe_to_fyers(symbol)
            await self._increment_metric(METRIC_SUBSCRIPTIONS_TOTAL)
            self.logger.info(f"Subscribed to {symbol} (viewers={count}, slots={self.available_slots})")
            return (True, "subscribed")

        # Need to evict - find LRU symbol with 0 viewers
        evict_candidate = self._find_eviction_candidate()
        if evict_candidate:
            await self._unsubscribe_from_fyers(evict_candidate)
            await self._increment_metric(METRIC_EVICTIONS)
            await self._subscribe_to_fyers(symbol)
            await self._increment_metric(METRIC_SUBSCRIPTIONS_TOTAL)
            self.logger.info(
                f"Evicted {evict_candidate}, subscribed to {symbol} "
                f"(viewers={count})"
            )
            return (True, "subscribed")

        # All dynamic slots occupied by active viewers
        await self._increment_metric(METRIC_SUBSCRIPTION_FAILURES)
        self.logger.warning(f"Cannot subscribe to {symbol} - all {MAX_DYNAMIC_SLOTS} slots occupied")
        return (False, "unavailable")

    async def viewer_left(self, symbol: str) -> None:
        """
        Handle a viewer leaving a symbol.

        Called when a WebSocket client disconnects from a symbol.
        Starts TTL countdown if viewer count reaches 0.

        Args:
            symbol: The symbol the viewer was watching
        """
        # Decrement viewer count in Redis (don't go below 0)
        count = await self.redis.hincrby(DEPTH_VIEWERS_HASH, symbol, -1)
        if count < 0:
            await self.redis.hset(DEPTH_VIEWERS_HASH, symbol, 0)
            count = 0
        self.viewer_counts[symbol] = count

        self.logger.debug(f"Viewer left {symbol} (count={count})")

        if count <= 0 and symbol not in self.core_symbols:
            # Start TTL countdown
            self._start_ttl(symbol)

    async def _subscribe_to_fyers(self, symbol: str) -> None:
        """Subscribe to a symbol via Fyers connection pool."""
        self.dynamic_symbols.add(symbol)
        self.lru_order[symbol] = None

        if self.connection_pool:
            try:
                success = self.connection_pool.subscribe(symbol)
                if not success:
                    self.dynamic_symbols.discard(symbol)
                    self.lru_order.pop(symbol, None)
                    raise RuntimeError(f"No available connection slots for {symbol}")
                self.logger.debug(f"Pool subscribe: {symbol}")
            except RuntimeError:
                raise
            except Exception as e:
                self.logger.error(f"Pool subscribe failed for {symbol}: {e}")
                self.dynamic_symbols.discard(symbol)
                raise

        # Track in Redis
        await self.redis.sadd(DEPTH_SUBSCRIBED_SET, symbol)

    async def _unsubscribe_from_fyers(self, symbol: str) -> None:
        """Unsubscribe from a symbol via Fyers connection pool."""
        self.dynamic_symbols.discard(symbol)
        self.lru_order.pop(symbol, None)
        self._cancel_ttl(symbol)

        if self.connection_pool:
            try:
                self.connection_pool.unsubscribe(symbol)
                self.logger.debug(f"Pool unsubscribe: {symbol}")
            except Exception as e:
                self.logger.error(f"Pool unsubscribe failed for {symbol}: {e}")

        # Remove from Redis tracking
        await self.redis.srem(DEPTH_SUBSCRIBED_SET, symbol)

    def _touch_lru(self, symbol: str) -> None:
        """Move symbol to end of LRU order (most recently used)."""
        if symbol in self.lru_order:
            self.lru_order.move_to_end(symbol)
        elif symbol not in self.core_symbols:
            self.lru_order[symbol] = None

    def _find_eviction_candidate(self) -> Optional[str]:
        """
        Find the oldest symbol with 0 viewers to evict.

        Returns:
            Symbol to evict, or None if all dynamic symbols have active viewers
        """
        for symbol in self.lru_order:
            if symbol not in self.core_symbols:
                if self.viewer_counts.get(symbol, 0) == 0:
                    return symbol
        return None

    def _start_ttl(self, symbol: str) -> None:
        """Start TTL countdown for a symbol."""
        self._cancel_ttl(symbol)

        async def ttl_callback():
            try:
                await asyncio.sleep(TTL_SECONDS)
                # Check if still 0 viewers
                if self.viewer_counts.get(symbol, 0) == 0:
                    await self._unsubscribe_from_fyers(symbol)
                    await self._increment_metric(METRIC_TTL_EXPIRATIONS)
                    self.logger.info(f"TTL expired for {symbol}, unsubscribed")
            except asyncio.CancelledError:
                pass  # Timer was cancelled (viewer rejoined)

        self.ttl_timers[symbol] = asyncio.create_task(ttl_callback())
        self.logger.debug(f"Started {TTL_SECONDS}s TTL for {symbol}")

    def _cancel_ttl(self, symbol: str) -> None:
        """Cancel TTL countdown for a symbol."""
        if symbol in self.ttl_timers:
            self.ttl_timers[symbol].cancel()
            del self.ttl_timers[symbol]
            self.logger.debug(f"Cancelled TTL for {symbol}")

    async def _increment_metric(self, metric: str) -> None:
        """Increment a metric counter in Redis."""
        try:
            await self.redis.hincrby(DEPTH_METRICS_HASH, metric, 1)
        except Exception as e:
            self.logger.warning(f"Failed to increment metric {metric}: {e}")

    async def cleanup(self) -> None:
        """Cancel all TTL timers on shutdown."""
        for task in self.ttl_timers.values():
            task.cancel()
        self.ttl_timers.clear()


# =============================================================================
# DEPTH INGESTER CLASS
# =============================================================================

class DepthIngester:
    """
    Manages Fyers TBT WebSocket connection and Redis publishing.

    Implements:
        - Market hours awareness (only connects during NSE trading hours)
        - Exponential backoff reconnection
        - Multi-symbol subscription
        - Redis pub/sub, cache, and stream publishing
    """

    def __init__(self, logger: logging.Logger, symbols: List[str] = None, force_mode: bool = False):
        self.logger = logger
        self.force_mode = force_mode  # Bypass market hours check

        # Symbol management
        # If user provides custom symbols, don't apply rollover logic
        self._use_dynamic_symbols = symbols is None
        self.symbols = symbols or get_core_symbols()
        self._subscribed_symbols: List[str] = []  # Track what we're actually subscribed to

        # Connection state
        self.connection_pool: Optional[FyersConnectionPool] = None
        self.redis: Optional[aioredis.Redis] = None
        self.is_connected = False
        self.is_running = False
        self.reconnect_delay = RECONNECT_INITIAL_DELAY

        # Dynamic subscription manager (initialized after Redis connects)
        self.subscription_manager: Optional[SubscriptionManager] = None
        self._control_channel_task: Optional[asyncio.Task] = None

        # Statistics
        self.messages_received = 0
        self.last_message_time: Optional[datetime] = None

        # Async event loop reference
        self._loop: Optional[asyncio.AbstractEventLoop] = None

        # Aggregation state for 30-second buckets (for scalable history)
        self._agg_buckets: dict[str, int] = {}  # symbol -> current bucket
        self._agg_last_entry: dict[str, bytes] = {}  # symbol -> last packed data

    def _check_symbol_rollover(self) -> bool:
        """
        Check if futures symbols have rolled over to next month.

        Returns:
            True if symbols have changed and reconnection is needed
        """
        if not self._use_dynamic_symbols:
            return False  # User provided custom symbols, no rollover

        if not self._subscribed_symbols:
            return False  # Not subscribed yet, skip check

        new_symbols = get_core_symbols()

        if set(new_symbols) != set(self._subscribed_symbols):
            self.logger.info("=" * 60)
            self.logger.info("FUTURES EXPIRY ROLLOVER DETECTED")
            self.logger.info("=" * 60)
            self.logger.info(f"Old symbols: {self._subscribed_symbols}")
            self.logger.info(f"New symbols: {new_symbols}")
            self.symbols = new_symbols
            return True

        return False

    async def start(self):
        """Start the ingester service."""
        self.is_running = True
        self.logger.info("=" * 60)
        self.logger.info("DEPTH INGESTER SERVICE STARTING")
        self.logger.info("=" * 60)

        # Log dynamic futures symbols being used
        nifty_fut = get_current_futures_symbol("NIFTY")
        banknifty_fut = get_current_futures_symbol("BANKNIFTY")
        self.logger.info(f"NIFTY futures: {nifty_fut}")
        self.logger.info(f"BANKNIFTY futures: {banknifty_fut}")
        self.logger.info(f"Core symbols: {self.symbols}")
        self.logger.info(f"Dynamic slots: {MAX_DYNAMIC_SLOTS}")
        if self.force_mode:
            self.logger.warning("FORCE MODE ENABLED - Running outside market hours")

        # Get event loop
        self._loop = asyncio.get_event_loop()

        # Connect to Redis
        await self._connect_redis()

        # Initialize subscription manager (needs Redis; pool set when Fyers connects)
        self.subscription_manager = SubscriptionManager(
            redis=self.redis,
            connection_pool=None,  # Will be set when pool connects
            logger=self.logger,
            core_symbols=self.symbols,
        )

        # Restore any dynamic subscriptions from Redis
        await self.subscription_manager.restore_subscriptions()

        # Start control channel listener
        self._control_channel_task = asyncio.create_task(
            self._listen_control_channel(),
            name="control_channel_listener"
        )
        self.logger.info(f"Control channel listener started on {DEPTH_CONTROL_CHANNEL}")

        # Main loop
        while self.is_running:
            try:
                # Check market hours (skip if force_mode)
                if self.force_mode or is_market_hours():
                    # Check for futures expiry rollover (reconnect if symbols changed)
                    if self.is_connected and self._check_symbol_rollover():
                        self.logger.info("Reconnecting with new futures contracts...")
                        self._disconnect_fyers()
                        await asyncio.sleep(2)  # Brief pause before reconnect

                    if not self.is_connected:
                        await self._connect_fyers()
                else:
                    if self.is_connected:
                        self.logger.info("Market closed - disconnecting")
                        self._disconnect_fyers()

                    # Calculate time until next market open
                    cache_ttl = get_cache_ttl()
                    sleep_time = min(cache_ttl, MARKET_CHECK_INTERVAL)
                    self.logger.debug(f"Market closed. Sleeping {sleep_time}s")

                # Sleep for check interval
                await asyncio.sleep(MARKET_CHECK_INTERVAL)

            except asyncio.CancelledError:
                self.logger.info("Ingester cancelled")
                break
            except Exception as e:
                self.logger.error(f"Error in main loop: {e}")
                await asyncio.sleep(5)

        # Cleanup
        await self._cleanup()

    async def stop(self):
        """Stop the ingester service."""
        self.logger.info("Stopping ingester...")
        self.is_running = False
        self._disconnect_fyers()

    async def _connect_redis(self):
        """Connect to Redis server."""
        try:
            self.redis = aioredis.from_url(
                REDIS_URL,
                encoding="utf-8",
                decode_responses=False  # We use binary msgpack
            )
            await self.redis.ping()
            self.logger.info(f"Connected to Redis: {REDIS_URL}")
        except Exception as e:
            self.logger.error(f"Failed to connect to Redis: {e}")
            raise

    async def _connect_fyers(self):
        """Connect to Fyers TBT WebSocket via connection pool."""
        # Load access token
        access_token = load_fyers_token()
        if not access_token:
            self.logger.error(
                f"No valid Fyers token found at {FYERS_TOKEN_PATH}. "
                "Please run authentication first."
            )
            await self._schedule_reconnect()
            return

        if not FYERS_APP_ID:
            self.logger.error("FYERS_APP_ID not configured in environment")
            await self._schedule_reconnect()
            return

        # Format: "client_id:access_token"
        full_token = f"{FYERS_APP_ID}:{access_token}"

        self.logger.info("Connecting to Fyers TBT WebSocket (connection pool)...")

        try:
            # Create connection pool and connect with core symbols
            self.connection_pool = FyersConnectionPool(self)
            self.connection_pool.connect(full_token, self.symbols)

        except Exception as e:
            self.logger.error(f"Failed to connect to Fyers: {e}")
            await self._schedule_reconnect()

    def _disconnect_fyers(self):
        """Disconnect from Fyers TBT WebSocket."""
        if self.connection_pool:
            self.connection_pool.close_all()
            self.connection_pool = None
        self.is_connected = False

    async def _schedule_reconnect(self):
        """Schedule reconnection with exponential backoff."""
        self.logger.info(f"Reconnecting in {self.reconnect_delay}s...")
        await asyncio.sleep(self.reconnect_delay)

        # Exponential backoff
        self.reconnect_delay = min(
            self.reconnect_delay * RECONNECT_MULTIPLIER,
            RECONNECT_MAX_DELAY
        )

    async def _cleanup(self):
        """Cleanup resources on shutdown."""
        # Cancel control channel listener
        if self._control_channel_task:
            self._control_channel_task.cancel()
            try:
                await self._control_channel_task
            except asyncio.CancelledError:
                pass
            self._control_channel_task = None

        # Cleanup subscription manager (cancel TTL timers)
        if self.subscription_manager:
            await self.subscription_manager.cleanup()

        # Disconnect from Fyers
        self._disconnect_fyers()

        # Close Redis
        if self.redis:
            await self.redis.close()
            self.logger.info("Redis connection closed")

    # =========================================================================
    # FYERS CONNECTION POOL CALLBACKS
    # =========================================================================

    def _on_pool_connection_ready(self, conn_id: int):
        """Called by FyersConnectionPool when a connection becomes ready."""
        self.logger.info(f"Pool connection {conn_id} ready")

        if not self.is_connected:
            # First connection ready — update ingester state
            self.is_connected = True
            self.reconnect_delay = RECONNECT_INITIAL_DELAY
            self._subscribed_symbols = list(self.symbols)

            # Give pool reference to subscription manager
            if self.subscription_manager:
                self.subscription_manager.connection_pool = self.connection_pool

            # Subscribe restored dynamic symbols to pool
            if self.subscription_manager and self.subscription_manager.dynamic_symbols:
                pool_symbols = self.connection_pool.all_symbols if self.connection_pool else set()
                restored = []
                for sym in list(self.subscription_manager.dynamic_symbols):
                    if sym not in pool_symbols and self.connection_pool:
                        if self.connection_pool.subscribe(sym):
                            restored.append(sym)
                if restored:
                    self.logger.info(f"Restored dynamic subscriptions: {restored}")

    def _on_depth_update(self, ticker: str, message):
        """
        Handle 50-level depth data update from Fyers.

        Args:
            ticker: Symbol string (e.g., 'NSE:RELIANCE-EQ')
            message: Fyers depth message object
        """
        self.messages_received += 1
        self.last_message_time = datetime.now(IST)

        # Transform to internal format
        depth_data = transform_fyers_depth(message)
        depth_data['s'] = ticker  # Ensure symbol is set

        # Schedule async publish
        if self._loop and self.redis:
            asyncio.run_coroutine_threadsafe(
                self._publish_depth(ticker, depth_data),
                self._loop
            )

        # Debug logging
        if self.messages_received % 100 == 0:
            self.logger.debug(
                f"Received {self.messages_received} messages. "
                f"Last: {ticker} TBQ={depth_data['tbq']} TSQ={depth_data['tsq']}"
            )

    async def _publish_depth(self, symbol: str, depth_data: dict):
        """
        Publish depth data to Redis.

        Publishes to:
            1. Pub/Sub channel for real-time streaming
            2. Cache key for latest snapshot
            3. Stream for history replay
        """
        try:
            # Pack data as msgpack
            packed = pack_depth_data(
                symbol=depth_data['s'],
                timestamp_ns=depth_data['t'],
                tick_ts=depth_data['tick_ts'],
                snapshot=depth_data['snap'],
                bid_prices=depth_data['b'],
                ask_prices=depth_data['a'],
                bid_qty=depth_data['bq'],
                ask_qty=depth_data['aq'],
                total_buy_qty=depth_data['tbq'],
                total_sell_qty=depth_data['tsq'],
                bid_orders=depth_data.get('bo'),
                ask_orders=depth_data.get('ao'),
            )

            # Get trading date for stream key
            trading_date = get_trading_date()

            # Redis keys
            pubsub_channel = f"{DEPTH_REDIS_CHANNEL_PREFIX}:{symbol}"
            cache_key = f"cache:{DEPTH_REDIS_CHANNEL_PREFIX}:{symbol}"
            stream_key = f"{DEPTH_REDIS_CHANNEL_PREFIX}:history:{symbol}:{trading_date}"

            # Calculate TTL (until next trading day)
            cache_ttl = get_cache_ttl()

            # Execute all Redis operations in pipeline
            async with self.redis.pipeline(transaction=True) as pipe:
                # 1. Pub/Sub - Real-time streaming
                pipe.publish(pubsub_channel, packed)

                # 2. Cache - Latest snapshot with TTL
                pipe.set(cache_key, packed, ex=cache_ttl)

                # 3. Stream - History for replay (with MAXLEN trim)
                pipe.xadd(
                    stream_key,
                    {"data": packed},
                    maxlen=DEPTH_STREAM_MAXLEN,
                    approximate=True
                )

                # Set stream TTL if it's a new stream
                pipe.expire(stream_key, DEPTH_HISTORY_TTL_SECONDS)

                # 4. Aggregated Stream - 30-second buckets for scalable history
                AGG_BUCKET_NS = 30 * 1_000_000_000  # 30 seconds in nanoseconds
                agg_stream_key = f"{DEPTH_REDIS_CHANNEL_PREFIX}:history:agg:{symbol}:{trading_date}"

                current_bucket = depth_data['t'] // AGG_BUCKET_NS
                prev_bucket = self._agg_buckets.get(symbol)

                if prev_bucket is not None and current_bucket != prev_bucket:
                    # Bucket changed - write the last entry from previous bucket
                    last_packed = self._agg_last_entry.get(symbol)
                    if last_packed:
                        pipe.xadd(
                            agg_stream_key,
                            {"data": last_packed},
                            maxlen=2000,  # ~750 for full day + buffer
                            approximate=True
                        )
                        pipe.expire(agg_stream_key, DEPTH_HISTORY_TTL_SECONDS)

                # Update tracking (outside pipeline, after execute)
                await pipe.execute()

            # Update aggregation tracking after successful publish
            self._agg_buckets[symbol] = current_bucket
            self._agg_last_entry[symbol] = packed

        except Exception as e:
            self.logger.error(f"Failed to publish depth for {symbol}: {e}")

    # =========================================================================
    # CONTROL CHANNEL LISTENER
    # =========================================================================

    async def _listen_control_channel(self) -> None:
        """
        Listen for subscription commands from WebSocket servers.

        Commands received on depth:control channel:
            - viewer_join: Client connected to watch symbol → subscribe if needed
            - viewer_leave: Client disconnected from symbol → start TTL if count=0

        Responses sent to depth:response:{request_id} channel.
        """
        # Create dedicated Redis connection for pubsub
        pubsub_redis = aioredis.from_url(
            REDIS_URL,
            encoding="utf-8",
            decode_responses=True  # JSON strings, not binary
        )
        pubsub = pubsub_redis.pubsub()

        try:
            await pubsub.subscribe(DEPTH_CONTROL_CHANNEL)
            self.logger.info(f"Subscribed to control channel: {DEPTH_CONTROL_CHANNEL}")

            async for message in pubsub.listen():
                if not self.is_running:
                    break

                if message["type"] != "message":
                    continue

                try:
                    # Parse command
                    cmd = SubscriptionCommand.from_json(message["data"])
                    self.logger.debug(f"Control command: {cmd.action} {cmd.symbol}")

                    # Validate symbol format
                    if not validate_symbol(cmd.symbol):
                        await self._send_response(
                            cmd.request_id, cmd.symbol, False, "invalid_symbol"
                        )
                        self.logger.warning(f"Invalid symbol format: {cmd.symbol}")
                        continue

                    # Handle commands
                    if cmd.action == "viewer_join":
                        if self.subscription_manager:
                            success, msg = await self.subscription_manager.viewer_joined(cmd.symbol)
                            await self._send_response(cmd.request_id, cmd.symbol, success, msg)
                        else:
                            await self._send_response(
                                cmd.request_id, cmd.symbol, False, "service_not_ready"
                            )

                    elif cmd.action == "viewer_leave":
                        if self.subscription_manager:
                            await self.subscription_manager.viewer_left(cmd.symbol)
                        # No response needed for viewer_leave

                except json.JSONDecodeError as e:
                    self.logger.error(f"Invalid JSON in control message: {e}")
                except Exception as e:
                    self.logger.error(f"Error processing control command: {e}")

        except asyncio.CancelledError:
            self.logger.info("Control channel listener cancelled")
        except Exception as e:
            self.logger.error(f"Control channel listener error: {e}")
        finally:
            await pubsub.unsubscribe(DEPTH_CONTROL_CHANNEL)
            await pubsub.close()
            await pubsub_redis.close()

    async def _send_response(
        self,
        request_id: str,
        symbol: str,
        success: bool,
        message: str
    ) -> None:
        """
        Send subscription response to the requesting WebSocket server.

        Args:
            request_id: Unique ID from the original command
            symbol: The symbol that was requested
            success: Whether the subscription succeeded
            message: Status message (subscribed, already_subscribed, unavailable, etc.)
        """
        try:
            response = SubscriptionResponse(
                request_id=request_id,
                symbol=symbol,
                success=success,
                message=message,
            )
            channel = f"{DEPTH_RESPONSE_PREFIX}{request_id}"
            await self.redis.publish(channel, response.to_json())
            self.logger.debug(f"Sent response to {channel}: success={success}, msg={message}")
        except Exception as e:
            self.logger.error(f"Failed to send response for {symbol}: {e}")


# =============================================================================
# SIGNAL HANDLERS
# =============================================================================

def setup_signal_handlers(ingester: DepthIngester, loop: asyncio.AbstractEventLoop):
    """Setup graceful shutdown signal handlers."""

    def signal_handler(sig, frame):
        logger = logging.getLogger("depth_ingester")
        logger.info(f"Received signal {sig}, shutting down...")
        asyncio.run_coroutine_threadsafe(ingester.stop(), loop)

    # Handle SIGINT (Ctrl+C) and SIGTERM
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

def main():
    """Main entry point for the depth ingester service."""
    parser = argparse.ArgumentParser(
        description="Fyers TBT Depth Ingester Service"
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging (foreground mode)"
    )
    parser.add_argument(
        "--daemon",
        action="store_true",
        help="Run as daemon (background mode)"
    )
    parser.add_argument(
        "--logfile",
        type=str,
        default=None,
        help="Path to log file"
    )
    parser.add_argument(
        "--symbols",
        type=str,
        default=None,
        help="Comma-separated list of symbols to subscribe"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force run outside market hours (for testing)"
    )

    args = parser.parse_args()

    # Setup logging
    logger = setup_logging(debug=args.debug, logfile=args.logfile)

    # Parse symbols if provided
    symbols = None
    if args.symbols:
        symbols = [s.strip() for s in args.symbols.split(",")]

    # Daemonize if requested (Linux only)
    if args.daemon and sys.platform != "win32":
        try:
            import daemon

            # Collect file handlers to preserve (so logs continue working)
            files_to_preserve = []
            for handler in logger.handlers:
                if hasattr(handler, 'stream') and handler.stream:
                    files_to_preserve.append(handler.stream)

            with daemon.DaemonContext(files_preserve=files_to_preserve):
                run_ingester(logger, symbols, args.force)
        except ImportError:
            logger.warning("python-daemon not installed, running in foreground")
            run_ingester(logger, symbols, args.force)
    else:
        run_ingester(logger, symbols, args.force)


def run_ingester(logger: logging.Logger, symbols: Optional[List[str]] = None, force_mode: bool = False):
    """Run the ingester in the current process."""
    # Create ingester
    ingester = DepthIngester(logger, symbols, force_mode=force_mode)

    # Create event loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    # Setup signal handlers
    setup_signal_handlers(ingester, loop)

    try:
        # Run the ingester
        loop.run_until_complete(ingester.start())
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received")
    finally:
        loop.run_until_complete(ingester.stop())
        loop.close()
        logger.info("Ingester shutdown complete")


if __name__ == "__main__":
    main()
