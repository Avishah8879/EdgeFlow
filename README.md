# Tiphub

A professional-grade financial market analytics platform for Indian equity markets and global assets — combining real-time data, AI-powered insights, algorithmic strategy development, and intelligent stock screening in a single, unified interface.

![Tiphub](https://img.shields.io/badge/Tiphub-Financial%20Analytics%20Platform-ffa31a?style=for-the-badge)
![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react)
![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?style=flat-square&logo=fastapi)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat-square&logo=postgresql)

---

## Overview

**Tiphub** is built around one goal: give retail traders and financial analysts access to the same calibre of tools that institutional desks have — without the enterprise price tag.

The platform aggregates real-time NSE market data across 3,000+ stocks and 57 indices, runs FinBERT-based sentiment analysis on live news, executes Quantum-Inspired Genetic Algorithm (QIGA) strategy backtests asynchronously, and lets users screen the entire market using flexible boolean indicator expressions — all streamed live to the browser via Server-Sent Events.

Underneath, the system is built for scale: a dual-backend architecture (Node.js + Python/FastAPI), TimescaleDB for 13M+ OHLC rows with continuous aggregates, Redis for caching and task brokering, Celery workers for CPU-bound ML jobs, and an optional client-side GPU compute pipeline (WebGPU → WebGL2 → CPU Worker → Server) so heavy indicator math can be offloaded from the server to the user's own hardware.

---

## Key Capabilities at a Glance

| Domain | Capability |
|--------|------------|
| Market Data | 57 NSE indices + 3,000+ stocks, real-time LTP, intraday OHLC |
| Charts | Multi-timeframe candlestick: 1-min, 1-hour, daily, weekly, monthly |
| Stock Detail | Fundamentals, scorecard, shareholding pattern, analysts, reverse DCF |
| Market Mood | Synthetic Fear & Greed Index (VIX-based, 22-day lookback) |
| Screener | Boolean expression filtering with 68 technical indicators, SSE streaming |
| Backtesting | QIGA algorithm, 3 modes (Standard / TPSL / Hybrid), SSE streaming |
| Sentiment | FinBERT ML model on live news — async Celery task, SSE streamed |
| AI Chat | TipHub AI for financial Q&A (premium, streamed responses) |
| Auth | bcrypt + JWT, Google OAuth, OTP flows, multi-device session management |
| Subscriptions | Basic (free) / Premium tiers, 7-day trial, automated expiry |
| Developer API | API key management, usage dashboards, code examples |
| Admin Panel | User management, audit logs, analytics, feature flags |

---

## Features

### Real-Time Market Data

- **57 Market Indices** — Nifty 50, Bank Nifty, sectoral (IT, Pharma, Auto, Energy, FMCG, Metal, Realty, Media, PSU Bank) and thematic indices, updated live from the `ltp_live` table
- **3,000+ NSE Stocks** — browsable with market cap filters (Large / Mid / Small Cap), full-text symbol + name search (3-tier: in-memory cache → indexed lookup → database), and pagination (30 per page)
- **Market Movers** — Real-time top gainers and losers (rank 1–20 in each category) from `market_movers_live`
- **Marquee Ticker** — Top stocks by market cap with daily closing prices scrolling across the top of every page
- **NSE Market Status** — Pre-market (8–9:15 AM IST), Open (9:15 AM–3:30 PM), Post-market (3:30–5:00 PM), Closed — refreshed every 60 seconds

### Market Mood Index (Fear & Greed)

A proprietary synthetic Fear & Greed Index built on Nifty 50 volatility:

- Synthetic VIX calculated from 22-day rolling annualised volatility of 15-minute Nifty 50 intervals
- Output: 0–100 scale with five sentiment bands: Extreme Fear / Fear / Neutral / Greed / Extreme Greed
- Displayed as an animated gauge on the Home dashboard with a 5-day historical sparkline
- Cached in Redis for 15 minutes; calculated lazily on first request after cache expiry

### Stock Browser & Detail Pages

**Stocks Page (`/stocks`):**
- 30 stocks per page with search across 3,000+ symbols and company names
- Hover-to-preview fundamentals panel; only stocks with valid live prices shown
- Default view: Large Cap; filter buttons for Mid / Small / All

