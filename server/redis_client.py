"""
Redis client module for Tiphub caching layer.

Provides:
- Connection management with automatic reconnection
- Cache utilities (get/set with TTL)
- Decorator for caching function results
- Cache statistics for monitoring
"""

import redis
import json
import os
import hashlib
import logging
from functools import wraps
from typing import Optional, Any, Callable, Union, List, Dict
from datetime import datetime

logger = logging.getLogger(__name__)

# ======================
# Redis Connection
# ======================

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Create connection pool for better performance
# Scaled for 10K concurrent users (150 connections for caching + Celery broker)
_pool = redis.ConnectionPool.from_url(
    REDIS_URL,
    max_connections=150,
    socket_connect_timeout=5,
    socket_timeout=5,
    retry_on_timeout=True,
    decode_responses=True
)

redis_client = redis.Redis(connection_pool=_pool)

# Cache statistics (in-memory counters) - protected by lock for thread safety
import threading
_cache_stats_lock = threading.Lock()
_cache_stats = {
    "hits": 0,
    "misses": 0,
    "errors": 0,
    "sets": 0
}


def _increment_stat(key: str) -> None:
    """Thread-safe increment of cache statistics."""
    with _cache_stats_lock:
        _cache_stats[key] += 1


def is_redis_available() -> bool:
    """Check if Redis is available and responding."""
    try:
        return redis_client.ping()
    except (redis.ConnectionError, redis.TimeoutError) as e:
        logger.warning(f"Redis not available: {e}")
        return False


def get_redis_info() -> dict:
    """Get Redis server info for debugging."""
    try:
        info = redis_client.info()
        return {
            "connected": True,
            "redis_version": info.get("redis_version"),
            "used_memory_human": info.get("used_memory_human"),
            "connected_clients": info.get("connected_clients"),
            "db0_keys": info.get("db0", {}).get("keys", 0) if isinstance(info.get("db0"), dict) else 0
        }
    except Exception as e:
        return {"connected": False, "error": str(e)}


# ======================
# Cache Utilities
# ======================

def get_cached(key: str) -> Optional[Any]:
    """
    Get cached value by key.

    Args:
        key: Cache key

    Returns:
        Cached value (deserialized from JSON) or None if not found
    """
    try:
        data = redis_client.get(key)
        if data:
            _increment_stat("hits")
            return json.loads(data)
        _increment_stat("misses")
        return None
    except (redis.ConnectionError, redis.TimeoutError) as e:
        _increment_stat("errors")
        logger.warning(f"Redis get error for key {key}: {e}")
        return None
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error for key {key}: {e}")
        return None


def get_cached_bulk(keys: List[str]) -> Dict[str, Any]:
    """
    Get multiple cached values by keys (uses Redis MGET for efficiency).

    Args:
        keys: List of cache keys

    Returns:
        Dict mapping key to cached value (only includes keys that were found)
    """
    if not keys:
        return {}

    try:
        values = redis_client.mget(keys)
        result = {}
        hits = 0
        misses = 0

        for key, data in zip(keys, values):
            if data:
                try:
                    result[key] = json.loads(data)
                    hits += 1
                except json.JSONDecodeError:
                    misses += 1
            else:
                misses += 1

        # Update stats
        for _ in range(hits):
            _increment_stat("hits")
        for _ in range(misses):
            _increment_stat("misses")

        return result
    except (redis.ConnectionError, redis.TimeoutError) as e:
        _increment_stat("errors")
        logger.warning(f"Redis mget error for {len(keys)} keys: {e}")
        return {}


def set_cached(key: str, value: Any, ttl: int = 300) -> bool:
    """
    Set cached value with TTL.

    Args:
        key: Cache key
        value: Value to cache (must be JSON serializable)
        ttl: Time-to-live in seconds (default: 5 minutes)

    Returns:
        True if successful, False otherwise
    """
    try:
        serialized = json.dumps(value, default=str)
        redis_client.setex(key, ttl, serialized)
        _increment_stat("sets")
        return True
    except (redis.ConnectionError, redis.TimeoutError) as e:
        _increment_stat("errors")
        logger.warning(f"Redis set error for key {key}: {e}")
        return False
    except (TypeError, ValueError) as e:
        logger.error(f"JSON serialize error for key {key}: {e}")
        return False


def delete_cached(key: str) -> bool:
    """Delete a cached key."""
    try:
        redis_client.delete(key)
        return True
    except Exception as e:
        logger.warning(f"Redis delete error for key {key}: {e}")
        return False


