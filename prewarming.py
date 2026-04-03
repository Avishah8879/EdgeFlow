"""
Cache prewarming utilities for Fin-Terminal.

Preloads all market data into Redis at startup for fast user access.
Target: Complete prewarming in <60 seconds for 3,014 tickers.

Strategy:
1. Check Redis first - skip items with valid TTL
2. Bulk queries (single query for all tickers)
3. Redis pipelines (batch writes)
4. Parallel execution with asyncio.gather()

Smart Prewarming:
- On restart, checks Redis cache before fetching from DB
- Only fetches data where TTL has expired
- Makes restarts nearly instant if Redis data is fresh
"""

import asyncio
import json
import os
import time
from typing import Any, Dict, List, Optional, Set

import redis_cache


# Minimum TTL (seconds) to consider data "fresh" - don't re-fetch
MIN_TTL_FRESH = 60


async def check_cache_freshness(redis_client, key_pattern: str, sample_keys: List[str] = None) -> Dict[str, Any]:
    """
    Check if cached data is still fresh (has remaining TTL).

    Args:
        redis_client: Redis client
        key_pattern: Pattern like "quote:*" or specific key
        sample_keys: Optional list of specific keys to check

    Returns:
        Dict with: {"fresh": bool, "count": int, "avg_ttl": float, "expired_keys": list}
    """
    try:
        if sample_keys:
            # Check specific keys
            pipe = redis_client.pipeline()
            for key in sample_keys:
                pipe.ttl(key)
            ttls = await pipe.execute()

            fresh_count = sum(1 for t in ttls if t and t > MIN_TTL_FRESH)
            expired_keys = [k for k, t in zip(sample_keys, ttls) if not t or t <= MIN_TTL_FRESH]
            avg_ttl = sum(max(0, t) for t in ttls if t) / len(ttls) if ttls else 0

            return {
                "fresh": fresh_count == len(sample_keys),
                "count": len(sample_keys),
                "fresh_count": fresh_count,
                "avg_ttl": round(avg_ttl, 1),
                "expired_keys": expired_keys[:10],  # Limit for logging
            }
        else:
            # Check pattern - get sample
            keys = await redis_client.keys(key_pattern)
            if not keys:
                return {"fresh": False, "count": 0, "avg_ttl": 0, "expired_keys": []}

            # Sample up to 100 keys for TTL check
            sample = keys[:100] if len(keys) > 100 else keys
            pipe = redis_client.pipeline()
            for key in sample:
                pipe.ttl(key)
            ttls = await pipe.execute()

            fresh_count = sum(1 for t in ttls if t and t > MIN_TTL_FRESH)
            avg_ttl = sum(max(0, t) for t in ttls if t) / len(ttls) if ttls else 0

            return {
                "fresh": fresh_count >= len(sample) * 0.9,  # 90% fresh = skip prewarm
                "count": len(keys),
                "fresh_count": fresh_count,
                "sample_size": len(sample),
                "avg_ttl": round(avg_ttl, 1),
            }

    except Exception as e:
        print(f"[Prewarm] Cache freshness check error: {e}")
        return {"fresh": False, "count": 0, "error": str(e)}


async def get_uncached_symbols(redis_client, all_symbols: List[str], prefix: str = "quote") -> Set[str]:
    """
    Get symbols that are NOT in cache or have expired TTL.

    Args:
        redis_client: Redis client
        all_symbols: Full list of symbols
        prefix: Cache key prefix (quote, chart, etc.)

    Returns:
        Set of symbols that need to be fetched from DB
    """
    try:
        if not all_symbols:
            return set()

        # Check TTL for all symbols in batches
        batch_size = 500
        uncached = set()

        for i in range(0, len(all_symbols), batch_size):
            batch = all_symbols[i:i + batch_size]
            keys = [f"{prefix}:{sym}" for sym in batch]

            pipe = redis_client.pipeline()
            for key in keys:
                pipe.ttl(key)
            ttls = await pipe.execute()

            for sym, ttl in zip(batch, ttls):
                # TTL of -2 means key doesn't exist, -1 means no expiry
                # Consider expired if TTL <= MIN_TTL_FRESH
                if ttl is None or ttl == -2 or (ttl > 0 and ttl <= MIN_TTL_FRESH):
                    uncached.add(sym)

        return uncached

    except Exception as e:
        print(f"[Prewarm] Error checking uncached symbols: {e}")
        return set(all_symbols)  # On error, fetch all


