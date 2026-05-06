"""
Celery tasks for Tiphub async processing.

This module contains CPU-intensive tasks that should run in background workers
rather than blocking the FastAPI event loop.

IMPORTANT: Imports are at module level for performance. The worker_init.py
module pre-imports these when the worker starts, so there's no cold-start delay.
"""

import os
import sys
from pathlib import Path
import time
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Callable

import pandas as pd
import numpy as np
from psycopg2.extras import RealDictCursor

# Ensure project root is in Python path before local imports
PROJECT_ROOT = Path(__file__).parent.resolve()
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from celery_app import celery_app

# Module-level imports from celery_helpers (preloaded by worker_init.py)
# These are now imported ONCE at module load, not on every task call
from celery_helpers import (
    get_celery_db_connection,
    release_celery_db_connection,
    compute_indicators_and_rules,
    optimize_trading_strategy,
    build_strategy_payload,
    build_advanced_strategy_payload,
    TimeframeDataAccessor,
    run_tpsl_optimization_from_df,
    # Sentiment analysis helpers
    fetch_articles_for_celery,
    analyze_article_sentiment_celery,
    normalize_sentiment_label,
    get_fundamentals_for_celery,
)

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name='backtest.run')
def run_backtest_task(
    self,
    ticker: str,
    custom_rules: str,
    mode: str  # 'standard' or 'advanced'
):
    """
    Celery task for running strategy backtest.

    Uses self.update_state() to send progress updates that can be polled via SSE.

    Args:
        ticker: Stock ticker symbol (e.g., 'RELIANCE', 'TCS')
        custom_rules: Optional custom trading rules string
        mode: 'standard' for regular GA, 'advanced' for TPSL optimization

    Returns:
        dict with 'status', 'result' (or 'error'), and 'duration'
    """
    start_time = time.time()
    ticker_upper = ticker.upper().strip()
    logger.info(f"[Backtest {self.request.id}] Starting {mode} backtest for {ticker_upper}")

    try:
        # Phase 1: Fetch data
        self.update_state(state='PROGRESS', meta={
            'phase': 'fetching_data',
            'progress': {'generation': 0, 'total': 20, 'best_fitness': 0, 'elapsed': 0}
        })

        conn = get_celery_db_connection()
        try:
            # Get ticker_id
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT id, symbol FROM tickers WHERE UPPER(symbol) = %s LIMIT 1",
                    (ticker_upper,)
                )
                ticker_row = cursor.fetchone()
                if not ticker_row:
                    raise ValueError(f"Ticker {ticker_upper} not found in database")

                ticker_id = ticker_row['id']

            # Calculate start date (5 years ago)
            start_date = datetime.utcnow() - timedelta(days=365 * 5)

            # Use TimeframeDataAccessor to fetch hourly data
            accessor = TimeframeDataAccessor(conn)
            ohlc_data = accessor.fetch_ohlc(
                ticker_id=ticker_id,
                timeframe='1hour',
                start_date=start_date
            )

            if not ohlc_data:
                raise ValueError(f"No hourly data found for {ticker_upper}")

            if len(ohlc_data) < 500:
                raise ValueError(f"Insufficient data for {ticker_upper}: only {len(ohlc_data)} bars")

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

        finally:
            release_celery_db_connection(conn)

        logger.info(f"[Backtest {self.request.id}] Fetched {len(df)} bars for {ticker_upper}")

        # Phase 2: Compute indicators (only for standard mode)
        self.update_state(state='PROGRESS', meta={
            'phase': 'computing_indicators',
            'progress': {'generation': 0, 'total': 20, 'best_fitness': 0, 'elapsed': round(time.time() - start_time, 1)}
        })

        # Progress callback for optimizer
        def progress_callback(gen: int, total: int, best_fitness: float):
            """Called after each generation to update progress."""
            self.update_state(state='PROGRESS', meta={
                'phase': 'optimizing',
                'progress': {
                    'generation': gen,
                    'total': total,
                    'best_fitness': float(best_fitness) if not np.isinf(best_fitness) else 0,
                    'elapsed': round(time.time() - start_time, 1)
                }
            })

        def abort_check() -> bool:
            """Check if task was revoked (not fully supported in Celery)."""
            # Note: Celery task revocation during execution is limited
            # This is a placeholder for future implementation
            return False

        # Phase 3: Optimize
        self.update_state(state='PROGRESS', meta={
            'phase': 'optimizing',
            'progress': {'generation': 0, 'total': 20, 'best_fitness': 0, 'elapsed': round(time.time() - start_time, 1)}
        })

        if mode == 'advanced':
            # TPSL optimization
            logger.info(f"[Backtest {self.request.id}] Running advanced (TPSL) optimization")
            qiga_result, qiga_train, qiga_test, qiga_duration = run_tpsl_optimization_from_df(
                df,
                custom_rules,
                progress_callback=progress_callback,
                abort_check=abort_check
            )

            if qiga_result is None or qiga_train is None or qiga_test is None:
                raise ValueError("Advanced optimizer found no valid strategy. Try adjusting parameters.")

            # Build advanced payload
            payload = build_advanced_strategy_payload(
                qiga_result,
                qiga_train,
                qiga_test,
                qiga_duration,
            )
        else:
            # Standard GA optimization
            logger.info(f"[Backtest {self.request.id}] Running standard optimization")
            enhanced_df = compute_indicators_and_rules(df)
            logger.info(f"[Backtest {self.request.id}] Computed indicators, starting optimizer with {len(enhanced_df)} bars")

            qiga_result, qiga_duration, qiga_fitnesses, qiga_train, qiga_test = optimize_trading_strategy(
                enhanced_df,
                custom_rules=custom_rules,
                use_parallel=False,
                subsample_years=None,
                progress_callback=progress_callback,
                abort_check=abort_check
            )
            logger.info(f"[Backtest {self.request.id}] Optimizer completed in {qiga_duration:.1f}s")

            if qiga_result is None:
                raise ValueError("Unable to derive a valid strategy from the provided data.")

            # Build standard payload
            payload = build_strategy_payload(
                qiga_result,
                qiga_train,
                qiga_test,
                qiga_duration,
                qiga_fitnesses,
            )

        if payload is None:
            raise ValueError("Failed to prepare strategy response.")

        duration = round(time.time() - start_time, 1)
        logger.info(f"[Backtest {self.request.id}] Completed in {duration}s for {ticker_upper}")

        return {
            'status': 'complete',
            'result': payload,
            'duration': duration
        }

    except Exception as e:
        duration = round(time.time() - start_time, 1)
        logger.exception(f"[Backtest {self.request.id}] Failed for {ticker_upper}: {e}")
        return {
            'status': 'error',
            'error': str(e),
            'duration': duration
        }


