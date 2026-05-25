# EquityPro — IIS Windows Server Deployment Guide

## Server Info

- **IP:** 164.52.192.245
- **OS:** Windows Server (IIS)
- **Architecture:** IIS → Reverse Proxy → Node.js + Python + Redis

> **SECURITY:** Never store passwords in docs/code. Use Windows Credential Manager or environment variables.

---

## Architecture Overview

```
Internet
    │
    ▼
┌─────────────────────────────────────────────┐
│  IIS (Port 80/443)                          │
│  ├── URL Rewrite + ARR (Reverse Proxy)      │
│  ├── SSL Termination (Let's Encrypt)        │
│  └── Static file caching + Gzip             │
│                                             │
│  ┌──────────────┐    ┌──────────────────┐   │
│  │ Node.js      │    │ Python/FastAPI   │   │
│  │ Port 3000    │    │ Port 8100        │   │
│  │ (Express +   │    │ (Uvicorn workers)│   │
│  │  Frontend)   │    │                  │   │
│  └──────┬───────┘    └────────┬─────────┘   │
│         │                     │             │
│         └──────┬──────────────┘             │
│                ▼                            │
│  ┌──────────────────────────────────────┐   │
│  │ Redis (Port 6379)                    │   │
│  │  - Caching (TTL-based)              │   │
│  │  - Celery broker                    │   │
│  │  - Depth data pub/sub              │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │ Background Services                  │   │
│  │  - Celery Worker (ML tasks)         │   │
│  │  - Depth Ingester (Fyers TBT)       │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
        │
        ▼
External PostgreSQL (13.205.4.69:5432)
```

---

## Step-by-Step Setup

### 1. Prerequisites — Install on Windows Server

#### Node.js (LTS)
```powershell
# Download and install Node.js 22 LTS
winget install OpenJS.NodeJS.LTS
# Verify
node -v   # v22.x.x
npm -v
```

#### Python 3.13+
```powershell
winget install Python.Python.3.13
# Verify
python --version
```

#### UV (Python package manager)
```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

#### Redis for Windows (Memurai or Redis Windows port)
```powershell
# Option A: Memurai (recommended, production-grade Redis for Windows)
# Download from https://www.memurai.com/get-memurai
# Install as Windows Service

# Option B: Redis via WSL2 (if available)
wsl --install
wsl sudo apt update && sudo apt install redis-server
wsl sudo service redis-server start
```

#### IIS + Required Modules
```powershell
# Enable IIS via Server Manager or:
Install-WindowsFeature -Name Web-Server -IncludeManagementTools
Install-WindowsFeature -Name Web-WebSockets

# Install URL Rewrite Module
# Download: https://www.iis.net/downloads/microsoft/url-rewrite

# Install Application Request Routing (ARR)
# Download: https://www.iis.net/downloads/microsoft/application-request-routing
```

#### NSSM (Non-Sucking Service Manager) — runs Node/Python as Windows Services
```powershell
# Download from https://nssm.cc/download
# Extract nssm.exe to C:\tools\nssm\
# Add to PATH
```

---

### 2. Deploy Application Code

```powershell
# Clone repository
cd C:\
git clone https://github.com/Acequant-Research-Tech/Edgeflow-Latest.git EquityPro
cd C:\EquityPro

# Checkout release branch
git checkout release/v2.0

# Install Node.js dependencies
npm ci --production

# Build frontend + backend
npm run build

# Install Python dependencies
uv sync

# Force install fyers-apiv3 (has strict dep conflicts with uv)
.venv\Scripts\python.exe -m ensurepip
.venv\Scripts\python.exe -m pip install fyers-apiv3==3.1.11 --no-deps
```

---

### 3. Environment Configuration

Create `C:\EquityPro\.env.production`:

```env
# Node.js
PORT=3000
NODE_ENV=production

# Python
PYTHON_PORT=8100
PYTHON_API_URL=http://localhost:8100
VITE_GRADIO_BASE_URL=http://localhost:8100
VITE_AUTH_BASE_URL=http://localhost:3000

