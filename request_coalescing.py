"""
Request Coalescing (Single-Flight Pattern) for Fin-Terminal.

When multiple users request the same uncached data simultaneously:
- Only 1 DB query executes
- Other requests wait on the same future
- All requests receive the same result

This dramatically reduces DB load during cache misses.
"""

import asyncio
import json
import logging
from typing import Any, Callable, Dict, Optional, TypeVar
from functools import wraps
import time

logger = logging.getLogger(__name__)

T = TypeVar('T')


class RequestCoalescer:
    """
    Single-flight pattern implementation for request deduplication.

    Usage:
        coalescer = RequestCoalescer()

        # In endpoint:
        result = await coalescer.get_or_fetch(
            key=f"quote:{symbol}",
            fetcher=fetch_quote_from_db,
            symbol=symbol
        )
    """

    def __init__(self, redis_client=None):
        """
        Initialize the coalescer.

        Args:
            redis_client: Optional Redis client for caching results.
                         If provided, results are cached after fetch.
        """
        self._in_flight: Dict[str, asyncio.Future] = {}
        self._lock = asyncio.Lock()
        self._redis = redis_client
        self._stats = {
            "hits": 0,      # Cache hits
            "coalesced": 0, # Requests that waited on in-flight
            "fetched": 0,   # New DB fetches
            "errors": 0,    # Fetch errors
        }

    async def get_or_fetch(
        self,
        key: str,
        fetcher: Callable[..., Any],
        *args,
        cache_ttl: int = 60,
        **kwargs
    ) -> Any:
        """
        Get data from cache or fetch with deduplication.

        Args:
            key: Cache key (e.g., "quote:RELIANCE")
            fetcher: Async function to fetch data if not cached
            *args: Positional arguments for fetcher
            cache_ttl: TTL in seconds for cached result
            **kwargs: Keyword arguments for fetcher

        Returns:
            Fetched data (from cache, in-flight request, or new fetch)
        """
        # 1. Check Redis cache first (if available)
        if self._redis:
            try:
                cached = await self._redis.get(key)
                if cached:
                    self._stats["hits"] += 1
                    return json.loads(cached)
            except Exception as e:
                logger.warning(f"Redis get error for {key}: {e}")

        # 2. Check if request is already in-flight
        async with self._lock:
            if key in self._in_flight:
                self._stats["coalesced"] += 1
                logger.debug(f"Coalescing request for {key}")
                # Wait on existing request
                try:
                    return await self._in_flight[key]
                except Exception:
                    # If the in-flight request failed, we'll try again below
                    pass

            # 3. Create new in-flight request
            future = asyncio.get_running_loop().create_future()
            self._in_flight[key] = future

        # 4. Fetch data
        try:
            self._stats["fetched"] += 1
            start = time.time()
            result = await fetcher(*args, **kwargs)
            elapsed = time.time() - start
            logger.debug(f"Fetched {key} in {elapsed:.3f}s")

            # 5. Cache result in Redis
            if self._redis and result is not None:
                try:
                    await self._redis.setex(key, cache_ttl, json.dumps(result))
                except Exception as e:
                    logger.warning(f"Redis set error for {key}: {e}")

            # 6. Resolve future for waiting requests
            future.set_result(result)
            return result

        except Exception as e:
            self._stats["errors"] += 1
            logger.error(f"Fetch error for {key}: {e}")
            future.set_exception(e)
            raise

        finally:
            # 7. Remove from in-flight
            async with self._lock:
                self._in_flight.pop(key, None)

    def get_stats(self) -> Dict[str, int]:
        """Get coalescing statistics."""
        total = sum(self._stats.values())
        return {
            **self._stats,
            "total_requests": total,
            "cache_hit_rate": (self._stats["hits"] / total * 100) if total > 0 else 0,
            "coalesce_rate": (self._stats["coalesced"] / total * 100) if total > 0 else 0,
        }

    def reset_stats(self):
        """Reset statistics counters."""
        self._stats = {"hits": 0, "coalesced": 0, "fetched": 0, "errors": 0}

    @property
    def in_flight_count(self) -> int:
        """Number of currently in-flight requests."""
        return len(self._in_flight)


