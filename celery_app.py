"""
Celery application configuration for Tiphub.

This module configures Celery for async task processing, primarily for
strategy backtesting which is CPU-intensive and should not block the
FastAPI event loop.

Usage:
    # Start worker (in separate terminal)
    celery -A celery_app worker --pool=solo --loglevel=info

    # Optional: Start Flower monitoring
    celery -A celery_app flower --port=5555
"""

import os
import sys
from pathlib import Path

# Ensure project root is in Python path (for Celery worker to find modules)
PROJECT_ROOT = Path(__file__).parent.resolve()
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from celery import Celery
from dotenv import load_dotenv

# Load appropriate .env file based on NODE_ENV
env_file = '.env.production' if os.getenv('NODE_ENV') == 'production' else '.env'
load_dotenv(env_file, override=True)

# Redis URL for broker and result backend
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')

# Create Celery app
celery_app = Celery(
    'tiphub',
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=['celery_tasks']  # Import tasks module
)

# Celery configuration
celery_app.conf.update(
    # Serialization
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',

    # Timezone
    timezone='UTC',
    enable_utc=True,

    # Task tracking
    task_track_started=True,  # Track when task starts (enables STARTED state)
    result_expires=7200,  # Results expire after 2 hours

    # Worker configuration
    worker_concurrency=2,  # Max 2 concurrent backtests (each uses ~1 CPU core)
    task_acks_late=True,  # Ack after task completes (crash recovery)
    worker_prefetch_multiplier=1,  # Don't prefetch tasks (ensures fair distribution)

    # Task execution
    task_time_limit=600,  # Hard limit: 10 minutes
    task_soft_time_limit=540,  # Soft limit: 9 minutes (raises SoftTimeLimitExceeded)

    # Result backend settings
    result_extended=True,  # Include task name and args in result
)


# Import worker_init to register signal handlers for preloading
# This must happen AFTER celery_app is created
try:
    import worker_init  # noqa: F401 - imported for side effects (signal registration)
    print("[Celery] Worker initialization signals registered")
except ImportError as e:
    print(f"[Celery] Warning: worker_init module not found: {e}")


# Export celery_app for use in tasks and main app
__all__ = ['celery_app', 'REDIS_URL']