**Stock Detail Page (`/stocks/:ticker`):**
- Company header: name, symbol, exchange, sector, real-time price + % change
- Special suffix badges: SME, Trade-to-Trade (T2T), Surveillance, NAV, Index
- **Stock Scorecard** — quality, value, and growth rating summary
- **Price Chart** — multi-timeframe candlestick (1-min, 1-hour, daily, weekly, monthly) powered by Lightweight Charts; volume histogram overlay; crosshair OHLC legend; fullscreen and screenshot controls
- **Technical Indicators** — 24 indicators in a collapsible table (SMA 20/50/100/200, EMA 9/12/26/50/200, MACD, RSI 14, ATR 14, Supertrend 7,3 and 10,3, Bollinger Bands 20, Volume SMA 20) — calculated on-the-fly from `ohlc_1hour` in ~200–500 ms
- **Analyst Recommendations** — ratings, target prices, entry points, and report links from `stock_analysis`
- **Key Metrics** — market cap, P/E, P/B, dividend yield, beta, 52W high/low, ROE, debt-to-equity
- **Shareholding Pattern** — Sankey diagram of promoter / FII / DII / public distribution across multiple months and years
- **Financial Statements** — income statement, balance sheet, cash flow (quarterly and annual JSONB data)
- **Reverse DCF Valuation** — implied growth rate and fair value estimate from user-supplied assumptions
- **AI Sentiment Panel** — live FinBERT sentiment with colour-coded article list embedded in the stock page
- **Generate Alpha CTA** — deep-links into Strategy Backtesting pre-seeded with the current ticker

### Expert Screener

Screen the entire NSE universe (3,000+ stocks) using plain boolean expressions over technical indicators.

**How it works:**
1. Write an expression: `sma_50 > sma_200 and rsi_14 < 70 and volume_sma_20 > 500000`
2. Click Run — the backend starts an async job and returns a `job_id` instantly
3. The browser subscribes via SSE: live progress (stocks processed / total / matches) streams in real-time
4. Matching stocks appear in the results table as they are found, before the job finishes

**Available Indicators (68 total):**
- **SMA** — 17 periods: 2, 3, 4, 5, 7, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200
- **EMA** — 18 periods: same set plus 9, 12, 26
- **ATR** — 13 periods across 2–60 range
- **RSI** — periods 5, 7, 14, 20
- **MACD** — `macd_line`, `macd_signal`, `macd_histogram`
- **Bollinger Bands** — `bb_upper`, `bb_middle`, `bb_lower`
- **Supertrend** — `supertrend` (7,3 and 10,3), `supertrend_direction`
- **Volume** — `volume_sma` (any period), `liquidity`
- **OHLC** — `open`, `high`, `low`, `close`, `volume`
- **52-Week** — `high_52_W`

Custom periods work transparently: `sma_37`, `ema_123`, `rsi_21` are all valid expressions.

**Performance:**
- Pre-loaded symbol cache with 1-hour TTL (3,000 symbol→ticker_id mappings in memory)
- OHLC data pre-fetched once and distributed to parallel workers
- 300 bars of hourly OHLC computed per stock
- Full universe: ~20–180 seconds depending on expression complexity

**Result management:**
- Save screener results with a custom label
- Generate a shareable public URL (no login required to view the shared result)
- Browse saved runs history with expression, match count, and timestamp
- Delete individual saved results

**Sample templates built-in:**
- Momentum & Liquidity
- RSI Pullback
- 52-Week Breakout Watch

### Strategy Backtesting

Quantitative strategy optimisation using a Quantum-Inspired Genetic Algorithm (QIGA) over historical hourly OHLC data.

**Three modes:**

| Mode | Description |
|------|-------------|
| **Standard** | GA optimises entry/exit condition logic from a universe of technical indicator combinations |
| **Advanced (TPSL)** | Simultaneously optimises take-profit % and stop-loss % alongside the entry/exit logic |
| **Hybrid** | Client's GPU or CPU pre-computes indicators locally; only the optimisation loop runs server-side |

**Algorithm details:**
- 20 generations, population-based tournament selection
- 70/30 train/test split (no look-ahead bias in evaluation)
- Technical indicator universe: ATR (2–60), SMA (2–200), EMA (2–200), Pivot Points
- Execution via Celery async task — no HTTP timeout for 30–120 second runs
- Real-time progress via SSE: phase → generation counter → best fitness → elapsed time → cancel button

**Inputs:**
- Select any ticker from the database via searchable combobox (symbol + company name)
- Upload a CSV file with custom OHLC data
- Optionally supply custom trading rules to seed or constrain the GA