class BatchCoalescer:
    """
    Batch coalescing for multiple keys in a single request.

    Useful for batch quote requests where users may request
    overlapping sets of symbols.

    Usage:
        batch_coalescer = BatchCoalescer()

        # User A requests: RELIANCE, TCS, INFY
        # User B requests: TCS, INFY, HDFC
        # Only one batch query for all 4 symbols
    """

    def __init__(
        self,
        redis_client=None,
        batch_window_ms: int = 50,
        max_batch_size: int = 100
    ):
        """
        Initialize batch coalescer.

        Args:
            redis_client: Optional Redis client for caching
            batch_window_ms: Time window to collect requests before fetching
            max_batch_size: Maximum keys per batch query
        """
        self._redis = redis_client
        self._batch_window = batch_window_ms / 1000  # Convert to seconds
        self._max_batch_size = max_batch_size
        self._pending: Dict[str, asyncio.Future] = {}
        self._batch_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()
        self._stats = {
            "cache_hits": 0,
            "batch_fetches": 0,
            "keys_fetched": 0,
            "requests_batched": 0,
        }

    async def get_many(
        self,
        keys: list,
        fetcher: Callable[[list], Dict[str, Any]],
        cache_ttl: int = 60,
    ) -> Dict[str, Any]:
        """
        Get multiple keys with batching and caching.

        Args:
            keys: List of cache keys to fetch
            fetcher: Async function that takes list of keys, returns dict of results
            cache_ttl: TTL for cached results

        Returns:
            Dict mapping keys to their values
        """
        results = {}
        missing_keys = []

        # 1. Check cache for each key
        if self._redis:
            try:
                pipe = self._redis.pipeline()
                for key in keys:
                    pipe.get(key)
                cached_values = await pipe.execute()

                for key, cached in zip(keys, cached_values):
                    if cached:
                        results[key] = json.loads(cached)
                        self._stats["cache_hits"] += 1
                    else:
                        missing_keys.append(key)
            except Exception as e:
                logger.warning(f"Redis mget error: {e}")
                missing_keys = keys
        else:
            missing_keys = keys

        # 2. Fetch missing keys
        if missing_keys:
            fetched = await self._fetch_with_batching(missing_keys, fetcher, cache_ttl)
            results.update(fetched)

        return results

    async def _fetch_with_batching(
        self,
        keys: list,
        fetcher: Callable,
        cache_ttl: int
    ) -> Dict[str, Any]:
        """Fetch keys with request batching."""
        futures = {}

        async with self._lock:
            for key in keys:
                if key in self._pending:
                    # Already pending, reuse future
                    futures[key] = self._pending[key]
                    self._stats["requests_batched"] += 1
                else:
                    # Create new future
                    future = asyncio.get_running_loop().create_future()
                    self._pending[key] = future
                    futures[key] = future

            # Schedule batch fetch if not already scheduled
            if self._batch_task is None or self._batch_task.done():
                self._batch_task = asyncio.create_task(
                    self._execute_batch(fetcher, cache_ttl)
                )

        # Wait for all futures
        results = {}
        for key, future in futures.items():
            try:
                results[key] = await future
            except Exception as e:
                logger.error(f"Batch fetch error for {key}: {e}")

        return results

    async def _execute_batch(self, fetcher: Callable, cache_ttl: int):
        """Execute batch fetch after window expires."""
        # Wait for batch window to collect more requests
        await asyncio.sleep(self._batch_window)

        async with self._lock:
            # Get all pending keys
            pending_keys = list(self._pending.keys())[:self._max_batch_size]
            pending_futures = {k: self._pending.pop(k) for k in pending_keys}

        if not pending_keys:
            return

        try:
            # Execute batch fetch
            self._stats["batch_fetches"] += 1
            self._stats["keys_fetched"] += len(pending_keys)

            results = await fetcher(pending_keys)

            # Cache results
            if self._redis and results:
                try:
                    pipe = self._redis.pipeline()
                    for key, value in results.items():
                        if value is not None:
                            pipe.setex(key, cache_ttl, json.dumps(value))
                    await pipe.execute()
                except Exception as e:
                    logger.warning(f"Redis batch set error: {e}")

            # Resolve futures
            for key, future in pending_futures.items():
                if key in results:
                    future.set_result(results[key])
                else:
                    future.set_result(None)

        except Exception as e:
            # Reject all futures
            for future in pending_futures.values():
                if not future.done():
                    future.set_exception(e)

    def get_stats(self) -> Dict[str, Any]:
        """Get batching statistics."""
        return {
            **self._stats,
            "pending_count": len(self._pending),
        }


