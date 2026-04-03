# Redis Caching Setup Guide

Complete guide for setting up Redis caching layer to optimize Tiphub for 50K concurrent users.

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Python Integration](#python-integration)
4. [Caching Strategy](#caching-strategy)
5. [Configuration](#configuration)
6. [Monitoring](#monitoring)
7. [Troubleshooting](#troubleshooting)

---

## Overview

### Why Redis?

Redis provides an in-memory caching layer that dramatically reduces database load and improves response times:

- **Performance:** Sub-millisecond response times vs 200-500ms database queries
- **Scalability:** Reduces database connections from 50K users to manageable levels
- **Flexibility:** TTL-based expiration, key patterns, and data structures
- **Reliability:** Persistence options, replication, and high availability

### Expected Improvements

| Metric | Before Redis | After Redis | Improvement |
|--------|--------------|-------------|-------------|
| Stock Detail Load | 2-5s | 100-300ms | **90% faster** |
| Technical Indicators | 200-500ms | 10-50ms | **80-95% faster** |
| Market Movers | 50-100ms | 5-10ms | **90% faster** |
| Sentiment Analysis | 3-10s | 100-500ms | **95% faster** |
| Cache Hit Rate | 0% | 70-80% | N/A |
| Database Load | 100% | 20-30% | **70% reduction** |

---

## Installation

### Windows

**Option A: WSL2 (Recommended)**

```bash
# Install WSL2 and Ubuntu
wsl --install

# Inside WSL2, install Redis
sudo apt update
sudo apt install redis-server

# Start Redis
sudo service redis-server start

# Verify installation
redis-cli ping
# Should respond: PONG
```

**Option B: Windows Native (Memurai)**

Memurai is a Windows port of Redis:

1. Download from: https://www.memurai.com/get-memurai
2. Run installer: `memurai-4.0.6-x64.msi`
3. Redis will run as Windows service on `localhost:6379`
4. Verify: `memurai-cli ping`

**Option C: Docker**

```bash
# Install Docker Desktop for Windows
# Then run Redis container:
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Verify
docker exec -it redis redis-cli ping
```

### macOS

**Option A: Homebrew (Recommended)**

```bash
# Install Redis
brew install redis

# Start Redis as a service
brew services start redis

# Or run in foreground
redis-server

# Verify installation
redis-cli ping
```

**Option B: Docker**

```bash
# Install Docker Desktop for Mac
# Then run Redis container:
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Verify
docker exec -it redis redis-cli ping
```

### Linux (Ubuntu/Debian)

```bash
# Update package list
sudo apt update

# Install Redis
sudo apt install redis-server

# Configure Redis to run as systemd service
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Verify installation
redis-cli ping
# Should respond: PONG

# Check status
sudo systemctl status redis-server
```

### Production Configuration

Edit `/etc/redis/redis.conf` (Linux) or `C:\Program Files\Memurai\memurai.conf` (Windows):

```conf
# Bind to localhost only (change for remote access)
bind 127.0.0.1

# Set password (IMPORTANT for production!)
requirepass your_secure_password_here

# Set max memory (adjust based on available RAM)
maxmemory 2gb

# Eviction policy: remove least recently used keys when memory limit reached
maxmemory-policy allkeys-lru

# Enable persistence (optional, for durability)
save 900 1      # Save after 900s if at least 1 key changed
save 300 10     # Save after 300s if at least 10 keys changed
save 60 10000   # Save after 60s if at least 10000 keys changed

# Append-only file (AOF) for better durability
appendonly yes
appendfilename "appendonly.aof"

# Log level
loglevel notice
logfile /var/log/redis/redis-server.log
```

Restart Redis after configuration changes:

```bash
# Linux
sudo systemctl restart redis-server

# macOS
brew services restart redis

# Windows (Memurai)
net stop memurai
net start memurai

# Docker
docker restart redis
```

---

## Python Integration

### Install redis-py

```bash
pip install redis
```

### Basic Connection

**File: `server/redis_client.py`** (create new file)

```python
"""
Redis client singleton for caching layer.

Provides a single Redis connection pool shared across the application.
"""

import redis
import logging
import json
from typing import Any, Optional
from functools import wraps
import hashlib

logger = logging.getLogger(__name__)

# Redis connection configuration
REDIS_CONFIG = {
    'host': 'localhost',
    'port': 6379,
    'password': None,  # Set in production!
    'db': 0,
    'decode_responses': True,  # Automatically decode bytes to strings
    'socket_connect_timeout': 5,
    'socket_timeout': 5,
    'retry_on_timeout': True,
    'max_connections': 50
}

# Initialize connection pool (lazy loading)
_redis_pool = None
_redis_client = None


def get_redis_client() -> redis.Redis:
    """
    Get Redis client instance (singleton pattern with connection pooling).

    Returns:
        redis.Redis: Redis client instance
    """
    global _redis_pool, _redis_client

    if _redis_client is None:
        try:
            _redis_pool = redis.ConnectionPool(**REDIS_CONFIG)
            _redis_client = redis.Redis(connection_pool=_redis_pool)

            # Test connection
            _redis_client.ping()
            logger.info("✓ Redis connection established successfully")

        except redis.ConnectionError as e:
            logger.error(f"✗ Failed to connect to Redis: {e}")
            logger.warning("⚠ Continuing without caching (Redis unavailable)")
            _redis_client = None

    return _redis_client


def redis_cache(ttl: int = 300, key_prefix: str = ""):
    """
    Decorator for caching function results in Redis.

    Args:
        ttl: Time-to-live in seconds (default: 5 minutes)
        key_prefix: Prefix for cache keys (e.g., "api:technical-indicators")

    Usage:
        @redis_cache(ttl=300, key_prefix="api:technical-indicators")
        def get_technical_indicators(ticker_symbol: str):
            # Expensive calculation here
            return indicators
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            client = get_redis_client()

            # If Redis unavailable, skip caching
            if client is None:
                logger.debug(f"Redis unavailable, skipping cache for {func.__name__}")
                return func(*args, **kwargs)

            # Generate cache key from function name and arguments
            key_parts = [key_prefix, func.__name__]

            # Add positional arguments
            for arg in args:
                if isinstance(arg, (str, int, float, bool)):
                    key_parts.append(str(arg))

            # Add keyword arguments (sorted for consistency)
            for k, v in sorted(kwargs.items()):
                if isinstance(v, (str, int, float, bool)):
                    key_parts.append(f"{k}={v}")

            cache_key = ":".join(key_parts)

            # Try to get from cache
            try:
                cached = client.get(cache_key)
                if cached:
                    logger.debug(f"Cache HIT: {cache_key}")
                    return json.loads(cached)
            except Exception as e:
                logger.warning(f"Cache read error: {e}")

            # Cache miss - execute function
            logger.debug(f"Cache MISS: {cache_key}")
            result = func(*args, **kwargs)

            # Store in cache
            try:
                client.setex(cache_key, ttl, json.dumps(result))
                logger.debug(f"Cached result with TTL={ttl}s: {cache_key}")
            except Exception as e:
                logger.warning(f"Cache write error: {e}")

            return result

        return wrapper
    return decorator


def invalidate_cache(pattern: str):
    """
    Invalidate cache keys matching a pattern.

    Args:
        pattern: Redis key pattern (e.g., "api:technical-indicators:AAPL*")

    Example:
        # Invalidate all technical indicator caches for AAPL
        invalidate_cache("api:technical-indicators:AAPL*")
    """
    client = get_redis_client()
    if client is None:
        return

    try:
        keys = client.keys(pattern)
        if keys:
            client.delete(*keys)
            logger.info(f"Invalidated {len(keys)} cache keys matching: {pattern}")
    except Exception as e:
        logger.error(f"Cache invalidation error: {e}")


def get_cache_stats() -> dict:
    """
    Get Redis cache statistics.

    Returns:
        dict: Statistics including memory usage, hit rate, etc.
    """
    client = get_redis_client()
    if client is None:
        return {"error": "Redis unavailable"}

    try:
        info = client.info()
        stats = client.info('stats')

        total_hits = stats.get('keyspace_hits', 0)
        total_misses = stats.get('keyspace_misses', 0)
        total_requests = total_hits + total_misses
        hit_rate = (total_hits / total_requests * 100) if total_requests > 0 else 0

        return {
            "connected": True,
            "memory_used_mb": round(info.get('used_memory', 0) / 1024 / 1024, 2),
            "memory_peak_mb": round(info.get('used_memory_peak', 0) / 1024 / 1024, 2),
            "total_keys": sum([db.get('keys', 0) for db in info.get('db0', {}).values()]) if 'db0' in info else 0,
            "hit_rate_percent": round(hit_rate, 2),
            "total_hits": total_hits,
            "total_misses": total_misses,
            "connected_clients": info.get('connected_clients', 0),
            "uptime_days": round(info.get('uptime_in_seconds', 0) / 86400, 2)
        }
    except Exception as e:
        logger.error(f"Error getting cache stats: {e}")
        return {"error": str(e)}
```

---

## Caching Strategy

### Cache Key Naming Convention

Use hierarchical, descriptive keys:

```
{namespace}:{entity}:{identifier}:{sub-key}

Examples:
- api:technical-indicators:AAPL
- api:sentiment:TSLA:articles
- api:market-movers:GAINER
- api:stock-ltp:RELIANCE
- api:price-chart:AAPL:1hour:6mo
```

### TTL Guidelines by Endpoint

| Endpoint | TTL | Reasoning |
|----------|-----|-----------|
| `/api/technical-indicators/{ticker}` | 5 min (300s) | Calculated from hourly data, no need for real-time |
| `/api/sentiment-analysis` | 1 hour (3600s) | News articles don't change frequently |
| `/api/market-movers` | 1 min (60s) | Market data changes frequently during trading hours |
| `/api/stock-ltp/{ticker}` | 10 sec (10s) | Real-time price data needs freshness |
| `/api/price-chart/{ticker}` | 10 min (600s) | Historical data changes slowly |
| `/api/stocks` (fundamentals) | 1 day (86400s) | Fundamentals updated weekly |
| Expert Screener results | 10 min (600s) | Expensive calculation, medium freshness requirement |
| `/api/stock-detail/{ticker}` | 5 min (300s) | Combined data, balance freshness and performance |

### Cache Implementation Examples

#### 1. Technical Indicators (main.py)

```python
from redis_client import redis_cache

@fastapi_app.get("/api/technical-indicators/{ticker_symbol}")
@redis_cache(ttl=300, key_prefix="api:technical-indicators")
async def get_technical_indicators(ticker_symbol: str):
    """
    Calculate technical indicators with Redis caching.
    Cache for 5 minutes since data is based on hourly OHLC.
    """
    from indicator_calculator import calculate_all_indicators

    conn = get_db_connection()
    clean_symbol = ticker_symbol.replace('.NS', '').upper()

    # Get ticker_id
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM tickers WHERE UPPER(symbol) = %s AND is_active = true LIMIT 1", [clean_symbol])
    result = cursor.fetchone()

    if not result:
        raise HTTPException(status_code=404, detail=f"Ticker '{ticker_symbol}' not found")

    ticker_id = result[0]
    cursor.close()

    # Fetch 250 days of hourly OHLC data
    end_date = datetime.now()
    start_date = end_date - timedelta(days=250)

    accessor = TimeframeDataAccessor(conn)
    data = accessor.fetch_ohlc(ticker_id, timeframe='1hour', start_date=start_date, end_date=end_date)

    if not data or len(data) < 50:
        raise HTTPException(status_code=404, detail=f"Insufficient OHLC data for {ticker_symbol}")

    # Calculate indicators
    df = pd.DataFrame(data)
    indicators = calculate_all_indicators(df)

    # Get latest timestamp
    latest_timestamp = df['timestamp'].max() if not df.empty else None

    conn.close()

    return {
        "ticker": ticker_symbol,
        "as_of": latest_timestamp.isoformat() if latest_timestamp else None,
        "data_points": len(df),
        "indicators": indicators
    }
```

#### 2. Market Movers

```python
@fastapi_app.get("/api/market-movers")
@redis_cache(ttl=60, key_prefix="api:market-movers")
async def get_market_movers(
    category: str = Query('GAINER', regex='^(GAINER|LOSER)$'),
    limit: int = Query(10, ge=1, le=20)
):
    """
    Get top market movers with 1-minute caching.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    query = """
        SELECT
            ticker_id, symbol, ltp, change_percent, change_amount, volume, rank
        FROM market_movers_live
        WHERE category = %s
        ORDER BY rank ASC
        LIMIT %s
    """

    cursor.execute(query, [category, limit])
    results = cursor.fetchall()

    movers = []
    for row in results:
        movers.append({
            "ticker_id": row[0],
            "symbol": row[1],
            "ltp": float(row[2]),
            "change_percent": float(row[3]),
            "change_amount": float(row[4]),
            "volume": int(row[5]) if row[5] else None,
            "rank": row[6]
        })

    cursor.close()
    conn.close()

    return {"category": category, "movers": movers, "count": len(movers)}
```

#### 3. Sentiment Analysis (with invalidation)

```python
@fastapi_app.post("/api/sentiment-analysis")
@redis_cache(ttl=3600, key_prefix="api:sentiment")
async def analyze_sentiment(request: SentimentRequest):
    """
    Sentiment analysis with 1-hour caching.
    Heavy ML inference (3-10s) benefits greatly from caching.
    """
    ticker = request.ticker

    # Expensive ML inference
    sentiment_results = perform_sentiment_analysis(ticker)

    return sentiment_results


# Invalidate cache when new articles are fetched
def refresh_sentiment_cache(ticker: str):
    """Called by background job that fetches new articles"""
    from redis_client import invalidate_cache
    invalidate_cache(f"api:sentiment:{ticker}*")
```

#### 4. Expert Screener (conditional caching)

```python
@fastapi_app.post("/expert-screener/run")
async def run_expert_screener(request: ScreenerRequest):
    """
    Expert screener with conditional caching.
    Cache based on expression + symbols + timeframe.
    """
    from redis_client import get_redis_client
    import hashlib

    # Generate cache key from request parameters
    cache_key_data = f"{request.expression}:{','.join(sorted(request.symbols))}:{request.timeframe}:{request.period}"
    cache_key_hash = hashlib.md5(cache_key_data.encode()).hexdigest()
    cache_key = f"expert-screener:results:{cache_key_hash}"

    client = get_redis_client()

    # Try cache first
    if client:
        try:
            cached = client.get(cache_key)
            if cached:
                logger.info(f"Returning cached screener results: {cache_key}")
                return json.loads(cached)
        except Exception as e:
            logger.warning(f"Cache read error: {e}")

    # Run expensive screener calculation (20-180s)
    results = expert_screener.run_screen(
        expression=request.expression,
        symbols=request.symbols,
        timeframe=request.timeframe,
        period=request.period
    )

    # Cache for 10 minutes
    if client:
        try:
            client.setex(cache_key, 600, json.dumps(results))
        except Exception as e:
            logger.warning(f"Cache write error: {e}")

    return results
```

---

## Configuration

### Environment Variables

Add to `.env`:

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_secure_password  # Leave empty for local dev
REDIS_DB=0
REDIS_MAX_CONNECTIONS=50

# Cache Settings
CACHE_ENABLED=true  # Set to false to disable caching
CACHE_DEFAULT_TTL=300  # Default TTL in seconds
```

### Update redis_client.py to use env vars:

```python
import os
from dotenv import load_dotenv

load_dotenv()

REDIS_CONFIG = {
    'host': os.getenv('REDIS_HOST', 'localhost'),
    'port': int(os.getenv('REDIS_PORT', 6379)),
    'password': os.getenv('REDIS_PASSWORD', None),
    'db': int(os.getenv('REDIS_DB', 0)),
    'decode_responses': True,
    'socket_connect_timeout': 5,
    'socket_timeout': 5,
    'retry_on_timeout': True,
    'max_connections': int(os.getenv('REDIS_MAX_CONNECTIONS', 50))
}

CACHE_ENABLED = os.getenv('CACHE_ENABLED', 'true').lower() == 'true'
```

### Memory Configuration

Adjust based on expected cache size:

```bash
# Calculate required memory
# Formula: (avg_value_size * num_keys * 1.5) for overhead

# Example:
# - Technical indicators per stock: ~2 KB
# - 3,000 stocks cached
# - Memory needed: 2 KB * 3000 * 1.5 = 9 MB

# Add caches for other endpoints:
# - Market movers: 1 MB
# - Sentiment: 50 MB (with articles)
# - Price charts: 100 MB
# - Stock fundamentals: 50 MB

# Total estimated: ~200 MB
# Recommended: 512 MB - 1 GB (allows headroom)
```

Set in `redis.conf`:

```conf
maxmemory 1gb
maxmemory-policy allkeys-lru
```

---

## Monitoring

### Redis CLI Commands

```bash
# Connect to Redis
redis-cli

# Authentication (if password set)
AUTH your_password

# Check memory usage
INFO memory

# Check hit rate
INFO stats

# List all keys (use with caution in production!)
KEYS *

# List keys by pattern
KEYS api:technical-indicators:*

# Get key TTL (time to live)
TTL api:technical-indicators:AAPL

# Get value
GET api:technical-indicators:AAPL

# Delete key
DEL api:technical-indicators:AAPL

# Flush all keys (DANGEROUS!)
FLUSHALL
```

### Cache Statistics Endpoint

Add to `main.py`:

```python
@fastapi_app.get("/api/cache/stats")
async def get_cache_statistics():
    """
    Get Redis cache statistics for monitoring.
    """
    from redis_client import get_cache_stats

    stats = get_cache_stats()
    return stats
```

Example response:

```json
{
  "connected": true,
  "memory_used_mb": 45.23,
  "memory_peak_mb": 67.89,
  "total_keys": 1247,
  "hit_rate_percent": 78.34,
  "total_hits": 45231,
  "total_misses": 12543,
  "connected_clients": 8,
  "uptime_days": 3.45
}
```

### Monitoring Dashboard

Use **RedisInsight** for visual monitoring:

1. Download: https://redis.io/insight/
2. Install and connect to your Redis instance
3. Monitor:
   - Memory usage trends
   - Hit/miss rates
   - Key patterns and sizes
   - Slow queries

### Logging

Add cache logging to track performance:

```python
# In redis_client.py decorator
logger.info(f"Cache HIT: {cache_key} (saved {execution_time}ms)")
logger.info(f"Cache MISS: {cache_key} (computed in {execution_time}ms)")
```

Monitor logs for:
- Cache hit rate by endpoint
- Most frequently cached keys
- Cache errors or connection issues

---

## Troubleshooting

### Common Issues

#### 1. Redis Not Starting

**Symptoms:** `Could not connect to Redis at 127.0.0.1:6379: Connection refused`

**Solutions:**

```bash
# Linux: Check status and logs
sudo systemctl status redis-server
sudo journalctl -u redis-server -n 50

# Start if stopped
sudo systemctl start redis-server

# macOS: Check and restart
brew services list
brew services restart redis

# Windows (Memurai): Check service
net start memurai

# Docker: Check container
docker ps -a
docker logs redis
docker start redis
```

#### 2. Out of Memory

**Symptoms:** `OOM command not allowed when used memory > 'maxmemory'`

**Solutions:**

```bash
# Check current memory usage
redis-cli INFO memory

# Option A: Increase maxmemory in redis.conf
maxmemory 2gb

# Option B: Enable eviction policy
maxmemory-policy allkeys-lru

# Option C: Flush unused keys
redis-cli FLUSHDB

# Restart Redis
sudo systemctl restart redis-server
```

#### 3. Slow Performance

**Symptoms:** Cache reads taking >10ms

**Solutions:**

```bash
# Check slow log
redis-cli SLOWLOG GET 10

# Monitor real-time commands
redis-cli MONITOR

# Check for large keys
redis-cli --bigkeys

# Optimize key patterns (avoid KEYS * in production)
# Use SCAN instead of KEYS for production key iteration
```

#### 4. Connection Timeouts

**Symptoms:** `TimeoutError: Timeout reading from socket`

**Solutions:**

```python
# Increase timeouts in REDIS_CONFIG
REDIS_CONFIG = {
    'socket_connect_timeout': 10,  # Increase from 5
    'socket_timeout': 10,
    'retry_on_timeout': True,
    'max_connections': 100  # Increase pool size
}
```

#### 5. Cache Inconsistency

**Symptoms:** Stale data returned after database updates

**Solutions:**

```python
# Strategy 1: Shorter TTLs for frequently updated data
@redis_cache(ttl=60, key_prefix="api:market-movers")

# Strategy 2: Manual cache invalidation after updates
from redis_client import invalidate_cache

def update_stock_fundamentals(ticker_id):
    # Update database...

    # Invalidate related caches
    invalidate_cache(f"api:stock-detail:*")
    invalidate_cache(f"api:stocks:*")

# Strategy 3: Use Redis pub/sub for real-time invalidation
```

#### 6. High Memory Usage

**Symptoms:** Redis consuming more RAM than expected

**Solutions:**

```bash
# 1. Analyze memory usage by key pattern
redis-cli --bigkeys

# 2. Check memory info
redis-cli INFO memory

# 3. Sample keys to find large values
redis-cli --memkeys

# 4. Reduce TTLs for less critical data
# 5. Implement size limits in application code
# 6. Enable compression (at application level, not Redis)
```

### Testing Cache Performance

```python
# Add to main.py for testing
@fastapi_app.get("/api/test/cache-performance")
async def test_cache_performance(ticker: str = "AAPL", iterations: int = 10):
    """
    Test cache performance vs direct database query.
    """
    import time
    from redis_client import invalidate_cache

    # Clear cache
    invalidate_cache(f"api:technical-indicators:{ticker}")

    # Measure cold start (cache miss)
    start = time.time()
    result1 = await get_technical_indicators(ticker)
    cold_time = (time.time() - start) * 1000

    # Measure warm requests (cache hits)
    warm_times = []
    for _ in range(iterations):
        start = time.time()
        result2 = await get_technical_indicators(ticker)
        warm_times.append((time.time() - start) * 1000)

    avg_warm_time = sum(warm_times) / len(warm_times)

    return {
        "ticker": ticker,
        "cold_start_ms": round(cold_time, 2),
        "warm_average_ms": round(avg_warm_time, 2),
        "speedup": round(cold_time / avg_warm_time, 2),
        "improvement_percent": round((1 - avg_warm_time / cold_time) * 100, 2)
    }
```

---

## Next Steps

1. **Install Redis** using instructions above for your platform
2. **Create redis_client.py** with the provided code
3. **Add @redis_cache decorators** to expensive endpoints (start with technical indicators)
4. **Test caching** using the test endpoint
5. **Monitor cache stats** via `/api/cache/stats` endpoint
6. **Tune TTLs** based on observed hit rates and freshness requirements
7. **Deploy to production** with proper password and memory configuration

---

## Additional Resources

- [Redis Documentation](https://redis.io/docs/)
- [redis-py Documentation](https://redis-py.readthedocs.io/)
- [Redis Best Practices](https://redis.io/docs/manual/patterns/)
- [RedisInsight Download](https://redis.io/insight/)
- [Memurai for Windows](https://www.memurai.com/)

---

**Last Updated:** 2025-11-19
**Author:** Claude Code
**Related:** CLAUDE.md, pre_aws_changes.md, migration/07_drop_technical_indicators_add_indexes.sql
