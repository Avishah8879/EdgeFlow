"""
Redis caching utilities for Fin-Terminal FastAPI backend.

Provides async Redis connection management, caching decorators,
and configurable TTLs from environment variables.
"""

import hashlib
import json
import os
from functools import wraps
from typing import Any, Callable, Optional, TypeVar, Union

import redis.asyncio as aioredis

# Type variable for generic return types
T = TypeVar("T")

# Global Redis connection pool
_redis_pool: Optional[aioredis.ConnectionPool] = None
_redis_client: Optional[aioredis.Redis] = None


# =============================================================================
# Configuration from Environment Variables
# =============================================================================

def get_redis_url() -> str:
    """Get Redis URL from environment variables."""
    return os.getenv("REDIS_URL", "redis://localhost:6379/0")


def is_market_hours() -> bool:
    """
    Check if current time is within Indian market hours.

    Market hours: 9:15 AM - 3:30 PM IST (Monday-Friday)

    Returns:
        True if within market hours, False otherwise
    """
    from datetime import datetime
    try:
        import pytz
        ist = pytz.timezone("Asia/Kolkata")
        now = datetime.now(ist)
    except ImportError:
        # Fallback: assume UTC+5:30
        from datetime import timezone, timedelta
        ist_offset = timezone(timedelta(hours=5, minutes=30))
        now = datetime.now(ist_offset)

    # Check if weekday (Monday=0, Sunday=6)
    if now.weekday() >= 5:  # Saturday or Sunday
        return False

    # Market hours: 9:15 AM - 3:30 PM IST
    market_open = now.replace(hour=9, minute=15, second=0, microsecond=0)
    market_close = now.replace(hour=15, minute=30, second=0, microsecond=0)

    return market_open <= now <= market_close


def get_cache_ttl(cache_type: str) -> int:
    """
    Get cache TTL from environment variables.

    Args:
        cache_type: Type of cache (quote, chart_intraday, chart_daily, etc.)

    Returns:
        TTL in seconds
    """
    ttl_map = {
        "quote": int(os.getenv("CACHE_TTL_QUOTE", "10")),
        "chart_intraday": int(os.getenv("CACHE_TTL_CHART_INTRADAY", "60")),
        "chart_daily": int(os.getenv("CACHE_TTL_CHART_DAILY", "300")),
        "indices": int(os.getenv("CACHE_TTL_INDICES", "30")),
        "movers": int(os.getenv("CACHE_TTL_MOVERS", "30")),
        "search": int(os.getenv("CACHE_TTL_SEARCH", "600")),
        "fundamentals": int(os.getenv("CACHE_TTL_FUNDAMENTALS", "3600")),
        "rrg": int(os.getenv("CACHE_TTL_RRG", "1800")),
        "research": int(os.getenv("CACHE_TTL_RESEARCH", "3600")),
        "screener": int(os.getenv("CACHE_TTL_SCREENER", "900")),
        "options": int(os.getenv("CACHE_TTL_OPTIONS", "10")),
    }
    return ttl_map.get(cache_type, 60)  # Default 60 seconds


def get_dynamic_ttl(cache_type: str) -> int:
    """
    Get dynamic cache TTL based on market hours.

    During market hours: shorter TTLs for fresher data
    After hours: longer TTLs to reduce load

    Args:
        cache_type: Type of cache

    Returns:
        TTL in seconds
    """
    in_market = is_market_hours()

    # Market hours TTLs (shorter for freshness)
    market_ttl = {
        "quote": 5,
        "options": 5,
        "indices": 10,
        "movers": 15,
        "chart_intraday": 30,
        "chart_daily": 300,
        "fundamentals": 14400,  # 4 hours
        "rrg": 1800,
        "research": 3600,
        "screener": 900,
        "search": 600,
    }

    # After-hours TTLs (longer to reduce load)
    after_hours_ttl = {
        "quote": 300,  # 5 minutes
        "options": 300,
        "indices": 300,
        "movers": 600,
        "chart_intraday": 300,
        "chart_daily": 300,
        "fundamentals": 14400,
        "rrg": 3600,
        "research": 3600,
        "screener": 1800,
        "search": 3600,
    }

    ttl_map = market_ttl if in_market else after_hours_ttl
    return ttl_map.get(cache_type, 60)


# =============================================================================
# Redis Connection Management
# =============================================================================

# Track which event loop the client was created in
_redis_loop_id: Optional[int] = None