# Database (external)
DB_HOST=13.205.4.69
DB_PORT=5432
DB_NAME=Tiphub
DB_USER=postgres
DB_PASSWORD=<your_db_password>

# Auth Database
AUTH_DB_HOST=13.205.4.69
AUTH_DB_PORT=5432
AUTH_DB_NAME=Tiphub
AUTH_DB_USER=postgres
AUTH_DB_PASSWORD=<your_db_password>
DATABASE_URL=postgresql://postgres:<password>@13.205.4.69:5432/Tiphub

# Redis
REDIS_URL=redis://localhost:6379
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2

# CORS (your domain)
CORS_ORIGINS=https://yourdomain.com,http://164.52.192.245

# JWT
JWT_SECRET=<generate-a-strong-random-string-64-chars>
JWT_ACCESS_EXPIRY=6h
JWT_REFRESH_EXPIRY=7d

# Fyers (Order Book)
FYERS_APP_ID=GK1YZT7V2P-100
FYERS_SECRET_KEY=<your_secret>
FYERS_TOKEN_PATH=C:\EquityPro\fyers_token.json

# Uvicorn workers (2 * CPU cores + 1)
UVICORN_WORKERS=9  # For 4-core server
```

---

### 4. Register Windows Services (via NSSM)

#### Service 1: Node.js (Express + Frontend)
```powershell
nssm install EquityPro-Node "C:\Program Files\nodejs\node.exe"
nssm set EquityPro-Node AppParameters "dist\index.js"
nssm set EquityPro-Node AppDirectory "C:\EquityPro"
nssm set EquityPro-Node AppEnvironmentExtra "NODE_ENV=production" "PORT=3000"
nssm set EquityPro-Node AppStdout "C:\EquityPro\logs\node-stdout.log"
nssm set EquityPro-Node AppStderr "C:\EquityPro\logs\node-stderr.log"
nssm set EquityPro-Node AppRotateFiles 1
nssm set EquityPro-Node AppRotateBytes 10485760
nssm start EquityPro-Node
```

#### Service 2: Python FastAPI (Uvicorn)
```powershell
nssm install EquityPro-Python "C:\EquityPro\.venv\Scripts\python.exe"
nssm set EquityPro-Python AppParameters "-m uvicorn main:app --host 0.0.0.0 --port 8100 --workers 9"
nssm set EquityPro-Python AppDirectory "C:\EquityPro"
nssm set EquityPro-Python AppEnvironmentExtra "NODE_ENV=production"
nssm set EquityPro-Python AppStdout "C:\EquityPro\logs\python-stdout.log"
nssm set EquityPro-Python AppStderr "C:\EquityPro\logs\python-stderr.log"
nssm set EquityPro-Python AppRotateFiles 1
nssm set EquityPro-Python AppRotateBytes 10485760
nssm start EquityPro-Python
```

#### Service 3: Celery Worker
```powershell
nssm install EquityPro-Celery "C:\EquityPro\.venv\Scripts\python.exe"
nssm set EquityPro-Celery AppParameters "-m celery -A celery_app worker --pool=solo --loglevel=info"
nssm set EquityPro-Celery AppDirectory "C:\EquityPro"
nssm set EquityPro-Celery AppStdout "C:\EquityPro\logs\celery-stdout.log"
nssm set EquityPro-Celery AppStderr "C:\EquityPro\logs\celery-stderr.log"
nssm set EquityPro-Celery AppRotateFiles 1
nssm set EquityPro-Celery AppRotateBytes 10485760
nssm start EquityPro-Celery
```

#### Service 4: Depth Ingester (Fyers TBT)
```powershell
nssm install EquityPro-DepthIngester "C:\EquityPro\.venv\Scripts\python.exe"
nssm set EquityPro-DepthIngester AppParameters "services\depth_ingester.py"
nssm set EquityPro-DepthIngester AppDirectory "C:\EquityPro"
nssm set EquityPro-DepthIngester AppStdout "C:\EquityPro\logs\depth-stdout.log"
nssm set EquityPro-DepthIngester AppStderr "C:\EquityPro\logs\depth-stderr.log"
nssm set EquityPro-DepthIngester AppRotateFiles 1
nssm set EquityPro-DepthIngester AppRotateBytes 10485760
nssm start EquityPro-DepthIngester
```

#### Create logs directory
```powershell
mkdir C:\EquityPro\logs
```

---

### 5. IIS Configuration (Reverse Proxy)

#### Enable ARR Proxy
1. Open **IIS Manager**
2. Select server node → **Application Request Routing** → **Server Proxy Settings**
3. Check **Enable proxy** → Apply

#### Create IIS Site
1. **Sites** → **Add Website**
   - Site name: `EquityPro`
   - Physical path: `C:\EquityPro\dist\public` (for static fallback)
   - Binding: `http` / port `80` / hostname: `yourdomain.com` (or `*` for IP-only)

#### Create `web.config` at `C:\EquityPro\dist\public\web.config`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>

    <!-- Enable WebSockets -->
    <webSocket enabled="true" />

    <rewrite>
      <rules>
        <!-- WebSocket: Depth data → Python backend -->
        <rule name="WS-Depth-Python" stopProcessing="true">
          <match url="^ws/depth/(.*)" />
          <action type="Rewrite" url="http://localhost:8100/ws/depth/{R:1}" />
          <serverVariables>
            <set name="HTTP_CONNECTION" value="Upgrade" />
            <set name="HTTP_UPGRADE" value="websocket" />
          </serverVariables>
        </rule>

        <!-- WebSocket: Admin updates → Node.js -->
        <rule name="WS-Admin" stopProcessing="true">
          <match url="^ws/admin-updates(.*)" />
          <action type="Rewrite" url="http://localhost:3000/ws/admin-updates{R:1}" />
          <serverVariables>
            <set name="HTTP_CONNECTION" value="Upgrade" />
            <set name="HTTP_UPGRADE" value="websocket" />
          </serverVariables>
        </rule>

        <!-- API routes → Node.js (which proxies some to Python) -->
        <rule name="API-Node" stopProcessing="true">
          <match url="^api/(.*)" />
          <action type="Rewrite" url="http://localhost:3000/api/{R:1}" />
        </rule>

        <!-- Auth routes → Node.js -->
        <rule name="Auth" stopProcessing="true">
          <match url="^auth/(.*)" />
          <action type="Rewrite" url="http://localhost:3000/auth/{R:1}" />
        </rule>

        <!-- Internal routes → Node.js -->
        <rule name="Internal" stopProcessing="true">
          <match url="^internal/(.*)" />
          <action type="Rewrite" url="http://localhost:3000/internal/{R:1}" />
        </rule>

        <!-- Everything else → Node.js (serves SPA) -->
        <rule name="SPA-Fallback" stopProcessing="true">
          <match url="(.*)" />
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
          </conditions>
          <action type="Rewrite" url="http://localhost:3000/{R:1}" />
        </rule>
      </rules>
    </rewrite>

    <!-- Compression -->
    <httpCompression>
      <dynamicTypes>
        <add mimeType="application/json" enabled="true" />
        <add mimeType="text/event-stream" enabled="false" />
      </dynamicTypes>
    </httpCompression>

    <!-- Security Headers -->
    <httpProtocol>
      <customHeaders>
        <add name="X-Content-Type-Options" value="nosniff" />
        <add name="X-Frame-Options" value="SAMEORIGIN" />
        <add name="X-XSS-Protection" value="1; mode=block" />
        <add name="Referrer-Policy" value="strict-origin-when-cross-origin" />
      </customHeaders>
    </httpProtocol>

    <!-- Static file caching -->
    <staticContent>
      <clientCache cacheControlMode="UseMaxAge" cacheControlMaxAge="30.00:00:00" />
    </staticContent>

  </system.webServer>
</configuration>
```

