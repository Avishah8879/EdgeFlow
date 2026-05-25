# EdgeFlow / EquityPro — Database Audit

> Phase 1 (discovery) + Phase 2 (analysis) of the CMOTS-driven schema redesign.
> Read-only audit. No code or schema modified.
> Date: 2026-05-08.

This document is the inventory + diagnosis. The redesign itself is in [db-target-schema.md](db-target-schema.md). The migration steps are in [db-migration-plan.md](db-migration-plan.md).

---

## Executive summary — top 5 findings

1. **Two physically separate Postgres databases, no SQLAlchemy/ORM, raw psycopg2 + parameterised SQL throughout.** `Tiphub` (financial, ~29 GB, TimescaleDB) is owned by Python via `psycopg2.pool.ThreadedConnectionPool` ([../main.py](../main.py) lines 100-115). `Tiphub_auth` (auth/users/coins/payments, ~50 MB) is owned by Node via `pg.Pool` ([../server/db/auth-connection.ts](../server/db/auth-connection.ts) lines 16-34). Cross-DB transactions are not coordinated. The `shared/schema.ts` Drizzle schema is a 4-table stub and is **out of sync** with the 27-migration auth DB — it is not a credible source of truth for either DB.

2. **CMOTS has zero presence in the codebase today.** Grep for `cmots|co_code|bse_code|nse_symbol` returns nothing. Every current feed is open-source: yfinance, NSEPy, Fyers (TBT/options), Upstox, screener.in scraping, Zerodha Pulse RSS, GoogleNews. CMOTS is a clean greenfield insertion, not a migration of an existing CMOTS shape.

3. **Major schema debt is documented but not shipped.** [`schema_plan_financial_data.md`](../../schema_plan_financial_data.md) and [`schema_plan_fyers.md`](../../schema_plan_fyers.md) (at the repo root) describe an 8-week normalisation that hasn't started: financial statements are still JSONB-locked inside `stock_fundamentals`, shareholding is scraped to Redis only (6-h TTL, no history), and `corporate_actions`, `bulk_deals`, `pcr_data`, `delivery_data`, `quarterly_announcements`, `analyst_recommendations` are empty placeholder tables with no writers.

4. **Hot-path latency is already failing under current load — not a future problem.**
   - `/api/most-active` is hitting the **15 s Node→Python proxy timeout** ([../errors_to_resolve.md](../errors_to_resolve.md) lines 20-101) because `/api/world-indices` runs 16 sequential yfinance HTTP calls and starves the default executor thread pool — a partial fix in commit `88633ab` did not stick post-restart.
   - `ltp_live` is **28 M rows / 7.2 GB** (per [db-schema.txt](db-schema.txt) lines 47-65) vs. the design intent of ~30 K (EOD-cleared); migrations/README flags an unrun cleanup. This is the single most exposed table on the read path (every quote lookup hits it).
   - TimescaleDB compression policy is written into [../hosting_plan.md](../hosting_plan.md) lines 122-134 but **not yet applied** to `ohlc_1hour`. That alone is an 8–12× win that's been left on the table.

5. **The Celery beat schedule is the de-facto write workload, and it is going to multiply under CMOTS.** Active hot-path tasks: 5 s hot-quote refresh, 10 s indices, 15 s movers, 5 s NIFTY/BANKNIFTY option chain, 60 s ATM-GxOI recorder, 5 min OI snapshot ([../celery_config.py](../celery_config.py) lines 106-214). Two prewarm jobs at 08:30 / 16:00 IST and a 16:30 OHLCV warmup. Most state is Redis-only and lost on restart. Adding CMOTS Bhavcopy + corporate-actions + fundamentals + F&O + indices + MF + shareholding feeds will fan out dramatically — write-path partitioning has to be designed before, not after.

---

## 1. Stack inventory

### 1.1 Process topology

```
┌─ Browser (React + Vite) ─────────────────┐
│ Plotly, Three.js / R3F, Recharts          │
│ TanStack Query, 5-min stale time          │
└──────────────┬───────────────────────────┘
               │ /api/*
               ▼
┌─ Node.js / Express (port 5000) ──────────┐
│ Drizzle (auth DB), routes-auth-v2,       │
│ subscriptions, coin wallet, OAuth,       │
│ admin pages, developer API, proxy to     │
│ Python for ML/finance routes             │
└──────────────┬───────────────────────────┘
               │ proxy /api/{quote,chart,screener,…}
               ▼
┌─ Python / FastAPI (port 7860 or 8100) ───┐
│ psycopg2 ThreadedConnectionPool          │
│ asyncpg pool (FinTerminal endpoints)     │
│ Celery client (Redis broker)             │
│ uvicorn workers                          │
└──────────────┬─────────────┬─────────────┘
               │             │
               ▼             ▼
       ┌─Tiphub (financial)─┐ ┌─Tiphub_auth─┐
       │ PostgreSQL 14      │ │ PostgreSQL  │
       │ + TimescaleDB      │ │             │
       │ ~29 GB             │ │ ~50 MB      │
       └────────────────────┘ └─────────────┘
               ▲
               │
       ┌─Local Redis ──────────┐
       │ DB 0 = app cache       │
       │ DB 1 = Celery broker   │
       │ DB 2 = Celery results  │
       └────────────────────────┘
               ▲
               │
       ┌─ Celery workers ──────┐
       │ heavy queue (backtest │
       │ + screener + RRG)     │
       │ periodic queue (5/10/ │
       │ 15 s refreshers)      │
       └───────────────────────┘
```

