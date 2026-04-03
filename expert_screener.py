from __future__ import annotations

import ast
from datetime import datetime, timedelta
import gc
import logging
import re
import time
from typing import Any, Dict, List, Optional, Set, Tuple, Callable
import warnings
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

import numpy as np
import pandas as pd
import psycopg2

# Configure logger for this module (flushes immediately, unlike print)
logger = logging.getLogger(__name__)

# Add server directory to path for database accessors
sys.path.append(os.path.join(os.path.dirname(__file__), 'server'))
from db_timeframe_accessor import TimeframeDataAccessor

# Import connection pool functions from main.py
# Note: main.py imports expert_screener, so we import at runtime to avoid circular dependency
_get_db_connection = None
_release_db_connection = None
_db_config = None

def _init_db_functions():
    """Lazy load DB connection functions to avoid circular import."""
    global _get_db_connection, _release_db_connection, _db_config
    if _get_db_connection is None:
        import main
        _get_db_connection = main.get_db_connection
        _release_db_connection = main.release_db_connection
        _db_config = main.DB_CONFIG

def get_optimal_worker_count() -> int:
    """
    Calculate optimal number of worker threads based on connection pool size.

    Formula: min(6, maxconn // 8)
    - Reduced from 12 to 6 workers to prevent lock contention during concurrent jobs
    - Reserves more pool capacity for other operations (API calls, etc.)
    """
    _init_db_functions()
    if _db_config and "maxconn" in _db_config:
        # Use ~12% of pool per job to allow 8 concurrent jobs safely
        optimal = max(3, _db_config["maxconn"] // 8)  # Minimum 3 workers
        return min(6, optimal)  # Cap at 6 to prevent thread contention
    return 6  # Fallback - reduced from 12

warnings.filterwarnings("ignore")

# ======================
# Global Symbol Mapping Cache (Pre-loaded at startup)
# ======================
# Thread-safe: dict is replaced atomically, reads don't need locks
_symbol_to_ticker_id: Dict[str, int] = {}  # symbol (uppercase) -> ticker_id
_ticker_id_to_symbol: Dict[int, str] = {}  # ticker_id -> symbol
_symbol_cache_loaded_at: Optional[datetime] = None
_symbol_cache_lock = threading.Lock()
_SYMBOL_CACHE_TTL_SECONDS = 3600  # 1 hour TTL

def _load_symbol_cache() -> bool:
    """
    Pre-load ALL symbol->ticker_id mappings from database.
    Called once at startup or when cache expires.
    Returns True if successful.
    """
    global _symbol_to_ticker_id, _ticker_id_to_symbol, _symbol_cache_loaded_at

    conn = None
    try:
        logger.info("[SymbolCache] Initializing DB functions...")
        _init_db_functions()
        logger.info("[SymbolCache] Getting DB connection from pool...")
        conn = _get_db_connection()
        logger.info("[SymbolCache] Got connection, executing query...")

        with conn.cursor() as cur:
            cur.execute("SELECT symbol, id FROM tickers WHERE is_active = true")
            rows = cur.fetchall()

        logger.info(f"[SymbolCache] Query returned {len(rows)} rows, building cache...")

        # Build new dicts (atomic replacement, no lock needed for reads)
        new_symbol_map = {}
        new_id_map = {}
        for symbol, ticker_id in rows:
            upper_symbol = symbol.upper()
            new_symbol_map[upper_symbol] = ticker_id
            new_id_map[ticker_id] = upper_symbol

        # Atomic replacement - NOTE: lock is already held by _ensure_symbol_cache() caller
        # Do NOT acquire lock here to avoid deadlock
        _symbol_to_ticker_id = new_symbol_map
        _ticker_id_to_symbol = new_id_map
        _symbol_cache_loaded_at = datetime.now()

        logger.info(f"[SymbolCache] Loaded {len(new_symbol_map)} symbol mappings")
        return True

    except Exception as e:
        logger.error(f"[SymbolCache] Error loading symbol cache: {e}")
        return False
    finally:
        if conn:
            _release_db_connection(conn)

def _ensure_symbol_cache() -> bool:
    """Ensure symbol cache is loaded and not expired."""
    global _symbol_cache_loaded_at

    # Quick check without lock
    if _symbol_cache_loaded_at:
        age = (datetime.now() - _symbol_cache_loaded_at).total_seconds()
        if age < _SYMBOL_CACHE_TTL_SECONDS:
            logger.debug("[SymbolCache] Cache valid (quick check)")
            return True

    # Need to load/refresh
    logger.info("[SymbolCache] Cache needs loading, acquiring lock...")
    with _symbol_cache_lock:
        # Double-check after acquiring lock
        if _symbol_cache_loaded_at:
            age = (datetime.now() - _symbol_cache_loaded_at).total_seconds()
            if age < _SYMBOL_CACHE_TTL_SECONDS:
                logger.info("[SymbolCache] Cache was loaded by another thread")
                return True

        logger.info("[SymbolCache] Loading symbol cache...")
        return _load_symbol_cache()

def get_ticker_id_from_cache(symbol: str) -> Optional[int]:
    """Get ticker_id from pre-loaded cache (lock-free read)."""
    _ensure_symbol_cache()
    # Remove .NS suffix and uppercase
    clean_symbol = symbol.replace('.NS', '').upper()
    return _symbol_to_ticker_id.get(clean_symbol)

def get_all_ticker_ids_from_cache(symbols: List[str]) -> Dict[str, int]:
    """Batch lookup: Get ticker_ids for multiple symbols (lock-free)."""
    _ensure_symbol_cache()
    result = {}
    for symbol in symbols:
        clean_symbol = symbol.replace('.NS', '').upper()
        ticker_id = _symbol_to_ticker_id.get(clean_symbol)
        if ticker_id:
            result[symbol] = ticker_id
    return result

def get_cache_stats() -> Dict[str, Any]:
    """Get cache statistics for monitoring."""
    age = None
    if _symbol_cache_loaded_at:
        age = (datetime.now() - _symbol_cache_loaded_at).total_seconds()

    return {
        "total_symbols": len(_symbol_to_ticker_id),
        "loaded_at": _symbol_cache_loaded_at.isoformat() if _symbol_cache_loaded_at else None,
        "age_seconds": age,
        "ttl_seconds": _SYMBOL_CACHE_TTL_SECONDS,
        "is_valid": age is not None and age < _SYMBOL_CACHE_TTL_SECONDS
    }


# ======================
# Indicator Value Cache (Redis-backed)
# ======================
# Caches indicator value arrays (last 50 values) for cache-first screener optimization
# Format: ind:RELIANCE:sma_50 -> {"values": [latest, -1bar, -2bar, ...], "as_of": "..."}
# TTL: 15 minutes - balances freshness with computation savings
# Standard indicators are pre-warmed on startup; custom periods cached on-demand

# Cache depth: number of historical values to store (supports shifts 0 to DEPTH-1)
INDICATOR_CACHE_DEPTH = 50

try:
    from server.redis_client import (
        get_cached, set_cached, get_cached_bulk,
        make_single_indicator_key, TTL_SCREENER_INDICATORS
    )
    _INDICATOR_CACHE_AVAILABLE = True
except ImportError:
    _INDICATOR_CACHE_AVAILABLE = False
    logger.warning("[IndicatorCache] Redis client not available, caching disabled")


def get_cached_indicator_values(ticker: str, indicator: str) -> Optional[List[float]]:
    """
    Get cached indicator values array from Redis.

    Args:
        ticker: Stock symbol (e.g., 'RELIANCE')
        indicator: Indicator name (e.g., 'sma_50', 'rsi_14')

    Returns:
        List of values (most recent first) or None if not found
    """
    values, _ = get_cached_indicator_values_with_ts(ticker, indicator)
    return values


def get_cached_indicator_values_with_ts(ticker: str, indicator: str) -> Tuple[Optional[List[float]], Optional[str]]:
    """
    Get cached indicator values array and data timestamp from Redis.

    Args:
        ticker: Stock symbol (e.g., 'RELIANCE')
        indicator: Indicator name (e.g., 'sma_50', 'rsi_14')

    Returns:
        Tuple of (values list, data_ts) - both None if not found
    """
    if not _INDICATOR_CACHE_AVAILABLE:
        return None, None

    key = make_single_indicator_key(ticker, indicator)
    cached = get_cached(key)
    if cached and isinstance(cached, dict):
        # Support both old format {"value": float} and new format {"values": [float, ...]}
        data_ts = cached.get("data_ts")  # May be None for old cache entries
        if "values" in cached:
            return cached["values"], data_ts
        elif "value" in cached:
            # Backward compat: wrap single value in list
            return [cached["value"]], data_ts
    return None, None


def get_cached_indicator_value(ticker: str, indicator: str) -> Optional[float]:
    """
    Get the latest cached indicator value from Redis.
    Convenience wrapper around get_cached_indicator_values().

    Returns:
        Latest value or None if not found
    """
    values = get_cached_indicator_values(ticker, indicator)
    return values[0] if values else None


def cache_indicator_values(ticker: str, indicator: str, values: List[float], data_ts: Optional[str] = None) -> bool:
    """
    Cache indicator values array in Redis.

    Args:
        ticker: Stock symbol (e.g., 'RELIANCE')
        indicator: Indicator name (e.g., 'sma_50', 'rsi_14')
        values: List of values (most recent first), will be trimmed to INDICATOR_CACHE_DEPTH
        data_ts: Latest OHLC data timestamp (ISO format) for cache validation

    Returns:
        True if cached successfully, False otherwise
    """
    if not _INDICATOR_CACHE_AVAILABLE:
        return False

    if not values:
        return False

    # Filter out NaN values and limit to cache depth
    clean_values = []
    for v in values[:INDICATOR_CACHE_DEPTH]:
        if v is not None and not (isinstance(v, float) and np.isnan(v)):
            clean_values.append(float(v))
        else:
            break  # Stop at first NaN to maintain index integrity for shifts

    if not clean_values:
        return False

    key = make_single_indicator_key(ticker, indicator)
    data = {
        "values": clean_values,
        "as_of": datetime.utcnow().isoformat() + "Z",
        "data_ts": data_ts  # OHLC data timestamp for validation
    }
    return set_cached(key, data, TTL_SCREENER_INDICATORS)


def cache_indicator_value(ticker: str, indicator: str, value: float) -> bool:
    """
    Cache a single indicator value in Redis.
    Convenience wrapper - stores as single-element array for consistency.

    Returns:
        True if cached successfully, False otherwise
    """
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return False
    return cache_indicator_values(ticker, indicator, [float(value)])


def get_cached_indicators_for_symbols(
    symbols: List[str],
    indicator_names: Set[str]
) -> Dict[str, Dict[str, List[float]]]:
    """
    Batch fetch cached indicator arrays for multiple symbols.
    Optimized for cache-first screener path using Redis MGET.

    Args:
        symbols: List of stock symbols
        indicator_names: Set of indicator names to fetch

    Returns:
        Dict: {symbol -> {indicator -> [values array]}}
        Only includes symbols/indicators that have cached data
    """
    if not _INDICATOR_CACHE_AVAILABLE or not symbols or not indicator_names:
        return {}

    # Build all cache keys
    all_keys = []
    key_map = {}  # key -> (symbol, indicator)
    for symbol in symbols:
        for ind in indicator_names:
            key = make_single_indicator_key(symbol, ind)
            all_keys.append(key)
            key_map[key] = (symbol, ind)

    # Bulk fetch from Redis
    cached_data = get_cached_bulk(all_keys)

    # Reconstruct as nested dict
    result: Dict[str, Dict[str, List[float]]] = {}
    for key, data in cached_data.items():
        if key not in key_map:
            continue
        symbol, ind = key_map[key]

        if isinstance(data, dict):
            values = None
            if "values" in data:
                values = data["values"]
            elif "value" in data:
                values = [data["value"]]

            if values:
                if symbol not in result:
                    result[symbol] = {}
                result[symbol][ind] = values

    return result


def get_cached_indicators_bulk(ticker: str, indicator_names: List[str]) -> Dict[str, float]:
    """
    Get multiple cached indicator values (latest only) for a ticker.
    Legacy function for backward compatibility.

    Returns:
        Dict mapping indicator name to latest value
    """
    if not _INDICATOR_CACHE_AVAILABLE or not indicator_names:
        return {}

    # Build cache keys
    keys = [make_single_indicator_key(ticker, ind) for ind in indicator_names]

    # Bulk fetch from Redis
    cached_data = get_cached_bulk(keys)

    # Map back to indicator names (extract latest value)
    result = {}
    for ind, key in zip(indicator_names, keys):
        if key in cached_data:
            data = cached_data[key]
            if isinstance(data, dict):
                if "values" in data and data["values"]:
                    result[ind] = data["values"][0]
                elif "value" in data:
                    result[ind] = data["value"]

    return result


def cache_indicators_bulk(ticker: str, indicators: Dict[str, List[float]], data_ts: Optional[str] = None) -> int:
    """
    Cache multiple indicator value arrays for a ticker.

    Args:
        ticker: Stock symbol
        indicators: Dict mapping indicator name to values array
        data_ts: Latest OHLC data timestamp (ISO format) for cache validation

    Returns:
        Number of indicators successfully cached
    """
    if not _INDICATOR_CACHE_AVAILABLE:
        return 0

    cached_count = 0
    for ind_name, values in indicators.items():
        if cache_indicator_values(ticker, ind_name, values, data_ts):
            cached_count += 1

    return cached_count


class ConditionEvaluator:
    """Safely compile and evaluate boolean expressions."""

    _ALLOWED_NODE_TYPES = (
        ast.Expression,
        ast.BoolOp,
        ast.BinOp,
        ast.UnaryOp,
        ast.Compare,
        ast.Name,
        ast.Load,
        ast.Constant,
        ast.operator,
        ast.unaryop,
        ast.boolop,
        ast.cmpop,
    )

    _DISALLOWED_NODE_TYPES = (
        ast.Call,
        ast.Attribute,
        ast.Subscript,
        ast.Dict,
        ast.List,
        ast.Set,
        ast.ListComp,
        ast.DictComp,
        ast.GeneratorExp,
        ast.Lambda,
        ast.IfExp,
        ast.Await,
        ast.Yield,
    )

    def __init__(self, expression: str) -> None:
        if not expression or not expression.strip():
            raise ValueError("Condition expression is required")

        self.expression = expression.strip()
        tree = ast.parse(self.expression, mode="eval")
        self._validate(tree)
        self._code = compile(tree, "<condition_expr>", "eval")

    def _validate(self, tree: ast.AST) -> None:
        for node in ast.walk(tree):
            if isinstance(node, self._DISALLOWED_NODE_TYPES):
                raise ValueError("Unsupported syntax in condition expression")
            if not isinstance(node, self._ALLOWED_NODE_TYPES):
                raise ValueError("Unsupported syntax in condition expression")
            if isinstance(node, ast.Name) and node.id.startswith("__"):
                raise ValueError("Invalid variable name in expression")

    def evaluate(self, context: Dict[str, Any]) -> bool:
        try:
            return bool(eval(self._code, {"__builtins__": {}}, context))
        except Exception as exc:  # pragma: no cover - guardrail
            raise ValueError(f"Failed to evaluate condition: {exc}") from exc


class StockScreener:
    """Optimized stock screener for NSE stocks."""

    def __init__(self, symbols: List[str], period: str = "1y") -> None:
        self.symbols = symbols
        self.period = period
        self.data: Dict[str, pd.DataFrame] = {}
        self.indicators: Dict[str, Dict[str, pd.Series]] = {}
        self.atr_periods: Set[int] = set()
        self.ema_periods: Set[int] = set()
        self.sma_periods: Set[int] = set()
        self.rsi_periods: Set[int] = set()
        self.bb_specs: Set[Tuple[int, float]] = set()
        self.supertrend_specs: Set[Tuple[int, float]] = set()
        self.max_high_specs: Set[Tuple[int, str]] = set()
        self.max_low_specs: Set[Tuple[int, str]] = set()
        # Fundamentals data for 52-week high/low (fetched from stock_fundamentals table)
        self.fundamentals_52w_high: Dict[str, Optional[float]] = {}
        self.fundamentals_52w_low: Dict[str, Optional[float]] = {}

    @staticmethod
    def _to_float(value: Any, default: float = 0.0) -> float:
        if pd.isna(value):
            return default
        return float(value)

    def load_prefetched_data(
        self,
        ohlc_data: Dict[int, List[Dict]],
        ticker_map: Dict[str, int],
        fundamentals_52w: Optional[Dict[int, Dict]] = None
    ) -> Dict[str, pd.DataFrame]:
        """
        Load pre-fetched OHLC data instead of querying database.
        This allows fetching ALL data once and distributing to parallel workers.

        Args:
            ohlc_data: Dict mapping ticker_id to list of OHLC dicts
            ticker_map: Dict mapping symbol to ticker_id
            fundamentals_52w: Optional dict mapping ticker_id to {high_52w, low_52w}

        Returns:
            Dict mapping symbol to DataFrame
        """
        self.data.clear()
        reverse_map = {v: k for k, v in ticker_map.items()}  # ticker_id -> symbol

        for ticker_id, ohlc_rows in ohlc_data.items():
            symbol = reverse_map.get(ticker_id)
            if not symbol or not ohlc_rows:
                continue

            # Only process if this symbol is in our target list
            if symbol not in self.symbols:
                continue

            # Convert to DataFrame
            df = pd.DataFrame(ohlc_rows)
            df = df.rename(columns={
                'timestamp': 'Date',
                'open': 'Open',
                'high': 'High',
                'low': 'Low',
                'close': 'Close',
                'volume': 'Volume'
            })

            # Set Date as index
            if 'Date' in df.columns:
                df['Date'] = pd.to_datetime(df['Date'])
                df = df.set_index('Date')

            df = df.dropna(how='all')

            if not df.empty:
                self.data[symbol] = df

        # Load 52-week fundamentals if provided
        if fundamentals_52w:
            for ticker_id, data in fundamentals_52w.items():
                symbol = reverse_map.get(ticker_id)
                if symbol and symbol in self.symbols:
                    self.fundamentals_52w_high[symbol] = data.get('high_52w')
                    self.fundamentals_52w_low[symbol] = data.get('low_52w')

        return self.data

    def download_data(self) -> Dict[str, pd.DataFrame]:
        """
        Fetch OHLCV data from database (replaces yfinance download).

        Returns data in same format as yfinance for compatibility:
        Dict[symbol, DataFrame] with columns: Open, High, Low, Close, Volume
        """
        if not self.symbols:
            return {}

        conn = None
        try:
            # Get connection from shared pool
            _init_db_functions()
            conn = _get_db_connection()

            # Step 1: Resolve symbols to ticker_ids
            ticker_map = self._resolve_symbols(conn, self.symbols)

            if not ticker_map:
                return {}

            # Step 2: Fetch OHLC data using TimeframeDataAccessor
            # Use LIMIT instead of date range for 15x faster queries
            # 300 bars is enough for 200-period SMA with buffer
            accessor = TimeframeDataAccessor(conn)
            ticker_ids = list(ticker_map.values())

            ohlc_data = accessor.fetch_ohlc_bulk(
                ticker_ids=ticker_ids,
                timeframe='1hour',
                limit=300  # Only fetch last 300 bars per ticker (vs 8,760 for 1 year)
            )

            # Step 4: Convert to yfinance-compatible format
            self.data.clear()
            reverse_map = {v: k for k, v in ticker_map.items()}  # ticker_id -> symbol

            for ticker_id, ohlc_rows in ohlc_data.items():
                symbol = reverse_map.get(ticker_id)
                if not symbol or not ohlc_rows:
                    continue

                # Convert to DataFrame with capitalized column names (yfinance format)
                df = pd.DataFrame(ohlc_rows)
                df = df.rename(columns={
                    'timestamp': 'Date',
                    'open': 'Open',
                    'high': 'High',
                    'low': 'Low',
                    'close': 'Close',
                    'volume': 'Volume'
                })

                # Set Date as index and ensure it's DatetimeIndex
                if 'Date' in df.columns:
                    df['Date'] = pd.to_datetime(df['Date'])
                    df = df.set_index('Date')

                # Drop rows with all NaN values
                df = df.dropna(how='all')

                if not df.empty:
                    self.data[symbol] = df

            # Fetch 52-week high/low from stock_fundamentals if needed
            if self.max_high_specs or self.max_low_specs:
                self._fetch_52w_fundamentals(conn, ticker_ids, reverse_map)

            return self.data

        except Exception as e:
            logger.error(f"Error fetching data from database: {e}")
            return {}
        finally:
            if conn:
                _release_db_connection(conn)

    def _fetch_52w_fundamentals(
        self, conn, ticker_ids: List[int], reverse_map: Dict[int, str]
    ) -> None:
        """
        Fetch 52-week high/low from stock_fundamentals table.

        Args:
            conn: Database connection
            ticker_ids: List of ticker IDs
            reverse_map: Dict mapping ticker_id to symbol
        """
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT ticker_id, fifty_two_week_high, fifty_two_week_low
                    FROM stock_fundamentals
                    WHERE ticker_id = ANY(%s)
                """, (ticker_ids,))

                for row in cur.fetchall():
                    ticker_id, high_52w, low_52w = row
                    symbol = reverse_map.get(ticker_id)
                    if symbol:
                        self.fundamentals_52w_high[symbol] = float(high_52w) if high_52w else None
                        self.fundamentals_52w_low[symbol] = float(low_52w) if low_52w else None
        except Exception as e:
            logger.error(f"Error fetching 52-week fundamentals: {e}")

    def _resolve_symbols(self, conn, symbols: List[str]) -> Dict[str, int]:
        """
        Convert symbols to ticker_ids using pre-loaded cache (NO database query).

        Args:
            conn: Database connection (unused, kept for API compatibility)
            symbols: List of stock symbols (e.g., ['RELIANCE', 'TCS'])

        Returns:
            Dict mapping symbol to ticker_id
        """
        # Use pre-loaded cache instead of DB query (eliminates 60 queries per screener run)
        return get_all_ticker_ids_from_cache(symbols)

    def calculate_atr(self, df: pd.DataFrame, period: int = 14) -> pd.Series:
        high = df["High"]
        low = df["Low"]
        close = df["Close"]

        tr1 = high - low
        tr2 = (high - close.shift()).abs()
        tr3 = (low - close.shift()).abs()

        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        atr = tr.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
        return atr

    def calculate_ema(self, series: pd.Series, period: int) -> pd.Series:
        return series.ewm(span=period, adjust=False).mean()

    def calculate_sma(self, series: pd.Series, period: int) -> pd.Series:
        return series.rolling(window=period).mean()

    def calculate_rsi(self, df: pd.DataFrame, period: int = 14) -> pd.Series:
        delta = df["Close"].diff()
        gain = delta.where(delta > 0, 0)
        loss = -delta.where(delta < 0, 0)
        avg_gain = gain.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
        avg_loss = loss.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        return rsi

    def calculate_bollinger(
        self, df: pd.DataFrame, period: int = 20, std: float = 2.0
    ) -> Tuple[pd.Series, pd.Series, pd.Series]:
        middle = df["Close"].rolling(window=period).mean()
        std_dev = df["Close"].rolling(window=period).std()
        upper = middle + (std_dev * std)
        lower = middle - (std_dev * std)
        return upper, middle, lower

    def calculate_supertrend(
        self, df: pd.DataFrame, period: int = 10, multiplier: float = 3.0
    ) -> pd.Series:
        high = df["High"]
        low = df["Low"]
        close = df["Close"]

        tr1 = high - low
        tr2 = (high - close.shift()).abs()
        tr3 = (low - close.shift()).abs()
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        atr = tr.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()

        basic_upperband = (high + low) / 2 + multiplier * atr
        basic_lowerband = (high + low) / 2 - multiplier * atr

        final_upperband = basic_upperband.copy()
        final_lowerband = basic_lowerband.copy()
        final_upperband.iloc[0] = basic_upperband.iloc[0]
        final_lowerband.iloc[0] = basic_lowerband.iloc[0]

        supertrend = pd.Series(np.nan, index=df.index)
        trend = [True]

        for i in range(1, len(df)):
            current_upperband = basic_upperband.iloc[i]
            prev_upperband = final_upperband.iloc[i - 1]
            current_lowerband = basic_lowerband.iloc[i]
            prev_lowerband = final_lowerband.iloc[i - 1]

            if (
                current_upperband < prev_upperband
                or close.iloc[i - 1] > prev_upperband
            ):
                final_upperband.iloc[i] = current_upperband
            else:
                final_upperband.iloc[i] = prev_upperband

            if (
                current_lowerband > prev_lowerband
                or close.iloc[i - 1] < prev_lowerband
            ):
                final_lowerband.iloc[i] = current_lowerband
            else:
                final_lowerband.iloc[i] = prev_lowerband

            if trend[i - 1]:
                if close.iloc[i] <= final_upperband.iloc[i]:
                    trend.append(True)
                else:
                    trend.append(False)
                    supertrend.iloc[i] = final_upperband.iloc[i]
            else:
                if close.iloc[i] >= final_lowerband.iloc[i]:
                    trend.append(False)
                else:
                    trend.append(True)
                    supertrend.iloc[i] = final_lowerband.iloc[i]

            if pd.isna(supertrend.iloc[i]):
                supertrend.iloc[i] = (
                    final_lowerband.iloc[i] if not trend[i] else final_upperband.iloc[i]
                )

        return supertrend

    def calculate_max_high(
        self, df: pd.DataFrame, period: int = 52, freq: str = "W"
    ) -> pd.Series:
        if freq == "W":
            weekly_high = df["High"].resample("W").max()
            rolling_max = weekly_high.rolling(window=period).max()
            return rolling_max.reindex(df.index, method="ffill")
        return df["High"].rolling(window=period).max()

    def calculate_min_low(
        self, df: pd.DataFrame, period: int = 52, freq: str = "W"
    ) -> pd.Series:
        """Calculate rolling minimum low over period."""
        if freq == "W":
            weekly_low = df["Low"].resample("W").min()
            rolling_min = weekly_low.rolling(window=period).min()
            return rolling_min.reindex(df.index, method="ffill")
        return df["Low"].rolling(window=period).min()

    def calculate_indicators(self, shift_dict: Dict[str, Set[int]]) -> None:
        for symbol, df in self.data.items():
            try:
                ind: Dict[str, pd.Series] = {}
                # Track indicators to cache (key -> last 50 values, most recent first)
                to_cache: Dict[str, List[float]] = {}
                # Track cache hits for logging
                cache_hits = 0
                cache_stale = 0  # Track stale cache entries (timestamp mismatch)

                # Get current OHLC data's latest timestamp for cache validation
                current_data_ts = None
                if not df.empty:
                    ts = df.index[-1]
                    if hasattr(ts, 'isoformat'):
                        current_data_ts = ts.isoformat()
                    else:
                        current_data_ts = str(ts)

                def _extract_cache_values(series: pd.Series) -> List[float]:
                    """Extract last INDICATOR_CACHE_DEPTH values, most recent first."""
                    if series.empty:
                        return []
                    # Get last N values and reverse so most recent is first
                    return series.iloc[-INDICATOR_CACHE_DEPTH:].tolist()[::-1]

                def _get_or_calculate(key: str, calc_func) -> pd.Series:
                    """Check cache first, calculate if not cached or stale."""
                    nonlocal cache_hits, cache_stale
                    if _INDICATOR_CACHE_AVAILABLE:
                        cached, cached_data_ts = get_cached_indicator_values_with_ts(symbol, key)
                        if cached and len(cached) > 0:
                            # Validate timestamp matches current OHLC data
                            # Require data_ts to be present AND match (reject old cache without data_ts)
                            if cached_data_ts is not None and cached_data_ts == current_data_ts:
                                cache_hits += 1
                                # Build Series from cached values (need at least 1 value)
                                # Cached values are most-recent-first, so reverse for Series
                                return pd.Series(cached[::-1], index=df.index[-len(cached):])
                            else:
                                # Stale cache - OHLC data has changed or old cache without timestamp
                                cache_stale += 1
                    # Not cached or stale - calculate
                    result = calc_func()
                    if not result.empty:
                        to_cache[key] = _extract_cache_values(result)
                    return result

                for p in self.atr_periods:
                    key = f"atr_{p}"
                    ind[key] = _get_or_calculate(key, lambda p=p: self.calculate_atr(df, p))

                for p in self.ema_periods:
                    key = f"ema_{p}"
                    ind[key] = _get_or_calculate(key, lambda p=p: self.calculate_ema(df["Close"], p))

                for p in self.sma_periods:
                    key = f"sma_{p}"
                    ind[key] = _get_or_calculate(key, lambda p=p: self.calculate_sma(df["Close"], p))

                for p in self.rsi_periods:
                    key = f"rsi_{p}"
                    ind[key] = _get_or_calculate(key, lambda p=p: self.calculate_rsi(df, p))

                for period, std in self.bb_specs:
                    std_key = (
                        str(int(std)) if std == int(std) else str(std).replace(".", "_")
                    )
                    upper_key = f"bb_upper_{period}_{std_key}"
                    middle_key = f"bb_middle_{period}_{std_key}"
                    lower_key = f"bb_lower_{period}_{std_key}"
                    # Check if all three are cached with valid timestamps
                    use_cached = False
                    if _INDICATOR_CACHE_AVAILABLE:
                        cached_upper, upper_ts = get_cached_indicator_values_with_ts(symbol, upper_key)
                        cached_middle, middle_ts = get_cached_indicator_values_with_ts(symbol, middle_key)
                        cached_lower, lower_ts = get_cached_indicator_values_with_ts(symbol, lower_key)
                        if cached_upper and cached_middle and cached_lower:
                            # Validate all timestamps match current OHLC data
                            # Require data_ts to be present AND match (reject old cache without data_ts)
                            ts_valid = all(ts is not None and ts == current_data_ts for ts in [upper_ts, middle_ts, lower_ts])
                            if ts_valid:
                                cache_hits += 3
                                ind[upper_key] = pd.Series(cached_upper[::-1], index=df.index[-len(cached_upper):])
                                ind[middle_key] = pd.Series(cached_middle[::-1], index=df.index[-len(cached_middle):])
                                ind[lower_key] = pd.Series(cached_lower[::-1], index=df.index[-len(cached_lower):])
                                use_cached = True
                            else:
                                cache_stale += 3
                    if not use_cached:
                        upper, middle, lower = self.calculate_bollinger(df, period, std)
                        ind[upper_key] = upper
                        ind[middle_key] = middle
                        ind[lower_key] = lower
                        if not upper.empty:
                            to_cache[upper_key] = _extract_cache_values(upper)
                            to_cache[middle_key] = _extract_cache_values(middle)
                            to_cache[lower_key] = _extract_cache_values(lower)

                for period, mult in self.supertrend_specs:
                    mult_key = (
                        str(int(mult)) if mult == int(mult) else str(mult).replace(".", "_")
                    )
                    key = f"supertrend_{period}_{mult_key}"
                    ind[key] = _get_or_calculate(key, lambda p=period, m=mult: self.calculate_supertrend(df, p, m))

                # 52-week high - use fundamentals data from stock_fundamentals table
                for period, freq in self.max_high_specs:
                    key = f"high_{period}_{freq}"
                    if period == 52 and freq == "W":
                        # Use pre-fetched fundamentals data
                        value = self.fundamentals_52w_high.get(symbol)
                        ind[key] = pd.Series(value, index=df.index)
                    else:
                        ind[key] = self.calculate_max_high(df, period, freq)

                # 52-week low - use fundamentals data from stock_fundamentals table
                for period, freq in self.max_low_specs:
                    key = f"low_{period}_{freq}"
                    if period == 52 and freq == "W":
                        # Use pre-fetched fundamentals data
                        value = self.fundamentals_52w_low.get(symbol)
                        ind[key] = pd.Series(value, index=df.index)
                    else:
                        ind[key] = self.calculate_min_low(df, period, freq)

                ind["liquidity"] = df["Close"] * df["Volume"]

                for ind_name, shifts in shift_dict.items():
                    if ind_name not in ind:
                        continue
                    for sh in shifts:
                        shift_key = f"{ind_name}_shift_{sh}"
                        ind[shift_key] = ind[ind_name].shift(sh)

                self.indicators[symbol] = ind

                # Cache indicator values for future runs (non-blocking)
                cached_count = 0
                if to_cache and _INDICATOR_CACHE_AVAILABLE:
                    cached_count = cache_indicators_bulk(symbol, to_cache, current_data_ts)

                # Log stats for first few symbols (ALWAYS log, not just when caching)
                if symbol in self.symbols[:3]:
                    stale_info = f", stale={cache_stale}" if cache_stale > 0 else ""
                    logger.info(f"[CalcIndicators] {symbol}: cache_hits={cache_hits}, calculated={len(to_cache)}, newly_cached={cached_count}{stale_info}")

            except Exception as e:
                logger.debug(f"[CalcIndicators] Error for {symbol}: {e}")
                continue

    def screen_stocks(
        self, condition_expr: str, evaluator: Optional[ConditionEvaluator] = None
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        evaluator = evaluator or ConditionEvaluator(condition_expr)
        matches: List[Dict[str, Any]] = []
        indicator_names: Set[str] = set()
        base_keys = {"close", "volume", "liquidity"}

        for symbol, df in self.data.items():
            if df.empty or symbol not in self.indicators:
                continue

            ind = self.indicators[symbol]
            latest = df.iloc[-1]
            close_value = self._to_float(latest["Close"])
            volume_value = self._to_float(latest["Volume"])
            liquidity_series = ind.get("liquidity")
            liquidity_value = (
                self._to_float(liquidity_series.iloc[-1]) if liquidity_series is not None else 0.0
            )

            context: Dict[str, Any] = {
                "close": close_value,
                "volume": volume_value,
                "liquidity": liquidity_value,
            }

            for key, series in ind.items():
                val = series.iloc[-1]
                context[key] = self._to_float(val)

            try:
                result = evaluator.evaluate(context)
                if not result:
                    continue
            except ValueError as exc:
                raise exc
            except Exception:
                continue

            indicator_values: Dict[str, Optional[float]] = {}
            for key, value in context.items():
                if key in base_keys:
                    continue
                indicator_names.add(key)
                if pd.isna(value) or (isinstance(value, float) and np.isnan(value)):
                    indicator_values[key] = None
                else:
                    indicator_values[key] = round(float(value), 4)

            timestamp = df.index[-1]
            if hasattr(timestamp, "to_pydatetime"):
                timestamp_iso = timestamp.to_pydatetime().isoformat()
            elif hasattr(timestamp, "isoformat"):
                timestamp_iso = timestamp.isoformat()
            else:
                timestamp_iso = str(timestamp)

            matches.append(
                {
                    "symbol": symbol,
                    "close": round(close_value, 2),
                    "volume": int(volume_value),
                    "liquidity": round(liquidity_value, 2),
                    "as_of": timestamp_iso,
                    "indicators": indicator_values,
                }
            )

        matches.sort(key=lambda row: row["liquidity"], reverse=True)
        return matches, sorted(indicator_names)


def get_all_ticker_symbols() -> List[str]:
    """
    Fetch all ticker symbols from the database.
    Returns list of symbols in DB format (e.g., ['RELIANCE', 'TCS', ...])
    """
    conn = None
    try:
        # Get connection from shared pool
        _init_db_functions()
        conn = _get_db_connection()

        # Query all active tickers
        query = "SELECT symbol FROM tickers ORDER BY symbol ASC"

        with conn.cursor() as cur:
            cur.execute(query)
            rows = cur.fetchall()

        # Return symbols in DB format (without .NS suffix)
        symbols = [row[0] for row in rows]
        return symbols

    except Exception as e:
        logger.error(f"Error fetching tickers from database: {e}")
        # Fallback to empty list if database fails
        return []
    finally:
        if conn:
            _release_db_connection(conn)


def get_nse_top_100_symbols() -> List[str]:
    """
    Legacy function for backward compatibility.
    Now returns all symbols from database instead of hardcoded top 100.
    """
    return get_all_ticker_symbols()


def parse_expression(
    condition_expr: str,
) -> Tuple[
    Set[int],
    Set[int],
    Set[int],
    Set[int],
    Set[Tuple[int, float]],
    Set[Tuple[int, float]],
    Set[Tuple[int, str]],
    Set[Tuple[int, str]],
    Dict[str, Set[int]],
    Set[str],
]:
    vars_found = re.findall(r"\b([a-zA-Z0-9_]+)\b", condition_expr)
    atr_periods: Set[int] = set()
    ema_periods: Set[int] = set()
    sma_periods: Set[int] = set()
    rsi_periods: Set[int] = set()
    bb_specs: Set[Tuple[int, float]] = set()
    supertrend_specs: Set[Tuple[int, float]] = set()
    max_high_specs: Set[Tuple[int, str]] = set()
    max_low_specs: Set[Tuple[int, str]] = set()
    shift_dict: Dict[str, Set[int]] = {}

    passthrough_indicators: Set[str] = set()  # Indicators used as-is (macd_*, supertrend_direction_*)

    for v in set(vars_found):
        if v.lower() in ["close", "volume", "liquidity", "and", "or", "not", "true", "false",
                          "open", "high", "low"]:
            continue

        # MACD indicators (no period, just names)
        if v in ("macd_line", "macd_signal", "macd_histogram"):
            passthrough_indicators.add(v)
            continue

        # MACD with shift (e.g., macd_line_shift_1)
        macd_shift_match = re.match(r"(macd_line|macd_signal|macd_histogram)_shift_(\d+)$", v)
        if macd_shift_match:
            ind_name, sh = macd_shift_match.groups()
            passthrough_indicators.add(ind_name)
            shift_dict.setdefault(ind_name, set()).add(int(sh))
            continue

        # supertrend_direction (e.g., supertrend_direction_7_3)
        st_dir_match = re.match(r"supertrend_direction_(\d+)_([\d_]+)$", v)
        if st_dir_match:
            per, mult_str = st_dir_match.groups()
            passthrough_indicators.add(f"supertrend_direction_{per}_{mult_str}")
            continue

        # supertrend_direction with shift (e.g., supertrend_direction_7_3_shift_1)
        st_dir_shift_match = re.match(r"supertrend_direction_(\d+)_([\d_]+)_shift_(\d+)$", v)
        if st_dir_shift_match:
            per, mult_str, sh = st_dir_shift_match.groups()
            ind_name = f"supertrend_direction_{per}_{mult_str}"
            passthrough_indicators.add(ind_name)
            shift_dict.setdefault(ind_name, set()).add(int(sh))
            continue

        match = re.match(r"(atr|ema|sma|rsi)_(\d+)$", v)
        if match:
            typ, per = match.groups()
            per_int = int(per)
            if typ == "atr":
                atr_periods.add(per_int)
            elif typ == "ema":
                ema_periods.add(per_int)
            elif typ == "sma":
                sma_periods.add(per_int)
            elif typ == "rsi":
                rsi_periods.add(per_int)
            continue

        match = re.match(r"(atr|ema|sma|rsi)_(\d+)_shift_(\d+)$", v)
        if match:
            typ, per, sh = match.groups()
            per_int = int(per)
            sh_int = int(sh)
            ind_name = f"{typ}_{per_int}"
            if typ == "atr":
                atr_periods.add(per_int)
            elif typ == "ema":
                ema_periods.add(per_int)
            elif typ == "sma":
                sma_periods.add(per_int)
            elif typ == "rsi":
                rsi_periods.add(per_int)
            shift_dict.setdefault(ind_name, set()).add(sh_int)
            continue

        match = re.match(r"bb_(upper|middle|lower)_(\d+)_([\d_]+)$", v)
        if match:
            _, per, std_str = match.groups()
            per_int = int(per)
            std = float(std_str.replace("_", "."))
            bb_specs.add((per_int, std))
            continue

        match = re.match(r"bb_(upper|middle|lower)_(\d+)_([\d_]+)_shift_(\d+)$", v)
        if match:
            _, per, std_str, sh = match.groups()
            per_int = int(per)
            std = float(std_str.replace("_", "."))
            sh_int = int(sh)
            bb_specs.add((per_int, std))
            for band in ["upper", "middle", "lower"]:
                key = f"bb_{band}_{per_int}_{std_str}"
                shift_dict.setdefault(key, set()).add(sh_int)
            continue

        match = re.match(r"supertrend_(\d+)_([\d_]+)$", v)
        if match:
            per, mult_str = match.groups()
            per_int = int(per)
            mult = float(mult_str.replace("_", "."))
            supertrend_specs.add((per_int, mult))
            atr_periods.add(per_int)
            continue

        match = re.match(r"supertrend_(\d+)_([\d_]+)_shift_(\d+)$", v)
        if match:
            per, mult_str, sh = match.groups()
            per_int = int(per)
            mult = float(mult_str.replace("_", "."))
            sh_int = int(sh)
            ind_name = f"supertrend_{per_int}_{mult_str}"
            supertrend_specs.add((per_int, mult))
            atr_periods.add(per_int)
            shift_dict.setdefault(ind_name, set()).add(sh_int)
            continue

        match = re.match(r"high_(\d+)_([A-Z])$", v)
        if match:
            per, freq = match.groups()
            max_high_specs.add((int(per), freq))
            continue

        match = re.match(r"high_(\d+)_([A-Z])_shift_(\d+)$", v)
        if match:
            per, freq, sh = match.groups()
            per_int = int(per)
            sh_int = int(sh)
            ind_name = f"high_{per_int}_{freq}"
            max_high_specs.add((per_int, freq))
            shift_dict.setdefault(ind_name, set()).add(sh_int)
            continue

        # Match low_<period>_<freq> pattern (e.g., low_52_W for 52-week low)
        match = re.match(r"low_(\d+)_([A-Z])$", v)
        if match:
            per, freq = match.groups()
            max_low_specs.add((int(per), freq))
            continue

        match = re.match(r"low_(\d+)_([A-Z])_shift_(\d+)$", v)
        if match:
            per, freq, sh = match.groups()
            per_int = int(per)
            sh_int = int(sh)
            ind_name = f"low_{per_int}_{freq}"
            max_low_specs.add((per_int, freq))
            shift_dict.setdefault(ind_name, set()).add(sh_int)
            continue

    return (
        atr_periods,
        ema_periods,
        sma_periods,
        rsi_periods,
        bb_specs,
        supertrend_specs,
        max_high_specs,
        max_low_specs,
        shift_dict,
        passthrough_indicators,
    )


def run_screener(
    condition_expr: str,
    *,
    symbols: Optional[List[str]] = None,
    period: str = "1y",
) -> Dict[str, Any]:
    expression = (condition_expr or "").strip()
    if not expression:
        raise ValueError("Condition expression is required")

    target_symbols = symbols or get_nse_top_100_symbols()
    screener = StockScreener(target_symbols, period=period)

    expr_atr, expr_ema, expr_sma, expr_rsi, expr_bb, expr_st, expr_high, expr_low, shift_dict, _passthrough = (
        parse_expression(expression)
    )

    screener.atr_periods = expr_atr
    screener.ema_periods = expr_ema
    screener.sma_periods = expr_sma
    screener.rsi_periods = expr_rsi
    screener.bb_specs = expr_bb
    screener.supertrend_specs = expr_st
    screener.max_high_specs = expr_high
    screener.max_low_specs = expr_low

    data = screener.download_data()
    if not data:
        raise RuntimeError("Failed to download NSE price data")

    screener.calculate_indicators(shift_dict)
    evaluator = ConditionEvaluator(expression)
    rows, indicator_columns = screener.screen_stocks(expression, evaluator=evaluator)

    available_symbols = sorted(screener.data.keys())
    missing_symbols = sorted(set(target_symbols) - set(available_symbols))

    return {
        "expression": expression,
        "generated_at": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "matched": len(rows),
        "universe": len(available_symbols),
        "missing_symbols": missing_symbols,
        "results": rows,
        "indicator_columns": indicator_columns,
    }


# ======================
# Cache-First Screener (Skip OHLC)
# ======================
# When all required indicators are cached and no shifted indicators exceed
# the cache depth, we can skip OHLC fetching entirely and use cached values.


def _get_current_prices_bulk(
    symbols: List[str],
    ticker_map: Dict[str, int]
) -> Dict[str, Dict[str, float]]:
    """
    Fetch current LTP and volume from ltp_live table.

    Args:
        symbols: List of stock symbols
        ticker_map: Symbol to ticker_id mapping

    Returns:
        Dict: {symbol -> {ltp, close, volume}}
    """
    from db_ltp_accessor import LTPDataAccessor

    # Get ticker_ids for symbols
    ticker_ids = [ticker_map[s] for s in symbols if s in ticker_map]
    if not ticker_ids:
        return {}

    # Create reverse mapping
    id_to_symbol = {v: k for k, v in ticker_map.items() if k in symbols}

    conn = None
    try:
        _init_db_functions()
        conn = _get_db_connection()
        accessor = LTPDataAccessor(conn)

        ltp_data = accessor.get_latest_ltps(ticker_ids)

        # Convert to symbol-keyed dict
        result = {}
        for item in ltp_data:
            ticker_id = item.get('ticker_id')
            symbol = id_to_symbol.get(ticker_id)
            if symbol:
                result[symbol] = {
                    'ltp': item.get('ltp') or item.get('close') or 0,
                    'close': item.get('close') or item.get('ltp') or 0,
                    'volume': item.get('trade_volume') or 0,  # v2 schema uses trade_volume
                }
        return result

    except Exception as e:
        logger.warning(f"[CacheFirst] Failed to fetch LTP data: {e}")
        return {}
    finally:
        if conn:
            _release_db_connection(conn)


def _extract_required_indicators(
    expr_atr: Set[int],
    expr_ema: Set[int],
    expr_sma: Set[int],
    expr_rsi: Set[int],
    expr_bb: Set[Tuple[int, float]],
    expr_st: Set[Tuple[int, float]],
    passthrough_indicators: Set[str] = None,
) -> Set[str]:
    """Extract indicator names from parsed expression components."""
    indicators = set()

    for p in expr_atr:
        indicators.add(f"atr_{p}")
    for p in expr_ema:
        indicators.add(f"ema_{p}")
    for p in expr_sma:
        indicators.add(f"sma_{p}")
    for p in expr_rsi:
        indicators.add(f"rsi_{p}")
    for period, std in expr_bb:
        std_key = str(int(std)) if std == int(std) else str(std).replace(".", "_")
        indicators.add(f"bb_upper_{period}_{std_key}")
        indicators.add(f"bb_middle_{period}_{std_key}")
        indicators.add(f"bb_lower_{period}_{std_key}")
    for period, mult in expr_st:
        mult_key = str(int(mult)) if mult == int(mult) else str(mult).replace(".", "_")
        indicators.add(f"supertrend_{period}_{mult_key}")

    # Passthrough indicators (macd_line, macd_signal, macd_histogram, supertrend_direction_*)
    if passthrough_indicators:
        indicators.update(passthrough_indicators)

    return indicators


def _run_screener_cache_first(
    expression: str,
    target_symbols: List[str],
    required_indicators: Set[str],
    shift_dict: Dict[str, Set[int]],
    evaluator: ConditionEvaluator,
    ticker_map: Dict[str, int],
    expr_high: Set[Tuple[int, str]] = None,
    expr_low: Set[Tuple[int, str]] = None,
    progress_callback: Optional[Callable[[int, int, int], None]] = None,
    result_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    loading_callback: Optional[Callable[[int, int], None]] = None,
    abort_check: Optional[Callable[[], bool]] = None,
    batch_size: int = 100,
) -> Dict[str, Any]:
    """
    Optimized screener path using cached indicator arrays.
    Skips OHLC fetching entirely when all indicators are cached.
    Supports shifts up to INDICATOR_CACHE_DEPTH - 1.

    Args:
        expression: The condition expression
        target_symbols: Symbols to screen
        required_indicators: Set of indicator names needed (e.g., {'sma_50', 'rsi_14'})
        shift_dict: Dict of {indicator -> set of shift values}
        evaluator: Pre-compiled condition evaluator
        ticker_map: Symbol to ticker_id mapping
        progress_callback, result_callback, loading_callback, abort_check: Callbacks
        batch_size: Symbols per batch

    Returns:
        Final summary dict with all results
    """
    logger.info(f"[CacheFirst] Starting cache-first screener for {len(target_symbols)} symbols")
    start_time = time.time()

    total_symbols = len(target_symbols)
    all_matches: List[Dict[str, Any]] = []
    indicator_names: Set[str] = set()
    processed_count = 0
    matches_count = 0
    skipped_no_cache = 0

    # Signal loading start
    if loading_callback:
        loading_callback(0, total_symbols)

    # Fetch current prices from ltp_live (single bulk query)
    logger.info("[CacheFirst] Fetching current prices from LTP table...")
    current_prices = _get_current_prices_bulk(target_symbols, ticker_map)
    logger.info(f"[CacheFirst] Got prices for {len(current_prices)} symbols")

    # Fetch 52-week fundamentals if expression requires them
    fundamentals_52w: Dict[str, Dict] = {}
    if expr_high or expr_low:
        logger.info("[CacheFirst] Fetching 52-week fundamentals...")
        conn = None
        try:
            _init_db_functions()
            conn = _get_db_connection()
            ticker_ids = list(ticker_map.values())
            id_to_symbol = {v: k for k, v in ticker_map.items()}
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT ticker_id, fifty_two_week_high, fifty_two_week_low
                    FROM stock_fundamentals
                    WHERE ticker_id = ANY(%s)
                """, (ticker_ids,))
                for row in cur.fetchall():
                    tid, h52, l52 = row
                    sym = id_to_symbol.get(tid)
                    if sym:
                        fundamentals_52w[sym] = {
                            'high_52_W': float(h52) if h52 else None,
                            'low_52_W': float(l52) if l52 else None,
                        }
            logger.info(f"[CacheFirst] Got 52-week data for {len(fundamentals_52w)} symbols")
        except Exception as e:
            logger.warning(f"[CacheFirst] Failed to fetch 52-week data: {e}")
        finally:
            if conn:
                _release_db_connection(conn)

    if loading_callback:
        loading_callback(total_symbols, total_symbols)

    # Process in batches
    batches = [target_symbols[i:i + batch_size] for i in range(0, total_symbols, batch_size)]

    for batch_idx, batch_symbols in enumerate(batches):
        if abort_check and abort_check():
            logger.info("[CacheFirst] Aborted by user")
            break

        # Fetch cached indicators for this batch
        cached_data = get_cached_indicators_for_symbols(batch_symbols, required_indicators)

        for symbol in batch_symbols:
            # Skip if no cached data for this symbol
            if symbol not in cached_data:
                skipped_no_cache += 1
                continue

            symbol_indicators = cached_data[symbol]

            # Check if we have all required indicators
            missing = required_indicators - set(symbol_indicators.keys())
            if missing:
                skipped_no_cache += 1
                continue

            # Build evaluation context
            price_data = current_prices.get(symbol, {})
            close_val = price_data.get('close') or price_data.get('ltp') or 0
            volume_val = price_data.get('volume') or 0

            context: Dict[str, Any] = {
                'close': close_val,
                'volume': volume_val,
                'liquidity': close_val * volume_val,
            }

            # Add base indicators (values[0] = latest)
            for ind_name, values in symbol_indicators.items():
                if values:
                    context[ind_name] = values[0]

            # Add shifted indicators (values[N] = N bars ago)
            for ind_name, shifts in shift_dict.items():
                values = symbol_indicators.get(ind_name, [])
                for sh in shifts:
                    if sh < len(values):
                        context[f"{ind_name}_shift_{sh}"] = values[sh]
                    else:
                        # Shift exceeds cached depth - should not happen if path selection is correct
                        context[f"{ind_name}_shift_{sh}"] = None

            # Add 52-week data if available
            if symbol in fundamentals_52w:
                f52 = fundamentals_52w[symbol]
                if f52.get('high_52_W') is not None:
                    context['high_52_W'] = f52['high_52_W']
                if f52.get('low_52_W') is not None:
                    context['low_52_W'] = f52['low_52_W']

            # Evaluate expression
            try:
                if evaluator.evaluate(context):
                    # Build match result
                    match = {'symbol': symbol}
                    for key, val in context.items():
                        if val is not None:
                            match[key] = round(float(val), 4) if isinstance(val, (int, float)) else val

                    all_matches.append(match)
                    matches_count += 1

                    # Collect indicator names for output
                    for key in context.keys():
                        if key not in {'close', 'volume', 'liquidity'}:
                            indicator_names.add(key)

                    if result_callback:
                        result_callback(match)
            except Exception as e:
                logger.debug(f"[CacheFirst] Eval error for {symbol}: {e}")
                continue

        processed_count += len(batch_symbols)

        if progress_callback:
            progress_callback(processed_count, total_symbols, matches_count)

    elapsed = time.time() - start_time
    logger.info(f"[CacheFirst] Completed in {elapsed:.2f}s: "
                f"{matches_count} matches, {skipped_no_cache} skipped (no cache)")

    return {
        "expression": expression,
        "generated_at": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "matched": len(all_matches),
        "universe": total_symbols,
        "missing_symbols": [],
        "results": all_matches,
        "indicator_columns": sorted(indicator_names),
        "cache_mode": True,
        "cache_skipped": skipped_no_cache,
    }


