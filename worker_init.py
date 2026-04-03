"""
Worker initialization for Celery - preloads modules at startup.

This module registers Celery signal handlers that run when a worker starts,
BEFORE it accepts any tasks. This eliminates the cold-start delay that would
otherwise happen on the first task.

Import this module from celery_app.py to register the signals.
"""

import logging
from celery import signals

logger = logging.getLogger(__name__)


@signals.worker_init.connect
def on_worker_init(sender, **kwargs):
    """
    Called when worker process starts, BEFORE accepting tasks.

    Pre-imports heavy modules so first task doesn't pay import cost.
    """
    logger.info("[Worker] Preloading modules...")

    # Pre-import the celery_helpers module which contains all task dependencies
    # This triggers import of:
    # - Strat_optimizer_tpsl (indicator calculations, QIGA optimizer)
    # - db_timeframe_accessor (database access)
    # - psycopg2 (database driver)
    # - pandas, numpy (data processing)
    from celery_helpers import (
        compute_indicators_and_rules,
        optimize_trading_strategy,
        TimeframeDataAccessor,
        get_celery_db_connection,
        release_celery_db_connection,
        build_strategy_payload,
        build_advanced_strategy_payload,
        run_tpsl_optimization_from_df,
    )

    logger.info("[Worker] Core modules loaded")

    # Pre-warm database connection pool
    # This establishes connections before first task arrives
    try:
        conn = get_celery_db_connection()
        # Test connection
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        release_celery_db_connection(conn)
        logger.info("[Worker] Database pool pre-initialized and tested")
    except Exception as e:
        logger.warning(f"[Worker] DB pool pre-init failed (will retry on first task): {e}")

    logger.info("[Worker] Ready for tasks")


@signals.worker_ready.connect
def on_worker_ready(sender, **kwargs):
    """Called when worker is ready to accept tasks."""
    logger.info("[Worker] Worker is ready and accepting tasks")


@signals.worker_shutdown.connect
def on_worker_shutdown(sender, **kwargs):
    """Called when worker is shutting down."""
    logger.info("[Worker] Worker shutting down")