async def prewarm_all_quotes(pool, redis_client=None, force: bool = False) -> Dict[str, Any]:
    """
    Prewarm quote cache for all tickers.

    Smart prewarming: checks Redis first, only fetches expired/missing from DB.
    Target: <10 seconds for 3,014 tickers (instant if cache is fresh).

    Args:
        pool: asyncpg connection pool (Tiphub - read only)
        redis_client: Optional Redis client (creates one if not provided)
        force: If True, bypass cache check and fetch all from DB

    Returns:
        Dict with stats: {"count": int, "time_seconds": float, "from_cache": int, "from_db": int}
    """
    start = time.perf_counter()

    if redis_client is None:
        redis_client = await redis_cache.get_redis()

    try:
        # Step 1: Check cache freshness (unless forced)
        if not force:
            cache_status = await check_cache_freshness(redis_client, "quote:*")
            if cache_status.get("fresh") and cache_status.get("count", 0) >= 2000:
                # Cache is mostly fresh - skip DB fetch
                check_time = time.perf_counter() - start
                print(f"[Prewarm] Quotes cache fresh ({cache_status['count']} keys, avg TTL {cache_status['avg_ttl']}s) - skipping DB fetch")
                return {
                    "count": cache_status["count"],
                    "time_seconds": round(check_time, 2),
                    "from_cache": cache_status["count"],
                    "from_db": 0,
                    "skipped": True,
                }

        # Step 2: Get all symbols from DB (lightweight query)
        async with pool.acquire() as conn:
            symbol_rows = await conn.fetch("SELECT symbol FROM tickers ORDER BY id", timeout=30)
        all_symbols = [row["symbol"] for row in symbol_rows]

        # Step 3: Find which symbols need fetching (unless forced)
        if force:
            uncached_symbols = set(all_symbols)
        else:
            uncached_symbols = await get_uncached_symbols(redis_client, all_symbols, "quote")

        if not uncached_symbols:
            check_time = time.perf_counter() - start
            print(f"[Prewarm] All {len(all_symbols)} quotes already cached - skipping")
            return {
                "count": len(all_symbols),
                "time_seconds": round(check_time, 2),
                "from_cache": len(all_symbols),
                "from_db": 0,
                "skipped": True,
            }

        print(f"[Prewarm] {len(uncached_symbols)}/{len(all_symbols)} quotes need refresh")

        # Step 4: Fetch only uncached symbols from DB (batched to avoid timeout)
        rows = []
        batch_size = 500  # Process 500 symbols at a time
        symbols_to_fetch = list(uncached_symbols)

        async with pool.acquire() as conn:
            if len(uncached_symbols) == len(all_symbols):
                # Fetch all - single bulk query (no WHERE clause is faster)
                rows = await conn.fetch("""
                    SELECT
                        t.id, t.symbol, t.name, t.suffix,
                        l.ltp, l.open, l.high, l.low, l.close, l.percent_change, l.trade_volume,
                        f.market_cap, f.trailing_pe
                    FROM tickers t
                    LEFT JOIN ltp_live l ON t.id = l.ticker_id
                    LEFT JOIN stock_fundamentals f ON t.id = f.ticker_id
                    ORDER BY t.id
                """, timeout=180)
            else:
                # Fetch in batches to avoid timeout
                for i in range(0, len(symbols_to_fetch), batch_size):
                    batch = symbols_to_fetch[i:i + batch_size]
                    batch_rows = await conn.fetch("""
                        SELECT
                            t.id, t.symbol, t.name, t.suffix,
                            l.ltp, l.open, l.high, l.low, l.close, l.percent_change, l.trade_volume,
                            f.market_cap, f.trailing_pe
                        FROM tickers t
                        LEFT JOIN ltp_live l ON t.id = l.ticker_id
                        LEFT JOIN stock_fundamentals f ON t.id = f.ticker_id
                        WHERE t.symbol = ANY($1::text[])
                        ORDER BY t.id
                    """, batch, timeout=60)
                    rows.extend(batch_rows)

        fetch_time = time.perf_counter() - start
        print(f"[Prewarm] Fetched {len(rows)} quotes from DB in {fetch_time:.2f}s")

        # Step 5: Build quote objects
        quotes = {}
        for row in rows:
            ltp = float(row["ltp"]) if row["ltp"] else 0
            close = float(row["close"]) if row["close"] else ltp
            percent_change = float(row["percent_change"]) if row["percent_change"] else 0
            change = ltp - close

            quotes[row["symbol"]] = {
                "symbol": row["symbol"],
                "name": row["name"],
                "price": ltp,
                "change": round(change, 2),
                "changePercent": round(percent_change, 2),
                "open": float(row["open"]) if row["open"] else 0,
                "high": float(row["high"]) if row["high"] else 0,
                "low": float(row["low"]) if row["low"] else 0,
                "volume": int(row["trade_volume"]) if row["trade_volume"] else 0,
                "marketCap": int(row["market_cap"]) if row["market_cap"] else 0,
                "pe": float(row["trailing_pe"]) if row["trailing_pe"] else None,
                "isIndex": row["suffix"] == "-INDEX",
            }

        # Step 6: Redis pipeline - single round trip for all quotes
        ttl = 300  # 5 minutes
        pipe = redis_client.pipeline()
        for symbol, data in quotes.items():
            key = f"quote:{symbol}"
            pipe.setex(key, ttl, json.dumps(data, default=str))
        await pipe.execute()

        total_time = time.perf_counter() - start
        from_cache = len(all_symbols) - len(uncached_symbols)
        print(f"[Prewarm] Cached {len(quotes)} quotes in {total_time:.2f}s (from_cache: {from_cache}, from_db: {len(quotes)})")

        return {
            "count": len(all_symbols),
            "time_seconds": round(total_time, 2),
            "from_cache": from_cache,
            "from_db": len(quotes),
        }

    except Exception as e:
        import traceback
        print(f"[Prewarm] Quote prewarming failed: {type(e).__name__}: {e}")
        traceback.print_exc()
        return {"count": 0, "time_seconds": 0, "error": f"{type(e).__name__}: {e}"}


