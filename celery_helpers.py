"""
Lightweight helper functions for Celery tasks.

This module provides database access and payload building functions specifically
for Celery workers. It avoids importing from main.py to prevent loading heavy
dependencies like:
- FastAPI app and routes
- Gradio interfaces
- Matplotlib figure generation
- Selenium
- Sentiment analysis model

This reduces Celery worker startup time from ~25s to ~2-3s.
"""

import os
import sys
import math
import logging
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

# Ensure project root AND server/ subdirectory are in path BEFORE any local imports
PROJECT_ROOT = Path(__file__).parent.resolve()
SERVER_DIR = PROJECT_ROOT / "server"

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
import pandas as pd
import numpy as np

# Load environment
env_file = '.env.production' if os.getenv('NODE_ENV') == 'production' else '.env'
load_dotenv(env_file, override=True)
print(f"[CELERY HELPERS] Loaded environment from: {env_file}")

logger = logging.getLogger(__name__)

# Database configuration (minimal - only what Celery needs)
DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "port": os.getenv("DB_PORT", "5432"),
    "database": os.getenv("DB_NAME"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
}

# Lazy-initialized connection pool for Celery workers
# Separate from main.py pool to avoid import dependencies
_celery_db_pool: Optional[pool.ThreadedConnectionPool] = None


def get_celery_db_connection():
    """
    Get database connection for Celery workers.

    Uses a separate connection pool from main.py to avoid heavy imports.
    """
    global _celery_db_pool
    if _celery_db_pool is None:
        logger.info("[CELERY] Initializing database pool...")
        _celery_db_pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=2,
            maxconn=5,
            **DB_CONFIG,
            connect_timeout=30
        )
        logger.info("[CELERY] Database pool initialized")
    return _celery_db_pool.getconn()


def release_celery_db_connection(conn):
    """Release connection back to Celery pool."""
    global _celery_db_pool
    if _celery_db_pool and conn:
        try:
            _celery_db_pool.putconn(conn)
        except Exception as e:
            logger.warning(f"[CELERY] Failed to release connection: {e}")


def _to_native_number(value):
    """Convert numpy types to native Python types for JSON serialization."""
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


def build_strategy_payload(
    result: Dict[str, Any],
    df_train: pd.DataFrame,
    df_test: pd.DataFrame,
    duration: float,
    fitness_progress: Optional[List[float]] = None
) -> Optional[Dict[str, Any]]:
    """
    Build JSON payload for standard optimization results.

    Lightweight version that skips matplotlib figure generation.
    The frontend renders its own charts from the equity_curve data.
    """
    if result is None:
        return None

    condition = result["condition"]

    # Calculate equity curve from train + test data
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

    # Process fitness progress
    fitness_series = []
    if fitness_progress:
        for value in fitness_progress:
            if value in (np.inf, -np.inf):
                continue
            if isinstance(value, (np.floating, float)) and np.isnan(value):
                continue
            fitness_series.append(float(value))

    payload = {
        "condition": condition,
        "metrics": metrics,
        "equity_curve": equity_curve,
        "train_end_date": train_end_iso,
        "train_end_index": train_end_index,
        "candlestick_data": candlestick_data,
        "duration": float(duration),
    }

    if max_drawdown_point is not None:
        payload["max_drawdown_point"] = max_drawdown_point
    if fitness_series:
        payload["fitness_progress"] = fitness_series

    return payload