---

### 6. SSL/HTTPS Setup

#### Option A: Let's Encrypt (Free) via win-acme
```powershell
# Download win-acme: https://www.win-acme.com/
# Extract to C:\tools\win-acme\
C:\tools\win-acme\wacs.exe

# Follow prompts:
# 1. Create certificate (full options)
# 2. Manual input → yourdomain.com
# 3. IIS binding
# 4. Auto-renew via Task Scheduler
```

#### Option B: Self-signed (for testing)
```powershell
New-SelfSignedCertificate -DnsName "164.52.192.245" -CertStoreLocation "cert:\LocalMachine\My"
```

---

### 7. Firewall Rules

```powershell
# Allow HTTP/HTTPS inbound
New-NetFirewallRule -DisplayName "EquityPro HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
New-NetFirewallRule -DisplayName "EquityPro HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow

# Block direct access to internal ports (only IIS should reach them)
New-NetFirewallRule -DisplayName "Block External 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Block -RemoteAddress "0.0.0.0/0" 
New-NetFirewallRule -DisplayName "Block External 8100" -Direction Inbound -Protocol TCP -LocalPort 8100 -Action Block -RemoteAddress "0.0.0.0/0"
New-NetFirewallRule -DisplayName "Block External 6379" -Direction Inbound -Protocol TCP -LocalPort 6379 -Action Block -RemoteAddress "0.0.0.0/0"

# Allow loopback for internal services
New-NetFirewallRule -DisplayName "Allow Loopback" -Direction Inbound -Protocol TCP -LocalPort 3000,8100,6379 -Action Allow -RemoteAddress "127.0.0.1"
```