def delete_pattern(pattern: str) -> int:
    """
    Delete all keys matching a pattern.

    Args:
        pattern: Redis glob pattern (e.g., "indicators:*")

    Returns:
        Number of keys deleted
    """
    try:
        count = 0
        for key in redis_client.scan_iter(pattern):
            redis_client.delete(key)
            count += 1
        return count
    except Exception as e:
        logger.warning(f"Redis delete pattern error for {pattern}: {e}")
        return 0


def get_ttl(key: str) -> int:
    """Get remaining TTL for a key in seconds. Returns -2 if key doesn't exist."""
    try:
        return redis_client.ttl(key)
    except Exception:
        return -2


# ======================
# Cache Decorator
# ======================

def cache_result(
    key_prefix: str,
    ttl_seconds: int = 300,
    key_builder: Optional[Callable[..., str]] = None
):
    """
    Decorator to cache function results in Redis.

    Works with both sync and async functions.
    Falls back to executing the function if Redis is unavailable.

    Args:
        key_prefix: Prefix for cache keys (e.g., "indicators")
        ttl_seconds: Cache TTL in seconds (default: 5 minutes)
        key_builder: Optional custom function to build cache key from args

    Example:
        @cache_result("indicators", ttl_seconds=300)
        def get_technical_indicators(ticker: str, timeframe: str):
            # expensive calculation
            return indicators

        # Cache key will be: indicators:<hash of args>
    """
    def decorator(func: Callable):
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            # Build cache key
            if key_builder:
                cache_key = f"{key_prefix}:{key_builder(*args, **kwargs)}"
            else:
                key_data = f"{args}:{sorted(kwargs.items())}"
                key_hash = hashlib.md5(key_data.encode()).hexdigest()[:12]
                cache_key = f"{key_prefix}:{key_hash}"

            # Try to get from cache
            cached = get_cached(cache_key)
            if cached is not None:
                logger.debug(f"Cache HIT: {cache_key}")
                return cached

            logger.debug(f"Cache MISS: {cache_key}")

            # Execute function
            result = func(*args, **kwargs)

            # Cache the result
            if result is not None:
                set_cached(cache_key, result, ttl_seconds)

            return result

        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            # Build cache key
            if key_builder:
                cache_key = f"{key_prefix}:{key_builder(*args, **kwargs)}"
            else:
                key_data = f"{args}:{sorted(kwargs.items())}"
                key_hash = hashlib.md5(key_data.encode()).hexdigest()[:12]
                cache_key = f"{key_prefix}:{key_hash}"

            # Try to get from cache
            cached = get_cached(cache_key)
            if cached is not None:
                logger.debug(f"Cache HIT: {cache_key}")
                return cached

            logger.debug(f"Cache MISS: {cache_key}")

            # Execute function
            result = await func(*args, **kwargs)

            # Cache the result
            if result is not None:
                set_cached(cache_key, result, ttl_seconds)

            return result

        # Return appropriate wrapper based on function type
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator


# ======================
# Specific Cache Keys
# ======================

# TTL constants (in seconds)
TTL_TECHNICAL_INDICATORS = 300      # 5 minutes
TTL_MARKET_MOOD = 900               # 15 minutes
TTL_SENTIMENT = 86400               # 24 hours
TTL_FUNDAMENTALS = 3600             # 1 hour
TTL_OHLC_DATA = 1800                # 30 minutes
TTL_STOCK_LTP = 60                  # 1 minute
TTL_MARKET_MOVERS = 300             # 5 minutes
TTL_SEARCH_RESULTS = 300            # 5 minutes
TTL_TICKERS = 3600                  # 1 hour (basic ticker list)
TTL_TICKERS_HOURLY = 86400          # 24 hours (tickers with hourly data - changes very rarely)
TTL_SCREENER_TASK = 3600            # 1 hour (screener task state - shared across workers)
TTL_SCREENER_INDICATORS = 1800      # 30 minutes (cached indicator values - refresh runs every 15 min)
TTL_SCREENER_RESULTS_CACHE = 300    # 5 minutes (cached screener results for identical expressions)
TTL_REVERSE_DCF = 86400             # 24 hours (financial data is quarterly/annual)
LOCK_TTL_REVERSE_DCF = 30           # 30 seconds (max time for yfinance call)
TTL_SANKEY = 86400                  # 24 hours (financial statements are quarterly)
TTL_SECTOR_MEDIANS = 21600          # 6 hours (fundamentals change quarterly)
TTL_STOCK_SCORECARD = 7200          # 2 hours (after market)
TTL_STOCK_SCORECARD_MARKET = 3600   # 1 hour (during market hours)
LOCK_TTL_SCORECARD = 10             # 10 sec lock for calculation
LOCK_TTL_SECTOR_MEDIANS = 30        # 30 sec lock for sector median query
TTL_SHAREHOLDING = 21600            # 6 hours (shareholding data changes quarterly)
TTL_QUOTE = 60                      # 1 minute (matches LTP freshness)
TTL_QUOTE_HISTORICAL = 300          # 5 minutes (candles change less frequently)
TTL_PATTERN_SEARCH = 900            # 15 minutes (pattern scan is expensive, results stable)
TTL_SEASONALITY = 3600              # 1 hour (historical seasonality changes slowly)


