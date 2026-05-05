# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**EquityPro** - A financial market analysis platform with real-time stock data, sentiment analysis, strategy backtesting, AI chat, developer API, and market insights. NSE (National Stock Exchange of India) focused.

**Brand Identity (EquityPro v1 design system):**
- Primary brand: Navy `#1F3A5F` (`--brand-navy`) + Gold `#C8A04A` (`--brand-gold`)
- Sky accent: `#3FA9D6`, Gold-bright: `#F4A024` (chart series)
- Theme system: Light (default) / dark mode toggle. Premium FT-style — calm navy + gold, restrained
- Tagline: _Technical Precision · Fundamental Insight · Quantitative Rigor · Integrated Solutions_
- Logo: `EquityProLogo` component (shield + wordmark; navy text in light, gold text in dark)
- Fonts: Inter (sans) + JetBrains Mono (numerics — required for all prices/percentages/volumes/dates) + Playfair Display (editorial only)
- Reference: [design/equitypro-v1/](design/equitypro-v1/) — 56 reference HTML pages + tokens. See [MIGRATION_PLAN.md](MIGRATION_PLAN.md) for the migration record.

### Theme System

- Uses `next-themes` (v0.4.6) with class-based switching, configured in `client/src/App.tsx`. **Default: light.**
- Theme toggle: `client/src/components/ModeToggle.tsx`
- `:root` = light mode tokens (light is default — matches EquityPro's premium-navy-on-white). `.dark` class = dark mode overrides
- All colors use HSL component triplets so `hsl(var(--token) / <alpha>)` works

**Semantic Color Tokens (client/src/index.css):**
```css
/* Light (default :root) */
--positive: 150 60% 35%;           /* Calmer green for gains */
--positive-foreground: 150 60% 25%;
--negative: 0 72% 45%;             /* Red for losses */
--negative-foreground: 0 72% 35%;
--neutral:  213 14% 45%;           /* Navy-tinted gray */

/* Dark (.dark) */
--positive: 150 70% 45%;
--negative: 0 72% 55%;
```

**Tailwind Extensions (tailwind.config.ts):**
- `text-positive` / `text-negative` / `text-neutral` semantic classes — never use raw green/red hex
- `font-display` for marketing hero H1s (Playfair Display)
- `letterSpacing.uppercase` (`0.12em`) for the eyebrow / spaced-uppercase labels
- `boxShadow.card` / `card-lg` / `glow-primary` / `glow-gold` for calibrated shadows
- Charts: use `getCSSColor()` helper to read `--chart-1..5` CSS variables

**Smart Loading System:**
- `useSmartLoader` hook: 300ms delay before showing skeleton
- If data loads before 300ms, skip skeleton entirely
- Skeleton components in `client/src/components/LoadingSkeleton.tsx`

## Key Features

All features are briefly described here. Read source files for implementation details.

**1. Sentiment Analysis** (`/sentiment-analysis`)
- Input: stock ticker. Model: FinBERT. Data: GoogleNews API. Async via Celery + SSE streaming.
- Outputs: sentiment dashboard, article list with badges, stock fundamentals, candlestick chart.

**2. Strategy Backtesting** (`/alpha-generation`)
- Quantum-Inspired Genetic Algorithm (QIGA) with optional TPSL optimization.
- Modes: Standard, Advanced (TPSL), Hybrid (client indicators + server optimizer).
- Architecture: Async Celery task + SSE streaming. 20 generations, 70/30 train/test split.
- Outputs: strategy expression, metrics (PnL%, Calmar, drawdown, win rate), equity curve, candlestick signals.

**3. Expert Screener** (`/expert-screener`)
- Boolean expressions with technical indicators (e.g., `sma_50 > sma_200 and rsi_14 < 70`).
- AST-based evaluation, async SSE streaming, pre-loaded symbol cache.
- Indicators: SMA, EMA, MACD, RSI, ATR, Supertrend, Bollinger Bands, Volume SMA, OHLC, 52-week high.

**4. Market Mood** (Home page)
- Synthetic VIX from Nifty 50 15-min data. 22-day lookback. Circular gauge + 5-day sparkline.

**5. TipTease AI Chat** (`/tip-tease`, premium-only via PageGuard)
- SSE streaming chat powered by OpenRouter API (model: `moonshotai/kimi-k2:free`).
- Components: `client/src/components/tip-tease/` (ChatInterface, ChatMessage, ExamplePrompts, TodaySummary, etc.)
- Hook: `useTipTeaseChat()` in `client/src/hooks/use-tip-tease-chat.ts`
- Env vars: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_BASE_URL`

**6. Developer API Portal** (`/developers`, auth-required)
- API key management: create, revoke, rotate, reveal (encrypted storage).
- Usage analytics dashboard with charts.
- Components: `client/src/components/developer/` (ApiKeyCard, CreateKeyDialog, UsageChart, CodeExamples)
- Hooks: `use-api-keys.ts`, `use-api-usage.ts`
- Server: `server/routes-developer.ts`, `server/lib/key-encryption.ts`, `server/db/api-key-store.ts`
- Migration: `migrations/018_api_keys_system.sql`

**7. Market Reports** (`/market-reports`)
- Static sector outlook reports (Steel, Gas, Healthcare). No backend API.
- Pages: `client/src/pages/market-reports/SteelSectorOutlook.tsx`, `GasSectorOutlook.tsx`, `HealthcareSector.tsx`

**8. Saved Results** (`/saved-results`, auth-required)
- Save and share screener + backtest results via public token URLs.
- Routes: `/saved-results`, `/saved-results/screener/:id`, `/saved-results/backtest/:id`
- Public shared views: `/shared/screener/:token`, `/shared/backtest/:token`
- Hook: `use-saved-results.ts`, Server: `server/routes-saved-results.ts`

**9. Stock Detail Enhancements** (`/stocks/:symbol`)
- **Stock Scorecard**: 7-dimension analysis (Valuation, Profitability, Growth, Financial Health, Business Quality, Momentum, Entry Rating). Hook: `use-stock-scorecard.ts`, Server: `server/stock_scorecard.py`
- **Financial Sankey**: Revenue flow visualization using @nivo/sankey. Hook: `use-sankey.ts`, Server: `server/sankey.py`
- **Reverse DCF**: Implied growth rate calculator. Hook: `use-reverse-dcf.ts`, Server: `server/reverse_dcf.py`
- **Shareholding Pattern**: Quarterly/yearly ownership breakdown (scraped from screener.in). Hook: `use-shareholding.ts`, Server: `server/shareholding_scraper.py`
- **Enhanced Analyst Recommendations**: External analyst ratings, research reports, earnings calendar. Hook: `use-external-analyst.ts`

**10. Admin Dashboard** (`/admin/*`, role-based access: moderator/admin/super_admin)
- 11 admin pages: Dashboard, Users, Analytics, Audit Logs, Notifications, Settings, Security, Rate Limits, Feature Flags, Email Settings, API Keys
- Guard: `AdminGuard.tsx` with role-based variants
- Layout: `AdminLayout.tsx` with sidebar navigation
- WebSocket real-time updates: `server/ws-admin-broadcast.ts`
- Hooks: `use-admin-stats.ts`, `use-admin-users.ts`, `use-admin-notifications.ts`, `use-admin-api-keys.ts`, `use-feature-flags.ts`, `use-rate-limits.ts`, `use-impersonation.ts`, `use-admin-updates.ts`
- Server: `server/routes-admin.ts` (70+ endpoints)

### Core Pages

**Public:** `/` (Landing), `/stocks` (Browser), `/indices` (57 indices), `/index/:symbol` (Index Detail), `/expert-screener`, `/sentiment-analysis`, `/alpha-generation` (Backtest), `/market-reports`, `/market-reports/:slug`, `/blog`, `/blog/advanced-strategies`, `/shared/screener/:token`, `/shared/backtest/:token`, `/auth/login`, `/auth/signup`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/oauth-setup`, `/auth/callback`

**Auth-Protected:** `/stocks/:symbol` (Stock Detail), `/tip-tease` (AI Chat, premium), `/developers` (API Portal), `/saved-results`, `/saved-results/screener/:id`, `/saved-results/backtest/:id`, `/profile`, `/pricing` (disabled)

**Admin:** `/admin`, `/admin/users`, `/admin/analytics`, `/admin/audit`, `/admin/notifications`, `/admin/settings`, `/admin/security`, `/admin/rate-limits`, `/admin/feature-flags`, `/admin/email-settings`, `/admin/api-keys`

### Platform Infrastructure

- **Page Visibility / PageGuard**: Admin-controlled page visibility via `PageGuard` component + `PageVisibilityContext`. Server: `server/routes-public-config.ts` (`GET /api/config/pages`)
- **System Notifications**: Banner system managed by admins. Component: `NotificationBanner.tsx`. Hook: `use-notifications.ts`. Server: `server/routes-notifications.ts`
- **Privacy Consent**: GDPR-style consent banner. Component: `PrivacyConsentBanner.tsx`. Context: `TrackingContext.tsx`. Server: `server/routes-privacy.ts`
- **Analytics Tracking**: Dual tracking (internal + GA4). Context: `TrackingContext.tsx`. Lib: `client/src/lib/tracking.ts`, `client/src/lib/ga.ts`. Server: `server/routes-tracking.ts`
- **Usage Limits**: Tier-based usage limits for screener/backtest. Hook: `use-usage-limits.ts`. Component: `UsageLimitBadge.tsx`
- **Impersonation**: Super admin can impersonate users. Component: `ImpersonationBanner.tsx`. Hook: `use-impersonation.ts`
- **SEO**: `SEO.tsx` component, `GlobalSEO`, `JsonLd`. Config: `client/src/lib/seo-config.ts`, `client/src/lib/json-ld.ts`
- **Access Guard**: Tier-based (basic/premium) UI section guard. Component: `AccessGuard.tsx`
- **Market Ticker**: Scrolling marquee with live prices. Component: `MarketTicker.tsx`

## Architecture

### Dual Backend System

This project runs **two separate backend servers** simultaneously:

1. **Node.js/Express Backend** (`server/index.ts`) - Port 5000
   - Serves React frontend via Vite
   - Auth, subscriptions, admin, developer API, saved results, notifications, tracking
   - Drizzle ORM with local PostgreSQL + direct auth DB connection

2. **Python/FastAPI Backend** (`main.py`) - Port 7860
   - ML/AI processing (sentiment, backtesting, TipTease chat)
   - Financial data APIs (stocks, indices, screener, indicators, scorecard, sankey, etc.)
   - External PostgreSQL for financial data via psycopg2

### Tech Stack

**Frontend:** React 18 + TypeScript + Vite, Wouter (routing), TanStack Query 5 (server state), shadcn/ui (Radix UI, "new-york" variant), Tailwind CSS, next-themes, framer-motion, Lightweight Charts, @nivo/sankey, recharts

**Node Backend:** Express + TypeScript, Drizzle ORM, Yahoo Finance2, Passport.js (Google OAuth), node-cron, AWS SES + Nodemailer, WebSocket (ws)

**Python Backend:** FastAPI + Uvicorn, Gradio 5, Transformers + PyTorch, psycopg2, Celery + Redis, Selenium, httpx (OpenRouter API)

### Celery Task Queue System

```
Client → FastAPI → Redis Broker → Celery Worker
  ↑                                    ↓
  └──────── SSE Progress Streaming ────┘
```

**Files:** `celery_app.py` (config), `celery_tasks.py` (task definitions), `celery_helpers.py` (DB access), `worker_init.py` (preloading)
**Tasks:** `backtest.run`, `backtest.hybrid`, `sentiment.analyze`
**Config:** Redis broker, 2 workers, 10-min hard timeout, 2-hour result expiry
**Progress phases:** `fetching_data` → `computing_indicators` → `optimizing` (with generation/best_fitness)

### Redis Caching Layer

**Location:** `server/redis_client.py` - Graceful fallback if Redis unavailable.

**API:** `get_cached()`, `set_cached()`, `delete_cached()`, `@cache_result` decorator, `get_cached_bulk()` for MGET

**Predefined TTLs:**
| Constant | TTL | Data Type |
|----------|-----|-----------|
| `TTL_TECHNICAL_INDICATORS` | 5 min | Technical indicators |
| `TTL_MARKET_MOOD` | 15 min | Market mood |
| `TTL_STOCK_LTP` | 1 min | Stock LTP |
| `TTL_SEARCH_RESULTS` | 5 min | Search results |
| `TTL_SENTIMENT` | 24 hours | Sentiment analysis |
| `TTL_FUNDAMENTALS` | 1 hour | Stock fundamentals |
| `TTL_TICKERS` | 1 hour | Basic tickers list |
| `TTL_TICKERS_HOURLY` | 24 hours | Tickers with hourly data |
| `TTL_OHLC_DATA` | 30 min | OHLC bulk data |
| `TTL_MARKET_MOVERS` | 5 min | Gainers/losers |

## Database Architecture

**Local PostgreSQL (Drizzle ORM):** Schema in `shared/schema.ts`. Used by Node backend.

**External PostgreSQL:** Financial data (29 GB). Accessed by Python backend via psycopg2. Full schema: `db_schema.txt`.

### Key Tables

**`tickers`** (3,014 records) - Master stock list. PK: `id`. Columns: `symbol`, `name`, `exchange`, `sector`, `industry`, `token`, `suffix` (`-EQ`, `-SM`, `-BE`, `-ST`, `-INDEX`, `-NAV`), `is_active`. FK referenced by all other tables via `ticker_id`.

**`stock_fundamentals`** (2,224 records) - Price data, valuation ratios, company info, financial metrics, balance sheet, dividends, volume. JSONB: `income_statement`, `balance_sheet`, `cash_flow`, `quarterly_financials`, `dividends_history`.

**`ltp_live`** (30,872 records) - Real-time LTP with OHLC. Columns: `ticker_id`, `symbol`, `ltp`, `open`, `high`, `low`, `close`, `prev_close`, `volume`, `timestamp`. Cleared EOD.

**`ohlc_1hour`** (13.3M records) - 1-hour OHLC history. PK: (`ticker_id`, `ts`). TimescaleDB hypertable.

**`market_movers_live`** (20 records) - Top 10 gainers + 10 losers. Columns: `symbol`, `ltp`, `change_percent`, `category` (GAINER/LOSER), `rank`.

### Continuous Aggregates (from ohlc_1hour)
- **`ohlc_daily`** (2.1M records) - Column: `day`. Refresh: hourly. Retention: 10 years.
- **`ohlc_weekly`** (451K records) - Column: `week`. Refresh: daily. Retention: 20 years.
- **`ohlc_monthly`** (106K records) - Column: `month`. Refresh: daily. Retention: indefinite.

### Other Active Tables
- **`heatmap_sector_data`** (78K records) - Monthly sector performance with `return_percentage`
- **`stock_analysis`** (70 records) - Stock analysis reports with valuation, growth, profitability, PDF data
- **`ohlc_1min_intraday`** - Empty, for future intraday charts

### Empty Tables (awaiting data)
`analyst_recommendations`, `announcement_performance`, `bulk_deals`, `corporate_actions`, `delivery_data`, `market_movers`, `pcr_data`, `quarterly_announcements`, `trading_rules`, `vix_signals`

### Authentication Database (Tiphub_auth)

Separate PostgreSQL database. Tables: `users`, `sessions`, `auth_logs`, `oauth_accounts`, `otp_codes`, `subscription_plans`, `api_keys`, `api_usage_log`, plus admin tables (config, notifications, feature flags, rate limits, audit logs).

See migration files in `migrations/` for full schemas (004-020).

## Authentication & Security

**Auth routes:** `/auth/v2/*` (password) + `/auth/google` (OAuth)

**Key Files:**
- `server/auth/` - password-bcrypt.ts, jwt.ts, store-v2.ts, session-jwt.ts, oauth-google.ts
- `server/middleware/auth.ts` - `requireAuth`, `requireTier`, `requireRole` middleware
- `server/middleware/api-key-auth.ts` - API key authentication for developer endpoints
- `client/src/contexts/AuthContext.tsx` - Auth state, login/logout, token refresh
- `client/src/lib/auth-fetch.ts` - Fetch interceptor with auto 401 refresh

**Security Features:**
- Bcrypt with cost factor 12, password complexity validation
- JWT: 6h access / 7d refresh tokens, server-side session tracking
- Rate limiting: 5 login/15min, 3 signup/hour, 20 refresh/hour
- Account lockout after 5 failed attempts (30-min lock)
- Google OAuth 2.0 with Passport.js, two-step signup for new users

**Auth API Endpoints:**
```
POST /auth/v2/signup              # { email, username, password, termsAccepted }
POST /auth/v2/login               # { identifier, password }
POST /auth/v2/logout              # Revokes session
POST /auth/v2/refresh             # { refreshToken }
GET  /auth/v2/me                  # Current user profile
GET  /auth/v2/check-username/:u   # Username availability
POST /auth/v2/complete-oauth-signup  # { tempToken, username, tier, termsAccepted }
GET  /auth/v2/usage-limits        # Tier-based usage limits
GET  /auth/google                 # Redirect to Google consent
GET  /auth/google/callback        # OAuth callback
GET  /auth/google/status          # OAuth availability check
```

**OTP Endpoints (password reset, email verification, account deletion):**
```
POST /auth/v2/forgot-password     # Request OTP
POST /auth/v2/reset-password      # Verify OTP + new password
POST /auth/v2/send-verification   # Request email verification OTP
POST /auth/v2/verify-email        # Verify email OTP
POST /auth/v2/request-deletion    # Request account deletion OTP
POST /auth/v2/delete-account      # Verify OTP + delete
```

**Email Service:** `server/lib/email.ts` - AWS SES (primary) + Gmail SMTP (fallback). Types: password reset, email verification, account deletion, welcome. Dev mode: console logging + fixed OTP "123456".

**OTP System:** `server/lib/otp.ts` - 6-digit codes, 15-min expiry, 5 max attempts. Purposes: `password_reset`, `email_verification`, `account_deletion`, `login_verify`.

## Subscription System

**Plans:**
| Plan ID | Price | Trial |
|---------|-------|-------|
| `basic` | Free | - |
| `premium_monthly` | 499/mo | 7 days |
| `premium_yearly` | 4,999/yr | 7 days |

**Flow:** New User → Start Trial (7 days) → Trial Expires → Basic. Future: Pay → Active → Cancel → Period End → Basic.
**Cron:** `server/cron/subscription-tasks.ts` - Hourly check for expired trials/subscriptions.
**Pricing page:** `/pricing` route exists but is disabled (awaiting Stripe integration).

**Endpoints:** `GET /api/subscription/plans`, `GET /api/subscription/current`, `GET /api/subscription/trial-eligibility`, `POST /api/subscription/start-trial`, `POST /api/subscription/cancel`, `POST /api/subscription/downgrade`, `GET /api/subscription/history`

**Hooks:** `useSubscriptionPlans()`, `useUserSubscription()`, `useTrialEligibility()`, `useStartTrial()`, `useCancelSubscription()`, `useDowngradeSubscription()`, `useSubscriptionStatus()` (convenience with `isPremium`, `isTrialing`, etc.)

## Developer API System

**Architecture:** 4-branch auth flow - public endpoints (no auth), authenticated endpoints (JWT), premium endpoints (JWT + tier check), internal endpoints (server-to-server key validation).

**Key Files:**
- `server/routes-developer.ts` - All developer endpoints
- `server/db/api-key-store.ts` - CRUD for API keys
- `server/lib/key-encryption.ts` - AES encryption for stored keys
- `server/middleware/api-key-auth.ts` - API key validation middleware
- `migrations/018_api_keys_system.sql` - `api_keys` + `api_usage_log` tables

**Endpoints:**
```
POST   /api/developer/keys              # Create key
GET    /api/developer/keys              # List keys
GET    /api/developer/keys/:id          # Get key
GET    /api/developer/keys/:id/reveal   # Decrypt and reveal full key
PATCH  /api/developer/keys/:id          # Update name/origins
DELETE /api/developer/keys/:id          # Revoke key
POST   /api/developer/keys/:id/rotate   # Rotate key
GET    /api/developer/usage             # Aggregated usage stats
GET    /api/developer/usage/:keyId      # Per-key usage
POST   /internal/validate-api-key       # Server-to-server validation
```

**Hooks:** `useApiKeys()`, `useCreateApiKey()`, `useUpdateApiKey()`, `useRevokeApiKey()`, `useRevealKey()`, `useRotateApiKey()`, `useApiUsage(period)`, `useApiKeyUsage(keyId, period)`

## Git Conventions

**Commit Message Format:**
- Do NOT include the "Generated with Claude Code" footer or "Co-Authored-By: Claude" lines
- Use conventional commit style: `feat:`, `fix:`, `refactor:`, `docs:`, etc.
- Keep subject line under 72 characters
- Use imperative mood ("add feature" not "added feature")

## Common Commands

### Development
```bash
npm run dev              # Start dev server (Node backend + Vite frontend)
npm run build            # Build for production (frontend + backend)
npm run start            # Run production build
npm run check            # TypeScript type checking
npm run db:push          # Push Drizzle schema to database
npm run db:migrate       # Run auth database migrations
npm run db:reset-auth    # Reset auth DB (TESTING ONLY)
```

### Dev Quick Start (4 terminals)
```bash
docker run -d --name redis -p 6379:6379 redis:alpine   # Terminal 1: Redis
npm run dev                                              # Terminal 2: Node
uv run main.py                                           # Terminal 3: Python
celery -A celery_app worker --pool=solo --loglevel=info  # Terminal 4: Celery
```

### Production
See `DEPLOYMENT.md` and `scripts/deploy.sh` for full deployment instructions.

### Building
- `npm run build` bundles frontend (Vite → dist/public/) + backend (esbuild → dist/index.js)
- Always run `npm run check` before committing
- After changing `.env.production`, rebuild: `npm run build`

## Path Aliases

Configured in both vite.config.ts and tsconfig.json:
- `@/` → client/src/
- `@shared/` → shared/
- `@assets/` → attached_assets/

## State Management & Hooks

### Patterns
- **Server state:** TanStack Query 5 via custom hooks in `client/src/hooks/`
- **Component state:** React useState/useEffect (no global state library)
- **Forms:** React Hook Form + Zod validation
- **Query client:** `client/src/lib/queryClient.ts`

### All Hooks by Category

**Market Data:**
- `use-market-mood.ts` - Fear & Greed Index (15-min refresh, fallback to neutral)
- `use-market-status.ts` - NSE market open/closed (60s refresh)
- `use-market-movers.ts` - Top gainers/losers
- `use-stock-ltp.ts` - Real-time LTP for single stock

**SSE-Based (complex interfaces):**
- `use-expert-screener.ts` - SSE screener: `runScreener()`, `cancelScreener()`, status/progress/results/summary states
- `use-strategy-backtest.ts` - SSE backtest: `runBacktest()`, `cancelBacktest()`, `reset()`, progress (phase/generation/best_fitness), result (condition/metrics/equity_curve)
- `use-tip-tease-chat.ts` - SSE chat: `sendMessage()`, `cancelStream()`, streaming message chunks

**Stock Detail:**
- `use-price-chart.ts` - Historical OHLC data
- `use-technical-indicators.ts` - On-demand indicator calculation
- `use-stock-scorecard.ts` - 7-dimension stock analysis
- `use-sankey.ts` - Financial Sankey data (`useSankey`, `useSankeyYears`)
- `use-reverse-dcf.ts` - Reverse DCF (`useReverseDCF`, `useReverseDCFMutation`)
- `use-shareholding.ts` - Shareholding pattern (quarterly/yearly)
- `use-external-analyst.ts` - Analyst ratings and reports
- `use-index-detail.ts` - Index detail data

**Search:**
- `use-search.ts` - 150ms debounce, two-stage fetch (search → prices), request cancellation
- `use-ticker-options.ts` - Ticker dropdown options

**Auth & Account:**
- `use-password-reset.ts` - `useRequestPasswordReset()`, `useResetPassword()`
- `use-email-verification.ts` - `useSendVerification()`, `useVerifyEmail()`
- `use-account.ts` - `useRequestDeletion()`, `useDeleteAccount()`
- `use-sessions.ts` - List/revoke individual sessions
- `use-oauth-linking.ts` - Link/unlink Google OAuth
- `use-profile-update.ts` - Profile updates

**Subscription:**
- `use-subscription.ts` - Plans, current, trial eligibility, start/cancel/downgrade, status flags

**Developer API:**
- `use-api-keys.ts` - CRUD + reveal + rotate
- `use-api-usage.ts` - Usage analytics

**Saved Results:**
- `use-saved-results.ts` - Save/load/delete/share screener + backtest results

**Admin:**
- `use-admin-stats.ts` - Dashboard stats, audit logs, auth logs, analytics (signups, logins, retention, growth, active users, page stats, feature usage, search stats, user time)
- `use-admin-users.ts` - User management, role/tier changes, bulk operations
- `use-admin-notifications.ts` - Notification CRUD, preferences, templates, queue, stats
- `use-admin-api-keys.ts` - Admin-level API key management
- `use-feature-flags.ts` - Feature flag CRUD with overrides and audit
- `use-rate-limits.ts` - Rate limit config, overrides, violations
- `use-impersonation.ts` - Super admin user impersonation
- `use-admin-updates.ts` - WebSocket listener for real-time admin changes

**Platform:**
- `use-notifications.ts` - System notification banner
- `use-usage-limits.ts` - Tier-based usage tracking
- `use-privacy-consent.ts` - GDPR consent state
- `use-visibility-refresh.ts` - Refresh user profile on tab visibility
- `use-url-state.ts` - Bidirectional URL query param sync

**UI Utility:**
- `use-smart-loader.ts` - 300ms delay skeleton display
- Chart hooks: `useChartInstance`, `useChartTheme`, `useChartSeries`, `useChartPreferences`, `useFullscreen`

## API Endpoints

### Node.js Express Routes

**Auth** (`server/routes-auth-v2.ts`):
```
POST /auth/v2/signup, /login, /logout, /refresh
GET  /auth/v2/me, /check-username/:username, /usage-limits
POST /auth/v2/complete-oauth-signup
POST /auth/v2/forgot-password, /reset-password
POST /auth/v2/send-verification, /verify-email
POST /auth/v2/request-deletion, /delete-account
```

**Google OAuth** (`server/routes-oauth-google.ts`):
```
GET /auth/google, /auth/google/callback, /auth/google/status
```

**Subscription** (`server/routes-subscription.ts`):
```
GET  /api/subscription/plans, /plan/:planId, /current, /trial-eligibility, /history
POST /api/subscription/start-trial, /cancel, /downgrade
POST /api/subscription/admin/expire-check
```

**Developer API** (`server/routes-developer.ts`):
```
POST   /api/developer/keys
GET    /api/developer/keys, /keys/:id, /keys/:id/reveal
PATCH  /api/developer/keys/:id
DELETE /api/developer/keys/:id
POST   /api/developer/keys/:id/rotate
GET    /api/developer/usage, /usage/:keyId
POST   /internal/validate-api-key
```

**Saved Results** (`server/routes-saved-results.ts`):
```
GET    /api/saved/screener, /screener/:id, /screener/shared/:token
POST   /api/saved/screener, /screener/:id/share
DELETE /api/saved/screener/:id
GET    /api/saved/backtest, /backtest/:id, /backtest/shared/:token
POST   /api/saved/backtest, /backtest/:id/share
DELETE /api/saved/backtest/:id
```

**Admin** (`server/routes-admin.ts`) - 70+ endpoints covering:
- Stats, analytics (signups, logins, retention, growth, active users, page stats, feature usage, search stats, user time)
- User management (list, search, role/tier changes, unlock, sessions, bulk ops, export)
- Config management (page visibility, settings)
- Notifications (CRUD, preferences, settings, templates, queue, history, test, stats)
- Audit/auth logs (search, filter, export, IP summary)
- Security (locked accounts, active sessions, revoke-all)
- Impersonation (start/end)
- Rate limits (CRUD, overrides, violations, stats, cleanup)
- Feature flags (CRUD, toggle, overrides, audit, categories)
- API keys (list, stats, details, create, update, revoke, usage)

**Public Config** (`server/routes-public-config.ts`): `GET /api/config/pages`

**Notifications** (`server/routes-notifications.ts`): `GET /api/notifications/active`, `POST /api/notifications/:id/dismiss`

**Privacy** (`server/routes-privacy.ts`): `GET /api/privacy/consent`, `POST /api/privacy/consent`

**Tracking** (`server/routes-tracking.ts`):
```
POST /api/track/page-view, /click, /search, /feature-usage, /session-end, /heartbeat
```

### Python FastAPI Routes (main.py)

**Market Status & Mood:**
```
GET  /api/market-status              # NSE open/closed, PRE-MARKET/OPEN/POST-MARKET/CLOSED
GET  /api/market-mood                # Fear & Greed Index + 5-day history
```

**Market Data & Stocks:**
```
GET  /api/market-movers              # Gainers/losers (category, limit params)
GET  /api/stocks                     # Paginated stocks (cap_type, search, page, limit)
GET  /api/marquee-stocks             # Top stocks by market cap with prices
GET  /api/indices                    # 57 market indices with real-time prices
GET  /api/indices/{symbol}           # Single index detail
GET  /api/tickers                    # All ticker symbols
GET  /api/tickers/nse                # NSE-only tickers
```

**Real-time Prices:**
```
GET  /api/stock-ltp/{ticker_symbol}  # Single stock LTP
POST /api/stock-ltp/bulk             # Batch LTP { symbols: string[] }
GET  /api/quote/{symbol}             # Single stock quote
POST /api/quote-bulk                 # Bulk stock quotes
```

**Price Charts:**
```
GET  /api/price-chart/{ticker_symbol}  # OHLC data (timeframe: 1min/1hour/1day/1week/1month, months)
```

**Search & Prices:**
```
GET  /api/search                     # 3-tier search (memory→index→DB), q param, limit
POST /api/prices/bulk                # Batch prices { ticker_ids: int[] }
```

**Technical Analysis:**
```
GET  /api/technical-indicators/{ticker}  # 24 indicators calculated on-the-fly from ohlc_1hour
```

**Expert Screener:**
```
POST /api/expert-screener/start      # Start async job → { job_id }
GET  /api/expert-screener/stream/{id}  # SSE progress stream
POST /api/expert-screener/cancel/{id}  # Cancel job
GET  /api/expert-screener/universe   # Available symbols
GET  /api/expert-screener/templates  # Sample expressions
POST /api/expert-screener/validate   # Validate expression
POST /api/expert-screener/run        # Synchronous (legacy)
```

**Sentiment Analysis:**
```
POST /api/sentiment-analysis         # Synchronous ML analysis (24h cache)
POST /api/sentiment-analysis/start   # Async Celery task → task_id
GET  /api/sentiment-analysis/status/{id}  # Task status (polling)
GET  /api/sentiment-analysis/stream/{id}  # SSE progress stream
POST /api/sentiment-analysis/cancel/{id}  # Cancel task
```

**Strategy Backtesting:**
```
POST /api/strategy-backtest/start    # Celery backtest → task_id
GET  /api/strategy-backtest/stream/{id}  # SSE progress stream
POST /api/strategy-backtest/cancel/{id}  # Cancel task
POST /api/strategy-backtest/hybrid/start  # Hybrid mode with client indicators
POST /api/strategy-backtest          # CSV upload backtest
POST /api/strategy-backtest/ticker   # Database ticker backtest
POST /api/strategy-backtest/advanced/ticker  # TPSL backtest
POST /api/strategy-backtest/hybrid   # Hybrid GA backtest
POST /api/strategy-backtest/advanced/hybrid  # Hybrid TPSL backtest
```

**TipTease AI Chat:**
```
POST /api/tip-tease/chat/start       # Start chat → stream_id
GET  /api/tip-tease/stream/{id}      # SSE response stream (chunks + complete)
POST /api/tip-tease/cancel/{id}      # Cancel active stream
GET  /api/tip-tease/summary          # Today's market summary + contextual hint
```

**Stock Detail:**
```
GET  /api/stock-scorecard/{ticker}   # 7-dimension scorecard (30-min cache)
GET  /api/sankey/years/{ticker}      # Available years for Sankey
GET  /api/sankey/{type}/{ticker}     # Income/cashflow/balance Sankey (type + year param)
POST /api/reverse-dcf/{ticker}       # Reverse DCF { wacc, terminal_growth, forecast_years }
GET  /api/shareholding/{ticker}      # Shareholding pattern (view=quarterly|yearly, 6h cache)
GET  /api/stock-detail/{ticker}/analyst  # External analyst ratings + reports
GET  /api/analysts-hub               # Analyst hub (ticker param)
```

**Fundamental Screener:**
```
POST /api/screener/run               # Conditions filter on stock_fundamentals
```

**Pattern for new endpoints:**
- Simple CRUD/auth/config → Node.js Express
- ML/heavy computation/financial data → Python FastAPI
- Node: Zod validation. Python: Pydantic BaseModel.
- Return: `{ data: [...], count?: number }` or `{ error: string }`

## Frontend Routing

Using **Wouter** (not React Router):
```tsx
import { Route } from "wouter";
<Route path="/" component={Landing} />
<Route path="/stocks/:symbol" component={StockDetail} />
```

**Route Guards:**
- `AuthGuard` - Redirects unauthenticated users to /login with returnUrl
- `PageGuard` - Redirects if admin has hidden the page (via feature flags)
- `AccessGuard` - Tier-based (basic/premium) UI section guard
- `AdminGuard` / `ModeratorGuard` / `SuperAdminGuard` - Role-based admin access

**Lazy Loading:** Pages use `React.lazy()` with Suspense for code splitting.

## Component Patterns

### shadcn/ui Components (`client/src/components/ui/`)
`breadcrumb`, `button`, `card`, `checkbox`, `collapsible`, `command`, `data-table`, `dialog`, `drawer`, `dropdown-menu`, `input`, `label`, `popover`, `select`, `separator`, `sheet`, `skeleton`, `sonner` (toasts), `tabs`, `textarea`, `tooltip`

### Key Custom Components

**Global:** `CommandPalette.tsx` (Ctrl+K), `MarketTicker.tsx` (scrolling prices), `MarketMood.tsx` (gauge), `MarketStatusBadge.tsx`, `NotificationBanner.tsx`, `ImpersonationBanner.tsx`, `PrivacyConsentBanner.tsx`, `UsageLimitBadge.tsx`, `SEO.tsx`, `HalvorsenAttractor.tsx` (3D animation on Landing)

**Search system** (`client/src/components/search/`): `SearchBar.tsx` (inline/dialog variants), `SearchInput.tsx`, `SearchResults.tsx` (prices, badges, keyboard nav), `RecentSearches.tsx`, `TrendingStocks.tsx`

**Financial display:** `DataCard.tsx` (multi-column metrics), `FinancialCard.tsx` (variants: elevated/outlined/ghost/compact), `MetricDisplay.tsx` (with change indicator), `SectionHeader.tsx`, `ChangeIndicator.tsx` / `ChangeBadge.tsx` / `ChangeText.tsx`

**Strategy Backtest** (`client/src/components/strategy-backtest/`): `TickerCombobox.tsx`, `BacktestProgress.tsx`, `BacktestCandlestickChart.tsx`, `EquityCurveChart.tsx`

**Stock Detail** (`client/src/components/stock-detail/`): `price-chart/` (ChartContainer, ChartControls, ChartLegend, ChartToolbar + hooks), `StockScorecard.tsx`, `FinancialSankey.tsx`, `FinancialStatementsSection.tsx`, `ReverseDCFCard.tsx`, `ShareholdingPattern.tsx`, `AnalystRecommendationCard.tsx`, `GenerateAlphaCard.tsx`

**TipTease** (`client/src/components/tip-tease/`): `ChatInterface.tsx`, `ChatMessage.tsx`, `ChatInput.tsx`, `AskAIInput.tsx`, `ExamplePrompts.tsx`, `HeroSection.tsx`, `TodaySummary.tsx`, `ContextualHint.tsx`

**Developer** (`client/src/components/developer/`): `ApiKeyCard.tsx`, `CreateKeyDialog.tsx`, `UsageChart.tsx`, `CodeExamples.tsx`

**Admin** (`client/src/components/admin/`): `AdminGuard.tsx`, `AdminLayout.tsx`, `AdminNav.tsx`

**Auth:** `AuthGuard.tsx`, `PageGuard.tsx`, `AccessGuard.tsx`

### Data Fetching Pattern
Separate data fetching into dedicated components to prevent setState-in-render issues:
```tsx
export default function MarketMoversSection({ category }) {
  const { data, isLoading, error } = useMarketMovers({ category });
  // Handle loading/error/data rendering
}
```

## Database Schema Changes

Using Drizzle ORM:
1. Edit schema in `shared/schema.ts`
2. Run `npm run db:push` to apply changes

Financial data tables are in the external database (not managed by Drizzle).

## Database Accessor Patterns

### TimeframeDataAccessor (`server/db_timeframe_accessor.py`)
Access to OHLC price history in TimescaleDB. Supports: `ohlc_1min_intraday`, `ohlc_1hour`, `ohlc_daily`, `ohlc_weekly`, `ohlc_monthly`.
- Timestamp column varies: `ts` (1min/1hour), `day`, `week`, `month`
- Key methods: `fetch_ohlc()`, `fetch_latest_close()`, `get_available_timeframes()`

### LTPDataAccessor (`server/db_ltp_accessor.py`)
Real-time LTP data from `ltp_live` table. Cleared EOD.
- Key methods: `get_ltp_by_symbol()`, `get_latest_ltp()`, `get_latest_ltps()`, `calculate_change_percent()`

### Indicator Calculator (`server/indicator_calculator.py`)
On-demand technical indicators from OHLC data. Pandas vectorized, ~200-500ms per ticker.
- Functions: `calculate_sma()`, `calculate_ema()`, `calculate_rsi()`, `calculate_atr()`, `calculate_macd()`, `calculate_bollinger_bands()`, `calculate_supertrend()`, `calculate_volume_sma()`, `calculate_all_indicators()`
- Standard set (24): SMA (20/50/100/200), EMA (9/12/26/50/200), MACD, RSI 14, ATR 14, Supertrend (7,3 and 10,3), Bollinger Bands 20, Volume SMA 20

### Market Hours (`server/market_hours.py`)
NSE market status: Pre-market 8:00-9:15, Open 9:15-15:30, Post-market 15:30-17:00, Closed otherwise. Weekends closed.
- Functions: `is_market_open()`, `get_market_status()`, `is_data_fresh()`, `format_relative_time()`

### Stock Analysis Modules
- `server/stock_scorecard.py` - 7-dimension scorecard calculation (30-min cache)
- `server/sankey.py` - Sankey diagram data builder (income/cashflow/balance)
- `server/reverse_dcf.py` - Reverse DCF calculator (1-hour cache for defaults)
- `server/shareholding_scraper.py` - Scrapes screener.in for shareholding data (6-hour cache)

## Environment Variables

See `.env.example` for the full list. Key groups:

**Node.js Backend:** `DATABASE_URL`, `PORT` (5000), `CORS_ORIGINS`

**Redis & Celery:** `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`

**Auth Database:** `AUTH_DB_HOST`, `AUTH_DB_PORT`, `AUTH_DB_NAME`, `AUTH_DB_USER`, `AUTH_DB_PASSWORD`

**JWT:** `JWT_SECRET`, `JWT_ACCESS_EXPIRY` (6h), `JWT_REFRESH_EXPIRY` (7d)

**Google OAuth:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `GOOGLE_CALLBACK_URL_PROD`

**Email (AWS SES + SMTP):** `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`

**Frontend (Vite):** `VITE_GRADIO_BASE_URL` (http://localhost:7860), `VITE_AUTH_BASE_URL` (http://localhost:5000)

**Python Backend:** `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `PYTHON_PORT` (7860), `UVICORN_WORKERS`, `CORS_ORIGINS`

**TipTease:** `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_BASE_URL`

**API Key Encryption:** `API_KEY_ENCRYPTION_KEY`

## Design System

### Typography
- **Font Stack:** Inter (primary), JetBrains Mono (monospace for prices/tickers)
- Page Titles: `text-3xl font-semibold`, Section Headers: `text-xl font-semibold`
- Card Titles: `text-base font-medium`, Body: `text-sm`, Financial Data: `text-lg font-semibold`
- Labels/Tickers: `text-xs uppercase tracking-wide`

### Layout & Spacing
- **Container:** `max-w-7xl mx-auto` with `px-4 md:px-8`
- Section padding: `py-12`, Card padding: `p-4` to `p-6`, Grid gaps: `gap-4`

### Component Patterns
- **Cards:** `hover-elevate` utility, `bg-card` backgrounds
- **Charts:** lightweight-charts + `getCSSColor()` for theme-aware colors
- **Empty States:** Center-aligned icon, heading, description, CTA (`py-16`)
- **Loading:** `useSmartLoader` hook with skeleton components (300ms delay)
- **Code Badges:** `bg-accent text-accent-foreground`
- **Mobile Nav:** Sheet with drawer from left

### Data Visualization
- `ChangeIndicator` / `ChangeBadge` / `ChangeText` components
- Percentages: +/- sign, 2 decimals, directional styling
- Number formatting: Indian system (lakhs, crores), currency ₹
- Color: `text-positive` (green), `text-negative` (red), `text-neutral` (gray)

### Responsive Breakpoints
Mobile: base, Tablet: `md:` (768px+), Desktop: `lg:` (1024px+), Wide: `xl:` (1280px+)

## Known Issues & Notes

1. **No Testing Infrastructure.** Recommend Vitest (frontend), Jest (backend).
2. **Pricing Page** disabled in App.tsx (awaiting Stripe integration).
3. **Session Cleanup** not yet implemented (planned periodic job for expired sessions).
4. **Dynamic Imports for OAuth** - Server uses dynamic imports to load env vars before OAuth modules.
5. **Dual Backend CORS** - Both backends must share `CORS_ORIGINS` config. See `DEPLOYMENT.md`.
6. **Hidden Pages** - Portfolio, Watchlist, News, Learn exist but are hidden (not implemented).
7. **Google OAuth Setup** - Callback URLs must be added to Google Cloud Console authorized redirect URIs.