**Outputs:**
- Best strategy condition (human-readable logical expression)
- Performance metrics: Total PnL%, trade count, Calmar ratio, max drawdown, win rate, profit factor
- Equity curve chart with train/test split marker and max drawdown annotation
- Candlestick chart with entry/exit signal overlays (last 4 months of data)
- TPSL values: `target_pct` and `stop_pct` (Advanced mode only)
- Auto-generated PineScript code for import into TradingView

**Result management:**
- Save and label backtest runs
- Share via public URL token (viewable without login)
- View full run history

### AI Sentiment Analysis

FinBERT-powered news sentiment scored at article level for any stock ticker.

- **Model:** `mrm8488/distilroberta-finetuned-financial-news-sentiment-analysis`
- **Data sources:** GoogleNews API, Zerodha Pulse RSS feed
- **Execution:** Celery async task with SSE progress streaming — no frontend timeout
- **Redis cache:** 24-hour TTL per ticker (news sentiment is stable over the trading day)

**Output for each ticker:**
- Overall sentiment verdict: Bullish / Bearish / Neutral with confidence score
- Article breakdown: positive / negative / neutral article counts
- Stock fundamentals snapshot at time of analysis: market cap, P/E, beta, current price
- Colour-coded article list with titles, descriptions, source names, and clickable links
- OHLC candlestick chart from database price history alongside the sentiment output

### TipHub AI Chat (Premium)

Conversational AI tuned for Indian financial markets. Ask questions about stocks, sectors, macroeconomics, or trading strategies and receive streamed answers.

- **Access:** Premium subscribers only; non-premium users see an upgrade prompt
- **Technology:** OpenRouter API with streaming responses
- **Use cases:** stock analysis queries, sector outlooks, strategy explanations, market commentary

### GPU/CPU Compute System (Hybrid Backtesting)

For the Hybrid backtesting mode, technical indicator computation is offloaded from the server to the client's own hardware:

```
WebGPU  ──▶  WebGL2  ──▶  CPU Web Worker  ──▶  Server (Python fallback)
```

- **WebGPU:** Native GPU compute with WGSL shaders — maximum performance
- **WebGL2:** Browser-compatible GPU fallback for devices without WebGPU
- **CPU Workers:** Off-thread JavaScript via Web Workers (non-blocking)
- **Server:** Python backend fallback when no client compute is available

Supports all 68 indicators; maximum 100,000 data points per compute operation.
The `ComputeStatusBadge` component shows active backend (WebGPU / WebGL2 / CPU / Server) with live status.

---

## Platform Features

### Subscription Tiers

| Plan | Price | Trial | Limits |
|------|-------|-------|--------|
| Basic (Free) | ₹0 | — | Home, Stocks, Indices; 3 screener runs/day |
| Premium Monthly | ₹499/month | 7 days free | Unlimited screener & backtest, AI chat, data export |
| Premium Yearly | ₹4,999/year | 7 days free | Same as monthly (saves ₹1,000/year) |

- One 7-day free trial per account (enforced via `had_trial` flag)
- Trials auto-expire via hourly cron jobs (IST timezone)
- Graceful cancellation: access continues until period end (`cancel_at_period_end`)
- Stripe payment integration planned

### Authentication & Security

**Password authentication:**
- bcrypt hashing (cost factor 12)
- JWT tokens: 6-hour access + 7-day refresh
- Server-side session tracking per device — revoke individual or all sessions
- Account lockout after 5 failed login attempts (30-minute automatic lock)
- Rate limiting: login 5/15 min, signup 3/hour, token refresh 20/hour, password reset 3/hour

**Google OAuth:**
- Existing users: direct login with JWT session
- New users: redirected to `/auth/oauth-setup` (two-step: select username, tier, accept T&C via 15-minute temporary JWT)

**OTP flows:**
- Password reset — request OTP by email, verify to set new password
- Email verification — confirm email address ownership
- Account deletion — confirm permanent deletion with OTP

**Email delivery:**
- AWS SES (primary, production-grade)
- Gmail SMTP via Nodemailer (fallback / development)
- Development mode: fixed OTP `123456` + OTP echoed in API response

### Save & Share Results

Both Expert Screener results and Backtesting results can be:
- Saved to your account with a custom label
- Accessed from `/saved-results` (two tabs: Screener / Backtest)
- Shared as a public URL requiring no authentication (`/shared/screener/:token`, `/shared/backtest/:token`)

### Developer API