# =============================================================================
# Global Coalescers (initialized in main.py lifespan)
# =============================================================================

# Single-item coalescers
quote_coalescer: Optional[RequestCoalescer] = None
chart_coalescer: Optional[RequestCoalescer] = None
options_coalescer: Optional[RequestCoalescer] = None
fundamentals_coalescer: Optional[RequestCoalescer] = None

# Batch coalescers
batch_quote_coalescer: Optional[BatchCoalescer] = None


def init_coalescers(redis_client):
    """
    Initialize all coalescers with Redis client.

    Call this in FastAPI lifespan after Redis is connected.
    """
    global quote_coalescer, chart_coalescer, options_coalescer
    global fundamentals_coalescer, batch_quote_coalescer

    quote_coalescer = RequestCoalescer(redis_client)
    chart_coalescer = RequestCoalescer(redis_client)
    options_coalescer = RequestCoalescer(redis_client)
    fundamentals_coalescer = RequestCoalescer(redis_client)
    batch_quote_coalescer = BatchCoalescer(redis_client)

    logger.info("Request coalescers initialized")


def get_all_stats() -> Dict[str, Dict]:
    """Get statistics from all coalescers."""
    return {
        "quote": quote_coalescer.get_stats() if quote_coalescer else {},
        "chart": chart_coalescer.get_stats() if chart_coalescer else {},
        "options": options_coalescer.get_stats() if options_coalescer else {},
        "fundamentals": fundamentals_coalescer.get_stats() if fundamentals_coalescer else {},
        "batch_quote": batch_quote_coalescer.get_stats() if batch_quote_coalescer else {},
    }


# =============================================================================
# Decorator for Easy Integration
# =============================================================================

def coalesce(coalescer_name: str, key_template: str, ttl: int = 60):
    """
    Decorator to add request coalescing to an endpoint.

    Usage:
        @coalesce("quote", "quote:{symbol}", ttl=10)
        async def get_quote(symbol: str):
            return await fetch_from_db(symbol)

    Args:
        coalescer_name: Name of coalescer to use ("quote", "chart", etc.)
        key_template: Cache key template with {param} placeholders
        ttl: Cache TTL in seconds
    """
    coalescers = {
        "quote": lambda: quote_coalescer,
        "chart": lambda: chart_coalescer,
        "options": lambda: options_coalescer,
        "fundamentals": lambda: fundamentals_coalescer,
    }

    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            coalescer = coalescers.get(coalescer_name, lambda: None)()

            if coalescer is None:
                # Fallback to direct call if coalescer not initialized
                return await func(*args, **kwargs)

            # Build cache key from template and kwargs
            key = key_template.format(**kwargs)

            return await coalescer.get_or_fetch(
                key=key,
                fetcher=func,
                *args,
                cache_ttl=ttl,
                **kwargs
            )

        return wrapper
    return decorator