def make_indicator_key(ticker: str, timeframe: str = "1hour") -> str:
    """Generate cache key for technical indicators."""
    return f"indicators:{ticker.upper()}:{timeframe}"


def make_ohlc_key(ticker: str, timeframe: str, limit: int) -> str:
    """Generate cache key for OHLC data."""
    return f"ohlc:{ticker.upper()}:{timeframe}:{limit}"


def make_sentiment_key(ticker: str) -> str:
    """Generate cache key for sentiment analysis."""
    return f"sentiment:{ticker.upper()}"


def make_fundamentals_key(ticker: str) -> str:
    """Generate cache key for stock fundamentals."""
    return f"fundamentals:{ticker.upper()}"


def make_screener_task_key(job_id: str) -> str:
    """Generate Redis key for screener task state."""
    return f"screener:task:{job_id}"


def make_screener_results_key(job_id: str) -> str:
    """Generate Redis key for screener task results list."""
    return f"screener:results:{job_id}"


def make_single_indicator_key(ticker: str, indicator: str) -> str:
    """Generate cache key for a single indicator value (e.g., ind:RELIANCE:sma_50)."""
    return f"ind:{ticker.upper()}:{indicator}"


def make_reverse_dcf_key(symbol: str, wacc: float, terminal_growth: float, forecast_years: int) -> str:
    """Generate cache key for reverse DCF calculation."""
    return f"reverse_dcf:{symbol.upper()}:{wacc:.2f}:{terminal_growth:.2f}:{forecast_years}"


def make_reverse_dcf_lock_key(cache_key: str) -> str:
    """Generate lock key for reverse DCF cache key."""
    return f"lock:{cache_key}"


def make_shareholding_key(symbol: str, view: str = "quarterly") -> str:
    """Generate cache key for shareholding pattern data."""
    return f"shareholding:{symbol.upper()}:{view}"


# ======================
# Distributed Locking
# ======================

def try_acquire_lock(lock_key: str, ttl: int = 30) -> bool:
    """
    Try to acquire a distributed lock using Redis SETNX.

    Args:
        lock_key: The lock key to acquire
        ttl: Lock expiry time in seconds (prevents deadlock if holder crashes)

    Returns:
        True if lock acquired, False if already held by another process
    """
    try:
        # SET key value NX EX ttl - atomic set-if-not-exists with expiry
        result = redis_client.set(lock_key, "1", nx=True, ex=ttl)
        return result is True
    except (redis.ConnectionError, redis.TimeoutError) as e:
        logger.warning(f"Redis lock acquire error for {lock_key}: {e}")
        # If Redis is down, return True to allow computation (degrade gracefully)
        return True


def release_lock(lock_key: str) -> bool:
    """
    Release a distributed lock.

    Args:
        lock_key: The lock key to release

    Returns:
        True if successful
    """
    try:
        redis_client.delete(lock_key)
        return True
    except (redis.ConnectionError, redis.TimeoutError) as e:
        logger.warning(f"Redis lock release error for {lock_key}: {e}")
        return False


# ======================
# Distributed OHLC Semaphore
# ======================

MAX_CONCURRENT_OHLC = 2     # Max concurrent OHLC-based screener jobs across ALL workers
OHLC_SLOT_TTL = 600         # 10 minutes (auto-expire if worker crashes)