async def get_redis() -> aioredis.Redis:
    """
    Get or create Redis client with connection pooling.

    Handles event loop changes (e.g., Celery tasks on Windows create new loops).

    Returns:
        Redis client instance
    """
    import asyncio

    global _redis_pool, _redis_client, _redis_loop_id

    current_loop_id = id(asyncio.get_event_loop())

    # Check if we need a new client (first time or loop changed)
    if _redis_client is None or _redis_loop_id != current_loop_id:
        # Close old client if it exists (from different loop)
        if _redis_client is not None:
            try:
                await _redis_client.close()
            except Exception:
                pass  # Ignore errors closing stale client
            _redis_client = None

        if _redis_pool is not None:
            try:
                await _redis_pool.disconnect()
            except Exception:
                pass
            _redis_pool = None

        # Create new client for current event loop
        redis_url = get_redis_url()
        _redis_pool = aioredis.ConnectionPool.from_url(
            redis_url,
            max_connections=int(os.getenv("REDIS_MAX_CONNECTIONS", "200")),  # Scaled for 10K users
            decode_responses=True,
            socket_timeout=5.0,
            socket_connect_timeout=5.0,
            retry_on_timeout=True,
        )
        _redis_client = aioredis.Redis(connection_pool=_redis_pool)
        _redis_loop_id = current_loop_id

    return _redis_client


async def close_redis() -> None:
    """Close Redis connection pool."""
    global _redis_pool, _redis_client, _redis_loop_id

    if _redis_client:
        await _redis_client.close()
        _redis_client = None

    if _redis_pool:
        await _redis_pool.disconnect()
        _redis_pool = None

    _redis_loop_id = None


async def redis_health_check() -> dict:
    """
    Check Redis connection health.

    Returns:
        Dict with status and latency
    """
    try:
        client = await get_redis()
        import time
        start = time.time()
        await client.ping()
        latency = (time.time() - start) * 1000
        return {
            "status": "healthy",
            "latency_ms": round(latency, 2),
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
        }


# =============================================================================
# Cache Key Generation
# =============================================================================

def generate_cache_key(*args, prefix: str = "") -> str:
    """
    Generate a cache key from arguments.

    Args:
        *args: Arguments to include in key
        prefix: Key prefix (e.g., 'quote', 'chart')

    Returns:
        Cache key string
    """
    # Convert args to string and hash if too long
    key_parts = [str(arg) for arg in args if arg is not None]
    key_body = ":".join(key_parts)

    # If key is too long, hash it
    if len(key_body) > 100:
        key_body = hashlib.md5(key_body.encode()).hexdigest()

    if prefix:
        return f"{prefix}:{key_body}"
    return key_body


def hash_dict(d: dict) -> str:
    """Generate hash from dictionary for cache keys."""
    sorted_json = json.dumps(d, sort_keys=True)
    return hashlib.md5(sorted_json.encode()).hexdigest()[:16]


# =============================================================================
# Cache Operations
# =============================================================================

async def cache_get(key: str) -> Optional[Any]:
    """
    Get value from cache.

    Args:
        key: Cache key

    Returns:
        Cached value or None if not found
    """
    try:
        client = await get_redis()
        value = await client.get(key)
        if value:
            return json.loads(value)
        return None
    except Exception as e:
        print(f"[Redis] Cache get error for {key}: {e}")
        return None


async def cache_set(key: str, value: Any, ttl: int = 60) -> bool:
    """
    Set value in cache.

    Args:
        key: Cache key
        value: Value to cache (will be JSON serialized)
        ttl: Time to live in seconds

    Returns:
        True if successful, False otherwise
    """
    try:
        client = await get_redis()
        serialized = json.dumps(value, default=str)
        await client.setex(key, ttl, serialized)
        return True
    except Exception as e:
        print(f"[Redis] Cache set error for {key}: {e}")
        return False


async def cache_delete(key: str) -> bool:
    """
    Delete value from cache.

    Args:
        key: Cache key

    Returns:
        True if deleted, False otherwise
    """
    try:
        client = await get_redis()
        await client.delete(key)
        return True
    except Exception as e:
        print(f"[Redis] Cache delete error for {key}: {e}")
        return False


async def cache_delete_pattern(pattern: str) -> int:
    """
    Delete all keys matching pattern.

    Args:
        pattern: Key pattern (e.g., 'quote:*')

    Returns:
        Number of keys deleted
    """
    try:
        client = await get_redis()
        keys = []
        async for key in client.scan_iter(match=pattern):
            keys.append(key)

        if keys:
            await client.delete(*keys)
        return len(keys)
    except Exception as e:
        print(f"[Redis] Cache delete pattern error for {pattern}: {e}")
        return 0


# =============================================================================
# Caching Decorators
# =============================================================================