---

### 8. Service Management Commands

```powershell
# Start all services
nssm start EquityPro-Node
nssm start EquityPro-Python
nssm start EquityPro-Celery
nssm start EquityPro-DepthIngester

# Stop all services
nssm stop EquityPro-Node
nssm stop EquityPro-Python
nssm stop EquityPro-Celery
nssm stop EquityPro-DepthIngester

# Restart a service
nssm restart EquityPro-Node

# Check status
nssm status EquityPro-Node
nssm status EquityPro-Python

# View logs
Get-Content C:\EquityPro\logs\node-stderr.log -Tail 50 -Wait
Get-Content C:\EquityPro\logs\python-stderr.log -Tail 50 -Wait

# Remove a service (if needed)
nssm remove EquityPro-Node confirm
```

---

### 9. Deployment Update Script

Save as `C:\EquityPro\scripts\deploy-update.ps1`:

```powershell
# Stop services
nssm stop EquityPro-Node
nssm stop EquityPro-Python
nssm stop EquityPro-Celery

# Pull latest code
cd C:\EquityPro
git pull origin release/v2.0

# Rebuild
npm ci --production
npm run build
uv sync

# Restart services
nssm start EquityPro-Python
nssm start EquityPro-Celery
Start-Sleep -Seconds 5
nssm start EquityPro-Node

Write-Host "Deployment complete!" -ForegroundColor Green
```

---

## Concurrent Users Capacity Estimate

### Hardware Assumptions (Typical Windows VPS)

| Component | 4 vCPU / 8GB RAM | 8 vCPU / 16GB RAM | 16 vCPU / 32GB RAM |
|-----------|-------------------|--------------------|--------------------|
| **Node.js (Express)** | ~3,000 req/s | ~5,000 req/s | ~8,000 req/s |
| **Python (Uvicorn)** | 5 workers | 9 workers | 17 workers |
| **Python throughput** | ~500 req/s | ~1,000 req/s | ~2,000 req/s |
| **WebSocket connections** | ~500 | ~1,500 | ~3,000 |
| **Redis ops/s** | ~50,000 | ~100,000 | ~100,000 |

### Bottleneck Analysis