@celery_app.task(bind=True, name='sentiment.analyze')
def run_sentiment_analysis_task(
    self,
    ticker: str,
    include_fundamentals: bool = True
):
    """
    Celery task for running sentiment analysis.

    Offloads ML inference to a dedicated worker process, keeping the main
    FastAPI server free to handle other requests.

    Uses self.update_state() to send progress updates that can be polled via SSE.

    Args:
        ticker: Stock ticker symbol (e.g., 'RELIANCE', 'TCS', 'AAPL')
        include_fundamentals: Whether to fetch stock fundamentals (default: True)

    Returns:
        dict with 'status', 'result' (or 'error'), and 'duration'
    """
    start_time = time.time()
    ticker_upper = ticker.upper().strip()
    logger.info(f"[Sentiment {self.request.id}] Starting analysis for {ticker_upper}")

    try:
        # Phase 1: Fetch articles
        self.update_state(state='PROGRESS', meta={
            'phase': 'fetching_articles',
            'progress': {'articles_fetched': 0, 'articles_analyzed': 0, 'total': 0},
            'elapsed': 0
        })

        articles = fetch_articles_for_celery(ticker_upper)
        total_articles = len(articles)

        logger.info(f"[Sentiment {self.request.id}] Fetched {total_articles} articles")

        self.update_state(state='PROGRESS', meta={
            'phase': 'analyzing_sentiment',
            'progress': {'articles_fetched': total_articles, 'articles_analyzed': 0, 'total': total_articles},
            'elapsed': round(time.time() - start_time, 1)
        })

        # Phase 2: Analyze sentiment for each article
        analyzed_articles = []
        for i, article in enumerate(articles):
            analyzed = analyze_article_sentiment_celery(article)
            analyzed_articles.append(analyzed)

            # Update progress every 3 articles or on last article
            if (i + 1) % 3 == 0 or i == total_articles - 1:
                self.update_state(state='PROGRESS', meta={
                    'phase': 'analyzing_sentiment',
                    'progress': {
                        'articles_fetched': total_articles,
                        'articles_analyzed': i + 1,
                        'total': total_articles
                    },
                    'elapsed': round(time.time() - start_time, 1)
                })

        logger.info(f"[Sentiment {self.request.id}] Analyzed {len(analyzed_articles)} articles")

        # Phase 3: Fetch fundamentals (optional)
        fundamentals = {}
        if include_fundamentals:
            self.update_state(state='PROGRESS', meta={
                'phase': 'fetching_fundamentals',
                'progress': {
                    'articles_fetched': total_articles,
                    'articles_analyzed': total_articles,
                    'total': total_articles
                },
                'elapsed': round(time.time() - start_time, 1)
            })

            fundamentals = get_fundamentals_for_celery(ticker_upper)
            logger.info(f"[Sentiment {self.request.id}] Fetched fundamentals")

        # Build result payload
        articles_payload = []
        for article in analyzed_articles:
            sentiment = article.get("sentiment", {})
            articles_payload.append({
                "title": article.get("title", ""),
                "desc": article.get("desc", ""),
                "date": article.get("date", ""),
                "link": article.get("link", "#"),
                "source": article.get("source", "GoogleNews"),
                "sentiment": {
                    "label": normalize_sentiment_label(sentiment.get("label", "")),
                    "score": float(sentiment.get("score", 0.5)) if sentiment.get("score") else 0.5
                }
            })

        duration = round(time.time() - start_time, 1)
        logger.info(f"[Sentiment {self.request.id}] Completed in {duration}s for {ticker_upper}")

        return {
            'status': 'complete',
            'result': {
                'ticker': ticker_upper,
                'articles': articles_payload,
                'fundamentals': fundamentals,
                'article_count': len(articles_payload),
                'cached': False
            },
            'duration': duration
        }

    except Exception as e:
        duration = round(time.time() - start_time, 1)
        logger.exception(f"[Sentiment {self.request.id}] Failed for {ticker_upper}: {e}")
        return {
            'status': 'error',
            'error': str(e),
            'duration': duration
        }


