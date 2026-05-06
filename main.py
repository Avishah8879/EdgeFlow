import base64
import logging
import datetime
from urllib.request import Request, urlopen
from urllib.parse import unquote
import pandas as pd
import torch
try:
    from GoogleNews import GoogleNews
    GOOGLENEWS_AVAILABLE = True
except ImportError:
    GoogleNews = None
    GOOGLENEWS_AVAILABLE = False
    logging.warning("GoogleNews library not available - Google News source disabled for /api/news")
from transformers import pipeline
import numpy as np
from dateutil import parser as dateutil_parser
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from multiprocessing import Pool, cpu_count, set_start_method
import random
import os
import time
import re
import mplfinance as mpf
import requests
import io
import math
import asyncio
from typing import Optional, List, Dict, Any
import yfinance as yf
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query, WebSocket, WebSocketDisconnect, Header, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
import uvicorn
import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor
from decimal import Decimal
from datetime import datetime, timedelta, timezone
import atexit
from contextlib import contextmanager

from Strat_optimizer_tpsl import run_optimization as run_tpsl_optimization, run_optimization_from_dataframe as run_tpsl_optimization_from_df
from expert_screener import (
    run_screener as run_expert_screener,
    run_screener_streaming,
    get_all_ticker_symbols,
    ConditionEvaluator,
    cache_indicator_value,
    cache_indicator_values,
    get_cached_indicator_value,
    get_all_ticker_ids_from_cache,
    INDICATOR_CACHE_DEPTH
)
from dotenv import load_dotenv
import threading
import json
import hashlib
import feedparser
import pytz

# Import database accessor classes
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), 'server'))
from db_timeframe_accessor import TimeframeDataAccessor
from db_ltp_accessor import LTPDataAccessor
from market_hours import get_market_status, is_market_open, get_current_ist_time
from redis_client import (
    redis_client, init_redis, is_redis_available,
    get_cached, set_cached, delete_cached, get_cache_stats, get_redis_info,
    make_indicator_key, make_sentiment_key,
    make_screener_task_key, make_screener_results_key,
    make_reverse_dcf_key, make_reverse_dcf_lock_key,
    try_acquire_lock, release_lock,
    check_task_limit, increment_task_count, decrement_task_count,
    TTL_TECHNICAL_INDICATORS, TTL_MARKET_MOOD, TTL_SENTIMENT, TTL_TICKERS,
    TTL_MARKET_MOVERS, TTL_STOCK_LTP, TTL_FUNDAMENTALS, TTL_SEARCH_RESULTS,
    TTL_TICKERS_HOURLY, TTL_SCREENER_TASK, TTL_SCREENER_INDICATORS, TTL_SCREENER_RESULTS_CACHE,
    TTL_REVERSE_DCF, LOCK_TTL_REVERSE_DCF, TTL_SANKEY,
    TTL_SHAREHOLDING, make_shareholding_key,
    TTL_QUOTE, TTL_QUOTE_HISTORICAL, get_cached_bulk
)
from server.sankey import get_sankey_data, get_available_years

# Load environment variables from correct .env file based on NODE_ENV
# Use override=True to ensure .env file values take precedence over stale shell env vars
env_file = '.env.production' if os.getenv('NODE_ENV') == 'production' else '.env'
load_dotenv(env_file, override=True)
print(f"[ENV] Loaded environment from: {env_file}")

# Worker-aware pool sizing: Divide total pool by number of workers
# Total target: minconn=5, maxconn=100 across all workers (reduced for faster startup)
# PostgreSQL server should have max_connections >= 200
UVICORN_WORKERS = int(os.getenv("UVICORN_WORKERS", "1"))
DB_POOL_MINCONN = max(2, 5 // UVICORN_WORKERS)  # At least 2 per worker (fast startup)
DB_POOL_MAXCONN = max(20, 100 // UVICORN_WORKERS)  # At least 20 per worker

DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "port": os.getenv("DB_PORT"),
    "database": os.getenv("DB_NAME"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "minconn": DB_POOL_MINCONN,
    "maxconn": DB_POOL_MAXCONN,
    "connect_timeout": 30
}
print(f"[DB Pool] Workers={UVICORN_WORKERS}, minconn={DB_POOL_MINCONN}, maxconn={DB_POOL_MAXCONN}")

# Global connection pool (lazy initialization)
db_pool = None

# ======================
# Redis-backed Screener Task State Management
# ======================
# Uses Redis for task state to share across uvicorn workers.
# Redis TTL handles automatic cleanup (no background task needed).

# OHLC concurrency is now managed by Redis-based distributed semaphore
# (see acquire_ohlc_slot/release_ohlc_slot in redis_client.py)
# Cache-first path has no concurrency limit (~20MB per run, safe for 50+ users)


def create_screener_task(job_id: str) -> bool:
    """Create a new screener task in Redis."""
    key = make_screener_task_key(job_id)
    state = {
        "status": "running",
        "processed": 0,
        "total": 0,
        "matches": 0,
        "error": None,
        "summary": None,
        "loading_status": None,
        "created_at": time.time()
    }
    try:
        redis_client.setex(key, TTL_SCREENER_TASK, json.dumps(state))
        return True
    except Exception as e:
        logging.error(f"[SCREENER] Failed to create task {job_id}: {e}")
        return False


def get_screener_task(job_id: str) -> Optional[Dict[str, Any]]:
    """Get screener task state from Redis."""
    key = make_screener_task_key(job_id)
    try:
        data = redis_client.get(key)
        return json.loads(data) if data else None
    except Exception as e:
        logging.error(f"[SCREENER] Failed to get task {job_id}: {e}")
        return None


def update_screener_task(job_id: str, updates: Dict[str, Any]) -> bool:
    """Update screener task state in Redis (read-modify-write with retry)."""
    key = make_screener_task_key(job_id)
    max_retries = 3
    for attempt in range(max_retries):
        try:
            # Use WATCH for optimistic locking
            pipe = redis_client.pipeline(True)
            pipe.watch(key)
            data = pipe.get(key)
            if not data:
                pipe.unwatch()
                return False
            state = json.loads(data)
            state.update(updates)
            pipe.multi()
            pipe.setex(key, TTL_SCREENER_TASK, json.dumps(state))
            pipe.execute()
            return True
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(0.01)  # Brief retry delay
                continue
            logging.error(f"[SCREENER] Failed to update task {job_id} after {max_retries} attempts: {e}")
            return False


def append_screener_result(job_id: str, result: Dict[str, Any]) -> bool:
    """Append a result to the screener task results list in Redis."""
    key = make_screener_results_key(job_id)
    try:
        redis_client.rpush(key, json.dumps(result, default=str))
        redis_client.expire(key, TTL_SCREENER_TASK)
        return True
    except Exception as e:
        logging.error(f"[SCREENER] Failed to append result for {job_id}: {e}")
        return False


def get_screener_results(job_id: str, start: int = 0) -> List[Dict[str, Any]]:
    """Get results from the screener task results list, starting from index 'start'."""
    key = make_screener_results_key(job_id)
    try:
        data = redis_client.lrange(key, start, -1)
        return [json.loads(item) for item in data] if data else []
    except Exception as e:
        logging.error(f"[SCREENER] Failed to get results for {job_id}: {e}")
        return []


def get_screener_results_count(job_id: str) -> int:
    """Get the count of results in the screener task results list."""
    key = make_screener_results_key(job_id)
    try:
        return redis_client.llen(key) or 0
    except Exception as e:
        logging.error(f"[SCREENER] Failed to get results count for {job_id}: {e}")
        return 0


def is_screener_cancelled(job_id: str) -> bool:
    """Check if a screener task has been cancelled (poll-based abort check)."""
    task = get_screener_task(job_id)
    return task is not None and task.get("status") == "cancelled"


def delete_screener_task(job_id: str) -> bool:
    """Delete a screener task and its results from Redis."""
    task_key = make_screener_task_key(job_id)
    results_key = make_screener_results_key(job_id)
    try:
        redis_client.delete(task_key, results_key)
        return True
    except Exception as e:
        logging.error(f"[SCREENER] Failed to delete task {job_id}: {e}")
        return False


# Global Fear & Greed Index cache
# Stores current value and 50-bar series with failsafe defaults
fear_greed_cache: Dict[str, Any] = {
    "current": {
        "value": 50.0,
        "category": "Neutral",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    },
    "series": [],  # 50 bars of VIX data with timestamps
    "nifty_ohlc": [],  # 50 bars of NIFTY OHLC data for candlestick chart
    "last_calculation": None,
    "calculation_error": None,
    "status": "default",  # "live", "stale", or "default"
}
fear_greed_lock = threading.Lock()
fear_greed_initializing: bool = False  # Flag to track initialization in progress

# Async lock to prevent concurrent Fear/Greed updates from multiple requests
# This ensures only one coroutine updates the cache at a time
_fear_greed_update_lock: Optional[asyncio.Lock] = None


def _get_fear_greed_update_lock() -> asyncio.Lock:
    """Get or create the asyncio lock for Fear/Greed updates."""
    global _fear_greed_update_lock
    if _fear_greed_update_lock is None:
        _fear_greed_update_lock = asyncio.Lock()
    return _fear_greed_update_lock

# ============================================================================
# SEARCH OPTIMIZATION: In-memory cache and ticker index for fast search
# ============================================================================

# Search results cache with TTL (5 minutes)
_search_cache: Dict[str, Dict[str, Any]] = {}
_search_cache_lock = threading.Lock()
_SEARCH_CACHE_TTL = 300  # 5 minutes
_SEARCH_CACHE_MAX_SIZE = 500  # Max cached queries

# Preloaded ticker index for instant prefix matching (top 500 by market cap)
_ticker_index: List[Dict[str, Any]] = []
_ticker_index_lock = threading.Lock()


def get_cached_search(search_term: str, limit: int) -> Optional[List[Dict]]:
    """
    Get cached search results if available and not expired.

    Atomically removes expired entries while holding the lock to prevent
    race conditions where another thread might try to use stale data.
    """
    cache_key = f"{search_term.lower()}:{limit}"
    with _search_cache_lock:
        cached = _search_cache.get(cache_key)
        if cached:
            if (time.time() - cached['timestamp']) < _SEARCH_CACHE_TTL:
                return cached['results']
            else:
                # Remove expired entry while holding lock (atomic cleanup)
                del _search_cache[cache_key]
    return None


def set_cached_search(search_term: str, limit: int, results: List[Dict]) -> None:
    """Cache search results with timestamp."""
    cache_key = f"{search_term.lower()}:{limit}"
    with _search_cache_lock:
        _search_cache[cache_key] = {
            'results': results,
            'timestamp': time.time()
        }
        # Evict oldest entries if cache too large
        if len(_search_cache) > _SEARCH_CACHE_MAX_SIZE:
            oldest_key = min(_search_cache.keys(), key=lambda k: _search_cache[k]['timestamp'])
            del _search_cache[oldest_key]


# ======================
# Fundamentals Caching (Redis)
# ======================

def _make_fundamentals_cache_key(cap_type: Optional[str], search: Optional[str], page: int, limit: int) -> str:
    """Generate Redis cache key for fundamentals query."""
    # Create deterministic key from query params
    key_parts = [
        cap_type or "all",
        (search or "").lower().strip(),
        str(page),
        str(limit)
    ]
    key_str = ":".join(key_parts)
    # Hash for consistent length
    key_hash = hashlib.md5(key_str.encode()).hexdigest()[:12]
    return f"fundamentals:list:{key_hash}"


def _get_cached_fundamentals(cap_type: Optional[str], search: Optional[str], page: int, limit: int) -> Optional[Dict]:
    """Get cached fundamentals data from Redis."""
    if not is_redis_available():
        return None
    cache_key = _make_fundamentals_cache_key(cap_type, search, page, limit)
    return get_cached(cache_key)


def _set_cached_fundamentals(cap_type: Optional[str], search: Optional[str], page: int, limit: int, data: Dict) -> bool:
    """Cache fundamentals data in Redis (1-hour TTL)."""
    if not is_redis_available():
        return False
    cache_key = _make_fundamentals_cache_key(cap_type, search, page, limit)
    return set_cached(cache_key, data, TTL_FUNDAMENTALS)


def load_ticker_index() -> None:
    """
    Load ALL active tickers into memory for instant prefix matching.
    Called once on server startup.
    """
    global _ticker_index
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                SELECT t.id as ticker_id, t.symbol, t.name, t.token, t.suffix, sf.long_name
                FROM tickers t
                LEFT JOIN stock_fundamentals sf ON t.id = sf.ticker_id
                WHERE t.is_active = true
                ORDER BY sf.market_cap DESC NULLS LAST
            """)
            rows = cursor.fetchall()
            with _ticker_index_lock:
                _ticker_index = [dict(row) for row in rows]
            logging.info(f"[Search] Loaded {len(_ticker_index)} tickers into memory index")
    except Exception as e:
        logging.error(f"[Search] Failed to load ticker index: {e}")
    finally:
        if conn:
            release_db_connection(conn)


def search_in_memory(term: str, limit: int = 20) -> List[Dict]:
    """
    Fast search in preloaded ticker index.
    Priority: exact symbol > prefix symbol/name > contains symbol/long_name

    Handles cases like "eli" → "RELIANCE" via contains matching.
    """
    term_upper = term.upper()
    term_lower = term.lower()

    with _ticker_index_lock:
        exact_matches = []
        prefix_matches = []
        contains_matches = []

        for t in _ticker_index:
            symbol_upper = (t.get('symbol') or '').upper()
            name_upper = (t.get('name') or '').upper()
            long_name_lower = (t.get('long_name') or '').lower()
            token = t.get('token') or ''

            # Priority 1: Exact symbol match
            if symbol_upper == term_upper:
                exact_matches.append(t)
            # Priority 2: Symbol/name starts with term, or token exact match
            elif symbol_upper.startswith(term_upper) or name_upper.startswith(term_upper) or token == term:
                prefix_matches.append(t)
            # Priority 3: Contains in symbol OR long_name (handles "eli" → "RELIANCE")
            elif term_upper in symbol_upper or term_lower in long_name_lower:
                contains_matches.append(t)

        # Combine results: exact first, then prefix, then contains
        return (exact_matches + prefix_matches + contains_matches)[:limit]


def get_db_pool():
    """Get or create connection pool (lazy initialization)."""
    global db_pool
    if db_pool is None:
        try:
            db_pool = pool.ThreadedConnectionPool(**DB_CONFIG)
            logging.info("Database connection pool initialized successfully (ThreadedConnectionPool)")
        except Exception as e:
            logging.error(f"Failed to initialize connection pool: {e}")
            raise
    return db_pool

def cleanup_pool():
    """Close all pool connections on shutdown."""
    global db_pool
    if db_pool:
        try:
            db_pool.closeall()
            logging.info("Database pool closed successfully")
        except Exception as e:
            logging.error(f"Error closing pool: {e}")

# Register cleanup handler
atexit.register(cleanup_pool)

def get_pool_status():
    """Get current pool status for monitoring."""
    try:
        pool_obj = get_db_pool()
        # Access internal pool state
        total_conns = len(pool_obj._used) + len(pool_obj._pool)
        used_conns = len(pool_obj._used)
        available_conns = len(pool_obj._pool)
        usage_percent = (used_conns / DB_CONFIG['maxconn']) * 100 if DB_CONFIG['maxconn'] > 0 else 0

        return {
            'total': total_conns,
            'used': used_conns,
            'available': available_conns,
            'max': DB_CONFIG['maxconn'],
            'usage_percent': usage_percent
        }
    except Exception as e:
        logging.error(f"Failed to get pool status: {e}")
        return None

def check_connection_health(conn):
    """Verify connection is still alive."""
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.close()
        return True
    except Exception:
        return False

def get_db_connection(max_retries=3, retry_delay=1, timeout=30):
    """
    Get connection from pool with retry logic, health checks, and timeout.

    Args:
        max_retries: Number of retry attempts (default: 3)
        retry_delay: Base delay between retries in seconds (default: 1)
        timeout: Maximum total time to wait for connection in seconds (default: 30)

    Returns:
        Database connection from pool

    Raises:
        pool.PoolError: If connection cannot be obtained after all retries
        TimeoutError: If timeout exceeded while waiting for connection
    """
    start_time = time.time()
    pool_status = get_pool_status()

    # Log warnings at different usage levels
    if pool_status:
        usage = pool_status['usage_percent']
        if usage > 90:
            logging.error(f"CRITICAL: Connection pool nearly exhausted: {pool_status['used']}/{pool_status['max']} ({usage:.1f}%)")
        elif usage > 80:
            logging.warning(f"Connection pool usage high: {pool_status['used']}/{pool_status['max']} ({usage:.1f}%)")
        elif usage > 70:
            logging.info(f"Connection pool usage elevated: {pool_status['used']}/{pool_status['max']} ({usage:.1f}%)")

    for attempt in range(max_retries):
        # Check timeout
        elapsed = time.time() - start_time
        if elapsed > timeout:
            pool_status = get_pool_status()
            raise TimeoutError(f"Connection acquisition timeout after {elapsed:.1f}s. Pool status: {pool_status}")

        try:
            pool_obj = get_db_pool()
            conn = pool_obj.getconn()

            # Verify connection is healthy
            if not check_connection_health(conn):
                logging.warning("Unhealthy connection detected, reconnecting...")
                pool_obj.putconn(conn, close=True)
                conn = pool_obj.getconn()

            logging.debug(f"Connection acquired in {time.time() - start_time:.2f}s. Pool status: {pool_status}")
            return conn

        except (pool.PoolError, psycopg2.Error) as e:
            if attempt < max_retries - 1:
                wait_time = min(retry_delay * (2 ** attempt), timeout - elapsed)  # Exponential backoff with timeout cap
                if wait_time <= 0:
                    break  # No time left for retry
                logging.warning(f"Connection attempt {attempt + 1} failed, retrying in {wait_time:.1f}s... Error: {e}")
                time.sleep(wait_time)
            else:
                pool_status = get_pool_status()
                logging.error(f"All {max_retries} connection attempts failed after {time.time() - start_time:.1f}s. "
                            f"Status: {pool_status}. Error: {e}")
                raise

def release_db_connection(conn):
    """Return connection to pool with monitoring."""
    try:
        pool_obj = get_db_pool()
        pool_obj.putconn(conn)
        pool_status = get_pool_status()
        logging.debug(f"Connection released. Pool status: {pool_status}")
    except Exception as e:
        logging.error(f"Failed to release connection to pool: {e}")

@contextmanager
def get_db_cursor(cursor_factory=RealDictCursor):
    """Context manager for database operations with automatic connection management.

    Usage:
        with get_db_cursor() as cursor:
            cursor.execute("SELECT * FROM tickers LIMIT 10")
            results = cursor.fetchall()
    """
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=cursor_factory)
        yield cursor
        conn.commit()
    except Exception as e:
        if conn:
            conn.rollback()
        logging.error(f"Database operation failed: {e}")
        raise
    finally:
        if conn:
            release_db_connection(conn)


def fetch_tickers_from_db(limit: int = 5000) -> List[Dict[str, str]]:
    """Fetch ticker symbols from the Postgres database using DB_CONFIG."""
    queries = [
        ("SELECT symbol, name FROM tickers ORDER BY symbol ASC LIMIT %s", "symbol", "name"),
        ("SELECT ticker AS symbol, name FROM tickers ORDER BY ticker ASC LIMIT %s", "symbol", "name"),
        ("SELECT symbol FROM tickers ORDER BY symbol ASC LIMIT %s", "symbol", None),
        ("SELECT ticker AS symbol FROM tickers ORDER BY ticker ASC LIMIT %s", "symbol", None),
    ]

    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            for sql_query, symbol_key, name_key in queries:
                try:
                    cursor.execute(sql_query, (limit,))
                    rows = cursor.fetchall()
                    if not rows:
                        continue
                    results = []
                    seen = set()
                    for row in rows:
                        raw_symbol = row.get(symbol_key)
                        if not raw_symbol:
                            continue
                        symbol = str(raw_symbol).upper().strip()
                        if not symbol or symbol in seen:
                            continue
                        seen.add(symbol)
                        name_value = row.get(name_key) if name_key else None
                        results.append(
                            {
                                "symbol": symbol,
                                "name": str(name_value).strip() if name_value else None,
                            }
                        )
                    if results:
                        return results
                except Exception:
                    continue
    except Exception as exc:
        logging.error("Failed to fetch tickers from database: %s", exc)
    finally:
        if conn:
            release_db_connection(conn)

    return []


# ==================== Fear & Greed Index Functions ====================

def categorize_fear_greed(value: float) -> str:
    """
    Map a 0-100 score to a discrete fear/greed regime label.

    Args:
        value: Normalized VIX score (0-100)

    Returns:
        Category string: "Extreme Greed", "Greed", "Neutral", "Fear", or "Extreme Fear"
    """
    if value < 20:
        return "Extreme Greed"
    elif value < 40:
        return "Greed"
    elif value < 60:
        return "Neutral"
    elif value < 80:
        return "Fear"
    else:
        return "Extreme Fear"


def _yf_download_sync(ticker: str, period: str, interval: str, timeout: int = 10):
    """Synchronous yfinance download helper (for use with asyncio.to_thread)."""
    return yf.download(
        ticker,
        period=period,
        interval=interval,
        progress=False,
        timeout=timeout
    )


def calculate_synthetic_vix_series(ticker: str = "^NSEI", lookback: int = 22, interval: str = "15m", num_bars: int = 50) -> Optional[Dict[str, Any]]:
    """
    Calculate synthetic VIX series (last N bars) from NIFTY OHLC data.

    Formula: synthetic_vix = 10000 * (rolling_high_close - low) / rolling_high_close
    Returns raw VIX values (not normalized).

    Args:
        ticker: Yahoo Finance ticker symbol (default: ^NSEI for NIFTY 50)
        lookback: Number of candles for rolling calculation (default: 22)
        interval: Timeframe for candles (default: "15m" for 15-minute)
        num_bars: Number of bars to return in the series (default: 50)

    Returns:
        Dict with current value (raw VIX), category, timestamp, and series data or None if calculation fails
    """
    try:
        logging.info(f"[Fear/Greed] Fetching {interval} data for {ticker} (lookback: {lookback}, bars: {num_bars})")

        # Fetch enough data for lookback + num_bars
        period_days = max(5, ((lookback + num_bars) * 15) // (6.5 * 60) + 1)

        df = _yf_download_sync(ticker, f"{period_days}d", interval, timeout=10)

        # Validate data
        if df is None or df.empty:
            logging.error(f"[Fear/Greed] No data received from Yahoo Finance for {ticker}")
            return None

        if len(df) < lookback + num_bars:
            logging.warning(f"[Fear/Greed] Limited data: need {lookback + num_bars}, got {len(df)}")

        # Ensure required columns exist (need all OHLC for candlestick chart)
        required_cols = ['Open', 'High', 'Low', 'Close']
        if not all(col in df.columns for col in required_cols):
            logging.error(f"[Fear/Greed] Missing required columns. Available: {df.columns.tolist()}")
            return None

        # Calculate rolling high of closing prices
        rolling_high = df['High'].rolling(window=lookback, min_periods=lookback).max()
        rolling_high = rolling_high.replace(0, np.nan)

        # Calculate synthetic VIX series
        vix_series = 10000 * (rolling_high - df['Low']) / rolling_high
        vix_series = vix_series.dropna()

        if vix_series.empty:
            logging.error("[Fear/Greed] Unable to compute synthetic VIX - all values are NaN")
            return None

        # Get last num_bars of VIX values (raw, not normalized)
        recent_vix = vix_series.tail(num_bars)

        # Build series data with timestamps (raw VIX values)
        series_data = []
        for i in range(len(recent_vix)):
            timestamp = recent_vix.index[i]
            value = float(recent_vix.iloc[i])
            series_data.append({
                "timestamp": timestamp.isoformat() if hasattr(timestamp, 'isoformat') else str(timestamp),
                "value": round(value, 2)
            })

        # Build NIFTY OHLC data aligned with VIX series timestamps
        nifty_ohlc_data = []
        try:
            recent_df = df.loc[recent_vix.index]  # Get OHLC rows matching VIX timestamps
            for i in range(len(recent_df)):
                timestamp = recent_df.index[i]
                nifty_ohlc_data.append({
                    "timestamp": timestamp.isoformat() if hasattr(timestamp, 'isoformat') else str(timestamp),
                    "open": round(float(recent_df['Open'].iloc[i]), 2),
                    "high": round(float(recent_df['High'].iloc[i]), 2),
                    "low": round(float(recent_df['Low'].iloc[i]), 2),
                    "close": round(float(recent_df['Close'].iloc[i]), 2),
                })
        except Exception as ohlc_err:
            logging.warning(f"[Fear/Greed] Failed to extract OHLC data: {ohlc_err}")
            # Fall back to empty OHLC - VIX calculation can still proceed

        # Get current (latest) value (raw VIX)
        current_value = float(recent_vix.iloc[-1])
        category = categorize_fear_greed(current_value)

        logging.info(f"[Fear/Greed] Calculated VIX series: {len(series_data)} bars, OHLC: {len(nifty_ohlc_data)} bars, current={current_value:.2f}, category={category}")

        return {
            "value": round(current_value, 2),
            "category": category,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "series": series_data,
            "nifty_ohlc": nifty_ohlc_data,
        }

    except Exception as e:
        logging.error(f"[Fear/Greed] Error calculating synthetic VIX series: {e}", exc_info=True)
        return None


def calculate_synthetic_vix(ticker: str = "^NSEI", lookback: int = 22, interval: str = "15m") -> Optional[Dict[str, Any]]:
    """
    Calculate current synthetic VIX value (single point) from NIFTY OHLC data.
    This is a wrapper around calculate_synthetic_vix_series for backward compatibility.

    Returns:
        Dict with value, category, timestamp or None if calculation fails
    """
    result = calculate_synthetic_vix_series(ticker, lookback, interval, num_bars=1)
    if result and "series" in result:
        del result["series"]  # Remove series data for single-point calculation
    return result


def should_recalculate() -> bool:
    """
    Check if 15 minutes have passed since last calculation.

    Returns:
        True if recalculation is needed, False otherwise
    """
    with fear_greed_lock:
        last_calc = fear_greed_cache.get("last_calculation")

        if last_calc is None:
            return True

        # Check if 15 minutes have passed
        time_diff = datetime.now(timezone.utc) - last_calc
        return time_diff.total_seconds() >= 15 * 60


def update_fear_greed_cache() -> None:
    """
    Update the Fear & Greed Index cache.

    This function:
    1. Calculates new synthetic VIX series (50 bars)
    2. Updates cache if successful
    3. Keeps previous value if calculation fails (failsafe)
    4. Never raises exceptions
    """
    try:
        logging.info("[Fear/Greed] Updating cache...")

        # Calculate VIX series (includes current value + 50 bars)
        result = calculate_synthetic_vix_series(num_bars=50)

        with fear_greed_lock:
            if result is not None and "series" in result:
                # Update current value
                fear_greed_cache["current"] = {
                    "value": result["value"],
                    "category": result["category"],
                    "timestamp": result["timestamp"],
                }

                # Update series data
                fear_greed_cache["series"] = result["series"]

                # Update NIFTY OHLC data
                fear_greed_cache["nifty_ohlc"] = result.get("nifty_ohlc", [])

                fear_greed_cache["last_calculation"] = datetime.now(timezone.utc)
                fear_greed_cache["calculation_error"] = None
                fear_greed_cache["status"] = "live"

                logging.info(f"[Fear/Greed] Cache updated: {result['category']} ({result['value']}), {len(result['series'])} bars, {len(fear_greed_cache['nifty_ohlc'])} OHLC bars")

                # Persist to Redis for cross-restart persistence
                try:
                    redis_data = {
                        "current": fear_greed_cache["current"],
                        "series": fear_greed_cache["series"],
                        "nifty_ohlc": fear_greed_cache["nifty_ohlc"],
                        "last_calculation": fear_greed_cache["last_calculation"].isoformat(),
                        "status": fear_greed_cache["status"]
                    }
                    set_cached("fear_greed", redis_data, TTL_MARKET_MOOD)
                    logging.info("[Fear/Greed] Persisted to Redis")
                except Exception as redis_err:
                    logging.warning(f"[Fear/Greed] Failed to persist to Redis: {redis_err}")

            else:
                # Calculation failed, keep previous value and mark as stale
                fear_greed_cache["calculation_error"] = "Failed to calculate VIX"
                fear_greed_cache["status"] = "stale"
                logging.warning("[Fear/Greed] Calculation failed, keeping previous cached value")

    except Exception as e:
        logging.error(f"[Fear/Greed] Error updating cache: {e}", exc_info=True)
        # Don't modify cache on exception - keep previous state


def calculate_historical_vix(days: int = 5) -> Optional[List[Dict[str, Any]]]:
    """
    Calculate VIX values for the past N days using daily OHLC data.

    Args:
        days: Number of historical days to calculate (default: 5)

    Returns:
        List of dicts with date, value, category or None if calculation fails
    """
    try:
        logging.info(f"[Fear/Greed] Calculating {days} days of historical VIX...")

        # Fetch daily OHLC data for a longer period to have enough for rolling window
        period_days = days + 30  # Extra days for rolling window calculation
        df = _yf_download_sync("^NSEI", f"{period_days}d", "1d", timeout=10)

        if df is None or df.empty or len(df) < 22:
            logging.error(f"[Fear/Greed] Insufficient daily data for historical VIX")
            return None

        # Calculate rolling high of closing prices (22-day window)
        rolling_high = df['Close'].rolling(window=22, min_periods=22).max()
        rolling_high = rolling_high.replace(0, np.nan)

        # Calculate synthetic VIX for each day
        vix_series = 10000 * (rolling_high - df['Low']) / rolling_high
        vix_series = vix_series.dropna()

        if vix_series.empty:
            logging.error("[Fear/Greed] Unable to compute historical VIX - no valid data")
            return None

        # Get the last N days of VIX values
        recent_vix = vix_series.tail(days)

        # Build result list
        history = []
        for i in range(len(recent_vix)):
            date_idx = recent_vix.index[i]
            raw_vix = float(recent_vix.iloc[i])

            # Normalize to 0-100 range
            normalized_vix = np.clip((raw_vix - 0) / 200 * 100, 0, 100)
            category = categorize_fear_greed(normalized_vix)

            history.append({
                "date": date_idx.strftime("%Y-%m-%d"),
                "value": round(float(normalized_vix), 2),
                "category": category,
            })

        logging.info(f"[Fear/Greed] Calculated {len(history)} historical VIX values")
        return history

    except Exception as e:
        logging.error(f"[Fear/Greed] Error calculating historical VIX: {e}", exc_info=True)
        return None


def initialize_fear_greed_cache() -> None:
    """
    Initialize Fear & Greed Index cache on server startup.

    First tries to load from Redis (fast cold start).
    If Redis data is fresh (<15 min), uses it.
    Otherwise calculates new value and stores in Redis.

    This function never raises exceptions.
    """
    global fear_greed_initializing
    fear_greed_initializing = True
    try:
        logging.info("[Fear/Greed] Initializing cache on startup...")

        # Try to load from Redis first (fast cold start)
        try:
            redis_data = get_cached("fear_greed")
            if redis_data:
                last_calc_str = redis_data.get("last_calculation")
                if last_calc_str:
                    last_calc = datetime.fromisoformat(last_calc_str)
                    age_seconds = (datetime.now(timezone.utc) - last_calc).total_seconds()

                    # Check if nifty_ohlc exists and has data (force recalc if missing)
                    nifty_ohlc = redis_data.get("nifty_ohlc", [])
                    if age_seconds < 15 * 60 and len(nifty_ohlc) > 0:  # Fresh AND has OHLC data
                        with fear_greed_lock:
                            fear_greed_cache["current"] = redis_data["current"]
                            fear_greed_cache["series"] = redis_data["series"]
                            fear_greed_cache["nifty_ohlc"] = nifty_ohlc
                            fear_greed_cache["last_calculation"] = last_calc
                            fear_greed_cache["status"] = redis_data.get("status", "live")
                            fear_greed_cache["calculation_error"] = None

                        logging.info(f"[Fear/Greed] Loaded from Redis (age: {int(age_seconds)}s): "
                                   f"{redis_data['current']['category']} ({redis_data['current']['value']}), {len(nifty_ohlc)} OHLC bars")
                        return
                    elif len(nifty_ohlc) == 0:
                        logging.info("[Fear/Greed] Redis data missing nifty_ohlc, recalculating...")
                    else:
                        logging.info(f"[Fear/Greed] Redis data too old ({int(age_seconds)}s), recalculating...")
        except Exception as redis_err:
            logging.warning(f"[Fear/Greed] Failed to load from Redis: {redis_err}")

        # Calculate fresh data
        with fear_greed_lock:
            # Calculate VIX series (includes current value + 50 bars)
            result = calculate_synthetic_vix_series(num_bars=50)

            if result is not None and "series" in result:
                # Update current value
                fear_greed_cache["current"] = {
                    "value": result["value"],
                    "category": result["category"],
                    "timestamp": result["timestamp"],
                }

                # Update series data
                fear_greed_cache["series"] = result["series"]

                # Update NIFTY OHLC data
                fear_greed_cache["nifty_ohlc"] = result.get("nifty_ohlc", [])

                fear_greed_cache["last_calculation"] = datetime.now(timezone.utc)
                fear_greed_cache["calculation_error"] = None
                fear_greed_cache["status"] = "live"

                logging.info(f"[Fear/Greed] Cache initialized: {result['category']} ({result['value']}), {len(result['series'])} bars, {len(fear_greed_cache['nifty_ohlc'])} OHLC bars")

                # Persist to Redis
                try:
                    redis_data = {
                        "current": fear_greed_cache["current"],
                        "series": fear_greed_cache["series"],
                        "nifty_ohlc": fear_greed_cache["nifty_ohlc"],
                        "last_calculation": fear_greed_cache["last_calculation"].isoformat(),
                        "status": fear_greed_cache["status"]
                    }
                    set_cached("fear_greed", redis_data, TTL_MARKET_MOOD)
                    logging.info("[Fear/Greed] Persisted to Redis")
                except Exception as redis_err:
                    logging.warning(f"[Fear/Greed] Failed to persist to Redis: {redis_err}")

            else:
                # Calculation failed, keep default values
                fear_greed_cache["status"] = "default"
                fear_greed_cache["calculation_error"] = "Failed to initialize VIX on startup"
                logging.warning("[Fear/Greed] Initialization failed, using default neutral values")

    except Exception as e:
        logging.error(f"[Fear/Greed] Error initializing cache: {e}", exc_info=True)
        # Keep default values in cache
    finally:
        fear_greed_initializing = False


def get_fear_greed_data() -> Dict[str, Any]:
    """
    Get current Fear & Greed Index data from cache.

    Returns:
        Dict with current value, series, nifty_ohlc, status, and error (if any)
        Always returns valid data structure (never None)
    """
    with fear_greed_lock:
        return {
            "status": fear_greed_cache["status"],
            "current": fear_greed_cache["current"].copy(),
            "series": [entry.copy() for entry in fear_greed_cache["series"]],
            "nifty_ohlc": [entry.copy() for entry in fear_greed_cache["nifty_ohlc"]],
            "error": fear_greed_cache["calculation_error"],
        }


# ============================================================================
# INDICATOR CACHE PRE-WARMING
# Pre-calculates standard indicators for all tickers to speed up screener
# ============================================================================

# Standard indicators to pre-warm (24 total - matches indicator_calculator.py)
STANDARD_INDICATORS = [
    "sma_20", "sma_50", "sma_100", "sma_200",
    "ema_9", "ema_12", "ema_26", "ema_50", "ema_200",
    "rsi_14", "atr_14",
    "macd_line", "macd_signal", "macd_histogram",
    "bb_upper_20_2", "bb_middle_20_2", "bb_lower_20_2",
    "supertrend_7_3", "supertrend_direction_7_3",
    "supertrend_10_3", "supertrend_direction_10_3",
]


def prewarm_indicator_cache() -> None:
    """
    Pre-calculate standard indicators for all tickers and cache them as arrays.

    This runs as a background task on startup to ensure screener operations
    benefit from cached indicator values immediately. Caches last 50 values
    per indicator to support shift operations (e.g., sma_50_shift_10).

    Performance: ~2-3 minutes for ~3000 tickers (batched to avoid DB overload)
    """
    if not is_redis_available():
        logging.warning("[IndicatorPrewarm] Redis not available, skipping pre-warm")
        return

    start_time = time.time()
    logging.info(f"[IndicatorPrewarm] Starting indicator cache pre-warm (depth={INDICATOR_CACHE_DEPTH})...")

    def extract_array(series, depth: int = INDICATOR_CACHE_DEPTH) -> list:
        """Extract last N values from series, most recent first."""
        if series is None or series.empty:
            return []
        return series.iloc[-depth:].tolist()[::-1]

    try:
        # Import indicator calculator
        from server.indicator_calculator import (
            calculate_sma, calculate_ema, calculate_rsi, calculate_atr,
            calculate_macd, calculate_bollinger_bands, calculate_supertrend
        )

        # Get all ticker symbols
        symbols = get_all_ticker_symbols()
        logging.info(f"[IndicatorPrewarm] Found {len(symbols)} tickers to process")

        # Get ticker_id mapping
        ticker_map = get_all_ticker_ids_from_cache(symbols)
        ticker_ids = list(ticker_map.values())
        logging.info(f"[IndicatorPrewarm] Got {len(ticker_ids)} ticker_ids from cache")

        # Build reverse map: ticker_id -> symbol
        id_to_symbol = {v: k for k, v in ticker_map.items()}

        # Fetch OHLC data in batches
        BATCH_SIZE = 50
        conn = None
        total_cached = 0
        total_skipped = 0

        try:
            conn = get_db_connection()
            accessor = TimeframeDataAccessor(conn)

            for batch_idx in range(0, len(ticker_ids), BATCH_SIZE):
                batch_ids = ticker_ids[batch_idx:batch_idx + BATCH_SIZE]
                batch_num = batch_idx // BATCH_SIZE + 1
                total_batches = (len(ticker_ids) + BATCH_SIZE - 1) // BATCH_SIZE

                try:
                    # Fetch OHLC data (uses Redis cache)
                    ohlc_data = accessor.fetch_ohlc_bulk(
                        ticker_ids=batch_ids,
                        timeframe='1hour',
                        limit=300,
                        use_cache=True
                    )

                    # Process each ticker in the batch
                    for tid, rows in ohlc_data.items():
                        symbol = id_to_symbol.get(tid)
                        if not symbol or len(rows) < 50:
                            continue

                        # Check if already cached (skip if fresh)
                        sample_check = get_cached_indicator_value(symbol, "sma_50")
                        if sample_check is not None:
                            total_skipped += 1
                            continue

                        # Convert to DataFrame
                        import pandas as pd
                        df = pd.DataFrame(rows)
                        if df.empty:
                            continue

                        # Rename columns to expected format
                        df = df.rename(columns={
                            'timestamp': 'Date', 'open': 'Open', 'high': 'High',
                            'low': 'Low', 'close': 'Close', 'volume': 'Volume'
                        })
                        df.set_index('Date', inplace=True)
                        close = df['Close']

                        # Get OHLC data timestamp for cache validation
                        data_ts = None
                        if not df.empty:
                            ts = df.index[-1]
                            if hasattr(ts, 'isoformat'):
                                data_ts = ts.isoformat()
                            else:
                                data_ts = str(ts)

                        # Calculate and cache each standard indicator (as arrays)
                        try:
                            # SMA (cache last 50 values)
                            for period in [20, 50, 100, 200]:
                                series = close.rolling(window=period).mean()
                                vals = extract_array(series)
                                if vals and cache_indicator_values(symbol, f"sma_{period}", vals, data_ts):
                                    total_cached += 1

                            # EMA (cache last 50 values)
                            for period in [9, 12, 26, 50, 200]:
                                series = close.ewm(span=period, adjust=False).mean()
                                vals = extract_array(series)
                                if vals and cache_indicator_values(symbol, f"ema_{period}", vals, data_ts):
                                    total_cached += 1

                            # RSI (cache last 50 values)
                            rsi_series = calculate_rsi(df, 14)
                            vals = extract_array(rsi_series)
                            if vals and cache_indicator_values(symbol, "rsi_14", vals, data_ts):
                                total_cached += 1

                            # ATR (cache last 50 values)
                            atr_series = calculate_atr(df, 14)
                            vals = extract_array(atr_series)
                            if vals and cache_indicator_values(symbol, "atr_14", vals, data_ts):
                                total_cached += 1

                            # MACD (cache last 50 values for each component)
                            macd_result = calculate_macd(df)
                            if macd_result:
                                for key in ['macd_line', 'macd_signal', 'macd_histogram']:
                                    vals = extract_array(macd_result[key])
                                    if vals and cache_indicator_values(symbol, key, vals, data_ts):
                                        total_cached += 1

                            # Bollinger Bands (cache last 50 values for each band)
                            bb_result = calculate_bollinger_bands(df, 20, 2.0)
                            if bb_result:
                                for key, cache_key in [('bb_upper', 'bb_upper_20_2'), ('bb_middle', 'bb_middle_20_2'), ('bb_lower', 'bb_lower_20_2')]:
                                    vals = extract_array(bb_result[key])
                                    if vals and cache_indicator_values(symbol, cache_key, vals, data_ts):
                                        total_cached += 1

                            # Supertrend (7,3) and (10,3) (cache last 50 values)
                            for period, mult in [(7, 3.0), (10, 3.0)]:
                                st_result = calculate_supertrend(df, period, mult)
                                if st_result:
                                    key = f"supertrend_{period}_{int(mult)}"
                                    vals = extract_array(st_result['supertrend'])
                                    if vals and cache_indicator_values(symbol, key, vals, data_ts):
                                        total_cached += 1
                                    dir_key = f"supertrend_direction_{period}_{int(mult)}"
                                    dir_vals = extract_array(st_result['direction'])
                                    if dir_vals and cache_indicator_values(symbol, dir_key, dir_vals, data_ts):
                                        total_cached += 1

                        except Exception as calc_err:
                            logging.debug(f"[IndicatorPrewarm] Error calculating for {symbol}: {calc_err}")
                            continue

                    if batch_num % 10 == 0:
                        logging.info(f"[IndicatorPrewarm] Batch {batch_num}/{total_batches} done, "
                                   f"cached={total_cached}, skipped={total_skipped}")

                except Exception as batch_err:
                    logging.warning(f"[IndicatorPrewarm] Batch {batch_num} failed: {batch_err}")
                    try:
                        conn.rollback()
                    except Exception:
                        pass
                    continue

        finally:
            if conn:
                release_db_connection(conn)

        elapsed = time.time() - start_time
        logging.info(f"[IndicatorPrewarm] Complete: {total_cached} indicator arrays cached, "
                   f"{total_skipped} skipped (already fresh), {elapsed:.1f}s elapsed")

    except Exception as e:
        logging.error(f"[IndicatorPrewarm] Failed: {e}", exc_info=True)


# ============================================================================
# PERIODIC INDICATOR REFRESH
# Keeps the indicator cache permanently warm for the cache-first screener path.
# ============================================================================

_indicator_refresh_task: asyncio.Task = None


async def _indicator_refresh_loop():
    """
    Periodic background task to keep indicator cache warm.

    Schedule:
    - During market hours (9:15 AM - 3:30 PM IST): refresh every 15 min
    - After market close (3:30 PM - 5:00 PM IST): one final refresh, then idle
    - Pre-market / weekends: idle (check every 5 min for market open)

    Uses Redis distributed lock so only one uvicorn worker runs the refresh.
    """
    REFRESH_INTERVAL_MARKET = 15 * 60    # 15 minutes during market hours
    REFRESH_INTERVAL_IDLE = 5 * 60       # 5 minutes when idle (detect market open)
    LOCK_KEY = "prewarm:indicator_refresh:lock"
    LOCK_TTL = 300  # 5 minutes (matches prewarm duration)

    # Wait 3 minutes after startup before first periodic refresh
    # (initial prewarm runs immediately on startup)
    await asyncio.sleep(180)

    last_post_market_refresh = None

    while True:
        try:
            market_status = get_market_status()
            status = market_status.get("status", "CLOSED")

            should_refresh = False
            sleep_seconds = REFRESH_INTERVAL_IDLE

            if status == "OPEN":
                # Market is open: refresh every 15 minutes
                should_refresh = True
                sleep_seconds = REFRESH_INTERVAL_MARKET
                last_post_market_refresh = None

            elif status == "POST-MARKET":
                # Post-market: do ONE final refresh then idle
                from market_hours import get_current_ist_time
                today_str = get_current_ist_time().strftime("%Y-%m-%d")
                if last_post_market_refresh != today_str:
                    should_refresh = True
                    last_post_market_refresh = today_str
                sleep_seconds = REFRESH_INTERVAL_IDLE

            else:
                # PRE-MARKET or CLOSED: just idle-check
                sleep_seconds = REFRESH_INTERVAL_IDLE

            if should_refresh:
                if try_acquire_lock(LOCK_KEY, ttl=LOCK_TTL):
                    try:
                        logging.info("[IndicatorRefresh] Starting periodic indicator refresh...")
                        await asyncio.to_thread(prewarm_indicator_cache)
                        logging.info("[IndicatorRefresh] Periodic refresh complete")
                    finally:
                        release_lock(LOCK_KEY)
                else:
                    logging.debug("[IndicatorRefresh] Skipped - another worker is refreshing")

            await asyncio.sleep(sleep_seconds)

        except asyncio.CancelledError:
            logging.info("[IndicatorRefresh] Refresh loop cancelled")
            break
        except Exception as e:
            logging.error(f"[IndicatorRefresh] Error in refresh loop: {e}")
            await asyncio.sleep(60)  # Retry after 1 minute on error


# ============================================================================
# ASYNC WRAPPERS FOR BLOCKING OPERATIONS
# These prevent blocking the FastAPI event loop during I/O-bound operations
# ============================================================================

async def update_fear_greed_cache_async() -> None:
    """
    Async wrapper for update_fear_greed_cache().
    Runs the blocking yfinance download in a thread pool.

    Uses an asyncio.Lock to ensure only one update runs at a time.
    Concurrent callers will skip the update if one is already in progress.
    """
    lock = _get_fear_greed_update_lock()

    # Non-blocking acquire - if lock is held, skip update (another coroutine is updating)
    if lock.locked():
        logging.debug("[Fear/Greed] Update already in progress, skipping duplicate request")
        return

    async with lock:
        # Double-check if update is still needed after acquiring lock
        if not should_recalculate():
            logging.debug("[Fear/Greed] Cache was updated by another request, skipping")
            return

        await asyncio.to_thread(update_fear_greed_cache)


async def fetch_articles_async(query: str) -> List[Dict]:
    """
    Async wrapper for fetch_articles().
    Runs GoogleNews API calls in a thread pool to avoid blocking.
    """
    return await asyncio.to_thread(fetch_articles, query)


async def analyze_article_sentiment_async(article: Dict) -> Dict:
    """
    Async wrapper for analyze_article_sentiment().
    Runs ML model inference in a thread pool to avoid blocking.
    """
    return await asyncio.to_thread(analyze_article_sentiment, article)


async def analyze_articles_batch_async(articles: List[Dict]) -> List[Dict]:
    """
    Analyze sentiment for multiple articles concurrently.
    Uses a thread pool to parallelize ML inference.
    """
    loop = asyncio.get_running_loop()
    # Process articles in thread pool (sentiment model is not thread-safe for parallel,
    # so we process sequentially in a single thread to avoid model contention)
    def _analyze_all():
        return [analyze_article_sentiment(article) for article in articles]
    return await loop.run_in_executor(None, _analyze_all)


async def fetch_zerodha_pulse_articles_async(limit: int = 100) -> tuple:
    """
    Async wrapper for fetch_zerodha_pulse_articles().
    Runs feedparser in a thread pool to avoid blocking.
    """
    return await asyncio.to_thread(fetch_zerodha_pulse_articles, limit)


async def fetch_all_news_async() -> tuple[list[dict], datetime]:
    """Async wrapper for fetch_all_news(). Runs both news sources in a thread pool."""
    return await asyncio.to_thread(fetch_all_news)


async def get_fundamentals_async(ticker: str) -> Dict:
    """
    Async wrapper for get_fundamentals().
    Runs database queries in a thread pool.
    """
    return await asyncio.to_thread(get_fundamentals, ticker)


# Set Pandas option to avoid FutureWarning
pd.set_option('future.no_silent_downcasting', True)

# Set multiprocessing start method to 'fork' if not Windows
if os.name != 'nt':
    try:
        set_start_method('fork')
    except RuntimeError:
        pass

# -----------------------
# Logging
# -----------------------
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
# -----------------------
# Device & model setup (Lazy initialization)
# -----------------------
SENTIMENT_ANALYSIS_MODEL = "mrm8488/distilroberta-finetuned-financial-news-sentiment-analysis"

# Lazy-loaded sentiment analyzer to avoid slow startup when importing this module
# (Celery workers don't need the sentiment model but were waiting ~15s for it to load)
_sentiment_analyzer = None
_sentiment_lock = threading.Lock()


def get_sentiment_analyzer():
    """Get or initialize the sentiment analysis pipeline (lazy loading)."""
    global _sentiment_analyzer
    if _sentiment_analyzer is None:
        with _sentiment_lock:
            # Double-check after acquiring lock
            if _sentiment_analyzer is None:
                DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
                logging.info(f"Using device: {DEVICE}")
                logging.info("Initializing sentiment analysis model...")
                _sentiment_analyzer = pipeline(
                    "sentiment-analysis", model=SENTIMENT_ANALYSIS_MODEL, device=DEVICE
                )
                logging.info("Model initialized successfully")
    return _sentiment_analyzer
# -----------------------


# -----------------------
# News Fetching Function (GoogleNews)
# -----------------------
def _fetch_articles_inner(query):
    """Internal: fetch articles (no timeout)."""
    articles = []
    googlenews = GoogleNews(lang="en")
    googlenews.set_period('1d')
    googlenews.search(f"{query} stock market news today")
    gn_articles = googlenews.result()
    for a in gn_articles:
        articles.append({
            "title": a.get("title", ""),
            "desc": a.get("desc", a.get("title", "")),
            "date": a.get("date", ""),
            "link": a.get("link", "#"),
            "source": "GoogleNews"
        })
    return articles


def fetch_articles(query):
    """Fetch news articles using GoogleNews API with 30s timeout."""
    try:
        logging.info(f"Fetching articles for '{query}' via GoogleNews.")
        from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_fetch_articles_inner, query)
            articles = future.result(timeout=30)
        logging.info(f"Fetched {len(articles)} articles via GoogleNews.")
        return articles
    except FuturesTimeoutError:
        logging.error(f"GoogleNews fetch timed out for '{query}' (30s)")
        raise Exception(f"News fetch timed out for '{query}'. Try again later...")
    except Exception as e:
        logging.error(f"GoogleNews fetch failed for '{query}': {e}")
        raise Exception(f"Unable to fetch any articles for '{query}'. Try again later...")


# -----------------------
# News Sources (Zerodha Pulse + Google News)
# -----------------------
MAX_PULSE_ARTICLES = 100
PULSE_FEED_URL = "https://pulse.zerodha.com/feed.php"
IST = pytz.timezone("Asia/Kolkata")

# Google News queries for general market news feed
GOOGLE_NEWS_QUERIES = [
    "NSE India",
    "NSE stock market",
    "Nifty 50",
    "Indian markets NSE",
]
MAX_GOOGLE_NEWS_PER_QUERY = 25


def _clean_pulse_text(value: str | None) -> str:
    """Clean text from Pulse feed entries."""
    if not value:
        return ""
    cleaned = (
        value.replace("\xa0", " ")
        .replace("\ufffd", "")
        .replace("Â", "")
    )
    return " ".join(cleaned.split())


def _format_pulse_timestamp(entry) -> str:
    """Format entry timestamp to IST ISO string."""
    published = getattr(entry, "published_parsed", None)
    if published:
        dt = datetime(*published[:6], tzinfo=pytz.UTC)
    else:
        dt = datetime.now(pytz.UTC)
    dt_ist = dt.astimezone(IST)
    return dt_ist.replace(tzinfo=None).isoformat()


def fetch_zerodha_pulse_articles(limit: int = MAX_PULSE_ARTICLES) -> tuple[list[dict], datetime]:
    """Fetch structured Zerodha Pulse news articles (15s timeout)."""
    import urllib.request
    try:
        req = urllib.request.Request(
            PULSE_FEED_URL,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"}
        )
        response = urllib.request.urlopen(req, timeout=15)
        feed_content = response.read()
        response.close()
    except Exception as e:
        raise RuntimeError(f"Pulse feed fetch timed out or failed: {e}")
    feed = feedparser.parse(feed_content)
    fetched_at = datetime.now(IST).replace(tzinfo=None)

    if getattr(feed, "bozo", False):
        raise RuntimeError(f"Pulse feed unavailable: {feed.bozo_exception}")

    entries = sorted(
        getattr(feed, "entries", []),
        key=lambda x: getattr(x, "published_parsed", None) or (0,),
        reverse=True,
    )

    articles: list[dict] = []

    for entry in entries[:limit]:
        title = _clean_pulse_text(getattr(entry, "title", ""))
        link = getattr(entry, "link", "")
        summary = _clean_pulse_text(getattr(entry, "summary", ""))

        if not title or not link:
            continue

        source_title = ""
        source = getattr(entry, "source", None)
        if isinstance(source, dict):
            source_title = source.get("title") or ""
        else:
            source_title = getattr(source, "title", "") or ""

        article_id = hashlib.md5(link.encode("utf-8")).hexdigest()
        articles.append(
            {
                "id": f"pulse-{article_id}",
                "title": title,
                "desc": summary or "No summary available",
                "source": _clean_pulse_text(source_title) or _clean_pulse_text(getattr(entry, "author", "")) or "Zerodha Pulse",
                "date": _format_pulse_timestamp(entry),
                "link": link,
            }
        )

    return articles, fetched_at


def fetch_google_news_articles() -> list[dict]:
    """
    Fetch general market news from Google News using multiple NSE-related queries.
    Returns articles in the standard Tiphub news format.
    Gracefully returns empty list if GoogleNews library is unavailable.
    """
    if not GOOGLENEWS_AVAILABLE:
        logging.warning("[GoogleNews] Library not available, skipping Google News fetch")
        return []

    all_articles = []
    seen_links: set[str] = set()

    for query in GOOGLE_NEWS_QUERIES:
        try:
            gn = GoogleNews(lang="en", region="IN")
            gn.set_period("1d")
            gn.search(query)
            results = gn.result() or []

            for a in results[:MAX_GOOGLE_NEWS_PER_QUERY]:
                link = a.get("link", "")
                if not link or link == "#":
                    continue

                if link in seen_links:
                    continue
                seen_links.add(link)

                # Parse date: GoogleNews returns 'datetime' (datetime obj) or 'date' (string)
                article_date = ""
                dt_obj = a.get("datetime")
                if dt_obj and isinstance(dt_obj, datetime):
                    if dt_obj.tzinfo is None:
                        dt_obj = dt_obj.replace(tzinfo=pytz.UTC)
                    article_date = dt_obj.astimezone(IST).replace(tzinfo=None).isoformat()
                else:
                    date_str = a.get("date", "")
                    if date_str:
                        try:
                            parsed = dateutil_parser.parse(date_str, fuzzy=True)
                            if parsed.tzinfo is None:
                                parsed = parsed.replace(tzinfo=pytz.UTC)
                            article_date = parsed.astimezone(IST).replace(tzinfo=None).isoformat()
                        except (ValueError, TypeError):
                            article_date = date_str

                title = a.get("title", "").strip()
                if not title:
                    continue

                article_id = hashlib.md5(link.encode("utf-8")).hexdigest()

                all_articles.append({
                    "id": f"gnews-{article_id}",
                    "title": title,
                    "desc": (a.get("desc") or title).strip(),
                    "link": link,
                    "source": (a.get("media") or "Google News").strip(),
                    "date": article_date,
                })

            gn.clear()

        except Exception as e:
            logging.warning(f"[GoogleNews] Failed to fetch for query '{query}': {e}")
            continue

    logging.info(f"[GoogleNews] Fetched {len(all_articles)} unique articles from {len(GOOGLE_NEWS_QUERIES)} queries")
    return all_articles


def fetch_all_news() -> tuple[list[dict], datetime]:
    """
    Fetch and merge news from all sources (Zerodha Pulse + Google News).
    Deduplicates by MD5 hash of URL. Sorts by date (newest first).
    If one source fails, returns the other.
    """
    fetched_at = datetime.now(IST).replace(tzinfo=None)
    all_articles: list[dict] = []
    seen_hashes: set[str] = set()

    # Source 1: Zerodha Pulse
    pulse_articles = []
    try:
        pulse_articles, fetched_at = fetch_zerodha_pulse_articles(limit=MAX_PULSE_ARTICLES)
        logging.info(f"[News Merge] Zerodha Pulse: {len(pulse_articles)} articles")
    except Exception as e:
        logging.error(f"[News Merge] Zerodha Pulse failed: {e}")

    # Source 2: Google News
    google_articles = []
    try:
        google_articles = fetch_google_news_articles()
        logging.info(f"[News Merge] Google News: {len(google_articles)} articles")
    except Exception as e:
        logging.error(f"[News Merge] Google News failed: {e}")

    # Merge with cross-source deduplication (Pulse first as primary source)
    for article in pulse_articles + google_articles:
        link = article.get("link", "")
        url_hash = hashlib.md5(link.encode("utf-8")).hexdigest()
        if url_hash not in seen_hashes:
            seen_hashes.add(url_hash)
            all_articles.append(article)

    # Sort by date (newest first)
    def _sort_key(article):
        date_str = article.get("date", "")
        try:
            return dateutil_parser.parse(date_str)
        except (ValueError, TypeError):
            return datetime.min

    all_articles.sort(key=_sort_key, reverse=True)

    logging.info(f"[News Merge] Total after dedup: {len(all_articles)} (Pulse: {len(pulse_articles)}, Google: {len(google_articles)})")
    return all_articles, fetched_at


def get_fundamentals(ticker):
    """Fetch fundamentals from the stock_fundamentals table with real-time LTP price."""
    ticker_upper = ticker.upper().strip()

    conn = None
    try:
        conn = get_db_connection()

        # Get real-time LTP data
        ltp_accessor = LTPDataAccessor(conn)
        ltp_data = ltp_accessor.get_ltp_by_symbol(ticker_upper)

        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            # Query fundamentals from database (excluding price fields)
            query = """
                SELECT
                    sf.market_cap,
                    sf.trailing_pe,
                    sf.forward_pe,
                    sf.price_to_book,
                    sf.price_to_sales,
                    sf.peg_ratio,
                    sf.dividend_yield,
                    sf.fifty_two_week_high,
                    sf.fifty_two_week_low
                FROM stock_fundamentals sf
                JOIN tickers t ON t.id = sf.ticker_id
                WHERE UPPER(t.symbol) = %s
                LIMIT 1
            """

            cursor.execute(query, (ticker_upper,))
            row = cursor.fetchone()

            if not row:
                logging.warning(f"No fundamentals found for ticker {ticker_upper}")
                return {
                    'Market Cap': 'N/A',
                    'P/E': 'N/A',
                    'P/B': 'N/A',
                    'Price': 'N/A',
                }

            # Get current price from LTP data
            current_price = ltp_data.get('ltp') if ltp_data else None

            # Debug: Log raw values
            logging.info(f"Raw fundamentals data for {ticker_upper}: "
                       f"ltp={current_price}, "
                       f"market_cap={row.get('market_cap')}, "
                       f"trailing_pe={row.get('trailing_pe')}, "
                       f"forward_pe={row.get('forward_pe')}, "
                       f"price_to_book={row.get('price_to_book')}")

            # Helper function to safely get numeric value
            def safe_numeric(value):
                """Check if value is a valid number (not None, not 0, finite)."""
                if value is None:
                    return False
                # Accept int, float, and Decimal types
                if not isinstance(value, (int, float, Decimal)):
                    return False
                # Convert to float for comparisons
                try:
                    num_value = float(value)
                except (ValueError, TypeError):
                    return False
                if num_value == 0:
                    return False
                if math.isnan(num_value) or math.isinf(num_value):
                    return False
                return True

            # Format market cap
            market_cap = row.get('market_cap')
            if safe_numeric(market_cap):
                market_cap_float = float(market_cap)
                if market_cap_float >= 1_000_000_000:
                    market_cap_str = f"₹{market_cap_float / 1_000_000_000:.2f}B"
                elif market_cap_float >= 1_000_000:
                    market_cap_str = f"₹{market_cap_float / 1_000_000:.2f}M"
                elif market_cap_float >= 1_000:
                    market_cap_str = f"₹{market_cap_float / 1_000:.2f}K"
                else:
                    market_cap_str = f"₹{market_cap_float:,.0f}"
            else:
                market_cap_str = 'N/A'

            # Format P/E ratio (try trailing first, then forward)
            pe_ratio = row.get('trailing_pe') if safe_numeric(row.get('trailing_pe')) else row.get('forward_pe')
            if safe_numeric(pe_ratio):
                pe_str = f"{float(pe_ratio):.2f}"
            else:
                pe_str = 'N/A'

            # Format Price to Book
            pb_ratio = row.get('price_to_book')
            if safe_numeric(pb_ratio):
                pb_str = f"{float(pb_ratio):.2f}"
            else:
                pb_str = 'N/A'

            # Format current price from LTP data
            if safe_numeric(current_price):
                price_str = f"₹{float(current_price):.2f}"
            else:
                price_str = 'N/A'

            fundamentals = {
                'Market Cap': market_cap_str,
                'P/E': pe_str,
                'P/B': pb_str,
                'Price': price_str,
            }

            logging.info(f"Formatted fundamentals for {ticker_upper}: {fundamentals}")
            return fundamentals

    except Exception as exc:
        logging.error(f"Failed to fetch fundamentals for {ticker_upper}: {exc}", exc_info=True)
        return {
            'Market Cap': 'N/A',
            'P/E': 'N/A',
            'P/B': 'N/A',
            'Price': 'N/A',
        }
    finally:
        if conn:
            release_db_connection(conn)


def _identify_time_columns(cursor) -> Dict[str, str]:
    cursor.execute(
        """
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ohlc_1hour'
        """
    )
    columns = {}
    for row in cursor.fetchall():
        col = row["column_name"]
        columns[col.lower()] = col
    return columns


def fetch_price_history(ticker: str, months: int = 6, interval: str = "1d"):
    """
    Return OHLC price history using TimeframeDataAccessor.

    Supports both TimescaleDB naming conventions with automatic detection.
    """
    ticker_upper = ticker.upper().strip()
    if not ticker_upper:
        return [], "Ticker is required"

    # Map interval parameter to timeframe names
    interval_map = {
        "1m": "1min",
        "1min": "1min",
        "1h": "1hour",
        "1hour": "1hour",
        "1d": "1day",
        "1day": "1day",
        "1w": "1week",
        "1week": "1week",
        "1M": "1month",
        "1month": "1month",
    }

    timeframe = interval_map.get(interval.lower(), "1day")
    start_time = datetime.utcnow() - timedelta(days=30 * max(months, 1))

    bars: List[Dict[str, float]] = []

    conn = None
    try:
        conn = get_db_connection()

        # Check if ticker exists
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT id, symbol FROM tickers WHERE UPPER(symbol) = %s LIMIT 1",
                (ticker_upper,)
            )
            ticker_row = cursor.fetchone()
            if not ticker_row:
                logging.warning(f"Ticker {ticker_upper} not found in tickers table")
                return [], f"Ticker {ticker_upper} not found in database."

            ticker_id = ticker_row['id']
            logging.info(f"Found ticker {ticker_upper} with id {ticker_id}")

        # Use TimeframeDataAccessor to fetch data
        accessor = TimeframeDataAccessor(conn)

        try:
            ohlc_data = accessor.fetch_ohlc(
                ticker_id=ticker_id,
                timeframe=timeframe,
                start_date=start_time
            )
        except ValueError as e:
            # Timeframe not available, provide helpful error
            available = accessor.get_available_timeframes()
            return [], f"Timeframe '{timeframe}' not available. Available: {', '.join(available)}"

        if not ohlc_data:
            logging.warning(f"No data found for {ticker_upper} in timeframe {timeframe}")
            return [], f"No price data available for {ticker_upper} in {timeframe} timeframe."

        # Convert to bars format expected by frontend
        for row in ohlc_data:
            ts = row.get("timestamp")
            open_price = row.get("open")
            high_price = row.get("high")
            low_price = row.get("low")
            close_price = row.get("close")

            if None in (ts, open_price, high_price, low_price, close_price):
                continue

            try:
                if isinstance(ts, pd.Timestamp):
                    ts = ts.to_pydatetime()
                if isinstance(ts, datetime):
                    if ts.tzinfo is None:
                        ts = ts.replace(tzinfo=timezone.utc)
                    else:
                        ts = ts.astimezone(timezone.utc)
                else:
                    ts = pd.to_datetime(ts, utc=True).to_pydatetime()

                bars.append({
                    "time": int(ts.timestamp()),
                    "open": float(open_price),
                    "high": float(high_price),
                    "low": float(low_price),
                    "close": float(close_price),
                })
            except Exception as exc:
                logging.debug(f"Skipping malformed price row for {ticker_upper}: {exc}")
                continue

    except Exception as exc:
        logging.error(f"Database price history query failed for {ticker_upper}: {exc}", exc_info=True)
        return [], f"Unable to query price data: {exc}"
    finally:
        if conn:
            release_db_connection(conn)

    if not bars:
        logging.warning(f"No valid bars processed for {ticker_upper}")
        return [], "Price data unavailable for this ticker."

    logging.info(f"Successfully processed {len(bars)} bars for {ticker_upper} using {timeframe} timeframe")
    return bars, None


def _to_native_number(value):
    if isinstance(value, (np.floating, float)):
        float_value = float(value)
        if math.isnan(float_value) or math.isinf(float_value):
            return None
        return float_value
    if isinstance(value, (np.integer, int)):
        return int(value)
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    return value


def figure_to_base64(fig):
    if fig is None:
        return None
    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", bbox_inches="tight")
    buffer.seek(0)
    encoded = base64.b64encode(buffer.read()).decode("utf-8")
    buffer.close()
    plt.close(fig)
    return encoded


def create_equity_figure(
    cumulative_returns,
    train_end,
    condition,
    metrics,
    max_drawdown_index=None,
    title_suffix="",
):
    if cumulative_returns is None:
        cumulative_series = pd.Series(dtype=float)
    else:
        cumulative_series = pd.Series(cumulative_returns).copy()

    if isinstance(cumulative_series.index, pd.DatetimeIndex) and cumulative_series.index.tz is not None:
        cumulative_series.index = cumulative_series.index.tz_localize(None)

    train_end_ts = pd.Timestamp(train_end)
    if train_end_ts.tzinfo is not None:
        train_end_ts = train_end_ts.tz_localize(None)

    max_dd_ts = None
    if max_drawdown_index is not None and not pd.isna(max_drawdown_index):
        try:
            max_dd_ts = pd.Timestamp(max_drawdown_index)
            if max_dd_ts.tzinfo is not None:
                max_dd_ts = max_dd_ts.tz_localize(None)
        except Exception:
            max_dd_ts = None

    fig, ax = plt.subplots(figsize=(12, 6))

    if cumulative_series.empty:
        ax.text(
            0.5,
            0.5,
            "Equity curve data unavailable.",
            ha="center",
            va="center",
            fontsize=14,
            color="gray",
            transform=ax.transAxes,
        )
        ax.axis("off")
        fig.tight_layout()
        return fig

    ax.plot(
        cumulative_series.index,
        cumulative_series * 100,
        label="Equity Curve",
        color="blue",
    )
    ax.axvline(
        x=train_end_ts,
        color="gray",
        linestyle="--",
        label="Train/Test Split",
    )
    if max_dd_ts is not None and max_dd_ts in cumulative_series.index:
        ax.plot(
            max_dd_ts,
            cumulative_series.loc[max_dd_ts] * 100,
            "ro",
            markersize=8,
            label="Max DD (Train)",
        )
    props = dict(boxstyle="round", facecolor="white", alpha=0.8)
    metrics_text = (
        f"Trades: {metrics.get('num_trades', 0)}\n"
        f"Total PnL: {metrics.get('total_profit', 0) or 0:.2f}% (Train)\n"
        f"Max DD: {metrics.get('max_dd', 0) or 0:.2f}% (Train)\n"
        f"Calmar: {metrics.get('calmar_ratio', 0) or 0:.2f} (Train)\n"
        f"Avg Ret: {metrics.get('avg_p', 0) or 0:.4f}\n"
        f"Profit Factor: {metrics.get('profit_factor', 0) or 0:.2f}\n"
        f"Win Rate: {metrics.get('win_rate', 0) or 0:.1f}%\n"
        f"Worst 10-day: {metrics.get('Worst_10', 0) or 0:.4f}"
    )
    ax.text(
        0.02,
        0.98,
        metrics_text,
        transform=ax.transAxes,
        fontsize=9,
        verticalalignment="top",
        bbox=props,
    )
    ax.set_title(f"Best Strategy: {title_suffix}\nCondition: {condition}")
    ax.set_xlabel("Date")
    ax.set_ylabel("Equity Return (%)")
    ax.legend()
    ax.grid(True)
    fig.tight_layout()
    return fig


def create_equity_placeholder_figure(message="Equity curve data unavailable."):
    fig, ax = plt.subplots(figsize=(12, 4))
    ax.axis("off")
    ax.text(
        0.5,
        0.5,
        message,
        ha="center",
        va="center",
        fontsize=14,
        color="gray",
        transform=ax.transAxes,
    )
    fig.tight_layout()
    return fig


def build_strategy_payload(result, df_train, df_test, duration, fitness_progress=None):
    if result is None:
        return None

    condition = result["condition"]

    train_signal = df_train.eval(condition).astype(bool)
    train_ret = df_train['Close'].pct_change()
    train_strat_ret = train_ret.where(train_signal.shift(1).fillna(False), 0).dropna()

    test_signal = df_test.eval(condition).astype(bool)
    test_ret = df_test['Close'].pct_change()
    test_strat_ret = test_ret.where(test_signal.shift(1).fillna(False), 0).dropna()

    combined_ret = pd.concat([train_strat_ret, test_strat_ret])
    combined_ret = combined_ret.sort_index()
    cumulative_combined = (1 + combined_ret).cumprod() - 1

    equity_curve = [
        {
            "date": pd.Timestamp(idx).isoformat(),
            "value": float(val * 100),
        }
        for idx, val in cumulative_combined.items()
    ]

    train_end = df_train.index[-1]
    train_end_ts = pd.Timestamp(train_end)
    train_end_iso = train_end_ts.isoformat()

    # Index of train/test split in the equity curve (last train point)
    train_end_index = len(train_strat_ret) - 1

    max_dd_idx = result.get("max_dd_idx")
    max_drawdown_point = None
    if max_dd_idx is not None and not pd.isna(max_dd_idx):
        try:
            md_ts = pd.Timestamp(max_dd_idx)
            md_val = cumulative_combined.loc[md_ts] if md_ts in cumulative_combined.index else None
            max_drawdown_point = {
                "date": md_ts.isoformat(),
                "value": float(md_val * 100) if md_val is not None else None,
            }
        except Exception:
            md_ts = pd.Timestamp(max_dd_idx)
            max_drawdown_point = {"date": md_ts.isoformat(), "value": None}

    end_date = df_test.index.max()
    start_date = end_date - pd.DateOffset(months=4)
    ohlc_data = df_test.loc[start_date:end_date, ['Open', 'High', 'Low', 'Close']].copy()

    test_signal_filtered = df_test.loc[start_date:end_date].eval(condition).astype(bool)

    entry_signals = ((test_signal_filtered != test_signal_filtered.shift(1)) & test_signal_filtered).reindex(ohlc_data.index, fill_value=False)
    entry_indices = ohlc_data.index[entry_signals]

    exit_signals = ((test_signal_filtered != test_signal_filtered.shift(1)) & ~test_signal_filtered).reindex(ohlc_data.index, fill_value=False)
    exit_indices = ohlc_data.index[exit_signals]

    last_entries = entry_indices[-20:] if len(entry_indices) >= 20 else entry_indices

    last_trades = []
    for entry_idx in last_entries:
        next_exits = exit_indices[exit_indices > entry_idx]
        if len(next_exits) > 0:
            last_trades.append((entry_idx, next_exits[0]))
        else:
            last_trades.append((entry_idx, None))

    entry_set = {idx for idx, _ in last_trades}
    exit_set = {idx for _, idx in last_trades if idx is not None}

    candlestick_data = []
    for idx, row in ohlc_data.iterrows():
        ts = pd.Timestamp(idx)
        record = {
            "date": ts.isoformat(),
            "open": float(row["Open"]),
            "high": float(row["High"]),
            "low": float(row["Low"]),
            "close": float(row["Close"]),
        }
        if idx in entry_set:
            record["entry"] = True
            record["entry_price"] = float(row["Low"])
        if idx in exit_set:
            record["exit"] = True
            record["exit_price"] = float(row["High"])
        candlestick_data.append(record)

    metrics_raw = result.get("metrics", {})
    metrics = {key: _to_native_number(value) for key, value in metrics_raw.items()}

    fitness_series = []
    if fitness_progress:
        for value in fitness_progress:
            if value in (np.inf, -np.inf):
                continue
            if isinstance(value, (np.floating, float)) and np.isnan(value):
                continue
            fitness_series.append(float(value))

    try:
        equity_fig = create_equity_figure(
            cumulative_combined,
            train_end_ts,
            condition,
            metrics,
            max_dd_idx,
            "QIGA",
        )
    except Exception as exc:
        logging.exception("Failed to render equity curve figure: %s", exc)
        equity_fig = create_equity_placeholder_figure()

    equity_curve_image = figure_to_base64(equity_fig)

    payload = {
        "condition": condition,
        "metrics": metrics,
        "equity_curve": equity_curve,
        "train_end_date": train_end_iso,
        "train_end_index": train_end_index,
        "candlestick_data": candlestick_data,
        "duration": float(duration),
    }

    payload["equity_curve_image"] = equity_curve_image

    if max_drawdown_point is not None:
        payload["max_drawdown_point"] = max_drawdown_point
    if fitness_series:
        payload["fitness_progress"] = fitness_series

    return payload


def build_advanced_strategy_payload(result, df_train, df_test, duration):
    """
    Build JSON payload for advanced (TPSL) optimization results.
    Similar to build_strategy_payload but includes target_pct and stop_pct.
    """
    if result is None:
        return None

    condition = result["condition"]
    target_pct = result.get("target_pct", 0)
    stop_pct = result.get("stop_pct", 0)

    # Build equity curve from train + test data
    train_signal = df_train.eval(condition).astype(bool)
    train_ret = df_train['Close'].pct_change()
    train_strat_ret = train_ret.where(train_signal.shift(1).fillna(False), 0).dropna()

    test_signal = df_test.eval(condition).astype(bool)
    test_ret = df_test['Close'].pct_change()
    test_strat_ret = test_ret.where(test_signal.shift(1).fillna(False), 0).dropna()

    combined_ret = pd.concat([train_strat_ret, test_strat_ret])
    combined_ret = combined_ret.sort_index()
    cumulative_combined = (1 + combined_ret).cumprod() - 1

    equity_curve = [
        {
            "date": pd.Timestamp(idx).isoformat(),
            "value": float(val * 100),
        }
        for idx, val in cumulative_combined.items()
    ]

    train_end = df_train.index[-1]
    train_end_ts = pd.Timestamp(train_end)
    train_end_iso = train_end_ts.isoformat()

    # Index of train/test split in the equity curve (last train point)
    train_end_index = len(train_strat_ret) - 1

    # Max drawdown point
    max_dd_idx = result.get("max_dd_idx")
    max_drawdown_point = None
    if max_dd_idx is not None and not pd.isna(max_dd_idx):
        try:
            md_ts = pd.Timestamp(max_dd_idx)
            md_val = cumulative_combined.loc[md_ts] if md_ts in cumulative_combined.index else None
            max_drawdown_point = {
                "date": md_ts.isoformat(),
                "value": float(md_val * 100) if md_val is not None else None,
            }
        except Exception:
            md_ts = pd.Timestamp(max_dd_idx)
            max_drawdown_point = {"date": md_ts.isoformat(), "value": None}

    # Build candlestick data with entry/exit markers (last 4 months of test period)
    end_date = df_test.index.max()
    start_date = end_date - pd.DateOffset(months=4)
    ohlc_data = df_test.loc[start_date:end_date, ['Open', 'High', 'Low', 'Close']].copy()

    test_signal_filtered = df_test.loc[start_date:end_date].eval(condition).astype(bool)

    entry_signals = ((test_signal_filtered != test_signal_filtered.shift(1)) & test_signal_filtered).reindex(ohlc_data.index, fill_value=False)
    entry_indices = ohlc_data.index[entry_signals]

    exit_signals = ((test_signal_filtered != test_signal_filtered.shift(1)) & ~test_signal_filtered).reindex(ohlc_data.index, fill_value=False)
    exit_indices = ohlc_data.index[exit_signals]

    last_entries = entry_indices[-20:] if len(entry_indices) >= 20 else entry_indices

    last_trades = []
    for entry_idx in last_entries:
        next_exits = exit_indices[exit_indices > entry_idx]
        if len(next_exits) > 0:
            last_trades.append((entry_idx, next_exits[0]))
        else:
            last_trades.append((entry_idx, None))

    entry_set = {idx for idx, _ in last_trades}
    exit_set = {idx for _, idx in last_trades if idx is not None}

    candlestick_data = []
    for idx, row in ohlc_data.iterrows():
        ts = pd.Timestamp(idx)
        record = {
            "date": ts.isoformat(),
            "open": float(row["Open"]),
            "high": float(row["High"]),
            "low": float(row["Low"]),
            "close": float(row["Close"]),
        }
        if idx in entry_set:
            record["entry"] = True
            record["entry_price"] = float(row["Low"])
        if idx in exit_set:
            record["exit"] = True
            record["exit_price"] = float(row["High"])
        candlestick_data.append(record)

    # Process metrics
    metrics_raw = result.get("metrics", {})
    metrics = {key: _to_native_number(value) for key, value in metrics_raw.items()}

    payload = {
        "condition": condition,
        "target_pct": float(target_pct) if isinstance(target_pct, (int, float, np.floating)) else None,
        "stop_pct": float(stop_pct) if isinstance(stop_pct, (int, float, np.floating)) else None,
        "metrics": metrics,
        "equity_curve": equity_curve,
        "train_end_date": train_end_iso,
        "train_end_index": train_end_index,
        "candlestick_data": candlestick_data,
        "duration": float(duration),
    }

    if max_drawdown_point is not None:
        payload["max_drawdown_point"] = max_drawdown_point

    return payload


def analyze_article_sentiment(article):
    logging.info(f"Analyzing sentiment for article: {article['title']}")
    sentiment = get_sentiment_analyzer()(article["desc"])[0]
    article["sentiment"] = sentiment
    return article


def calculate_atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int) -> pd.Series:
    if period < 1:
        raise ValueError("Period must be at least 1")
    
    hc = np.abs(high - close.shift(1))
    lc = np.abs(low - close.shift(1))
    hl = np.abs(high - low)
    tr = pd.DataFrame({'hl': hl, 'hc': hc, 'lc': lc}).max(axis=1)
    
    tr.iloc[0] = hl.iloc[0]
    atr = tr.ewm(com=period - 1, adjust=False, min_periods=period).mean()
    atr.iloc[:period] = np.nan
    
    return atr


def calculate_sma(series: pd.Series, period: int) -> pd.Series:
    if period < 1:
        raise ValueError("Period must be at least 1")
    return series.rolling(window=period, min_periods=period).mean()


def calculate_ema(series: pd.Series, period: int) -> pd.Series:
    if period < 1:
        raise ValueError("Period must be at least 1")
    return series.ewm(span=period, adjust=False).mean()


def compute_indicators_and_rules(df: pd.DataFrame) -> pd.DataFrame:
    required_columns = ['Open', 'High', 'Low', 'Close']
    if not all(col in df.columns for col in required_columns):
        raise ValueError(f"DataFrame must contain columns: {required_columns}")
    
    result_df = df.copy()
    
    atr_periods = [2, 3, 4, 5, 7, 10, 12, 14, 15, 20, 30, 40, 50, 60]
    for period in atr_periods:
        result_df[f'ATR_{period}'] = calculate_atr(
            result_df['High'], result_df['Low'], result_df['Close'], period
        )
    
    sma_periods = [2, 3, 4, 5, 7, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200]
    for period in sma_periods:
        result_df[f'sma_daily_{period}'] = calculate_sma(result_df['Close'], period)
    
    ema_periods = [2, 3, 4, 5, 7, 9, 10, 12, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200]
    for period in ema_periods:
        result_df[f'ema_daily_{period}'] = calculate_ema(result_df['Close'], period)
    
    result_df['p_current'] = (result_df['High'] + result_df['Low'] + result_df['Close']) / 3
    result_df['r1_current'] = 2 * result_df['p_current'] - result_df['Low']
    result_df['s1_current'] = 2 * result_df['p_current'] - result_df['High']
    result_df['r2_current'] = result_df['p_current'] + (result_df['r1_current'] - result_df['s1_current'])
    result_df['s2_current'] = result_df['p_current'] - (result_df['r1_current'] - result_df['s1_current'])
    
    result_df['Close_p2'] = result_df['Close'].shift(1)
    result_df['High_p2'] = result_df['High'].shift(1)
    result_df['Low_p2'] = result_df['Low'].shift(1)
    result_df['Open_p2'] = result_df['Open'].shift(1)
    
    return result_df


def extract_conditions(custom_rules=""):
    rules = [
        "Close > sma_daily_70",
        "Close < sma_daily_20 + 2 * ATR_5",
        "Close > sma_daily_30",
        "Close < sma_daily_2 + 0.25 * ATR_10",
        "Close > ema_daily_30",
        "sma_daily_15 > sma_daily_20",
        "ema_daily_10 > ema_daily_20",
        "ema_daily_20 > ema_daily_50",
        "sma_daily_50 > sma_daily_200",
        "RSI_14 < 30",
        "RSI_14 > 70",
        "RSI_7 < 30",
        "RSI_7 > 70",
        "RSI_5 < 20",
        "RSI_5 > 80",
        "ATR_10 > ATR_20",
        "ATR_5 > ATR_10",
        "ATR_2 > 1.5 * ATR_20",
        "Close - High < -0.75*(High - Low)",
        "Open > Close",
        "(Close - Open) < -0.5 * ATR_10",
        "ATR_5 < ATR_10",
        "ATR_10 < ATR_20",
        "(ATR_5 / ATR_20) < 0.8",
        "RSI_7 < RSI_14 < RSI_20",
        "RSI_7 > RSI_14 > RSI_20",
    ]
    if custom_rules:
        custom_rules_list = [rule.strip() for rule in custom_rules.split(',') if rule.strip()]
        rules.extend(custom_rules_list)
    return list(set(rules))


def evaluate_condition(args):
    i, condition, minimum_pnl, minimum_calmar, df = args
    try:
        columns = re.findall(r'[a-zA-Z_][a-zA-Z0-9_]*', condition)
        valid_columns = set(df.columns)
        for col in columns:
            if col not in valid_columns and col not in {'and', 'or'}:
                return None

        signal = df.eval(condition)
        if signal.isna().all() or signal.sum() == 0:
            return None

        ret = df['Close'].pct_change()
        strat_ret = ret.where(signal.shift(1).fillna(False), 0).dropna()

        if len(strat_ret) < 30:
            return None

        cumulative = (1 + strat_ret).cumprod() - 1
        total_profit = cumulative.iloc[-1] * 100
        num_trades = ((signal != signal.shift(1)) & signal).sum()
        in_position_rets = strat_ret[strat_ret != 0]
        win_rate = (in_position_rets > 0).mean() * 100 if len(in_position_rets) > 0 else 0
        gross_profit = in_position_rets[in_position_rets > 0].sum()
        gross_loss = abs(in_position_rets[in_position_rets < 0].sum())
        profit_factor = gross_profit / gross_loss if gross_loss != 0 else float('inf')
        avg_p = in_position_rets.mean() if len(in_position_rets) > 0 else 0
        worst_10 = strat_ret.rolling(window=10).sum().min()
        rolling_max = cumulative.cummax()
        drawdown = cumulative - rolling_max
        max_dd_idx = drawdown.idxmin()
        max_dd = abs(drawdown.min()) * 100
        years = (df.index[-1] - df.index[0]).days / 365.25
        calmar_ratio = total_profit / (years * max_dd) if max_dd != 0 else float('nan')

        return {
            "i": i,
            "condition": condition,
            "cumulative": cumulative,
            "max_dd_idx": max_dd_idx,
            "metrics": {
                "num_trades": num_trades,
                "total_profit": total_profit,
                "avg_p": avg_p,
                "win_rate": win_rate,
                "profit_factor": profit_factor,
                "Worst_10": worst_10,
                "max_dd": max_dd,
                "calmar_ratio": calmar_ratio
            }
        }
    except Exception as e:
        return None


def optimize_trading_strategy(df: pd.DataFrame, custom_rules="", minimum_pnl=0.0, minimum_calmar=1, use_parallel=True, subsample_years=None, use_qiga=False, progress_callback=None, abort_check=None):
    """
    Optimize trading strategy using genetic algorithm.

    Args:
        progress_callback: Optional callable(gen, total_gens, best_fitness) for progress updates
        abort_check: Optional callable() -> bool, returns True to abort optimization
    """
    
    cond_list = extract_conditions(custom_rules)
    n_conditions = len(cond_list)
    
    if subsample_years:
        start_date = df.index.max() - pd.DateOffset(years=subsample_years)
        df = df.loc[start_date:]
    
    train_size = int(len(df) * 0.7)
    df_train = df.iloc[:train_size].copy()
    df_test = df.iloc[train_size:].copy()

    logic_types = [
        lambda a, b, c: f"({a}) and ({b}) and ({c})",
        lambda a, b, c: f"({a}) or ({b}) or ({c})",
        lambda a, b, c: f"(({a}) and ({b})) or ({c})",
        lambda a, b, c: f"(({a}) or ({b})) and ({c})"
    ]

    pop_size = 20
    generations = 20
    cross_prob = 0.8
    mut_prob = 0.2
    tournament_size = 3

    start_time = time.time()
    best_fitnesses = []

    if use_qiga:
        n_logic = len(logic_types)
        genome_length = 4
        theta = np.pi/4 + np.random.uniform(-np.pi/6, np.pi/6, (pop_size, genome_length, max(n_conditions, n_logic)))
        best_result = None
        best_fitness = -np.inf
        expr_cache = {}

        for gen in range(generations):
            # Check for abort request
            if abort_check and abort_check():
                logging.info(f"[Optimizer] Aborted at generation {gen + 1}/{generations}")
                return None, time.time() - start_time, best_fitnesses, df_train, df_test

            population = []
            for i in range(pop_size):
                probs = np.sin(theta[i, :3, :n_conditions])**2
                probs /= probs.sum(axis=1, keepdims=True) + 1e-10
                cond_indices = []
                available = list(range(n_conditions))
                for j in range(3):
                    if not available:
                        break
                    weights = probs[j, available]
                    weights /= weights.sum() + 1e-10
                    idx = np.random.choice(available, p=weights)
                    cond_indices.append(idx)
                    available.remove(idx)
                while len(cond_indices) < 3:
                    idx = random.choice(available)
                    cond_indices.append(idx)
                    available.remove(idx)
                cond_indices.sort()

                logic_probs = np.sin(theta[i, 3, :n_logic])**2
                logic_probs /= logic_probs.sum() + 1e-10
                logic_idx = np.random.choice(n_logic, p=logic_probs)

                if random.random() < 0.1:
                    mut_pos = random.randint(0, 3)
                    adjustment = np.zeros(max(n_conditions, n_logic))
                    if mut_pos < 3:
                        adjustment[:n_conditions] = np.random.uniform(-np.pi/12, np.pi/12, n_conditions)
                    else:
                        adjustment[:n_logic] = np.random.uniform(-np.pi/12, np.pi/12, n_logic)
                    theta[i, mut_pos, :] += adjustment
                    theta[i, mut_pos, :] = np.clip(theta[i, mut_pos, :], 0, np.pi/2)

                population.append(cond_indices + [logic_idx])

            exprs = []
            for ind in population:
                idx = ind[:-1]
                logic_idx = ind[-1]
                a, b, c = [cond_list[i] for i in idx]
                expr = logic_types[logic_idx](a, b, c)
                exprs.append(expr)

            args_list = [(i, expr, minimum_pnl, minimum_calmar, df_train) for i, expr in enumerate(exprs)]
            if use_parallel and os.name != 'nt':
                with Pool(processes=cpu_count()) as pool:
                    results = pool.map(evaluate_condition, args_list)
            else:
                results = [evaluate_condition(arg) for arg in args_list]

            fitnesses = []
            for i, r in enumerate(results):
                expr = exprs[i]
                if r is not None:
                    calmar = r['metrics']['calmar_ratio']
                    if not np.isnan(calmar):
                        fitnesses.append(calmar)
                        expr_cache[expr] = expr
                        if calmar > best_fitness:
                            best_fitness = calmar
                            best_result = r
                    else:
                        fitnesses.append(-np.inf)
                else:
                    fitnesses.append(-np.inf)

            best_fitnesses.append(best_fitness if best_fitness > -np.inf else 0)

            # Report progress after each generation
            if progress_callback:
                progress_callback(gen + 1, generations, best_fitness if best_fitness > -np.inf else 0)

            if all(f == -np.inf for f in fitnesses):
                continue

            best_idx = np.argmax(fitnesses)
            best_ind = population[best_idx]

            delta_gen = np.pi / (20 + gen)
            theta[0, :3, :n_conditions] = 0
            for j, idx in enumerate(best_ind[:3]):
                theta[0, j, idx] = np.pi/2
            theta[0, 3, :n_logic] = 0
            theta[0, 3, best_ind[3]] = np.pi/2

            for i in range(1, pop_size):
                for j in range(3):
                    current = np.argmax(np.sin(theta[i, j, :n_conditions])**2)
                    if current != best_ind[j]:
                        adjust = delta_gen if best_ind[j] > current else -delta_gen
                        theta[i, j, best_ind[j]] += adjust
                        theta[i, j, :] = np.clip(theta[i, j, :], 0, np.pi/2)
                current_logic = np.argmax(np.sin(theta[i, 3, :n_logic])**2)
                if current_logic != best_ind[3]:
                    adjust = delta_gen if best_ind[3] > current_logic else -delta_gen
                    theta[i, 3, best_ind[3]] += adjust
                    theta[i, 3, :] = np.clip(theta[i, 3, :], 0, np.pi/2)

    else:
        def generate_individual():
            idx = sorted(random.sample(range(n_conditions), 3))
            logic_idx = random.randint(0, 3)
            return idx + [logic_idx]

        def get_expr(ind):
            idx = ind[:-1]
            logic_idx = ind[-1]
            a, b, c = [cond_list[i] for i in idx]
            return logic_types[logic_idx](a, b, c)

        population = [generate_individual() for _ in range(pop_size)]
        best_result = None
        best_fitness = -np.inf
        expr_cache = {}

        for gen in range(generations):
            # Check for abort request
            if abort_check and abort_check():
                logging.info(f"[Optimizer] Aborted at generation {gen + 1}/{generations}")
                return None, time.time() - start_time, best_fitnesses, df_train, df_test

            exprs = []
            for ind in population:
                expr = get_expr(ind)
                if expr in expr_cache:
                    exprs.append(expr_cache[expr])
                else:
                    exprs.append(expr)

            args_list = [(i, expr, minimum_pnl, minimum_calmar, df_train) for i, expr in enumerate(exprs)]
            if use_parallel and os.name != 'nt':
                with Pool(processes=cpu_count()) as pool:
                    results = pool.map(evaluate_condition, args_list)
            else:
                results = [evaluate_condition(arg) for arg in args_list]

            fitnesses = []
            for i, r in enumerate(results):
                expr = exprs[i]
                if r is not None:
                    calmar = r['metrics']['calmar_ratio']
                    if not np.isnan(calmar):
                        fitnesses.append(calmar)
                        expr_cache[expr] = expr
                        if calmar > best_fitness:
                            best_fitness = calmar
                            best_result = r
                    else:
                        fitnesses.append(-np.inf)
                else:
                    fitnesses.append(-np.inf)

            best_fitnesses.append(best_fitness if best_fitness > -np.inf else 0)

            # Report progress after each generation
            if progress_callback:
                progress_callback(gen + 1, generations, best_fitness if best_fitness > -np.inf else 0)

            if all(f == -np.inf for f in fitnesses):
                continue

            elite_indices = np.argsort(fitnesses)[-2:]
            new_population = [population[i] for i in elite_indices]

            while len(new_population) < pop_size:
                parent1 = population[max(random.sample(range(pop_size), tournament_size), key=lambda i: fitnesses[i])]
                parent2 = population[max(random.sample(range(pop_size), tournament_size), key=lambda i: fitnesses[i])]

                if random.random() < cross_prob:
                    child1, child2 = crossover(parent1, parent2, n_conditions)
                else:
                    child1 = parent1[:]
                    child2 = parent2[:]

                mutate(child1, mut_prob, n_conditions)
                mutate(child2, mut_prob, n_conditions)

                new_population.append(child1)
                if len(new_population) < pop_size:
                    new_population.append(child2)

            population = new_population[:pop_size]

    duration = time.time() - start_time

    if best_result is None:
        return None, duration, best_fitnesses, df_train, df_test

    return best_result, duration, best_fitnesses, df_train, df_test


def crossover(p1, p2, n_conditions):
    cp = random.randint(1, 2)
    c1_idx = sorted(set(p1[:cp] + p2[cp:3]))
    while len(c1_idx) < 3:
        new_idx = random.choice([i for i in range(n_conditions) if i not in c1_idx])
        c1_idx.append(new_idx)
        c1_idx.sort()
    c2_idx = sorted(set(p2[:cp] + p1[cp:3]))
    while len(c2_idx) < 3:
        new_idx = random.choice([i for i in range(n_conditions) if i not in c2_idx])
        c2_idx.append(new_idx)
        c2_idx.sort()
    c1_logic = random.choice([p1[3], p2[3]])
    c2_logic = random.choice([p2[3], p1[3]])
    return c1_idx + [c1_logic], c2_idx + [c2_logic]


def mutate(ind, mut_prob, n_conditions):
    if random.random() < mut_prob:
        pos = random.randint(0, 2)
        old = ind[pos]
        available = [i for i in range(n_conditions) if i not in ind[:3]]
        if available:
            new = random.choice(available)
            ind[pos] = new
            ind[:3] = sorted(ind[:3])
    if random.random() < mut_prob:
        ind[3] = random.randint(0, 3)


ANALYSTS_DEFAULT_TICKER = "RELIANCE.NS"

def _ensure_nse_suffix(ticker: str) -> str:
    if not ticker:
        return ANALYSTS_DEFAULT_TICKER
    ticker = ticker.strip().upper()
    if not ticker.endswith(".NS"):
        ticker = f"{ticker}.NS"
    return ticker

def _safe_float(value):
    if value is None:
        return None
    if isinstance(value, (int, float, np.floating)):
        return float(value)
    try:
        return float(value)
    except Exception:
        return None

def _to_iso(value):
    if value is None:
        return None
    if isinstance(value, (datetime, pd.Timestamp)):
        return pd.Timestamp(value).isoformat()
    try:
        return pd.Timestamp(value).isoformat()
    except Exception:
        return None

def _build_research_reports(ticker_obj, limit=6):
    try:
        df = ticker_obj.recommendations
    except Exception:
        df = None
    if df is None or df.empty:
        return []
    try:
        frame = df.reset_index().tail(limit)
    except Exception:
        return []
    records = []
    for _, row in frame.iterrows():
        records.append(
            {
                "date": _to_iso(row.get("Date")),
                "firm": row.get("Firm"),
                "to_grade": row.get("To Grade"),
                "from_grade": row.get("From Grade"),
                "action": row.get("Action"),
            }
        )
    return records

def _build_earnings_calendar(ticker_obj):
    try:
        calendar = ticker_obj.calendar
    except Exception:
        calendar = None

    # Handle None or dict (yfinance can return dict instead of DataFrame)
    if calendar is None:
        return []

    # If it's a dict, convert to list of key-value pairs
    if isinstance(calendar, dict):
        rows = []
        for key, value in calendar.items():
            rows.append({
                "label": str(key),
                "value": _to_iso(value) if isinstance(value, (datetime, pd.Timestamp)) else value,
            })
        return rows

    # If it's a DataFrame, process as before
    if hasattr(calendar, 'empty') and calendar.empty:
        return []

    rows = []
    try:
        for idx, row in calendar.iterrows():
            raw_value = row.iloc[0] if len(row.values) else None
            rows.append(
                {
                    "label": str(idx),
                    "value": _to_iso(raw_value) if isinstance(raw_value, (datetime, pd.Timestamp)) else raw_value,
                }
            )
    except Exception:
        return []
    return rows

def _build_earnings_dates(ticker_obj, limit=4):
    try:
        df = ticker_obj.get_earnings_dates(limit=limit)
    except Exception:
        df = None
    if df is None or df.empty:
        return []
    frame = df.reset_index()
    records = []
    for _, row in frame.iterrows():
        records.append(
            {
                "date": _to_iso(row.get("Earnings Date")),
                "eps_actual": _safe_float(row.get("EPS Actual")),
                "eps_estimate": _safe_float(row.get("EPS Estimate")),
                "surprise_percent": _safe_float(row.get("Surprise %")),
            }
        )
    return records

def _build_announcements(ticker_obj, limit=6):
    try:
        news = ticker_obj.news or []
    except Exception:
        news = []
    items = []
    for entry in news[:limit]:
        ts = entry.get("providerPublishTime")
        published = (
            datetime.fromtimestamp(ts).isoformat()
            if isinstance(ts, (int, float))
            else None
        )
        items.append(
            {
                "title": entry.get("title"),
                "publisher": entry.get("publisher"),
                "link": entry.get("link"),
                "type": entry.get("type"),
                "published_at": published,
            }
        )
    return items

def _build_analyst_ratings(info: Dict[str, Any]):
    return {
        "recommendation": info.get("recommendationKey"),
        "number_of_analysts": info.get("numberOfAnalystOpinions"),
        "target_mean_price": _safe_float(info.get("targetMeanPrice")),
        "target_high_price": _safe_float(info.get("targetHighPrice")),
        "target_low_price": _safe_float(info.get("targetLowPrice")),
        "target_median_price": _safe_float(info.get("targetMedianPrice")),
        "recommendation_mean": _safe_float(info.get("recommendationMean")),
        "current_price": _safe_float(
            info.get("currentPrice") or info.get("regularMarketPrice")
        ),
    }

def _get_curated_picks(limit=4):
    picks = []

    # Fetch top NSE stocks from database (by market cap, prices come from yfinance)
    conn = None
    nse_stocks = []
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT t.symbol
                FROM tickers t
                INNER JOIN stock_fundamentals sf ON t.id = sf.ticker_id
                WHERE sf.market_cap IS NOT NULL
                  AND sf.market_cap > 0
                  AND t.is_active = true
                ORDER BY sf.market_cap DESC
                LIMIT 8
            """)
            rows = cur.fetchall()
            # Remove .NS suffix since it's added back below
            nse_stocks = [row[0].replace('.NS', '').replace('.BO', '') for row in rows if row[0]]
    except Exception as e:
        logging.exception("Failed to fetch curated picks stocks from database")
        # Fallback to default stocks if query fails
        nse_stocks = ['RELIANCE', 'TCS', 'INFY', 'HDFC', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'ITC']
    finally:
        if conn:
            release_db_connection(conn)

    symbols = [f"{sym}.NS" for sym in nse_stocks[:8]]
    for symbol in symbols:
        try:
            ticker_obj = yf.Ticker(symbol)
            info = ticker_obj.info
        except Exception:
            continue
        if not info:
            continue
        score = _safe_float(info.get("recommendationMean")) or 999
        price = _safe_float(
            info.get("currentPrice") or info.get("regularMarketPrice")
        )
        target = _safe_float(info.get("targetMeanPrice"))
        upside = None
        if price and target:
            try:
                upside = ((target - price) / price) * 100
            except Exception:
                upside = None
        picks.append(
            {
                "ticker": symbol,
                "name": info.get("longName") or info.get("shortName"),
                "recommendation": info.get("recommendationKey"),
                "score": score,
                "price": price,
                "target_price": target,
                "upside_percent": upside,
            }
        )
    picks.sort(key=lambda x: x.get("score") or 999)
    return picks[:limit]

def build_analyst_hub_payload(ticker: str) -> Dict[str, Any]:
    symbol = _ensure_nse_suffix(ticker)
    ticker_obj = yf.Ticker(symbol)
    try:
        info = ticker_obj.info or {}
    except Exception:
        info = {}
    payload = {
        "ticker": symbol,
        "company_name": info.get("longName") or info.get("shortName"),
        "analyst_ratings": _build_analyst_ratings(info),
        "research_reports": _build_research_reports(ticker_obj),
        "earnings_calendar": _build_earnings_calendar(ticker_obj),
        "earnings_dates": _build_earnings_dates(ticker_obj),
        "announcements": _build_announcements(ticker_obj),
    }
    return payload

# ==================== FastAPI Setup ====================
class AllowFrameMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        for header_key in list(response.headers.keys()):
            if header_key.lower() == "x-frame-options":
                del response.headers[header_key]
        response.headers["Content-Security-Policy"] = "frame-ancestors *"
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "*"
        return response


fastapi_app = FastAPI(
    title="EquityPro Developer API",
    description=(
        "Financial market data, technical analysis, and AI-powered insights for Indian markets (NSE).\n\n"
        "## Authentication\n"
        "Include your API key in the `X-API-Key` header. "
        "For SSE streaming endpoints (EventSource), pass `?api_key=YOUR_KEY` as a query parameter.\n\n"
        "## Rate Limits\n"
        "| Tier | Per Minute | Per Hour | Per Day |\n"
        "|------|-----------|---------|--------|\n"
        "| Basic | 20 | 500 | 5,000 |\n"
        "| Premium | 60 | 2,000 | 25,000 |\n"
        "| Enterprise | Custom | Custom | Custom |\n\n"
        "Rate limit info is returned in `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers."
    ),
    version="1.0.0",
    docs_url="/api/docs",           # Accessible at /v1/api/docs via version middleware
    redoc_url="/api/redoc",         # Accessible at /v1/api/redoc via version middleware
    openapi_url="/api/openapi.json", # Accessible at /v1/api/openapi.json via version middleware
    openapi_tags=[
        {"name": "Market Data", "description": "Stocks, indices, market movers, and market status"},
        {"name": "Prices", "description": "Real-time LTP, bulk prices, and historical OHLC charts"},
        {"name": "Technical Analysis", "description": "Technical indicators and expert screener"},
        {"name": "Strategy", "description": "Backtesting with genetic algorithm optimization"},
        {"name": "Sentiment", "description": "AI-powered sentiment analysis from financial news"},
        {"name": "Search", "description": "Stock and index search"},
        {"name": "Stock Detail", "description": "Comprehensive stock information and analysis"},
        {"name": "AI Chat", "description": "TipTease AI financial assistant"},
        {"name": "System", "description": "Health checks and system status (admin only)"},
    ],
)
app = fastapi_app  # Alias for uvicorn compatibility

# Configure CORS with explicit allowed origins
# Parse CORS_ORIGINS from environment, or use defaults
cors_origins_env = os.getenv('CORS_ORIGINS', '')
default_origins = [
    'http://localhost:5173',  # Vite dev server
    'http://localhost:5000',  # Node backend
    os.getenv('VITE_GRADIO_BASE_URL', ''),  # Python backend URL
    os.getenv('VITE_AUTH_BASE_URL', ''),    # Node backend URL (ngrok)
]

allowed_origins = [o.strip() for o in cors_origins_env.split(',') if o.strip()] if cors_origins_env else [o for o in default_origins if o]

print(f"[CORS] Allowed origins: {allowed_origins}")

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,  # Token-based auth, not cookies
    allow_methods=["*"],
    allow_headers=["*"],
)
fastapi_app.add_middleware(AllowFrameMiddleware)

# --- API Versioning Middleware ---
# Supports /v1/api/* routes by stripping the /v1 prefix before routing.
# Unversioned /api/* routes continue to work with deprecation headers.
from starlette.middleware.base import BaseHTTPMiddleware

class APIVersionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        original_path = request.url.path

        # Strip /v1 prefix so existing route handlers match
        if original_path.startswith("/v1/"):
            request.scope["path"] = original_path[3:]  # "/v1/api/stocks" -> "/api/stocks"

        response = await call_next(request)

        # Add deprecation headers for unversioned /api/ access
        if not original_path.startswith("/v1/") and original_path.startswith("/api/"):
            response.headers["Deprecation"] = "true"
            response.headers["Sunset"] = "2026-09-01"
            response.headers["Link"] = f'</v1{original_path}>; rel="successor-version"'

        return response

fastapi_app.add_middleware(APIVersionMiddleware)

# --- API Usage Tracking Middleware ---
# Tracks response_time_ms and status_code for API-key requests.
# Pushes enriched events to Redis for batch flush to PostgreSQL.
import time as _time

class APIUsageTrackingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = _time.monotonic()
        response = await call_next(request)

        # Only track requests that came through API key validation
        api_key_id = request.headers.get('x-api-key-id')
        if api_key_id:
            elapsed_ms = int((_time.monotonic() - start) * 1000)
            user_id = request.headers.get('x-api-user-id', '')
            endpoint = request.url.path
            method = request.method
            status_code = response.status_code
            ip = request.headers.get('x-real-ip', '')
            if not ip and request.client:
                ip = request.client.host

            try:
                from server.redis_client import redis_client as _redis
                from datetime import datetime as _dt
                import json as _json

                now = _dt.now()
                date_str = now.strftime('%Y%m%d')
                event = _json.dumps({
                    'kid': api_key_id,
                    'uid': user_id,
                    'ep': endpoint,
                    'm': method,
                    's': status_code,
                    'ms': elapsed_ms,
                    'ip': ip,
                    'ts': int(now.timestamp()),
                })

                redis_key = f'api_usage:{api_key_id}:{date_str}'
                _redis.rpush(redis_key, event)
                _redis.expire(redis_key, 172800)  # 48h TTL
            except Exception:
                pass  # Usage tracking is best-effort

        return response

fastapi_app.add_middleware(APIUsageTrackingMiddleware)

# Import standardized response helpers
from server.api_response import success_response, paginated_response, list_response, error_response

# Custom exception handler for standardized error responses
from fastapi.responses import JSONResponse

@fastapi_app.exception_handler(HTTPException)
async def custom_http_exception_handler(request: Request, exc: HTTPException):
    """Return errors in the standard { error: { code, message } } format."""
    if isinstance(exc.detail, dict) and "code" in exc.detail and "message" in exc.detail:
        # Already formatted as standard error
        content = {"error": exc.detail}
    else:
        # Convert plain string detail to standard format
        content = {"error": {"code": "ERROR", "message": str(exc.detail)}}
    return JSONResponse(status_code=exc.status_code, content=content)

# Startup event handler to initialize Fear & Greed Index cache
@fastapi_app.on_event("startup")
async def startup_event():
    """Initialize caches on application startup."""
    startup_start = time.time()
    logging.info("=" * 60)
    logging.info("STARTUP INITIATED")
    logging.info("=" * 60)

    # Initialize Redis connection
    t0 = time.time()
    logging.info("[STARTUP] Step 1/4: Initializing Redis connection...")
    redis_available = init_redis()
    if redis_available:
        logging.info(f"[STARTUP] Redis cache layer enabled ({time.time() - t0:.2f}s)")
    else:
        logging.warning(f"[STARTUP] Redis not available ({time.time() - t0:.2f}s)")

    # Initialize Fear & Greed Index cache (run in background to avoid blocking)
    t0 = time.time()
    logging.info("[STARTUP] Step 2/4: Initializing Fear & Greed Index cache (background)...")
    # Run in thread pool to avoid blocking server startup
    asyncio.create_task(asyncio.to_thread(initialize_fear_greed_cache))
    logging.info(f"[STARTUP] Fear & Greed task scheduled ({time.time() - t0:.2f}s)")

    # Load ticker index for fast search
    t0 = time.time()
    logging.info("[STARTUP] Step 3/4: Loading ticker index for fast search...")
    load_ticker_index()
    logging.info(f"[STARTUP] Ticker index loaded ({time.time() - t0:.2f}s)")

    # Pre-warm indicator cache for screener (run in background - takes ~2-3 minutes)
    # Use Redis lock so only one worker runs prewarm when using multiple uvicorn workers
    t0 = time.time()
    logging.info("[STARTUP] Step 4/4: Pre-warming indicator cache (background)...")
    if try_acquire_lock("prewarm:indicator_cache:lock", ttl=300):
        asyncio.create_task(asyncio.to_thread(prewarm_indicator_cache))
        logging.info(f"[STARTUP] Indicator pre-warm task scheduled ({time.time() - t0:.2f}s)")
    else:
        logging.info(f"[STARTUP] Indicator pre-warm skipped (another worker is handling it)")

    # Start periodic indicator refresh loop (keeps cache warm for cache-first screener path)
    global _indicator_refresh_task
    _indicator_refresh_task = asyncio.create_task(_indicator_refresh_loop())
    logging.info("[STARTUP] Periodic indicator refresh loop started")

    # Note: Screener task cleanup is handled by Redis TTL expiration (no background task needed)

    total_time = time.time() - startup_start
    logging.info("=" * 60)
    logging.info(f"STARTUP COMPLETE in {total_time:.2f}s")
    logging.info("=" * 60)

# Shutdown event handler for proper cleanup
@fastapi_app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on application shutdown."""
    logging.info("Shutdown initiated...")

    # Cancel periodic indicator refresh loop
    if _indicator_refresh_task and not _indicator_refresh_task.done():
        _indicator_refresh_task.cancel()
        logging.info("Indicator refresh loop cancelled")

    # Note: Running screener tasks will be terminated when this worker shuts down.
    # Task state in Redis will expire via TTL (1 hour).
    # Other workers can continue serving streams if available.

    # Cleanup database pool
    cleanup_pool()
    logging.info("Shutdown complete")


# ==================== Pydantic Models ====================
class SentimentAnalysisRequestBody(BaseModel):
    ticker: str


class ExpertScreenerRequest(BaseModel):
    expression: str
    symbols: Optional[List[str]] = None
    period: str = "1y"


# ==================== Helper Functions ====================
def _normalize_sentiment_label(label: str) -> str:
    normalized = str(label or "").strip().lower()
    if normalized not in {"positive", "negative", "neutral"}:
        return "neutral"
    return normalized


def apply_screener_condition(field: str, operator: str, value: Optional[float], value2: Optional[float]):
    """
    Build SQL WHERE clause for a single condition using parameterized queries.

    Returns:
        tuple: (sql_clause: str, params: list) for safe SQL execution
    """

    # Handle percentage fields that are stored as decimals
    percentage_fields = ['profit_margin', 'operating_margin', 'return_on_assets',
                        'return_on_equity', 'revenue_growth', 'earnings_growth', 'dividend_yield']

    # Extract base field name (remove table prefix if present)
    base_field = field.split('.')[-1] if '.' in field else field

    if base_field in percentage_fields and value is not None:
        value = value / 100.0  # Convert percentage to decimal
        if value2 is not None:
            value2 = value2 / 100.0

    # Build parameterized SQL with NULL checks for numeric comparisons
    if operator == 'gt':
        return (f"({field} > %s AND {field} IS NOT NULL)", [value])
    elif operator == 'gte':
        return (f"({field} >= %s AND {field} IS NOT NULL)", [value])
    elif operator == 'lt':
        return (f"({field} < %s AND {field} IS NOT NULL)", [value])
    elif operator == 'lte':
        return (f"({field} <= %s AND {field} IS NOT NULL)", [value])
    elif operator == 'eq':
        return (f"({field} = %s AND {field} IS NOT NULL)", [value])
    elif operator == 'between' and value2 is not None:
        return (f"({field} BETWEEN %s AND %s AND {field} IS NOT NULL)", [value, value2])
    elif operator == 'not_null':
        return (f"{field} IS NOT NULL", [])
    elif operator == 'is_null':
        return (f"{field} IS NULL", [])
    else:
        return (None, [])


# ==================== API Endpoints ====================
@fastapi_app.get("/")
async def root():
    return {
        "message": "EquityPro API",
        "version": "1.0.0",
        "endpoints": {
            "sentiment_analysis": "/api/sentiment-analysis",
            "tickers": "/api/tickers",
            "market_movers": "/api/market-movers",
            "stocks": "/api/stocks",
        "strategy_backtest": "/api/strategy-backtest",
        "advanced_backtest": "/api/strategy-backtest/advanced",
        "screener": "/api/screener/run",
        "expert_screener": "/api/expert-screener/run",
        "health": "/health/db"
    }
}


@fastapi_app.get("/health/db")
async def database_health():
    """Database health check endpoint for monitoring."""
    try:
        pool_status = get_pool_status()

        # Test database connection
        with get_db_cursor() as cursor:
            cursor.execute("SELECT 1 as status")
            result = cursor.fetchone()

        return {
            "status": "healthy",
            "database": {
                "connected": True,
                "test_query": "passed"
            },
            "connection_pool": pool_status if pool_status else {
                "status": "not_initialized"
            }
        }
    except Exception as e:
        logging.error(f"Database health check failed: {e}")
        return {
            "status": "unhealthy",
            "database": {
                "connected": False,
                "error": str(e)
            },
            "connection_pool": get_pool_status()
        }


@fastapi_app.get("/health/cache")
async def cache_health():
    """
    Redis cache health check and statistics endpoint.

    Returns cache hit rates, Redis connection status, and memory usage.
    """
    try:
        stats = get_cache_stats()
        return {
            "status": "healthy" if stats.get("redis_available") else "degraded",
            "cache": stats
        }
    except Exception as e:
        logging.error(f"Cache health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e)
        }


# ==================== Per-User Task Limiting Helper ====================

def get_task_user_id(request: Request) -> str:
    """
    Get user identifier for task limiting.
    Checks X-API-User-Id (set by nginx from API key or JWT validation),
    then X-Auth-User-Id (JWT-specific fallback), then client IP address.
    """
    user_id = request.headers.get("x-api-user-id")
    if user_id:
        return user_id
    # Fallback: JWT-specific header (set by nginx from JWT auth branch)
    user_id = request.headers.get("x-auth-user-id")
    if user_id:
        return user_id
    # Fallback to IP (X-Real-IP from nginx, or client host)
    return request.headers.get("x-real-ip", request.client.host if request.client else "unknown")

def get_task_tier(request: Request) -> str:
    """Get user tier from API key or JWT validation header, default to 'basic'."""
    tier = request.headers.get("x-api-key-tier")
    if tier:
        return tier
    return request.headers.get("x-auth-user-tier", "basic")


def store_task_user(task_id: str, user_id: str):
    """Store user_id for a task so SSE stream can decrement on completion."""
    set_cached(f"task_user:{task_id}", user_id, 3600)  # 1 hour TTL

def get_task_user(task_id: str) -> str | None:
    """Retrieve user_id for a task."""
    return get_cached(f"task_user:{task_id}")

def cleanup_task_user(task_id: str, user_id: str | None = None):
    """Decrement task count and remove task-user mapping."""
    uid = user_id or get_task_user(task_id)
    if uid:
        decrement_task_count(uid)
        delete_cached(f"task_user:{task_id}")


# ==================== System Stats Endpoints (Admin Dashboard) ====================

# Admin key verification for system endpoints
ADMIN_SECRET_KEY = os.getenv("ADMIN_SECRET_KEY", "tiphub-admin-dev-key")

async def verify_admin_key(x_admin_key: str = Header(None)):
    """Verify X-Admin-Key header for system stats endpoints."""
    if not x_admin_key or x_admin_key != ADMIN_SECRET_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized: valid X-Admin-Key header required")

@fastapi_app.get("/api/system/redis-stats", dependencies=[Depends(verify_admin_key)], tags=["System"])
async def redis_stats_api():
    """
    Detailed Redis statistics for admin dashboard.

    Returns cache hit rates, memory usage, connection info, and key counts.
    """
    try:
        stats = get_cache_stats()
        redis_info = get_redis_info()

        # Get additional key pattern counts
        key_counts = {}
        try:
            # Count keys by pattern prefix
            patterns = ['indicators:*', 'sentiment:*', 'ohlc:*', 'screener:*', 'ind:*']
            for pattern in patterns:
                prefix = pattern.replace(':*', '')
                count = 0
                for _ in redis_client.scan_iter(pattern, count=100):
                    count += 1
                    if count >= 1000:  # Cap at 1000 to avoid long scans
                        count = "1000+"
                        break
                key_counts[prefix] = count
        except Exception as e:
            key_counts = {"error": str(e)}

        return {
            "status": "healthy" if stats.get("redis_available") else "unavailable",
            "cache_stats": {
                "hits": stats.get("hits", 0),
                "misses": stats.get("misses", 0),
                "hit_rate": stats.get("hit_rate", "0%"),
                "errors": stats.get("errors", 0),
                "sets": stats.get("sets", 0)
            },
            "redis_info": redis_info,
            "key_counts": key_counts
        }
    except Exception as e:
        logging.error(f"Redis stats API failed: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


@fastapi_app.get("/api/system/celery-stats", dependencies=[Depends(verify_admin_key)], tags=["System"])
async def celery_stats_api():
    """
    Celery worker statistics for admin dashboard.

    Returns worker status, active tasks, and queue info.
    """
    try:
        from celery_app import celery_app as celery

        # Get inspect object for worker info
        inspect = celery.control.inspect()

        # Get active workers (with 2 second timeout)
        active_workers = inspect.active() or {}
        stats = inspect.stats() or {}
        registered = inspect.registered() or {}
        scheduled = inspect.scheduled() or {}
        reserved = inspect.reserved() or {}

        # Count active tasks across all workers
        total_active = sum(len(tasks) for tasks in active_workers.values())
        total_scheduled = sum(len(tasks) for tasks in scheduled.values())
        total_reserved = sum(len(tasks) for tasks in reserved.values())

        # Build worker info
        workers = []
        for worker_name, worker_stats in stats.items():
            workers.append({
                "name": worker_name,
                "status": "online",
                "pool": worker_stats.get("pool", {}).get("implementation", "unknown"),
                "concurrency": worker_stats.get("pool", {}).get("max-concurrency", 0),
                "processed": worker_stats.get("total", {}).get("celery_tasks.backtest_run", 0),
                "active_tasks": len(active_workers.get(worker_name, []))
            })

        return {
            "status": "healthy" if workers else "no_workers",
            "workers": workers,
            "summary": {
                "total_workers": len(workers),
                "active_tasks": total_active,
                "scheduled_tasks": total_scheduled,
                "reserved_tasks": total_reserved
            },
            "registered_tasks": list(set(
                task for tasks in registered.values() for task in tasks
            )) if registered else []
        }
    except Exception as e:
        logging.error(f"Celery stats API failed: {e}")
        return {
            "status": "error",
            "error": str(e),
            "workers": [],
            "summary": {
                "total_workers": 0,
                "active_tasks": 0,
                "scheduled_tasks": 0,
                "reserved_tasks": 0
            }
        }


@fastapi_app.get("/api/system/db-stats", dependencies=[Depends(verify_admin_key)], tags=["System"])
async def db_stats_api():
    """
    Database connection pool statistics for admin dashboard.

    Returns pool status, connection counts, and query timing.
    """
    try:
        pool_status = get_pool_status()

        # Test query to measure latency
        import time
        start = time.time()
        with get_db_cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        latency_ms = (time.time() - start) * 1000

        # Get table row counts for key tables
        table_counts = {}
        try:
            with get_db_cursor() as cursor:
                tables = ['tickers', 'ltp_live', 'stock_fundamentals', 'market_movers_live']
                for table in tables:
                    cursor.execute(f"SELECT COUNT(*) FROM {table}")
                    result = cursor.fetchone()
                    table_counts[table] = result[0] if result else 0
        except Exception as e:
            table_counts = {"error": str(e)}

        return {
            "status": "healthy",
            "pool": pool_status if pool_status else {"status": "not_initialized"},
            "latency_ms": round(latency_ms, 2),
            "table_counts": table_counts
        }
    except Exception as e:
        logging.error(f"Database stats API failed: {e}")
        return {
            "status": "error",
            "error": str(e),
            "pool": get_pool_status(),
            "latency_ms": None
        }


@fastapi_app.post("/api/sentiment-analysis", tags=["Sentiment"])
async def sentiment_analysis_api(payload: SentimentAnalysisRequestBody):
    """
    Analyze sentiment for a stock using Google News + FinBERT ML model.

    Redis caching: 24-hour TTL since news doesn't change frequently.
    This is an expensive operation (2-5s) involving ML inference.
    """
    ticker = payload.ticker.strip().upper()
    if not ticker:
        raise HTTPException(status_code=400, detail="Ticker is required")

    # Check Redis cache first (24-hour TTL for sentiment data)
    cache_key = make_sentiment_key(ticker)
    cached_result = get_cached(cache_key)
    if cached_result:
        logging.info(f"[CACHE HIT] Sentiment analysis for {ticker}")
        cached_result["cached"] = True
        return success_response(cached_result)

    logging.info(f"[CACHE MISS] Sentiment analysis for {ticker} - running ML inference")

    try:
        # Use async wrappers to avoid blocking event loop
        articles = await fetch_articles_async(ticker)
        analyzed_articles = await analyze_articles_batch_async(articles)
        fundamentals = await get_fundamentals_async(ticker)

        articles_payload = [
            {
                "title": article.get("title", ""),
                "desc": article.get("desc", ""),
                "date": article.get("date", ""),
                "link": article.get("link", "#"),
                "source": article.get("source", "GoogleNews"),
                "sentiment": {
                    "label": _normalize_sentiment_label(
                        article.get("sentiment", {}).get("label")
                    ),
                    "score": _safe_float(
                        article.get("sentiment", {}).get("score")
                    ),
                },
            }
            for article in analyzed_articles
        ]

        price_data, price_error = fetch_price_history(ticker)

        result = {
            "ticker": ticker,
            "articles": articles_payload,
            "fundamentals": fundamentals,
            "price_data": price_data,
            "price_error": price_error,
            "cached": False
        }

        # Cache the result (24-hour TTL)
        set_cached(cache_key, result, TTL_SENTIMENT)

        return success_response(result)
    except HTTPException:
        raise
    except Exception as exc:
        logging.exception("Sentiment analysis API failed for %s", ticker)
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc


# =============================================================================
# Async Sentiment Analysis (Celery-based) Endpoints
# =============================================================================

@fastapi_app.post("/api/sentiment-analysis/start", tags=["Sentiment"])
async def start_sentiment_analysis_async(request: Request, payload: SentimentAnalysisRequestBody):
    """
    Start async sentiment analysis task, returns task_id for SSE streaming.

    This endpoint submits sentiment analysis to a Celery worker, offloading
    the ML inference from the main API server. Use with /api/sentiment-analysis/stream/{task_id}
    for real-time progress updates.

    Args:
        payload: SentimentAnalysisRequestBody with ticker

    Returns:
        {"task_id": "uuid", "status": "PENDING", "message": "Analysis queued"}
    """
    from celery_tasks import run_sentiment_analysis_task

    ticker = payload.ticker.strip().upper()
    if not ticker:
        raise HTTPException(status_code=400, detail="Ticker is required")

    # Check Redis cache first - if cached, return immediately
    cache_key = make_sentiment_key(ticker)
    cached_result = get_cached(cache_key)
    if cached_result:
        logging.info(f"[SENTIMENT ASYNC] Cache hit for {ticker}, returning cached result")
        return success_response({
            "task_id": None,
            "status": "CACHED",
            "cached": True,
            "result": cached_result
        })

    # Per-user concurrent task limit
    user_id = get_task_user_id(request)
    tier = get_task_tier(request)
    if not check_task_limit(user_id, tier):
        raise HTTPException(status_code=429, detail="Too many concurrent tasks. Please wait for existing tasks to complete.")

    # Submit task to Celery
    increment_task_count(user_id)
    task = run_sentiment_analysis_task.delay(ticker, include_fundamentals=True)
    store_task_user(task.id, user_id)
    logging.info(f"[SENTIMENT ASYNC] Started task {task.id} for {ticker}")

    return success_response({
        "task_id": task.id,
        "status": "PENDING",
        "message": f"Sentiment analysis queued for {ticker}"
    })


@fastapi_app.get("/api/sentiment-analysis/status/{task_id}", tags=["Sentiment"])
async def get_sentiment_task_status(task_id: str):
    """
    Get current sentiment analysis task status.

    Returns task status and progress/result if available.
    """
    from celery.result import AsyncResult
    from celery_app import celery_app

    result = AsyncResult(task_id, app=celery_app)

    response = {
        "task_id": task_id,
        "status": result.status,
    }

    if result.status == 'PROGRESS':
        response["progress"] = result.info
    elif result.status == 'SUCCESS':
        response["result"] = result.result
    elif result.status == 'FAILURE':
        response["error"] = str(result.result)

    return success_response(response)


@fastapi_app.get("/api/sentiment-analysis/stream/{task_id}", tags=["Sentiment"])
async def stream_sentiment_progress(task_id: str):
    """
    SSE endpoint for streaming sentiment analysis progress in real-time.

    Events:
        - connected: Initial connection confirmation
        - status: Task status changed (PENDING, STARTED, PROGRESS, etc.)
        - progress: Progress update with phase and article counts
        - complete: Task completed successfully with result
        - error: Task failed with error message
        - cancelled: Task was revoked
    """
    from celery.result import AsyncResult
    from celery_app import celery_app

    async def event_generator():
        last_state = None
        last_progress = None
        heartbeat_counter = 0
        start_time = time.time()
        MAX_CONNECTION_TIME = 30 * 60  # 30 minutes max
        _decremented = False

        # Send connected event
        yield f"data: {json.dumps({'type': 'connected', 'task_id': task_id})}\n\n"

        while True:
            # Timeout protection: prevent infinite loop if task gets stuck
            if time.time() - start_time > MAX_CONNECTION_TIME:
                yield f"data: {json.dumps({'type': 'error', 'error': 'Stream timeout after 30 minutes'})}\n\n"
                if not _decremented:
                    cleanup_task_user(task_id)
                    _decremented = True
                break

            result = AsyncResult(task_id, app=celery_app)
            status = result.status

            # Send status change
            if status != last_state:
                yield f"data: {json.dumps({'type': 'status', 'status': status})}\n\n"
                last_state = status

            # Send progress update
            if status == 'PROGRESS' and result.info:
                meta = result.info
                current_progress = meta.get('progress')
                if current_progress != last_progress:
                    progress_data = {
                        'phase': meta.get('phase', 'analyzing'),
                        'articles_fetched': current_progress.get('articles_fetched', 0) if current_progress else 0,
                        'articles_analyzed': current_progress.get('articles_analyzed', 0) if current_progress else 0,
                        'total': current_progress.get('total', 0) if current_progress else 0,
                        'elapsed': meta.get('elapsed', 0),
                    }
                    yield f"data: {json.dumps({'type': 'progress', 'data': progress_data})}\n\n"
                    last_progress = current_progress.copy() if current_progress else None

            # Handle completion states
            if status == 'SUCCESS':
                task_result = result.result
                # Check if task returned an internal error
                if isinstance(task_result, dict) and task_result.get('status') == 'error':
                    yield f"data: {json.dumps({'type': 'error', 'error': task_result.get('error', 'Unknown error'), 'duration': task_result.get('duration')})}\n\n"
                else:
                    # Cache the result on success
                    if isinstance(task_result, dict) and task_result.get('status') == 'complete':
                        result_data = task_result.get('result', {})
                        ticker = result_data.get('ticker', '')
                        if ticker:
                            cache_key = make_sentiment_key(ticker)
                            set_cached(cache_key, result_data, TTL_SENTIMENT)
                            logging.info(f"[SENTIMENT ASYNC] Cached result for {ticker}")

                    yield f"data: {json.dumps({'type': 'complete', 'data': task_result})}\n\n"
                if not _decremented:
                    cleanup_task_user(task_id)
                    _decremented = True
                break
            elif status == 'FAILURE':
                error_msg = str(result.result) if result.result else "Unknown error"
                yield f"data: {json.dumps({'type': 'error', 'error': error_msg})}\n\n"
                if not _decremented:
                    cleanup_task_user(task_id)
                    _decremented = True
                break
            elif status == 'REVOKED':
                yield f"data: {json.dumps({'type': 'cancelled'})}\n\n"
                if not _decremented:
                    cleanup_task_user(task_id)
                    _decremented = True
                break

            # Heartbeat every 50 polls (~5 seconds at 100ms interval)
            heartbeat_counter += 1
            if heartbeat_counter % 50 == 0:
                yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"

            await asyncio.sleep(0.1)  # Poll every 100ms

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@fastapi_app.post("/api/sentiment-analysis/cancel/{task_id}", tags=["Sentiment"])
async def cancel_sentiment_task(task_id: str):
    """
    Cancel a running or pending sentiment analysis task.
    """
    from celery_app import celery_app

    celery_app.control.revoke(task_id, terminate=True)
    cleanup_task_user(task_id)
    logging.info(f"[SENTIMENT] Cancelled task {task_id}")

    return success_response({
        "task_id": task_id,
        "status": "CANCELLED",
        "message": "Task cancellation requested"
    })


@fastapi_app.get("/api/tickers", tags=["Market Data"])
async def tickers_api(limit: int = 5000):
    api_start = time.time()
    logging.info(f"[API] /api/tickers START (limit={limit})")
    try:
        # Try Redis cache first
        cache_key = f"tickers:list:{limit}"
        cached = get_cached(cache_key)
        if cached is not None:
            logging.info(f"[API] /api/tickers DONE (cache HIT) in {time.time() - api_start:.2f}s")
            return success_response(cached)

        logging.debug(f"[Cache] MISS for tickers list (limit={limit})")

        # Fetch from database
        tickers = fetch_tickers_from_db(limit=limit)
        if not tickers:
            logging.info(f"[API] /api/tickers DONE (empty) in {time.time() - api_start:.2f}s")
            return success_response([])

        # Cache for 1 hour (ticker list rarely changes)
        set_cached(cache_key, tickers, TTL_TICKERS)

        logging.info(f"[API] /api/tickers DONE (DB query) in {time.time() - api_start:.2f}s")
        return success_response(tickers)
    except Exception as exc:
        logging.exception(f"[API] /api/tickers FAILED in {time.time() - api_start:.2f}s")
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc


@fastapi_app.get("/api/tickers/with-hourly-data", tags=["Market Data"])
async def tickers_with_hourly_data_api(limit: int = 5000):
    """
    Fetch tickers that have 1hour timeframe data available.

    Args:
        limit: Maximum number of tickers to return (default: 5000)

    Returns:
        JSON with tickers array containing symbol, name, and long_name
    """
    api_start = time.time()
    logging.info(f"[API] /api/tickers/with-hourly-data START (limit={limit})")

    # Check cache first
    cache_key = f"tickers:hourly:{limit}"
    cached = get_cached(cache_key)
    if cached is not None:
        logging.info(f"[API] /api/tickers/with-hourly-data DONE (cache HIT) in {time.time() - api_start:.2f}s")
        return {"tickers": cached}

    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            # Optimized query using EXISTS instead of DISTINCT + JOIN
            # EXISTS with LIMIT 1 is much faster than scanning 15M+ rows
            query = """
                SELECT t.symbol, t.name, sf.long_name
                FROM tickers t
                LEFT JOIN stock_fundamentals sf ON t.id = sf.ticker_id
                WHERE t.is_active = true
                  AND EXISTS (
                      SELECT 1 FROM ohlc_1hour oh
                      WHERE oh.ticker_id = t.id
                      LIMIT 1
                  )
                ORDER BY t.symbol ASC
                LIMIT %s
            """
            cursor.execute(query, (limit,))
            rows = cursor.fetchall()

            tickers = []
            for row in rows:
                tickers.append({
                    "symbol": row["symbol"].upper().strip() if row["symbol"] else None,
                    "name": row["name"] if row["name"] else None,
                    "long_name": row["long_name"] if row["long_name"] else None
                })

            # Cache for 24 hours (ticker list with hourly data changes very rarely)
            set_cached(cache_key, tickers, TTL_TICKERS_HOURLY)

            logging.info(f"[API] /api/tickers/with-hourly-data DONE (DB query) in {time.time() - api_start:.2f}s ({len(tickers)} tickers)")
            return {"tickers": tickers}
    except Exception as exc:
        logging.exception(f"[API] /api/tickers/with-hourly-data FAILED in {time.time() - api_start:.2f}s")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        if conn:
            release_db_connection(conn)


@fastapi_app.get("/api/tickers/nse", tags=["Market Data"])
async def tickers_nse_api(limit: int = 5000):
    """
    Fetch NSE tickers with valid fundamentals data and .NS suffix.

    Args:
        limit: Maximum number of tickers to return (default: 5000)

    Returns:
        JSON with tickers array containing symbol (with .NS suffix) and name
    """
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            query = """
                SELECT DISTINCT t.symbol, t.name
                FROM tickers t
                INNER JOIN stock_fundamentals sf ON t.id = sf.ticker_id
                WHERE sf.current_price IS NOT NULL
                  AND sf.current_price > 0
                  AND t.exchange = 'NSE'
                  AND t.is_active = true
                ORDER BY t.symbol ASC
                LIMIT %s
            """
            cursor.execute(query, (limit,))
            rows = cursor.fetchall()

            tickers = []
            for row in rows:
                symbol = row["symbol"].upper().strip() if row["symbol"] else None
                if symbol:
                    # Add .NS suffix if not already present
                    if not symbol.endswith('.NS'):
                        symbol = f"{symbol}.NS"
                    tickers.append({
                        "symbol": symbol,
                        "name": row["name"] if row["name"] else None
                    })

            return list_response(tickers)
    except Exception as exc:
        logging.exception("NSE tickers API failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        if conn:
            release_db_connection(conn)


@fastapi_app.get("/api/market-status", tags=["Market Data"])
async def market_status_api():
    """
    Get current NSE market status (open/closed).

    Returns:
        JSON with market status information:
        - is_open: boolean indicating if market is currently open
        - status: "LIVE" or "CLOSED"
        - message: Human-readable status message
        - current_time: Current IST time
        - next_open: When market opens next (if closed)
    """
    try:
        status = get_market_status()
        return success_response(status)
    except Exception as exc:
        logging.exception("Market status API failed")
        # Return default closed status on error
        return success_response({
            "is_open": False,
            "status": "CLOSED",
            "message": "Unable to determine market status",
            "current_time": datetime.now().strftime("%I:%M %p IST")
        })


@fastapi_app.get("/api/marquee-stocks", tags=["Market Data"])
async def marquee_stocks_api(limit: int = 20):
    """
    Fetch top stocks by market cap with real-time LTP prices.
    Uses LTPDataAccessor for current intraday prices.

    Args:
        limit: Maximum number of stocks to return (default: 20)

    Returns:
        JSON with stocks array containing symbol, name, price, and change data
    """
    api_start = time.time()
    logging.info(f"[API] /api/marquee-stocks START (limit={limit})")
    conn = None
    try:
        conn = get_db_connection()

        # Initialize LTPDataAccessor
        ltp_accessor = LTPDataAccessor(conn)

        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            # Get top stocks by market cap
            query = """
                SELECT
                    t.id as ticker_id,
                    t.symbol,
                    t.name
                FROM tickers t
                INNER JOIN stock_fundamentals sf ON t.id = sf.ticker_id
                WHERE sf.market_cap IS NOT NULL
                    AND sf.market_cap > 0
                    AND t.is_active = true
                ORDER BY sf.market_cap DESC
                LIMIT %s
            """

            cursor.execute(query, (limit * 2,))  # Fetch extra in case some don't have LTP data
            ticker_rows = cursor.fetchall()

            if not ticker_rows:
                return {
                    "stocks": [],
                    "count": 0
                }

            # Extract ticker_ids for batch LTP fetch
            ticker_ids = [row['ticker_id'] for row in ticker_rows]

            # Batch fetch LTP data
            ltps_list = ltp_accessor.get_latest_ltps(ticker_ids)

            # Create lookup map: ticker_id -> ticker_row
            ticker_map = {row['ticker_id']: row for row in ticker_rows}

            # Create LTP lookup map
            ltp_map = {ltp['ticker_id']: ltp for ltp in ltps_list if ltp and ltp.get('ltp')}

            # Batch fetch fallback closes from ohlc_1hour for tickers with NULL close
            # This eliminates N+1 queries when close is missing
            fallback_ticker_ids = [
                ltp['ticker_id'] for ltp in ltps_list
                if ltp and ltp.get('ltp') and ltp.get('close') is None
            ]
            fallback_close_map = {}
            if fallback_ticker_ids:
                with conn.cursor() as ohlc_cursor:
                    ohlc_cursor.execute("""
                        SELECT DISTINCT ON (ticker_id) ticker_id, close
                        FROM ohlc_1hour
                        WHERE ticker_id = ANY(%s)
                        ORDER BY ticker_id, ts DESC
                    """, [fallback_ticker_ids])
                    for row in ohlc_cursor.fetchall():
                        if row[1]:
                            fallback_close_map[row[0]] = float(row[1])

            # Build stocks list with LTP data
            stocks = []
            for ltp_data in ltps_list:
                if not ltp_data or not ltp_data.get('ltp'):
                    continue

                ticker_id = ltp_data['ticker_id']
                ticker_info = ticker_map.get(ticker_id)

                if not ticker_info:
                    continue

                ltp = ltp_data['ltp']
                # Use pre-computed percent_change from v2 schema
                percent_change = ltp_data.get('percent_change') or 0
                previous_close = ltp_data.get('close')

                # Use batched fallback if close was NULL
                if previous_close is None:
                    previous_close = fallback_close_map.get(ticker_id)

                # Calculate change amount from percent_change
                if previous_close:
                    change = float(ltp - previous_close)
                else:
                    change = 0

                stock = {
                    'symbol': ticker_info['symbol'],
                    'name': ticker_info['name'],
                    'price': float(ltp) if ltp else None,
                    'previousClose': float(previous_close) if previous_close else None,
                    'change': change,
                    'changePercent': float(percent_change),  # Use pre-computed value
                }
                stocks.append(stock)

                # Stop once we have enough stocks with LTP data
                if len(stocks) >= limit:
                    break

            # If we don't have enough stocks from LTP, fallback to ohlc_1hour (batch query)
            if len(stocks) < limit:
                logging.info(f"Only {len(stocks)} stocks found in LTP data, fetching from ohlc_1hour for remaining")

                # Get ticker_ids that don't have LTP data
                ltp_ticker_ids = set(ltp_map.keys())
                remaining_ticker_ids = [tid for tid in ticker_ids if tid not in ltp_ticker_ids]

                # Batch fetch last 2 OHLC records for all remaining tickers
                ohlc_fallback_map = {}
                if remaining_ticker_ids:
                    with conn.cursor() as ohlc_cursor:
                        # Use window function to get last 2 closes per ticker in one query
                        ohlc_cursor.execute("""
                            WITH ranked AS (
                                SELECT ticker_id, close,
                                       ROW_NUMBER() OVER (PARTITION BY ticker_id ORDER BY ts DESC) as rn
                                FROM ohlc_1hour
                                WHERE ticker_id = ANY(%s)
                            )
                            SELECT ticker_id,
                                   MAX(CASE WHEN rn = 1 THEN close END) as latest_close,
                                   MAX(CASE WHEN rn = 2 THEN close END) as prev_close
                            FROM ranked
                            WHERE rn <= 2
                            GROUP BY ticker_id
                        """, [remaining_ticker_ids])
                        for row in ohlc_cursor.fetchall():
                            ohlc_fallback_map[row[0]] = {
                                'latest_close': float(row[1]) if row[1] else None,
                                'prev_close': float(row[2]) if row[2] else None
                            }

                for ticker_id in remaining_ticker_ids:
                    if len(stocks) >= limit:
                        break

                    ticker_info = ticker_map.get(ticker_id)
                    if not ticker_info:
                        continue

                    ohlc_data = ohlc_fallback_map.get(ticker_id)
                    if not ohlc_data:
                        continue

                    latest_close = ohlc_data['latest_close']
                    prev_close = ohlc_data['prev_close']

                    if latest_close and prev_close:
                        change = latest_close - prev_close
                        change_percent = (change / prev_close * 100) if prev_close else 0

                        stock = {
                            'symbol': ticker_info['symbol'],
                            'name': ticker_info['name'],
                            'price': latest_close,
                            'previousClose': prev_close,
                            'change': change,
                            'changePercent': change_percent,
                        }
                        stocks.append(stock)
                    elif latest_close:
                        # Only one record available, use it without change data
                        stock = {
                            'symbol': ticker_info['symbol'],
                            'name': ticker_info['name'],
                            'price': latest_close,
                            'previousClose': None,
                            'change': 0,
                            'changePercent': 0,
                        }
                        stocks.append(stock)

            logging.info(f"[API] /api/marquee-stocks DONE in {time.time() - api_start:.2f}s ({len(stocks)} stocks)")

            return list_response(stocks)
    except HTTPException:
        raise
    except Exception as exc:
        logging.exception(f"[API] /api/marquee-stocks FAILED in {time.time() - api_start:.2f}s")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch marquee stocks data: {str(exc)}"
        ) from exc
    finally:
        if conn:
            release_db_connection(conn)


@fastapi_app.get("/api/stock-ltp/{ticker_symbol}", tags=["Prices"])
async def stock_ltp_api(ticker_symbol: str):
    """
    Get the latest Last Traded Price (LTP) and intraday OHLC data for a stock.
    Uses LTPDataAccessor to support both ltp_data and ltp_data_ohlc tables.

    Redis caching: 90-second TTL (matches data update frequency of a few minutes).
    This reduces DB load by 80-90% for frequently requested tickers.

    Args:
        ticker_symbol: Stock ticker symbol (e.g., 'RELIANCE', 'TCS')

    Returns:
        JSON with symbol, ltp, open, high, low, close, timestamp, and changePercent
    """
    # Decode URL-encoded characters (e.g., M%26M → M&M)
    ticker_symbol = unquote(ticker_symbol)
    ticker_upper = ticker_symbol.upper().strip()
    if not ticker_upper:
        raise HTTPException(status_code=400, detail="Ticker symbol is required")

    # Check Redis cache first (90-second TTL for LTP data)
    cache_key = f"ltp:{ticker_upper}"
    cached_result = get_cached(cache_key)
    if cached_result:
        logging.debug(f"[CACHE HIT] LTP for {ticker_upper}")
        # Cache stores raw data (shared with bulk endpoint), wrap in envelope
        return success_response(cached_result) if "data" not in cached_result else cached_result

    # Extract blocking DB operations into sync function
    def _fetch_ltp():
        conn = None
        try:
            conn = get_db_connection()

            # Step 1: Lookup ticker_id from tickers table (same pattern as bulk endpoint)
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT id, symbol FROM tickers WHERE symbol = %s",
                    (ticker_upper,)
                )
                ticker_row = cursor.fetchone()

            if not ticker_row:
                raise HTTPException(
                    status_code=404,
                    detail=f"Symbol {ticker_upper} not found"
                )

            # Step 2: Use ticker_id to query ltp_live (same as bulk endpoint)
            ltp_accessor = LTPDataAccessor(conn)
            ltp_data = ltp_accessor.get_latest_ltp(ticker_row['id'])

            if not ltp_data:
                raise HTTPException(
                    status_code=404,
                    detail=f"No LTP data available for {ticker_upper}"
                )

            # Calculate percentage change
            change_percent = ltp_accessor.calculate_change_percent(ltp_data)

            # Prepare response
            response = {
                'symbol': ltp_data['symbol'],
                'ltp': ltp_data['ltp'],
                'open': ltp_data['open'],
                'high': ltp_data['high'],
                'low': ltp_data['low'],
                'close': ltp_data['close'],  # Today's close price
                'timestamp': ltp_data['timestamp'].isoformat() if ltp_data['timestamp'] else None,
                'changePercent': change_percent
            }

            logging.info(f"Stock LTP API returning data for {ticker_upper}: LTP={response['ltp']}, Change={change_percent}%")

            return response

        except HTTPException:
            raise
        except Exception as exc:
            logging.exception(f"Stock LTP API failed for {ticker_upper}")
            raise exc
        finally:
            if conn:
                release_db_connection(conn)

    # Run blocking operations in thread pool to avoid blocking event loop
    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _fetch_ltp)

        # Cache raw data (shared cache with bulk endpoint)
        set_cached(cache_key, result, 90)
        logging.debug(f"[CACHE SET] LTP for {ticker_upper}")

        return success_response(result)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch LTP data: {str(exc)}"
        ) from exc


class BulkLTPRequest(BaseModel):
    """Request model for bulk LTP data fetch."""
    symbols: List[str]


@fastapi_app.post("/api/stock-ltp/bulk", tags=["Prices"])
async def bulk_stock_ltp_api(request: BulkLTPRequest):
    """
    Get the latest Last Traded Price (LTP) for multiple stocks at once.
    Uses LTPDataAccessor to support both ltp_data and ltp_data_ohlc tables.

    Redis caching: Uses per-symbol caching (90s TTL) for better cache utilization.
    Only fetches from DB for symbols not found in cache.

    Args:
        request: JSON body with 'symbols' array of ticker symbols

    Returns:
        JSON dictionary with symbol as key and LTP data as value
        Example: {"RELIANCE": {"symbol": "RELIANCE", "ltp": 2500.50, ...}, ...}
    """
    if not request.symbols:
        raise HTTPException(status_code=400, detail="Symbols array is required")

    # Sanitize and uppercase symbols
    symbols_upper = [s.upper().strip() for s in request.symbols if s.strip()]

    if len(symbols_upper) > 100:
        raise HTTPException(
            status_code=400,
            detail="Maximum 100 symbols allowed per request"
        )

    # Check cache for each symbol - collect cached results and missing symbols
    result = {}
    symbols_to_fetch = []
    for symbol in symbols_upper:
        cache_key = f"ltp:{symbol}"
        cached = get_cached(cache_key)
        if cached:
            result[symbol] = cached
        else:
            symbols_to_fetch.append(symbol)

    # If all symbols were cached, return immediately
    if not symbols_to_fetch:
        logging.debug(f"[CACHE HIT] Bulk LTP - all {len(symbols_upper)} symbols from cache")
        return success_response(result)

    logging.debug(f"[CACHE PARTIAL] Bulk LTP - {len(result)} cached, {len(symbols_to_fetch)} to fetch")

    # Extract blocking DB operations into sync function (only for non-cached symbols)
    def _fetch_bulk_ltp():
        conn = None
        try:
            conn = get_db_connection()
            ltp_accessor = LTPDataAccessor(conn)

            # Get ticker IDs for symbols to fetch (not cached)
            placeholders = ','.join(['%s'] * len(symbols_to_fetch))
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    f"SELECT id, symbol FROM tickers WHERE symbol IN ({placeholders})",
                    symbols_to_fetch
                )
                ticker_map = {row['symbol']: row['id'] for row in cursor.fetchall()}

            # Fetch LTP data for all found tickers
            ticker_ids = list(ticker_map.values())
            if not ticker_ids:
                return {}

            ltps = ltp_accessor.get_latest_ltps(ticker_ids)

            # Build response dictionary and cache individual results
            fetched = {}
            for ltp_data in ltps:
                if ltp_data:
                    change_percent = ltp_accessor.calculate_change_percent(ltp_data)
                    ltp_result = {
                        'symbol': ltp_data['symbol'],
                        'ltp': ltp_data['ltp'],
                        'open': ltp_data['open'],
                        'high': ltp_data['high'],
                        'low': ltp_data['low'],
                        'close': ltp_data['close'],  # Today's close price
                        'timestamp': ltp_data['timestamp'].isoformat() if ltp_data['timestamp'] else None,
                        'percent_change': change_percent
                    }
                    fetched[ltp_data['symbol']] = ltp_result
                    # Cache individual result (90-second TTL)
                    set_cached(f"ltp:{ltp_data['symbol']}", ltp_result, 90)

            logging.info(f"Bulk LTP API fetched {len(fetched)}/{len(symbols_to_fetch)} from DB, {len(result)} from cache")
            return fetched

        except Exception as exc:
            logging.exception("Bulk stock LTP API failed")
            raise exc
        finally:
            if conn:
                release_db_connection(conn)

    # Run blocking operations in thread pool to avoid blocking event loop
    try:
        loop = asyncio.get_running_loop()
        fetched = await loop.run_in_executor(None, _fetch_bulk_ltp)
        # Merge cached results with freshly fetched results
        result.update(fetched)
        return success_response(result)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch bulk LTP data: {str(exc)}"
        ) from exc


@fastapi_app.get("/api/price-chart/{ticker_symbol}", tags=["Prices"])
async def price_chart_api(
    ticker_symbol: str,
    timeframe: str = "1day",
    months: float = 6
):
    """
    Get historical OHLC price data for a stock ticker.

    Args:
        ticker_symbol: Stock ticker symbol (e.g., 'RELIANCE', 'HDFCBANK', 'TCS')
        timeframe: Data timeframe - '1min', '1hour', '1day', '1week', '1month' (default: '1day')
        months: Number of months of historical data to fetch (default: 6)

    Returns:
        JSON with ticker, timeframe, and price_data array in candlestick format
    """
    # Decode URL-encoded characters (e.g., M%26M → M&M)
    ticker_symbol = unquote(ticker_symbol)
    # Strip .NS suffix (NSE stocks) - database stores symbols without suffix
    ticker_upper = ticker_symbol.upper().strip().replace('.NS', '')
    if not ticker_upper:
        raise HTTPException(status_code=400, detail="Ticker symbol is required")

    # Validate timeframe (updated to match available continuous aggregates)
    valid_timeframes = ['1min', '1hour', '1day', '1week', '1month']
    if timeframe not in valid_timeframes:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid timeframe. Must be one of: {', '.join(valid_timeframes)}"
        )

    conn = None
    try:
        conn = get_db_connection()

        # Look up ticker_id from tickers table
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT id, name FROM tickers WHERE UPPER(symbol) = %s AND is_active = true LIMIT 1",
                (ticker_upper,)
            )
            ticker_row = cursor.fetchone()

            if not ticker_row:
                return {
                    "ticker": ticker_upper,
                    "timeframe": timeframe,
                    "price_data": [],
                    "error": f"Ticker '{ticker_upper}' not found in database"
                }

            ticker_id = ticker_row['id']
            ticker_name = ticker_row['name']

        # Initialize TimeframeDataAccessor
        accessor = TimeframeDataAccessor(conn)

        # Calculate date range using IST timezone (NSE operates in IST)
        end_date = get_current_ist_time()

        # Special handling for intraday (1min) requests
        if months == 0 and timeframe == '1min':
            # For intraday, fetch entire current trading day (midnight IST to now)
            start_date = end_date.replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            start_date = end_date - timedelta(days=int(months * 30))

        # Dynamic limit based on range (more data for longer ranges)
        limit = 30000 if months > 24 else 10000

        # Fetch OHLC data
        ohlc_data = accessor.fetch_ohlc(
            ticker_id=ticker_id,
            timeframe=timeframe,
            start_date=start_date,
            end_date=end_date,
            limit=limit
        )

        # For 1min intraday, if today has no data, fall back to most recent single day
        if not ohlc_data and timeframe == '1min' and months == 0:
            fallback_start = end_date - timedelta(days=7)  # Look back 7 days
            all_fallback_data = accessor.fetch_ohlc(
                ticker_id=ticker_id,
                timeframe=timeframe,
                start_date=fallback_start,
                end_date=end_date,
                limit=5000
            )

            if all_fallback_data:
                # Find the most recent day with data and filter to only that day
                latest_timestamp = max(row['timestamp'] for row in all_fallback_data)
                if hasattr(latest_timestamp, 'date'):
                    latest_date = latest_timestamp.date()
                else:
                    latest_date = datetime.fromtimestamp(latest_timestamp, tz=timezone.utc).date()

                # Filter to only that day's data
                ohlc_data = [
                    row for row in all_fallback_data
                    if (row['timestamp'].date() if hasattr(row['timestamp'], 'date')
                        else datetime.fromtimestamp(row['timestamp'], tz=timezone.utc).date()) == latest_date
                ]
                logging.info(f"Intraday fallback: using {len(ohlc_data)} data points from {latest_date}")

        if not ohlc_data:
            return {
                "ticker": ticker_upper,
                "ticker_name": ticker_name,
                "timeframe": timeframe,
                "price_data": [],
                "error": f"No price data available for {ticker_upper} in timeframe {timeframe}"
            }

        # Transform data to candlestick format for frontend chart
        # NOTE: Timestamps are sent as UTC. Frontend handles IST conversion for display.
        price_data = []
        for row in ohlc_data:
            # Convert timestamp to Unix timestamp (seconds since epoch)
            ts = row['timestamp']
            if isinstance(ts, datetime):
                # Ensure timezone-aware datetime for correct UTC conversion
                if ts.tzinfo is None:
                    # Naive datetime from database - PostgreSQL timestamptz returns UTC
                    ts = ts.replace(tzinfo=timezone.utc)
                unix_time = int(ts.timestamp())
            else:
                unix_time = int(ts)

            price_data.append({
                'time': unix_time,
                'open': float(row['open']) if row['open'] else None,
                'high': float(row['high']) if row['high'] else None,
                'low': float(row['low']) if row['low'] else None,
                'close': float(row['close']) if row['close'] else None,
                'volume': float(row['volume']) if row['volume'] else None
            })

        # Sort by time (oldest to newest)
        price_data.sort(key=lambda x: x['time'])

        # Debug logging to verify timestamps
        if price_data:
            first_ts = price_data[0]['time']
            last_ts = price_data[-1]['time']
            first_utc = datetime.utcfromtimestamp(first_ts).strftime('%Y-%m-%d %H:%M:%S')
            last_utc = datetime.utcfromtimestamp(last_ts).strftime('%Y-%m-%d %H:%M:%S')
            # IST = UTC + 5:30
            first_ist = datetime.utcfromtimestamp(first_ts + 19800).strftime('%Y-%m-%d %H:%M:%S')
            last_ist = datetime.utcfromtimestamp(last_ts + 19800).strftime('%Y-%m-%d %H:%M:%S')
            logging.info(
                f"Price chart timestamps for {ticker_upper}: "
                f"first={first_utc} UTC ({first_ist} IST), last={last_utc} UTC ({last_ist} IST)"
            )

        logging.info(
            f"Price chart API returning {len(price_data)} data points for {ticker_upper} "
            f"({timeframe}, {months} months)"
        )

        return success_response({
            "ticker": ticker_upper,
            "ticker_name": ticker_name,
            "timeframe": timeframe,
            "price_data": price_data,
        })

    except HTTPException:
        raise
    except Exception as exc:
        logging.exception(f"Price chart API failed for {ticker_upper}")
        return success_response({
            "ticker": ticker_upper,
            "timeframe": timeframe,
            "price_data": [],
            "error": f"Failed to fetch price data: {str(exc)}"
        })
    finally:
        if conn:
            release_db_connection(conn)


# =============================================================================
# Quote API — Unified endpoint combining LTP + fundamentals + candles
# =============================================================================

def _build_quote(ticker_row: dict, ltp_data: Optional[dict], fundamentals: Optional[dict], candles: Optional[list] = None, timeframe: Optional[str] = None) -> dict:
    """Merge data from multiple sources into a single quote response."""
    symbol = ticker_row.get('symbol', '')
    exchange = ticker_row.get('exchange', 'NSE')

    # Base response from ticker table
    quote = {
        'symbol': symbol,
        'name': None,
        'exchange': exchange,
        'sector': None,
        'industry': None,
        'ohlc': {'open': None, 'high': None, 'low': None, 'close': None, 'volume': None},
        'ltp': None,
        'change': None,
        'change_percent': None,
        'market_cap': None,
        'pe_ratio': None,
        'pb_ratio': None,
        'dividend_yield': None,
        'week_52_high': None,
        'week_52_low': None,
        'lower_circuit': None,
        'upper_circuit': None,
        'timestamp': None,
    }

    # Overlay LTP data (real-time)
    if ltp_data:
        quote['ohlc'] = {
            'open': ltp_data.get('open'),
            'high': ltp_data.get('high'),
            'low': ltp_data.get('low'),
            'close': ltp_data.get('close'),  # prev day's close
            'volume': ltp_data.get('trade_volume'),
        }
        quote['ltp'] = ltp_data.get('ltp')
        quote['change_percent'] = ltp_data.get('percent_change')
        ltp_val = ltp_data.get('ltp')
        close_val = ltp_data.get('close')
        if ltp_val is not None and close_val is not None and close_val != 0:
            quote['change'] = round(ltp_val - close_val, 2)
        quote['week_52_high'] = ltp_data.get('week_52_high')
        quote['week_52_low'] = ltp_data.get('week_52_low')
        quote['lower_circuit'] = ltp_data.get('lower_circuit')
        quote['upper_circuit'] = ltp_data.get('upper_circuit')
        ts = ltp_data.get('timestamp')
        quote['timestamp'] = ts.isoformat() if hasattr(ts, 'isoformat') else ts

    # Overlay fundamentals
    if fundamentals:
        quote['name'] = fundamentals.get('long_name')
        quote['sector'] = fundamentals.get('sector')
        quote['industry'] = fundamentals.get('industry')
        quote['market_cap'] = fundamentals.get('market_cap')
        quote['pe_ratio'] = float(fundamentals['trailing_pe']) if fundamentals.get('trailing_pe') is not None else None
        quote['pb_ratio'] = float(fundamentals['price_to_book']) if fundamentals.get('price_to_book') is not None else None
        quote['dividend_yield'] = float(fundamentals['dividend_yield']) if fundamentals.get('dividend_yield') is not None else None
        # Fallback 52-week from fundamentals if ltp_live missing
        if quote['week_52_high'] is None:
            quote['week_52_high'] = fundamentals.get('fifty_two_week_high')
        if quote['week_52_low'] is None:
            quote['week_52_low'] = fundamentals.get('fifty_two_week_low')

    # Use ticker name as fallback if fundamentals had no long_name
    if not quote['name']:
        quote['name'] = ticker_row.get('name')

    # Optional candles
    if candles is not None and timeframe:
        quote['candles'] = candles
        quote['timeframe'] = timeframe
        quote['candle_count'] = len(candles)

    return quote


def _format_candles(ohlc_data: list) -> list:
    """Convert TimeframeDataAccessor output to {time, open, high, low, close, volume}."""
    result = []
    for row in ohlc_data:
        ts = row.get('timestamp')
        if isinstance(ts, datetime):
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            unix_time = int(ts.timestamp())
        else:
            unix_time = int(ts) if ts else 0
        result.append({
            'time': unix_time,
            'open': float(row['open']) if row.get('open') is not None else None,
            'high': float(row['high']) if row.get('high') is not None else None,
            'low': float(row['low']) if row.get('low') is not None else None,
            'close': float(row['close']) if row.get('close') is not None else None,
            'volume': float(row['volume']) if row.get('volume') is not None else None,
        })
    result.sort(key=lambda x: x['time'])
    return result


@fastapi_app.get("/api/quote/{symbol}", tags=["Prices"])
async def quote_api(
    symbol: str,
    timeframe: Optional[str] = None,
    months: float = 6
):
    """
    Get a unified stock quote combining real-time price, fundamentals, and optional historical candles.

    Merges data from ltp_live (real-time OHLC, LTP, change%), stock_fundamentals (market cap,
    PE, sector, industry), and optionally ohlc_* hypertables (historical candles).

    Args:
        symbol: Stock ticker symbol (e.g., 'RELIANCE', 'TCS', 'M%26M')
        timeframe: Optional — '1hour', '1day', '1week', '1month'. If provided, includes historical candles.
        months: Lookback period for candles (default: 6)

    Returns:
        Unified quote with OHLC, LTP, change, fundamentals, and optional candles array.
    """
    symbol = unquote(symbol).upper().strip().replace('.NS', '')
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")

    valid_timeframes = ['1hour', '1day', '1week', '1month']
    if timeframe and timeframe not in valid_timeframes:
        raise HTTPException(status_code=400, detail=f"Invalid timeframe. Must be one of: {', '.join(valid_timeframes)}")

    # Cache key includes timeframe if present
    cache_key = f"quote:{symbol}" if not timeframe else f"quote:{symbol}:{timeframe}:{int(months)}"
    ttl = TTL_QUOTE if not timeframe else TTL_QUOTE_HISTORICAL
    cached = get_cached(cache_key)
    if cached:
        return success_response(cached)

    def _fetch_quote():
        conn = None
        try:
            conn = get_db_connection()

            # 1. Ticker lookup
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT id, symbol, name, exchange FROM tickers WHERE symbol = %s AND is_active = true LIMIT 1", (symbol,))
                ticker_row = cur.fetchone()
            if not ticker_row:
                raise HTTPException(status_code=404, detail=f"Symbol '{symbol}' not found")

            ticker_id = ticker_row['id']

            # 2. LTP data
            ltp_accessor = LTPDataAccessor(conn)
            ltp_data = ltp_accessor.get_latest_ltp(ticker_id)

            # 3. Fundamentals (graceful — returns None on missing)
            fundamentals = None
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT long_name, sector, industry, market_cap, trailing_pe, price_to_book, "
                    "dividend_yield, fifty_two_week_high, fifty_two_week_low "
                    "FROM stock_fundamentals WHERE ticker_id = %s LIMIT 1",
                    (ticker_id,)
                )
                fundamentals = cur.fetchone()

            # 4. Historical candles (only if timeframe requested)
            candles = None
            if timeframe:
                accessor = TimeframeDataAccessor(conn)
                end_date = get_current_ist_time()
                start_date = end_date - timedelta(days=int(months * 30))
                ohlc_data = accessor.fetch_ohlc(
                    ticker_id=ticker_id,
                    timeframe=timeframe,
                    start_date=start_date,
                    end_date=end_date,
                    limit=10000
                )
                candles = _format_candles(ohlc_data)

            return _build_quote(ticker_row, ltp_data, fundamentals, candles, timeframe)

        except HTTPException:
            raise
        except Exception as exc:
            logging.exception(f"Quote API failed for {symbol}")
            raise exc
        finally:
            if conn:
                release_db_connection(conn)

    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _fetch_quote)
        set_cached(cache_key, result, ttl)
        return success_response(result)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch quote: {str(exc)}") from exc


class BulkQuoteRequest(BaseModel):
    """Request model for bulk quote fetch."""
    symbols: List[str]


@fastapi_app.post("/api/quote-bulk", tags=["Prices"])
async def quote_bulk_api(
    request: BulkQuoteRequest,
    timeframe: Optional[str] = None,
    months: float = 6
):
    """
    Get unified stock quotes for multiple symbols at once.

    Combines LTP, fundamentals, and optional candles for up to 50 symbols in a single request.
    Invalid symbols are collected in an errors array rather than failing the whole request.

    Args:
        request: JSON body with symbols array (max 50)
        timeframe: Optional — '1hour', '1day', '1week', '1month'
        months: Lookback period for candles (default: 6)

    Returns:
        { data: [...quotes], count: N, errors: [...] }
    """
    symbols = [unquote(s).upper().strip().replace('.NS', '') for s in request.symbols]
    symbols = [s for s in symbols if s]  # Remove empty

    if not symbols:
        raise HTTPException(status_code=400, detail="At least one symbol is required")
    if len(symbols) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 symbols per request")

    valid_timeframes = ['1hour', '1day', '1week', '1month']
    if timeframe and timeframe not in valid_timeframes:
        raise HTTPException(status_code=400, detail=f"Invalid timeframe. Must be one of: {', '.join(valid_timeframes)}")

    # Check cache for each symbol
    cache_keys = {}
    for s in symbols:
        key = f"quote:{s}" if not timeframe else f"quote:{s}:{timeframe}:{int(months)}"
        cache_keys[s] = key

    cached_results = get_cached_bulk(list(cache_keys.values()))
    # Map back: key -> symbol
    key_to_symbol = {v: k for k, v in cache_keys.items()}

    cached_quotes = {}
    for key, val in cached_results.items():
        sym = key_to_symbol.get(key)
        if sym:
            cached_quotes[sym] = val

    missing_symbols = [s for s in symbols if s not in cached_quotes]

    fresh_quotes = {}
    errors = []

    if missing_symbols:
        def _fetch_bulk():
            conn = None
            try:
                conn = get_db_connection()
                results = {}
                fetch_errors = []

                # 1. Batch ticker lookup
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(
                        "SELECT id, symbol, name, exchange FROM tickers WHERE symbol = ANY(%s) AND is_active = true",
                        (missing_symbols,)
                    )
                    tickers = {row['symbol']: row for row in cur.fetchall()}

                # Collect not-found symbols
                for s in missing_symbols:
                    if s not in tickers:
                        fetch_errors.append(f"{s}: ticker not found")

                if not tickers:
                    return results, fetch_errors

                ticker_ids = [t['id'] for t in tickers.values()]

                # 2. Batch LTP
                ltp_accessor = LTPDataAccessor(conn)
                ltp_list = ltp_accessor.get_latest_ltps(ticker_ids)
                ltp_map = {d['ticker_id']: d for d in ltp_list}

                # 3. Batch fundamentals
                fund_map = {}
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(
                        "SELECT ticker_id, long_name, sector, industry, market_cap, trailing_pe, "
                        "price_to_book, dividend_yield, fifty_two_week_high, fifty_two_week_low "
                        "FROM stock_fundamentals WHERE ticker_id = ANY(%s)",
                        (ticker_ids,)
                    )
                    for row in cur.fetchall():
                        fund_map[row['ticker_id']] = row

                # 4. Batch candles (only if timeframe)
                candle_map = {}
                if timeframe:
                    accessor = TimeframeDataAccessor(conn)
                    end_date = get_current_ist_time()
                    start_date = end_date - timedelta(days=int(months * 30))
                    raw_candles = accessor.fetch_ohlc_bulk(
                        ticker_ids=ticker_ids,
                        timeframe=timeframe,
                        start_date=start_date,
                        end_date=end_date,
                        limit=10000
                    )
                    for tid, rows in raw_candles.items():
                        candle_map[tid] = _format_candles(rows)

                # Build quotes
                for sym, ticker_row in tickers.items():
                    tid = ticker_row['id']
                    ltp_data = ltp_map.get(tid)
                    fundamentals = fund_map.get(tid)
                    candles = candle_map.get(tid) if timeframe else None
                    results[sym] = _build_quote(ticker_row, ltp_data, fundamentals, candles, timeframe)

                return results, fetch_errors

            except Exception as exc:
                logging.exception("Bulk quote API failed")
                raise exc
            finally:
                if conn:
                    release_db_connection(conn)

        try:
            loop = asyncio.get_running_loop()
            fresh_quotes, errors = await loop.run_in_executor(None, _fetch_bulk)

            # Cache individually
            ttl = TTL_QUOTE if not timeframe else TTL_QUOTE_HISTORICAL
            for sym, quote_data in fresh_quotes.items():
                set_cached(cache_keys[sym], quote_data, ttl)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to fetch quotes: {str(exc)}") from exc

    # Merge cached + fresh, maintain request order
    all_quotes = []
    for s in symbols:
        if s in cached_quotes:
            all_quotes.append(cached_quotes[s])
        elif s in fresh_quotes:
            all_quotes.append(fresh_quotes[s])

    return success_response({
        "data": all_quotes,
        "count": len(all_quotes),
        "errors": errors if errors else None,
    })


@fastapi_app.get("/api/market-movers", tags=["Market Data"])
async def market_movers_api(
    category: Optional[str] = None,
    limit: int = 10
):
    """
    Fetch market gainers/losers data from the market_movers_live table.
    Results are cached for 5 minutes (TTL_MARKET_MOVERS).

    Args:
        category: Filter by category (GAINER or LOSER)
        limit: Maximum number of results to return (default: 10)

    Returns:
        JSON with data array and count
    """
    api_start = time.time()
    logging.info(f"[API] /api/market-movers START (category={category}, limit={limit})")

    # Build cache key based on parameters
    cache_key = f"market_movers:{category or 'all'}:{limit}"

    # Try to get from cache
    cached = get_cached(cache_key)
    if cached is not None:
        logging.info(f"[API] /api/market-movers DONE (cache HIT) in {time.time() - api_start:.2f}s")
        return cached

    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            # Build dynamic query with JOIN to stock_fundamentals for hover data
            query = """
                SELECT
                    m.*,
                    f.market_cap,
                    f.trailing_pe,
                    f.price_to_book,
                    f.dividend_yield,
                    f.sector,
                    f.industry,
                    f.long_name
                FROM market_movers_live m
                LEFT JOIN stock_fundamentals f ON m.ticker_id = f.ticker_id
                WHERE 1=1
            """
            params = []

            if category:
                query += " AND m.category = %s"
                params.append(category.upper())

            # Order by rank (ascending) to get top movers
            query += " ORDER BY m.rank ASC LIMIT %s"
            params.append(limit)

            cursor.execute(query, params)
            rows = cursor.fetchall()

            # Convert Decimal to float for JSON serialization
            data = []
            for row in rows:
                row_dict = dict(row)
                # Convert Decimal fields to float (including joined fundamentals)
                decimal_fields = [
                    'ltp', 'change_percent', 'change_amount',
                    'lower_circuit', 'upper_circuit', 'week_52_low', 'week_52_high', 'proximity_percent',
                    'market_cap', 'trailing_pe', 'price_to_book', 'dividend_yield'
                ]
                for field in decimal_fields:
                    if field in row_dict and isinstance(row_dict[field], Decimal):
                        row_dict[field] = float(row_dict[field])
                # Convert timestamp to ISO format string
                if 'snapshot_time' in row_dict and row_dict['snapshot_time']:
                    row_dict['snapshot_time'] = row_dict['snapshot_time'].isoformat()
                data.append(row_dict)

            result = list_response(data)

            # Cache the result
            set_cached(cache_key, result, TTL_MARKET_MOVERS)

            logging.info(f"[API] /api/market-movers DONE (DB query) in {time.time() - api_start:.2f}s")
            return result
    except Exception as exc:
        logging.exception(f"[API] /api/market-movers FAILED in {time.time() - api_start:.2f}s")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch market movers data: {str(exc)}"
        ) from exc
    finally:
        if conn:
            release_db_connection(conn)


@fastapi_app.get("/api/market-mood", tags=["Market Data"])
async def market_mood_api():
    """
    Get current Fear & Greed Index data with 5-day history.

    Returns:
        JSON with:
        - status: "live", "stale", or "default"
        - current: { value, category, timestamp }
        - history: Array of last 5 days with { date, value, category }
        - error: Error message if calculation failed (or null)

    This endpoint:
    - Returns cached data if < 15 minutes since last calculation
    - Recalculates if >= 15 minutes passed (on-demand lazy update)
    - Never fails - always returns valid data (failsafe with defaults)
    """
    api_start = time.time()
    logging.info("[API] /api/market-mood START")
    try:
        # Wait for initialization if in progress (max 2 seconds - reduced from 5)
        # This prevents returning empty default data during startup
        wait_start = time.time()
        while fear_greed_initializing and (time.time() - wait_start) < 2.0:
            await asyncio.sleep(0.1)  # 100ms polling

        if time.time() - wait_start >= 0.1:
            logging.info(f"[API] /api/market-mood: Waited {time.time() - wait_start:.1f}s for initialization")

        # Check if recalculation is needed (15 min threshold)
        if should_recalculate():
            logging.info("[API] /api/market-mood: Triggering recalculation (15+ min passed)")
            # Use async wrapper to avoid blocking event loop during yfinance download
            await update_fear_greed_cache_async()
        else:
            logging.debug("[API] /api/market-mood: Using cached data (< 15 min)")

        # Get cached data (always valid)
        data = get_fear_greed_data()

        logging.info(f"[API] /api/market-mood DONE in {time.time() - api_start:.2f}s")
        return success_response(data)

    except Exception as e:
        # Fallback: return last known good state from cache
        logging.error(f"[API] Market mood endpoint error: {e}", exc_info=True)
        try:
            return success_response(get_fear_greed_data())
        except Exception as inner_e:
            # Ultimate fallback: return default neutral state
            logging.error(f"[API] Failed to get cache, returning default: {inner_e}")
            return success_response({
                "status": "default",
                "current": {
                    "value": 50.0,
                    "category": "Neutral",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
                "history": [
                    {
                        "date": (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d"),
                        "value": 50.0,
                        "category": "Neutral",
                    }
                    for i in range(4, -1, -1)
                ],
                "error": "Service temporarily unavailable",
            })


@fastapi_app.get("/api/news", tags=["Market Data"])
async def news_api(limit: int = 20, page: int = 1):
    """
    Fetch general market news from multiple sources (Zerodha Pulse + Google News) with pagination.

    Query params:
    - limit: Number of articles per page (default: 20, max: 50)
    - page: Page number (default: 1)

    Returns:
        JSON with:
        - articles: Array of articles for current page
        - count: Number of articles in this page
        - total_count: Total number of articles available
        - page: Current page number
        - total_pages: Total number of pages
        - fetched_at: Timestamp of when articles were fetched
    """
    api_start = time.time()
    logging.info(f"[API] /api/news START (limit={limit}, page={page})")

    # Cap limit per page to 50
    limit = min(max(limit, 1), 50)
    page = max(page, 1)

    # Check cache for full article list (5 minute TTL)
    cache_key = "news:all"
    cached = get_cached(cache_key)

    if cached is None:
        try:
            # Fetch from all sources (Zerodha Pulse + Google News) with deduplication
            articles, fetched_at = await fetch_all_news_async()
            if not articles:
                raise RuntimeError("No articles fetched from any news source")
            cached = {
                "articles": articles,
                "fetched_at": fetched_at.isoformat()
            }
            # Cache the full merged list (5 minutes)
            set_cached(cache_key, cached, TTL_SEARCH_RESULTS)
            logging.info(f"[API] /api/news fetch complete ({len(articles)} articles from all sources)")
        except Exception as exc:
            logging.exception(f"[API] /api/news FAILED in {time.time() - api_start:.2f}s")
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    # Paginate from cached articles
    all_articles = cached["articles"]
    total_count = len(all_articles)
    total_pages = max(1, (total_count + limit - 1) // limit)

    # Clamp page to valid range
    page = min(page, total_pages)

    # Slice articles for current page
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    page_articles = all_articles[start_idx:end_idx]

    meta = {
        "count": len(page_articles),
        "total": total_count,
        "page": page,
        "limit": limit,
        "has_more": page < total_pages,
        "total_pages": total_pages,
        "fetched_at": cached["fetched_at"]
    }
    result = {"data": page_articles, "meta": meta}

    logging.info(f"[API] /api/news DONE in {time.time() - api_start:.2f}s (page {page}/{total_pages}, {len(page_articles)} articles)")
    return result


@fastapi_app.get("/api/indices", tags=["Market Data"])
async def indices_api(limit: Optional[int] = None):
    """
    Fetch market indices (AMXIDX instruments) with real-time price data.

    Query params:
    - limit: Optional limit on number of indices to return (default: all 57)
             First N indices are returned (ordered by importance)

    Uses fallback pattern:
    1. Primary: ltp_live table (real-time LTP)
    2. Fallback 1: ohlc_1min_intraday (latest 1-min candle)
    3. Fallback 2: ohlc_1hour (latest hourly candle)

    Returns:
        JSON with data array matching Index interface:
        { id, name, symbol, value, change, changePercent }
    """
    api_start = time.time()
    logging.info(f"[API] /api/indices START (limit={limit})")

    # Complete list of all AMXIDX market indices from instrument_list.csv
    # Ordered by importance: major benchmarks first, then sectoral, then specialized
    # TODO: Future improvement - use instrument_type column for dynamic filtering
    # IMPORTANT: These symbols MUST match exactly with ltp_live table symbols
    KNOWN_INDICES = [
        # Major Benchmark Indices (Top 6 - displayed on home page)
        'Nifty 50',                 # Nifty
        'Nifty Bank',               # Bank Nifty
        'India VIX',                # VIX
        'Nifty Midcap 50',          # Nifty Midcap
        'Nifty 100',                # Nifty 100
        'HangSeng BeES-NAV',        # HangSeng

        # Other Major Indices
        'Nifty Fin Service',        # Nifty Financial Services
        'Nifty IT',                 # IT sector
        'Nifty 200',
        'Nifty 500',
        'Nifty Next 50',            # Nifty Next 50
        'NIFTY MID SELECT',         # Nifty Mid Select

        # Market Cap Indices
        'NIFTY MIDCAP 100',
        'NIFTY MIDCAP 150',
        'NIFTY SMLCAP 50',
        'NIFTY SMLCAP 100',
        'NIFTY SMLCAP 250',
        'NIFTY MIDSML 400',

        # Sectoral Indices
        'Nifty Auto',
        'Nifty Pharma',
        'Nifty FMCG',
        'Nifty Metal',
        'Nifty Realty',
        'Nifty Energy',
        'Nifty Media',
        'Nifty Infra',
        'Nifty PSU Bank',
        'Nifty Pvt Bank',
        'Nifty Serv Sector',
        'Nifty Commodities',
        'Nifty Consumption',
        'Nifty PSE',                # Public Sector Enterprises
        'Nifty MNC',                # Multinational Corporations

        # Thematic & Strategy Indices
        'Nifty CPSE',               # Central Public Sector Enterprises
        'Nifty Div Opps 50',        # Dividend Opportunities
        'NIFTY Alpha 50',
        'Nifty GrowSect 15',        # Growth Sectors 15
        'Nifty50 Value 20',
        'NIFTY100 Qualty30',        # Quality 30
        'NIFTY200 QUALTY30',        # Quality 30 (200)
        'NIFTY100 LowVol30',        # Low Volatility 30
        'Nifty100 Liq 15',          # Liquid 15
        'Nifty Mid Liq 15',         # Mid Liquid 15

        # Equal Weight Indices
        'NIFTY50 EQL Wgt',
        'NIFTY100 EQL Wgt',

        # Leveraged & Inverse Indices
        'Nifty50 PR 2x Lev',        # Price Return 2x Leveraged
        'Nifty50 PR 1x Inv',        # Price Return 1x Inverse
        'Nifty50 TR 2x Lev',        # Total Return 2x Leveraged
        'Nifty50 TR 1x Inv',        # Total Return 1x Inverse

        # Dividend & Return Indices
        'Nifty50 Div Point',        # Dividend Points

        # Government Securities Indices
        'Nifty GS 4 8Yr',           # Govt Securities 4-8 Year
        'Nifty GS 8 13Yr',          # Govt Securities 8-13 Year
        'Nifty GS 10Yr',            # Govt Securities 10 Year
        'Nifty GS 10Yr Cln',        # Govt Securities 10 Year Clean
        'Nifty GS 11 15Yr',         # Govt Securities 11-15 Year
        'Nifty GS 15YrPlus',        # Govt Securities 15+ Year
        'Nifty GS Compsite',        # Govt Securities Composite
    ]

    # Build cache key based on limit parameter
    cache_key = f"indices:{limit or 'all'}"

    # Try to get from cache (1-minute TTL for real-time price data)
    cached = get_cached(cache_key)
    if cached is not None:
        logging.info(f"[API] /api/indices DONE (cache HIT) in {time.time() - api_start:.2f}s")
        return cached

    conn = None
    try:
        conn = get_db_connection()
        ltp_accessor = LTPDataAccessor(conn)

        # Fetch ticker information for known indices
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                SELECT id, symbol, name, token
                FROM tickers
                WHERE symbol = ANY(%s)
            """, (KNOWN_INDICES,))

            tickers_by_symbol = {t['symbol']: t for t in cursor.fetchall()}

        # Build list of ticker_ids for batch LTP fetch
        ticker_ids = []
        ticker_id_to_symbol = {}
        for symbol in KNOWN_INDICES:
            ticker = tickers_by_symbol.get(symbol)
            if ticker:
                ticker_ids.append(ticker['id'])
                ticker_id_to_symbol[ticker['id']] = symbol

        # Batch fetch LTP data for all indices
        ltps_list = ltp_accessor.get_latest_ltps(ticker_ids)
        ltp_map = {ltp['ticker_id']: ltp for ltp in ltps_list if ltp and ltp.get('ltp')}

        # Batch fetch fallback closes from ohlc_1hour for indices with NULL close
        fallback_ticker_ids = [
            ltp['ticker_id'] for ltp in ltps_list
            if ltp and ltp.get('ltp') and ltp.get('close') is None
        ]
        fallback_close_map = {}
        if fallback_ticker_ids:
            with conn.cursor() as ohlc_cursor:
                ohlc_cursor.execute("""
                    SELECT DISTINCT ON (ticker_id) ticker_id, close
                    FROM ohlc_1hour
                    WHERE ticker_id = ANY(%s)
                    ORDER BY ticker_id, ts DESC
                """, [fallback_ticker_ids])
                for row in ohlc_cursor.fetchall():
                    if row[1]:
                        fallback_close_map[row[0]] = float(row[1])

        # Identify indices without LTP data for ohlc_1hour fallback
        missing_ltp_ids = [tid for tid in ticker_ids if tid not in ltp_map]
        ohlc_fallback_map = {}
        if missing_ltp_ids:
            with conn.cursor() as ohlc_cursor:
                # Get latest close and previous close from ohlc_1hour
                ohlc_cursor.execute("""
                    WITH ranked AS (
                        SELECT ticker_id, close,
                               ROW_NUMBER() OVER (PARTITION BY ticker_id ORDER BY ts DESC) as rn
                        FROM ohlc_1hour
                        WHERE ticker_id = ANY(%s)
                    )
                    SELECT ticker_id,
                           MAX(CASE WHEN rn = 1 THEN close END) as latest_close,
                           MAX(CASE WHEN rn = 2 THEN close END) as prev_close
                    FROM ranked
                    WHERE rn <= 2
                    GROUP BY ticker_id
                """, [missing_ltp_ids])
                for row in ohlc_cursor.fetchall():
                    ohlc_fallback_map[row[0]] = {
                        'latest_close': float(row[1]) if row[1] else None,
                        'prev_close': float(row[2]) if row[2] else None
                    }

        indices_data = []

        # Iterate in KNOWN_INDICES order to maintain priority
        for symbol in KNOWN_INDICES:
            ticker = tickers_by_symbol.get(symbol)
            if not ticker:
                continue
            ticker_id = ticker['id']
            symbol = ticker['symbol']
            name = ticker['name']

            current_price = None
            prev_close = None
            data_source = None

            # Try 1: ltp_live table (primary source) - from batch fetch
            ltp_data = ltp_map.get(ticker_id)
            ltp_percent_change = None  # Pre-computed percent_change from v2 schema
            if ltp_data:
                current_price = float(ltp_data['ltp'])
                ltp_percent_change = ltp_data.get('percent_change')  # v2 schema: pre-computed
                # Use close field (= prev_close in v2 schema) for change calculation
                if ltp_data.get('close'):
                    prev_close = float(ltp_data['close'])
                else:
                    # Use batched fallback if close was NULL
                    prev_close = fallback_close_map.get(ticker_id)
                data_source = 'ltp_live'

            # Try 2: ohlc_1hour fallback - from batch fetch
            if current_price is None:
                ohlc_data = ohlc_fallback_map.get(ticker_id)
                if ohlc_data and ohlc_data.get('latest_close'):
                    current_price = ohlc_data['latest_close']
                    prev_close = ohlc_data.get('prev_close')
                    data_source = 'ohlc_1hour'

            # Skip this index if no price data is available
            if current_price is None:
                logging.warning(f"No price data available for index: {symbol}")
                continue

            # Calculate change and changePercent
            change = 0.0
            change_percent = 0.0

            # Prefer pre-computed percent_change from ltp_live v2 schema
            if ltp_percent_change is not None:
                change_percent = float(ltp_percent_change)
                if prev_close and prev_close > 0:
                    change = current_price - prev_close
            elif prev_close and prev_close > 0:
                change = current_price - prev_close
                change_percent = (change / prev_close) * 100

            # Build response matching Index interface
            indices_data.append({
                'id': str(ticker_id),
                'symbol': symbol,
                'name': name,
                'value': round(current_price, 2),
                'change': round(change, 2),
                'changePercent': round(change_percent, 2),
                '_dataSource': data_source  # Internal field for debugging
            })

        # Apply limit if specified (for home page top 6 display)
        if limit is not None and limit > 0:
            indices_data = indices_data[:limit]

        result = list_response(indices_data)

        # Cache the result (1-minute TTL for real-time price data)
        set_cached(cache_key, result, TTL_STOCK_LTP)

        logging.info(f"[API] /api/indices DONE (DB query) in {time.time() - api_start:.2f}s ({len(indices_data)} indices)")
        return result

    except Exception as exc:
        logging.exception(f"[API] /api/indices FAILED in {time.time() - api_start:.2f}s")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch indices data: {str(exc)}"
        ) from exc
    finally:
        if conn:
            release_db_connection(conn)


@fastapi_app.get("/api/indices/{symbol}", tags=["Market Data"])
async def index_detail_api(symbol: str):
    """
    Fetch detailed information for a specific market index.

    Path params:
    - symbol: The index symbol (e.g., "Nifty 50", "Nifty Bank")

    Returns:
    - basic_info: id, symbol, name, exchange, suffix
    - price_data: current_value, previous_close, change, change_percent, open, day_high, day_low, volume, timestamp
    - range_52w: high, low, high_date, low_date (calculated from ohlc_daily)
    """
    api_start = time.time()
    logging.info(f"[API] /api/indices/{symbol} START")

    # Try to get from cache (2-minute TTL)
    cache_key = f"index_detail:{symbol}"
    cached = get_cached(cache_key)
    if cached is not None:
        logging.info(f"[API] /api/indices/{symbol} DONE (cache HIT) in {time.time() - api_start:.2f}s")
        return success_response(cached)

    conn = None
    try:
        conn = get_db_connection()

        # 1. Fetch basic info from tickers table
        # Accept both -INDEX and -NAV suffixes (some indices like HangSeng BeES-NAV have -NAV suffix)
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                SELECT id, symbol, name, exchange, suffix, token
                FROM tickers
                WHERE symbol = %s AND suffix IN ('-INDEX', '-NAV')
            """, (symbol,))
            ticker = cursor.fetchone()

        if not ticker:
            raise HTTPException(
                status_code=404,
                detail=f"Index not found: {symbol}"
            )

        ticker_id = ticker['id']

        # 2. Fetch LTP data from ltp_live table
        ltp_accessor = LTPDataAccessor(conn)
        ltp_data = ltp_accessor.get_latest_ltp(ticker_id)

        # 3. Calculate 52-week high/low from ohlc_daily
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                WITH week_52_data AS (
                    SELECT high, low, day
                    FROM ohlc_daily
                    WHERE ticker_id = %s
                      AND day >= NOW() - INTERVAL '52 weeks'
                )
                SELECT
                    MAX(high) as high_52w,
                    MIN(low) as low_52w,
                    (SELECT day FROM week_52_data WHERE high = (SELECT MAX(high) FROM week_52_data) LIMIT 1) as high_date,
                    (SELECT day FROM week_52_data WHERE low = (SELECT MIN(low) FROM week_52_data) LIMIT 1) as low_date
                FROM week_52_data
            """, (ticker_id,))
            range_52w_row = cursor.fetchone()

        # Build price_data from LTP
        current_value = None
        previous_close = None
        open_price = None
        day_high = None
        day_low = None
        volume = None
        timestamp = None

        if ltp_data:
            current_value = float(ltp_data['ltp']) if ltp_data.get('ltp') else None
            previous_close = float(ltp_data['close']) if ltp_data.get('close') else None
            open_price = float(ltp_data['open']) if ltp_data.get('open') else None
            day_high = float(ltp_data['high']) if ltp_data.get('high') else None
            day_low = float(ltp_data['low']) if ltp_data.get('low') else None
            volume = int(ltp_data['volume']) if ltp_data.get('volume') else None
            timestamp = ltp_data.get('timestamp').isoformat() if ltp_data.get('timestamp') else None

        # Fallback to ohlc_1hour if no LTP data
        if current_value is None:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT close, open, high, low, volume, ts
                    FROM ohlc_1hour
                    WHERE ticker_id = %s
                    ORDER BY ts DESC
                    LIMIT 1
                """, (ticker_id,))
                ohlc_row = cursor.fetchone()
                if ohlc_row:
                    current_value = float(ohlc_row['close']) if ohlc_row.get('close') else None
                    open_price = float(ohlc_row['open']) if ohlc_row.get('open') else None
                    day_high = float(ohlc_row['high']) if ohlc_row.get('high') else None
                    day_low = float(ohlc_row['low']) if ohlc_row.get('low') else None
                    volume = int(ohlc_row['volume']) if ohlc_row.get('volume') else None
                    timestamp = ohlc_row.get('ts').isoformat() if ohlc_row.get('ts') else None

        if current_value is None:
            raise HTTPException(
                status_code=404,
                detail=f"No price data available for index: {symbol}"
            )

        # Calculate change and change_percent
        change = 0.0
        change_percent = 0.0
        if previous_close and previous_close > 0:
            change = current_value - previous_close
            change_percent = (change / previous_close) * 100

        # Build response
        result = {
            "symbol": ticker['symbol'],
            "basic_info": {
                "id": ticker['id'],
                "symbol": ticker['symbol'],
                "name": ticker['name'],
                "exchange": ticker['exchange'] or "NSE",
                "suffix": ticker['suffix']
            },
            "price_data": {
                "current_value": round(current_value, 2) if current_value else None,
                "previous_close": round(previous_close, 2) if previous_close else None,
                "change": round(change, 2),
                "change_percent": round(change_percent, 2),
                "open": round(open_price, 2) if open_price else None,
                "day_high": round(day_high, 2) if day_high else None,
                "day_low": round(day_low, 2) if day_low else None,
                "volume": volume,
                "timestamp": timestamp
            },
            "range_52w": {
                "high": round(float(range_52w_row['high_52w']), 2) if range_52w_row and range_52w_row.get('high_52w') else None,
                "low": round(float(range_52w_row['low_52w']), 2) if range_52w_row and range_52w_row.get('low_52w') else None,
                "high_date": range_52w_row['high_date'].isoformat() if range_52w_row and range_52w_row.get('high_date') else None,
                "low_date": range_52w_row['low_date'].isoformat() if range_52w_row and range_52w_row.get('low_date') else None
            }
        }

        # Cache the result (2-minute TTL)
        set_cached(cache_key, result, 120)

        logging.info(f"[API] /api/indices/{symbol} DONE in {time.time() - api_start:.2f}s")
        return success_response(result)

    except HTTPException:
        raise
    except Exception as exc:
        logging.exception(f"[API] /api/indices/{symbol} FAILED in {time.time() - api_start:.2f}s")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch index detail: {str(exc)}"
        ) from exc
    finally:
        if conn:
            release_db_connection(conn)


@fastapi_app.get("/api/stocks", tags=["Market Data"])
async def stocks_api(
    cap_type: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 30
):
    """
    Fetch stocks from tickers and stock_fundamentals tables with real-time LTP prices.

    Query params:
    - cap_type: 'all', 'large', 'mid', 'small' (optional)
    - search: search term for symbol or name (optional)
    - page: page number (default 1)
    - limit: items per page (default 30)

    Market cap ranges (Indian standards):
    - Large Cap: > ₹200 billion (₹20,000 crores)
    - Mid Cap: ₹50-200 billion (₹5,000-20,000 crores)
    - Small Cap: < ₹50 billion (₹5,000 crores)

    Performance optimization:
    - Fundamentals data (static) cached in Redis for 1 hour
    - LTP data (real-time) always fetched fresh
    """
    start_time = time.time()
    cache_hit = False

    try:
        # Step 1: Try to get cached fundamentals data
        cached_fundamentals = _get_cached_fundamentals(cap_type, search, page, limit)

        if cached_fundamentals:
            cache_hit = True
            fundamentals_rows = cached_fundamentals.get("rows", [])
            total = cached_fundamentals.get("total", 0)
            ticker_ids = [row["id"] for row in fundamentals_rows]
            logging.info(f"[CACHE HIT] Fundamentals for cap={cap_type}, search={search}, page={page}")
        else:
            # Step 2: Query database for fundamentals (static data)
            conn = get_db_connection()
            try:
                with conn.cursor() as cur:
                    where_conditions = []
                    params = []

                    # Market cap filter
                    if cap_type and cap_type != 'all':
                        if cap_type == 'large':
                            where_conditions.append("sf.market_cap > 200000000000")
                        elif cap_type == 'mid':
                            where_conditions.append("sf.market_cap BETWEEN 50000000000 AND 200000000000")
                        elif cap_type == 'small':
                            where_conditions.append("sf.market_cap < 50000000000 AND sf.market_cap > 0")

                    # Search filter
                    if search:
                        where_conditions.append("(t.symbol ILIKE %s OR t.name ILIKE %s)")
                        search_pattern = f"%{search}%"
                        params.extend([search_pattern, search_pattern])

                    where_clause = "WHERE " + " AND ".join(where_conditions) if where_conditions else ""
                    offset = (page - 1) * limit

                    data_query = f"""
                        SELECT
                            t.id, t.symbol, t.name, t.exchange,
                            sf.long_name, sf.sector, sf.industry,
                            sf.market_cap, sf.trailing_pe, sf.forward_pe, sf.price_to_book,
                            sf.fifty_two_week_high, sf.fifty_two_week_low,
                            COUNT(*) OVER() as total_count
                        FROM tickers t
                        INNER JOIN stock_fundamentals sf ON t.id = sf.ticker_id
                        {where_clause}
                        ORDER BY sf.market_cap DESC NULLS LAST, t.symbol ASC
                        LIMIT %s OFFSET %s
                    """
                    query_start = time.time()
                    cur.execute(data_query, params + [limit, offset])
                    rows = cur.fetchall()
                    query_time = time.time() - query_start
                    logging.info(f"Stocks query took {query_time:.3f}s for page {page} with {len(rows)} results")

                    total = rows[0][13] if rows else 0
                    if not rows:
                        return paginated_response([], 0, page, limit)

                    # Convert to cacheable format (list of dicts)
                    fundamentals_rows = []
                    for row in rows:
                        fundamentals_rows.append({
                            "id": row[0],
                            "symbol": row[1],
                            "name": row[2],
                            "exchange": row[3],
                            "long_name": row[4],
                            "sector": row[5],
                            "industry": row[6],
                            "market_cap": float(row[7]) if row[7] else None,
                            "trailing_pe": float(row[8]) if row[8] else None,
                            "forward_pe": float(row[9]) if row[9] else None,
                            "price_to_book": float(row[10]) if row[10] else None,
                            "fifty_two_week_high": float(row[11]) if row[11] else None,
                            "fifty_two_week_low": float(row[12]) if row[12] else None,
                        })

                    ticker_ids = [row["id"] for row in fundamentals_rows]

                    # Cache fundamentals (1-hour TTL)
                    _set_cached_fundamentals(cap_type, search, page, limit, {
                        "rows": fundamentals_rows,
                        "total": total
                    })
                    logging.info(f"[CACHE SET] Fundamentals for {len(fundamentals_rows)} stocks (TTL: {TTL_FUNDAMENTALS}s)")
            finally:
                release_db_connection(conn)

        if not fundamentals_rows:
            return paginated_response([], 0, page, limit)

        # Step 3: Always fetch fresh LTP data (real-time prices)
        conn = get_db_connection()
        try:
            ltp_accessor = LTPDataAccessor(conn)
            ltp_start = time.time()
            ltps_list = ltp_accessor.get_latest_ltps(ticker_ids)
            ltp_time = time.time() - ltp_start

            # Create LTP lookup map
            ltp_map = {ltp_data['ticker_id']: ltp_data for ltp_data in ltps_list if ltp_data}

            # Batch fetch fallback closes for tickers with NULL close
            fallback_ticker_ids = [
                tid for tid in ticker_ids
                if ltp_map.get(tid) and ltp_map[tid].get('ltp') and ltp_map[tid].get('close') is None
            ]
            fallback_close_map = {}
            if fallback_ticker_ids:
                with conn.cursor() as ohlc_cursor:
                    ohlc_cursor.execute("""
                        SELECT DISTINCT ON (ticker_id) ticker_id, close
                        FROM ohlc_1hour
                        WHERE ticker_id = ANY(%s)
                        ORDER BY ticker_id, ts DESC
                    """, [fallback_ticker_ids])
                    for ohlc_row in ohlc_cursor.fetchall():
                        if ohlc_row[1]:
                            fallback_close_map[ohlc_row[0]] = float(ohlc_row[1])
        finally:
            release_db_connection(conn)

        # Step 4: Merge fundamentals with LTP data
        data = []
        for fund_row in fundamentals_rows:
            ticker_id = fund_row["id"]
            ltp_data = ltp_map.get(ticker_id)

            current_price = None
            previous_close = None
            price_change = None
            price_change_percent = None

            if ltp_data and ltp_data.get('ltp'):
                current_price = float(ltp_data['ltp'])
                previous_close = ltp_data.get('close')  # v2 schema: close = prev_close

                if previous_close is None:
                    previous_close = fallback_close_map.get(ticker_id)

                # Prefer pre-computed percent_change from v2 schema
                if ltp_data.get('percent_change') is not None:
                    price_change_percent = float(ltp_data['percent_change'])
                    if previous_close and previous_close > 0:
                        previous_close = float(previous_close)
                        price_change = current_price - previous_close
                elif previous_close and previous_close > 0:
                    previous_close = float(previous_close)
                    price_change = current_price - previous_close
                    price_change_percent = (price_change / previous_close) * 100

            data.append({
                "id": ticker_id,
                "symbol": fund_row["symbol"],
                "name": fund_row["name"],
                "exchange": fund_row["exchange"],
                "long_name": fund_row["long_name"],
                "sector": fund_row["sector"],
                "industry": fund_row["industry"],
                "current_price": current_price,
                "previous_close": previous_close,
                "price_change": price_change,
                "price_change_percent": price_change_percent,
                "market_cap": fund_row["market_cap"],
                "trailing_pe": fund_row["trailing_pe"],
                "forward_pe": fund_row["forward_pe"],
                "price_to_book": fund_row["price_to_book"],
                "fifty_two_week_high": fund_row["fifty_two_week_high"],
                "fifty_two_week_low": fund_row["fifty_two_week_low"],
            })

        total_time = time.time() - start_time
        cache_status = "HIT" if cache_hit else "MISS"
        logging.info(f"Stocks API total time: {total_time:.3f}s (cache: {cache_status}, LTP fetch: {ltp_time:.3f}s)")

        return paginated_response(data, total, page, limit)

    except Exception as exc:
        logging.exception("Stocks API failed")
        raise HTTPException(status_code=500, detail=f"Failed to fetch stocks: {str(exc)}")


@fastapi_app.get("/api/search", tags=["Search"])
async def search_api(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(50, le=100, description="Maximum results to return")
):
    """
    Fast search endpoint for Command Palette.
    Searches: symbol, name (short), token, long_name (case-insensitive)
    Returns basic info without prices for fast response.
    Prices should be fetched separately via /api/prices/bulk.

    Optimization layers:
    1. Check in-memory cache first (returns in <1ms)
    2. Try in-memory ticker index for prefix matches (returns in <5ms)
    3. Fall back to database query for complex searches (cached for 5 min)
    """
    start_time = time.time()
    search_term = q.strip()

    # Layer 1: Check cache first
    cached_results = get_cached_search(search_term, limit)
    if cached_results is not None:
        elapsed = time.time() - start_time
        logging.debug(f"Search API [CACHE HIT]: query='{search_term}' returned {len(cached_results)} results in {elapsed:.3f}s")
        return list_response(cached_results, {"query": search_term, "source": "cache"})

    # Layer 2: Try in-memory index for fast matching
    # Returns ANY matches found (no minimum threshold)
    # Handles "eli" → "RELIANCE" via contains matching in top 500 stocks
    memory_results = search_in_memory(search_term, limit)
    if memory_results:
        # Found results in memory - return immediately, skip DB
        set_cached_search(search_term, limit, memory_results)
        elapsed = time.time() - start_time
        logging.debug(f"Search API [MEMORY]: query='{search_term}' returned {len(memory_results)} results in {elapsed:.3f}s")
        return list_response(memory_results, {"query": search_term, "source": "memory"})

    # Layer 3: Fall back to database for comprehensive search
    def _execute_search():
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # Optimized query: use prefix match (ILIKE 'term%') which CAN use index
                # Only use full wildcard (%term%) for long_name which needs it
                prefix_pattern = f"{search_term}%"  # Can use btree index
                contains_pattern = f"%{search_term}%"  # For long_name search

                cursor.execute("""
                    SELECT
                        t.id as ticker_id,
                        t.symbol,
                        t.name,
                        t.token,
                        t.suffix,
                        sf.long_name
                    FROM tickers t
                    LEFT JOIN stock_fundamentals sf ON t.id = sf.ticker_id
                    WHERE t.is_active = true
                    AND (
                        -- Prefix matches (can use btree index)
                        t.symbol ILIKE %s
                        OR t.name ILIKE %s
                        OR t.token = %s
                        -- Contains match for long_name only
                        OR sf.long_name ILIKE %s
                    )
                    ORDER BY
                        CASE
                            WHEN UPPER(t.symbol) = UPPER(%s) THEN 0
                            WHEN t.symbol ILIKE %s THEN 1
                            WHEN t.name ILIKE %s THEN 2
                            ELSE 3
                        END,
                        sf.market_cap DESC NULLS LAST
                    LIMIT %s
                """, (
                    prefix_pattern, prefix_pattern, search_term, contains_pattern,
                    search_term, prefix_pattern, prefix_pattern, limit
                ))

                rows = cursor.fetchall()

                results = []
                for row in rows:
                    results.append({
                        "ticker_id": row['ticker_id'],
                        "symbol": row['symbol'],
                        "name": row['name'],
                        "token": row['token'],
                        "suffix": row['suffix'],
                        "long_name": row['long_name'],
                    })

                return results

        except Exception as exc:
            logging.exception("Search query failed")
            raise exc
        finally:
            if conn:
                release_db_connection(conn)

    try:
        loop = asyncio.get_running_loop()
        results = await loop.run_in_executor(None, _execute_search)

        # Cache the results
        set_cached_search(search_term, limit, results)

        elapsed = time.time() - start_time
        logging.info(f"Search API [DB]: query='{search_term}' returned {len(results)} results in {elapsed:.3f}s")

        return list_response(results, {"query": search_term, "source": "database"})
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Search failed: {str(exc)}"
        ) from exc


class BulkPriceRequest(BaseModel):
    ticker_ids: List[int]


@fastapi_app.post("/api/prices/bulk", tags=["Prices"])
async def bulk_prices_api(request: BulkPriceRequest):
    """
    Fetch current prices for multiple tickers by their IDs.
    Used by search to load prices after initial results are displayed.

    Args:
        request: JSON body with 'ticker_ids' array of ticker IDs

    Returns:
        JSON with ticker_id as key and price data as value
    """
    if not request.ticker_ids:
        return success_response({})

    if len(request.ticker_ids) > 100:
        raise HTTPException(
            status_code=400,
            detail="Maximum 100 ticker IDs allowed per request"
        )

    def _fetch_prices():
        conn = None
        try:
            conn = get_db_connection()
            ltp_accessor = LTPDataAccessor(conn)

            # Fetch LTP data for all tickers
            ltps = ltp_accessor.get_latest_ltps(request.ticker_ids)

            # Build response dictionary keyed by ticker_id
            prices = {}
            for ltp_data in ltps:
                if ltp_data and ltp_data.get('ltp'):
                    ticker_id = ltp_data['ticker_id']
                    prices[str(ticker_id)] = {
                        "current_price": float(ltp_data['ltp']),
                        "change_percent": ltp_data.get('percent_change'),  # Pre-computed from v2 schema
                    }

            return prices

        except Exception as exc:
            logging.exception("Bulk prices fetch failed")
            raise exc
        finally:
            if conn:
                release_db_connection(conn)

    try:
        loop = asyncio.get_running_loop()
        prices = await loop.run_in_executor(None, _fetch_prices)

        logging.info(f"Bulk prices API returned data for {len(prices)}/{len(request.ticker_ids)} tickers")
        return success_response(prices)

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch prices: {str(exc)}"
        ) from exc


@fastapi_app.get("/api/analysts-hub", tags=["Stock Detail"])
def analysts_hub_api(ticker: str = Query(ANALYSTS_DEFAULT_TICKER)):
    try:
        payload = build_analyst_hub_payload(ticker)
        payload["curated_picks"] = _get_curated_picks()
        return success_response(payload)
    except HTTPException:
        raise
    except Exception as exc:
        logging.exception("Analysts hub API failed for %s", ticker)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@fastapi_app.get("/api/stock-detail/{ticker}", tags=["Stock Detail"])
async def stock_detail_api(ticker: str):
    """
    Comprehensive stock detail endpoint combining data from multiple sources:
    - Basic ticker info from tickers table
    - Proprietary analyst reports from stock_analysis table
    - Fundamentals from stock_fundamentals table
    - External analyst data from yfinance

    Note: Technical indicators are now available via separate /api/technical-indicators/{ticker} endpoint
    """
    try:
        # Decode URL-encoded characters (e.g., M%26M → M&M)
        ticker = unquote(ticker)
        ticker_upper = ticker.upper()
        conn = get_db_connection()

        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # Step 1: Get ticker info and ID
                cursor.execute("""
                    SELECT id, symbol, name, exchange, sector, industry, suffix
                    FROM tickers
                    WHERE UPPER(symbol) = %s
                """, (ticker_upper,))
                ticker_info = cursor.fetchone()

                if not ticker_info:
                    raise HTTPException(status_code=404, detail=f"Ticker {ticker} not found")

                ticker_id = ticker_info['id']

                # Step 2: Get proprietary analysis from stock_analysis table (latest active report)
                cursor.execute("""
                    SELECT
                        ticker_symbol,
                        performance_benchmark, performance_pct_of_benchmark,
                        valuation_dcf, valuation_metric, growth_expected_vs_projections,
                        growth_vs_sector_rate, growth_notes,
                        profitability_pct_of_revenue, profitability_metric,
                        analyst_recommendation, entry_point, entry_rating, target_price,
                        pdf_url,
                        analysis_date, analyst_name, report_title, notes
                    FROM stock_analysis
                    WHERE ticker_id = %s AND is_active = true
                    ORDER BY analysis_date DESC
                    LIMIT 1
                """, (ticker_id,))
                proprietary_analysis = cursor.fetchone()

                # Step 3: Get real-time LTP data with OHLC fallback
                ltp_accessor = LTPDataAccessor(conn)
                timeframe_accessor = TimeframeDataAccessor(conn)
                ltp_data = ltp_accessor.get_latest_ltp(ticker_id)

                # Determine current_price with LTP → OHLC fallback
                current_price = None
                if ltp_data and ltp_data.get('ltp'):
                    current_price = float(ltp_data['ltp'])
                else:
                    # Fallback to latest OHLC close (try daily first, then hourly)
                    current_price = timeframe_accessor.fetch_latest_close(ticker_id, '1day')
                    if current_price is None:
                        current_price = timeframe_accessor.fetch_latest_close(ticker_id, '1hour')

                # Determine previous_close with LTP → OHLC fallback
                previous_close_value = None
                if ltp_data and ltp_data.get('close'):
                    previous_close_value = float(ltp_data['close'])
                else:
                    # Fallback to latest OHLC close
                    previous_close_value = timeframe_accessor.fetch_latest_close(ticker_id, '1hour')

                # Calculate price change - prefer pre-computed percent_change from v2 schema
                price_change = None
                price_change_percent = None
                if ltp_data and ltp_data.get('percent_change') is not None:
                    price_change_percent = float(ltp_data['percent_change'])
                    if current_price and previous_close_value:
                        price_change = current_price - previous_close_value
                elif current_price and previous_close_value:
                    price_change = current_price - previous_close_value
                    price_change_percent = (price_change / previous_close_value * 100)

                # Step 4: Get comprehensive fundamentals (technical indicators removed - will be calculated on-demand)
                cursor.execute("""
                    SELECT
                        -- 52-week range
                        sf.fifty_two_week_high, sf.fifty_two_week_low,
                        -- Valuation ratios
                        sf.trailing_pe, sf.forward_pe, sf.price_to_book,
                        sf.price_to_sales, sf.peg_ratio,
                        -- Company info
                        sf.long_name, sf.sector, sf.industry, sf.website, sf.description,
                        sf.market_cap, sf.enterprise_value,
                        -- Financial metrics
                        sf.profit_margin, sf.operating_margin,
                        sf.return_on_assets, sf.return_on_equity,
                        sf.revenue_growth, sf.earnings_growth,
                        -- Balance sheet
                        sf.total_cash, sf.total_debt, sf.debt_to_equity,
                        sf.current_ratio, sf.quick_ratio,
                        sf.shares_outstanding, sf.float_shares,
                        -- Dividend info
                        sf.dividend_rate, sf.dividend_yield, sf.payout_ratio, sf.ex_dividend_date,
                        -- Volume (historical averages from fundamentals)
                        sf.avg_volume,
                        -- JSONB fields
                        sf.income_statement, sf.balance_sheet, sf.cash_flow,
                        sf.quarterly_financials, sf.dividends_history,
                        -- Metadata
                        sf.last_updated
                    FROM stock_fundamentals sf
                    WHERE sf.ticker_id = %s
                """, (ticker_id,))

                fundamentals_row = cursor.fetchone()

                # Build response (fundamentals may be None for stocks without data)
                response = {
                    "ticker": ticker_upper,
                    "basic_info": {
                        "id": ticker_info['id'],
                        "symbol": ticker_info['symbol'],
                        "name": ticker_info['name'],
                        "long_name": fundamentals_row['long_name'] if fundamentals_row else ticker_info['name'],
                        "exchange": ticker_info['exchange'],
                        "sector": ticker_info['sector'] or (fundamentals_row['sector'] if fundamentals_row else None),
                        "industry": ticker_info['industry'] or (fundamentals_row['industry'] if fundamentals_row else None),
                        "website": fundamentals_row['website'] if fundamentals_row else None,
                        "description": fundamentals_row['description'] if fundamentals_row else None,
                        "suffix": ticker_info.get('suffix'),
                    },
                    "has_proprietary_report": proprietary_analysis is not None,
                    "proprietary_analysis": None,
                    "fundamentals": {
                        # Price data from LTP with OHLC fallback
                        "current_price": current_price,
                        "previous_close": previous_close_value,
                        "price_change": price_change,
                        "price_change_percent": price_change_percent,
                        "open_price": float(ltp_data['open']) if ltp_data and ltp_data.get('open') else None,
                        "day_high": float(ltp_data['high']) if ltp_data and ltp_data.get('high') else None,
                        "day_low": float(ltp_data['low']) if ltp_data and ltp_data.get('low') else None,
                        "fifty_two_week_high": float(fundamentals_row['fifty_two_week_high']) if fundamentals_row and fundamentals_row['fifty_two_week_high'] else None,
                        "fifty_two_week_low": float(fundamentals_row['fifty_two_week_low']) if fundamentals_row and fundamentals_row['fifty_two_week_low'] else None,
                        # Valuation
                        "market_cap": int(fundamentals_row['market_cap']) if fundamentals_row and fundamentals_row['market_cap'] else None,
                        "enterprise_value": int(fundamentals_row['enterprise_value']) if fundamentals_row and fundamentals_row['enterprise_value'] else None,
                        "trailing_pe": float(fundamentals_row['trailing_pe']) if fundamentals_row and fundamentals_row['trailing_pe'] else None,
                        "forward_pe": float(fundamentals_row['forward_pe']) if fundamentals_row and fundamentals_row['forward_pe'] else None,
                        "price_to_book": float(fundamentals_row['price_to_book']) if fundamentals_row and fundamentals_row['price_to_book'] else None,
                        "price_to_sales": float(fundamentals_row['price_to_sales']) if fundamentals_row and fundamentals_row['price_to_sales'] else None,
                        "peg_ratio": float(fundamentals_row['peg_ratio']) if fundamentals_row and fundamentals_row['peg_ratio'] else None,
                        # Financial performance
                        "profit_margin": float(fundamentals_row['profit_margin']) * 100 if fundamentals_row and fundamentals_row['profit_margin'] else None,
                        "operating_margin": float(fundamentals_row['operating_margin']) * 100 if fundamentals_row and fundamentals_row['operating_margin'] else None,
                        "return_on_assets": float(fundamentals_row['return_on_assets']) * 100 if fundamentals_row and fundamentals_row['return_on_assets'] else None,
                        "return_on_equity": float(fundamentals_row['return_on_equity']) * 100 if fundamentals_row and fundamentals_row['return_on_equity'] else None,
                        "revenue_growth": float(fundamentals_row['revenue_growth']) * 100 if fundamentals_row and fundamentals_row['revenue_growth'] else None,
                        "earnings_growth": float(fundamentals_row['earnings_growth']) * 100 if fundamentals_row and fundamentals_row['earnings_growth'] else None,
                        # Balance sheet
                        "total_cash": int(fundamentals_row['total_cash']) if fundamentals_row and fundamentals_row['total_cash'] else None,
                        "total_debt": int(fundamentals_row['total_debt']) if fundamentals_row and fundamentals_row['total_debt'] else None,
                        "debt_to_equity": float(fundamentals_row['debt_to_equity']) if fundamentals_row and fundamentals_row['debt_to_equity'] else None,
                        "current_ratio": float(fundamentals_row['current_ratio']) if fundamentals_row and fundamentals_row['current_ratio'] else None,
                        "quick_ratio": float(fundamentals_row['quick_ratio']) if fundamentals_row and fundamentals_row['quick_ratio'] else None,
                        "shares_outstanding": int(fundamentals_row['shares_outstanding']) if fundamentals_row and fundamentals_row['shares_outstanding'] else None,
                        "float_shares": int(fundamentals_row['float_shares']) if fundamentals_row and fundamentals_row['float_shares'] else None,
                        # Dividends
                        "dividend_rate": float(fundamentals_row['dividend_rate']) if fundamentals_row and fundamentals_row['dividend_rate'] else None,
                        "dividend_yield": float(fundamentals_row['dividend_yield']) if fundamentals_row and fundamentals_row['dividend_yield'] else None,
                        "payout_ratio": float(fundamentals_row['payout_ratio']) * 100 if fundamentals_row and fundamentals_row['payout_ratio'] else None,
                        "ex_dividend_date": str(fundamentals_row['ex_dividend_date']) if fundamentals_row and fundamentals_row['ex_dividend_date'] else None,
                        # Volume
                        "avg_volume": int(fundamentals_row['avg_volume']) if fundamentals_row and fundamentals_row['avg_volume'] else None,
                        # Metadata
                        "last_updated": str(fundamentals_row['last_updated']) if fundamentals_row and fundamentals_row['last_updated'] else None,
                    },
                    "financials": {
                        "income_statement": fundamentals_row['income_statement'] if fundamentals_row else None,
                        "balance_sheet": fundamentals_row['balance_sheet'] if fundamentals_row else None,
                        "cash_flow": fundamentals_row['cash_flow'] if fundamentals_row else None,
                        "quarterly_financials": fundamentals_row['quarterly_financials'] if fundamentals_row else None,
                        "dividends_history": fundamentals_row['dividends_history'] if fundamentals_row else None,
                    },
                }

                # Add proprietary analysis if available
                if proprietary_analysis:
                    response["proprietary_analysis"] = {
                        "ticker_symbol": proprietary_analysis['ticker_symbol'],
                        "performance_benchmark": float(proprietary_analysis['performance_benchmark']) if proprietary_analysis['performance_benchmark'] else None,
                        "performance_pct_of_benchmark": float(proprietary_analysis['performance_pct_of_benchmark']) if proprietary_analysis['performance_pct_of_benchmark'] else None,
                        "valuation_dcf": float(proprietary_analysis['valuation_dcf']) if proprietary_analysis['valuation_dcf'] else None,
                        "valuation_metric": proprietary_analysis['valuation_metric'],
                        "growth_expected_vs_projections": float(proprietary_analysis['growth_expected_vs_projections']) if proprietary_analysis['growth_expected_vs_projections'] else None,
                        "growth_vs_sector_rate": float(proprietary_analysis['growth_vs_sector_rate']) if proprietary_analysis['growth_vs_sector_rate'] else None,
                        "growth_notes": proprietary_analysis['growth_notes'],
                        "profitability_pct_of_revenue": float(proprietary_analysis['profitability_pct_of_revenue']) if proprietary_analysis['profitability_pct_of_revenue'] else None,
                        "profitability_metric": proprietary_analysis['profitability_metric'],
                        "analyst_recommendation": proprietary_analysis['analyst_recommendation'],
                        "entry_point": float(proprietary_analysis['entry_point']) if proprietary_analysis['entry_point'] else None,
                        "entry_rating": proprietary_analysis['entry_rating'],
                        "target_price": float(proprietary_analysis['target_price']) if proprietary_analysis['target_price'] else None,
                        "pdf_url": proprietary_analysis['pdf_url'],
                        "analysis_date": str(proprietary_analysis['analysis_date']) if proprietary_analysis['analysis_date'] else None,
                        "analyst_name": proprietary_analysis['analyst_name'],
                        "report_title": proprietary_analysis['report_title'],
                        "notes": proprietary_analysis['notes'],
                    }

                return success_response(response)

        finally:
            release_db_connection(conn)

    except HTTPException:
        raise
    except Exception as exc:
        logging.exception(f"Stock detail API failed for {ticker}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch stock detail: {str(exc)}") from exc


@fastapi_app.get("/api/stock-detail/{ticker}/analyst", tags=["Stock Detail"])
async def stock_detail_analyst_api(ticker: str):
    """
    External analyst data endpoint for stock detail page.
    Fetches data from yfinance (slow, 10-20s).
    Only called when proprietary analyst data is not available.
    """
    try:
        # Decode URL-encoded characters (e.g., M%26M → M&M)
        ticker = unquote(ticker)
        ticker_upper = ticker.upper()
        external_analyst = build_analyst_hub_payload(ticker_upper)
        return {"external_analyst": external_analyst}
    except Exception as exc:
        logging.exception(f"External analyst API failed for {ticker}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch external analyst data: {str(exc)}") from exc


# =============================================================================
# Stock Scorecard Endpoint
# =============================================================================

@fastapi_app.get("/api/stock-scorecard/{ticker}", tags=["Stock Detail"])
async def stock_scorecard_api(ticker: str):
    """
    Calculate 7-dimension stock scorecard.

    Dimensions:
    1. Valuation - P/E, P/B, P/S, PEG vs sector medians
    2. Profitability - ROE, ROA, NPM vs thresholds
    3. Growth - 2Y Revenue & Net Income CAGR
    4. Financial Health - D/E, Interest Coverage
    5. Business Quality - ROE + Margin combo
    6. Momentum - 1-year price return
    7. Entry Rating - Price vs MA200, RSI, 52W high

    Features:
    - 2-hour Redis caching (1 hour during market hours)
    - Distributed locking to prevent duplicate calculations
    - Sector median comparison using PostgreSQL PERCENTILE_CONT
    - Uses existing stock_fundamentals and ohlc_daily tables

    Args:
        ticker: Stock symbol (e.g., "RELIANCE" or "RELIANCE.NS")

    Returns:
        Scorecard with all 7 dimension scores, explanations, and metrics
    """
    from server.stock_scorecard import calculate_stock_scorecard

    try:
        api_start = time.time()

        # Decode URL-encoded characters and normalize ticker
        ticker = unquote(ticker).upper()

        logging.info(f"[API] /api/stock-scorecard/{ticker} START")

        # Get database connection from pool
        conn = db_pool.getconn()
        try:
            result = await calculate_stock_scorecard(ticker, conn)
        finally:
            db_pool.putconn(conn)

        logging.info(f"[API] /api/stock-scorecard/{ticker} DONE in {time.time() - api_start:.2f}s")
        return result

    except Exception as exc:
        logging.exception(f"Stock scorecard API failed for {ticker}")
        raise HTTPException(status_code=500, detail=f"Failed to calculate stock scorecard: {str(exc)}") from exc


# =============================================================================
# Reverse DCF Valuation Endpoint
# =============================================================================

class ReverseDCFRequest(BaseModel):
    """Request model for Reverse DCF calculation."""
    target_price: Optional[float] = None
    wacc: float = 0.10
    terminal_growth: float = 0.03
    forecast_years: int = 5


@fastapi_app.post("/api/reverse-dcf/{ticker}", tags=["Stock Detail"])
async def reverse_dcf_api(ticker: str, request: ReverseDCFRequest):
    """
    Calculate Reverse DCF implied growth rate for a stock.

    Uses yfinance for financial data (revenue, EBIT, debt, shares, market cap).
    Auto-appends .NS suffix for NSE stocks.

    Features:
    - 24-hour Redis caching for default parameters
    - Distributed locking to prevent duplicate yfinance calls
    - Graceful fallback if Redis unavailable

    Args:
        ticker: Stock symbol (e.g., "RELIANCE" or "RELIANCE.NS")
        request: DCF parameters (target_price, wacc, terminal_growth, forecast_years)

    Returns:
        DCF analysis result with implied growth rates, valuation status, and warnings
    """
    from server.reverse_dcf import run_reverse_dcf

    try:
        api_start = time.time()

        # Decode URL-encoded characters and normalize ticker
        ticker = unquote(ticker).upper()

        # Append .NS suffix for NSE stocks if not present
        yf_symbol = ticker if ticker.endswith('.NS') else f"{ticker}.NS"

        logging.info(f"[API] /api/reverse-dcf/{ticker} START (wacc={request.wacc}, tg={request.terminal_growth}, years={request.forecast_years})")

        # Build cache key (user-agnostic for shared caching)
        cache_key = make_reverse_dcf_key(yf_symbol, request.wacc, request.terminal_growth, request.forecast_years)
        lock_key = make_reverse_dcf_lock_key(cache_key)

        # Skip cache for custom target_price (user-specific calculation)
        if request.target_price is not None:
            logging.info(f"[ReverseDCF] Custom target_price provided, skipping cache")
            result = await asyncio.to_thread(
                run_reverse_dcf,
                yf_symbol,
                request.target_price,
                request.wacc,
                request.terminal_growth,
                request.forecast_years
            )
            logging.info(f"[API] /api/reverse-dcf/{ticker} DONE in {time.time() - api_start:.2f}s (no cache)")
            return result

        # 1. Check cache first
        cached = get_cached(cache_key)
        if cached:
            logging.info(f"[API] /api/reverse-dcf/{ticker} CACHE HIT in {time.time() - api_start:.2f}s")
            return cached

        # 2. Try to acquire distributed lock (prevents duplicate yfinance calls)
        lock_acquired = try_acquire_lock(lock_key, LOCK_TTL_REVERSE_DCF)

        if lock_acquired:
            # We got the lock - compute and cache
            try:
                logging.info(f"[ReverseDCF] Lock acquired, fetching from yfinance")
                result = await asyncio.to_thread(
                    run_reverse_dcf,
                    yf_symbol,
                    request.target_price,
                    request.wacc,
                    request.terminal_growth,
                    request.forecast_years
                )

                # Cache successful results
                if result.get("success"):
                    set_cached(cache_key, result, TTL_REVERSE_DCF)

                logging.info(f"[API] /api/reverse-dcf/{ticker} DONE in {time.time() - api_start:.2f}s (computed)")
                return result
            finally:
                release_lock(lock_key)
        else:
            # Another request is computing - poll for result
            logging.info(f"[ReverseDCF] Lock held by another request, polling for result")
            for i in range(30):  # Wait up to 30 seconds
                await asyncio.sleep(1)
                cached = get_cached(cache_key)
                if cached:
                    logging.info(f"[API] /api/reverse-dcf/{ticker} GOT CACHED after {i+1}s polling")
                    return cached

            # Timeout - compute ourselves (lock must have expired)
            logging.warning(f"[ReverseDCF] Polling timeout, computing directly")
            result = await asyncio.to_thread(
                run_reverse_dcf,
                yf_symbol,
                request.target_price,
                request.wacc,
                request.terminal_growth,
                request.forecast_years
            )

            if result.get("success"):
                set_cached(cache_key, result, TTL_REVERSE_DCF)

            logging.info(f"[API] /api/reverse-dcf/{ticker} DONE in {time.time() - api_start:.2f}s (timeout fallback)")
            return result

    except HTTPException:
        raise
    except Exception as exc:
        logging.exception(f"[API] /api/reverse-dcf/{ticker} FAILED")
        raise HTTPException(status_code=500, detail=f"Reverse DCF calculation failed: {str(exc)}") from exc


# ======================
# Sankey Diagram API
# ======================

@fastapi_app.get("/api/sankey/years/{ticker}", tags=["Stock Detail"])
async def sankey_years_api(ticker: str):
    """
    Get available years for Sankey diagrams (income and cashflow).
    Uses Redis caching with 24-hour TTL.
    """
    try:
        # URL-decode ticker (e.g., M%26M → M&M)
        ticker = unquote(ticker)

        # Check cache first
        cache_key = f"sankey:years:{ticker.upper()}"
        cached = get_cached(cache_key)
        if cached is not None:
            logging.debug(f"[API] /api/sankey/years/{ticker} CACHE HIT")
            return cached

        # Fetch available years from yfinance
        result = await asyncio.to_thread(get_available_years, ticker)

        # Cache for 24 hours (financial data is quarterly)
        set_cached(cache_key, result, TTL_SANKEY)

        return result
    except Exception as exc:
        logging.exception(f"[API] /api/sankey/years/{ticker} FAILED")
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@fastapi_app.get("/api/sankey/{statement_type}/{ticker}", tags=["Stock Detail"])
async def sankey_diagram_api(
    ticker: str,
    statement_type: str,
    year: Optional[int] = None
):
    """
    Generate Sankey diagram data for income, cashflow, or balance sheet.
    Returns Nivo-compatible nodes/links format.

    Args:
        ticker: Stock symbol (e.g., "RELIANCE.NS", "AAPL")
        statement_type: "income", "cashflow", or "balance"
        year: Fiscal year (optional, defaults to most recent)

    Returns:
        Nivo-compatible Sankey data with nodes and links
    """
    if statement_type not in ["income", "cashflow", "balance"]:
        raise HTTPException(
            status_code=400,
            detail="statement_type must be 'income', 'cashflow', or 'balance'"
        )

    try:
        # URL-decode ticker (e.g., M%26M → M&M)
        ticker = unquote(ticker)
        api_start = time.time()

        logging.info(f"[API] /api/sankey/{statement_type}/{ticker} START (year={year})")

        # get_sankey_data handles caching internally
        result = await asyncio.to_thread(get_sankey_data, ticker, statement_type, year)

        logging.info(f"[API] /api/sankey/{statement_type}/{ticker} DONE in {time.time() - api_start:.2f}s")
        return result

    except ValueError as exc:
        # ValueError for invalid ticker/year/data issues
        logging.warning(f"[API] /api/sankey/{statement_type}/{ticker} NOT FOUND: {exc}")
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logging.exception(f"[API] /api/sankey/{statement_type}/{ticker} FAILED")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# =============================================================================
# Shareholding Pattern API
# =============================================================================

@fastapi_app.get("/api/shareholding/{ticker}", tags=["Stock Detail"])
async def shareholding_pattern_api(
    ticker: str,
    view: str = "quarterly",
):
    """
    Get shareholding pattern data for an NSE stock.

    Scrapes screener.in and returns promoter/FII/DII/public ownership trends.
    Results are cached in Redis for 6 hours.

    Args:
        ticker: Stock symbol (e.g., "RELIANCE")
        view: "quarterly" or "yearly" (default: "quarterly")
    """
    from server.shareholding_scraper import fetch_shareholding

    try:
        api_start = time.time()

        # Normalize
        ticker = unquote(ticker).upper()

        if view not in ("quarterly", "yearly"):
            raise HTTPException(status_code=400, detail="view must be 'quarterly' or 'yearly'")

        logging.info(f"[API] /api/shareholding/{ticker} START (view={view})")

        # Check cache
        cache_key = make_shareholding_key(ticker, view)
        cached = get_cached(cache_key)
        if cached is not None:
            logging.debug(f"[API] /api/shareholding/{ticker} CACHE HIT")
            return cached

        # Scrape in thread pool (blocking I/O)
        result = await asyncio.to_thread(fetch_shareholding, ticker, view)

        # Cache only successful results
        if result.get("success"):
            set_cached(cache_key, result, TTL_SHAREHOLDING)

        logging.info(f"[API] /api/shareholding/{ticker} DONE in {time.time() - api_start:.2f}s")
        return result

    except HTTPException:
        raise
    except Exception as exc:
        logging.exception(f"[API] /api/shareholding/{ticker} FAILED")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch shareholding data: {str(exc)}",
        ) from exc


@fastapi_app.get("/api/stock-analysis/{ticker}/pdf", tags=["Stock Detail"])
async def stock_analysis_pdf_api(ticker: str):
    """
    Serve PDF report for proprietary stock analysis.
    Returns the PDF file stored in stock_analysis.pdf_file_data.
    """
    try:
        from fastapi.responses import StreamingResponse

        # Decode URL-encoded characters (e.g., M%26M → M&M)
        ticker = unquote(ticker)
        ticker_upper = ticker.upper()
        conn = get_db_connection()

        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # Get ticker_id
                cursor.execute("""
                    SELECT id FROM tickers WHERE UPPER(symbol) = %s
                """, (ticker_upper,))
                ticker_row = cursor.fetchone()

                if not ticker_row:
                    raise HTTPException(status_code=404, detail=f"Ticker {ticker} not found")

                # Get PDF data
                cursor.execute("""
                    SELECT pdf_file_data, pdf_file_name, pdf_file_size
                    FROM stock_analysis
                    WHERE ticker_id = %s AND is_active = true AND pdf_file_data IS NOT NULL
                    ORDER BY analysis_date DESC
                    LIMIT 1
                """, (ticker_row['id'],))
                pdf_row = cursor.fetchone()

                if not pdf_row or not pdf_row['pdf_file_data']:
                    raise HTTPException(status_code=404, detail=f"No PDF report found for {ticker}")

                # Return PDF as streaming response
                pdf_bytes = bytes(pdf_row['pdf_file_data'])
                filename = pdf_row['pdf_file_name'] or f"{ticker_upper}_analysis.pdf"

                return StreamingResponse(
                    io.BytesIO(pdf_bytes),
                    media_type="application/pdf",
                    headers={
                        "Content-Disposition": f"inline; filename={filename}",
                        "Content-Length": str(len(pdf_bytes))
                    }
                )

        finally:
            release_db_connection(conn)

    except HTTPException:
        raise
    except Exception as exc:
        logging.exception(f"PDF retrieval failed for {ticker}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve PDF: {str(exc)}") from exc


def _parse_subsample_years(subsample_years: Optional[str]) -> Optional[int]:
    if not subsample_years:
        return None
    subsample_str = str(subsample_years).strip()
    if not subsample_str:
        return None
    try:
        return int(subsample_str)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="subsample_years must be an integer") from exc


@fastapi_app.post("/api/strategy-backtest", tags=["Strategy"])
async def strategy_backtest_api(
    csv_file: UploadFile = File(...),
    custom_rules: str = Form(""),
    subsample_years: Optional[str] = Form(None),
):
    if csv_file is None:
        raise HTTPException(status_code=400, detail="CSV file is required")

    try:
        raw_bytes = await csv_file.read()
        csv_file.file.close()
    except Exception as exc:
        logging.exception("Failed to read uploaded CSV file")
        raise HTTPException(status_code=400, detail=f"Unable to read CSV file: {exc}") from exc

    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded CSV file is empty")

    try:
        buffer = io.StringIO(raw_bytes.decode("utf-8", errors="ignore"))
        df = pd.read_csv(buffer, parse_dates=["Datetime"], index_col="Datetime")
    except Exception as exc:
        logging.exception("Failed to parse CSV file")
        raise HTTPException(status_code=400, detail=f"Error reading CSV: {exc}") from exc
    finally:
        buffer.close()

    if df.empty:
        raise HTTPException(status_code=400, detail="CSV file contains no rows")

    subsample_value: Optional[int] = None
    if subsample_years and str(subsample_years).strip():
        try:
            subsample_value = int(str(subsample_years).strip())
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="subsample_years must be an integer") from exc

    try:
        enhanced_df = compute_indicators_and_rules(df)
        qiga_result, qiga_duration, qiga_fitnesses, qiga_train, qiga_test = optimize_trading_strategy(
            enhanced_df,
            custom_rules=custom_rules,
            use_parallel=False,
            subsample_years=subsample_value,
            use_qiga=True,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logging.exception("Strategy optimization failed")
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc

    if qiga_result is None:
        raise HTTPException(
            status_code=400,
            detail="Unable to derive a valid strategy from the provided data.",
        )

    payload = build_strategy_payload(
        qiga_result,
        qiga_train,
        qiga_test,
        qiga_duration,
        qiga_fitnesses,
    )

    if payload is None:
        raise HTTPException(
            status_code=500,
            detail="Failed to prepare strategy response.",
        )

    return payload


@fastapi_app.post("/api/strategy-backtest/ticker", tags=["Strategy"])
async def strategy_backtest_ticker_api(
    ticker: str = Form(...),
    custom_rules: str = Form(""),
):
    """
    Run strategy backtest using ticker data from database.
    Fetches up to 5 years of 1hour timeframe data using TimeframeDataAccessor.

    Args:
        ticker: Stock ticker symbol
        custom_rules: Optional custom trading rules

    Returns:
        Strategy backtest results with performance metrics
    """
    ticker_upper = ticker.upper().strip()
    if not ticker_upper:
        raise HTTPException(status_code=400, detail="Ticker is required")

    # Fetch OHLC data using TimeframeDataAccessor
    conn = None
    try:
        conn = get_db_connection()

        # Get ticker_id
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT id, symbol FROM tickers WHERE UPPER(symbol) = %s LIMIT 1",
                (ticker_upper,)
            )
            ticker_row = cursor.fetchone()
            if not ticker_row:
                raise HTTPException(
                    status_code=404,
                    detail=f"Ticker {ticker_upper} not found in database."
                )

            ticker_id = ticker_row['id']

        # Calculate start date (5 years ago)
        from datetime import datetime, timedelta
        start_time = datetime.utcnow() - timedelta(days=365 * 5)

        # Use TimeframeDataAccessor to fetch hourly data
        accessor = TimeframeDataAccessor(conn)

        try:
            ohlc_data = accessor.fetch_ohlc(
                ticker_id=ticker_id,
                timeframe='1hour',
                start_date=start_time
            )
        except ValueError as e:
            available = accessor.get_available_timeframes()
            raise HTTPException(
                status_code=404,
                detail=f"Hourly timeframe not available. Available: {', '.join(available)}"
            )

        if not ohlc_data:
            raise HTTPException(
                status_code=404,
                detail=f"No hourly data found for {ticker_upper}"
            )

        # Convert to DataFrame
        df_data = []
        for row in ohlc_data:
            df_data.append({
                'Datetime': row['timestamp'],
                'Open': float(row['open']) if row['open'] else None,
                'High': float(row['high']) if row['high'] else None,
                'Low': float(row['low']) if row['low'] else None,
                'Close': float(row['close']) if row['close'] else None,
            })

        df = pd.DataFrame(df_data)
        df['Datetime'] = pd.to_datetime(df['Datetime'])
        df = df.set_index('Datetime')
        df = df[['Open', 'High', 'Low', 'Close']]

    except HTTPException:
        raise
    except Exception as exc:
        logging.exception(f"Failed to fetch data for {ticker_upper}")
        raise HTTPException(
            status_code=500,
            detail=f"Unable to fetch ticker data: {exc}"
        ) from exc
    finally:
        if conn:
            release_db_connection(conn)

    if df.empty:
        raise HTTPException(
            status_code=400,
            detail=f"No data available for {ticker_upper}"
        )

    # Run strategy optimization (without subsample_years)
    try:
        enhanced_df = compute_indicators_and_rules(df)
        qiga_result, qiga_duration, qiga_fitnesses, qiga_train, qiga_test = optimize_trading_strategy(
            enhanced_df,
            custom_rules=custom_rules,
            use_parallel=False,
            subsample_years=None,  # No subsampling for ticker-based backtest
            use_qiga=True,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logging.exception("Strategy optimization failed")
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc

    if qiga_result is None:
        raise HTTPException(
            status_code=400,
            detail="Unable to derive a valid strategy from the provided data.",
        )

    payload = build_strategy_payload(
        qiga_result,
        qiga_train,
        qiga_test,
        qiga_duration,
        qiga_fitnesses,
    )

    if payload is None:
        raise HTTPException(
            status_code=500,
            detail="Failed to prepare strategy response.",
        )

    return payload


@fastapi_app.post("/api/strategy-backtest/advanced", tags=["Strategy"])
async def advanced_strategy_backtest_api(
    csv_file: UploadFile = File(...),
    custom_rules: str = Form(""),
    subsample_years: Optional[str] = Form(None),
):
    """
    Run advanced TPSL strategy backtest on uploaded CSV data.
    Returns structured JSON with equity_curve, candlestick_data, and metrics.
    """
    if csv_file is None:
        raise HTTPException(status_code=400, detail="CSV file is required")

    try:
        raw_bytes = await csv_file.read()
        csv_file.file.close()
    except Exception as exc:
        logging.exception("Failed to read uploaded CSV file")
        raise HTTPException(status_code=400, detail=f"Unable to read CSV file: {exc}") from exc

    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded CSV file is empty")

    buffer = io.StringIO(raw_bytes.decode("utf-8", errors="ignore"))
    subsample_value = _parse_subsample_years(subsample_years)

    try:
        qiga_result, qiga_train, qiga_test, qiga_duration = run_tpsl_optimization(
            buffer,
            custom_rules,
            subsample_value,
        )
    except Exception as exc:
        logging.exception("Advanced strategy optimization failed")
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc
    finally:
        buffer.close()

    if qiga_result is None or qiga_train is None or qiga_test is None:
        raise HTTPException(
            status_code=500,
            detail="Advanced optimizer found no valid strategy. Try adjusting parameters.",
        )

    payload = build_advanced_strategy_payload(
        qiga_result,
        qiga_train,
        qiga_test,
        qiga_duration,
    )

    if payload is None:
        raise HTTPException(
            status_code=500,
            detail="Failed to prepare advanced strategy response.",
        )

    return payload


@fastapi_app.post("/api/strategy-backtest/advanced/ticker", tags=["Strategy"])
async def advanced_strategy_backtest_ticker_api(
    ticker: str = Form(...),
    custom_rules: str = Form(""),
):
    """
    Run advanced TPSL strategy backtest using ticker data from database.
    Fetches up to 5 years of 1hour timeframe data using TimeframeDataAccessor.
    Returns structured JSON with equity_curve, candlestick_data, and metrics.

    Args:
        ticker: Stock ticker symbol
        custom_rules: Optional custom trading rules

    Returns:
        Advanced strategy backtest results with TPSL optimization
    """
    ticker_upper = ticker.upper().strip()
    if not ticker_upper:
        raise HTTPException(status_code=400, detail="Ticker is required")

    # Fetch OHLC data using TimeframeDataAccessor
    conn = None
    try:
        conn = get_db_connection()

        # Get ticker_id
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT id, symbol FROM tickers WHERE UPPER(symbol) = %s LIMIT 1",
                (ticker_upper,)
            )
            ticker_row = cursor.fetchone()
            if not ticker_row:
                raise HTTPException(
                    status_code=404,
                    detail=f"Ticker {ticker_upper} not found in database."
                )

            ticker_id = ticker_row['id']

        # Calculate start date (5 years ago)
        start_time = datetime.utcnow() - timedelta(days=365 * 5)

        # Use TimeframeDataAccessor to fetch hourly data
        accessor = TimeframeDataAccessor(conn)

        try:
            ohlc_data = accessor.fetch_ohlc(
                ticker_id=ticker_id,
                timeframe='1hour',
                start_date=start_time
            )
        except ValueError as e:
            available = accessor.get_available_timeframes()
            raise HTTPException(
                status_code=404,
                detail=f"Hourly timeframe not available. Available: {', '.join(available)}"
            )

        if not ohlc_data:
            raise HTTPException(
                status_code=404,
                detail=f"No hourly data found for {ticker_upper}"
            )

        # Convert to DataFrame
        df_data = []
        for row in ohlc_data:
            df_data.append({
                'Datetime': row['timestamp'],
                'Open': float(row['open']) if row['open'] else None,
                'High': float(row['high']) if row['high'] else None,
                'Low': float(row['low']) if row['low'] else None,
                'Close': float(row['close']) if row['close'] else None,
            })

        df = pd.DataFrame(df_data)
        df['Datetime'] = pd.to_datetime(df['Datetime'])
        df = df.set_index('Datetime')
        df = df[['Open', 'High', 'Low', 'Close']]

    except HTTPException:
        raise
    except Exception as exc:
        logging.exception(f"Failed to fetch data for {ticker_upper}")
        raise HTTPException(
            status_code=500,
            detail=f"Unable to fetch ticker data: {exc}"
        ) from exc
    finally:
        if conn:
            release_db_connection(conn)

    if df.empty:
        raise HTTPException(
            status_code=400,
            detail=f"No data available for {ticker_upper}"
        )

    # Run TPSL optimization directly on DataFrame
    try:
        qiga_result, qiga_train, qiga_test, qiga_duration = run_tpsl_optimization_from_df(
            df,
            custom_rules,
        )
    except Exception as exc:
        logging.exception("Advanced ticker optimization failed")
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc

    if qiga_result is None or qiga_train is None or qiga_test is None:
        raise HTTPException(
            status_code=500,
            detail="Advanced optimizer found no valid strategy. Try adjusting parameters.",
        )

    payload = build_advanced_strategy_payload(
        qiga_result,
        qiga_train,
        qiga_test,
        qiga_duration,
    )

    if payload is None:
        raise HTTPException(
            status_code=500,
            detail="Failed to prepare advanced strategy response.",
        )

    return payload


# ============================================================================
# ASYNC BACKTEST ENDPOINTS (Celery-based)
# ============================================================================
# These endpoints use Celery for async processing, allowing backtests to run
# in background workers without blocking the FastAPI event loop.

@fastapi_app.post("/api/strategy-backtest/start", tags=["Strategy"])
async def start_backtest_async(
    request: Request,
    ticker: str = Form(...),
    custom_rules: str = Form(""),
    mode: str = Form("standard"),  # 'standard' or 'advanced'
):
    """
    Start async backtest task, returns task_id for SSE streaming.

    Args:
        ticker: Stock ticker symbol
        custom_rules: Optional custom trading rules
        mode: 'standard' for GA or 'advanced' for TPSL optimization

    Returns:
        {"task_id": "uuid", "status": "PENDING", "message": "Backtest queued"}
    """
    # Per-user concurrent task limit
    user_id = get_task_user_id(request)
    tier = get_task_tier(request)
    if not check_task_limit(user_id, tier):
        raise HTTPException(status_code=429, detail="Too many concurrent tasks. Please wait for existing tasks to complete.")

    from celery_tasks import run_backtest_task

    ticker_upper = ticker.upper().strip()
    if not ticker_upper:
        raise HTTPException(status_code=400, detail="Ticker is required")

    # Validate mode
    if mode not in ('standard', 'advanced'):
        raise HTTPException(status_code=400, detail="Mode must be 'standard' or 'advanced'")

    # Validate ticker exists
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM tickers WHERE UPPER(symbol) = %s LIMIT 1",
                (ticker_upper,)
            )
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail=f"Ticker {ticker_upper} not found")
    finally:
        if conn:
            release_db_connection(conn)

    # Submit task to Celery
    increment_task_count(user_id)
    task = run_backtest_task.delay(ticker_upper, custom_rules, mode)
    store_task_user(task.id, user_id)

    logging.info(f"[BACKTEST] Started async task {task.id} for {ticker_upper} (mode={mode})")

    return success_response({
        "task_id": task.id,
        "status": "PENDING",
        "message": f"Backtest queued for {ticker_upper}"
    })


@fastapi_app.get("/api/strategy-backtest/status/{task_id}", tags=["Strategy"])
async def get_backtest_task_status(task_id: str):
    """
    Get current task status (for polling or reconnection after page refresh).

    Returns task status and progress/result if available.
    """
    from celery.result import AsyncResult
    from celery_app import celery_app

    result = AsyncResult(task_id, app=celery_app)

    response = {
        "task_id": task_id,
        "status": result.status,  # PENDING, STARTED, PROGRESS, SUCCESS, FAILURE, REVOKED
    }

    if result.status == 'PROGRESS':
        response["progress"] = result.info  # Contains phase and progress
    elif result.status == 'SUCCESS':
        response["result"] = result.result
    elif result.status == 'FAILURE':
        response["error"] = str(result.result)

    return success_response(response)


@fastapi_app.get("/api/strategy-backtest/stream/{task_id}", tags=["Strategy"])
async def stream_backtest_progress(task_id: str):
    """
    SSE endpoint for streaming backtest progress in real-time.

    Events:
        - connected: Initial connection confirmation
        - status: Task status changed (PENDING, STARTED, PROGRESS, etc.)
        - progress: Progress update with phase and generation info
        - complete: Task completed successfully with result
        - error: Task failed with error message
        - cancelled: Task was revoked
    """
    from celery.result import AsyncResult
    from celery_app import celery_app

    async def event_generator():
        last_state = None
        last_progress = None
        heartbeat_counter = 0  # Track time for heartbeat to keep connection alive
        start_time = time.time()
        MAX_CONNECTION_TIME = 30 * 60  # 30 minutes max
        _decremented = False

        # Send connected event
        yield f"data: {json.dumps({'type': 'connected', 'task_id': task_id})}\n\n"

        while True:
            # Timeout protection: prevent infinite loop if task gets stuck
            if time.time() - start_time > MAX_CONNECTION_TIME:
                yield f"data: {json.dumps({'type': 'error', 'error': 'Stream timeout after 30 minutes'})}\n\n"
                if not _decremented:
                    cleanup_task_user(task_id)
                    _decremented = True
                break

            result = AsyncResult(task_id, app=celery_app)
            status = result.status

            # Send status change
            if status != last_state:
                yield f"data: {json.dumps({'type': 'status', 'status': status})}\n\n"
                last_state = status

            # Send progress update
            if status == 'PROGRESS' and result.info:
                meta = result.info
                current_progress = meta.get('progress')
                if current_progress != last_progress:
                    # Flatten progress data for frontend: {phase, generation, total, best_fitness, elapsed}
                    progress_data = {
                        'phase': meta.get('phase', 'optimizing'),
                        'generation': current_progress.get('generation', 0) if current_progress else 0,
                        'total': current_progress.get('total', 20) if current_progress else 20,
                        'best_fitness': current_progress.get('best_fitness', 0) if current_progress else 0,
                        'elapsed': current_progress.get('elapsed', 0) if current_progress else 0,
                    }
                    yield f"data: {json.dumps({'type': 'progress', 'data': progress_data})}\n\n"
                    last_progress = current_progress.copy() if current_progress else None

            # Handle completion states
            if status == 'SUCCESS':
                task_result = result.result
                # Check if task returned an internal error (exception caught in task)
                if isinstance(task_result, dict) and task_result.get('status') == 'error':
                    yield f"data: {json.dumps({'type': 'error', 'error': task_result.get('error', 'Unknown error'), 'duration': task_result.get('duration')})}\n\n"
                else:
                    # Transform equity_curve format for frontend compatibility
                    # Backend returns: equity_curve: [{date, value}, ...]
                    # Frontend expects: cumulative: number[], cumulative_dates: string[]
                    if isinstance(task_result, dict) and 'result' in task_result:
                        payload = task_result.get('result', {})
                        if 'equity_curve' in payload and isinstance(payload['equity_curve'], list):
                            equity_curve = payload['equity_curve']
                            payload['cumulative'] = [pt.get('value', 0) for pt in equity_curve]
                            payload['cumulative_dates'] = [pt.get('date', '') for pt in equity_curve]
                    yield f"data: {json.dumps({'type': 'complete', 'data': task_result})}\n\n"
                if not _decremented:
                    cleanup_task_user(task_id)
                    _decremented = True
                break
            elif status == 'FAILURE':
                error_msg = str(result.result) if result.result else "Unknown error"
                yield f"data: {json.dumps({'type': 'error', 'error': error_msg})}\n\n"
                if not _decremented:
                    cleanup_task_user(task_id)
                    _decremented = True
                break
            elif status == 'REVOKED':
                yield f"data: {json.dumps({'type': 'cancelled'})}\n\n"
                if not _decremented:
                    cleanup_task_user(task_id)
                    _decremented = True
                break

            # Send heartbeat every 5 seconds to keep connection alive
            # This prevents proxies/load balancers from closing idle connections
            heartbeat_counter += 0.05
            if heartbeat_counter >= 5.0:
                yield ": heartbeat\n\n"  # SSE comment - browsers ignore but keeps connection alive
                heartbeat_counter = 0

            await asyncio.sleep(0.05)  # Poll every 50ms for responsive updates

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@fastapi_app.post("/api/strategy-backtest/cancel/{task_id}", tags=["Strategy"])
async def cancel_backtest_task(task_id: str):
    """
    Cancel a running or pending backtest task.

    Note: Celery task cancellation may not immediately stop running tasks,
    but will prevent queued tasks from starting.
    """
    from celery_app import celery_app

    celery_app.control.revoke(task_id, terminate=True)
    cleanup_task_user(task_id)
    logging.info(f"[BACKTEST] Cancelled task {task_id}")

    return success_response({"status": "cancelled", "task_id": task_id})


@fastapi_app.post("/api/expert-screener/run", tags=["Technical Analysis"])
async def expert_screener_api(payload: ExpertScreenerRequest):
    """Run expert screener expressions backed by the yfinance-powered engine."""
    expression = (payload.expression or "").strip()
    if not expression:
        raise HTTPException(status_code=400, detail="Condition expression is required.")

    symbols: Optional[List[str]] = None
    if payload.symbols:
        trimmed = [
            symbol.strip().upper()
            for symbol in payload.symbols
            if symbol and symbol.strip()
        ]
        if trimmed:
            symbols = trimmed

    period = (payload.period or "1y").strip() or "1y"

    try:
        result = run_expert_screener(expression, symbols=symbols, period=period)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logging.exception("Expert screener failed")
        raise HTTPException(status_code=500, detail="Expert screener failed") from exc

    return success_response(result)


@fastapi_app.post("/api/expert-screener/start", tags=["Technical Analysis"])
async def start_expert_screener(request: Request, screener_request: ExpertScreenerRequest):
    """
    Start expert screener task and return job ID for SSE streaming.

    Request body: {"expression": "sma_50 > sma_200", "symbols": [...], "period": "1y"}

    Returns: {"job_id": "uuid-string"}

    Task state is stored in Redis, allowing this to work correctly
    across multiple uvicorn workers.
    """
    # Per-user concurrent task limit
    user_id = get_task_user_id(request)
    tier = get_task_tier(request)
    if not check_task_limit(user_id, tier):
        raise HTTPException(status_code=429, detail="Too many concurrent tasks. Please wait for existing tasks to complete.")

    # Generate unique job ID
    job_id = str(uuid.uuid4())
    increment_task_count(user_id)

    # Validate expression
    expression = screener_request.expression.strip()
    if not expression:
        raise HTTPException(status_code=400, detail="Condition expression is required")

    try:
        ConditionEvaluator(expression)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid expression: {str(e)}")

    # Create task state in Redis (shared across all workers)
    if not create_screener_task(job_id):
        raise HTTPException(status_code=500, detail="Failed to create screener task")

    logging.info(f"[SCREENER] Starting new job {job_id}")

    # Start background task
    symbols_list = screener_request.symbols or get_all_ticker_symbols()

    # Build result cache key from expression + sorted symbols
    _cache_data = f"{expression}:{','.join(sorted(symbols_list))}"
    result_cache_key = f"screener:result_cache:{hashlib.md5(_cache_data.encode()).hexdigest()}"

    # Capture user_id for task count decrement in thread
    _task_user_id = user_id

    def run_task():
        logging.info(f"Starting screener task {job_id}")

        # Verify task exists in Redis
        if not get_screener_task(job_id):
            logging.error(f"Task state not found in Redis for job {job_id}")
            decrement_task_count(_task_user_id)
            return

        def progress_cb(processed, total, matches):
            """Update progress in Redis."""
            logging.debug(f"Progress callback: {processed}/{total}, matches: {matches}")
            update_screener_task(job_id, {
                "processed": processed,
                "total": total,
                "matches": matches
            })

        def result_cb(result):
            """Append result to Redis list."""
            logging.debug(f"Result callback: {result.get('symbol', 'unknown')}")
            append_screener_result(job_id, result)

        def loading_cb(loaded, total):
            """Update loading progress in Redis."""
            update_screener_task(job_id, {
                "loading_status": {"loaded": loaded, "total": total}
            })

        def abort_check():
            """Check Redis for cancellation status (poll-based abort)."""
            return is_screener_cancelled(job_id)

        try:
            # Check result cache for identical expression+symbols
            cached_result = get_cached(result_cache_key)
            if cached_result:
                logging.info(f"Job {job_id}: Result cache HIT — replaying {len(cached_result.get('results', []))} results")
                cached_results = cached_result.get("results", [])
                cached_summary = cached_result.get("summary", {})
                total = len(symbols_list)

                # Replay loading
                loading_cb(total, total)

                # Replay results
                for r in cached_results:
                    result_cb(r)

                # Replay progress
                progress_cb(total, total, len(cached_results))

                update_screener_task(job_id, {
                    "status": "complete",
                    "summary": cached_summary,
                    "completed_at": time.time()
                })
                decrement_task_count(_task_user_id)
                return

            logging.info(f"Job {job_id}: Result cache MISS — running screener")
            summary = run_screener_streaming(
                condition_expr=expression,
                symbols=symbols_list,
                period=screener_request.period,
                progress_callback=progress_cb,
                result_callback=result_cb,
                loading_callback=loading_cb,
                abort_check=abort_check,
                batch_size=50,
                job_id=job_id,
            )

            logging.info(f"Job {job_id}: Screener completed successfully")
            update_screener_task(job_id, {
                "status": "complete",
                "summary": summary,
                "completed_at": time.time()
            })
            decrement_task_count(_task_user_id)

            # Cache the results for identical future expressions
            try:
                all_results = get_screener_results(job_id) or []
                set_cached(result_cache_key, {
                    "summary": summary,
                    "results": all_results
                }, TTL_SCREENER_RESULTS_CACHE)
                logging.info(f"Job {job_id}: Cached {len(all_results)} results (TTL={TTL_SCREENER_RESULTS_CACHE}s)")
            except Exception as cache_err:
                logging.warning(f"Job {job_id}: Failed to cache results: {cache_err}")

        except Exception as e:
            logging.exception(f"Expert screener task {job_id} failed")
            update_screener_task(job_id, {
                "status": "error",
                "error": str(e),
                "completed_at": time.time()
            })
            decrement_task_count(_task_user_id)

    # Start daemon thread
    threading.Thread(target=run_task, daemon=True).start()

    return success_response({"job_id": job_id})


@fastapi_app.get("/api/expert-screener/stream/{job_id}", tags=["Technical Analysis"])
async def stream_expert_screener(job_id: str):
    """
    Server-Sent Events (SSE) endpoint for streaming expert screener progress.

    Streams events:
    - data: {"type": "progress", "data": {"processed": 150, "total": 3081, "matches": 12}}
    - data: {"type": "result", "data": {...}}
    - data: {"type": "complete", "data": {...}}
    - data: {"type": "error", "error": "..."}
    - data: {"type": "cancelled"}

    Task state is read from Redis, allowing any uvicorn worker to serve the stream.
    """

    async def event_generator():
        last_processed = 0
        last_results_count = 0
        heartbeat_counter = 0
        idle_polls = 0
        start_time = time.time()
        MAX_CONNECTION_TIME = 30 * 60  # 30 minutes max

        # Send initial connected message
        logging.info(f"SSE stream connected for job {job_id}")
        yield f"data: {json.dumps({'type': 'connected', 'job_id': job_id})}\n\n"

        while True:
            # Check connection timeout
            if time.time() - start_time > MAX_CONNECTION_TIME:
                logging.warning(f"Job {job_id}: SSE connection timeout (30 min)")
                yield f"data: {json.dumps({'type': 'error', 'error': 'Connection timeout'})}\n\n"
                break

            # Get task state from Redis
            task = get_screener_task(job_id)
            if not task:
                logging.error(f"Job {job_id} not found in Redis")
                yield f"data: {json.dumps({'type': 'error', 'error': 'Job not found'})}\n\n"
                break

            status = task.get("status", "running")
            processed = task.get("processed", 0)
            total = task.get("total", 0)
            matches = task.get("matches", 0)
            loading_status = task.get("loading_status")
            summary = task.get("summary", {})
            error = task.get("error")

            # Get new results from Redis list (efficient incremental fetch)
            new_results = get_screener_results(job_id, start=last_results_count)

            # Process events
            had_activity = False

            # Send loading progress during data pre-fetch phase
            if loading_status and processed == 0:
                yield f"data: {json.dumps({'type': 'loading', 'data': loading_status})}\n\n"
                had_activity = True

            # Send progress if changed
            if processed != last_processed:
                logging.info(f"Job {job_id}: Progress {processed}/{total}, matches: {matches}")
                yield f"data: {json.dumps({'type': 'progress', 'data': {'processed': processed, 'total': total, 'matches': matches}})}\n\n"
                last_processed = processed
                had_activity = True

            # Send new results
            if new_results:
                logging.info(f"Job {job_id}: Sending {len(new_results)} new results")
                for result in new_results:
                    yield f"data: {json.dumps({'type': 'result', 'data': result}, default=str)}\n\n"
                last_results_count += len(new_results)
                had_activity = True

            # Send completion
            if status == "complete":
                logging.info(f"Job {job_id}: Completed with {matches} matches")
                yield f"data: {json.dumps({'type': 'complete', 'data': summary}, default=str)}\n\n"
                break

            # Send cancelled
            if status == "cancelled":
                logging.info(f"Job {job_id}: Cancelled")
                yield f"data: {json.dumps({'type': 'cancelled'})}\n\n"
                break

            # Send error
            if status == "error":
                logging.error(f"Job {job_id}: Error - {error}")
                yield f"data: {json.dumps({'type': 'error', 'error': error})}\n\n"
                break

            # Adaptive polling: faster when active, slower when idle
            if had_activity:
                idle_polls = 0
                poll_interval = 0.05  # 50ms when active
            else:
                idle_polls += 1
                if idle_polls < 10:
                    poll_interval = 0.05
                elif idle_polls < 50:
                    poll_interval = 0.1
                else:
                    poll_interval = 0.2

            # Send heartbeat every 5 seconds to keep connection alive
            heartbeat_counter += poll_interval
            if heartbeat_counter >= 5.0:
                yield f": heartbeat\n\n"
                heartbeat_counter = 0

            await asyncio.sleep(poll_interval)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@fastapi_app.post("/api/expert-screener/cancel/{job_id}", tags=["Technical Analysis"])
async def cancel_expert_screener(job_id: str):
    """Cancel running expert screener task.

    Sets status to 'cancelled' in Redis. The background task polls
    this status via is_screener_cancelled() and stops processing.
    """
    # Check if task exists
    if not get_screener_task(job_id):
        raise HTTPException(status_code=404, detail="Job not found")

    # Mark as cancelled in Redis (background task will poll this)
    success = update_screener_task(job_id, {
        "status": "cancelled",
        "completed_at": time.time()
    })

    if success:
        logging.info(f"[SCREENER] Job {job_id} cancelled")
        return success_response({"status": "cancelled"})
    else:
        raise HTTPException(status_code=500, detail="Failed to cancel task")


@fastapi_app.get("/api/expert-screener/universe", tags=["Technical Analysis"])
async def get_expert_screener_universe():
    """
    Get all available ticker symbols for expert screener.

    Returns:
        List of all ticker symbols from database (with .NS suffix)
    """
    try:
        symbols = get_all_ticker_symbols()
        return list_response(symbols)
    except Exception as e:
        logging.exception("Failed to fetch ticker universe")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch ticker symbols: {str(e)}"
        ) from e


@fastapi_app.post("/api/expert-screener/validate", tags=["Technical Analysis"])
async def validate_expert_screener_expression(payload: ExpertScreenerRequest):
    """
    Validate an expert screener expression without running it.

    Returns:
        Validation result with error message if invalid
    """
    expression = (payload.expression or "").strip()
    if not expression:
        raise HTTPException(status_code=400, detail="Expression is required")

    try:
        ConditionEvaluator(expression)
        return success_response({
            "valid": True,
            "expression": expression
        })
    except ValueError as e:
        return success_response({
            "valid": False,
            "expression": expression,
            "error": str(e)
        })


@fastapi_app.get("/api/expert-screener/templates", tags=["Technical Analysis"])
async def get_expert_screener_templates():
    """
    Get sample template expressions for expert screener.

    Returns:
        List of predefined template expressions
    """
    templates = [
        {
            "id": "momentum_liquidity",
            "name": "Momentum & Liquidity",
            "description": "Strong trend with large cash participation",
            "expression": "(close > ema_50) and (ema_50 > ema_150) and (liquidity > 5000000000)"
        },
        {
            "id": "rsi_pullback",
            "name": "RSI Pullback",
            "description": "Oversold dip within a long-term uptrend",
            "expression": "(close > sma_200) and (rsi_14 >= 35 and rsi_14 <= 50)"
        },
        {
            "id": "52w_breakout",
            "name": "52W Breakout Watch",
            "description": "Price reclaiming prior highs on rising RSI",
            "expression": "(close > 0.9 * high_52_W) and (ema_20 > ema_50)"
        }
    ]

    return list_response(templates)


@fastapi_app.get("/api/technical-indicators/{ticker_symbol}", tags=["Technical Analysis"])
async def get_technical_indicators(ticker_symbol: str):
    """
    Calculate technical indicators for a stock from ohlc_1hour data.
    Used by stock detail page to display technical analysis.

    Redis caching: 5-minute TTL to reduce database load.

    Args:
        ticker_symbol: Stock symbol (e.g., 'RELIANCE', 'TCS')

    Returns:
        JSON with all standard technical indicators and metadata
    """
    import sys
    sys.path.append(os.path.join(os.path.dirname(__file__), 'server'))
    from indicator_calculator import calculate_all_indicators

    # Decode URL-encoded characters (e.g., M%26M → M&M)
    ticker_symbol = unquote(ticker_symbol)
    # Remove .NS suffix if present and convert to uppercase
    clean_symbol = ticker_symbol.replace('.NS', '').upper()

    # Check Redis cache first
    cache_key = make_indicator_key(clean_symbol, "1hour")
    cached_result = get_cached(cache_key)
    if cached_result:
        logging.debug(f"[CACHE HIT] Technical indicators for {clean_symbol}")
        if "data" in cached_result:
            cached_result["data"]["cached"] = True
        else:
            cached_result["cached"] = True
        return cached_result

    logging.debug(f"[CACHE MISS] Technical indicators for {clean_symbol}")

    conn = None
    try:
        # Get database connection
        conn = get_db_connection()

        # Get ticker_id from symbol
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM tickers WHERE UPPER(symbol) = %s AND is_active = true",
                (clean_symbol,)
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(
                    status_code=404,
                    detail=f"Ticker {ticker_symbol} not found"
                )
            ticker_id = row[0]

        # Fetch 200 days of hourly data (enough for SMA 200 calculation)
        # Approximately 200 days * 6.5 hours/day = 1300 hours
        end_date = datetime.now()
        start_date = end_date - timedelta(days=250)  # Extra buffer for weekends/holidays

        accessor = TimeframeDataAccessor(conn)
        data = accessor.fetch_ohlc(
            ticker_id=ticker_id,
            timeframe='1hour',
            start_date=start_date,
            end_date=end_date
        )

        if not data or len(data) < 50:
            raise HTTPException(
                status_code=400,
                detail="Insufficient data to calculate indicators (need at least 50 data points)"
            )

        # Convert to DataFrame
        import pandas as pd
        df = pd.DataFrame(data)
        df['ts'] = pd.to_datetime(df['timestamp'])
        df = df.sort_values('ts')

        # Calculate all indicators using shared library
        indicators = calculate_all_indicators(df)

        # Get the latest timestamp
        latest_timestamp = df['ts'].iloc[-1].isoformat() if len(df) > 0 else None

        result = {
            "ticker": ticker_symbol,
            "as_of": latest_timestamp,
            "data_points": len(df),
            "indicators": indicators,
            "cached": False
        }

        # Cache the result (5-minute TTL) - wrapped in standard envelope
        wrapped = success_response(result)
        set_cached(cache_key, wrapped, TTL_TECHNICAL_INDICATORS)

        return wrapped

    except HTTPException:
        raise
    except Exception as e:
        logging.exception(f"Technical indicators API failed for {ticker_symbol}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to calculate technical indicators: {str(e)}"
        ) from e
    finally:
        if conn:
            release_db_connection(conn)


# ======================
# TipHub AI Chat Endpoints
# ======================

# OpenRouter configuration
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "moonshotai/kimi-k2:free")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

# TipHub stream state (Redis-backed)
TTL_TIPTEASE_STREAM = 600  # 10 minutes


class TipTeaseChatRequest(BaseModel):
    message: str
    context: Optional[str] = None  # e.g., ticker symbol
    history: Optional[List[Dict[str, str]]] = None  # Previous messages


class TipTeaseChatResponse(BaseModel):
    stream_id: str


def create_tiptease_stream(stream_id: str) -> bool:
    """Create a new TipHub stream in Redis."""
    key = f"tiptease:stream:{stream_id}"
    state = {
        "status": "pending",
        "content": "",
        "error": None,
        "created_at": time.time()
    }
    try:
        redis_client.setex(key, TTL_TIPTEASE_STREAM, json.dumps(state))
        return True
    except Exception as e:
        logging.error(f"[TIPHUB] Failed to create stream {stream_id}: {e}")
        return False


def get_tiptease_stream(stream_id: str) -> Optional[Dict[str, Any]]:
    """Get TipHub stream state from Redis."""
    key = f"tiptease:stream:{stream_id}"
    try:
        data = redis_client.get(key)
        return json.loads(data) if data else None
    except Exception as e:
        logging.error(f"[TIPHUB] Failed to get stream {stream_id}: {e}")
        return None


def update_tiptease_stream(stream_id: str, updates: Dict[str, Any]) -> bool:
    """Update TipHub stream state in Redis."""
    key = f"tiptease:stream:{stream_id}"
    try:
        current = redis_client.get(key)
        if current:
            state = json.loads(current)
            state.update(updates)
            redis_client.setex(key, TTL_TIPTEASE_STREAM, json.dumps(state))
            return True
        return False
    except Exception as e:
        logging.error(f"[TIPHUB] Failed to update stream {stream_id}: {e}")
        return False


def delete_tiptease_stream(stream_id: str) -> bool:
    """Delete a TipHub stream from Redis."""
    key = f"tiptease:stream:{stream_id}"
    try:
        redis_client.delete(key)
        return True
    except Exception as e:
        logging.error(f"[TIPHUB] Failed to delete stream {stream_id}: {e}")
        return False


def _openrouter_streaming_sync(messages, queue):
    """Synchronous OpenRouter streaming - runs in a thread to avoid blocking event loop."""
    url = f"{OPENROUTER_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://your-domain.com",
        "X-Title": "EquityPro AI"
    }
    payload = {
        "model": OPENROUTER_MODEL,
        "messages": messages,
        "stream": True,
        "max_tokens": 1024
    }

    response = None
    try:
        response = requests.post(url, headers=headers, json=payload, stream=True, timeout=60)
        response.raise_for_status()

        for line in response.iter_lines():
            if line:
                line_str = line.decode('utf-8')
                if line_str.startswith('data: '):
                    data_str = line_str[6:]
                    if data_str == '[DONE]':
                        break
                    try:
                        data = json.loads(data_str)
                        if 'choices' in data and len(data['choices']) > 0:
                            delta = data['choices'][0].get('delta', {})
                            content = delta.get('content', '')
                            if content:
                                queue.put_nowait(content)
                    except json.JSONDecodeError:
                        continue
        queue.put_nowait(None)  # Signal completion
    except requests.exceptions.Timeout:
        queue.put_nowait(ValueError("Request timed out"))
    except requests.exceptions.RequestException as e:
        queue.put_nowait(ValueError(f"API request failed: {str(e)}"))
    except Exception as e:
        queue.put_nowait(ValueError(str(e)))
    finally:
        if response:
            response.close()


async def call_openrouter_streaming(
    message: str,
    history: Optional[List[Dict[str, str]]] = None,
    context: Optional[str] = None
):
    """
    Call OpenRouter API with streaming enabled.
    Yields response chunks as they arrive.
    Uses a thread to avoid blocking the asyncio event loop.
    """
    if not OPENROUTER_API_KEY:
        raise ValueError("OPENROUTER_API_KEY not configured")

    # Build messages
    messages = []

    # System prompt for financial assistant
    system_prompt = """You are EquityPro AI, an AI-powered financial assistant for Indian stock markets.
You help users understand stocks, market trends, and investment concepts.

Guidelines:
- Be concise and informative
- Use Indian market context (NSE, BSE, Nifty, Sensex)
- Provide balanced views, not financial advice
- Use ₹ for currency
- Format numbers in Indian style (lakhs, crores)
- Always include a disclaimer that this is not financial advice"""

    messages.append({"role": "system", "content": system_prompt})

    # Add context if provided
    if context:
        messages.append({
            "role": "system",
            "content": f"User is asking about: {context}"
        })

    # Add history if provided
    if history:
        for msg in history[-10:]:  # Limit to last 10 messages
            messages.append({
                "role": msg.get("role", "user"),
                "content": msg.get("content", "")
            })

    # Add current message
    messages.append({"role": "user", "content": message})

    # Run blocking HTTP streaming in a thread, read chunks via queue
    import queue as queue_module
    chunk_queue = queue_module.Queue()

    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, _openrouter_streaming_sync, messages, chunk_queue)

    while True:
        # Poll queue without blocking the event loop
        try:
            chunk = chunk_queue.get_nowait()
        except queue_module.Empty:
            await asyncio.sleep(0.02)
            continue

        if chunk is None:
            break  # Stream complete
        if isinstance(chunk, Exception):
            raise chunk
        yield chunk


@fastapi_app.post("/api/tip-tease/chat/start", tags=["AI Chat"])
async def start_tiptease_chat(request: TipTeaseChatRequest):
    """
    Start a new EquityPro chat stream.

    Returns a stream_id that can be used with the SSE endpoint.
    """
    if not OPENROUTER_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="EquityPro AI is not configured. Please set OPENROUTER_API_KEY."
        )

    stream_id = str(uuid.uuid4())

    if not create_tiptease_stream(stream_id):
        raise HTTPException(
            status_code=500,
            detail="Failed to create chat stream"
        )

    # Store the request for the stream handler
    request_key = f"tiptease:request:{stream_id}"
    try:
        redis_client.setex(
            request_key,
            TTL_TIPTEASE_STREAM,
            json.dumps({
                "message": request.message,
                "context": request.context,
                "history": request.history
            })
        )
    except Exception as e:
        logging.error(f"[TIPHUB] Failed to store request: {e}")
        raise HTTPException(status_code=500, detail="Failed to initialize chat")

    logging.info(f"[TIPHUB] Started stream {stream_id} for message: {request.message[:50]}...")

    return TipTeaseChatResponse(stream_id=stream_id)


@fastapi_app.get("/api/tip-tease/stream/{stream_id}", tags=["AI Chat"])
async def stream_tiptease_response(stream_id: str):
    """
    SSE endpoint for streaming EquityPro AI response.

    Events:
        - connected: Initial connection confirmation
        - chunk: Response text chunk (for typewriter effect)
        - complete: Response complete with full content
        - error: Error occurred
    """
    async def event_generator():
        # Send connected event
        yield f"data: {json.dumps({'type': 'connected', 'stream_id': stream_id})}\n\n"

        # Get the stored request
        request_key = f"tiptease:request:{stream_id}"
        try:
            request_data = redis_client.get(request_key)
            if not request_data:
                yield f"data: {json.dumps({'type': 'error', 'error': 'Stream not found or expired'})}\n\n"
                return

            request = json.loads(request_data)
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': f'Failed to load request: {str(e)}'})}\n\n"
            return

        # Update stream status
        update_tiptease_stream(stream_id, {"status": "streaming"})

        full_content = ""
        try:
            # Stream the response
            async for chunk in call_openrouter_streaming(
                message=request["message"],
                history=request.get("history"),
                context=request.get("context")
            ):
                full_content += chunk
                yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"
                # Small delay to prevent overwhelming the client
                await asyncio.sleep(0.01)

            # Update final state
            update_tiptease_stream(stream_id, {
                "status": "complete",
                "content": full_content
            })

            # Send complete event
            yield f"data: {json.dumps({'type': 'complete', 'content': full_content})}\n\n"

            logging.info(f"[TIPHUB] Stream {stream_id} completed, {len(full_content)} chars")

        except ValueError as e:
            error_msg = str(e)
            update_tiptease_stream(stream_id, {
                "status": "error",
                "error": error_msg
            })
            yield f"data: {json.dumps({'type': 'error', 'error': error_msg})}\n\n"
            logging.error(f"[TIPHUB] Stream {stream_id} error: {error_msg}")

        except Exception as e:
            error_msg = f"Unexpected error: {str(e)}"
            update_tiptease_stream(stream_id, {
                "status": "error",
                "error": error_msg
            })
            yield f"data: {json.dumps({'type': 'error', 'error': error_msg})}\n\n"
            logging.exception(f"[TIPHUB] Stream {stream_id} unexpected error")

        finally:
            # Clean up request data
            try:
                redis_client.delete(request_key)
            except Exception:
                pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@fastapi_app.post("/api/tip-tease/cancel/{stream_id}", tags=["AI Chat"])
async def cancel_tiptease_stream(stream_id: str):
    """Cancel a running EquityPro stream."""
    # Mark as cancelled
    update_tiptease_stream(stream_id, {"status": "cancelled"})

    # Clean up
    delete_tiptease_stream(stream_id)
    try:
        redis_client.delete(f"tiptease:request:{stream_id}")
    except Exception:
        pass

    logging.info(f"[TIPHUB] Cancelled stream {stream_id}")

    return {"stream_id": stream_id, "status": "cancelled"}


@fastapi_app.get("/api/tip-tease/summary", tags=["AI Chat"])
async def get_tiptease_summary():
    """
    Get today's market summary and contextual hint for EquityPro.

    Returns:
        - summary: Brief market overview
        - hint: Contextual prompt suggestion
        - market_status: Current market status (open/closed/pre-market)
    """
    api_start = time.time()
    logging.info("[API] /api/tip-tease/summary START")

    try:
        # Get market status
        market_status = get_market_status()

        # Get market mood for sentiment
        mood_data = None
        try:
            mood_data = get_fear_greed_data()
        except Exception:
            pass

        # Get top gainers/losers for context
        conn = None
        top_gainer = None
        top_loser = None
        nifty_change = None

        try:
            conn = get_db_connection()
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # Get top gainer
                cursor.execute("""
                    SELECT symbol, change_percent
                    FROM market_movers_live
                    WHERE category = 'GAINER'
                    ORDER BY rank ASC
                    LIMIT 1
                """)
                row = cursor.fetchone()
                if row:
                    top_gainer = {"symbol": row["symbol"], "change": float(row["change_percent"])}

                # Get top loser
                cursor.execute("""
                    SELECT symbol, change_percent
                    FROM market_movers_live
                    WHERE category = 'LOSER'
                    ORDER BY rank ASC
                    LIMIT 1
                """)
                row = cursor.fetchone()
                if row:
                    top_loser = {"symbol": row["symbol"], "change": float(row["change_percent"])}

                # Get Nifty 50 change
                cursor.execute("""
                    SELECT ltp, prev_close
                    FROM ltp_live
                    WHERE symbol = 'NIFTY 50' OR symbol = '^NSEI'
                    LIMIT 1
                """)
                row = cursor.fetchone()
                if row and row["prev_close"]:
                    ltp = float(row["ltp"]) if row["ltp"] else 0
                    prev = float(row["prev_close"]) if row["prev_close"] else 0
                    if prev > 0:
                        nifty_change = ((ltp - prev) / prev) * 100

        except Exception as e:
            logging.error(f"[TIPHUB] Failed to get market data: {e}")
        finally:
            if conn:
                release_db_connection(conn)

        # Build summary
        summary_parts = []

        if nifty_change is not None:
            direction = "up" if nifty_change > 0 else "down"
            summary_parts.append(f"Nifty 50 is {direction} {abs(nifty_change):.1f}%")

        if mood_data and mood_data.get("current"):
            category = mood_data["current"].get("category", "Neutral")
            summary_parts.append(f"Market sentiment: {category}")

        if top_gainer:
            summary_parts.append(f"Top gainer: {top_gainer['symbol']} (+{top_gainer['change']:.1f}%)")

        summary = ". ".join(summary_parts) if summary_parts else "Markets are trading normally today."

        # Build contextual hint
        hint = None
        if nifty_change is not None:
            if nifty_change > 1:
                hint = f"Markets are up {nifty_change:.1f}% - ask why?"
            elif nifty_change < -1:
                hint = f"Markets are down {abs(nifty_change):.1f}% - ask what's happening?"
            elif top_gainer:
                hint = f"{top_gainer['symbol']} is up {top_gainer['change']:.1f}% - want to know more?"
        else:
            hint = "Ask about any stock or market trend"

        result = {
            "summary": summary,
            "hint": hint,
            "market_status": market_status.get("status", "CLOSED"),
            "is_market_open": market_status.get("is_open", False),
            # Future: Add market data context (commented out for now)
            # "context": {
            #     "nifty_change": nifty_change,
            #     "top_gainer": top_gainer,
            #     "top_loser": top_loser,
            #     "mood": mood_data.get("current") if mood_data else None
            # }
        }

        logging.info(f"[API] /api/tip-tease/summary DONE in {time.time() - api_start:.2f}s")
        return result

    except Exception as e:
        logging.exception("[TIPHUB] Summary endpoint error")
        return {
            "summary": "Markets are trading today.",
            "hint": "Ask about any stock or market trend",
            "market_status": "UNKNOWN",
            "is_market_open": False
        }


# =============================================================================
# FinTerminal Endpoints (ported from FinTerminal main.py)
# =============================================================================

# --- Imports needed by FinTerminal endpoints ---
try:
    from zoneinfo import ZoneInfo as _ZoneInfo
    _FT_IST = _ZoneInfo("Asia/Kolkata")
except ImportError:
    import pytz as _pytz_ft
    _FT_IST = _pytz_ft.timezone("Asia/Kolkata")

try:
    import asyncpg as _asyncpg
except ImportError:
    _asyncpg = None  # type: ignore

try:
    import msgpack as _msgpack
except ImportError:
    _msgpack = None  # type: ignore

try:
    import redis.asyncio as _aioredis
except ImportError:
    _aioredis = None  # type: ignore

from collections import defaultdict as _defaultdict

# FinTerminal modules
try:
    from option_chain_live import fetch_nse_index_option_chain as _ft_fetch_nse_index_option_chain
except ImportError:
    _ft_fetch_nse_index_option_chain = None  # type: ignore

try:
    from option_chain_visualizer import (
        compute_exposures as _ft_compute_exposures,
        build_iv_surface as _ft_build_iv_surface,
        append_atm_gxoi as _ft_append_atm_gxoi,
        get_atm_gxoi_timeseries as _ft_get_atm_gxoi_timeseries,
        append_surface_snapshot as _ft_append_surface_snapshot,
        get_surface_history as _ft_get_surface_history,
        cache_exposure_data as _ft_cache_exposure_data,
        get_cached_exposure_data as _ft_get_cached_exposure_data,
        cache_surface_data as _ft_cache_surface_data,
        get_cached_surface_data as _ft_get_cached_surface_data,
        is_market_hours as _ft_viz_is_market_hours,
    )
except ImportError:
    _ft_compute_exposures = None  # type: ignore
    _ft_build_iv_surface = None  # type: ignore
    _ft_append_atm_gxoi = None  # type: ignore
    _ft_get_atm_gxoi_timeseries = None  # type: ignore
    _ft_append_surface_snapshot = None  # type: ignore
    _ft_get_surface_history = None  # type: ignore
    _ft_cache_exposure_data = None  # type: ignore
    _ft_get_cached_exposure_data = None  # type: ignore
    _ft_cache_surface_data = None  # type: ignore
    _ft_get_cached_surface_data = None  # type: ignore
    _ft_viz_is_market_hours = None  # type: ignore

try:
    from advanced_screener import run_screener as _ft_run_screener, run_screener_async as _ft_run_screener_async
except ImportError:
    _ft_run_screener = None  # type: ignore
    _ft_run_screener_async = None  # type: ignore

try:
    from rrg import generate_rrg as _ft_generate_rrg, generate_rrg_from_db as _ft_generate_rrg_from_db
except ImportError:
    _ft_generate_rrg = None  # type: ignore
    _ft_generate_rrg_from_db = None  # type: ignore

try:
    import redis_cache as _ft_redis_cache
except ImportError:
    _ft_redis_cache = None  # type: ignore

try:
    import request_coalescing as _ft_request_coalescing
except ImportError:
    _ft_request_coalescing = None  # type: ignore

try:
    import realtime_stream as _ft_realtime_stream
except ImportError:
    _ft_realtime_stream = None  # type: ignore

try:
    from shared.market_calendar import get_trading_date as _ft_get_trading_date, get_cache_ttl as _ft_get_cache_ttl
except ImportError:
    _ft_get_trading_date = None  # type: ignore
    _ft_get_cache_ttl = None  # type: ignore

try:
    from shared.depth_serialization import (
        unpack_depth_data as _ft_unpack_depth_data,
        pack_history_message as _ft_pack_history_message,
        pack_update_message as _ft_pack_update_message,
        pack_error_message as _ft_pack_error_message,
        pack_heartbeat_message as _ft_pack_heartbeat_message,
        pack_subscribed_message as _ft_pack_subscribed_message,
        pack_unavailable_message as _ft_pack_unavailable_message,
        pack_pending_message as _ft_pack_pending_message,
    )
except ImportError:
    _ft_unpack_depth_data = None  # type: ignore
    _ft_pack_history_message = None  # type: ignore
    _ft_pack_update_message = None  # type: ignore
    _ft_pack_error_message = None  # type: ignore
    _ft_pack_heartbeat_message = None  # type: ignore
    _ft_pack_subscribed_message = None  # type: ignore
    _ft_pack_unavailable_message = None  # type: ignore
    _ft_pack_pending_message = None  # type: ignore

try:
    from shared.depth_subscription import (
        DEPTH_CONTROL_CHANNEL as _FT_DEPTH_CONTROL_CHANNEL,
        DEPTH_RESPONSE_PREFIX as _FT_DEPTH_RESPONSE_PREFIX,
        DEPTH_SUBSCRIBED_SET as _FT_DEPTH_SUBSCRIBED_SET,
        ACK_TIMEOUT_MS as _FT_ACK_TIMEOUT_MS,
        SubscriptionCommand as _FT_SubscriptionCommand,
        SubscriptionResponse as _FT_SubscriptionResponse,
    )
except ImportError:
    _FT_DEPTH_CONTROL_CHANNEL = "depth:control"
    _FT_DEPTH_RESPONSE_PREFIX = "depth:response:"
    _FT_DEPTH_SUBSCRIBED_SET = "depth:subscribed"
    _FT_ACK_TIMEOUT_MS = 5000
    _FT_SubscriptionCommand = None  # type: ignore
    _FT_SubscriptionResponse = None  # type: ignore

# --- FinTerminal helper variables ---
_FT_USE_YFINANCE_FALLBACK = os.getenv("USE_YFINANCE_FALLBACK", "true").lower() == "true"

# --- FinTerminal helper functions ---

def _ft_api_response(data: Any, message: str = "Success"):
    """Standard API response format (FinTerminal style)."""
    return {
        "success": True,
        "data": data,
        "message": message,
        "timestamp": datetime.now().isoformat()
    }


def _ft_api_error(message: str, status_code: int = 500):
    """Standard error response (FinTerminal style)."""
    raise HTTPException(
        status_code=status_code,
        detail={"success": False, "message": message}
    )


def _ft_format_symbol(symbol: str) -> str:
    """Format symbol for yfinance (add .NS for Indian stocks)."""
    symbol = symbol.upper()
    index_mappings = {
        "SENSEX": "^BSESN",
        "NIFTY 50": "^NSEI",
        "NIFTY NEXT 50": "^NSMIDCP",
        "NIFTY BANK": "^NSEBANK",
    }
    if symbol in index_mappings:
        return index_mappings[symbol]
    indian_stocks = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK',
                     'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL', 'KOTAKBANK']
    if symbol in indian_stocks and not symbol.endswith(('.NS', '.BO')):
        return f"{symbol}.NS"
    if symbol.endswith(('.NS', '.BO')):
        return symbol
    return symbol


def _ft_require_db_pool():
    if not _ft_asyncpg_pool:
        raise HTTPException(
            status_code=503,
            detail={"success": False, "message": "Database connection unavailable. Please try again later."},
        )


def _ft_get_range_params(range_value: str):
    """Map UI selection to yfinance period/interval."""
    mappings = {
        "5D": ("5d", "1h"),
        "1M": ("1mo", "1d"),
        "3M": ("3mo", "1d"),
        "6M": ("6mo", "1d"),
        "1Y": ("1y", "1d"),
        "3Y": ("3y", "1d"),
        "5Y": ("5y", "1d"),
    }
    return mappings.get(range_value.upper(), ("1mo", "1d"))


def _ft_fetch_symbol_history(symbol: str, period: str, interval: str, include_time: bool = False) -> Dict[str, Any]:
    """Fetch historical data for a symbol using yfinance.

    yfinance returns NaN for half-day holidays / illiquid bars. NaN floats
    are not valid JSON (FastAPI's default encoder raises ValueError), so we
    skip rows where any OHLC field is NaN rather than emitting them and
    blowing up the whole response downstream.
    """
    try:
        formatted_symbol = _ft_format_symbol(symbol)
        ticker = yf.Ticker(formatted_symbol)
        history = ticker.history(period=period, interval=interval)
        if history is None or history.empty:
            return {"symbol": symbol.upper(), "data": []}
        records = []
        for index, row in history.iterrows():
            date_value = index.to_pydatetime() if hasattr(index, "to_pydatetime") else index
            if include_time:
                timestamp_value = date_value.isoformat()
            else:
                timestamp_value = date_value.strftime("%Y-%m-%d")

            o = row.get("Open")
            h = row.get("High")
            l = row.get("Low")
            c = row.get("Close")
            v = row.get("Volume")
            # Drop rows that have any NaN in OHLC — these are yfinance gaps
            # for missing/half-day sessions and would break JSON serialization.
            if any(pd.isna(x) for x in (o, h, l, c)):
                continue
            records.append({
                "timestamp": timestamp_value,
                "date": date_value.strftime("%Y-%m-%d"),
                "open": float(o),
                "high": float(h),
                "low": float(l),
                "close": float(c),
                "volume": int(v) if v is not None and not pd.isna(v) else 0,
            })
        return {"symbol": symbol.upper(), "data": records}
    except Exception as exc:
        print(f"Error fetching history for {symbol}: {exc}")
        return {"symbol": symbol.upper(), "data": []}


def _ft_calculate_synthetic_vix(df: pd.DataFrame, lookback: int = 22) -> float:
    """Synthetic VIX from DataFrame (FinTerminal version)."""
    if df.empty or len(df) < lookback:
        raise ValueError(f"Insufficient data: need at least {lookback} rows, got {len(df)}")
    rolling_high = df["high"].rolling(window=lookback, min_periods=lookback).max()
    rolling_high = rolling_high.replace(0, pd.NA)
    vix_series = 10000 * (rolling_high - df["low"]) / rolling_high
    vix_series = vix_series.dropna()
    if vix_series.empty:
        raise ValueError("Unable to compute synthetic VIX - insufficient valid price data")
    return float(vix_series.iloc[-1])


def _ft_fetch_yfinance_quote(symbol: str) -> Optional[Dict[str, Any]]:
    """Fetch latest quote data using yfinance (FinTerminal version)."""
    try:
        formatted_symbol = _ft_format_symbol(symbol)
        ticker = yf.Ticker(formatted_symbol)
        intraday = ticker.history(period="5d", interval="5m")
        if intraday is None or intraday.empty:
            intraday = ticker.history(period="5d", interval="15m")
        if intraday is None or intraday.empty:
            return None
        last_row = intraday.iloc[-1]
        prev_row = intraday.iloc[-2] if len(intraday) > 1 else last_row
        price = float(last_row["Close"])
        previous_close = float(prev_row["Close"]) if prev_row is not None else price
        change = price - previous_close
        change_percent = (change / previous_close * 100) if previous_close else 0
        timestamp = last_row.name.to_pydatetime() if hasattr(last_row.name, "to_pydatetime") else datetime.now()
        return {
            "symbol": symbol.upper(),
            "name": symbol.upper(),
            "price": price,
            "change": change,
            "changePercent": change_percent,
            "open": float(last_row["Open"]),
            "high": float(last_row["High"]),
            "low": float(last_row["Low"]),
            "volume": int(last_row["Volume"]) if not pd.isna(last_row["Volume"]) else 0,
            "previousClose": previous_close,
            "timestamp": timestamp.isoformat(),
        }
    except Exception as exc:
        print(f"Error fetching yfinance quote for {symbol}: {exc}")
        return None


# --- FinTerminal asyncpg pool (separate from EdgeFlow's psycopg2 pool) ---
# This pool is None by default; set it externally if asyncpg is available
# and a connection to the same DB is needed by FinTerminal endpoints.
_ft_asyncpg_pool = None


# =============================================================================
# Pydantic models for FinTerminal endpoints
# =============================================================================

class ScreenerRequest(BaseModel):
    expression: str
    symbols: Optional[List[str]] = None
    period: Optional[str] = "1y"


class AsyncScreenerRequest(BaseModel):
    """Request model for async screener job submission."""
    expression: str
    symbols: Optional[List[str]] = None
    period: Optional[str] = "6mo"


class PortfolioOptimizeRequest(BaseModel):
    """Request model for portfolio optimization job submission."""
    holdings: List[Dict[str, Any]]  # [{symbol: str, quantity: int}, ...]
    risk_free_rate: float = 0.068
    max_weight: float = 0.30
    rebalance_frequency: str = "M"
    lookback_period: str = "2y"


# --- Check if Celery is available (FinTerminal uses celery_tasks module) ---
try:
    from celery_tasks import (
        celery_app as _ft_celery_app,
        run_equity_screener as _ft_celery_run_screener,
        generate_rrg_data as _ft_celery_generate_rrg,
        get_job_status as _ft_celery_get_job_status,
        optimize_portfolio as _ft_celery_optimize_portfolio,
    )
    _FT_CELERY_AVAILABLE = True
except ImportError:
    _ft_celery_app = None  # type: ignore
    _ft_celery_run_screener = None  # type: ignore
    _ft_celery_generate_rrg = None  # type: ignore
    _ft_celery_get_job_status = None  # type: ignore
    _ft_celery_optimize_portfolio = None  # type: ignore
    _FT_CELERY_AVAILABLE = False

# --- Depth WebSocket configuration ---
_FT_DEPTH_REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
_FT_DEPTH_CHANNEL_PREFIX = os.getenv("DEPTH_REDIS_CHANNEL_PREFIX", "depth")
_FT_DEPTH_WS_HEARTBEAT_INTERVAL = int(os.getenv("DEPTH_WS_HEARTBEAT_INTERVAL", "30"))
_FT_DEPTH_WS_MAX_CONNECTIONS = int(os.getenv("DEPTH_WS_MAX_CONNECTIONS", "5000"))

_ft_depth_ws_connections: Dict[str, int] = {}
_ft_depth_ws_lock = asyncio.Lock()


class _FTDepthWSConnectionManager:
    """Per-user isolated WebSocket handler for order book depth (FinTerminal port)."""

    def __init__(self):
        self.active_connections: Dict[str, set] = {}
        self._redis_client = None

    async def _get_redis(self):
        if self._redis_client is None and _aioredis is not None:
            self._redis_client = _aioredis.from_url(
                _FT_DEPTH_REDIS_URL,
                encoding="utf-8",
                decode_responses=True
            )
        return self._redis_client

    async def connect(self, websocket: WebSocket, symbol: str):
        async with _ft_depth_ws_lock:
            total_connections = sum(len(conns) for conns in self.active_connections.values())
            if total_connections >= _FT_DEPTH_WS_MAX_CONNECTIONS:
                return (False, "limit_exceeded")
            if symbol not in self.active_connections:
                self.active_connections[symbol] = set()
            self.active_connections[symbol].add(websocket)

        try:
            redis = await self._get_redis()
            if redis is None or _FT_SubscriptionCommand is None:
                return (True, "already_subscribed")
            cmd = _FT_SubscriptionCommand(
                action="viewer_join",
                symbol=symbol,
                timestamp=time.time()
            )
            response_channel = f"{_FT_DEPTH_RESPONSE_PREFIX}{cmd.request_id}"
            pubsub = redis.pubsub()
            await pubsub.subscribe(response_channel)
            await redis.publish(_FT_DEPTH_CONTROL_CHANNEL, cmd.to_json())
            try:
                timeout_sec = _FT_ACK_TIMEOUT_MS / 1000
                deadline = time.time() + timeout_sec
                async for message in pubsub.listen():
                    if time.time() > deadline:
                        raise asyncio.TimeoutError()
                    if message["type"] == "message":
                        response = _FT_SubscriptionResponse.from_json(message["data"])
                        return (response.success, response.message)
            except asyncio.TimeoutError:
                return (False, "timeout")
            finally:
                await pubsub.unsubscribe(response_channel)
                await pubsub.close()
        except Exception as e:
            print(f"[DepthWS] Error requesting subscription for {symbol}: {e}", flush=True)
            return (True, "already_subscribed")

        return (True, "already_subscribed")

    async def disconnect(self, websocket: WebSocket, symbol: str):
        async with _ft_depth_ws_lock:
            if symbol in self.active_connections:
                self.active_connections[symbol].discard(websocket)
                if not self.active_connections[symbol]:
                    del self.active_connections[symbol]
        try:
            redis = await self._get_redis()
            if redis is not None and _FT_SubscriptionCommand is not None:
                cmd = _FT_SubscriptionCommand(
                    action="viewer_leave",
                    symbol=symbol,
                    timestamp=time.time()
                )
                await redis.publish(_FT_DEPTH_CONTROL_CHANNEL, cmd.to_json())
        except Exception as e:
            print(f"[DepthWS] Error sending viewer_leave for {symbol}: {e}", flush=True)


_ft_depth_ws_manager = _FTDepthWSConnectionManager()


# =============================================================================
# FinTerminal: Option Chain Endpoints
# =============================================================================

@fastapi_app.get("/api/options/{symbol}")
async def ft_get_option_chain(symbol: str, expiry: str = Query(None)):
    """Fetch option chain data (NIFTY via NSE live scraper, otherwise yfinance)."""
    try:
        normalized_symbol = symbol.upper()
        if normalized_symbol in {"NIFTY", "NIFTY 50", "^NSEI", "BANKNIFTY", "NIFTY BANK"}:
            if _ft_fetch_nse_index_option_chain is None:
                return _ft_api_response({
                    "symbol": symbol.upper(), "expiry": None,
                    "availableExpiries": [], "calls": [], "puts": [],
                }, "option_chain_live module unavailable")
            live_chain = await asyncio.to_thread(_ft_fetch_nse_index_option_chain, normalized_symbol, expiry)
            return _ft_api_response(live_chain, "Live NSE option chain")

        formatted_symbol = _ft_format_symbol(symbol)
        ticker = yf.Ticker(formatted_symbol)
        available_expiries = ticker.options or []

        target_expiry = expiry or (available_expiries[0] if available_expiries else None)
        if not target_expiry:
            return _ft_api_response({
                "symbol": symbol.upper(),
                "expiry": None,
                "availableExpiries": available_expiries,
                "calls": [],
                "puts": [],
            }, "No option expiries available")

        chain = ticker.option_chain(target_expiry)

        def serialize_option(record: Dict[str, Any]) -> Dict[str, Any]:
            def safe_number(value: Any) -> float:
                try:
                    if value is None:
                        return 0.0
                    if isinstance(value, (int, float)):
                        if value != value:
                            return 0.0
                        return float(value)
                    return float(value)
                except (TypeError, ValueError):
                    return 0.0

            return {
                "contract": str(record.get("contractSymbol") or record.get("contract")),
                "strike": safe_number(record.get("strike")),
                "lastPrice": safe_number(record.get("lastPrice")),
                "bid": safe_number(record.get("bid")),
                "ask": safe_number(record.get("ask")),
                "change": safe_number(record.get("change")),
                "changePercent": safe_number(record.get("percentChange")),
                "volume": int(safe_number(record.get("volume"))),
                "openInterest": int(safe_number(record.get("openInterest"))),
                "impliedVolatility": safe_number(record.get("impliedVolatility")) * 100,
                "inTheMoney": bool(record.get("inTheMoney")),
            }

        calls = chain.calls.to_dict("records") if hasattr(chain, "calls") else []
        puts = chain.puts.to_dict("records") if hasattr(chain, "puts") else []

        data = {
            "symbol": symbol.upper(),
            "expiry": target_expiry,
            "availableExpiries": available_expiries,
            "calls": [serialize_option(record) for record in calls],
            "puts": [serialize_option(record) for record in puts],
        }

        return _ft_api_response(data)

    except Exception as exc:
        print(f"Option chain error for {symbol}: {exc}")
        return _ft_api_response({
            "symbol": symbol.upper(),
            "expiry": None,
            "availableExpiries": [],
            "calls": [],
            "puts": [],
        }, f"Option chain unavailable: {str(exc)}")


@fastapi_app.get("/api/options-visualizer/exposure/{symbol}")
async def ft_get_options_exposure(symbol: str, expiry: str = Query(None)):
    """Get GxOI and GEX exposure data by strike for 2D bar charts."""
    try:
        normalized = symbol.upper()
        if normalized not in {"NIFTY", "BANKNIFTY", "NIFTY 50", "NIFTY BANK"}:
            return _ft_api_error("Only NIFTY and BANKNIFTY supported", 400)

        if normalized in {"NIFTY 50", "NIFTY"}:
            normalized = "NIFTY"
        elif normalized in {"NIFTY BANK", "BANKNIFTY"}:
            normalized = "BANKNIFTY"

        if _ft_get_cached_exposure_data is None or _ft_fetch_nse_index_option_chain is None:
            return _ft_api_error("option_chain_visualizer module unavailable", 503)

        cached = await _ft_get_cached_exposure_data(normalized)
        if cached:
            return _ft_api_response(cached, "Cached exposure data")

        chain = await asyncio.to_thread(_ft_fetch_nse_index_option_chain, normalized, expiry)
        spot = chain.get("underlying", 0)

        if not spot:
            return _ft_api_error("Unable to get spot price", 503)

        exposure_data = _ft_compute_exposures(chain, spot)

        now = datetime.now(_FT_IST)
        try:
            asyncio.ensure_future(_ft_append_atm_gxoi(normalized, now, exposure_data["atm_gxoi"]))
        except Exception as e:
            logging.warning(f"Failed to append ATM GxOI: {e}")

        await _ft_cache_exposure_data(normalized, exposure_data)

        return _ft_api_response(exposure_data, "Exposure data calculated")

    except Exception as e:
        print(f"Options exposure error for {symbol}: {e}")
        return _ft_api_error(f"Failed to compute exposure: {str(e)}", 500)


@fastapi_app.get("/api/options-visualizer/timeseries/{symbol}")
async def ft_get_options_timeseries(symbol: str, date: str = Query(None)):
    """Get ATM GxOI time series for current or specified trading session."""
    try:
        normalized = symbol.upper()
        if normalized not in {"NIFTY", "BANKNIFTY"}:
            return _ft_api_error("Only NIFTY and BANKNIFTY supported", 400)

        if _ft_get_atm_gxoi_timeseries is None or _ft_viz_is_market_hours is None:
            return _ft_api_error("option_chain_visualizer module unavailable", 503)

        history = await _ft_get_atm_gxoi_timeseries(normalized, date)

        return _ft_api_response({
            "symbol": normalized,
            "data": history,
            "is_market_open": _ft_viz_is_market_hours(),
            "date": date or datetime.now(_FT_IST).strftime("%Y-%m-%d"),
        }, "ATM GxOI time series")

    except Exception as e:
        print(f"Options timeseries error for {symbol}: {e}")
        return _ft_api_error(f"Failed to get timeseries: {str(e)}", 500)


@fastapi_app.get("/api/options-visualizer/surface/{symbol}")
async def ft_get_options_surface(
    symbol: str,
    expiry: str = Query(None),
    surface_type: str = Query("iv"),
    include_history: bool = Query(False),
):
    """Get surface data for 3D visualization."""
    try:
        normalized = symbol.upper()
        if normalized not in {"NIFTY", "BANKNIFTY"}:
            return _ft_api_error("Only NIFTY and BANKNIFTY supported", 400)

        if _ft_get_cached_surface_data is None or _ft_fetch_nse_index_option_chain is None:
            return _ft_api_error("option_chain_visualizer module unavailable", 503)

        cached = await _ft_get_cached_surface_data(normalized)
        if cached and not include_history:
            return _ft_api_response(cached, f"Cached {surface_type} surface")

        chain = await asyncio.to_thread(_ft_fetch_nse_index_option_chain, normalized, expiry)
        spot = chain.get("underlying", 0)

        if not spot:
            return _ft_api_error("Unable to get spot price", 503)

        iv_surface = _ft_build_iv_surface(chain, spot)
        exposure = _ft_compute_exposures(chain, spot)

        iv_strikes = iv_surface.get("strikes", [])

        exposure_map = {e["strike"]: e for e in exposure["by_strike"]}

        gxoi_values = []
        gex_values = []
        for strike in iv_strikes:
            exp = exposure_map.get(strike)
            if exp:
                gxoi_values.append(exp["net_gxoi"])
                gex_values.append(exp["net_gex"])
            else:
                gxoi_values.append(0.0)
                gex_values.append(0.0)

        surface_data = {
            "strikes": iv_strikes,
            "iv_values": iv_surface.get("iv_values", []),
            "moneyness": iv_surface.get("moneyness", []),
            "gxoi_values": gxoi_values,
            "gex_values": gex_values,
            "spot": spot,
            "expiry": chain.get("expiry"),
            "timestamp": datetime.now(_FT_IST).isoformat(),
        }

        await _ft_cache_surface_data(normalized, surface_data)

        now = datetime.now(_FT_IST)
        try:
            asyncio.ensure_future(_ft_append_surface_snapshot(normalized, now, surface_data))
        except Exception as e:
            logging.warning(f"Failed to append surface snapshot: {e}")

        if include_history:
            history = await _ft_get_surface_history(normalized)
            surface_data["history"] = history

        return _ft_api_response(surface_data, f"{surface_type.upper()} surface data")

    except Exception as e:
        print(f"Options surface error for {symbol}: {e}")
        return _ft_api_error(f"Failed to get surface: {str(e)}", 500)


# =============================================================================
# FinTerminal: Equity Screener Endpoints
# =============================================================================

@fastapi_app.post("/api/equity-screener")
async def ft_equity_screener(payload: ScreenerRequest):
    """Run the advanced equity screener with a custom boolean expression."""
    try:
        symbols = None
        if payload.symbols:
            symbols = [
                s.replace(".NS", "").replace(".BO", "").upper()
                for s in payload.symbols
            ]

        if _ft_asyncpg_pool and _ft_run_screener_async is not None:
            result = await _ft_run_screener_async(
                _ft_asyncpg_pool,
                payload.expression,
                symbols=symbols,
                period=payload.period or "6mo",
            )
        elif _ft_run_screener is not None:
            result = await asyncio.to_thread(
                _ft_run_screener,
                payload.expression,
                symbols=payload.symbols or None,
                period=payload.period or "6mo",
            )
        else:
            raise HTTPException(status_code=503, detail={"success": False, "message": "advanced_screener module unavailable"})
        return _ft_api_response(result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"success": False, "message": str(exc)})
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail={"success": False, "message": str(exc)})
    except HTTPException:
        raise
    except Exception as exc:
        import traceback
        print(f"Equity screener error: {exc}")
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail={"success": False, "message": "Equity screener unavailable"},
        )


@fastapi_app.post("/api/equity-screener/async")
async def ft_submit_async_screener(payload: AsyncScreenerRequest):
    """Submit an equity screener job to run in the background."""
    if not _FT_CELERY_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail={"success": False, "message": "Background job processing not available. Use /api/equity-screener for sync execution."}
        )

    try:
        symbols = None
        if payload.symbols:
            symbols = [
                s.replace(".NS", "").replace(".BO", "").upper()
                for s in payload.symbols
            ]

        task = _ft_celery_run_screener.delay(
            payload.expression,
            symbols=symbols,
            period=payload.period or "6mo",
        )

        return _ft_api_response({
            "job_id": task.id,
            "status": "submitted",
            "expression": payload.expression,
            "submitted_at": datetime.utcnow().isoformat() + "Z",
        }, "Screener job submitted successfully")

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={"success": False, "message": f"Failed to submit job: {str(exc)}"}
        )


# =============================================================================
# FinTerminal: Portfolio Optimizer Endpoint
# =============================================================================

@fastapi_app.post("/api/portfolio/optimize")
async def ft_submit_portfolio_optimization(payload: PortfolioOptimizeRequest):
    """Run portfolio optimization (synchronous fallback when Celery unavailable)."""
    try:
        if not payload.holdings:
            raise HTTPException(
                status_code=400,
                detail={"success": False, "message": "At least one holding is required"}
            )

        cleaned_holdings = []
        for h in payload.holdings:
            symbol = h.get("symbol", "").replace(".NS", "").replace(".BO", "").upper()
            quantity = int(h.get("quantity", 0))
            if symbol and quantity > 0:
                cleaned_holdings.append({"symbol": symbol, "quantity": quantity})

        if len(cleaned_holdings) < 2:
            raise HTTPException(
                status_code=400,
                detail={"success": False, "message": "At least 2 holdings with valid quantities required for optimization"}
            )

        if _FT_CELERY_AVAILABLE:
            # Async via Celery
            task = _ft_celery_optimize_portfolio.delay(
                holdings=cleaned_holdings,
                risk_free_rate=payload.risk_free_rate,
                max_weight=payload.max_weight,
                rebalance_frequency=payload.rebalance_frequency,
                lookback_period=payload.lookback_period,
            )
            return _ft_api_response({
                "job_id": task.id,
                "status": "submitted",
                "holdings_count": len(cleaned_holdings),
                "submitted_at": datetime.utcnow().isoformat() + "Z",
            }, "Portfolio optimization job submitted successfully")
        else:
            # Synchronous fallback — run directly
            from portfolio_optimizer import run_full_optimization
            job_id = str(uuid.uuid4())
            result = await run_full_optimization(None, cleaned_holdings)
            return _ft_api_response({
                "job_id": job_id,
                "status": "completed",
                "result": result,
                "holdings_count": len(cleaned_holdings),
                "computed_at": datetime.utcnow().isoformat() + "Z",
            }, "Portfolio optimization completed")

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(f"Portfolio optimization failed: {exc}")
        raise HTTPException(
            status_code=500,
            detail={"success": False, "message": f"Optimization failed: {str(exc)}"}
        )


# =============================================================================
# FinTerminal: Jobs API
# =============================================================================

@fastapi_app.get("/api/jobs/{job_id}")
async def ft_get_job_status(job_id: str):
    """Get the status and result of a background job."""
    if not _FT_CELERY_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail={"success": False, "message": "Background job processing not available"}
        )

    try:
        from celery.result import AsyncResult

        result = AsyncResult(job_id, app=_ft_celery_app)

        status_map = {
            "PENDING": "pending",
            "STARTED": "running",
            "SUCCESS": "completed",
            "FAILURE": "failed",
            "RETRY": "retrying",
            "REVOKED": "cancelled",
        }

        response = {
            "job_id": job_id,
            "status": status_map.get(result.status, result.status.lower()),
            "ready": result.ready(),
        }

        if result.ready():
            if result.successful():
                response["result"] = result.result
            else:
                response["error"] = str(result.result)

        return _ft_api_response(response)

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={"success": False, "message": f"Failed to get job status: {str(exc)}"}
        )


@fastapi_app.delete("/api/jobs/{job_id}")
async def ft_cancel_job(job_id: str):
    """Cancel a running or pending background job."""
    if not _FT_CELERY_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail={"success": False, "message": "Background job processing not available"}
        )

    try:
        from celery.result import AsyncResult

        result = AsyncResult(job_id, app=_ft_celery_app)
        result.revoke(terminate=True)

        return _ft_api_response({
            "job_id": job_id,
            "status": "cancelled",
            "cancelled_at": datetime.utcnow().isoformat() + "Z",
        }, "Job cancelled successfully")

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={"success": False, "message": f"Failed to cancel job: {str(exc)}"}
        )


# =============================================================================
# FinTerminal: SSE Streaming Endpoints
# =============================================================================

@fastapi_app.get("/api/stream/prices")
async def ft_stream_prices(symbols: Optional[str] = None):
    """Stream real-time price updates via Server-Sent Events."""
    if _ft_realtime_stream is None:
        raise HTTPException(status_code=503, detail="realtime_stream module unavailable")

    symbol_list = None
    if symbols:
        symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]

    return StreamingResponse(
        _ft_realtime_stream.stream_prices(symbol_list),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@fastapi_app.get("/api/stream/movers")
async def ft_stream_movers():
    """Stream real-time market movers (top gainers/losers) via SSE."""
    if _ft_realtime_stream is None:
        raise HTTPException(status_code=503, detail="realtime_stream module unavailable")

    return StreamingResponse(
        _ft_realtime_stream.stream_movers(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@fastapi_app.get("/api/stream/indices")
async def ft_stream_indices():
    """Stream real-time index price updates via SSE."""
    if _ft_realtime_stream is None:
        raise HTTPException(status_code=503, detail="realtime_stream module unavailable")

    return StreamingResponse(
        _ft_realtime_stream.stream_indices(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@fastapi_app.get("/api/stream/all")
async def ft_stream_all_market_data():
    """Stream all real-time market data via SSE."""
    if _ft_realtime_stream is None:
        raise HTTPException(status_code=503, detail="realtime_stream module unavailable")

    return StreamingResponse(
        _ft_realtime_stream.stream_all(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# =============================================================================
# FinTerminal: WebSocket Depth Endpoint
# =============================================================================

@fastapi_app.websocket("/ws/depth/{symbol}")
async def ft_websocket_depth(websocket: WebSocket, symbol: str):
    """WebSocket endpoint for real-time 50-level order book depth."""
    import sys as _sys
    print(f"[DepthWS] >>> HANDLER ENTRY for {symbol}", flush=True)
    _sys.stdout.flush()

    if _ft_pack_error_message is None or _ft_pack_heartbeat_message is None:
        await websocket.accept()
        await websocket.close(code=1013)
        return

    await websocket.accept()
    print(f"[DepthWS] >>> ACCEPTED connection for {symbol}", flush=True)

    success, message = await _ft_depth_ws_manager.connect(websocket, symbol)

    if not success:
        if message == "limit_exceeded":
            await websocket.send_bytes(_ft_pack_error_message("Connection limit exceeded"))
        elif message == "unavailable":
            await websocket.send_bytes(_ft_pack_unavailable_message(symbol))
        elif message == "invalid_symbol":
            await websocket.send_bytes(_ft_pack_error_message(f"Invalid symbol format: {symbol}"))
        elif message == "timeout":
            print(f"[DepthWS] Subscription timeout for {symbol}, proceeding with cached data", flush=True)
            success = True
        else:
            await websocket.send_bytes(_ft_pack_error_message(f"Subscription failed: {message}"))

        if not success:
            await websocket.close(code=1013)
            return

    if message in ("subscribed", "already_subscribed"):
        await websocket.send_bytes(_ft_pack_subscribed_message(symbol))

    redis_client_ws = None
    pubsub = None

    try:
        if _aioredis is None:
            await websocket.send_bytes(_ft_pack_error_message("Redis unavailable - depth data service not running"))
            await websocket.close(code=1013)
            return

        redis_client_ws = _aioredis.from_url(
            _FT_DEPTH_REDIS_URL,
            encoding="utf-8",
            decode_responses=False
        )

        try:
            await redis_client_ws.ping()
        except Exception as redis_err:
            print(f"[DepthWS] Redis connection failed for {symbol}: {type(redis_err).__name__}: {redis_err}")
            try:
                await websocket.send_bytes(_ft_pack_error_message("Redis unavailable - depth data service not running"))
                await websocket.close(code=1013)
            except Exception as send_err:
                print(f"[DepthWS] Failed to send error: {send_err}")
            return

        pubsub_channel = f"{_FT_DEPTH_CHANNEL_PREFIX}:{symbol}"
        cache_key = f"cache:{_FT_DEPTH_CHANNEL_PREFIX}:{symbol}"

        if _ft_get_trading_date is not None:
            trading_date = _ft_get_trading_date()
        else:
            trading_date = datetime.now(_FT_IST).strftime("%Y-%m-%d")

        stream_key = f"{_FT_DEPTH_CHANNEL_PREFIX}:history:{symbol}:{trading_date}"

        await websocket.send_bytes(_ft_pack_heartbeat_message())
        logging.info(f"[DepthWS] Client connected for {symbol}")

        cached_snapshot = await redis_client_ws.get(cache_key)
        if cached_snapshot and _ft_unpack_depth_data is not None and _ft_pack_update_message is not None:
            await websocket.send_bytes(_ft_pack_update_message(
                _ft_unpack_depth_data(cached_snapshot)
            ))

        agg_stream_key = f"{_FT_DEPTH_CHANNEL_PREFIX}:history:agg:{symbol}:{trading_date}"
        raw_stream_key = stream_key

        try:
            history_entries = await redis_client_ws.xrange(agg_stream_key, "-", "+", count=2000)
            if not history_entries:
                logging.info(f"[DepthWS] Aggregated stream empty, falling back to raw for {symbol}")
                history_entries = await redis_client_ws.xrange(raw_stream_key, "-", "+", count=50000)

            if history_entries and _ft_unpack_depth_data is not None and _ft_pack_history_message is not None:
                history_data = [
                    _ft_unpack_depth_data(entry[1][b"data"])
                    for entry in history_entries
                ]
                await websocket.send_bytes(_ft_pack_history_message(symbol, history_data))
        except Exception as e:
            logging.debug(f"Could not fetch history for {symbol}: {e}")

        pubsub = redis_client_ws.pubsub()
        await pubsub.subscribe(pubsub_channel)

        last_heartbeat = asyncio.get_event_loop().time()

        while True:
            try:
                message = await asyncio.wait_for(
                    pubsub.get_message(ignore_subscribe_messages=True),
                    timeout=1.0
                )

                if message and message["type"] == "message" and _ft_unpack_depth_data is not None and _ft_pack_update_message is not None:
                    depth_data = _ft_unpack_depth_data(message["data"])
                    await websocket.send_bytes(_ft_pack_update_message(depth_data))

                current_time = asyncio.get_event_loop().time()
                if current_time - last_heartbeat >= _FT_DEPTH_WS_HEARTBEAT_INTERVAL:
                    await websocket.send_bytes(_ft_pack_heartbeat_message())
                    last_heartbeat = current_time

            except asyncio.TimeoutError:
                current_time = asyncio.get_event_loop().time()
                if current_time - last_heartbeat >= _FT_DEPTH_WS_HEARTBEAT_INTERVAL:
                    await websocket.send_bytes(_ft_pack_heartbeat_message())
                    last_heartbeat = current_time
                continue

            except WebSocketDisconnect:
                break

    except WebSocketDisconnect:
        print(f"[DepthWS] >>> WebSocketDisconnect for {symbol}", flush=True)
        logging.info(f"[DepthWS] Client disconnected from {symbol}")
    except ConnectionRefusedError:
        print(f"[DepthWS] >>> ConnectionRefusedError for {symbol}", flush=True)
        logging.error(f"[DepthWS] Redis connection refused for {symbol}")
        try:
            await websocket.send_bytes(_ft_pack_error_message("Redis unavailable - depth data service not running"))
        except Exception:
            pass
    except Exception as e:
        print(f"[DepthWS] >>> EXCEPTION for {symbol}: {type(e).__name__}: {e}", flush=True)
        logging.error(f"[DepthWS] Error for {symbol}: {type(e).__name__}: {e}")
        try:
            await websocket.send_bytes(_ft_pack_error_message(f"Server error: {type(e).__name__}"))
        except Exception:
            pass
    finally:
        print(f"[DepthWS] >>> FINALLY block for {symbol} - cleaning up", flush=True)
        await _ft_depth_ws_manager.disconnect(websocket, symbol)
        if pubsub:
            try:
                await pubsub.unsubscribe(f"{_FT_DEPTH_CHANNEL_PREFIX}:{symbol}")
                await pubsub.close()
            except Exception:
                pass
        if redis_client_ws:
            try:
                await redis_client_ws.close()
            except Exception:
                pass


# =============================================================================
# FinTerminal: Quotes Batch Endpoint
# =============================================================================

@fastapi_app.get("/api/quotes")
async def ft_get_batch_quotes(symbols: str = Query(..., min_length=1)):
    """Get quotes for multiple symbols at once.

    Query params:
    - symbols: comma-separated list of symbols (e.g., "RELIANCE,TCS,INFY")
    """
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not symbol_list:
        return _ft_api_response({}, "No symbols provided")

    symbol_list = symbol_list[:50]

    if _ft_redis_cache is None:
        return _ft_api_response({}, "redis_cache module unavailable")

    cached_quotes = await _ft_redis_cache.get_batch_quotes(symbol_list)

    uncached_symbols = [sym for sym in symbol_list if cached_quotes.get(sym) is None]

    if uncached_symbols and _ft_asyncpg_pool:
        try:
            async with _ft_asyncpg_pool.acquire() as conn:
                ticker_rows = await conn.fetch("""
                    SELECT id, symbol, name, suffix
                    FROM tickers
                    WHERE UPPER(symbol) = ANY($1)
                """, uncached_symbols)

                ticker_map = {row["symbol"].upper(): row for row in ticker_rows}

                for sym in uncached_symbols:
                    ticker_info = ticker_map.get(sym)
                    if not ticker_info:
                        continue

                    ticker_id = ticker_info["id"]
                    is_index = ticker_info["suffix"] == "-INDEX"

                    ltp_row = await conn.fetchrow("""
                        SELECT ltp, open, high, low, close, percent_change, trade_volume
                        FROM ltp_live
                        WHERE ticker_id = $1
                        ORDER BY timestamp DESC
                        LIMIT 1
                    """, ticker_id)

                    fund_row = await conn.fetchrow("""
                        SELECT long_name, market_cap, previous_close
                        FROM stock_fundamentals
                        WHERE ticker_id = $1
                    """, ticker_id)

                    if ltp_row:
                        price = float(ltp_row["ltp"]) if ltp_row["ltp"] else 0
                        open_price = float(ltp_row["open"]) if ltp_row["open"] else 0
                        close_price = float(ltp_row["close"]) if ltp_row["close"] else 0
                        percent_change = float(ltp_row["percent_change"]) if ltp_row["percent_change"] else 0
                        ref_price = close_price if close_price > 0 else (float(fund_row["previous_close"]) if fund_row and fund_row["previous_close"] else 0)
                        change = price - ref_price if ref_price > 0 else 0
                        change_pct = percent_change

                        quote_data = {
                            "symbol": ticker_info["symbol"],
                            "name": (fund_row["long_name"] if fund_row else None) or ticker_info["name"] or ticker_info["symbol"],
                            "price": price,
                            "change": change,
                            "changePercent": change_pct,
                            "open": open_price,
                            "high": float(ltp_row["high"]) if ltp_row["high"] else 0,
                            "low": float(ltp_row["low"]) if ltp_row["low"] else 0,
                            "volume": int(ltp_row["trade_volume"]) if ltp_row["trade_volume"] else 0,
                            "marketCap": int(fund_row["market_cap"]) if fund_row and fund_row["market_cap"] else 0,
                            "previousClose": ref_price,
                            "isIndex": is_index,
                        }
                        cached_quotes[sym] = quote_data

        except Exception as e:
            print(f"Batch quotes DB error: {e}")

    quotes_to_cache = {sym: data for sym, data in cached_quotes.items() if data is not None}
    if quotes_to_cache:
        await _ft_redis_cache.cache_batch_quotes(quotes_to_cache)

    return _ft_api_response(cached_quotes)


# =============================================================================
# FinTerminal: Chart Endpoints
# =============================================================================

@fastapi_app.get("/api/chart/intraday/{symbol}")
async def ft_get_intraday_chart(symbol: str, interval: str = Query("1m")):
    """Get intraday chart data from PostgreSQL (ohlc_1min_intraday table)."""
    if _ft_redis_cache is None:
        return _ft_api_response([], "redis_cache module unavailable")

    cached_data = await _ft_redis_cache.get_cached_chart(symbol, interval, "intraday")
    if cached_data:
        return _ft_api_response(cached_data)

    data = []

    if _ft_asyncpg_pool:
        try:
            async with _ft_asyncpg_pool.acquire() as conn:
                ticker = await conn.fetchrow(
                    "SELECT id FROM tickers WHERE UPPER(symbol) = $1",
                    symbol.upper()
                )

                if ticker:
                    today_ist = datetime.now(_FT_IST).date()

                    rows = await conn.fetch("""
                        SELECT ts as time, open, high, low, close, volume
                        FROM ohlc_1min_intraday
                        WHERE ticker_id = $1
                          AND DATE(ts AT TIME ZONE 'Asia/Kolkata') = $2
                        ORDER BY ts ASC
                    """, ticker["id"], today_ist)

                    if not rows:
                        latest_date = await conn.fetchval("""
                            SELECT DATE(ts AT TIME ZONE 'Asia/Kolkata')
                            FROM ohlc_1min_intraday
                            WHERE ticker_id = $1
                            ORDER BY ts DESC
                            LIMIT 1
                        """, ticker["id"])

                        if latest_date:
                            rows = await conn.fetch("""
                                SELECT ts as time, open, high, low, close, volume
                                FROM ohlc_1min_intraday
                                WHERE ticker_id = $1
                                  AND DATE(ts AT TIME ZONE 'Asia/Kolkata') = $2
                                ORDER BY ts ASC
                            """, ticker["id"], latest_date)

                    data = [
                        {
                            "timestamp": (row["time"].replace(tzinfo=_FT_IST) if row["time"].tzinfo is None else row["time"].astimezone(_FT_IST)).isoformat(),
                            "date": row["time"].strftime("%Y-%m-%d"),
                            "open": float(row["open"]),
                            "high": float(row["high"]),
                            "low": float(row["low"]),
                            "close": float(row["close"]),
                            "volume": int(row["volume"]) if row["volume"] else 0,
                        }
                        for row in rows
                    ]
        except Exception as e:
            print(f"Intraday chart DB error for {symbol}: {e}")

    if data:
        await _ft_redis_cache.cache_chart(symbol, "1m", "intraday", data)
        return _ft_api_response(data)

    if _FT_USE_YFINANCE_FALLBACK:
        try:
            result = await asyncio.to_thread(
                _ft_fetch_symbol_history,
                symbol,
                "1d",
                "1m",
                True,
            )
            if result["data"]:
                await _ft_redis_cache.cache_chart(symbol, "1m", "intraday", result["data"])
                return _ft_api_response(result["data"])
        except Exception as e:
            print(f"Intraday yfinance fallback error: {e}")

    return _ft_api_response([], "No intraday data available")


@fastapi_app.get("/api/chart/daily/{symbol}")
async def ft_get_daily_chart(symbol: str, period: str = Query("1y"), timeframe: str = Query("1D")):
    """Get daily/weekly/monthly chart data from PostgreSQL."""
    if _ft_redis_cache is None:
        return _ft_api_response([], "redis_cache module unavailable")

    cached_data = await _ft_redis_cache.get_cached_chart(symbol, timeframe, period)
    if cached_data:
        return _ft_api_response(cached_data)

    data = []

    timeframe_map = {
        "1d": ("ohlc_daily", "day"),
        "1w": ("ohlc_weekly", "week"),
        "1m": ("ohlc_monthly", "month"),
    }
    table_name, time_col = timeframe_map.get(timeframe.lower(), ("ohlc_daily", "day"))

    period_map = {
        "1mo": "1 month",
        "3mo": "3 months",
        "6mo": "6 months",
        "1y": "1 year",
        "2y": "2 years",
        "5y": "5 years",
        "max": "100 years",
    }
    sql_interval = period_map.get(period.lower(), "1 year")

    if _ft_asyncpg_pool:
        try:
            async with _ft_asyncpg_pool.acquire() as conn:
                ticker = await conn.fetchrow(
                    "SELECT id FROM tickers WHERE UPPER(symbol) = $1",
                    symbol.upper()
                )

                if ticker:
                    query = f"""
                        SELECT {time_col} as time, open, high, low, close, volume
                        FROM {table_name}
                        WHERE ticker_id = $1
                          AND {time_col} >= CURRENT_DATE - INTERVAL '{sql_interval}'
                        ORDER BY {time_col} ASC
                    """
                    rows = await conn.fetch(query, ticker["id"])

                    data = [
                        {
                            "timestamp": row["time"].strftime("%Y-%m-%d"),
                            "date": row["time"].strftime("%Y-%m-%d"),
                            "open": float(row["open"]),
                            "high": float(row["high"]),
                            "low": float(row["low"]),
                            "close": float(row["close"]),
                            "volume": int(row["volume"]) if row["volume"] else 0,
                        }
                        for row in rows
                    ]
        except Exception as e:
            print(f"Daily chart DB error for {symbol}: {e}")

    if data:
        await _ft_redis_cache.cache_chart(symbol, timeframe, period, data)
        return _ft_api_response(data)

    if _FT_USE_YFINANCE_FALLBACK:
        try:
            yf_period = period.lower() if period.lower() in ["1mo", "3mo", "6mo", "1y", "2y", "5y", "max"] else "1y"
            result = await asyncio.to_thread(
                _ft_fetch_symbol_history,
                symbol,
                yf_period,
                "1d",
                False,
            )
            if result["data"]:
                await _ft_redis_cache.cache_chart(symbol, timeframe, period, result["data"])
                return _ft_api_response(result["data"])
        except Exception as e:
            print(f"Daily yfinance fallback error: {e}")

    return _ft_api_response([], f"No {timeframe} data available")


@fastapi_app.get("/api/charts/batch")
async def ft_get_charts_batch(
    symbols: str = Query(..., description="Comma-separated symbols"),
    period: str = Query("1y"),
    timeframe: str = Query("1D")
):
    """Get chart data for multiple symbols in a single optimized query."""
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]

    if not symbol_list:
        return _ft_api_response({}, "No symbols provided")

    if len(symbol_list) > 20:
        return _ft_api_response({}, "Maximum 20 symbols per batch request")

    if _ft_redis_cache is None:
        return _ft_api_response({}, "redis_cache module unavailable")

    results = {}
    uncached_symbols = []

    cached_charts = await _ft_redis_cache.get_cached_charts_batch(symbol_list, timeframe, period)

    for sym in symbol_list:
        if sym in cached_charts and cached_charts[sym]:
            results[sym] = cached_charts[sym]
        else:
            uncached_symbols.append(sym)

    if uncached_symbols and _ft_asyncpg_pool:
        timeframe_map = {
            "1d": ("ohlc_daily", "day"),
            "1w": ("ohlc_weekly", "week"),
            "1m": ("ohlc_monthly", "month"),
        }
        table_name, time_col = timeframe_map.get(timeframe.lower(), ("ohlc_daily", "day"))

        period_map = {
            "1mo": "1 month",
            "3mo": "3 months",
            "6mo": "6 months",
            "1y": "1 year",
            "2y": "2 years",
            "5y": "5 years",
            "max": "100 years",
        }
        sql_interval = period_map.get(period.lower(), "1 year")

        try:
            async with _ft_asyncpg_pool.acquire() as conn:
                ticker_rows = await conn.fetch(
                    "SELECT id, symbol FROM tickers WHERE UPPER(symbol) = ANY($1::text[])",
                    uncached_symbols
                )
                ticker_map = {row["symbol"].upper(): row["id"] for row in ticker_rows}
                ticker_ids = list(ticker_map.values())

                if ticker_ids:
                    query = f"""
                        SELECT t.symbol, ca.{time_col} as time,
                               ca.open, ca.high, ca.low, ca.close, ca.volume
                        FROM {table_name} ca
                        JOIN tickers t ON t.id = ca.ticker_id
                        WHERE ca.ticker_id = ANY($1::int[])
                          AND ca.{time_col} >= CURRENT_DATE - INTERVAL '{sql_interval}'
                        ORDER BY t.symbol, ca.{time_col} ASC
                    """
                    rows = await conn.fetch(query, ticker_ids)

                    symbol_data = _defaultdict(list)

                    for row in rows:
                        symbol_data[row["symbol"].upper()].append({
                            "timestamp": row["time"].strftime("%Y-%m-%d"),
                            "date": row["time"].strftime("%Y-%m-%d"),
                            "open": float(row["open"]),
                            "high": float(row["high"]),
                            "low": float(row["low"]),
                            "close": float(row["close"]),
                            "volume": int(row["volume"]) if row["volume"] else 0,
                        })

                    for sym, chart_data in symbol_data.items():
                        results[sym] = chart_data
                        asyncio.create_task(_ft_redis_cache.cache_chart(sym, timeframe, period, chart_data))

                    for sym in uncached_symbols:
                        if sym not in results:
                            results[sym] = []

        except Exception as e:
            print(f"[Batch Chart] DB error: {e}")
            for sym in uncached_symbols:
                if sym not in results:
                    results[sym] = []

    return _ft_api_response(results)


@fastapi_app.get("/api/chart/compare")
async def ft_compare_chart(
    symbols: str = Query(..., min_length=1),
    range: str = Query("1M"),
):
    """Get historical chart data for multiple symbols comparison."""
    symbol_list = [sym.strip().upper() for sym in symbols.split(",") if sym.strip()]
    if not symbol_list:
        return _ft_api_response([], "No symbols provided")

    max_symbols = 5
    if len(symbol_list) > max_symbols:
        symbol_list = symbol_list[:max_symbols]

    if _ft_redis_cache is None:
        return _ft_api_response([], "redis_cache module unavailable")

    range_map = {
        "5D": "5 days",
        "1M": "1 month",
        "3M": "3 months",
        "6M": "6 months",
        "1Y": "1 year",
        "3Y": "3 years",
        "5Y": "5 years",
    }
    sql_interval = range_map.get(range.upper(), "1 month")

    period_map = {
        "5D": "5d",
        "1M": "1mo",
        "3M": "3mo",
        "6M": "6mo",
        "1Y": "1y",
        "3Y": "3y",
        "5Y": "5y",
    }
    cache_period = period_map.get(range.upper(), "1mo")

    results = []
    db_symbols_found = set()
    uncached_symbols = list(symbol_list)

    try:
        cached_charts = await _ft_redis_cache.get_cached_charts_batch(symbol_list, "1d", cache_period)
    except Exception as e:
        print(f"[Chart Compare] cache read failed, continuing: {e}")
        cached_charts = {}
    for sym in symbol_list:
        if sym in cached_charts and cached_charts[sym]:
            results.append({"symbol": sym, "data": cached_charts[sym]})
            db_symbols_found.add(sym)
            uncached_symbols.remove(sym)

    if uncached_symbols and _ft_asyncpg_pool:
        try:
            async with _ft_asyncpg_pool.acquire() as conn:
                ticker_rows = await conn.fetch(
                    "SELECT id, symbol FROM tickers WHERE UPPER(symbol) = ANY($1::text[])",
                    uncached_symbols
                )
                ticker_map = {row["symbol"].upper(): row["id"] for row in ticker_rows}
                ticker_ids = list(ticker_map.values())

                if ticker_ids:
                    query = f"""
                        SELECT t.symbol, ca.day as time, ca.open, ca.high, ca.low, ca.close, ca.volume
                        FROM ohlc_daily ca
                        JOIN tickers t ON t.id = ca.ticker_id
                        WHERE ca.ticker_id = ANY($1::int[])
                          AND ca.day >= CURRENT_DATE - INTERVAL '{sql_interval}'
                        ORDER BY t.symbol, ca.day ASC
                    """
                    rows = await conn.fetch(query, ticker_ids)

                    symbol_data = _defaultdict(list)

                    for row in rows:
                        symbol_data[row["symbol"].upper()].append({
                            "timestamp": row["time"].strftime("%Y-%m-%d"),
                            "date": row["time"].strftime("%Y-%m-%d"),
                            "open": float(row["open"]),
                            "high": float(row["high"]),
                            "low": float(row["low"]),
                            "close": float(row["close"]),
                            "volume": int(row["volume"]) if row["volume"] else 0,
                        })

                    for sym in uncached_symbols:
                        if sym in symbol_data and symbol_data[sym]:
                            results.append({"symbol": sym, "data": symbol_data[sym]})
                            db_symbols_found.add(sym)
                            asyncio.create_task(
                                _ft_redis_cache.cache_chart(sym, "1d", cache_period, symbol_data[sym])
                            )

        except Exception as e:
            print(f"[Chart Compare] DB error: {e}")

    missing_symbols = [sym for sym in symbol_list if sym not in db_symbols_found]

    if missing_symbols and _FT_USE_YFINANCE_FALLBACK:
        try:
            period_yf, interval_yf = _ft_get_range_params(range)
            tasks = [
                asyncio.to_thread(_ft_fetch_symbol_history, sym, period_yf, interval_yf)
                for sym in missing_symbols
            ]
            # return_exceptions=True so a single yfinance failure (rate-limit,
            # bad symbol, network blip) doesn't kill the entire request.
            fallback_results = await asyncio.gather(*tasks, return_exceptions=True)

            for idx, result in enumerate(fallback_results):
                if isinstance(result, BaseException):
                    print(f"[Chart Compare] yfinance fallback failed for {missing_symbols[idx]}: {result}")
                    continue
                if result.get("data"):
                    results.append(result)
        except Exception as e:
            print(f"[Chart Compare] yfinance fallback batch failed: {e}")

    found_symbols = {r["symbol"] for r in results}
    for sym in symbol_list:
        if sym not in found_symbols:
            results.append({"symbol": sym, "data": []})

    if not any(r["data"] for r in results):
        return _ft_api_response([], "No historical data available for requested symbols")

    return _ft_api_response(results)


# =============================================================================
# FinTerminal: Stock Comparator Metrics
# =============================================================================

@fastapi_app.get("/api/compare/metrics")
async def ft_compare_metrics(
    symbols: str = Query(..., min_length=1),
    benchmark: str = Query("NIFTY 50"),
):
    """
    Per-symbol metrics for the Stock Comparator page.

    For each symbol returns: live price + change, market cap, P/E (TTM),
    P/B, ROE, debt/equity, dividend yield, avg daily volume,
    fifty-two-week high/low, computed 1Y / 3Y / YTD returns, computed 30-day
    realized volatility, and computed beta vs benchmark (default NIFTY 50).

    Computed fields are derived from `ohlc_daily`. Stored fields come from
    `stock_fundamentals` and `ltp_live`. Beta is the OLS slope of daily-return
    regression of stock vs benchmark over the same 1-year window used for the
    1Y return.
    """
    raw_symbols = [s.strip().upper().replace('.NS', '') for s in symbols.split(',') if s.strip()]
    if not raw_symbols:
        return list_response([])
    # Limit to a sane upper bound
    symbol_list = raw_symbols[:6]
    benchmark_sym = benchmark.strip().upper().replace('.NS', '')

    def _fetch():
        conn = None
        try:
            conn = get_db_connection()

            # 1) Resolve ticker IDs for all requested symbols + benchmark
            with conn.cursor() as cur:
                lookup_syms = list(set(symbol_list + [benchmark_sym]))
                cur.execute(
                    "SELECT id, symbol FROM tickers WHERE UPPER(symbol) = ANY(%s) AND is_active = true",
                    [lookup_syms],
                )
                ticker_rows = cur.fetchall()
            ticker_id_by_sym = {row[1].upper(): row[0] for row in ticker_rows}
            if not ticker_id_by_sym:
                return []

            requested_ids = [ticker_id_by_sym[s] for s in symbol_list if s in ticker_id_by_sym]
            benchmark_id = ticker_id_by_sym.get(benchmark_sym)

            # 2) Fundamentals for requested symbols
            fundamentals_by_id: dict = {}
            if requested_ids:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT ticker_id, long_name, sector, industry, market_cap, "
                        "trailing_pe, price_to_book, return_on_equity, debt_to_equity, "
                        "dividend_yield, avg_volume, fifty_two_week_high, fifty_two_week_low "
                        "FROM stock_fundamentals WHERE ticker_id = ANY(%s)",
                        [requested_ids],
                    )
                    for row in cur.fetchall():
                        fundamentals_by_id[row[0]] = {
                            "long_name": row[1],
                            "sector": row[2],
                            "industry": row[3],
                            "market_cap": float(row[4]) if row[4] is not None else None,
                            "trailing_pe": float(row[5]) if row[5] is not None else None,
                            "price_to_book": float(row[6]) if row[6] is not None else None,
                            "return_on_equity": float(row[7]) if row[7] is not None else None,
                            "debt_to_equity": float(row[8]) if row[8] is not None else None,
                            "dividend_yield": float(row[9]) if row[9] is not None else None,
                            "avg_volume": float(row[10]) if row[10] is not None else None,
                            "fifty_two_week_high": float(row[11]) if row[11] is not None else None,
                            "fifty_two_week_low": float(row[12]) if row[12] is not None else None,
                        }

            # 3) LTP for requested symbols
            ltp_accessor = LTPDataAccessor(conn)
            ltps = ltp_accessor.get_latest_ltps(requested_ids)
            ltp_by_id = {row['ticker_id']: row for row in ltps if row}

            # 4) 5-year daily closes for requested symbols + benchmark (single batched query)
            history_ids = list(set(requested_ids + ([benchmark_id] if benchmark_id else [])))
            history_by_id: dict = {sid: [] for sid in history_ids}
            if history_ids:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT ticker_id, day, close "
                        "FROM ohlc_daily "
                        "WHERE ticker_id = ANY(%s) "
                        "  AND day >= CURRENT_DATE - INTERVAL '5 years' "
                        "ORDER BY ticker_id, day ASC",
                        [history_ids],
                    )
                    for row in cur.fetchall():
                        sid, day, close = row[0], row[1], row[2]
                        if close is not None:
                            history_by_id[sid].append((day, float(close)))

            # ── helpers ─────────────────────────────────────────────────
            def pct_return(series, days_back):
                if len(series) < 2:
                    return None
                last_day, last_close = series[-1]
                if last_close <= 0:
                    return None
                # Find the close closest to (last_day - days_back)
                target_day = last_day - timedelta(days=days_back)
                candidate = None
                for d, c in series:
                    if d <= target_day:
                        candidate = c
                    else:
                        break
                if candidate is None or candidate <= 0:
                    return None
                return (last_close / candidate - 1.0) * 100.0

            def cagr(series, days_back):
                pct = pct_return(series, days_back)
                if pct is None:
                    return None
                years = days_back / 365.0
                if years <= 0:
                    return None
                growth = 1.0 + pct / 100.0
                if growth <= 0:
                    return None
                return (growth ** (1.0 / years) - 1.0) * 100.0

            def ytd_return(series):
                if not series:
                    return None
                last_day, last_close = series[-1]
                jan_1 = last_day.replace(month=1, day=1)
                # First trading day on/after Jan 1
                anchor = None
                for d, c in series:
                    if d >= jan_1:
                        anchor = c
                        break
                if anchor is None or anchor <= 0:
                    return None
                return (last_close / anchor - 1.0) * 100.0

            def realized_vol_30d(series):
                # Annualized 30-day daily-return stddev
                if len(series) < 21:
                    return None
                tail = series[-30:]
                closes = [c for _, c in tail]
                returns = [closes[i] / closes[i - 1] - 1.0 for i in range(1, len(closes)) if closes[i - 1] > 0]
                if len(returns) < 5:
                    return None
                mean = sum(returns) / len(returns)
                var = sum((r - mean) ** 2 for r in returns) / max(1, len(returns) - 1)
                stddev = var ** 0.5
                # Annualize from daily → ~252 trading days
                return stddev * (252 ** 0.5) * 100.0

            def beta_vs(series, bench_series, days_back=365):
                # OLS slope of daily-return regression of stock vs benchmark
                # over the trailing `days_back` window.
                if not series or not bench_series:
                    return None
                last_day = min(series[-1][0], bench_series[-1][0])
                cutoff = last_day - timedelta(days=days_back)
                # Index by date
                bmap = {d: c for d, c in bench_series if d > cutoff}
                pairs = []
                prev_s = prev_b = None
                for d, c in series:
                    if d <= cutoff:
                        continue
                    if d not in bmap:
                        continue
                    if prev_s is not None and prev_b is not None and prev_s > 0 and prev_b > 0:
                        pairs.append((c / prev_s - 1.0, bmap[d] / prev_b - 1.0))
                    prev_s = c
                    prev_b = bmap[d]
                if len(pairs) < 30:
                    return None
                stock_returns = [p[0] for p in pairs]
                mkt_returns = [p[1] for p in pairs]
                mean_s = sum(stock_returns) / len(stock_returns)
                mean_m = sum(mkt_returns) / len(mkt_returns)
                cov = sum((stock_returns[i] - mean_s) * (mkt_returns[i] - mean_m) for i in range(len(pairs))) / len(pairs)
                var_m = sum((r - mean_m) ** 2 for r in mkt_returns) / len(pairs)
                if var_m <= 0:
                    return None
                return cov / var_m

            # ── assemble per-symbol metrics ─────────────────────────────
            bench_series = history_by_id.get(benchmark_id, []) if benchmark_id else []

            output = []
            for sym in symbol_list:
                tid = ticker_id_by_sym.get(sym)
                if tid is None:
                    output.append({"symbol": sym, "available": False})
                    continue
                series = history_by_id.get(tid, [])
                fund = fundamentals_by_id.get(tid, {})
                ltp = ltp_by_id.get(tid, {}) or {}

                last_price = ltp.get('ltp')
                change_pct = ltp.get('percent_change')
                # Fallback to last close in series if LTP missing
                if last_price is None and series:
                    last_price = series[-1][1]

                output.append({
                    "symbol": sym,
                    "available": True,
                    "long_name": fund.get("long_name"),
                    "sector": fund.get("sector"),
                    "last_price": float(last_price) if last_price is not None else None,
                    "change_percent": float(change_pct) if change_pct is not None else None,
                    "return_1y": pct_return(series, 365),
                    "cagr_3y": cagr(series, 365 * 3),
                    "return_ytd": ytd_return(series),
                    "fifty_two_week_high": fund.get("fifty_two_week_high"),
                    "fifty_two_week_low": fund.get("fifty_two_week_low"),
                    "market_cap": fund.get("market_cap"),
                    "trailing_pe": fund.get("trailing_pe"),
                    "price_to_book": fund.get("price_to_book"),
                    "return_on_equity": fund.get("return_on_equity"),
                    "debt_to_equity": fund.get("debt_to_equity"),
                    "dividend_yield": fund.get("dividend_yield"),
                    "beta_1y": beta_vs(series, bench_series, 365),
                    "volatility_30d": realized_vol_30d(series),
                    "avg_volume": fund.get("avg_volume"),
                })

            return output
        finally:
            if conn:
                release_db_connection(conn)

    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _fetch)
        return list_response(result, {"benchmark": benchmark_sym, "count": len(result)})
    except Exception as exc:
        logging.exception("Compare metrics API failed")
        raise HTTPException(status_code=500, detail=f"Failed to fetch compare metrics: {str(exc)}") from exc


# =============================================================================
# FinTerminal: RRG Endpoint
# =============================================================================

@fastapi_app.get("/api/rrg-image")
async def ft_get_rrg_image(
    symbols: str = Query(..., min_length=1),
    benchmark: str = Query("NIFTY 50", min_length=1),
    period: str = Query("2y"),
    length: int = Query(50, ge=5, le=200),
    trail: int = Query(30, ge=5, le=180),
    res: int = Query(80, ge=10, le=300),
    labels: bool = Query(True),
):
    """Generate Relative Rotation Graph (RRG) data for recharts visualization."""
    if _ft_redis_cache is None:
        return _ft_api_response({"legend": [], "ranges": {}, "trails": []}, "redis_cache module unavailable")

    symbol_list = [sym.strip().upper() for sym in symbols.split(",") if sym.strip()]
    if len(symbol_list) < 2:
        return _ft_api_response({"legend": [], "ranges": {}, "trails": []}, "Select at least two symbols.")

    if period.lower() not in ("1y", "2y", "5y"):
        period = "2y"

    max_symbols = 12
    symbol_list = symbol_list[:max_symbols]

    cached_rrg = await _ft_redis_cache.get_cached_rrg(symbol_list, benchmark, period)
    if cached_rrg:
        return _ft_api_response(cached_rrg, "RRG data from cache")

    if _ft_asyncpg_pool and _ft_generate_rrg_from_db is not None:
        try:
            print(f"[RRG] Generating from DB for symbols={symbol_list}, benchmark={benchmark}, period={period}")
            data = await _ft_generate_rrg_from_db(
                _ft_asyncpg_pool,
                symbol_list,
                benchmark,
                period,
                length,
                trail,
                res,
            )
            await _ft_redis_cache.cache_rrg(symbol_list, benchmark, period, data)
            return _ft_api_response(data, "RRG data generated from database")
        except Exception as exc:
            print(f"[RRG] DB error: {exc}")

    if _FT_USE_YFINANCE_FALLBACK and _ft_generate_rrg is not None:
        try:
            print(f"[RRG] Falling back to yfinance for symbols={symbol_list}")
            yf_benchmark = "^NSEI" if benchmark.upper() == "NIFTY 50" else benchmark
            data = await asyncio.to_thread(
                _ft_generate_rrg,
                symbol_list,
                yf_benchmark,
                length,
                trail,
                res,
                True,
                labels,
            )
            data.pop("image", None)
            await _ft_redis_cache.cache_rrg(symbol_list, benchmark, period, data)
            return _ft_api_response(data, "RRG data generated from yfinance")
        except Exception as exc:
            return _ft_api_error(f"RRG unavailable: {exc}", status_code=502)

    return _ft_api_error("RRG unavailable: database not connected and yfinance fallback disabled", status_code=503)


# =============================================================================
# FinTerminal: Market Data Extra Endpoints
# =============================================================================

@fastapi_app.get("/api/most-active")
async def ft_get_most_active():
    return _ft_api_response([], "Data unavailable")


@fastapi_app.get("/api/52week/{symbol}")
async def ft_get_52week(symbol: str):
    """Get 52-week high/low from PostgreSQL."""
    _ft_require_db_pool()
    try:
        async with _ft_asyncpg_pool.acquire() as conn:
            query = """
            SELECT
                t.symbol,
                sf.fifty_two_week_high,
                sf.fifty_two_week_low,
                sf.current_price
            FROM stock_fundamentals sf
            JOIN tickers t ON t.id = sf.ticker_id
            WHERE t.symbol = $1
            """

            row = await conn.fetchrow(query, symbol.upper())
            print(row)

            if not row:
                return _ft_api_response(None, "52-week data not available")

            data = {
                "symbol": row["symbol"],
                "fiftyTwoWeekHigh": float(row["fifty_two_week_high"]) if row["fifty_two_week_high"] else 0,
                "fiftyTwoWeekLow": float(row["fifty_two_week_low"]) if row["fifty_two_week_low"] else 0,
                "currentPrice": float(row["current_price"]) if row["current_price"] else 0
            }

            return _ft_api_response(data)

    except Exception as e:
        return _ft_api_response(None, f"Data unavailable: {str(e)}")


@fastapi_app.get("/api/corporate-actions/{symbol}")
async def ft_get_corporate_actions(symbol: str):
    try:
        formatted_symbol = _ft_format_symbol(symbol)
        ticker = yf.Ticker(formatted_symbol)

        dividends = ticker.dividends.tail(10)
        splits = ticker.splits

        actions = []

        for date, amount in dividends.items():
            actions.append({
                "date": date.strftime("%Y-%m-%d"),
                "type": "Dividend",
                "amount": float(amount)
            })

        for date, ratio in splits.items():
            actions.append({
                "date": date.strftime("%Y-%m-%d"),
                "type": "Split",
                "ratio": str(ratio)
            })

        return _ft_api_response(sorted(actions, key=lambda x: x["date"], reverse=True))
    except Exception as e:
        return _ft_api_response([], f"Data unavailable: {str(e)}")


@fastapi_app.get("/api/financial-statements/{symbol}")
async def ft_get_financial_statements(symbol: str):
    """Get financial statements from stock_fundamentals JSONB columns."""
    if not _ft_asyncpg_pool:
        return _ft_api_response(None, "Database unavailable")

    try:
        async with _ft_asyncpg_pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT
                    t.symbol,
                    t.name,
                    sf.income_statement,
                    sf.balance_sheet,
                    sf.cash_flow,
                    sf.quarterly_financials,
                    sf.dividends_history
                FROM stock_fundamentals sf
                JOIN tickers t ON t.id = sf.ticker_id
                WHERE t.symbol = $1
            """, symbol.upper())

            if not row:
                return _ft_api_response(None, f"Financial statements not found for {symbol}")

            import json as _json

            def _parse_jsonb(value):
                if value is None:
                    return None
                if isinstance(value, str):
                    try:
                        return _json.loads(value)
                    except _json.JSONDecodeError:
                        return None
                return value

            data = {
                "symbol": row["symbol"],
                "name": row["name"],
                "incomeStatement": _parse_jsonb(row["income_statement"]),
                "balanceSheet": _parse_jsonb(row["balance_sheet"]),
                "cashFlow": _parse_jsonb(row["cash_flow"]),
                "quarterlyFinancials": _parse_jsonb(row["quarterly_financials"]),
                "dividendsHistory": _parse_jsonb(row["dividends_history"]),
            }

            return _ft_api_response(data)

    except Exception as e:
        print(f"Financial statements error for {symbol}: {e}")
        return _ft_api_response(None, f"Financial statements unavailable: {str(e)}")


@fastapi_app.get("/api/analyst-recommendations/{symbol}")
async def ft_get_analyst_recommendations(symbol: str):
    """Get analyst recommendations from stock_analysis table."""
    if not _ft_asyncpg_pool:
        return _ft_api_response(None, "Database unavailable")

    try:
        async with _ft_asyncpg_pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT
                    t.symbol,
                    t.name,
                    sa.analyst_recommendation,
                    sa.valuation_metric,
                    sa.target_price,
                    sa.entry_point,
                    sa.entry_rating,
                    sa.growth_metric,
                    sa.profitability_metric,
                    sa.updated_at
                FROM stock_analysis sa
                JOIN tickers t ON t.id = sa.ticker_id
                WHERE t.symbol = $1
            """, symbol.upper())

            if not row:
                return _ft_api_response(None, f"Analyst recommendations not found for {symbol}")

            data = {
                "symbol": row["symbol"],
                "name": row["name"],
                "analystRecommendation": row["analyst_recommendation"],
                "valuationMetric": row["valuation_metric"],
                "targetPrice": float(row["target_price"]) if row["target_price"] else None,
                "entryPoint": float(row["entry_point"]) if row["entry_point"] else None,
                "entryRating": row["entry_rating"],
                "growthMetric": row["growth_metric"],
                "profitabilityMetric": row["profitability_metric"],
                "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
            }

            return _ft_api_response(data)

    except Exception as e:
        print(f"Analyst recommendations error for {symbol}: {e}")
        return _ft_api_response(None, f"Analyst recommendations unavailable: {str(e)}")


@fastapi_app.get("/api/analyst-recommendations")
async def ft_get_bulk_analyst_recommendations(symbols: str = Query(None), limit: int = Query(20)):
    """Get analyst recommendations for multiple symbols or top rated stocks."""
    if not _ft_asyncpg_pool:
        return _ft_api_response([], "Database unavailable")

    try:
        async with _ft_asyncpg_pool.acquire() as conn:
            if symbols:
                symbol_list = [s.strip().upper() for s in symbols.split(",")]
                rows = await conn.fetch("""
                    SELECT
                        t.symbol,
                        t.name,
                        sa.analyst_recommendation,
                        sa.valuation_metric,
                        sa.target_price,
                        sa.entry_rating
                    FROM stock_analysis sa
                    JOIN tickers t ON t.id = sa.ticker_id
                    WHERE t.symbol = ANY($1)
                    LIMIT $2
                """, symbol_list, min(limit, 100))
            else:
                rows = await conn.fetch("""
                    SELECT
                        t.symbol,
                        t.name,
                        sa.analyst_recommendation,
                        sa.valuation_metric,
                        sa.target_price,
                        sa.entry_rating
                    FROM stock_analysis sa
                    JOIN tickers t ON t.id = sa.ticker_id
                    WHERE sa.analyst_recommendation = 'Buy'
                    ORDER BY sa.target_price DESC NULLS LAST
                    LIMIT $1
                """, min(limit, 100))

            results = [
                {
                    "symbol": row["symbol"],
                    "name": row["name"],
                    "analystRecommendation": row["analyst_recommendation"],
                    "valuationMetric": row["valuation_metric"],
                    "targetPrice": float(row["target_price"]) if row["target_price"] else None,
                    "entryRating": row["entry_rating"],
                }
                for row in rows
            ]

            return _ft_api_response(results)

    except Exception as e:
        print(f"Bulk analyst recommendations error: {e}")
        return _ft_api_response([], f"Analyst recommendations unavailable: {str(e)}")


@fastapi_app.get("/api/fear-greed")
async def ft_get_fear_greed_index():
    """Compute a fear/greed score using a synthetic VIX on NIFTY 50 15m data."""
    symbol = "NIFTY 50"
    lookback = 22
    period = "5d"

    try:
        history = await asyncio.to_thread(
            _ft_fetch_symbol_history,
            symbol,
            period,
            "15m",
            True,
        )
        records = history.get("data", []) if isinstance(history, dict) else []

        if not records:
            return _ft_api_response(None, "Intraday data unavailable for fear index")

        df = pd.DataFrame(records)
        df = df.dropna(subset=["close", "low"])

        if df.empty or len(df) < lookback:
            return _ft_api_response(None, f"Need at least {lookback} candles to compute fear index")

        df = df.tail(max(lookback * 3, lookback))

        value = round(_ft_calculate_synthetic_vix(df, lookback), 2)
        label = categorize_fear_greed(value)
        updated_at = df.iloc[-1]["timestamp"] if "timestamp" in df.columns else datetime.now().isoformat()

        payload = {
            "value": value,
            "label": label,
            "description": "Synthetic VIX derived from NIFTY 50 15m candles",
            "symbol": symbol,
            "lookback": lookback,
            "sampleSize": len(df),
            "updatedAt": updated_at,
            "source": "yfinance",
            "interval": "15m",
        }

        return _ft_api_response(payload, "Fear index updated")

    except Exception as exc:
        return _ft_api_response(None, f"Fear & Greed index unavailable: {str(exc)}")


# =============================================================================
# FinTerminal: Research Reports Endpoints
# =============================================================================

@fastapi_app.get("/api/research-reports/list")
async def ft_get_research_reports_list():
    """Get list of stocks that have analyst recommendations."""
    if not _ft_asyncpg_pool:
        return _ft_api_response([], "Database unavailable")

    try:
        async with _ft_asyncpg_pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT
                    sa.ticker_symbol as symbol,
                    COALESCE(sf.long_name, t.name, sa.ticker_symbol) as long_name,
                    sa.analyst_recommendation,
                    sa.valuation_metric,
                    sa.analysis_date
                FROM stock_analysis sa
                LEFT JOIN stock_fundamentals sf ON sf.ticker_id = sa.ticker_id
                LEFT JOIN tickers t ON t.id = sa.ticker_id
                WHERE sa.is_active = true
                  AND sa.analyst_recommendation IS NOT NULL
                ORDER BY sa.ticker_symbol
            """)

            data = [
                {
                    "symbol": row["symbol"],
                    "longName": row["long_name"],
                    "recommendation": row["analyst_recommendation"],
                    "valuationMetric": row["valuation_metric"],
                    "analysisDate": row["analysis_date"].isoformat() if row["analysis_date"] else None,
                }
                for row in rows
            ]

            return _ft_api_response(data)

    except Exception as e:
        print(f"Research reports list error: {e}")
        return _ft_api_response([], f"Research reports list unavailable: {str(e)}")


@fastapi_app.get("/api/research-reports/{symbol}")
async def ft_get_research_report(symbol: str):
    """Get full research report data for a specific stock."""
    if _ft_redis_cache is None:
        return _ft_api_response(None, "redis_cache module unavailable")

    cached_report = await _ft_redis_cache.get_cached_research(symbol)
    if cached_report:
        return _ft_api_response(cached_report)

    if not _ft_asyncpg_pool:
        return _ft_api_response(None, "Database unavailable")

    try:
        async with _ft_asyncpg_pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT
                    sa.ticker_symbol as symbol,
                    COALESCE(sf.long_name, t.name, sa.ticker_symbol) as long_name,
                    t.sector,
                    t.industry,
                    sa.valuation_metric,
                    sa.profitability_metric,
                    sa.analyst_recommendation,
                    sa.entry_rating,
                    sa.entry_point,
                    sa.target_price,
                    sa.performance_benchmark,
                    sa.performance_pct_of_benchmark,
                    sa.growth_expected_vs_projections,
                    sa.growth_vs_sector_rate,
                    sa.growth_notes,
                    sa.profitability_pct_of_revenue,
                    sa.report_title,
                    sa.analyst_name,
                    sa.notes,
                    sa.analysis_date,
                    sf.income_statement,
                    sf.balance_sheet,
                    sf.cash_flow
                FROM stock_analysis sa
                LEFT JOIN stock_fundamentals sf ON sf.ticker_id = sa.ticker_id
                LEFT JOIN tickers t ON t.id = sa.ticker_id
                WHERE sa.ticker_symbol = $1
                  AND sa.is_active = true
            """, symbol.upper())

            if not row:
                return _ft_api_response(None, f"Research report not found for {symbol}")

            import json as _json

            def _parse_jsonb(value):
                if value is None:
                    return None
                if isinstance(value, str):
                    try:
                        return _json.loads(value)
                    except _json.JSONDecodeError:
                        return None
                return value

            data = {
                "symbol": row["symbol"],
                "longName": row["long_name"],
                "sector": row["sector"],
                "industry": row["industry"],
                "valuationMetric": row["valuation_metric"],
                "profitabilityMetric": row["profitability_metric"],
                "analystRecommendation": row["analyst_recommendation"],
                "entryRating": row["entry_rating"],
                "entryPoint": float(row["entry_point"]) if row["entry_point"] else None,
                "targetPrice": float(row["target_price"]) if row["target_price"] else None,
                "performanceBenchmark": float(row["performance_benchmark"]) if row["performance_benchmark"] else None,
                "performancePctOfBenchmark": float(row["performance_pct_of_benchmark"]) if row["performance_pct_of_benchmark"] else None,
                "growthExpectedVsProjections": float(row["growth_expected_vs_projections"]) if row["growth_expected_vs_projections"] else None,
                "growthVsSectorRate": float(row["growth_vs_sector_rate"]) if row["growth_vs_sector_rate"] else None,
                "growthNotes": row["growth_notes"],
                "profitabilityPctOfRevenue": float(row["profitability_pct_of_revenue"]) if row["profitability_pct_of_revenue"] else None,
                "reportTitle": row["report_title"],
                "analystName": row["analyst_name"],
                "notes": row["notes"],
                "analysisDate": row["analysis_date"].isoformat() if row["analysis_date"] else None,
                "incomeStatement": _parse_jsonb(row["income_statement"]),
                "balanceSheet": _parse_jsonb(row["balance_sheet"]),
                "cashFlow": _parse_jsonb(row["cash_flow"]),
            }

            await _ft_redis_cache.cache_research(symbol, data)
            return _ft_api_response(data)

    except Exception as e:
        print(f"Research report error for {symbol}: {e}")
        return _ft_api_response(None, f"Research report unavailable: {str(e)}")


# =============================================================================
# FinTerminal: Fundamentals, Top Stocks, Sectors Endpoints
# =============================================================================

async def _ft_fetch_fundamentals_from_db(symbol: str) -> Optional[dict]:
    """Fetch fundamentals data from stock_fundamentals table."""
    if not _ft_asyncpg_pool:
        return None

    async with _ft_asyncpg_pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT
                t.symbol,
                t.name,
                sf.sector,
                sf.industry,
                sf.market_cap,
                sf.trailing_pe,
                sf.forward_pe,
                sf.dividend_yield,
                sf.price_to_book,
                sf.price_to_sales,
                sf.enterprise_value,
                sf.debt_to_equity,
                sf.return_on_equity,
                sf.return_on_assets,
                sf.profit_margin,
                sf.operating_margin,
                sf.current_ratio,
                sf.quick_ratio,
                sf.earnings_growth,
                sf.revenue_growth,
                sf.peg_ratio,
                sf.fifty_two_week_high,
                sf.fifty_two_week_low,
                sf.total_cash,
                sf.total_debt,
                sf.shares_outstanding,
                sf.payout_ratio
            FROM stock_fundamentals sf
            JOIN tickers t ON t.id = sf.ticker_id
            WHERE t.symbol = $1
        """, symbol.upper())

        if not row:
            return None

        return {
            "symbol": row["symbol"],
            "name": row["name"],
            "sector": row["sector"],
            "industry": row["industry"],
            "marketCap": int(row["market_cap"]) if row["market_cap"] else None,
            "trailingPE": float(row["trailing_pe"]) if row["trailing_pe"] else None,
            "forwardPE": float(row["forward_pe"]) if row["forward_pe"] else None,
            "dividendYield": float(row["dividend_yield"]) if row["dividend_yield"] else None,
            "priceToBook": float(row["price_to_book"]) if row["price_to_book"] else None,
            "priceToSales": float(row["price_to_sales"]) if row["price_to_sales"] else None,
            "enterpriseValue": int(row["enterprise_value"]) if row["enterprise_value"] else None,
            "debtToEquity": float(row["debt_to_equity"]) if row["debt_to_equity"] else None,
            "returnOnEquity": float(row["return_on_equity"]) if row["return_on_equity"] else None,
            "returnOnAssets": float(row["return_on_assets"]) if row["return_on_assets"] else None,
            "profitMargin": float(row["profit_margin"]) if row["profit_margin"] else None,
            "operatingMargin": float(row["operating_margin"]) if row["operating_margin"] else None,
            "currentRatio": float(row["current_ratio"]) if row["current_ratio"] else None,
            "quickRatio": float(row["quick_ratio"]) if row["quick_ratio"] else None,
            "earningsGrowth": float(row["earnings_growth"]) if row["earnings_growth"] else None,
            "revenueGrowth": float(row["revenue_growth"]) if row["revenue_growth"] else None,
            "pegRatio": float(row["peg_ratio"]) if row["peg_ratio"] else None,
            "fiftyTwoWeekHigh": float(row["fifty_two_week_high"]) if row["fifty_two_week_high"] else None,
            "fiftyTwoWeekLow": float(row["fifty_two_week_low"]) if row["fifty_two_week_low"] else None,
            "totalCash": int(row["total_cash"]) if row["total_cash"] else None,
            "totalDebt": int(row["total_debt"]) if row["total_debt"] else None,
            "sharesOutstanding": int(row["shares_outstanding"]) if row["shares_outstanding"] else None,
            "payoutRatio": float(row["payout_ratio"]) if row["payout_ratio"] else None,
        }


@fastapi_app.get("/api/fundamentals/{symbol}")
async def ft_get_fundamentals(symbol: str):
    """Get comprehensive fundamentals from stock_fundamentals table."""
    sym = symbol.upper()

    try:
        if _ft_request_coalescing is not None:
            coalescer = _ft_request_coalescing.fundamentals_coalescer
            if coalescer is not None and _ft_redis_cache is not None:
                data = await coalescer.get_or_fetch(
                    f"fundamentals:{sym}",
                    _ft_fetch_fundamentals_from_db,
                    sym,
                    cache_ttl=_ft_redis_cache.get_dynamic_ttl("fundamentals"),
                )
            else:
                data = await _ft_fetch_fundamentals_from_db(sym)
        else:
            data = await _ft_fetch_fundamentals_from_db(sym)

        if data is None:
            return _ft_api_response(None, f"Fundamentals not found for {symbol}")

        return _ft_api_response(data)

    except Exception as e:
        print(f"Fundamentals error for {symbol}: {e}")
        return _ft_api_response(None, f"Fundamentals unavailable: {str(e)}")


@fastapi_app.get("/api/top-stocks")
async def ft_get_top_stocks(limit: int = Query(20)):
    """Get top stocks by market cap."""
    if not _ft_asyncpg_pool:
        return _ft_api_response(None, "Database unavailable")

    try:
        async with _ft_asyncpg_pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT
                    t.symbol,
                    t.name,
                    sf.market_cap
                FROM stock_fundamentals sf
                JOIN tickers t ON t.id = sf.ticker_id
                WHERE sf.market_cap IS NOT NULL
                  AND sf.market_cap > 0
                  AND t.suffix IS NULL
                ORDER BY sf.market_cap DESC
                LIMIT $1
            """, min(limit, 100))

            data = [
                {
                    "symbol": row["symbol"],
                    "name": row["name"],
                    "marketCap": int(row["market_cap"]) if row["market_cap"] else 0,
                }
                for row in rows
            ]

            return _ft_api_response(data)

    except Exception as e:
        print(f"Top stocks error: {e}")
        return _ft_api_response(None, f"Top stocks unavailable: {str(e)}")


@fastapi_app.get("/api/sectors/batch")
async def ft_get_batch_sectors(symbols: str = Query(..., min_length=1)):
    """Get sector and industry for multiple symbols (comma-separated)."""
    if not _ft_asyncpg_pool:
        return _ft_api_response([], "Database unavailable")

    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not symbol_list:
        return _ft_api_response([], "No symbols provided")

    symbol_list = symbol_list[:100]

    try:
        async with _ft_asyncpg_pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT t.symbol, sf.sector, sf.industry
                FROM stock_fundamentals sf
                JOIN tickers t ON t.id = sf.ticker_id
                WHERE t.symbol = ANY($1)
            """, symbol_list)

            data = [
                {
                    "symbol": row["symbol"],
                    "sector": row["sector"] or "Other",
                    "industry": row["industry"] or "",
                }
                for row in rows
            ]

            return _ft_api_response(data)

    except Exception as e:
        print(f"Batch sectors error: {e}")
        return _ft_api_response([], f"Batch sectors unavailable: {str(e)}")


# =============================================================================
# Pair Trading Feasibility Endpoints
# =============================================================================

def _pair_trading_fetch_groups_sync() -> Dict[str, List[str]]:
    """Sync DB worker for /api/pair-trading/groups (runs inside asyncio.to_thread)."""
    with get_db_cursor() as cur:
        cur.execute("""
            SELECT DISTINCT TRIM(s) AS g FROM (
                SELECT sector AS s FROM stock_fundamentals WHERE sector IS NOT NULL AND TRIM(sector) <> ''
                UNION
                SELECT sector AS s FROM tickers WHERE sector IS NOT NULL AND TRIM(sector) <> ''
            ) u
            WHERE TRIM(s) <> ''
            ORDER BY g ASC
        """)
        sectors = [row["g"] for row in cur.fetchall() if row.get("g")]
        cur.execute("""
            SELECT DISTINCT TRIM(s) AS g FROM (
                SELECT industry AS s FROM stock_fundamentals WHERE industry IS NOT NULL AND TRIM(industry) <> ''
                UNION
                SELECT industry AS s FROM tickers WHERE industry IS NOT NULL AND TRIM(industry) <> ''
            ) u
            WHERE TRIM(s) <> ''
            ORDER BY g ASC
        """)
        industries = [row["g"] for row in cur.fetchall() if row.get("g")]
    return {"sectors": sectors, "industries": industries}


@fastapi_app.get("/api/pair-trading/groups")
async def ft_pair_trading_groups():
    """Return sorted lists of distinct sectors and industries for the group dropdown."""
    cache_key = "pair_trading:groups:v4"
    cached = get_cached(cache_key)
    if cached and (cached.get("sectors") or cached.get("industries")):
        logging.info(
            f"[PairTrading] groups served from cache: sectors={len(cached.get('sectors', []))}, "
            f"industries={len(cached.get('industries', []))}"
        )
        return _ft_api_response(cached)

    try:
        data = await asyncio.to_thread(_pair_trading_fetch_groups_sync)
        logging.info(
            f"[PairTrading] groups computed: sectors={len(data['sectors'])}, "
            f"industries={len(data['industries'])}"
        )
        set_cached(cache_key, data, 3600)
        return _ft_api_response(data)

    except Exception as e:
        logging.exception(f"[PairTrading] groups error: {e}")
        return _ft_api_response({"sectors": [], "industries": []}, f"Groups unavailable: {str(e)}")


_PAIR_MATRIX_SYMBOL_CAP = 30
_PAIR_MATRIX_MIN_COVERAGE = 0.8


def _pair_trading_fetch_matrix_data_sync(
    group_type: str,
    group: str,
    lookback_days: int,
) -> Optional[Dict[str, Any]]:
    """Sync DB worker that returns { ticker_rows, ohlc_rows, truncated } or None if no tickers."""
    col = "sector" if group_type == "sector" else "industry"
    with get_db_cursor() as cur:
        cur.execute(
            f"""
            SELECT DISTINCT t.id AS id, t.symbol AS symbol
            FROM tickers t
            LEFT JOIN stock_fundamentals sf ON sf.ticker_id = t.id
            WHERE COALESCE(t.is_active, true) = true
              AND (TRIM(t.{col}) = %s OR TRIM(sf.{col}) = %s)
            ORDER BY t.symbol ASC
            """,
            (group, group),
        )
        ticker_rows = cur.fetchall()
        if not ticker_rows:
            return None

        truncated = len(ticker_rows) > _PAIR_MATRIX_SYMBOL_CAP
        if truncated:
            ticker_rows = ticker_rows[:_PAIR_MATRIX_SYMBOL_CAP]

        ticker_ids = [r["id"] for r in ticker_rows]

        cur.execute(
            """
            SELECT ticker_id, day, close FROM (
                SELECT ticker_id, day, close,
                       ROW_NUMBER() OVER (PARTITION BY ticker_id ORDER BY day DESC) AS rn
                FROM ohlc_daily
                WHERE ticker_id = ANY(%s)
            ) t
            WHERE rn <= %s
            ORDER BY ticker_id, day ASC
            """,
            (ticker_ids, lookback_days),
        )
        ohlc_rows = cur.fetchall()

    return {
        "ticker_rows": [{"id": r["id"], "symbol": r["symbol"]} for r in ticker_rows],
        "ohlc_rows": [{"ticker_id": r["ticker_id"], "day": r["day"], "close": r["close"]} for r in ohlc_rows],
        "truncated": truncated,
    }


@fastapi_app.get("/api/pair-trading/matrix")
async def ft_pair_trading_matrix(
    group_type: str = Query(..., pattern="^(sector|industry)$"),
    group: str = Query(..., min_length=1),
    method: str = Query("correlation", pattern="^(correlation|cointegration)$"),
    lookback_days: int = Query(40, ge=10, le=500),
):
    """Compute an N×N correlation or cointegration matrix for all stocks in a sector/industry."""
    cache_key = f"pair_trading:matrix:v4:{group_type}:{group}:{method}:{lookback_days}"
    cached = get_cached(cache_key)
    if cached:
        return _ft_api_response(cached)

    try:
        fetched = await asyncio.to_thread(
            _pair_trading_fetch_matrix_data_sync, group_type, group, lookback_days
        )

        if fetched is None:
            return _ft_api_response(None, f"No stocks found for {group_type} '{group}'")

        ticker_rows = fetched["ticker_rows"]
        ohlc_rows = fetched["ohlc_rows"]
        truncated = fetched["truncated"]

        id_to_symbol = {row["id"]: row["symbol"].upper() for row in ticker_rows}

        if not ohlc_rows:
            return _ft_api_response(None, "No OHLC data for the selected lookback window")

        per_symbol: Dict[str, Dict[str, float]] = {}
        for row in ohlc_rows:
            sym = id_to_symbol.get(row["ticker_id"])
            if not sym:
                continue
            day_key = row["day"].strftime("%Y-%m-%d")
            per_symbol.setdefault(sym, {})[day_key] = float(row["close"])

        min_required = int(lookback_days * _PAIR_MATRIX_MIN_COVERAGE)
        symbols: List[str] = []
        series_map: Dict[str, pd.Series] = {}
        for sym, closes in per_symbol.items():
            if len(closes) < min_required:
                continue
            series = pd.Series(closes).sort_index()
            symbols.append(sym)
            series_map[sym] = series

        symbols.sort()

        if len(symbols) < 2:
            return _ft_api_response(
                None,
                f"Not enough symbols with sufficient data (need ≥2, got {len(symbols)})",
            )

        close_df = pd.DataFrame({s: series_map[s] for s in symbols}).sort_index()
        close_df = close_df.dropna(how="all")

        as_of = close_df.index.max() if len(close_df) else None
        n = len(symbols)
        matrix: List[List[Optional[float]]] = [[None] * n for _ in range(n)]
        pvalues: Optional[List[List[Optional[float]]]] = None

        if method == "correlation":
            aligned = close_df.dropna(how="any")
            log_returns = np.log(aligned / aligned.shift(1)).dropna(how="any")
            if len(log_returns) < 2:
                return _ft_api_response(None, "Not enough overlapping data to compute correlation")

            corr = log_returns.corr(method="pearson")
            for i, sym_i in enumerate(symbols):
                for j, sym_j in enumerate(symbols):
                    if i == j:
                        matrix[i][j] = 100.0
                    else:
                        val = corr.loc[sym_i, sym_j]
                        if pd.isna(val):
                            matrix[i][j] = None
                        else:
                            matrix[i][j] = round(float(val) * 100.0, 2)
        else:
            try:
                from statsmodels.tsa.stattools import coint
            except ImportError as e:
                return _ft_api_response(
                    None,
                    f"Cointegration unavailable (statsmodels not installed): {str(e)}",
                )

            pvalues = [[None] * n for _ in range(n)]

            for i in range(n):
                matrix[i][i] = 100.0
                pvalues[i][i] = 0.0
                for j in range(i + 1, n):
                    sym_i, sym_j = symbols[i], symbols[j]
                    pair = close_df[[sym_i, sym_j]].dropna(how="any")
                    if len(pair) < max(20, min_required // 2):
                        continue
                    try:
                        _stat, pvalue, _crit = coint(pair[sym_i].values, pair[sym_j].values)
                        score = round(float((1.0 - pvalue) * 100.0), 2)
                        pval_rounded = round(float(pvalue), 4)
                    except Exception:
                        continue
                    matrix[i][j] = score
                    matrix[j][i] = score
                    pvalues[i][j] = pval_rounded
                    pvalues[j][i] = pval_rounded

        payload: Dict[str, Any] = {
            "symbols": symbols,
            "matrix": matrix,
            "method": method,
            "lookback_days": lookback_days,
            "group_type": group_type,
            "group": group,
            "truncated": truncated,
            "symbol_cap": _PAIR_MATRIX_SYMBOL_CAP,
            "as_of": str(as_of) if as_of is not None else None,
        }
        if pvalues is not None:
            payload["pvalues"] = pvalues

        set_cached(cache_key, payload, 900)
        return _ft_api_response(payload)

    except Exception as e:
        logging.exception(f"[PairTrading] matrix error: {e}")
        return _ft_api_response(None, f"Matrix unavailable: {str(e)}")


def _pair_trading_fetch_pair_series_sync(symbols: List[str], lookback_days: int) -> List[Dict[str, Any]]:
    """Fetch last N daily closes for each symbol from ohlc_daily (independent of calendar date)."""
    with get_db_cursor() as cur:
        cur.execute(
            "SELECT id, symbol FROM tickers WHERE UPPER(symbol) = ANY(%s)",
            ([s.upper() for s in symbols],),
        )
        ticker_rows = cur.fetchall()
        if not ticker_rows:
            return []

        id_to_symbol = {r["id"]: r["symbol"].upper() for r in ticker_rows}
        ticker_ids = list(id_to_symbol.keys())

        cur.execute(
            """
            SELECT ticker_id, day, open, high, low, close, volume FROM (
                SELECT ticker_id, day, open, high, low, close, volume,
                       ROW_NUMBER() OVER (PARTITION BY ticker_id ORDER BY day DESC) AS rn
                FROM ohlc_daily
                WHERE ticker_id = ANY(%s)
            ) t
            WHERE rn <= %s
            ORDER BY ticker_id, day ASC
            """,
            (ticker_ids, lookback_days),
        )
        ohlc_rows = cur.fetchall()

    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for row in ohlc_rows:
        sym = id_to_symbol.get(row["ticker_id"])
        if not sym:
            continue
        grouped.setdefault(sym, []).append({
            "date": row["day"].strftime("%Y-%m-%d"),
            "open": float(row["open"]) if row["open"] is not None else 0.0,
            "high": float(row["high"]) if row["high"] is not None else 0.0,
            "low": float(row["low"]) if row["low"] is not None else 0.0,
            "close": float(row["close"]) if row["close"] is not None else 0.0,
            "volume": int(row["volume"]) if row["volume"] else 0,
        })

    return [{"symbol": sym, "data": grouped.get(sym, [])} for sym in [s.upper() for s in symbols]]


@fastapi_app.get("/api/pair-trading/pair-series")
async def ft_pair_trading_pair_series(
    symbols: str = Query(..., min_length=1),
    lookback_days: int = Query(40, ge=10, le=1000),
):
    """Return the last N daily OHLC bars for each symbol in the pair.

    Independent of the calendar date (uses ORDER BY day DESC LIMIT N),
    so it works even if the DB isn't updated to today.
    """
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not symbol_list:
        return _ft_api_response([], "No symbols provided")
    symbol_list = symbol_list[:5]

    cache_key = f"pair_trading:pair_series:v1:{','.join(symbol_list)}:{lookback_days}"
    cached = get_cached(cache_key)
    if cached:
        return _ft_api_response(cached)

    try:
        data = await asyncio.to_thread(
            _pair_trading_fetch_pair_series_sync, symbol_list, lookback_days
        )
        set_cached(cache_key, data, 600)
        return _ft_api_response(data)
    except Exception as e:
        logging.exception(f"[PairTrading] pair-series error: {e}")
        return _ft_api_response([], f"Pair series unavailable: {str(e)}")


# =============================================================================
# Pattern Search Endpoint
# =============================================================================

@fastapi_app.get("/api/pattern-search", tags=["Technical Analysis"])
async def pattern_search_api(
    pattern: str = Query("all"),
    timeframe: str = Query("1M"),
    confidence: int = Query(70, ge=50, le=100),
):
    """
    Scan top stocks for chart patterns (Head & Shoulders, Double Top/Bottom, Triangles, etc.).

    Returns a plain JSON array (no envelope) because the frontend useQuery expects Pattern[] directly.
    """
    from server.pattern_detector import scan_patterns

    cache_key = f"pattern_search:v2:{pattern}:{timeframe}:{confidence}"
    cached = get_cached(cache_key)
    if cached is not None:
        return cached

    pool = get_db_pool()
    conn = pool.getconn()
    try:
        patterns = scan_patterns(conn, pattern, timeframe, confidence)
    finally:
        pool.putconn(conn)

    set_cached(cache_key, patterns, 900)  # 15 min TTL
    return patterns


# =============================================================================
# Seasonality Analysis Endpoint
# =============================================================================

@fastapi_app.get("/api/seasonality/{ticker}", tags=["Technical Analysis"])
async def seasonality_api(ticker: str):
    """
    Calculate weekly seasonality analysis for a stock using all available daily data.

    Returns weekly stats (avg return, win rate per ISO week), monthly stats, and yearly heatmap data.
    """
    from server.seasonality import calculate_seasonality

    ticker = unquote(ticker).upper()

    cache_key = f"seasonality:{ticker}"
    cached = get_cached(cache_key)
    if cached is not None:
        return {"data": cached}

    pool = get_db_pool()
    conn = pool.getconn()
    try:
        result = calculate_seasonality(conn, ticker)
    finally:
        pool.putconn(conn)

    if result is None:
        raise HTTPException(status_code=404, detail=f"No data found for ticker {ticker}")

    set_cached(cache_key, result, 3600)  # 1 hour TTL
    return {"data": result}


# =============================================================================
# Fyers Token Management Endpoint
# =============================================================================

class FyersTokenRequest(BaseModel):
    access_token: str
    generated_at: Optional[str] = None
    expiry: Optional[str] = None

@fastapi_app.post("/api/admin/fyers-token", tags=["Admin"])
async def update_fyers_token(request: FyersTokenRequest):
    """Update Fyers access token from the admin UI. Writes to FYERS_TOKEN_PATH."""
    import json as _json
    from datetime import datetime as _dt

    token_path = os.getenv("FYERS_TOKEN_PATH", "./fyers_token.json")

    if not request.access_token or not request.access_token.strip():
        raise HTTPException(status_code=400, detail="access_token is required")

    payload = {
        "access_token": request.access_token.strip(),
        "generated_at": request.generated_at or _dt.now().isoformat(),
        "expiry": request.expiry or "",
    }

    try:
        with open(token_path, "w") as f:
            _json.dump(payload, f, indent=2)
        logging.info(f"[FyersToken] Token updated successfully, expires: {payload['expiry']}")
        return success_response({"message": "Token updated", "expiry": payload["expiry"]})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write token: {str(e)}")

@fastapi_app.get("/api/admin/fyers-token", tags=["Admin"])
async def get_fyers_token_status():
    """Get current Fyers token status (expiry only, not the token itself)."""
    import json as _json
    from datetime import datetime as _dt

    token_path = os.getenv("FYERS_TOKEN_PATH", "./fyers_token.json")

    try:
        if not os.path.exists(token_path):
            return success_response({"status": "missing", "expiry": None})
        with open(token_path, "r") as f:
            data = _json.load(f)
        expiry_str = data.get("expiry", "")
        is_valid = False
        if expiry_str:
            try:
                expiry = _dt.fromisoformat(expiry_str)
                is_valid = expiry > _dt.now()
            except Exception:
                pass
        return success_response({
            "status": "valid" if is_valid else "expired",
            "expiry": expiry_str,
            "generated_at": data.get("generated_at", ""),
        })
    except Exception as e:
        return success_response({"status": "error", "error": str(e), "expiry": None})


# =============================================================================
# Fundamental Screener Endpoints
# =============================================================================

class FundamentalScreenerRequest(BaseModel):
    expression: str

@fastapi_app.post("/api/fundamental-screener/start", tags=["Technical Analysis"])
async def start_fundamental_screener(request: Request, body: FundamentalScreenerRequest):
    """Start a fundamental screener job and return job_id for SSE streaming."""
    user_id = get_task_user_id(request)
    tier = get_task_tier(request)
    if not check_task_limit(user_id, tier):
        raise HTTPException(status_code=429, detail="Too many concurrent tasks. Please wait.")

    expression = body.expression.strip()
    if not expression:
        raise HTTPException(status_code=400, detail="Expression is required")

    try:
        ConditionEvaluator(expression)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid expression: {str(e)}")

    job_id = str(uuid.uuid4())
    increment_task_count(user_id)

    if not create_screener_task(job_id):
        raise HTTPException(status_code=500, detail="Failed to create task")

    _task_user_id = user_id

    def run_task():
        from server.fundamental_screener import run_fundamental_screener

        if not get_screener_task(job_id):
            decrement_task_count(_task_user_id)
            return

        def progress_cb(processed, total, matches):
            update_screener_task(job_id, {"processed": processed, "total": total, "matches": matches})

        def result_cb(result):
            append_screener_result(job_id, result)

        def abort_check():
            return is_screener_cancelled(job_id)

        try:
            pool = get_db_pool()
            conn = pool.getconn()
            try:
                summary = run_fundamental_screener(conn, expression, progress_cb, result_cb, abort_check)
            finally:
                pool.putconn(conn)

            update_screener_task(job_id, {
                "status": "complete",
                "summary": summary,
                "completed_at": time.time()
            })
        except Exception as e:
            logging.exception(f"Fundamental screener task {job_id} failed")
            update_screener_task(job_id, {
                "status": "error",
                "error": str(e),
                "completed_at": time.time()
            })
        finally:
            decrement_task_count(_task_user_id)

    threading.Thread(target=run_task, daemon=True).start()
    return success_response({"job_id": job_id})


@fastapi_app.get("/api/fundamental-screener/stream/{job_id}", tags=["Technical Analysis"])
async def stream_fundamental_screener(job_id: str):
    """SSE stream for fundamental screener progress — reuses expert screener stream logic."""
    return await stream_expert_screener(job_id)


@fastapi_app.post("/api/fundamental-screener/cancel/{job_id}", tags=["Technical Analysis"])
async def cancel_fundamental_screener(job_id: str):
    """Cancel a running fundamental screener job."""
    if not get_screener_task(job_id):
        raise HTTPException(status_code=404, detail="Task not found")
    update_screener_task(job_id, {"status": "cancelled", "completed_at": time.time()})
    return success_response({"status": "cancelled"})


@fastapi_app.get("/api/fundamental-screener/variables", tags=["Technical Analysis"])
async def get_fundamental_variables():
    """Return available fundamental variables for the screener."""
    from server.fundamental_screener import FUNDAMENTAL_VARIABLES
    return success_response(FUNDAMENTAL_VARIABLES)


if __name__ == "__main__":
    port = int(os.getenv("PYTHON_PORT", "7860"))
    is_dev = os.getenv("NODE_ENV", "development").lower() == "development"

    logging.info(f"Starting EquityPro API server on port {port}")
    logging.info(f"Environment: {'development' if is_dev else 'production'}")
    logging.info(f"Auto-reload: {'enabled' if is_dev else 'disabled'}")

    uvicorn.run(
        "main:app",  # Use string reference for auto-reload compatibility
        host="0.0.0.0",
        port=port,
        reload=is_dev  # Only enable auto-reload in development
    )