async def prewarm_indices(pool, redis_client=None, force: bool = False) -> Dict[str, Any]:
    """
    Prewarm indices cache.

    Smart prewarming: checks Redis TTL first.

    Args:
        pool: asyncpg connection pool
        redis_client: Optional Redis client
        force: If True, bypass cache check

    Returns:
        Dict with stats
    """
    start = time.perf_counter()

    if redis_client is None:
        redis_client = await redis_cache.get_redis()

    try:
        # Check if cache is still fresh
        if not force:
            ttl = await redis_client.ttl("indices:all")
            if ttl and ttl > MIN_TTL_FRESH:
                check_time = time.perf_counter() - start
                print(f"[Prewarm] Indices cache fresh (TTL: {ttl}s) - skipping DB fetch")
                return {
                    "count": 0,
                    "time_seconds": round(check_time, 2),
                    "skipped": True,
                    "remaining_ttl": ttl,
                }

        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT DISTINCT ON (UPPER(t.symbol))
                    t.symbol, t.name,
                    l.ltp, l.close, l.percent_change, l.open, l.high, l.low, l.trade_volume
                FROM tickers t
                LEFT JOIN ltp_live l ON t.id = l.ticker_id
                WHERE t.suffix = '-INDEX'
                ORDER BY UPPER(t.symbol), l.timestamp DESC NULLS LAST
            """, timeout=30)

        indices = []
        for row in rows:
            ltp = float(row["ltp"]) if row["ltp"] else 0
            close = float(row["close"]) if row["close"] else ltp
            percent_change = float(row["percent_change"]) if row["percent_change"] else 0
            change = ltp - close

            indices.append({
                "symbol": row["symbol"],
                "name": row["name"],
                "price": ltp,
                "change": round(change, 2),
                "changePercent": round(percent_change, 2),
                "open": float(row["open"]) if row["open"] else 0,
                "high": float(row["high"]) if row["high"] else 0,
                "low": float(row["low"]) if row["low"] else 0,
                "volume": int(row["trade_volume"]) if row["trade_volume"] else 0,
            })

        # Cache indices
        ttl = 300  # 5 minutes
        await redis_client.setex("indices:all", ttl, json.dumps(indices, default=str))

        total_time = time.perf_counter() - start
        print(f"[Prewarm] Cached {len(indices)} indices in {total_time:.2f}s")

        return {"count": len(indices), "time_seconds": round(total_time, 2), "from_db": len(indices)}

    except Exception as e:
        print(f"[Prewarm] Indices prewarming failed: {e}")
        return {"count": 0, "time_seconds": 0, "error": str(e)}


async def prewarm_market_movers(pool, redis_client=None, force: bool = False) -> Dict[str, Any]:
    """
    Prewarm market movers (top gainers/losers) cache.

    Smart prewarming: checks Redis TTL first.

    Args:
        pool: asyncpg connection pool
        redis_client: Optional Redis client
        force: If True, bypass cache check

    Returns:
        Dict with stats
    """
    start = time.perf_counter()

    if redis_client is None:
        redis_client = await redis_cache.get_redis()

    try:
        # Check if cache is still fresh
        if not force:
            ttl = await redis_client.ttl("movers:all")
            if ttl and ttl > MIN_TTL_FRESH:
                check_time = time.perf_counter() - start
                print(f"[Prewarm] Movers cache fresh (TTL: {ttl}s) - skipping DB fetch")
                return {
                    "count": 0,
                    "time_seconds": round(check_time, 2),
                    "skipped": True,
                    "remaining_ttl": ttl,
                }

        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT
                    symbol, ltp, change_amount, change_percent, trade_volume, category
                FROM market_movers_live
                ORDER BY category, ABS(change_percent) DESC
            """, timeout=30)

        gainers = []
        losers = []

        for row in rows:
            mover = {
                "symbol": row["symbol"],
                "price": float(row["ltp"]) if row["ltp"] else 0,
                "change": float(row["change_amount"]) if row["change_amount"] else 0,
                "changePercent": float(row["change_percent"]) if row["change_percent"] else 0,
                "volume": int(row["trade_volume"]) if row["trade_volume"] else 0,
            }

            if row["category"] == "GAINER":
                gainers.append(mover)
            else:
                losers.append(mover)

        # Cache movers
        ttl = 300  # 5 minutes
        pipe = redis_client.pipeline()
        pipe.setex("movers:gainers", ttl, json.dumps(gainers, default=str))
        pipe.setex("movers:losers", ttl, json.dumps(losers, default=str))
        pipe.setex("movers:all", ttl, json.dumps({"gainers": gainers, "losers": losers}, default=str))
        await pipe.execute()

        total_time = time.perf_counter() - start
        total_count = len(gainers) + len(losers)
        print(f"[Prewarm] Cached {total_count} movers in {total_time:.2f}s")

        return {"count": total_count, "time_seconds": round(total_time, 2), "from_db": total_count}

    except Exception as e:
        print(f"[Prewarm] Market movers prewarming failed: {e}")
        return {"count": 0, "time_seconds": 0, "error": str(e)}


