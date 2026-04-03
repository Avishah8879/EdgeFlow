# DEPLOYMENT.md

> Deployment and operations guide for Tiphub. Extracted from CLAUDE.md to keep the main project documentation focused on development.

## Running the Application (4 Terminals Required)

This application requires **4 separate processes** running simultaneously for full functionality:

**Terminal 1: Redis Server** (required for Celery task queue + caching)
```bash
# Docker (recommended for Windows/Mac)
docker run -d --name redis -p 6379:6379 redis:alpine

# Or native Redis (Linux)
redis-server

# Verify Redis is running
redis-cli ping  # Should return PONG
```

**Terminal 2: Node.js Backend** (serves frontend + auth API)
```bash
# Development
npm run dev

# Production
npm run build && npm run start
```

**Terminal 3: Python Backend** (FastAPI + data API + ML processing)
```bash
# Development (Windows - single process, no workers)
uv run main.py

# Production (Linux/EC2 - use workers matching vCPU count)
# IMPORTANT: Set UVICORN_WORKERS env var to match --workers flag
# This controls DB pool sizing (total pool divided by worker count)
uvicorn main:app --host 0.0.0.0 --port 7860 --workers $UVICORN_WORKERS
```

**Terminal 4: Celery Worker** (async task processing for backtesting)
```bash
# Start worker
celery -A celery_app worker --pool=solo --loglevel=info

# Optional: Flower monitoring UI at http://localhost:5555
celery -A celery_app flower --port=5555
```

**Quick Start (Development):**
```bash
# Terminal 1: Start Redis
docker run -d --name redis -p 6379:6379 redis:alpine

# Terminal 2: Start Node backend (wait for "serving on port 5000")
npm run dev

# Terminal 3: Start Python backend (wait for "Uvicorn running on http://0.0.0.0:7860")
uv run main.py

# Terminal 4: Start Celery worker (wait for "celery@hostname ready")
celery -A celery_app worker --pool=solo --loglevel=info
```

## Production Mode

**PowerShell (Windows):**
```powershell
# Build frontend first
npm run build

# Terminal 1: Redis (Docker Desktop must be running)
docker run -d --name redis -p 6379:6379 redis:alpine

# Terminal 2: Node backend
$env:NODE_ENV="production"; npm run start

# Terminal 3: Python backend (Windows: single process, no workers)
$env:NODE_ENV="production"; uv run main.py

# Terminal 4: Celery worker
$env:NODE_ENV="production"; celery -A celery_app worker --pool=solo --loglevel=info
```

**Bash (Linux/EC2):**
```bash
# Build frontend first
npm run build

# Terminal 1: Redis
redis-server  # Or: docker run -d --name redis -p 6379:6379 redis:alpine

# Terminal 2: Node backend
NODE_ENV=production npm run start

# Terminal 3: Python backend (use workers matching vCPU count)
# m5.large = 2 vCPUs → UVICORN_WORKERS=2
# IMPORTANT: UVICORN_WORKERS must match --workers flag for DB pool sizing
NODE_ENV=production UVICORN_WORKERS=2 uv run uvicorn main:app --host 0.0.0.0 --port 7860 --workers 2

# Terminal 4: Celery worker (prefork for CPU-bound tasks, concurrency=1 to leave CPU for APIs)
NODE_ENV=production uv run celery -A celery_app worker --pool=prefork --concurrency=1 --loglevel=info
```

## EC2 Production Setup with tmux

**Prerequisites:**
```bash
# Install Redis
sudo apt update && sudo apt install redis-server -y

# Configure Redis for production (edit /etc/redis/redis.conf)
# Add these lines:
#   supervised systemd
#   maxmemory 1gb
#   maxmemory-policy allkeys-lru

# Start and enable Redis
sudo systemctl restart redis-server
sudo systemctl enable redis-server

# Verify Redis
redis-cli ping  # Should return PONG
redis-cli CONFIG GET maxmemory  # Should show 1073741824 (1GB)
```

**tmux One-Liner (starts all 4 services):**
```bash
tmux kill-server 2>/dev/null; tmux new -s tiphub \; \
  send-keys 'cd ~/Tiphub && NODE_ENV=production npm run start' Enter \; \
  split-window -h \; \
  send-keys 'cd ~/Tiphub && NODE_ENV=production UVICORN_WORKERS=2 uv run uvicorn main:app --host 0.0.0.0 --port 7860 --workers 2' Enter \; \
  split-window -v \; \
  send-keys 'cd ~/Tiphub && NODE_ENV=production uv run celery -A celery_app worker --pool=prefork --concurrency=1 --loglevel=info' Enter \; \
  select-pane -t 0 \; \
  split-window -v \; \
  send-keys 'htop' Enter
```