### 1.2 ORM / migration layer

| Stack | What's there | Source of truth? |
|---|---|---|
| Python (financial DB) | **No ORM.** Raw psycopg2 with parameterised queries. | Yes — but no schema-as-code; current state lives in [db-schema.txt](db-schema.txt). |
| Node (auth DB) | **Raw SQL migrations** in [../migrations/](../migrations/) (28 numbered files, no Alembic). Drizzle config ([../drizzle.config.ts](../drizzle.config.ts) lines 1-14) points at [../shared/schema.ts](../shared/schema.ts) but that file defines only 4 tables (`watchlistItems`, `windowLayouts`, `forumMessages`, minimal `users`) — it is **stale**. | The migration files (auth DB) and `db-schema.txt` (financial DB). Drizzle is informational only. |

Migration chain (auth DB), no branching detected:

| File | Date | Contents |
|---|---|---|
| 001-003 | (financial DB) | technical_indicators_live MV→TABLE; ltp_live indexes; critical indexes |
| 004 | 2025-11-25 | core auth tables (users, sessions, auth_logs, oauth_accounts) |
| 005 | terms_accepted | |
| 006 | 2025-11-28 | subscription_plans + subscription columns on users |
| 007 | upgraded all users to premium |
| 008 | analytics: page_views, feature_usage, saved_screener_results, saved_backtest_results, admin_audit_log, otp_codes, privacy_consent, rate_limit_* |
| 009 | backtest chart fields (JSONB candlestick_data) |
| 010 | feature_flags + overrides + audit |
| 011 | email_templates + email_notification_events |
| 012-016 | auth_logs constraint patches |
| 017 | phone_number, phone_verified |
| 018 | api_keys + api_usage_log |
| 019 | usage_log user index |
| 020 | encrypted_key column |
| 021 | rate_limit overrides |
| 022 | v2 → v1 auth migration |
| 023 | country_of_residence, date_of_birth |
| 024 | platforms + platform_api_keys (multi-platform auth) |
| 025 | three-tier plans (free/semi/pro), reseed plans |
| 026 | coin wallet (coin_balances, coin_transactions, coin_packs, feature_costs) |
| 027 | payment_intents (Cashfree) |
| 029 | coin_pricing (028 missing — gap) |

### 1.3 Connection pools

| Stack | Driver | Pool config | File |
|---|---|---|---|
| Python (FastAPI) | `psycopg2.pool.ThreadedConnectionPool` | `minconn = max(2, 5 // UVICORN_WORKERS)`, `maxconn = max(20, 100 // UVICORN_WORKERS)`, `connect_timeout=30` | [../main.py](../main.py) lines 100-115 |
| Python (FinTerminal endpoints) | `asyncpg.Pool` | Created lazily per startup ([../main.py](../main.py) line 8695); used by RRG + batch quotes | [../main.py](../main.py) lines 9707, 10635 |
| Node (auth DB) | `pg.Pool` | `max=50`, `idleTimeoutMillis=30000`, `connectionTimeoutMillis=10000`, `keepAlive=true`, no SSL | [../server/db/auth-connection.ts](../server/db/auth-connection.ts) lines 16-34 |
| PgBouncer (planned) | per [../hosting_plan.md](../hosting_plan.md) lines 147-152 | `pool_mode=transaction`, `max_client_conn=500`, `default_pool_size=50`, `reserve_pool_size=10`, `server_idle_timeout=600` | mid-flight |

No read-replica configuration found. No code routes reads to a replica. TimescaleDB is referenced in [.env.example](../.env.example) and [timescaledb-reference.md](timescaledb-reference.md) but the actual `CREATE EXTENSION` is not in any migration file — assumed pre-existing on the financial DB.

---

## 2. Per-table inventory

### 2.1 Financial DB (`Tiphub`) — what reads / writes hit each table

Source: [db-schema.txt](db-schema.txt) plus grep across the codebase.