def acquire_ohlc_slot(job_id: str):
    """
    Acquire a distributed OHLC processing slot using Redis.

    Uses numbered slots with SETNX + TTL for crash safety.
    Returns slot number (int) if acquired, None if all slots taken.
    If Redis is unavailable, returns 0 (graceful degradation - allow the job).
    """
    try:
        for slot in range(MAX_CONCURRENT_OHLC):
            key = f"screener:ohlc_slot:{slot}"
            if redis_client.set(key, job_id, nx=True, ex=OHLC_SLOT_TTL):
                logger.info(f"[OHLCSemaphore] Acquired slot {slot} for job {job_id}")
                return slot
        logger.warning(f"[OHLCSemaphore] All {MAX_CONCURRENT_OHLC} slots taken, rejecting job {job_id}")
        return None
    except (redis.ConnectionError, redis.TimeoutError) as e:
        logger.warning(f"[OHLCSemaphore] Redis error, allowing job {job_id}: {e}")
        return 0  # Graceful degradation


def release_ohlc_slot(slot: int):
    """Release a distributed OHLC processing slot."""
    try:
        key = f"screener:ohlc_slot:{slot}"
        redis_client.delete(key)
        logger.info(f"[OHLCSemaphore] Released slot {slot}")
        return True
    except (redis.ConnectionError, redis.TimeoutError) as e:
        logger.warning(f"[OHLCSemaphore] Redis error releasing slot {slot}: {e}")
        return False


# ======================
# Per-User Concurrent Task Limiting
# ======================

# TTL for active task counters (auto-expire as safety net)
TTL_ACTIVE_TASK = 600  # 10 minutes (max expected task duration)

# Default limits per tier
TASK_LIMITS = {
    "basic": 1,
    "premium": 5,
    "enterprise": 20,
}


def check_task_limit(user_id: str, tier: str = "basic") -> bool:
    """
    Check if user can start a new task.
    Returns True if under limit, False if at/over limit.
    Uses user_id (or IP address) as the identifier.
    """
    if not is_redis_available():
        return True  # Allow if Redis is down (graceful degradation)

    key = f"tasks:{user_id}:active"
    try:
        current = redis_client.get(key)
        count = int(current) if current else 0
        limit = TASK_LIMITS.get(tier, TASK_LIMITS["basic"])
        return count < limit
    except Exception as e:
        logger.warning(f"[TaskLimit] Redis error checking limit for {user_id}: {e}")
        return True  # Allow on error


def increment_task_count(user_id: str) -> int:
    """Increment active task count for a user. Returns new count."""
    if not is_redis_available():
        return 0

    key = f"tasks:{user_id}:active"
    try:
        count = redis_client.incr(key)
        redis_client.expire(key, TTL_ACTIVE_TASK)
        return count
    except Exception as e:
        logger.warning(f"[TaskLimit] Redis error incrementing for {user_id}: {e}")
        return 0


def decrement_task_count(user_id: str) -> int:
    """Decrement active task count for a user. Returns new count."""
    if not is_redis_available():
        return 0

    key = f"tasks:{user_id}:active"
    try:
        count = redis_client.decr(key)
        if count <= 0:
            redis_client.delete(key)
            return 0
        return count
    except Exception as e:
        logger.warning(f"[TaskLimit] Redis error decrementing for {user_id}: {e}")
        return 0


# ======================
# Cache Statistics
# ======================

def get_cache_stats() -> dict:
    """Get cache statistics for monitoring (thread-safe)."""
    with _cache_stats_lock:
        hits = _cache_stats["hits"]
        misses = _cache_stats["misses"]
        errors = _cache_stats["errors"]
        sets = _cache_stats["sets"]

    total = hits + misses
    hit_rate = (hits / total * 100) if total > 0 else 0

    return {
        "hits": hits,
        "misses": misses,
        "hit_rate": f"{hit_rate:.1f}%",
        "errors": errors,
        "sets": sets,
        "redis_available": is_redis_available(),
        "redis_info": get_redis_info()
    }


def reset_cache_stats():
    """Reset cache statistics counters (thread-safe)."""
    global _cache_stats
    with _cache_stats_lock:
        _cache_stats = {"hits": 0, "misses": 0, "errors": 0, "sets": 0}


# ======================
# Initialization
# ======================

def init_redis():
    """Initialize Redis connection and log status."""
    if is_redis_available():
        info = get_redis_info()
        logger.info(f"Redis connected: {info.get('redis_version', 'unknown')} "
                   f"({info.get('used_memory_human', 'N/A')} used)")
        return True
    else:
        logger.warning("Redis not available - caching disabled, falling back to direct execution")
        return False
