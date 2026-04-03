"""
Real-time streaming using Redis Pub/Sub and Server-Sent Events (SSE).

Provides real-time market data updates by:
1. Publishing updates to Redis pub/sub channels from Celery workers
2. SSE endpoints that subscribe to channels and stream to clients

Scaled for 10,000+ concurrent SSE connections with:
- Connection limits and backpressure
- Shared Redis connection pool for pub/sub
- Optimized heartbeat generator
"""

import asyncio
import json
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import AsyncGenerator, Dict, List, Optional, Any, Set

import redis.asyncio as aioredis


# =============================================================================
# SSE Connection Manager
# =============================================================================

@dataclass
class SSEConnectionManager:
    """
    Manages SSE connections with limits and cleanup.
    Prevents resource exhaustion under high load.
    """
    max_connections: int = field(default_factory=lambda: int(os.getenv("SSE_MAX_CONNECTIONS", "12000")))
    _connections: Set[int] = field(default_factory=set)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def connect(self, connection_id: int) -> bool:
        """
        Register a new connection.

        Returns:
            True if connection accepted, False if limit exceeded.
        """
        async with self._lock:
            if len(self._connections) >= self.max_connections:
                return False
            self._connections.add(connection_id)
            return True

    async def disconnect(self, connection_id: int) -> None:
        """Unregister a connection."""
        async with self._lock:
            self._connections.discard(connection_id)

    @property
    def count(self) -> int:
        """Current connection count (approximate, no lock)."""
        return len(self._connections)

    async def stats(self) -> Dict[str, Any]:
        """Get connection statistics."""
        async with self._lock:
            return {
                "current": len(self._connections),
                "max": self.max_connections,
                "available": self.max_connections - len(self._connections),
                "utilization_pct": round(len(self._connections) / self.max_connections * 100, 2),
            }


# Global connection manager
sse_manager = SSEConnectionManager()

# =============================================================================
# Redis Pub/Sub Configuration with Connection Pool
# =============================================================================

_pubsub_pool: Optional[aioredis.ConnectionPool] = None
_pubsub_client: Optional[aioredis.Redis] = None


async def get_pubsub_pool() -> aioredis.ConnectionPool:
    """Get shared Redis connection pool for pub/sub operations."""
    global _pubsub_pool
    if _pubsub_pool is None:
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        pool_size = int(os.getenv("REDIS_PUBSUB_POOL_SIZE", "100"))
        _pubsub_pool = aioredis.ConnectionPool.from_url(
            redis_url,
            max_connections=pool_size,
            decode_responses=True,
        )
    return _pubsub_pool


async def get_pubsub_client() -> aioredis.Redis:
    """Get Redis client from shared pool for pub/sub operations.

    Note: This uses a pooled client which is efficient for high concurrency.
    For Celery tasks, use create_publish_client() instead.
    """
    global _pubsub_client
    if _pubsub_client is None:
        pool = await get_pubsub_pool()
        _pubsub_client = aioredis.Redis(connection_pool=pool)
    return _pubsub_client


async def create_publish_client() -> aioredis.Redis:
    """Create a fresh Redis client for publishing (for Celery tasks).

    Celery's solo pool on Windows creates a new event loop per task,
    so we need fresh connections that aren't tied to a previous loop.
    Caller must close the client after use!
    """
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    return aioredis.from_url(redis_url, decode_responses=True)


async def close_pubsub_client():
    """Close the pub/sub Redis client and pool."""
    global _pubsub_client, _pubsub_pool
    if _pubsub_client:
        await _pubsub_client.close()
        _pubsub_client = None
    if _pubsub_pool:
        await _pubsub_pool.disconnect()
        _pubsub_pool = None


# =============================================================================
# Pub/Sub Channel Names
# =============================================================================

CHANNEL_PRICES = "prices:updates"
CHANNEL_MOVERS = "movers:updates"
CHANNEL_INDICES = "indices:updates"
CHANNEL_FEAR_GREED = "fear-greed:updates"


# =============================================================================
# Publishing Functions (called from Celery tasks)
# =============================================================================


async def publish_prices(quotes: Dict[str, Any]) -> int:
    """
    Publish price updates to Redis pub/sub.

    Args:
        quotes: Dict mapping symbol to quote data

    Returns:
        Number of subscribers that received the message
    """
    client = await create_publish_client()
    try:
        message = json.dumps({
            "type": "prices",
            "data": quotes,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        })
        return await client.publish(CHANNEL_PRICES, message)
    finally:
        await client.close()