Programmatic access to Tiphub data via API keys:

- Create, view, revoke, and rotate API keys from the `/developers` page
- Set per-key allowed origin restrictions
- View API call volume and request metrics in usage dashboard
- JavaScript and Python code examples provided in-app

### Admin Panel

Role-restricted admin interface at `/admin`:

- **Dashboard** — system health (healthy/degraded/down), total/active/premium user counts, authentication event rates, API response time metrics
- **Users** — search, filter, sort users; edit tiers; suspend or delete accounts; admin impersonation for debugging
- **Audit Logs** — full security event log (signup, login, failed login, lockout, OTP verification, account deletion, token refresh) with search, date-range filters, IP address summary, and per-event detail drawer
- **Analytics** — feature adoption charts (screener, backtest, sentiment usage), user retention cohorts
- **Notifications** — broadcast in-app and email messages, announcement scheduling
- **Feature Flags** — toggle pages and features on/off platform-wide without code deploys
- **Rate Limits** — view and edit per-endpoint, per-tier API quotas
- **Email Settings** — configure AWS SES or SMTP, manage email templates
- **Security** — IP whitelist/blacklist, active session review, rate limit audit
- **API Keys** — platform-wide API key management and revocation

### News Feed

- Market news aggregated from GoogleNews API and Zerodha Pulse RSS
- 20 articles per page with pagination
- Search and filter by keyword
- Relative timestamps, article summaries, source attribution

---

## Architecture

### Dual Backend System

```
Browser
  │
  ├── Port 5000 ─── Node.js / Express
  │                  ├── React frontend (served via Vite in dev, static in prod)
  │                  ├── Auth API  (/auth/v2/*, /auth/google*)
  │                  ├── Subscription API  (/api/subscription/*)
  │                  ├── Admin API  (/api/admin/*)
  │                  ├── Developer API  (/api/developer/*)
  │                  └── Drizzle ORM → Local PostgreSQL
  │                       (users, sessions, OTP, subscriptions, API keys)
  │
  └── Port 7860 ─── Python / FastAPI
                     ├── Market data APIs  (/api/stocks, /api/indices, …)
                     ├── Charts & indicators  (/api/price-chart/*, /api/technical-indicators/*)
                     ├── Expert Screener  (/api/expert-screener/*)
                     ├── Strategy Backtest  (/api/strategy-backtest/*)
                     ├── Sentiment Analysis  (/api/sentiment-analysis/*)
                     └── psycopg2 → External TimescaleDB
                          (financial data: OHLC, fundamentals, LTP — 29 GB)
```

### Async Task Queue

```
FastAPI  ──▶  Redis (broker)  ──▶  Celery Worker
                                      ├── backtest.run        (QIGA optimisation)
                                      ├── backtest.hybrid     (client indicator hybrid)
                                      └── sentiment.analyze   (FinBERT ML inference)
                    │
          SSE progress streamed back to browser in real-time
```

### Database Architecture

**Local PostgreSQL (Drizzle ORM) — auth + platform data:**
- `users`, `sessions`, `auth_logs`, `otp_codes`
- `subscription_plans` + subscription fields on users
- `api_keys`, saved screener/backtest results, shared result tokens

**External TimescaleDB — financial data (29 GB):**

| Table | Records | Description |
|-------|---------|-------------|
| `tickers` | 3,014 | Master NSE stock list (symbol, name, sector, suffix, token) |
| `stock_fundamentals` | 2,224 | Valuation, balance sheet, income statement, JSONB financials |
| `ltp_live` | 30,872 | Real-time LTP with intraday OHLC (cleared EOD daily) |
| `market_movers_live` | 20 | Current top gainers and losers (rank 1–20 each category) |
| `ohlc_1hour` | 13,286,014 | 1-hour candlestick history (TimescaleDB hypertable, 5-year retention) |
| `ohlc_daily` | 2,134,503 | Daily OHLC continuous aggregate (10-year retention) |
| `ohlc_weekly` | 451,547 | Weekly aggregate (20-year retention) |
| `ohlc_monthly` | 106,080 | Monthly aggregate (indefinite retention) |
| `heatmap_sector_data` | 78,040 | Monthly sector return percentage heatmap |
| `stock_analysis` | 70 | Analyst research reports with embedded PDF files |

### Redis Caching

