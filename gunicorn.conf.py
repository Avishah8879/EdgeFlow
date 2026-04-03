"""
Gunicorn Configuration for Fin-Terminal FastAPI Backend

Optimized for 10,000+ concurrent users with uvicorn workers.
Run with: gunicorn main:app -c gunicorn.conf.py
"""

import os
import multiprocessing

# =============================================================================
# Server Socket
# =============================================================================

# Bind to Unix socket (for nginx) or TCP port
# Use Unix socket in production for better performance
bind = os.getenv("GUNICORN_BIND", "0.0.0.0:8100")

# Backlog - number of pending connections
backlog = 2048

# =============================================================================
# Worker Configuration
# =============================================================================

# Number of worker processes
# Formula: 2 * CPU cores + 1 for I/O-bound applications
default_workers = multiprocessing.cpu_count() * 2 + 1
workers = int(os.getenv("GUNICORN_WORKERS", default_workers))

# Worker class - uvicorn for async support
worker_class = "uvicorn.workers.UvicornWorker"

# Worker connections (for gevent/eventlet, not used with uvicorn)
# worker_connections = 1000

# Threads per worker (only for sync workers)
# threads = 1

# =============================================================================
# Timeouts
# =============================================================================

# Worker timeout for response (seconds)
# Set high for SSE connections
timeout = 120

# Graceful shutdown timeout
graceful_timeout = 30

# Keep-alive timeout (slightly longer than nginx)
keepalive = 65

# =============================================================================
# Worker Lifecycle
# =============================================================================

# Maximum requests per worker before restart (prevents memory leaks)
max_requests = 1000

# Add randomness to max_requests to prevent all workers restarting simultaneously
max_requests_jitter = 50

# Preload app for memory efficiency (shares code across workers)
preload_app = True

# =============================================================================
# Logging
# =============================================================================

# Access log
accesslog = os.getenv("GUNICORN_ACCESS_LOG", "-")  # "-" = stdout

# Error log
errorlog = os.getenv("GUNICORN_ERROR_LOG", "-")  # "-" = stderr

# Log level
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")

# Access log format (similar to nginx combined format)
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# =============================================================================
# Process Naming
# =============================================================================

proc_name = "fin-terminal-python"

# =============================================================================
# Server Mechanics
# =============================================================================

# Daemonize the process (run in background)
daemon = False

# PID file
pidfile = os.getenv("GUNICORN_PID_FILE", None)

# User/group to run as (for production)
# user = "www-data"
# group = "www-data"

# Working directory
chdir = os.path.dirname(os.path.abspath(__file__))

# Temp directory
# tmp_upload_dir = None

# =============================================================================
# Security
# =============================================================================

# Limit request line size (prevents DoS)
limit_request_line = 4094

# Limit request fields
limit_request_fields = 100

# Limit request field size
limit_request_field_size = 8190

# =============================================================================
# SSL (if not using nginx for SSL termination)
# =============================================================================

# keyfile = None
# certfile = None
# ssl_version = 2
# cert_reqs = 0
# ca_certs = None
# suppress_ragged_eofs = True
# do_handshake_on_connect = False

# =============================================================================
# Hooks
# =============================================================================

def on_starting(server):
    """Called when gunicorn starts."""
    print(f"[Gunicorn] Starting with {workers} workers")


def on_reload(server):
    """Called when gunicorn receives SIGHUP."""
    print("[Gunicorn] Reloading workers")


def worker_int(worker):
    """Called when worker receives SIGINT."""
    print(f"[Gunicorn] Worker {worker.pid} interrupted")


def worker_abort(worker):
    """Called when worker receives SIGABRT."""
    print(f"[Gunicorn] Worker {worker.pid} aborted")


def pre_fork(server, worker):
    """Called before worker is forked."""
    pass


def post_fork(server, worker):
    """Called after worker is forked."""
    print(f"[Gunicorn] Worker {worker.pid} spawned")


def pre_exec(server):
    """Called before new master process is forked."""
    print("[Gunicorn] Pre-exec (new master)")


def child_exit(server, worker):
    """Called when worker exits."""
    print(f"[Gunicorn] Worker {worker.pid} exited")


def worker_exit(server, worker):
    """Called after worker exits."""
    pass