| Resource | Limit | Impact |
|----------|-------|--------|
| **External PostgreSQL** | Network latency ~15-50ms per query | Primary bottleneck for stock data |
| **Redis memory** | ~2GB for caching | Handles 10K+ cached entries easily |
| **Celery workers** | 1 worker (--pool=solo) | Serializes ML tasks (sentiment, backtest) |
| **Depth WebSocket** | ~50KB RAM per connection | 1,000 connections ≈ 50MB |
| **Node.js event loop** | Single-threaded | CPU-bound JS work (rare) is the limit |

### Realistic Concurrent User Estimates

| Scenario | 4 vCPU / 8GB | 8 vCPU / 16GB | 16 vCPU / 32GB |
|----------|-------------|---------------|----------------|
| **Browsing pages (REST)** | 500-800 | 1,500-2,500 | 3,000-5,000 |
| **Active screener/backtest** | 5-10 simultaneous | 10-20 simultaneous | 20-40 simultaneous |
| **Order Book (WebSocket)** | 200-400 | 500-1,000 | 1,000-2,500 |
| **Mixed workload** | **300-500 concurrent** | **800-1,500 concurrent** | **2,000-3,500 concurrent** |

### Key Scaling Notes

1. **Redis caching is critical** — Most stock data APIs return cached results (5-30 min TTL). Without Redis, capacity drops 80%.

2. **Celery is the ML bottleneck** — Sentiment analysis and backtesting are CPU-intensive (10-30s each). With `--pool=solo`, only 1 task runs at a time. For higher throughput:
   ```powershell
   # Multiple Celery workers
   nssm set EquityPro-Celery AppParameters "-m celery -A celery_app worker --pool=solo --concurrency=1 --loglevel=info -n worker1"
   # Create EquityPro-Celery2 with -n worker2, etc.
   ```

3. **WebSocket scaling** — Each depth WebSocket uses ~50KB RAM. The Fyers TBT connection pool allows max 3 connections × 5 symbols = 15 symbols. All browser clients for the same symbol share the Redis pub/sub channel.

4. **Database is external** — The PostgreSQL server at 13.205.4.69 is separate. Network latency dominates response time. Connection pooling (already configured: min=5, max=100) mitigates this.

5. **Horizontal scaling** — For >5,000 users, add a second Windows server behind a load balancer. Redis and PostgreSQL are already external, so Node.js + Python can scale horizontally.

---

## Monitoring

### Health Check Endpoints
```
GET http://localhost:3000/api/health          → Node.js health
GET http://localhost:8100/                     → Python health
GET http://localhost:8100/api/health/database  → DB connectivity
GET http://localhost:8100/api/health/cache     → Redis connectivity
GET http://localhost:8100/api/stats/redis      → Redis stats
```

### Windows Performance Monitor
- Monitor: `\Process(node)\% Processor Time`
- Monitor: `\Process(python)\% Processor Time`
- Monitor: `\Process(python)\Working Set`
- Alert if CPU > 80% sustained or memory > 85%

### Log Monitoring
```powershell
# Tail all logs
Get-Content C:\EquityPro\logs\*.log -Tail 20 -Wait
```

---

## Quick Reference — Service Ports

| Service | Port | Protocol | Access |
|---------|------|----------|--------|
| IIS (public) | 80/443 | HTTP/HTTPS | External |
| Node.js | 3000 | HTTP + WS | Internal only |
| Python/FastAPI | 8100 | HTTP + WS | Internal only |
| Redis | 6379 | TCP | Internal only |
| PostgreSQL | 5432 | TCP | External (13.205.4.69) |

---

## Daily Operations

### Fyers Token Renewal (Daily at ~9:00 AM IST)
1. Open `http://yourdomain.com/fyers-token`
2. Paste new token JSON → click **Update Token**
3. Depth ingester picks it up within 60 seconds

### Service Health Check
```powershell
nssm status EquityPro-Node
nssm status EquityPro-Python
nssm status EquityPro-Celery
nssm status EquityPro-DepthIngester
```