def build_advanced_strategy_payload(
    result: Dict[str, Any],
    df_train: pd.DataFrame,
    df_test: pd.DataFrame,
    duration: float
) -> Optional[Dict[str, Any]]:
    """
    Build JSON payload for advanced (TPSL) optimization results.

    Similar to build_strategy_payload but includes target_pct and stop_pct.
    Lightweight version without matplotlib figure generation.
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


# Re-export commonly needed imports for Celery tasks
# These are imported here to avoid Celery tasks needing to import from multiple places
# Note: compute_indicators_and_rules and optimize_trading_strategy are in Strat_optimizer_tpsl.py
from Strat_optimizer_tpsl import (
    compute_indicators_and_rules,
    optimize_trading_strategy,
    run_tpsl_optimization_from_df,
)
from db_timeframe_accessor import TimeframeDataAccessor

# =============================================================================
# Sentiment Analysis Helpers (for Celery workers)
# =============================================================================

# Sentiment model configuration
SENTIMENT_ANALYSIS_MODEL = "mrm8488/distilroberta-finetuned-financial-news-sentiment-analysis"

# Lazy-loaded sentiment analyzer for Celery workers
# Each worker process loads the model once on first use
_celery_sentiment_analyzer = None
_celery_sentiment_lock = None


def _get_sentiment_lock():
    """Get thread lock for sentiment analyzer initialization."""
    import threading
    global _celery_sentiment_lock
    if _celery_sentiment_lock is None:
        _celery_sentiment_lock = threading.Lock()
    return _celery_sentiment_lock


def get_celery_sentiment_analyzer():
    """
    Get or initialize the sentiment analysis pipeline for Celery workers.

    Uses lazy loading with thread-safe initialization.
    Model is loaded once per worker process and reused.
    """
    global _celery_sentiment_analyzer
    if _celery_sentiment_analyzer is None:
        lock = _get_sentiment_lock()
        with lock:
            # Double-check after acquiring lock
            if _celery_sentiment_analyzer is None:
                import torch
                from transformers import pipeline

                DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
                logger.info(f"[CELERY SENTIMENT] Loading model on device: {DEVICE}")
                logger.info(f"[CELERY SENTIMENT] Model: {SENTIMENT_ANALYSIS_MODEL}")

                _celery_sentiment_analyzer = pipeline(
                    "sentiment-analysis",
                    model=SENTIMENT_ANALYSIS_MODEL,
                    device=DEVICE
                )
                logger.info("[CELERY SENTIMENT] Model loaded successfully")

    return _celery_sentiment_analyzer


def fetch_articles_for_celery(query: str) -> list:
    """
    Fetch news articles using GoogleNews API (for Celery workers).

    Args:
        query: Search query (typically ticker symbol)

    Returns:
        List of article dictionaries with title, desc, date, link, source
    """
    from GoogleNews import GoogleNews

    articles = []
    try:
        logger.info(f"[CELERY SENTIMENT] Fetching articles for '{query}'")
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

        logger.info(f"[CELERY SENTIMENT] Fetched {len(articles)} articles")
        return articles

    except Exception as e:
        logger.error(f"[CELERY SENTIMENT] GoogleNews fetch failed: {e}")
        raise


def analyze_article_sentiment_celery(article: dict) -> dict:
    """
    Analyze sentiment for a single article using FinBERT model.

    Args:
        article: Article dictionary with 'desc' field

    Returns:
        Article dictionary with 'sentiment' field added
    """
    analyzer = get_celery_sentiment_analyzer()
    desc = article.get("desc", "")

    if not desc:
        article["sentiment"] = {"label": "neutral", "score": 0.5}
        return article

    try:
        result = analyzer(desc[:512])[0]  # Truncate to model max length
        article["sentiment"] = result
    except Exception as e:
        logger.warning(f"[CELERY SENTIMENT] Analysis failed for article: {e}")
        article["sentiment"] = {"label": "neutral", "score": 0.5}

    return article


def normalize_sentiment_label(label: str) -> str:
    """Normalize sentiment labels to standard format."""
    if not label:
        return "neutral"
    label_lower = label.lower()
    if "positive" in label_lower:
        return "positive"
    elif "negative" in label_lower:
        return "negative"
    return "neutral"


def get_fundamentals_for_celery(ticker: str) -> dict:
    """
    Fetch stock fundamentals from database (for Celery workers).

    Args:
        ticker: Stock ticker symbol

    Returns:
        Dictionary with fundamental data or empty dict on error
    """
    ticker_upper = ticker.upper().strip()
    conn = None

    try:
        conn = get_celery_db_connection()

        # Get LTP data
        from db_ltp_accessor import LTPDataAccessor
        ltp_accessor = LTPDataAccessor(conn)
        ltp_data = ltp_accessor.get_ltp_by_symbol(ticker_upper)

        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            query = """
                SELECT
                    sf.market_cap,
                    sf.trailing_pe,
                    sf.forward_pe,
                    sf.beta,
                    sf.fifty_two_week_high,
                    sf.fifty_two_week_low,
                    sf.dividend_yield,
                    sf.price_to_book,
                    sf.profit_margin,
                    sf.return_on_equity,
                    sf.sector,
                    sf.industry,
                    sf.long_name
                FROM tickers t
                JOIN stock_fundamentals sf ON t.id = sf.ticker_id
                WHERE UPPER(t.symbol) = %s
                LIMIT 1
            """
            cursor.execute(query, (ticker_upper,))
            row = cursor.fetchone()

            if not row:
                return {}

            # Build result with LTP data
            result = {k: _to_native_number(v) if v is not None else None
                     for k, v in dict(row).items()}

            if ltp_data:
                result["current_price"] = ltp_data.get("ltp")
                result["prev_close"] = ltp_data.get("close")  # v2 schema: close = prev_close
                result["change_percent"] = ltp_data.get("percent_change")  # v2 schema: use pre-computed value

            return result

    except Exception as e:
        logger.error(f"[CELERY SENTIMENT] Fundamentals fetch failed for {ticker}: {e}")
        return {}
    finally:
        if conn:
            release_celery_db_connection(conn)


__all__ = [
    'get_celery_db_connection',
    'release_celery_db_connection',
    'build_strategy_payload',
    'build_advanced_strategy_payload',
    'compute_indicators_and_rules',
    'optimize_trading_strategy',
    'run_tpsl_optimization_from_df',
    'TimeframeDataAccessor',
    # Sentiment analysis helpers
    'get_celery_sentiment_analyzer',
    'fetch_articles_for_celery',
    'analyze_article_sentiment_celery',
    'normalize_sentiment_label',
    'get_fundamentals_for_celery',
]