| Data | TTL |
|------|-----|
| Technical indicators | 5 min |
| Market mood (Fear & Greed) | 15 min |
| Stock LTP | 1 min |
| Search results | 5 min |
| Sentiment analysis | 24 hours |
| Stock fundamentals | 1 hour |
| Tickers list | 1 hour |
| OHLC bulk data (screener pre-fetch) | 30 min |
| Market movers | 5 min |

Connection pool: 150 max connections, bulk MGET operations, graceful fallback if Redis unavailable.

---

## Tech Stack

### Frontend
- **React 18** + TypeScript + **Vite**
- **Wouter** — lightweight client-side routing (no React Router)
- **TanStack Query 5** — server state management; no Redux or Zustand
- **shadcn/ui** (Radix UI primitives, new-york variant) + **Tailwind CSS**
- **next-themes** v0.4.6 — light/dark mode (defaults to dark to prevent FOUC)
- **Framer Motion** — smooth skeleton/loading state animations
- **Lightweight Charts** — theme-aware financial candlestick and line charts
- **cmdk** — command palette (Ctrl+K / Cmd+K)
- Custom GPU compute system: WebGPU WGSL shaders, WebGL2 fallback, Web Workers

### Node.js Backend
- **Express** + TypeScript
- **Drizzle ORM** with `@neondatabase/serverless` adapter
- **Yahoo Finance2** — supplemental/fallback stock data
- **bcrypt** — password hashing (cost factor 12)
- **JWT** — access + refresh token pair authentication
- **node-cron** — subscription expiry background tasks (IST timezone)
- **AWS SDK v3** (SES) + **Nodemailer** — transactional email delivery
- **ws** — WebSocket for admin real-time notifications

### Python Backend
- **FastAPI** + **Uvicorn** (multi-worker, worker-count-aware DB pool sizing)
- **Celery** + **Redis** — async task queue for ML and compute-heavy jobs
- **Transformers** + **PyTorch** — FinBERT sentiment analysis model
- **psycopg2** — PostgreSQL direct access with `ThreadedConnectionPool`
- **pandas** + **numpy** — vectorised technical indicator calculations
- **redis-py** — caching layer (150-connection pool, bulk MGET, statistics)
- **Selenium** — supplemental web scraping for data sources
- **GoogleNews** API + RSS feeds — news article ingestion

### Infrastructure
- **PostgreSQL 16** + **TimescaleDB** (continuous aggregates, hypertables, compression)
- **Redis** — unified cache + Celery broker + result backend
- **PM2** — Node.js / Python / Celery process management (EC2 production)
- **nginx** — reverse proxy with SSE-compatible config (`proxy_buffering off`)