def cached(
    cache_type: str,
    key_prefix: str,
    ttl: Optional[int] = None,
    key_builder: Optional[Callable[..., str]] = None,
):
    """
    Decorator for caching async function results.

    Args:
        cache_type: Type of cache for TTL lookup
        key_prefix: Prefix for cache key
        ttl: Override TTL (uses env var if not provided)
        key_builder: Custom function to build cache key from args/kwargs

    Usage:
        @cached("quote", "quote")
        async def get_quote(symbol: str) -> dict:
            ...
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            # Build cache key
            if key_builder:
                cache_key = key_builder(*args, **kwargs)
            else:
                # Default: use positional args for key
                cache_key = generate_cache_key(*args, prefix=key_prefix)

            # Try to get from cache
            cached_value = await cache_get(cache_key)
            if cached_value is not None:
                return cached_value

            # Call function and cache result
            result = await func(*args, **kwargs)

            # Only cache if result is not None
            if result is not None:
                cache_ttl = ttl if ttl is not None else get_cache_ttl(cache_type)
                await cache_set(cache_key, result, cache_ttl)

            return result

        return wrapper
    return decorator


def cached_with_fallback(
    cache_type: str,
    key_prefix: str,
    ttl: Optional[int] = None,
    stale_ttl: Optional[int] = None,
):
    """
    Decorator for caching with stale-while-revalidate pattern.

    If cache is stale but within stale_ttl, return stale data
    and refresh in background.

    Args:
        cache_type: Type of cache for TTL lookup
        key_prefix: Prefix for cache key
        ttl: Fresh TTL
        stale_ttl: Additional time to serve stale data
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            cache_key = generate_cache_key(*args, prefix=key_prefix)
            cache_ttl = ttl if ttl is not None else get_cache_ttl(cache_type)
            total_ttl = cache_ttl + (stale_ttl or cache_ttl)

            # Try to get from cache
            cached_value = await cache_get(cache_key)
            if cached_value is not None:
                return cached_value

            # Call function and cache result
            result = await func(*args, **kwargs)

            if result is not None:
                await cache_set(cache_key, result, total_ttl)

            return result

        return wrapper
    return decorator


# =============================================================================
# Specialized Cache Functions for Fin-Terminal
# =============================================================================

async def cache_quote(symbol: str, data: dict) -> bool:
    """Cache stock quote data."""
    key = generate_cache_key(symbol.upper(), prefix="quote")
    ttl = get_cache_ttl("quote")
    return await cache_set(key, data, ttl)


async def get_cached_quote(symbol: str) -> Optional[dict]:
    """Get cached stock quote data."""
    key = generate_cache_key(symbol.upper(), prefix="quote")
    return await cache_get(key)


async def cache_chart(
    symbol: str,
    timeframe: str,
    period: str,
    data: list,
) -> bool:
    """Cache chart data."""
    cache_type = "chart_intraday" if timeframe == "1m" else "chart_daily"
    key = generate_cache_key(symbol.upper(), timeframe, period, prefix="chart")
    ttl = get_cache_ttl(cache_type)
    return await cache_set(key, data, ttl)


async def get_cached_chart(
    symbol: str,
    timeframe: str,
    period: str,
) -> Optional[list]:
    """Get cached chart data."""
    key = generate_cache_key(symbol.upper(), timeframe, period, prefix="chart")
    return await cache_get(key)


async def get_cached_charts_batch(
    symbols: list,
    timeframe: str,
    period: str,
) -> dict:
    """Get cached chart data for multiple symbols using Redis pipeline.

    This is 5-10x faster than individual cache lookups because:
    1. Single network round-trip to Redis
    2. Pipeline executes all GETs atomically

    Args:
        symbols: List of stock symbols
        timeframe: 1D, 1W, 1M, or 1m
        period: 1mo, 3mo, 6mo, 1y, 2y, 5y, max

    Returns:
        Dict mapping symbol -> cached data (or None if not cached)
    """
    if not symbols:
        return {}

    try:
        client = await get_redis()
        if not client:
            return {}

        # Generate cache keys for all symbols
        keys = [
            generate_cache_key(sym.upper(), timeframe, period, prefix="chart")
            for sym in symbols
        ]

        # Use pipeline for batch retrieval (single round-trip)
        pipeline = client.pipeline()
        for key in keys:
            pipeline.get(key)

        # Execute all GETs in single network call
        raw_results = await pipeline.execute()

        # Parse results back to dict
        results = {}
        for i, sym in enumerate(symbols):
            raw = raw_results[i]
            if raw:
                try:
                    results[sym.upper()] = json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    results[sym.upper()] = None
            else:
                results[sym.upper()] = None

        return results

    except Exception as e:
        print(f"[Redis] Batch chart cache error: {e}")
        return {}