async def prewarm_search_index(pool, redis_client=None, force: bool = False) -> Dict[str, Any]:
    """
    Prewarm search index for all tickers.

    Caches the full ticker list for fast search autocomplete.
    Has longest TTL (1 hour) since ticker list rarely changes.

    Args:
        pool: asyncpg connection pool
        redis_client: Optional Redis client
        force: If True, bypass cache check

    Returns:
        Dict with stats
    """
    start = time.perf_counter()

    if redis_client is None:
        redis_client = await redis_cache.get_redis()

    try:
        # Check if cache is still fresh (search index has long TTL)
        if not force:
            ttl = await redis_client.ttl("search:all_tickers")
            if ttl and ttl > 300:  # More than 5 min remaining = skip
                check_time = time.perf_counter() - start
                print(f"[Prewarm] Search index cache fresh (TTL: {ttl}s) - skipping DB fetch")
                return {
                    "count": 0,
                    "time_seconds": round(check_time, 2),
                    "skipped": True,
                    "remaining_ttl": ttl,
                }

        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT symbol, name, sector, industry, suffix
                FROM tickers
                ORDER BY symbol
            """, timeout=30)

        tickers = []
        for row in rows:
            tickers.append({
                "symbol": row["symbol"],
                "name": row["name"],
                "sector": row["sector"],
                "industry": row["industry"],
                "isIndex": row["suffix"] == "-INDEX",
            })

        # Cache full ticker list for search
        ttl = 3600  # 1 hour (rarely changes)
        await redis_client.setex("search:all_tickers", ttl, json.dumps(tickers, default=str))

        total_time = time.perf_counter() - start
        print(f"[Prewarm] Cached {len(tickers)} tickers for search in {total_time:.2f}s")

        return {"count": len(tickers), "time_seconds": round(total_time, 2), "from_db": len(tickers)}

    except Exception as e:
        print(f"[Prewarm] Search index prewarming failed: {e}")
        return {"count": 0, "time_seconds": 0, "error": str(e)}


async def full_prewarm(
    pool,
    redis_client=None,
    include_ohlcv: bool = True,
    ohlcv_periods: List[str] = None,
    force: bool = False
) -> Dict[str, Any]:
    """
    Complete cache prewarming at application startup.

    Smart prewarming: checks Redis first, only fetches expired/missing from DB.
    Runs all prewarming tasks in parallel for maximum speed.
    Target: <60 seconds for cold start, <1 second if cache is fresh.

    Args:
        pool: asyncpg connection pool
        redis_client: Optional Redis client
        include_ohlcv: Whether to include OHLCV prewarming (slower)
        ohlcv_periods: OHLCV periods to prewarm
        force: If True, bypass all cache checks and fetch everything from DB

    Returns:
        Dict with all stats
    """
    start = time.perf_counter()

    if redis_client is None:
        redis_client = await redis_cache.get_redis()

    if ohlcv_periods is None:
        ohlcv_periods = ["6mo", "1y", "2y"]

    mode = "FORCE" if force else "SMART"
    print(f"[Prewarm] Starting full cache prewarm (mode: {mode})...")

    # Run quote, indices, movers, and search in parallel
    tasks = [
        prewarm_all_quotes(pool, redis_client, force=force),
        prewarm_indices(pool, redis_client, force=force),
        prewarm_market_movers(pool, redis_client, force=force),
        prewarm_search_index(pool, redis_client, force=force),
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    stats = {
        "quotes": results[0] if not isinstance(results[0], Exception) else {"error": str(results[0])},
        "indices": results[1] if not isinstance(results[1], Exception) else {"error": str(results[1])},
        "movers": results[2] if not isinstance(results[2], Exception) else {"error": str(results[2])},
        "search": results[3] if not isinstance(results[3], Exception) else {"error": str(results[3])},
    }

    # Count items skipped vs fetched from DB
    total_skipped = sum(
        1 for r in [stats["quotes"], stats["indices"], stats["movers"], stats["search"]]
        if isinstance(r, dict) and r.get("skipped")
    )
    total_from_db = sum(
        r.get("from_db", 0) for r in [stats["quotes"], stats["indices"], stats["movers"], stats["search"]]
        if isinstance(r, dict)
    )

    # OHLCV prewarming is separate (uses advanced_screener)
    if include_ohlcv:
        try:
            from advanced_screener import preload_ohlcv_cache
            ohlcv_stats = await preload_ohlcv_cache(pool, periods=ohlcv_periods)
            stats["ohlcv"] = ohlcv_stats
        except Exception as e:
            print(f"[Prewarm] OHLCV prewarming failed: {e}")
            stats["ohlcv"] = {"error": str(e)}

    total_time = time.perf_counter() - start
    stats["total_time_seconds"] = round(total_time, 2)
    stats["success"] = total_time < 120  # Success if under 2 minutes
    stats["mode"] = mode
    stats["categories_skipped"] = total_skipped
    stats["items_from_db"] = total_from_db

    if total_skipped == 4:
        print(f"[Prewarm] All cache fresh - completed in {total_time:.2f}s (no DB queries)")
    else:
        print(f"[Prewarm] Completed in {total_time:.2f}s ({total_skipped}/4 categories skipped, {total_from_db} items from DB)")

    return stats


async def quick_prewarm(pool, redis_client=None, force: bool = False) -> Dict[str, Any]:
    """
    Quick cache prewarming (quotes, indices, movers only).

    Skips OHLCV which takes longer. Use this for fast restarts.
    Target: <15 seconds cold start, <1 second if cache is fresh.

    Args:
        pool: asyncpg connection pool
        redis_client: Optional Redis client
        force: If True, bypass cache checks

    Returns:
        Dict with stats
    """
    return await full_prewarm(pool, redis_client, include_ohlcv=False, force=force)


async def minimal_prewarm(pool, redis_client=None, force: bool = False) -> Dict[str, Any]:
    """
    Minimal startup prewarming - only essentials, NO quotes.

    This is optimized for fast startup (<15 seconds). Caches:
    - Indices (56 items)
    - Market movers (20 items)
    - Search index (3014 symbols, lightweight)

    Quotes are cached via Celery background task to avoid worker timeouts.

    Args:
        pool: asyncpg connection pool
        redis_client: Optional Redis client
        force: If True, bypass cache checks

    Returns:
        Dict with stats
    """
    start = time.perf_counter()

    if redis_client is None:
        redis_client = await redis_cache.get_redis()

    mode = "FORCE" if force else "SMART"
    print(f"[Prewarm] Starting minimal prewarm (mode: {mode})...")

    # Only run indices, movers, search - NO quotes (handled by Celery)
    tasks = [
        prewarm_indices(pool, redis_client, force=force),
        prewarm_market_movers(pool, redis_client, force=force),
        prewarm_search_index(pool, redis_client, force=force),
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    stats = {
        "indices": results[0] if not isinstance(results[0], Exception) else {"error": str(results[0])},
        "movers": results[1] if not isinstance(results[1], Exception) else {"error": str(results[1])},
        "search": results[2] if not isinstance(results[2], Exception) else {"error": str(results[2])},
        "quotes": {"skipped": True, "reason": "delegated to Celery"},
    }

    total_skipped = sum(
        1 for r in [stats["indices"], stats["movers"], stats["search"]]
        if isinstance(r, dict) and r.get("skipped")
    )
    total_from_db = sum(
        r.get("from_db", 0) for r in [stats["indices"], stats["movers"], stats["search"]]
        if isinstance(r, dict)
    )

    total_time = time.perf_counter() - start
    stats["total_time_seconds"] = round(total_time, 2)
    stats["success"] = True
    stats["mode"] = mode
    stats["categories_skipped"] = total_skipped
    stats["items_from_db"] = total_from_db

    if total_skipped == 3:
        print(f"[Prewarm] All cache fresh - completed in {total_time:.2f}s")
    else:
        print(f"[Prewarm] Minimal prewarm done in {total_time:.2f}s ({total_from_db} items from DB)")

    return stats


async def smart_prewarm(pool, redis_client=None) -> Dict[str, Any]:
    """
    Smart prewarming - minimal startup, quotes via Celery.

    Uses minimal_prewarm (no quotes) to prevent worker timeouts.
    Quotes are cached via background Celery task.

    Args:
        pool: asyncpg connection pool
        redis_client: Optional Redis client

    Returns:
        Dict with stats
    """
    return await minimal_prewarm(pool, redis_client, force=False)


async def force_prewarm(pool, redis_client=None) -> Dict[str, Any]:
    """
    Force full prewarming - ignores cache, fetches everything from DB.

    Use this when you know the DB has been updated and you want to
    refresh all Redis cache. Slower but ensures fresh data.

    Args:
        pool: asyncpg connection pool
        redis_client: Optional Redis client

    Returns:
        Dict with stats
    """
    return await full_prewarm(pool, redis_client, include_ohlcv=True, force=True)


# Export functions
__all__ = [
    "prewarm_all_quotes",
    "prewarm_indices",
    "prewarm_market_movers",
    "prewarm_search_index",
    "full_prewarm",
    "quick_prewarm",
    "minimal_prewarm",
    "smart_prewarm",
    "force_prewarm",
    "check_cache_freshness",
    "get_uncached_symbols",
]