| Table | Type | Rows (approx) | PK | FKs | Indexes | Partitioning | Read endpoints | Writers |
|---|---|---|---|---|---|---|---|---|
| `tickers` | base | 3,014 | `id` (int4 serial) | none | `(symbol)`, `(active)` | none | every quote/chart/screener — one of the hottest reads | `sync_nse_bse_tickers.py` daily 06:00 IST |
| `stock_fundamentals` | base | 2,224 (~31 MB) | `id` | `ticker_id` → tickers | `(ticker_id)` UNIQUE, partial on `trailing_pe`, `price_to_book` | none | `/api/quote`, `/api/stock-detail`, screener | `sync_yfinance_fundamentals.py` weekly |
| `stock_analysis` | base | 70 | `id` | `ticker_id` | `(ticker_id, analysis_date)` UNIQUE | none | stock detail | manual / ad-hoc |
| `ohlc_1hour` | TimescaleDB hypertable | **18.2 M** | `(ticker_id, ts)` | `ticker_id` | hypertable indexes | by `ts`, default chunks | `/api/price-chart`, screener, RRG | `data_append_cached.py` per-ticker |
| `ohlc_1min_intraday` | TimescaleDB hypertable | ~578 K | `(ticker_id, ts)` | `ticker_id` | hypertable indexes | by `ts`, 1-day retention | `/api/chart/intraday` | Upstox websocket |
| `ohlc_daily` | continuous aggregate | 2.1 M | (derived) | (derived) | (implicit) | by `ts` | `/api/chart/daily`, RRG | refresh policy |
| `ohlc_weekly` | continuous aggregate | 451 K | | | | | charts | refresh policy |
| `ohlc_monthly` | continuous aggregate | 106 K | | | | | charts | refresh policy |
| `ltp_live` | base | **28.3 M / 7.2 GB** | `id` (auto) ⚠️ | `ticker_id` | `(symbol)`, `(ticker)`, `(ticker_timestamp)`, `(timestamp)` | none | `/api/quote`, `/api/quotes`, `/api/most-active`, `/api/market-movers`, `/api/indices` | Angel daemon + Fyers tick |
| `ltp_live_realtime` | base | (varies) | | `ticker_id` | | none | `/api/quote` (Upstox source) | Upstox websocket |
| `market_movers_live` | base | 20 | | | | none | `/api/market-movers` | `gainers_losers_v2_full.py` 5 min |
| `stock_segments` | base (SCD-2) | (per-ticker history) | `id` | `ticker_id` | `(ticker_id) WHERE valid_to IS NULL` UNIQUE partial | none | symbol-resolution lookups | `sync_segments_nse_bse.py` |
| `segment_change_log` | base (audit) | (audit trail) | `id` | `ticker_id` | `(ticker_id, change_date)` | none | admin only | `sync_segments_nse_bse.py` |
| `heatmap_sector_data` | base | 78 K | | | | none | `/api/sector-heatmap` | nightly refresh |
| `technical_indicators_live` | base (was MV) | ~3 K | `ticker_id` | none | partial on RSI, MACD, SMA, supertrend | none | `/api/screener`, `/api/expert-screener` | `compute_technical_indicators_live.py` 15 min |
| `corporate_actions` | base | **0** | | | | none | unused | none |
| `bulk_deals` | base | **0** | | | | none | unused | none |
| `pcr_data` | base | **0** | | | | none | unused | none |
| `delivery_data` | base | **0** | | | | none | unused | none |
| `vix_signals` | base | **0** | | | | none | unused | none |
| `quarterly_announcements` | base | **0** | | | | none | unused | none |
| `analyst_recommendations` | base | **0** | | | | none | unused | none |
| `announcement_performance` | base | **0** | | | | none | unused | none |
| `trading_rules` | base | **0** | | | | none | unused | none |

⚠️ — `ltp_live` PK is the auto-increment `id`, **not** `(ticker_id)`. Without a unique constraint on `ticker_id`, every Angel-daemon insert appends a row. That's the bloat root cause. Confirmed at [db-schema.txt](db-schema.txt) lines 47-65.

### 2.2 Auth DB (`Tiphub_auth`) — out of CMOTS scope; documented for completeness

| Domain | Tables |
|---|---|
| Identity | `users`, `sessions`, `auth_logs`, `oauth_accounts`, `otp_codes`, `privacy_consent` |
| Subscription | `subscription_plans` + `users.subscription_*` columns |
| Coin wallet | `coin_balances`, `coin_transactions` (append-only ledger), `coin_packs`, `feature_costs` |
| Payments | `payment_intents` (Cashfree) |
| Developer API | `api_keys`, `api_usage_log`, `rate_limit_configs`, `rate_limit_overrides`, `rate_limit_usage`, `rate_limit_violations` |
| Multi-platform | `platforms`, `platform_api_keys` |
| Admin | `admin_audit_log`, `feature_flags`, `feature_flag_overrides`, `feature_flag_audit`, `system_config`, `system_notifications`, `notification_dismissals`, `email_templates`, `email_notification_events` |
| Analytics | `page_views`, `feature_usage`, `click_events`, `search_events`, `analytics_daily_summary` |
| Saved content | `saved_screener_results`, `saved_backtest_results` |
| Migration housekeeping | `migration_history` |

Total: **35+ tables** in auth DB. None are in scope for the CMOTS migration. Drizzle's `shared/schema.ts` reflects only the four tables `watchlistItems`, `windowLayouts`, `forumMessages`, minimal `users` — so Drizzle is **not** a source of truth and should not be relied on.

---

## 3. Ingestion paths

### 3.1 Python / Celery beat schedule

