"""
Celery configuration for Fin-Terminal background tasks.

Uses Redis as both broker and result backend with separate databases
for isolation. All settings are configurable via environment variables.
"""

import os
import platform
from celery.schedules import crontab
from kombu import Queue

# Detect if running on Windows
IS_WINDOWS = platform.system() == "Windows"

# =============================================================================
# Broker and Backend Configuration
# =============================================================================

# Redis URLs - use separate databases for broker and results
broker_url = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1")
result_backend = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")

# =============================================================================
# Task Settings
# =============================================================================

# Serialization
task_serializer = "json"
result_serializer = "json"
accept_content = ["json"]

# Timezone
timezone = "Asia/Kolkata"
enable_utc = True

# Task execution settings
task_acks_late = True  # Acknowledge after task completes (reliability)
task_reject_on_worker_lost = True  # Requeue if worker dies
task_time_limit = 600  # Hard limit: 10 minutes
# Soft timeouts use SIGUSR1 which doesn't exist on Windows
task_soft_time_limit = None if IS_WINDOWS else 540

# Result settings
result_expires = 3600  # Results expire after 1 hour
result_extended = True  # Store task metadata (runtime, retries, etc.)

# =============================================================================
# Worker Configuration
# =============================================================================

# Concurrency (number of worker processes/threads)
# On Windows, use threads pool with configurable concurrency
# On Linux/macOS, use prefork for better CPU utilization
worker_concurrency = int(os.getenv("CELERY_WORKER_CONCURRENCY", "4" if IS_WINDOWS else "8"))

# Prefetch multiplier (tasks per worker)
# Higher value for production to reduce Redis round-trips
worker_prefetch_multiplier = int(os.getenv("CELERY_PREFETCH_MULTIPLIER", "4"))

# Worker pool type
# On Windows, prefork has permission issues, use 'threads' for concurrency
# - threads: uses threading, good for I/O-bound tasks (works on Windows)
# - prefork: multiprocessing, best for Linux/macOS (CPU-bound tasks)
# - solo: single-threaded, only for debugging
worker_pool = "threads" if IS_WINDOWS else "prefork"

# Worker max tasks before restart (prevents memory leaks)
# Only applicable for prefork pool
worker_max_tasks_per_child = None if IS_WINDOWS else 100

# =============================================================================
# Queue Configuration
# =============================================================================

# Define task queues
task_queues = (
    Queue("default", routing_key="default"),
    Queue("heavy", routing_key="heavy"),  # CPU-intensive tasks (screener, RRG)
    Queue("periodic", routing_key="periodic"),  # Scheduled tasks
)

# Default queue
task_default_queue = "default"
task_default_routing_key = "default"

# Route tasks to appropriate queues
task_routes = {
    "sentiment.analyze": {"queue": "default"},
    "backtest.run": {"queue": "default"},
    "celery_tasks.run_equity_screener": {"queue": "heavy"},
    "celery_tasks.generate_rrg_data": {"queue": "heavy"},
    "celery_tasks.warm_ohlcv_cache": {"queue": "heavy"},
    "celery_tasks.full_prewarm": {"queue": "heavy"},
    "celery_tasks.refresh_options_visualizer": {"queue": "periodic"},
    "celery_tasks.snapshot_options_oi": {"queue": "periodic"},
}

# =============================================================================
# Beat Schedule (Periodic Tasks)
# =============================================================================

# Only enable beat schedule if CELERY_BEAT_ENABLED is true
beat_schedule_enabled = os.getenv("CELERY_BEAT_ENABLED", "false").lower() == "true"

beat_schedule = {}

if beat_schedule_enabled:
    beat_schedule = {
        # =====================================================================
        # HOT DATA - Refresh frequently during market hours
        # =====================================================================

        # Options Visualizer ATM-GxOI recorder — every 60 seconds.
        # Fires whether or not any user has the page open, so the time-series
        # subplot can show the entire trading day (09:15–15:30 IST) on first
        # user load. Implemented in celery_tasks.refresh_options_visualizer;
        # task itself short-circuits outside market hours.
        "refresh-options-visualizer-60s": {
            "task": "celery_tasks.refresh_options_visualizer",
            "schedule": 60.0,
            "options": {"queue": "periodic", "expires": 59},
        },

        # Options Chain OI snapshot — every 5 minutes.
        # Powers the "OI Δ" column on /options. Each tick rotates the
        # :current snapshot in Redis to :previous and writes a fresh
        # :current; main.py:/api/options reads :previous to compute
        # 5-minute deltas per strike. Task short-circuits outside
        # market hours.
        "snapshot-options-oi-5min": {
            "task": "celery_tasks.snapshot_options_oi",
            "schedule": 300.0,
            "options": {"queue": "periodic", "expires": 290},
        },

        # =====================================================================
        # WARM DATA - Refresh less frequently
        # =====================================================================

        # =====================================================================
        # COLD DATA - Daily/periodic warming
        # =====================================================================

        # Full prewarm - before market open
        "full-prewarm-morning": {
            "task": "celery_tasks.full_prewarm",
            "schedule": crontab(hour=8, minute=30),  # 8:30 AM IST
            "options": {"queue": "heavy"},
        },

        # Full prewarm - after market close
        "full-prewarm-evening": {
            "task": "celery_tasks.full_prewarm",
            "schedule": crontab(hour=16, minute=0),  # 4:00 PM IST
            "options": {"queue": "heavy"},
        },

        # OHLCV cache refresh - after market close (historical data update)
        "warm-ohlcv-cache-evening": {
            "task": "celery_tasks.warm_ohlcv_cache",
            "schedule": crontab(hour=16, minute=30),  # 4:30 PM IST
            "options": {"queue": "heavy"},
        },

        # =====================================================================
        # DEPTH PERSISTENCE (COMMENTED OUT - Enable when market_depth table ready)
        # =====================================================================
        # Uncomment when database is ready to receive depth snapshots:
        #
        # "persist-depth-snapshots-30s": {
        #     "task": "celery_tasks.persist_all_depth_snapshots",
        #     "schedule": 30.0,
        #     "options": {"queue": "periodic", "expires": 29},
        # },
    }

# =============================================================================
# Retry Settings
# =============================================================================

# Default retry policy
task_default_retry_delay = 10  # 10 seconds
task_max_retries = 3

# Exponential backoff for retries
task_retry_backoff = True
task_retry_backoff_max = 600  # Max 10 minutes between retries
task_retry_jitter = True  # Add randomness to prevent thundering herd

# =============================================================================
# Monitoring
# =============================================================================

# Enable task events for Flower monitoring
worker_send_task_events = True
task_send_sent_event = True

# =============================================================================
# Security
# =============================================================================

# Restrict accepted serializers
accept_content = ["json"]

# Disable remote control (security)
worker_enable_remote_control = False