---

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.13+ with [uv](https://docs.astral.sh/uv/)
- PostgreSQL 16
- Redis

### Installation

**1. Clone the repository:**
```bash
git clone <repository-url>
cd Tiphub
```

**2. Install dependencies:**
```bash
npm install
uv sync
```

**3. Set up environment variables:**
```bash
cp .env.example .env
# Edit .env with your database credentials and API keys
```

**4. Run database migrations:**
```bash
npm run db:migrate
```

**5. Start Redis:**
```bash
# Docker (recommended for Windows/Mac)
docker run -d --name redis -p 6379:6379 redis:alpine

# Native (Linux)
sudo apt install redis-server && sudo systemctl start redis-server
```

**6. Run all four services (four terminals):**

```bash
# Terminal 1: Node.js backend + React frontend (port 5000)
npm run dev

# Terminal 2: Python FastAPI backend (port 7860)
uv run main.py

# Terminal 3: Celery worker (async backtesting + sentiment)
uv run celery -A celery_app worker --pool=solo --loglevel=info

# Terminal 4: (Optional) Redis monitoring
redis-cli monitor
```

**7. Access the application:**
- Frontend: http://localhost:5000
- Python API: http://localhost:7860

---

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server (Node.js backend + Vite HMR frontend) |
| `npm run build` | Build for production (frontend → `dist/public/`, backend → `dist/index.js`) |
| `npm run start` | Run production build |
| `npm run check` | TypeScript type checking |
| `npm run db:push` | Push Drizzle schema changes to local database |
| `npm run db:migrate` | Run auth database migrations (004, 005, 006, …) |
| `npm run db:reset-auth` | **TESTING ONLY** — reset auth database, deletes all users |

---

## Production Deployment (EC2 / Linux)

### Prerequisites

```bash
# Install Redis
sudo apt update && sudo apt install redis-server -y

# Configure /etc/redis/redis.conf
# supervised systemd
# maxmemory 1gb
# maxmemory-policy allkeys-lru

sudo systemctl restart redis-server
sudo systemctl enable redis-server

# Build frontend
npm run build
```

### Instance Sizing

| Instance | vCPUs | RAM | `UVICORN_WORKERS` | Celery pool |
|----------|-------|-----|-------------------|-------------|
| t3.micro | 2 | 1 GB | 1 | solo |
| t3.small | 2 | 2 GB | 1 | solo |
| m5.large | 2 | 8 GB | 2 | prefork, concurrency=1 |
| m5.xlarge | 4 | 16 GB | 3–4 | prefork, concurrency=2 |

> **Important:** `UVICORN_WORKERS` must match the `--workers` flag passed to uvicorn. The DB connection pool is divided by worker count to prevent exhausting PostgreSQL `max_connections`. PostgreSQL must be configured with `max_connections >= 400`.

### tmux One-Liner

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

### PM2 (Recommended for Long-Running Deployments)

```bash
chmod +x scripts/deploy.sh

./scripts/deploy.sh install   # Install Node, nginx, Redis, PM2, uv
./scripts/deploy.sh setup     # Configure PM2, nginx, log rotation, build app
./scripts/deploy.sh start     # Start all services

./scripts/deploy.sh status    # Health-check all services
./scripts/deploy.sh logs      # Interactive log viewer
./scripts/deploy.sh update    # Git pull + rebuild + restart
```

---

## API Reference

### Python Backend (port 7860) — Financial Data

#### Market & Indices
```
GET  /api/market-status                    # NSE status: PRE-MARKET / OPEN / POST-MARKET / CLOSED
GET  /api/market-mood                      # Fear & Greed Index + 5-day history sparkline
GET  /api/market-movers                    # Top gainers/losers (?category=GAINER&limit=10)
GET  /api/indices                          # All 57 indices with real-time prices
GET  /api/marquee-stocks                   # Top stocks by market cap (?limit=20)
GET  /api/news                             # Market news feed (?limit=20&page=1)
```

#### Stocks & Search
```
GET  /api/stocks                           # Paginated stock list (?cap_type=Large&search=&page=1&limit=30)
GET  /api/search                           # Fast stock search (?q=RELIANCE&limit=50)
GET  /api/stock-ltp/{ticker}               # Real-time LTP (ltp, open, high, low, close, volume, changePercent)
POST /api/stock-ltp/bulk                   # Batch LTP fetch  { symbols: string[] }
GET  /api/quote/{ticker}                   # Combined: LTP + fundamentals + recent candles
POST /api/quote/bulk                       # Batch combined quotes
POST /api/prices/bulk                      # Batch fundamentals by ticker_id  { ticker_ids: int[] }
```

#### Charts & Indicators
```
GET  /api/price-chart/{ticker}             # OHLC data (?timeframe=1hour&months=6)
                                           # Supported timeframes: 1min, 1hour, 1day, 1week, 1month
GET  /api/technical-indicators/{ticker}    # 24 standard indicators (on-the-fly, ~200–500 ms)
```

#### Stock Analysis
```
GET  /api/stock-detail/{ticker}            # Full stock: fundamentals + analysts + sentiment
GET  /api/stock-scorecard/{ticker}         # Quality / value / growth rating
GET  /api/analysts-hub                     # Analyst ratings, research reports, earnings calendar
POST /api/reverse-dcf/{ticker}             # Fair value from DCF assumptions
GET  /api/shareholding-pattern/{ticker}    # Sankey diagram shareholding data
GET  /api/sankey/{ticker}/{year}/{month}   # Monthly shareholding breakdown
```

#### Expert Screener (SSE streaming)
```
POST /api/expert-screener/start            # Start job → { job_id }
GET  /api/expert-screener/stream/{job_id}  # SSE: connected / progress / result / complete / error
POST /api/expert-screener/cancel/{job_id}  # Cancel running job
POST /api/expert-screener/validate         # Validate expression without running screener
GET  /api/expert-screener/universe         # All available ticker symbols
GET  /api/expert-screener/templates        # Sample expressions (Momentum, RSI Pullback, 52W Breakout)
```

#### Strategy Backtesting (Celery + SSE)
```
POST /api/strategy-backtest/start          # Start async backtest → { task_id }
GET  /api/strategy-backtest/stream/{id}    # SSE: phases, generation progress, metrics
POST /api/strategy-backtest/cancel/{id}    # Cancel task
POST /api/strategy-backtest/hybrid/start   # Hybrid mode with client-computed indicators
```

#### Sentiment Analysis (Celery + SSE)
```
POST /api/sentiment-analysis/start         # Start async sentiment → { task_id }
GET  /api/sentiment-analysis/stream/{id}   # SSE: progress + results
POST /api/sentiment-analysis/cancel/{id}   # Cancel task
```

### Node.js Backend (port 5000) — Auth & Platform

#### Authentication (`/auth/v2/*`)
```
POST /auth/v2/signup                       # { email, username, password, phone, tier, termsAccepted }
POST /auth/v2/login                        # { identifier, password }
POST /auth/v2/logout                       # Revoke current session
POST /auth/v2/refresh                      # { refreshToken } → new access + refresh tokens
GET  /auth/v2/me                           # Current user profile
GET  /auth/v2/check-username/:username     # Username availability check
POST /auth/v2/forgot-password              # Request password reset OTP by email
POST /auth/v2/reset-password               # { email, otp, newPassword }
POST /auth/v2/send-verification            # Request email verification OTP
POST /auth/v2/verify-email                 # { otp }
POST /auth/v2/request-deletion             # Request account deletion OTP
POST /auth/v2/delete-account               # { otp } — permanently deletes account
```

#### Google OAuth
```
GET  /auth/google                          # Initiate Google OAuth consent screen
GET  /auth/google/callback                 # OAuth redirect handler
POST /auth/v2/complete-oauth-signup        # New users: { tempToken, username, tier, termsAccepted }
GET  /auth/google/status                   # Check if Google OAuth is configured
```

#### Subscriptions
```
GET  /api/subscription/plans               # All active subscription plans
GET  /api/subscription/current             # User's current subscription status
GET  /api/subscription/trial-eligibility   # Whether user can start a trial
POST /api/subscription/start-trial         # { planId: 'premium_monthly' }
POST /api/subscription/cancel              # Cancel at period end (graceful)
POST /api/subscription/downgrade           # Immediate downgrade to Basic
GET  /api/subscription/history             # Subscription event history log
```

#### Sessions
```
GET  /api/sessions                         # All active sessions (multi-device list)
POST /api/sessions/{id}/revoke             # Revoke a specific device session
POST /api/sessions/revoke-all              # Log out all devices
```

#### Developer API
```
GET  /api/developer/keys                   # List all API keys
POST /api/developer/keys                   # Create key { name, allowedOrigins }
POST /api/developer/keys/{id}/revoke       # Revoke key
POST /api/developer/keys/{id}/rotate       # Rotate key secret
GET  /api/developer/usage                  # API call volume and metrics
```

---

## Project Structure

```
Tiphub/
├── client/                         # React frontend (Vite)
│   └── src/
│       ├── components/             # Reusable UI components
│       │   ├── ui/                 # shadcn/ui primitives (Button, Card, Dialog, etc.)
│       │   ├── search/             # SearchBar, SearchResults, RecentSearches, TrendingStocks
│       │   ├── stock-detail/       # Price chart, technical indicators, scorecard components
│       │   └── strategy-backtest/  # TickerCombobox, BacktestProgress, EquityCurveChart
│       ├── contexts/
│       │   └── AuthContext.tsx     # Auth state, login/logout, token refresh
│       ├── hooks/                  # Custom React hooks
│       │   ├── use-market-mood.ts
│       │   ├── use-market-status.ts
│       │   ├── use-market-movers.ts
│       │   ├── use-expert-screener.ts
│       │   ├── use-strategy-backtest.ts
│       │   ├── use-subscription.ts
│       │   ├── use-gpu-compute.ts
│       │   └── use-smart-loader.ts
│       ├── lib/
│       │   ├── gpu-compute/        # WebGPU WGSL shaders, WebGL2 engine, CPU workers
│       │   ├── auth-fetch.ts       # Fetch interceptor with auto token refresh on 401
│       │   └── queryClient.ts      # TanStack Query configuration
│       └── pages/                  # Route-level page components
│           ├── Home.tsx
│           ├── Stocks.tsx
│           ├── StockDetail.tsx
│           ├── Indices.tsx
│           ├── ExpertScreener.tsx
│           ├── AlphaGeneration.tsx
│           ├── Profile.tsx
│           ├── Developers.tsx
│           ├── SavedResults.tsx
│           ├── TipTease.tsx
│           ├── News.tsx
│           └── admin/              # Admin dashboard (Dashboard, Users, AuditLogs, Analytics, …)
├── server/                         # Node.js / Express backend
│   ├── auth/                       # bcrypt, JWT, session management, Google OAuth (Passport.js)
│   ├── db/                         # Auth DB connection pool, migration runner
│   ├── lib/
│   │   ├── email.ts                # AWS SES + Nodemailer SMTP email delivery
│   │   └── otp.ts                  # OTP generation, verification, cleanup
│   ├── middleware/
│   │   ├── auth.ts                 # requireAuth, requireTier JWT middleware
│   │   └── rate-limit.ts           # Per-endpoint rate limiting
│   ├── cron/
│   │   └── subscription-tasks.ts   # Hourly trial/subscription expiry jobs
│   ├── migrations/                 # Auth DB SQL migrations (004 through 017)
│   ├── routes-auth-v2.ts           # /auth/v2/* routes
│   ├── routes-oauth-google.ts      # /auth/google/* routes
│   ├── routes-subscription.ts      # /api/subscription/* routes
│   ├── routes-admin.ts             # /api/admin/* routes
│   ├── routes-developer.ts         # /api/developer/* routes
│   └── routes.ts                   # General API routes
├── shared/
│   └── schema.ts                   # Drizzle ORM schema (local PostgreSQL)
├── main.py                         # FastAPI application entry point
├── celery_app.py                   # Celery configuration (broker, timeouts, concurrency)
├── celery_tasks.py                 # Task definitions: backtest.run, backtest.hybrid, sentiment.analyze
├── celery_helpers.py               # Lightweight DB access helpers for Celery tasks
├── worker_init.py                  # Pre-loads heavy deps at worker startup (~2 s vs ~25 s cold start)
├── expert_screener.py              # AST-based boolean expression screener with SSE
├── indicator_calculator.py         # Technical indicator library (pandas/numpy vectorised)
├── db_timeframe_accessor.py        # OHLC history accessor (TimescaleDB hypertables + aggregates)
├── db_ltp_accessor.py              # Real-time LTP data accessor (ltp_live table)
├── redis_client.py                 # Redis caching layer (TTL, bulk ops, graceful fallback)
├── market_hours.py                 # NSE market hours utility (IST timezone)
├── scripts/
│   └── deploy.sh                   # PM2 deployment automation
├── tools/                          # Diagnostic and maintenance scripts (not imported by main.py)
├── migrations/                     # Auth DB SQL migration files
├── .env.example                    # Environment variables template
├── CLAUDE.md                       # Development guidelines and architecture reference
└── README.md                       # This file
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values. Key variables:

```bash
# Node.js backend
DATABASE_URL=            # Local PostgreSQL connection string (Drizzle ORM)
JWT_SECRET=              # Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_ACCESS_EXPIRY=6h
JWT_REFRESH_EXPIRY=7d

# Auth database (separate PostgreSQL instance)
AUTH_DB_HOST=
AUTH_DB_PORT=5432
AUTH_DB_NAME=Tiphub_auth
AUTH_DB_USER=
AUTH_DB_PASSWORD=

# Google OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:5000/auth/google/callback

# Email delivery — AWS SES (primary) + Gmail SMTP (fallback)
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
EMAIL_FROM=noreply@yourdomain.com
SMTP_HOST=smtp.gmail.com
SMTP_USER=
SMTP_PASS=               # Gmail App Password — not your regular Gmail password

# Python backend — external financial database (TimescaleDB)
DB_HOST=
DB_PORT=5432
DB_NAME=
DB_USER=
DB_PASSWORD=

# Redis & Celery
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1

# Frontend API base URLs (bundled at Vite build time — rebuild after changing)
VITE_GRADIO_BASE_URL=http://localhost:7860
VITE_AUTH_BASE_URL=http://localhost:5000

# Production CORS — frontend origins only (comma-separated)
CORS_ORIGINS=http://localhost:5173

# Worker sizing (must match --workers flag; controls DB pool size per worker)
UVICORN_WORKERS=1        # Windows/dev: 1. Linux/EC2: match vCPU count (e.g. m5.large = 2)
```

---

## Documentation

For detailed development guidelines, architecture decisions, API conventions, database schema documentation, component patterns, and deployment runbooks, see [CLAUDE.md](CLAUDE.md).

---

## License

[Add your license here]

## Contributing

[Add contribution guidelines here]