async def cache_rrg(
    symbols: list,
    benchmark: str,
    period: str,
    data: dict,
) -> bool:
    """Cache RRG data."""
    symbols_hash = hash_dict({"symbols": sorted(symbols)})
    key = generate_cache_key(symbols_hash, benchmark.upper(), period, prefix="rrg")
    ttl = get_cache_ttl("rrg")
    return await cache_set(key, data, ttl)


async def get_cached_rrg(
    symbols: list,
    benchmark: str,
    period: str,
) -> Optional[dict]:
    """Get cached RRG data."""
    symbols_hash = hash_dict({"symbols": sorted(symbols)})
    key = generate_cache_key(symbols_hash, benchmark.upper(), period, prefix="rrg")
    return await cache_get(key)


async def cache_research(symbol: str, data: dict) -> bool:
    """Cache research report data."""
    key = generate_cache_key(symbol.upper(), prefix="research")
    ttl = get_cache_ttl("research")
    return await cache_set(key, data, ttl)


async def get_cached_research(symbol: str) -> Optional[dict]:
    """Get cached research report data."""
    key = generate_cache_key(symbol.upper(), prefix="research")
    return await cache_get(key)


async def cache_indices(data: list) -> bool:
    """Cache indices data."""
    key = "indices:all"
    ttl = get_cache_ttl("indices")
    return await cache_set(key, data, ttl)


async def get_cached_indices() -> Optional[list]:
    """Get cached indices data."""
    return await cache_get("indices:all")


async def cache_movers(mover_type: str, data: list) -> bool:
    """Cache market movers data."""
    key = f"movers:{mover_type}"
    ttl = get_cache_ttl("movers")
    return await cache_set(key, data, ttl)


async def get_cached_movers(mover_type: str) -> Optional[list]:
    """Get cached market movers data."""
    return await cache_get(f"movers:{mover_type}")


async def cache_search(query: str, data: list) -> bool:
    """Cache search results."""
    key = generate_cache_key(query.lower(), prefix="search")
    ttl = get_cache_ttl("search")
    return await cache_set(key, data, ttl)


async def get_cached_search(query: str) -> Optional[list]:
    """Get cached search results."""
    key = generate_cache_key(query.lower(), prefix="search")
    return await cache_get(key)


# =============================================================================
# Batch Operations
# =============================================================================

async def cache_batch_quotes(quotes: dict[str, dict]) -> int:
    """
    Cache multiple quotes at once using pipeline.

    Args:
        quotes: Dict mapping symbol to quote data

    Returns:
        Number of quotes cached
    """
    try:
        client = await get_redis()
        ttl = get_cache_ttl("quote")

        async with client.pipeline() as pipe:
            for symbol, data in quotes.items():
                key = generate_cache_key(symbol.upper(), prefix="quote")
                serialized = json.dumps(data, default=str)
                pipe.setex(key, ttl, serialized)
            await pipe.execute()

        return len(quotes)
    except Exception as e:
        print(f"[Redis] Batch quote cache error: {e}")
        return 0


async def get_batch_quotes(symbols: list[str]) -> dict[str, Optional[dict]]:
    """
    Get multiple quotes at once using pipeline.

    Args:
        symbols: List of symbols

    Returns:
        Dict mapping symbol to quote data (or None if not cached)
    """
    try:
        client = await get_redis()

        async with client.pipeline() as pipe:
            for symbol in symbols:
                key = generate_cache_key(symbol.upper(), prefix="quote")
                pipe.get(key)
            results = await pipe.execute()

        return {
            symbol: json.loads(result) if result else None
            for symbol, result in zip(symbols, results)
        }
    except Exception as e:
        print(f"[Redis] Batch quote get error: {e}")
        return {symbol: None for symbol in symbols}


# =============================================================================
# OHLCV Cache for Equity Screener
# =============================================================================

# TTL for OHLCV data - 12 hours (data only changes once per day)
OHLCV_CACHE_TTL = int(os.getenv("CACHE_TTL_OHLCV", "43200"))