Source: [../celery_config.py](../celery_config.py) lines 106-214. Enabled by `CELERY_BEAT_ENABLED=true` env var.

| Task | Cadence | Queue | Target | Idempotent? |
|---|---|---|---|---|
| `refresh_hot_quotes` | every 5 s | periodic | Redis only | yes (overwrite) |
| `update_indices` | every 10 s | periodic | Redis only | yes |
| `update_market_movers` | every 15 s | periodic | `market_movers_live` table | yes (truncate + insert) |
| `refresh_options` | every 5 s | periodic | Redis only | yes |
| `refresh_options_visualizer` | every 60 s | periodic | Redis time-series only | yes (rpush w/ ts) |
| `snapshot_options_oi` | every 5 min | periodic | Redis :current/:previous rotation | yes |
| `update_fear_greed` | every 5 min | periodic | Redis only | yes |
| `full_prewarm` | 08:30, 16:00 IST | heavy | Redis warm cache | yes |
| `warm_ohlcv_cache` | 16:30 IST | heavy | Redis warm cache | yes |
| `persist_all_depth_snapshots` | (commented out) | periodic | (would be `market_depth` table — doesn't exist) | n/a |

### 3.2 Daily syncs (host cron, not in Celery beat)

| Script | Cadence | Target | Source |
|---|---|---|---|
| `run_full_sync.py` → `sync_nse_bse_tickers.py` → `sync_segments_nse_bse.py` → `verify_sync.py` | daily 06:00 IST | `tickers`, `stock_segments`, `segment_change_log` | Fyers masters | [schema_plan_fyers.md](../../schema_plan_fyers.md) |
| `data_append_cached.py` / `data_append_all_tickers.py` / `bse_historical_1hour.py` | per-ticker, ad-hoc | `ohlc_1hour` | Upstox 1-min aggregated → 1-hour | |
| `ltp_2day_retention_cleanup.py` | (documented at line 7-8 but **not registered** in Celery beat or system cron) | `ltp_live` | self | the missing cleanup that lets ltp_live bloat |
| `gainers_losers_v2_full.py` | 5-min cron | `market_movers_live` | live LTP scan | |
| `news_scraper.py` (on-demand) | request-driven | Redis only | Zerodha Pulse RSS + GoogleNews | [../news_scraper.py](../news_scraper.py) |
| Sentiment task `sentiment.analyze` | on-demand Celery | Redis only | GoogleNews + Zerodha Pulse + FinBERT | [../celery_tasks.py](../celery_tasks.py) lines 235-353 |
| Backtest `backtest.run` | on-demand Celery | Redis only (task results) | OHLC fetch via DB + GA optimisation | [../celery_tasks.py](../celery_tasks.py) lines 51-232 |

### 3.3 Volume estimates

| Feed | Rows/day (est.) | Where they go |
|---|---|---|
| Tickers (master sync) | ~3,000 upserts | `tickers` |
| Hourly OHLC | 3,000 × 7 hours = 21,000 | `ohlc_1hour` |
| 1-min intraday OHLC | 3,000 × 375 mins = ~1.1 M | `ohlc_1min_intraday` (1-day retention) |
| LTP ticks (Angel + Upstox) | 3,000 × ~300 = ~900,000 | `ltp_live` ⚠️ — should be 3,000 (one per ticker) |
| Market movers | 20 | `market_movers_live` (truncate+insert per cycle) |
| Options chain | ~1,500 strikes × 60 snaps/day | Redis only |
| News | ~200–400 articles/day | Redis only (no DB persistence) |
| Sentiment | per-request | Redis only |

The single biggest pain is **ltp_live writing 900K/day instead of upserting 3K**. Two months of that = 28 M rows. Confirmed.

---

## 4. Hot read paths

### 4.1 Top 15 endpoints by likely traffic

Source: [../main.py](../main.py) + browse of [../client/src/](../client/src/).

| # | Endpoint | File:line | Tables touched | Cache | Pattern |
|---|---|---|---|---|---|
| 1 | `GET /api/quote/{symbol}` | [main.py:4760](../main.py#L4760) | tickers, ltp_live, stock_fundamentals, ohlc_* | Redis 10 s market / 300 s off | 1 lookup + 1 ltp + 1 fund + (optional) 1 chart range |
| 2 | `GET /api/quotes` (batch) | [main.py:9687](../main.py#L9687) | tickers, ltp_live, stock_fundamentals | Redis pipeline + request_coalescing | per-symbol loop ⚠️ N+1 risk |
| 3 | `GET /api/price-chart/{ticker}` | [main.py:4472](../main.py#L4472) | tickers, ohlc_{timeframe} | Redis 30–300 s | single time-range scan, LIMIT 30 K |
| 4 | `GET /api/options/{symbol}` | [main.py:8972](../main.py#L8972) | NSE live API + Redis | Redis :current/:previous | no DB; live + delta |
| 5 | `GET /api/market-movers` | [main.py:5023](../main.py#L5023) | market_movers_live × stock_fundamentals | Redis 30 s / 600 s | LEFT JOIN |
| 6 | `GET /api/indices` | [main.py:5263](../main.py#L5263) | ltp_live (indices) | Redis 10 s / 300 s | filter+sort |
| 7 | `GET /api/rrg-image` | [main.py:10607](../main.py#L10607) | ohlc_daily (DB) or yfinance fallback | Redis 1800 s | per-symbol async fetch |
| 8 | `GET /api/stock-detail/{ticker}` | [main.py:6112](../main.py#L6112) | tickers, stock_fundamentals, stock_scorecard, ohlc_* | per-component caches | composite |
| 9 | `GET /api/search` | [main.py:5911](../main.py#L5911) | tickers (in-memory prefix trie + Redis) | 600 s | hybrid |
| 10 | `GET /api/expert-screener/stream/{job_id}` | [main.py:7581](../main.py#L7581) | ohlc_* per-ticker | Redis task state | per-ticker scan + indicator cache |
| 11 | `GET /api/chart/intraday/{symbol}` | [main.py:9779](../main.py#L9779) | ohlc_1min_intraday | Redis 30 s | single range |
| 12 | `GET /api/chart/daily/{symbol}` | [main.py:9865](../main.py#L9865) | ohlc_daily | Redis 300 s | single range |
| 13 | `GET /api/market-mood` | [main.py:5119](../main.py#L5119) | market_movers_live, ltp_live | Redis 60–300 s | aggregate |
| 14 | `GET /api/sentiment-analysis/stream/{task_id}` | [main.py:3736](../main.py#L3736) | external APIs | Redis | SSE stream |
| 15 | `GET /api/options-visualizer/timeseries/{symbol}` | [main.py:9114](../main.py#L9114) | Redis time-series | Redis | list pop |

### 4.2 N+1 / smell summary

| Endpoint | Smell | Severity | Mitigation today | Verdict |
|---|---|---|---|---|
| `/api/quotes` batch | per-symbol ltp_live + fundamentals queries in loop ([main.py:9726-9738](../main.py#L9726-L9738)) | **High** | request_coalescing.py dedupes by symbol | Will not survive 2,500 users; rewrite to `WHERE ticker_id = ANY($1)` |
| `/api/expert-screener/*` | per-ticker OHLC fetch during 3K-ticker scan | **High if unfixed** | in-process indicator cache | Mitigated; verify with `EXPLAIN ANALYZE` |
| `/api/most-active` | `DISTINCT ON` over 28 M-row `ltp_live` | **Critical** | none — currently times out | Phase 2 of redesign fixes structurally |
| `/api/world-indices` | 16 sequential yfinance HTTPs | **Critical** (out of DB scope) | partial fix in `88633ab` (asyncio.gather) | App-layer issue, not schema |
| `/api/market-movers` | LEFT JOIN per-row | Low | covered by indices | OK |

### 4.3 Caching layer

| Module | Purpose | Key behaviour |
|---|---|---|
| `redis_cache.py` | async Redis pool + dynamic TTLs | market-hours-aware TTLs; max 200 connections; singleton |
| `request_coalescing.py` | single-flight pattern | quote_coalescer, chart_coalescer, options_coalescer, fundamentals_coalescer + batch_quote_coalescer |
| `rate_limiter.py` | sliding window per-user + per-IP | 10–120 req/min by endpoint; 429 with Retry-After |
| `prewarming.py` | startup cache load | ~3 K tickers loaded in <10 s; freshness sample of 100 keys |

Queries served from Redis only (never from Postgres):
- option chain snapshots (`options_oi:{symbol}:{expiry}:current/previous`)
- options visualiser time-series (`options_viz:timeseries:{symbol}:{date}`)
- screener task results (`screener:results:{job_id}`)
- screener task state (`screener:task:{job_id}`)
- market mood / fear-and-greed
- shareholding pattern (currently)
- sentiment results

---

## 5. Pain signals (grep evidence)

### 5.1 Slowness / timeouts

| Pattern | Top hits | Evidence |
|---|---|---|
| 15 s timeout on `/api/most-active` | `[PythonProxy] timeout of 15000ms exceeded` | [errors_to_resolve.md:20-101](../errors_to_resolve.md#L20-L101) |
| ltp_live bloat | 28.3 M rows / 7.2 GB | [db-schema.txt:47-65](db-schema.txt#L47-L65) |
| ltp_live cleanup not in Celery beat | "Cron: 30 17 * * *" header but no schedule entry | [server/cron/ltp_2day_retention_cleanup.py:7-8](../server/cron/ltp_2day_retention_cleanup.py#L7-L8) |
| TimescaleDB compression unverified | policy commands present, no proof of application | [hosting_plan.md:122-134](../hosting_plan.md#L122-L134) |
| world-indices thread starvation | 16 sequential yfinance calls | [main.py:10599](../main.py#L10599) |

### 5.2 Schema-debt callouts (verbatim from prior planning docs)

> "Empty Tables (awaiting data): `analyst_recommendations`, `announcement_performance`, `bulk_deals`, `corporate_actions`, `delivery_data`, `market_movers`, `pcr_data`, `quarterly_announcements`, `trading_rules`, `vix_signals` — confirmed zero rows, no writers."
> — [../CLAUDE.md](../CLAUDE.md) lines 217-218

> "Shareholding Pattern... scraped from screener.in... 6-hour cache... no DB persistence"
> — [../CLAUDE.md](../CLAUDE.md) lines 101, 694; [../server/shareholding_scraper.py](../server/shareholding_scraper.py) line 26

> "Implement EOD cleanup job to reduce ltp_live from 2.24M to 30K rows"
> — [../migrations/README.md](../migrations/README.md) line 33 (and the table has since grown to 28.3 M)

### 5.3 Pool config (current)

| Setting | Value | File |
|---|---|---|
| Python `psycopg2` minconn | `max(2, 5 // UVICORN_WORKERS)` | [main.py:101-103](../main.py#L101-L103) |
| Python `psycopg2` maxconn | `max(20, 100 // UVICORN_WORKERS)` | [main.py:101-103](../main.py#L101-L103) |
| Python connect_timeout | 30 s | [main.py:113](../main.py#L113) |
| Node `pg.Pool` max | 50 | [server/db/auth-connection.ts:24](../server/db/auth-connection.ts#L24) |
| Node idleTimeoutMillis | 30 s | [server/db/auth-connection.ts:25](../server/db/auth-connection.ts#L25) |
| Celery task_max_retries | 3 | [celery_config.py:222](../celery_config.py#L222) |
| Celery hard time limit | 600 s | [celery_app.py:64](../celery_app.py#L64) |
| Node→Python proxy timeout | 15 s | [errors_to_resolve.md:25](../errors_to_resolve.md#L25) |
| PgBouncer max_client_conn (planned) | 500 | [hosting_plan.md:148](../hosting_plan.md#L148) |
| PgBouncer default_pool_size (planned) | 50 | [hosting_plan.md:150](../hosting_plan.md#L150) |

---

## 6. Phase 2 — Workload classification

For each table that matters under CMOTS, classify the workload it implies. Categories: master/reference, time-series intraday, time-series EOD, corporate-action event, fundamentals (quarterly/annual), user/auth, derived/computed, audit/log.

| Table (current or new) | Workload class | Read/write ratio | Cardinality / growth |
|---|---|---|---|
| `tickers` (legacy) | master | heavy-read | 3,014 today; +50/year |
| `companies` (new) | master | heavy-read | ~5,000 at steady state |
| `scrips` (new) | master | heavy-read | ~6,000–8,000 (multi-class) |
| `instruments` (new) | master | heavy-read | ~50,000 (with FNO contracts) |
| `instrument_identifiers` | reference (SCD-2) | heavy-read | ~150,000 lifetime |
| `stock_segments` / `scrip_segments` | reference (SCD-2) | balanced | low cardinality of changes |
| `corporate_actions` | event | balanced | ~3,000 actions/year × 10 years = 30K |
| `corporate_action_adjustments` | derived | heavy-read | ~300K lifetime |
| `bhavcopy_eod` (new) | TS EOD | heavy-write daily, heavy-read | **3.6 M/year**, 18 M / 5 years |
| `delivery_data` | TS EOD | heavy-write daily, balanced read | 1.8 M/year (NSE only) |
| `bulk_deals`, `block_deals` | event | balanced | ~5K/year |
| `ltp_snapshot` (new) | hot snapshot | heavy-write per tick | bounded ~5,000 forever |
| `ohlc_1min_intraday` | TS intraday (1-day retention) | heavy-write, heavy-read | 1.1 M/day, rolling |
| `ohlc_5min` (new CAgg) | TS intraday (rolling 7-day) | refresh-driven | derived |
| `ohlc_15min` (new CAgg) | TS intraday (rolling 30-day) | refresh-driven | derived |
| `ohlc_1hour` | TS hourly | heavy-write, heavy-read | 18 M today |
| `ohlc_daily / weekly / monthly` | CAgg | refresh-driven | 2.1 M / 451 K / 106 K |
| `fno_contracts` (new) | master | heavy-read | ~12,000 active + 1M expired/decade |
| `fno_eod` (new) | TS EOD | heavy-write, heavy-read | **15 M / 5 years** |
| F&O 1-min Parquet | TS intraday | append-only | **1.1 B / year** → off Postgres |
| `index_eod` (new) | TS EOD | heavy-write, heavy-read | 91 K/year |
| `index_ohlc_1min` (new) | TS intraday | heavy-write, heavy-read | 4.7 M/year |
| `mf_nav` (new hypertable) | TS daily | heavy-write daily | 4.4 M/year |
| `financial_statements` (new) | fundamentals (quarterly/annual) | balanced | ~20 M / 10 years |
| `key_ratios` (new) | fundamentals | balanced | ~24 M / 10 years |
| `financial_summary_latest` MV | derived | refresh-driven | ~400 K |
| `key_ratios_latest_wide` MV | derived | refresh-driven | ~50 K |
| `shareholding_pattern` (new) | fundamentals (quarterly) | balanced | 1.4 M lifetime |
| `shareholding_individual` (new) | fundamentals (quarterly) | balanced | 8 M lifetime |
| `analyst_recommendations` (new) | event | balanced | ~50 K/year |
| `analyst_consensus_latest` MV | derived | refresh-driven | ~5 K |
| `earnings_estimates` (new) | event (snapshots) | balanced | ~200 K/year |
| `quarterly_announcements` (new) | event | balanced | 20 K/year |
| `announcement_performance` (new) | derived | balanced | 20 K/year |
| `news_articles` (new) | content | heavy-write, heavy-read | 365 K/year |
| `news_article_tags` (new) | content junction | heavy-write | ~1.5 M/year |
| `corporate_announcements` (new) | event | balanced | 50 K/year |
| `pcr_data` (new) | TS daily | balanced | 5 K/year |
| `vix_signals` (new) | TS daily | balanced | 250/year |
| `fii_dii_flows` (new) | TS daily | balanced | 5 K/year |
| `stock_scorecard` (new) | derived (daily snapshot) | balanced | 1.8 M/year |
| `reverse_dcf_estimates` (new) | derived | balanced | 1.8 M/year |

### 6.1 What will break first as users scale

In order of expected first-failure under load increase:

1. **`/api/most-active` already broken.** 15-s timeout right now; root cause is `DISTINCT ON` over 28 M `ltp_live` rows. Phase 2 of the redesign fixes structurally with `ltp_snapshot` (PK `(scrip_id)`, ~5K rows).
2. **`/api/quotes` batch under N×50 concurrent users.** Per-symbol loop in [main.py:9718-9738](../main.py#L9718-L9738) issues 2N queries per request even with request coalescing (coalesces by symbol, not by request). Fix: rewrite to `WHERE ticker_id = ANY($1)`.
3. **Connection pool exhaustion when world-indices runs.** Default executor starvation makes other DB queries queue. Fix is app-side (separate executor or proper async); listed in [errors_to_resolve.md](../errors_to_resolve.md).
4. **Disk on the DB box** if F&O 1-min ever lands in Postgres. 1.1 B rows/year × even 100 bytes/row = 100 GB/year uncompressed; 10× compression still eats the 1 TB SSD inside 18 months.
5. **TimescaleDB compression policy unapplied.** As `ohlc_1hour` grew from 13.3 M to 18.2 M rows the compression-not-applied state means ~5× more bytes than necessary. Phase 0 verification fixes.
6. **Screener at 3K tickers × 50-condition expression** = 150 K cell evaluations per scan. Mitigated by in-process indicator cache today; will hit a wall around 10 K tickers (CMOTS adds smallcaps and international).
7. **News at 1 K/day = 365 K/year.** Below 5 M rows is fine on a regular table; at 5 M flip the table to a TimescaleDB hypertable with 90-day chunks and a retention policy.

### 6.2 CMOTS impact map — current tables vs CMOTS feeds

| Current table | CMOTS feed | Replaces / Augments / Deprecates |
|---|---|---|
| `tickers` | CMOTS company master + scrip master | Augments — new master layer (`companies` + `scrips`) replaces `tickers` semantically but `tickers` stays as a view during transition |
| `stock_segments` | (none — Fyers-driven) | Keeps; ports to `scrip_segments` keyed on new `scrip_id` |
| `ohlc_1hour` and continuous aggregates | CMOTS Bhavcopy (EOD) + CMOTS intraday | Augments — keeps `ohlc_1hour` for legacy reads, derives via continuous aggregates from a new `ohlc_1min_intraday` populated from CMOTS |
| `ltp_live` (28 M rows) | CMOTS LTP feed | Replaces — `ltp_snapshot` PK=`(scrip_id)` is the structural fix |
| `ltp_live_realtime` | CMOTS LTP | Replaces — merges into `ltp_snapshot` |
| `market_movers_live` | derived from CMOTS LTP | Keeps — refresh logic gets simpler |
| `stock_fundamentals` (with 5 JSONB columns) | CMOTS StandaloneFinancials, ConsolidatedFinancials, KeyRatios, Estimates | Replaces — long-format `financial_statements` + `key_ratios` + materialised wide MVs |
| `stock_analysis` (manual notes) | (none) | Renames to `internal_analyst_notes`; new `analyst_recommendations` is the broker-feed table |
| `corporate_actions` (empty placeholder) | CMOTS Corporate Actions feed | Replaces — drop, recreate fresh |
| `bulk_deals`, `block_deals` (empty) | CMOTS Deals feed | Replaces — drop, recreate fresh |
| `delivery_data` (empty) | NSE MTO + CMOTS | Replaces |
| `pcr_data` (empty) | CMOTS F&O daily | Replaces |
| `vix_signals` (empty) | NSE/BSE VIX feed | Replaces |
| `quarterly_announcements` (empty) | CMOTS Announcements | Replaces |
| `analyst_recommendations` (empty) | CMOTS Estimates / Brokerage feed | Replaces |
| `announcement_performance` (empty) | derived (post-event drift, computed nightly) | Replaces |
| `trading_rules` (empty) | unclear — CMOTS doesn't ship this | Deprecate — not in scope |
| (no current table) | CMOTS Indices master + EOD + 1-min | New — `indices`, `index_constituents`, `index_eod`, `index_ohlc_1min` |
| (no current table) | CMOTS F&O contract master + EOD | New — `fno_contracts`, `fno_eod` (Postgres); `fno_intraday/*.parquet` (R2/DuckDB) |
| (no current table) | CMOTS MF schemes + NAV | New — `mf_amcs`, `mf_schemes`, `mf_nav` |
| (no current table) | Shareholding pattern (today Redis-only) | New — `shareholding_pattern`, `shareholding_individual` (full history) |
| (no current table) | News + announcements | New — `news_articles`, `news_article_tags`, `corporate_announcements` (multi-source dedupe) |
| (no current table) | FII/DII flows | New — `fii_dii_flows` |
| (no current table) | Scorecard / DCF cache | New — `stock_scorecard`, `reverse_dcf_estimates` |

What we **do not know without the CMOTS data dictionary**:
- Exact CMOTS column names per feed (e.g. is it `LongName` or `CompanyName` on the company master).
- Whether CMOTS supplies derived ratios (PE/PB/ROE) or only the inputs.
- F&O 1-min cadence (some vendors ship 1-second).
- Whether CMOTS publishes a per-scrip news_id or only URL+timestamp.
- Whether CMOTS uses INTEGER or VARCHAR for `co_code`.

These are flagged in [db-target-schema.md](db-target-schema.md) "Open Questions" sections and in `[CMOTS?]` markers in [db-target-schema.sql](db-target-schema.sql).

---

## 7. Open audit questions (deferred to architect)

1. Drizzle schema in `shared/schema.ts` is 4 tables vs the auth DB's 35+ — is it intentionally minimal, or should it be regenerated from the live schema?
2. Migration `028` is missing (jumps 027 → 029). Was it rolled back? Audit trail needed.
3. `tickers.fyers_symbol`, `tickers.fy_token`, `tickers.token` — these are vendor identifiers that should move to `instrument_identifiers` (Phase 1). Confirm no production code reads them by column name.
4. TimescaleDB hypertable definitions for `ohlc_1hour`, `ohlc_1min_intraday`, and continuous aggregates `ohlc_daily/weekly/monthly` are not in any migration file — they were created out-of-band. Document the actual `create_hypertable` parameters used.
5. The financial DB connect string is hardcoded to a remote IP in some scripts (e.g. 13.205.4.69). Audit before the hosting migration cutover.
6. `verify_sync.py` orphan-FK scan needs to be extended to cover the new master/instrument tables before Phase 1 ships.
7. Cross-DB transactions (financial × auth) — there are none today. Is that acceptable, or should we use SAGA-style compensations for actions like "user X starts a backtest that consumes coins"? Out of CMOTS scope but worth raising.

---

## 8. Sources

- [db-schema.txt](db-schema.txt), [auth-db-schema.txt](auth-db-schema.txt) — current DB state
- [database-indexes.sql](database-indexes.sql), [verify-performance.sql](verify-performance.sql) — current performance work
- [../CLAUDE.md](../CLAUDE.md) — project overview
- [../hosting_plan.md](../hosting_plan.md) — Tier-B two-box plan with PgBouncer + WAL archive
- [../errors_to_resolve.md](../errors_to_resolve.md) — open production issues
- [../503_fixes_server.md](../503_fixes_server.md) — IIS production diagnostics
- [../REBUILD_STATUS.md](../REBUILD_STATUS.md), [../FT_PANEL_REBUILDS.md](../FT_PANEL_REBUILDS.md) — UI rebuild status
- [../MIGRATION_PLAN.md](../MIGRATION_PLAN.md) — UI migration record
- [../scripts/DB_TUNING_IMPLEMENTATION.md](../scripts/DB_TUNING_IMPLEMENTATION.md) — prior DB tuning work
- [../../schema_plan_financial_data.md](../../schema_plan_financial_data.md), [../../schema_plan_fyers.md](../../schema_plan_fyers.md), [../../ideal_schema.md](../../ideal_schema.md) — prior schema plans (root level)
- [../migrations/](../migrations/) — auth DB migration chain (001–029, gap at 028)
- [../celery_config.py](../celery_config.py), [../celery_app.py](../celery_app.py), [../celery_tasks.py](../celery_tasks.py) — async work
- [../main.py](../main.py) — FastAPI entry point (~11K lines)
- [../server/db_ltp_accessor.py](../server/db_ltp_accessor.py), [../server/db_timeframe_accessor.py](../server/db_timeframe_accessor.py) — DB accessors

---

End of audit. Continue to [db-target-schema.md](db-target-schema.md) for the redesign.