async def publish_movers(gainers: List[Dict], losers: List[Dict]) -> int:
    """
    Publish market movers updates to Redis pub/sub.

    Args:
        gainers: List of top gainers
        losers: List of top losers

    Returns:
        Number of subscribers that received the message
    """
    client = await create_publish_client()
    try:
        message = json.dumps({
            "type": "movers",
            "data": {"gainers": gainers, "losers": losers},
            "timestamp": datetime.utcnow().isoformat() + "Z",
        })
        return await client.publish(CHANNEL_MOVERS, message)
    finally:
        await client.close()


async def publish_indices(indices: List[Dict]) -> int:
    """
    Publish index price updates to Redis pub/sub.

    Args:
        indices: List of index data

    Returns:
        Number of subscribers that received the message
    """
    client = await create_publish_client()
    try:
        message = json.dumps({
            "type": "indices",
            "data": indices,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        })
        return await client.publish(CHANNEL_INDICES, message)
    finally:
        await client.close()


async def publish_fear_greed(data: Dict[str, Any]) -> int:
    """
    Publish Fear & Greed index updates to Redis pub/sub.

    Args:
        data: Fear & Greed index data

    Returns:
        Number of subscribers that received the message
    """
    client = await create_publish_client()
    try:
        message = json.dumps({
            "type": "fear_greed",
            "data": data,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        })
        return await client.publish(CHANNEL_FEAR_GREED, message)
    finally:
        await client.close()


# =============================================================================
# SSE Generators (for FastAPI streaming responses)
# =============================================================================


async def stream_prices(
    symbols: Optional[List[str]] = None,
) -> AsyncGenerator[str, None]:
    """
    Stream price updates for specified symbols via SSE.

    Args:
        symbols: Optional list of symbols to filter (None = all)

    Yields:
        SSE formatted messages

    Note:
        Uses SSE connection manager to enforce connection limits.
    """
    connection_id = id(asyncio.current_task())

    # Check connection limit
    if not await sse_manager.connect(connection_id):
        yield f"event: error\ndata: {json.dumps({'error': 'Connection limit exceeded', 'retry_ms': 5000})}\n\n"
        return

    client = await get_pubsub_client()
    pubsub = client.pubsub()

    try:
        await pubsub.subscribe(CHANNEL_PRICES)

        # Send initial connection event with stats
        stats = await sse_manager.stats()
        yield f"event: connected\ndata: {json.dumps({'channel': 'prices', 'symbols': symbols, 'stats': stats})}\n\n"

        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])

                    # Filter by symbols if specified
                    if symbols and data.get("data"):
                        filtered_data = {
                            k: v for k, v in data["data"].items()
                            if k.upper() in [s.upper() for s in symbols]
                        }
                        if not filtered_data:
                            continue
                        data["data"] = filtered_data

                    yield f"event: prices\ndata: {json.dumps(data)}\n\n"
                except json.JSONDecodeError:
                    continue
    finally:
        await sse_manager.disconnect(connection_id)
        await pubsub.unsubscribe(CHANNEL_PRICES)
        await pubsub.close()


async def stream_movers() -> AsyncGenerator[str, None]:
    """
    Stream market movers updates via SSE.

    Yields:
        SSE formatted messages with top gainers/losers
    """
    connection_id = id(asyncio.current_task())

    if not await sse_manager.connect(connection_id):
        yield f"event: error\ndata: {json.dumps({'error': 'Connection limit exceeded', 'retry_ms': 5000})}\n\n"
        return

    client = await get_pubsub_client()
    pubsub = client.pubsub()

    try:
        await pubsub.subscribe(CHANNEL_MOVERS)

        stats = await sse_manager.stats()
        yield f"event: connected\ndata: {json.dumps({'channel': 'movers', 'stats': stats})}\n\n"

        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    yield f"event: movers\ndata: {json.dumps(data)}\n\n"
                except json.JSONDecodeError:
                    continue
    finally:
        await sse_manager.disconnect(connection_id)
        await pubsub.unsubscribe(CHANNEL_MOVERS)
        await pubsub.close()


async def stream_indices() -> AsyncGenerator[str, None]:
    """
    Stream index price updates via SSE.

    Yields:
        SSE formatted messages with index prices
    """
    connection_id = id(asyncio.current_task())

    if not await sse_manager.connect(connection_id):
        yield f"event: error\ndata: {json.dumps({'error': 'Connection limit exceeded', 'retry_ms': 5000})}\n\n"
        return

    client = await get_pubsub_client()
    pubsub = client.pubsub()

    try:
        await pubsub.subscribe(CHANNEL_INDICES)

        stats = await sse_manager.stats()
        yield f"event: connected\ndata: {json.dumps({'channel': 'indices', 'stats': stats})}\n\n"

        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    yield f"event: indices\ndata: {json.dumps(data)}\n\n"
                except json.JSONDecodeError:
                    continue
    finally:
        await sse_manager.disconnect(connection_id)
        await pubsub.unsubscribe(CHANNEL_INDICES)
        await pubsub.close()