async def cache_ohlcv_batch(
    ohlcv_data: dict[int, list[dict]],
    period: str,
    ttl: int = None,
) -> int:
    """
    Cache OHLCV data for multiple tickers using pipeline.

    Args:
        ohlcv_data: Dict mapping ticker_id to list of OHLCV records
        period: Period string (e.g., '6mo', '1y')
        ttl: Optional TTL override

    Returns:
        Number of tickers cached
    """
    if not ohlcv_data:
        return 0

    try:
        client = await get_redis()
        cache_ttl = ttl or OHLCV_CACHE_TTL

        async with client.pipeline() as pipe:
            for ticker_id, records in ohlcv_data.items():
                key = f"ohlcv:{period}:{ticker_id}"
                serialized = json.dumps(records, default=str)
                pipe.setex(key, cache_ttl, serialized)
            await pipe.execute()

        return len(ohlcv_data)
    except Exception as e:
        print(f"[Redis] OHLCV batch cache error: {e}")
        return 0


async def get_cached_ohlcv_batch(
    ticker_ids: list[int],
    period: str,
) -> tuple[dict[int, list[dict]], list[int]]:
    """
    Get cached OHLCV data for multiple tickers using MGET.

    Args:
        ticker_ids: List of ticker IDs to fetch
        period: Period string (e.g., '6mo', '1y')

    Returns:
        Tuple of (cached_data dict, missing_ids list)
    """
    if not ticker_ids:
        return {}, []

    try:
        client = await get_redis()
        keys = [f"ohlcv:{period}:{tid}" for tid in ticker_ids]

        # Use MGET for efficient batch retrieval
        values = await client.mget(keys)

        cached_data = {}
        missing_ids = []

        for tid, val in zip(ticker_ids, values):
            if val:
                cached_data[tid] = json.loads(val)
            else:
                missing_ids.append(tid)

        return cached_data, missing_ids
    except Exception as e:
        print(f"[Redis] OHLCV batch get error: {e}")
        # On error, treat all as missing
        return {}, list(ticker_ids)


async def clear_ohlcv_cache(period: str = None) -> int:
    """
    Clear OHLCV cache for a specific period or all periods.

    Args:
        period: Optional period to clear (clears all if None)

    Returns:
        Number of keys deleted
    """
    pattern = f"ohlcv:{period}:*" if period else "ohlcv:*"
    return await cache_delete_pattern(pattern)


# =============================================================================
# Options Chain Caching
# =============================================================================

async def cache_options(symbol: str, data: dict) -> bool:
    """Cache options chain data."""
    key = f"options:{symbol.upper()}"
    ttl = get_dynamic_ttl("options")
    return await cache_set(key, data, ttl)


async def get_cached_options(symbol: str) -> Optional[dict]:
    """Get cached options chain data."""
    return await cache_get(f"options:{symbol.upper()}")


# =============================================================================
# Hot Symbol Tracking
# =============================================================================

async def track_hot_symbol(symbol: str, ttl: int = 300) -> bool:
    """
    Track a symbol as "hot" (recently accessed).

    Hot symbols get priority refresh in background tasks.

    Args:
        symbol: Stock symbol
        ttl: How long to track (default 5 minutes)

    Returns:
        True if successful
    """
    try:
        client = await get_redis()
        pipe = client.pipeline()
        pipe.sadd("hot:symbols", symbol.upper())
        pipe.expire("hot:symbols", ttl)
        await pipe.execute()
        return True
    except Exception as e:
        print(f"[Redis] Track hot symbol error: {e}")
        return False


async def get_hot_symbols() -> list:
    """
    Get list of hot (recently accessed) symbols.

    Returns:
        List of symbol strings
    """
    try:
        client = await get_redis()
        symbols = await client.smembers("hot:symbols")
        return list(symbols) if symbols else []
    except Exception as e:
        print(f"[Redis] Get hot symbols error: {e}")
        return []


async def clear_hot_symbols() -> bool:
    """Clear the hot symbols set."""
    try:
        client = await get_redis()
        await client.delete("hot:symbols")
        return True
    except Exception as e:
        print(f"[Redis] Clear hot symbols error: {e}")
        return False


# =============================================================================
# Cache Statistics
# =============================================================================

async def get_cache_stats() -> dict:
    """
    Get cache statistics.

    Returns:
        Dict with cache stats
    """
    try:
        client = await get_redis()
        info = await client.info("memory")

        # Count keys by prefix
        key_counts = {}
        prefixes = ["quote", "chart", "rrg", "research", "indices", "movers", "search", "ohlcv"]

        for prefix in prefixes:
            count = 0
            async for _ in client.scan_iter(match=f"{prefix}:*"):
                count += 1
            key_counts[prefix] = count

        return {
            "memory_used": info.get("used_memory_human", "unknown"),
            "peak_memory": info.get("used_memory_peak_human", "unknown"),
            "key_counts": key_counts,
            "total_keys": sum(key_counts.values()),
        }
    except Exception as e:
        return {"error": str(e)}