**tmux Layout:**
```
┌─────────────────┬─────────────────┐
│  Node (npm)     │  Python (uvi)   │
├─────────────────┼─────────────────┤
│  htop           │  Celery         │
└─────────────────┴─────────────────┘
```

**tmux Step-by-Step (alternative):**
```bash
# 1. Create session
tmux new -s tiphub

# 2. Pane 1 - Node backend
cd ~/Tiphub && NODE_ENV=production npm run start

# 3. Split right: Ctrl+b then %
# Pane 2 - Python backend
cd ~/Tiphub && NODE_ENV=production UVICORN_WORKERS=2 uv run uvicorn main:app --host 0.0.0.0 --port 7860 --workers 2

# 4. Split down: Ctrl+b then "
# Pane 3 - Celery worker
cd ~/Tiphub && NODE_ENV=production uv run celery -A celery_app worker --pool=prefork --concurrency=1 --loglevel=info

# 5. Go to pane 1: Ctrl+b then arrow keys, split down: Ctrl+b then "
# Pane 4 - Monitoring
htop
```

**tmux Controls:**
| Key | Action |
|-----|--------|
| `Ctrl+b` then arrow | Switch panes |
| `Ctrl+b` then `d` | Detach (keeps running) |
| `tmux attach -t tiphub` | Reattach |
| `Ctrl+b` then `z` | Zoom current pane |
| `Ctrl+b` then `%` | Split vertical |
| `Ctrl+b` then `"` | Split horizontal |

**Verify Services:**
```bash
curl http://localhost:5000    # Node
curl http://localhost:7860    # Python
redis-cli ping                # Redis
ps aux | grep -E "node|uvicorn|celery"
```

## EC2 Production Setup with PM2 (Recommended)

PM2 provides process management, auto-restart, log rotation, and boot persistence. Use `scripts/deploy.sh` for easy management.

**First-time Setup:**
```bash
cd ~/Tiphub
chmod +x scripts/deploy.sh

# Install dependencies (Node, nginx, Redis, PM2, uv)
./scripts/deploy.sh install

# Configure PM2, nginx, log rotation, build app
./scripts/deploy.sh setup

# Start all services
./scripts/deploy.sh start
```

**Daily Operations:**
```bash
./scripts/deploy.sh status    # Check all services + health checks
./scripts/deploy.sh logs      # Interactive log viewer (8 options)
./scripts/deploy.sh restart   # Restart all services
./scripts/deploy.sh update    # Git pull + rebuild + restart
```

**PM2 Commands (direct access):**
```bash
pm2 status                    # Service status table
pm2 logs                      # All logs (live)
pm2 logs tiphub-node          # Specific service logs
pm2 monit                     # Real-time CPU/Memory dashboard
pm2 restart tiphub-python     # Restart specific service
pm2 save                      # Persist process list for reboot
```

**Log File Locations:**
| Service | Log Files |
|---------|-----------|
| Redis | `logs/redis-{out,error,combined}.log` |
| Node.js | `logs/node-{out,error,combined}.log` |
| Python | `logs/python-{out,error,combined}.log` |
| Celery | `logs/celery-{out,error,combined}.log` |
| Nginx | `/var/log/nginx/tiphub-{access,error}.log` |

**Log Rotation:**
- PM2 logs: 50MB max, 30 files retained, gzip compressed (pm2-logrotate)
- Nginx logs: Daily rotation, 30 days retained (system logrotate)

## EC2 Instance Sizing Guide

| Instance | vCPUs | RAM | UVICORN_WORKERS | Celery Concurrency |
|----------|-------|-----|-----------------|-------------------|
| t3.micro | 2 | 1GB | 1 | 1 (solo pool) |
| t3.small | 2 | 2GB | 1 | 1 |
| m5.large | 2 | 8GB | 2 | 1 (prefork) |
| m5.xlarge | 4 | 16GB | 3-4 | 2 (prefork) |

**Note:** Celery concurrency=1 on m5.large leaves CPU headroom for API endpoints during backtests.

## Production Deployment & CORS Configuration

### Understanding CORS

**CORS (Cross-Origin Resource Sharing)** is a browser security mechanism that controls which origins can access your API.