async def stream_all() -> AsyncGenerator[str, None]:
    """
    Stream all market updates (prices, movers, indices) via SSE.

    Yields:
        SSE formatted messages for all market data
    """
    connection_id = id(asyncio.current_task())

    if not await sse_manager.connect(connection_id):
        yield f"event: error\ndata: {json.dumps({'error': 'Connection limit exceeded', 'retry_ms': 5000})}\n\n"
        return

    client = await get_pubsub_client()
    pubsub = client.pubsub()

    try:
        await pubsub.subscribe(CHANNEL_PRICES, CHANNEL_MOVERS, CHANNEL_INDICES, CHANNEL_FEAR_GREED)

        stats = await sse_manager.stats()
        yield f"event: connected\ndata: {json.dumps({'channels': ['prices', 'movers', 'indices', 'fear_greed'], 'stats': stats})}\n\n"

        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    event_type = data.get("type", "update")
                    yield f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
                except json.JSONDecodeError:
                    continue
    finally:
        await sse_manager.disconnect(connection_id)
        await pubsub.unsubscribe(CHANNEL_PRICES, CHANNEL_MOVERS, CHANNEL_INDICES, CHANNEL_FEAR_GREED)
        await pubsub.close()


# =============================================================================
# Heartbeat Generator (keep connection alive) - Optimized for 10K+ connections
# =============================================================================


async def heartbeat_generator(
    stream: AsyncGenerator[str, None],
    interval: int = 30,
) -> AsyncGenerator[str, None]:
    """
    Wrap a stream generator with periodic heartbeats.

    Optimized implementation that avoids creating excessive tasks
    by using asyncio.wait_for with timeout instead.

    Args:
        stream: The underlying SSE stream
        interval: Heartbeat interval in seconds

    Yields:
        SSE messages including heartbeats
    """
    last_heartbeat = asyncio.get_event_loop().time()

    async def get_next_with_timeout(gen: AsyncGenerator, timeout: float):
        """Get next item with timeout, returns None on timeout."""
        try:
            return await asyncio.wait_for(anext(gen), timeout=timeout)
        except asyncio.TimeoutError:
            return None
        except StopAsyncIteration:
            raise

    try:
        while True:
            now = asyncio.get_event_loop().time()
            time_since_heartbeat = now - last_heartbeat
            time_until_heartbeat = max(0.1, interval - time_since_heartbeat)

            try:
                # Wait for stream data or timeout for heartbeat
                result = await get_next_with_timeout(stream, time_until_heartbeat)

                if result is not None:
                    yield result
                else:
                    # Timeout - send heartbeat
                    last_heartbeat = asyncio.get_event_loop().time()
                    yield f"event: heartbeat\ndata: {json.dumps({'timestamp': datetime.utcnow().isoformat() + 'Z'})}\n\n"

            except StopAsyncIteration:
                break

    except asyncio.CancelledError:
        pass


# =============================================================================
# Batch Price Fetch for Initial Load
# =============================================================================


async def get_initial_prices(
    pool,
    symbols: List[str],
) -> Dict[str, Any]:
    """
    Fetch current prices for symbols from database.

    Args:
        pool: asyncpg connection pool
        symbols: List of symbols to fetch

    Returns:
        Dict mapping symbol to quote data
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT t.symbol, l.ltp, l.close, l.percent_change, l.open, l.high, l.low, l.trade_volume
            FROM tickers t
            JOIN ltp_live l ON t.id = l.ticker_id
            WHERE t.symbol = ANY($1::text[])
        """, [s.upper() for s in symbols])

        prices = {}
        for row in rows:
            symbol = row["symbol"]
            ltp = float(row["ltp"]) if row["ltp"] else 0
            close = float(row["close"]) if row["close"] else ltp
            percent_change = float(row["percent_change"]) if row["percent_change"] else 0
            change = ltp - close

            prices[symbol] = {
                "symbol": symbol,
                "price": ltp,
                "change": round(change, 2),
                "changePercent": round(percent_change, 2),
                "open": float(row["open"]) if row["open"] else 0,
                "high": float(row["high"]) if row["high"] else 0,
                "low": float(row["low"]) if row["low"] else 0,
                "volume": int(row["trade_volume"]) if row["trade_volume"] else 0,
            }

        return prices