def run_screener_streaming(
    condition_expr: str,
    *,
    symbols: Optional[List[str]] = None,
    period: str = "1y",
    progress_callback: Optional[Callable[[int, int, int], None]] = None,
    result_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    loading_callback: Optional[Callable[[int, int], None]] = None,
    abort_check: Optional[Callable[[], bool]] = None,
    batch_size: int = 100,
    job_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Streaming version of run_screener with parallel processing and real-time callbacks.

    Performance optimizations:
    - Pre-fetches ALL OHLC data in a single query (Redis cached for 30 minutes)
    - Uses pre-loaded symbol cache (eliminates 60 DB queries per run)
    - Distributes pre-fetched data to parallel workers

    Args:
        condition_expr: Boolean expression to evaluate
        symbols: Optional list of symbols (defaults to all tickers from database)
        period: Data period ('6mo', '1y', '2y', '5y')
        progress_callback: Called with (processed_count, total_count, matches_count)
        result_callback: Called immediately when a stock matches (with result dict)
        loading_callback: Called during data loading with (loaded_count, total_count)
        abort_check: Callable that returns True if task should be cancelled
        batch_size: Number of stocks to process per batch
        job_id: Optional job ID for distributed OHLC semaphore (limits heavy path concurrency)

    Returns:
        Final summary dict with all results
    """
    expression = (condition_expr or "").strip()
    if not expression:
        raise ValueError("Condition expression is required")

    # Get all target symbols
    target_symbols = symbols or get_all_ticker_symbols()
    total_symbols = len(target_symbols)

    # Parse expression to extract required indicators
    expr_atr, expr_ema, expr_sma, expr_rsi, expr_bb, expr_st, expr_high, expr_low, shift_dict, passthrough_indicators = (
        parse_expression(expression)
    )

    # Create evaluator
    evaluator = ConditionEvaluator(expression)

    # =====================================================
    # PATH SELECTION: Cache-first vs OHLC-based
    # Cache-first path is ~10x faster when indicators are cached
    # =====================================================

    # Get ticker_ids from pre-loaded symbol cache (no DB query needed)
    ticker_map = get_all_ticker_ids_from_cache(target_symbols)

    # Determine max shift value from expression
    max_shift = 0
    if shift_dict:
        for shifts in shift_dict.values():
            if shifts:
                max_shift = max(max_shift, max(shifts))

    # Extract required indicators from parsed expression
    # Note: close/volume are NOT indicators - they come from LTP data
    required_indicators = _extract_required_indicators(
        expr_atr, expr_ema, expr_sma, expr_rsi, expr_bb, expr_st,
        passthrough_indicators=passthrough_indicators,
    )

    # Standard indicators that are pre-warmed (must match main.py prewarm list)
    STANDARD_CACHED_INDICATORS = {
        "sma_20", "sma_50", "sma_100", "sma_200",
        "ema_9", "ema_12", "ema_26", "ema_50", "ema_200",
        "rsi_14", "atr_14",
        "macd_line", "macd_signal", "macd_histogram",
        "bb_upper_20_2", "bb_middle_20_2", "bb_lower_20_2",
        "supertrend_7_3", "supertrend_direction_7_3",
        "supertrend_10_3", "supertrend_direction_10_3",
    }

    # Check if ALL required indicators are in the standard cached set
    non_standard_indicators = required_indicators - STANDARD_CACHED_INDICATORS
    all_indicators_cached = len(non_standard_indicators) == 0

    # Check if we can use cache-first path
    # Conditions: cache available AND max_shift < cache depth AND all indicators are standard
    use_cache_first = False
    if _INDICATOR_CACHE_AVAILABLE and max_shift < INDICATOR_CACHE_DEPTH and all_indicators_cached:
        # Validate cache actually has data before committing to cache-first path
        # Sample check first 10 symbols to verify cache is populated with ALL required indicators
        sample_size = min(10, len(target_symbols))
        sample_symbols = target_symbols[:sample_size]
        cached_sample = get_cached_indicators_for_symbols(sample_symbols, required_indicators)

        # Count symbols that have ALL required indicators (not just partial data)
        complete_hits = 0
        for symbol, indicators in cached_sample.items():
            if required_indicators.issubset(set(indicators.keys())):
                complete_hits += 1
        cache_hit_rate = complete_hits / sample_size if sample_size > 0 else 0

        logger.info(f"[SCREENER] Cache check: required={required_indicators}, "
                   f"sample_symbols={len(cached_sample)}/{sample_size} have data, "
                   f"complete_hits={complete_hits}, hit_rate={cache_hit_rate:.0%}")

        if cache_hit_rate >= 0.5:
            logger.info(f"[SCREENER] Using CACHE-FIRST path (cache hit rate: {cache_hit_rate:.0%}, max_shift={max_shift})")
            use_cache_first = True
            try:
                return _run_screener_cache_first(
                    expression=expression,
                    target_symbols=target_symbols,
                    required_indicators=required_indicators,
                    shift_dict=shift_dict,
                    evaluator=evaluator,
                    ticker_map=ticker_map,
                    expr_high=expr_high,
                    expr_low=expr_low,
                    progress_callback=progress_callback,
                    result_callback=result_callback,
                    loading_callback=loading_callback,
                    abort_check=abort_check,
                    batch_size=batch_size,
                )
            except Exception as e:
                logger.warning(f"[SCREENER] Cache-first path failed: {e}, falling back to OHLC path")
                use_cache_first = False
                # Fall through to OHLC-based path
        else:
            logger.info(f"[SCREENER] Cache hit rate too low ({cache_hit_rate:.0%}), using OHLC path to populate cache")

    if not use_cache_first:
        reason = []
        if not _INDICATOR_CACHE_AVAILABLE:
            reason.append("cache unavailable")
        elif max_shift >= INDICATOR_CACHE_DEPTH:
            reason.append(f"max_shift={max_shift} >= {INDICATOR_CACHE_DEPTH}")
        elif non_standard_indicators:
            reason.append(f"non-standard indicators: {non_standard_indicators}")
        if reason:
            logger.info(f"[SCREENER] Using OHLC path ({', '.join(reason)})")

    # =====================================================
    # OHLC-BASED PATH: Pre-fetch OHLC data in batches
    # Used when shifts >= 50 or cache unavailable
    # Fetching 3000+ tickers at once overwhelms DB, so we batch
    # =====================================================

    # Acquire distributed OHLC slot (limits heavy path across all workers)
    _ohlc_slot = None
    if job_id:
        try:
            from server.redis_client import acquire_ohlc_slot, release_ohlc_slot
            _ohlc_slot = acquire_ohlc_slot(job_id)
            if _ohlc_slot is None:
                raise RuntimeError("Too many concurrent screener jobs using heavy data path. Please try again shortly.")
        except ImportError:
            pass  # Redis not available, proceed without slot

    logger.info(f"[SCREENER] Pre-fetching OHLC data for {total_symbols} tickers...")
    prefetch_start = time.time()

    # ticker_map already populated above in path selection
    ticker_ids = list(ticker_map.values())
    logger.info(f"[SCREENER] Got {len(ticker_ids)} ticker_ids from cache")

    # Fetch OHLC data in batches of 50 tickers (prevents DB overload)
    # 50 tickers × 300 rows = 15K rows per batch - fast for LATERAL JOIN
    PREFETCH_BATCH_SIZE = 50
    PREFETCH_MAX_TIME = 30  # 30 seconds max - get to results quickly, load rest on-demand
    prefetched_ohlc: Dict[int, List[Dict]] = {}
    conn = None
    prefetch_deadline = time.time() + PREFETCH_MAX_TIME
    total_tickers = len(ticker_ids)

    # Send initial loading progress
    if loading_callback:
        loading_callback(0, total_tickers)
    try:
        logger.info("[SCREENER] Getting DB connection for OHLC pre-fetch...")
        _init_db_functions()
        conn = _get_db_connection()
        logger.info("[SCREENER] Got DB connection, creating accessor...")
        accessor = TimeframeDataAccessor(conn)

        # Split ticker_ids into batches
        ticker_batches = [ticker_ids[i:i + PREFETCH_BATCH_SIZE]
                         for i in range(0, len(ticker_ids), PREFETCH_BATCH_SIZE)]
        logger.info(f"[SCREENER] Split into {len(ticker_batches)} batches of {PREFETCH_BATCH_SIZE}")

        for batch_idx, batch_ticker_ids in enumerate(ticker_batches):
            # Check overall timeout
            if time.time() > prefetch_deadline:
                logger.warning(f"[SCREENER] Pre-fetch timeout after {batch_idx} batches, continuing with partial data")
                break

            logger.info(f"[SCREENER] Starting batch {batch_idx + 1}/{len(ticker_batches)} "
                        f"({len(batch_ticker_ids)} tickers)...")
            batch_start = time.time()
            try:
                batch_data = accessor.fetch_ohlc_bulk(
                    ticker_ids=batch_ticker_ids,
                    timeframe='1hour',
                    limit=300,
                    use_cache=True  # Redis caching (30-minute TTL)
                )
                prefetched_ohlc.update(batch_data)
                batch_time = time.time() - batch_start
                logger.info(f"[SCREENER] Pre-fetch batch {batch_idx + 1}/{len(ticker_batches)}: "
                            f"{len(batch_data)} tickers in {batch_time:.2f}s")
                # Send loading progress update
                if loading_callback:
                    loading_callback(len(prefetched_ohlc), total_tickers)
            except Exception as batch_err:
                logger.warning(f"[SCREENER] Batch {batch_idx + 1} failed: {batch_err}, continuing...")
                # CRITICAL: Reset the aborted transaction state so subsequent batches can run
                # PostgreSQL requires ROLLBACK after a statement timeout to continue using the connection
                try:
                    conn.rollback()
                except Exception:
                    pass  # Connection may already be closed

    except Exception as e:
        logger.warning(f"[SCREENER] Pre-fetch failed, falling back to per-batch: {e}")
    finally:
        if conn:
            _release_db_connection(conn)

    prefetch_time = time.time() - prefetch_start
    logger.info(f"[SCREENER] Pre-fetched {len(prefetched_ohlc)} tickers total in {prefetch_time:.2f}s")

    # Pre-fetch 52-week fundamentals if needed (high_52_W or low_52_W in expression)
    prefetched_fundamentals: Dict[int, Dict] = {}
    if expr_high or expr_low:
        logger.info("[SCREENER] Pre-fetching 52-week fundamentals...")
        conn = None
        try:
            _init_db_functions()
            conn = _get_db_connection()
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT ticker_id, fifty_two_week_high, fifty_two_week_low
                    FROM stock_fundamentals
                    WHERE ticker_id = ANY(%s)
                """, (ticker_ids,))
                for row in cur.fetchall():
                    ticker_id, high_52w, low_52w = row
                    prefetched_fundamentals[ticker_id] = {
                        'high_52w': float(high_52w) if high_52w else None,
                        'low_52w': float(low_52w) if low_52w else None,
                    }
            logger.info(f"[SCREENER] Pre-fetched fundamentals for {len(prefetched_fundamentals)} tickers")
        except Exception as e:
            logger.warning(f"[SCREENER] Failed to pre-fetch fundamentals: {e}")
        finally:
            if conn:
                _release_db_connection(conn)

    # Split symbols into batches
    batches = [target_symbols[i:i + batch_size] for i in range(0, total_symbols, batch_size)]

    # Tracking variables
    all_matches: List[Dict[str, Any]] = []
    indicator_names: Set[str] = set()
    processed_count = 0
    matches_count = 0
    available_symbols: List[str] = []
    lock = threading.Lock()

    def process_batch(batch_symbols: List[str]) -> Tuple[List[Dict[str, Any]], Set[str], List[str]]:
        """Process a single batch of symbols using pre-fetched data."""
        nonlocal processed_count, matches_count

        # Check abort (poll Redis for cancellation status)
        if abort_check and abort_check():
            return [], set(), []

        # Create screener for this batch
        screener = StockScreener(batch_symbols, period=period)
        screener.atr_periods = expr_atr
        screener.ema_periods = expr_ema
        screener.sma_periods = expr_sma
        screener.rsi_periods = expr_rsi
        screener.bb_specs = expr_bb
        screener.supertrend_specs = expr_st
        screener.max_high_specs = expr_high
        screener.max_low_specs = expr_low

        # Use pre-fetched data if available, otherwise fall back to download_data()
        if prefetched_ohlc:
            # Filter pre-fetched data to only include this batch's tickers
            batch_ticker_map = {s: ticker_map[s] for s in batch_symbols if s in ticker_map}
            batch_ticker_ids = set(batch_ticker_map.values())
            batch_ohlc = {tid: data for tid, data in prefetched_ohlc.items() if tid in batch_ticker_ids}

            # Filter fundamentals for this batch
            batch_fundamentals = {tid: data for tid, data in prefetched_fundamentals.items() if tid in batch_ticker_ids} if prefetched_fundamentals else None

            data = screener.load_prefetched_data(batch_ohlc, batch_ticker_map, batch_fundamentals)

            # Check if any symbols in this batch are missing data (not in prefetch)
            # If so, fall back to download_data() for the ENTIRE batch to get all symbols
            missing_symbols = [s for s in batch_symbols if s not in data]
            if missing_symbols:
                logger.debug(f"[SCREENER] Batch has {len(missing_symbols)} symbols not in prefetch, using download_data()")
                data = screener.download_data()
        else:
            # Fallback: download data for this batch (original behavior)
            data = screener.download_data()

        if not data:
            with lock:
                processed_count += len(batch_symbols)
                if progress_callback:
                    progress_callback(processed_count, total_symbols, matches_count)
            return [], set(), []

        # Calculate indicators
        screener.calculate_indicators(shift_dict)

        # Screen stocks
        batch_matches, batch_indicator_names = screener.screen_stocks(
            expression, evaluator=evaluator
        )

        # Update counters and call callbacks
        batch_available = list(screener.data.keys())

        # Update counters under lock (minimize lock hold time)
        with lock:
            processed_count += len(batch_symbols)
            matches_count += len(batch_matches)
            # Capture current values for callbacks
            current_processed = processed_count
            current_matches = matches_count

        # Call callbacks OUTSIDE the lock to prevent blocking other workers
        # This significantly reduces lock contention during concurrent processing
        if result_callback:
            for match in batch_matches:
                result_callback(match)

        if progress_callback:
            progress_callback(current_processed, total_symbols, current_matches)

        return batch_matches, batch_indicator_names, batch_available

    # Process batches in parallel with dynamic worker count
    max_workers = get_optimal_worker_count()
    executor = ThreadPoolExecutor(max_workers=max_workers)
    try:
        future_to_batch = {
            executor.submit(process_batch, batch): batch
            for batch in batches
        }

        for future in as_completed(future_to_batch):
            if abort_check and abort_check():
                # Cancel remaining futures and exit
                for f in future_to_batch:
                    f.cancel()
                break

            try:
                # Add timeout to prevent indefinite hangs (5 min per batch max)
                batch_matches, batch_indicator_names, batch_available = future.result(timeout=300)

                with lock:
                    all_matches.extend(batch_matches)
                    indicator_names.update(batch_indicator_names)
                    available_symbols.extend(batch_available)

            except TimeoutError:
                batch = future_to_batch.get(future, [])
                logger.warning(f"Batch processing timeout for {len(batch)} symbols")
                continue
            except Exception as e:
                logger.error(f"Batch processing error: {e}")
                continue
    finally:
        # Ensure proper cleanup (Python 3.9+ supports cancel_futures)
        if sys.version_info >= (3, 9):
            executor.shutdown(wait=True, cancel_futures=abort_check() if abort_check else False)
        else:
            executor.shutdown(wait=True)

        # Free large pre-fetched data to reclaim ~270MB
        prefetched_ohlc.clear()
        prefetched_fundamentals.clear()
        gc.collect()

        # Release distributed OHLC slot
        if _ohlc_slot is not None:
            try:
                release_ohlc_slot(_ohlc_slot)
            except Exception:
                pass  # Non-critical, slot will auto-expire via TTL

    # Sort all matches by liquidity
    all_matches.sort(key=lambda row: row.get("liquidity", 0), reverse=True)

    # Calculate missing symbols
    available_set = set(available_symbols)
    missing_symbols = sorted(set(target_symbols) - available_set)

    return {
        "expression": expression,
        "generated_at": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "matched": len(all_matches),
        "universe": len(available_symbols),
        "missing_symbols": missing_symbols,
        "results": all_matches,
        "indicator_columns": sorted(indicator_names),
    }


if __name__ == "__main__":  # pragma: no cover - simple smoke test
    sample_expression = (
        "(close > ema_50) and (ema_50 > ema_150) and (liquidity > 1000000) "
        "and (close > 0.75 * high_52_W)"
    )
    summary = run_screener(sample_expression)
    print(
        f"{summary['matched']} matches out of {summary['universe']} symbols "
        f"for expression: {summary['expression']}"
    )