**Key Concept:** The `Origin` header sent by the browser is **always the URL where the page loaded FROM** (the frontend URL), NOT the URL being called TO (the backend URL).

**Example:**
- User loads frontend from: `https://abc123.ngrok-free.app`
- Frontend calls API at: `https://xyz456.ngrok-free.app/api/stocks`
- Browser sends: `Origin: https://abc123.ngrok-free.app` (frontend URL)
- Backend checks if `https://abc123.ngrok-free.app` is in `CORS_ORIGINS`

### CORS_ORIGINS Configuration

**IMPORTANT:** `CORS_ORIGINS` should **only** list frontend origins (where users load the app from), NOT backend URLs.

**Correct Configuration:**
```bash
# .env.production
CORS_ORIGINS=http://localhost:5173,https://your-frontend-ngrok-url.ngrok-free.app
```

**Incorrect Configuration:**
```bash
# DON'T DO THIS - backend URLs not needed in CORS_ORIGINS
CORS_ORIGINS=https://python-backend.ngrok-free.app,https://node-backend.ngrok-free.app
```

**Why backend URLs aren't needed:**
- Browser never sends backend URLs as `Origin` header
- Adding them doesn't break anything but serves no purpose
- Only frontend origins (where browser loads the page) need to be listed

**Wildcard CORS (`*`):**
```bash
CORS_ORIGINS=*  # Works but NOT recommended
```
- Allows all origins (security risk in production)
- Cannot be used with `credentials: true`
- Use explicit origins instead for better security

### Environment File Management

This project uses **two separate environment files**:

**1. `.env` (Development)**
- Used during local development
- Loaded automatically by `tsx` in dev mode
- Contains localhost URLs

**2. `.env.production` (Production/Remote)**
- Used for production builds and remote testing (ngrok)
- Must be explicitly loaded by dotenv
- Contains ngrok/production URLs

**Vite Environment Loading:**

Vite looks for `.env` files in **project root** (not `client/`). Environment variables are bundled at **BUILD time**. After changing `.env.production`, rebuild:

```bash
npm run build
```

### dotenv Configuration

Both backends load `.env` in development or `.env.production` when `NODE_ENV=production`. Check startup logs for `[ENV] Loaded environment from:` to verify correct file is loaded.

### Production Deployment with ngrok

**1. Setup ngrok Tunnels**

Forward both backend ports:
```bash
# Terminal 1: Forward Node.js backend (serves frontend + auth API)
ngrok http 5000
# Note the URL: https://abc123.ngrok-free.app

# Terminal 2: Forward Python backend (data API)
ngrok http 7860
# Note the URL: https://xyz456.ngrok-free.app
```

**2. Update .env.production**

```bash
# Frontend URLs (for API calls)
VITE_GRADIO_BASE_URL=https://xyz456.ngrok-free.app
VITE_AUTH_BASE_URL=https://abc123.ngrok-free.app

# CORS Configuration (FRONTEND origins only!)
CORS_ORIGINS=http://localhost:5173,https://abc123.ngrok-free.app

# Node environment
NODE_ENV=production
```

**3. Rebuild Frontend**

Vite bundles env vars at build time:
```bash
npm run build
```

**4. Start Backends with NODE_ENV**

**PowerShell (Windows):**
```powershell
# Terminal 1: Node backend
$env:NODE_ENV="production"; npm run start

# Terminal 2: Python backend
$env:NODE_ENV="production"; uv run main.py
```

**Bash (Linux/Mac):**
```bash
# Terminal 1: Node backend
NODE_ENV=production npm run start

# Terminal 2: Python backend
NODE_ENV=production uvicorn main:app --reload
```

**5. Access Application**

Open the Node backend ngrok URL in browser:
```
https://abc123.ngrok-free.app
```

### CORS Implementation

Both backends use matching CORS configuration via `CORS_ORIGINS` env var.
- See `server/index.ts` (Node) and `main.py` (Python) for implementation
- `credentials: false` (token-based auth, not cookies)
- Requests without origin (Postman, curl) are allowed

### Troubleshooting

**Issue: "Failed to fetch" or CORS errors**
- Check `CORS_ORIGINS` contains the frontend URL (where browser loads page from)
- Verify both backends loaded `.env.production` (check startup logs)
- Ensure `NODE_ENV=production` is set in BOTH terminal sessions
- Rebuild frontend after changing env vars (`npm run build`)

