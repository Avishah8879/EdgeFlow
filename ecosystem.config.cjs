// PM2 Ecosystem Configuration for Tiphub
// Usage: pm2 start ecosystem.config.cjs

module.exports = {
  apps: [
    // Redis Server (PM2 managed instead of systemd)
    {
      name: 'tiphub-redis',
      script: 'redis-server',
      args: '--bind 127.0.0.1 --maxmemory 1gb --maxmemory-policy allkeys-lru',
      cwd: '/home/ubuntu/Tiphub',
      instances: 1,
      exec_mode: 'fork',
      // Logging
      out_file: './logs/redis-out.log',
      error_file: './logs/redis-error.log',
      log_file: './logs/redis-combined.log',
      time: true,
      merge_logs: true,
      // Auto-restart
      watch: false,
      autorestart: true,
      max_memory_restart: '1200M',
      restart_delay: 1000,
      max_restarts: 10,
    },

    // Node.js Backend (serves frontend + auth API)
    {
      name: 'tiphub-node',
      script: 'dist/index.js',
      cwd: '/home/ubuntu/Tiphub',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      // Logging
      out_file: './logs/node-out.log',
      error_file: './logs/node-error.log',
      log_file: './logs/node-combined.log',
      time: true,
      merge_logs: true,
      // Auto-restart
      watch: false,
      autorestart: true,
      max_memory_restart: '500M',
      restart_delay: 5000,
      max_restarts: 10,
    },

    // Python FastAPI Backend (uvicorn with 2 workers for m5.large)
    {
      name: 'tiphub-python',
      script: '/home/ubuntu/.local/bin/uv',
      args: 'run uvicorn main:app --host 0.0.0.0 --port 7860 --workers 2',
      cwd: '/home/ubuntu/Tiphub',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        UVICORN_WORKERS: '2',
        PYTHON_PORT: '7860'
      },
      // Logging
      out_file: './logs/python-out.log',
      error_file: './logs/python-error.log',
      log_file: './logs/python-combined.log',
      time: true,
      merge_logs: true,
      // Auto-restart
      watch: false,
      autorestart: true,
      max_memory_restart: '1G',
      restart_delay: 5000,
      max_restarts: 10,
    },

    // Celery Worker (async task processing for backtesting)
    {
      name: 'tiphub-celery',
      script: '/home/ubuntu/.local/bin/uv',
      args: 'run celery -A celery_app worker --pool=prefork --concurrency=1 --loglevel=info',
      cwd: '/home/ubuntu/Tiphub',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },
      // Logging
      out_file: './logs/celery-out.log',
      error_file: './logs/celery-error.log',
      log_file: './logs/celery-combined.log',
      time: true,
      merge_logs: true,
      // Auto-restart
      watch: false,
      autorestart: true,
      max_memory_restart: '800M',
      restart_delay: 5000,
      max_restarts: 10,
    }
  ]
};