# =============================================================================
# Options Visualizer — ATM GxOI time-series recorder
# =============================================================================
# Beat fires every 60s during NSE market hours (see celery_config.py:
# beat_schedule['refresh-options-visualizer-60s']). The task short-circuits
# outside market hours so we don't waste NSE round-trips on weekends or
# overnight.
#
# Each tick fetches the live option chain, computes ATM GxOI via
# compute_exposures(), and rpush'es the {timestamp, atm_gxoi} point onto the
# per-day Redis list options_viz:timeseries:{SYMBOL}:{YYYY-MM-DD}. The list
# expires at next-market-open (TTL set inside append_atm_gxoi), so days
# rotate cleanly.
#
# The opportunistic per-request append in main.py:8929 stays untouched —
# duplicates are harmless (each rpush is keyed by a fresh timestamp), and
# it covers any window where Celery beat is briefly down.

import asyncio
import pytz

try:
    from option_chain_visualizer import (
        is_market_hours as _ovz_is_market_hours,
        compute_exposures as _ovz_compute_exposures,
        append_atm_gxoi as _ovz_append_atm_gxoi,
    )
    from option_chain_live import fetch_nse_index_option_chain as _ovz_fetch_chain
    _OVZ_AVAILABLE = True
except ImportError as _ovz_imp_err:
    _ovz_is_market_hours = None  # type: ignore
    _ovz_compute_exposures = None  # type: ignore
    _ovz_append_atm_gxoi = None  # type: ignore
    _ovz_fetch_chain = None  # type: ignore
    _OVZ_AVAILABLE = False
    logger.warning(
        "Options visualizer recorder disabled — import failed: %s", _ovz_imp_err
    )

_OVZ_IST = pytz.timezone("Asia/Kolkata")
_OVZ_SYMBOLS = ("NIFTY", "BANKNIFTY")


@celery_app.task(name="celery_tasks.refresh_options_visualizer")
def refresh_options_visualizer():
    """Periodic recorder — see comment block above for behavior."""
    if not _OVZ_AVAILABLE:
        return {"status": "disabled", "reason": "module_unavailable"}

    if not _ovz_is_market_hours():
        return {"status": "skipped", "reason": "market_closed"}

    now = datetime.now(_OVZ_IST)
    written = []
    errors = {}
    for symbol in _OVZ_SYMBOLS:
        try:
            chain = _ovz_fetch_chain(symbol, None)
            spot = chain.get("underlying", 0)
            if not spot:
                errors[symbol] = "no_spot"
                continue
            exposure = _ovz_compute_exposures(chain, spot)
            atm_gxoi = exposure.get("atm_gxoi")
            if atm_gxoi is None:
                errors[symbol] = "no_atm_gxoi"
                continue
            asyncio.run(_ovz_append_atm_gxoi(symbol, now, atm_gxoi))
            written.append(symbol)
        except Exception as e:
            errors[symbol] = str(e)
            logger.exception(
                "refresh_options_visualizer(%s) failed: %s", symbol, e
            )

    return {
        "status": "ok" if written else "error",
        "written": written,
        "errors": errors,
        "ts": now.isoformat(),
    }