**Issue: Frontend still has localhost URLs after build**
- Check `vite.config.ts` has `envDir: path.resolve(import.meta.dirname)`
- Verify `.env.production` is in project root (not `client/` folder)
- Remove `.env` file temporarily to force Vite to use `.env.production`
- Rebuild: `npm run build`

**Issue: Backend not loading .env.production**
- Verify `NODE_ENV=production` is set in the terminal
- Check startup logs for `[ENV] Loaded environment from: .env.production`
- Note: `NODE_ENV` is terminal-specific, not global

**Issue: CORS credentials mismatch**
- Ensure both backends have `credentials: false` (or both `true` if using cookies)
- Mismatched settings will cause browser to block all cross-origin requests

**Issue: PostgreSQL "FATAL: sorry, too many clients already"**
- Cause: Running uvicorn with `--workers N` creates N processes, each opening DB pool connections
- Each worker opens `minconn` connections on startup (default 50 x N workers = exhausted pool)
- Solution 1: Set `UVICORN_WORKERS` env var to match `--workers` flag (pool is divided by worker count)
- Solution 2: Increase PostgreSQL `max_connections` to at least 400
- Check startup logs for `[DB Pool] Workers=N, minconn=X, maxconn=Y` to verify pool sizing
- Windows: Use single process (no `--workers` flag), set `UVICORN_WORKERS=1`

### EC2/Linux Production Deployment (Recommended)

For production deployment on EC2 or any Linux server with systemd and PM2:

**Instance Sizing & Worker Configuration:**
| Instance Type | vCPUs | UVICORN_WORKERS | DB Pool (per worker) | Total Connections |
|--------------|-------|-----------------|---------------------|-------------------|
| t3.micro     | 2     | 1               | 50 min / 300 max    | ~350              |
| t3.small     | 2     | 2               | 25 min / 150 max    | ~350              |
| m5.large     | 2     | 2               | 25 min / 150 max    | ~350              |
| t3.xlarge    | 4     | 4               | 12 min / 75 max     | ~350              |

**PostgreSQL Requirement:** `max_connections >= 400` (default is 100, must be increased)

**1. Install Prerequisites**

```bash
# Node.js (via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20

# Python (via pyenv or system)
sudo apt update && sudo apt install python3.11 python3.11-venv

# Redis
sudo apt install redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server

# PM2 (for Node.js process management)
npm install -g pm2
```

**2. Configure PostgreSQL max_connections**

```bash
# Connect to PostgreSQL and check current setting
psql -h YOUR_DB_HOST -U postgres -d Tiphub -c "SHOW max_connections;"

# If less than 400, update postgresql.conf:
# max_connections = 400
# Then restart PostgreSQL
```

**3. Create Celery Systemd Service**

Create `/etc/systemd/system/tiphub-celery.service` with `User=ubuntu`, `WorkingDirectory=/home/ubuntu/Tiphub`, `ExecStart=celery -A celery_app worker --pool=solo`, and `Restart=always`.

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable tiphub-celery
sudo systemctl start tiphub-celery
sudo systemctl status tiphub-celery  # Verify running
```

**4. Configure PM2 for Node and Python**

```bash
# Start Node.js backend
cd /home/ubuntu/Tiphub
npm run build
pm2 start npm --name "tiphub-node" -- run start

# Start Python backend with workers (m5.large example: 2 workers)
# IMPORTANT: UVICORN_WORKERS env var must match --workers flag
pm2 start "UVICORN_WORKERS=2 uvicorn main:app --host 0.0.0.0 --port 7860 --workers 2" \
    --name "tiphub-python" --cwd /home/ubuntu/Tiphub

# Save PM2 configuration
pm2 save

# Configure PM2 to start on boot
pm2 startup
# Run the command it outputs (e.g., sudo env PATH=...)
```

**5. Verify All Services**

```bash
# Check Redis
redis-cli ping  # Should return PONG

# Check PM2 processes
pm2 status

# Check Celery worker
sudo systemctl status tiphub-celery

# Check logs (verify DB pool sizing in Python startup)
pm2 logs tiphub-node
pm2 logs tiphub-python  # Should show "[DB Pool] Workers=2, minconn=25, maxconn=150"
sudo journalctl -u tiphub-celery -f
```

**6. Nginx Reverse Proxy (Optional)**

For production with SSL:
- Route `/` to Node backend (localhost:5000)
- Route `/api/` to Python backend (localhost:7860)
- SSE endpoints need `proxy_buffering off` and `chunked_transfer_encoding off`
- Use Let's Encrypt for SSL certificates
