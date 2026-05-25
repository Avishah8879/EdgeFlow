# EquityPro v1 — UI Rebuild Status Report

> Last updated 2026-05-07 from the `equitypro_new_ui` branch. Companion to
> [MIGRATION_PLAN.md](MIGRATION_PLAN.md) and [FT_PANEL_REBUILDS.md](FT_PANEL_REBUILDS.md).
> Reference design: [design/equitypro-v1/](design/equitypro-v1/) (56 HTML pages).

**Recent updates (2026-05-07)**: Admin design primitives library added at
[client/src/components/admin/primitives.tsx](EdgeFlow/client/src/components/admin/primitives.tsx)
(`AdminKpiStrip`, `AdminPanel`, `AdminFeedRow`, `AdminHealthRow`,
`AdminAvatar`, `AdminPill`, `AdminNumCell`). 7 admin pages deep-rebuilt
using the new primitives — see commits `97069a1` and `1eb9d3e`.

This report classifies every page touched on the branch into three tiers
of effort, so the remaining work is easy to scope and prioritize.

---

## Tier definitions

| Tier | What it means | Visual outcome |
|--|--|--|
| **🟢 Deep rebuild** | New layout + new components built from the design spec. Real data wired. KPI tiles, custom matrices, multi-panel dashboards. Internals replaced — not just chrome. | Pixel-close to `design/equitypro-v1/{page}.html`. |
| **🟡 Full page rebuild** | Page-level layout overhaul to match the design — masthead, hero, primary cards, table styling, form layout. Existing data hooks reused. Panel internals largely new. | Same look as the rebuilt examples for general-purpose pages (auth, account, browse, premium gates). |
| **⚪ Basic UI update** | Page wrapper / shell updated to the new design tokens + EquityPro masthead (Eyebrow + Playfair display H1 + gold rule). Panel body still uses the old EdgeFlow styling underneath. | Header strip looks new, body still feels like old EdgeFlow. |

---

## 🟢 Tier 1 — Deep rebuilds (11 pages)

These have new components, real data, and full design-spec match.

| # | Page | Route | Commit | What was built |
|--|--|--|--|--|
| 1 | Dashboard / Home | `/home` | `8a69fb5` | Hero ribbon, market mood gauge, marquee, segmented index strip, top movers grid, sector heatmap, watchlist tiles. |
| 2 | Stock Detail | `/stocks/:symbol` | `8a69fb5` | Eyebrow masthead, price hero, 7-dim scorecard, Sankey, reverse-DCF card, shareholding chart, news + analyst rails. |
| 3 | FII / DII | `/fii-dii` | `890e197` | KPI strip, paired bars, cumulative line, session table. **Reference template for all FT panels.** |
| 4 | Black-Scholes calculator | `/black-scholes` | `6937d90` | 340px sidebar with sliders, gold-bordered theoretical-price card, 5-col Greeks row, dual charts, formula card. New IV solver + dividend yield. |
| 5 | Stock Comparator | `/compare` | `3c40202` | Pill selector, rebased perf chart with 1M-5Y + return-mode tabs, 15-row metrics table, correlation matrix, risk-return scatter. New `/api/compare/metrics`. |
| 6 | Monitor | `/monitor` | `fa04f6c` + `6114ada` | 3 quote tiles + 4 ranking tables (gainers / losers / 52w highs / 52w lows) + FII-DII strip + News rail + sector heat. New `/api/monitor/sector-heat` + `/api/monitor/extremes`. |
| 7 | Most Active | `/most-active` | `945155d` | 6 sub-tabs (Volume / Value / Gainers / Losers / 52w High / 52w Low), 4 hero cards, Top-25 table with sector + value-cr + 52w-band bar + volume bar. New `/api/most-active`. |
| 8 | World Indices | `/world-indices` | `945155d` | 5 regional sections (India / Asia-Pacific / Europe / Americas / Commodities & FX), session badges, sparklines, day range, YTD + 30d vol. New `/api/world-indices`. |
| 9 | News | `/news` | `945155d` | Featured article + 8 chip filters (All / Market / Earnings / M&A / Economic / General / Bullish / Bearish) + 2-column story list. |
| 10 | IPOs | `/ipos` | `945155d` | Coming-soon card with EquityPro chrome (data feed for calendar / GMP / subscriptions / allotments not yet built). |
| 11 | Option Chain | `/options/:symbol?` | `1b2c590` | Header strip, 4-tile KPI (Max Pain / PCR / ATM IV / Total OI), 13-col matrix with ATM gold highlight + ITM tinting + OI bars + OI Δ + Delta Greeks. 3 bottom panels (OI Profile / IV Smile / Chain Pulse). New Celery `snapshot_options_oi` task + `/api/options/{symbol}` summary fields. |
| 12 | Admin Dashboard | `/admin` | `97069a1` | 5-tile KPI strip (Active users / Premium / Revenue 24h / Logins / Coins) + activity feed + system-health meters + role-mix panel. |
| 13 | Admin Users | `/admin/users` | `97069a1` | Editorial table with avatar circles + role/tier `AdminPill`s, filter panel, bulk action toolbar (tier change / revoke sessions / export), expanded user detail modal with grant-coins. All TanStack mutations preserved. |
| 14 | Admin CoinTransactions | `/admin/coins` | `97069a1` | Filter panel + ledger table with mono +/- amounts, type pill, platform name resolution, CSV export. |
| 15 | Admin CoinPacks | `/admin/coin-packs` | `97069a1` | Custom-amount pricing panel + packs table with live-status switch + edit / delete dialogs. |
| 16 | Admin Notifications | `/admin/notifications` | `1eb9d3e` | Pill-tagged notification cards with type icons (info / warn / success / error), AdminPanel container, toggle/delete actions, create dialog (title / message / target / dismissible / scheduled-end). |
| 17 | Admin API Keys | `/admin/api-keys` | `1eb9d3e` | 4-tile KPI strip (active / total / enterprise / admin), filter panel (search / tier / status), 8-col table with tier+type+status pills, create+revoke dialogs unchanged. |
| 18 | Admin Security | `/admin/security` | `1eb9d3e` | 4-tile KPI strip (sessions / locked / failed / posture), Locked Accounts + Active Sessions panels with avatar rows, Security Policies panel with pill-tagged values. Super-admin only. |

---

## 🟡 Tier 2 — Full page rebuilds (~17 pages)

Page layout reworked to match the design — same standard as Tier 1 but
without bespoke domain widgets (no KPI grids / heatmaps / chain matrix).

### P0 — Monetization & core flows (5 pages, `d27af72`)

| Page | Route | File |
|--|--|--|
| Pricing | `/pricing` (currently disabled, awaiting Stripe) | [Pricing.tsx](EdgeFlow/client/src/pages/Pricing.tsx) |
| Profile | `/profile` | [Profile.tsx](EdgeFlow/client/src/pages/Profile.tsx) |
| Screener | `/screener` | [Screener.tsx](EdgeFlow/client/src/pages/Screener.tsx) |
| Stocks browser | `/stocks` | [Stocks.tsx](EdgeFlow/client/src/pages/Stocks.tsx) |
| Indices | `/indices` + `/index/:symbol` | [Indices.tsx](EdgeFlow/client/src/pages/Indices.tsx), [IndexDetail.tsx](EdgeFlow/client/src/pages/IndexDetail.tsx) |

### P1 — Auth cluster (5 pages, `d421fe3`)

| Page | Route | File |
|--|--|--|
| Login | `/login` | [EquityProLogin.tsx](EdgeFlow/client/src/pages/EquityProLogin.tsx) |
| Signup | `/signup` | [EquityProSignup.tsx](EdgeFlow/client/src/pages/EquityProSignup.tsx) |
| Forgot password | `/forgot-password` | [EquityProForgotPassword.tsx](EdgeFlow/client/src/pages/EquityProForgotPassword.tsx) |
| OAuth callback | `/auth/callback` | [AuthCallback.tsx](EdgeFlow/client/src/pages/AuthCallback.tsx) |
| OAuth setup | `/auth/oauth-setup` | [OAuthSetup.tsx](EdgeFlow/client/src/pages/OAuthSetup.tsx) |

### P2 — Saved results / shared views (4 pages, `d421fe3`)

| Page | Route | File |
|--|--|--|
| Saved results hub | `/saved-results` | [SavedResults.tsx](EdgeFlow/client/src/pages/SavedResults.tsx) |
| Saved screener detail | `/saved-results/screener/:id` | [SavedScreenerDetail.tsx](EdgeFlow/client/src/pages/SavedScreenerDetail.tsx) |
| Saved backtest detail | `/saved-results/backtest/:id` | [SavedBacktestDetail.tsx](EdgeFlow/client/src/pages/SavedBacktestDetail.tsx) |
| Shared results (public) | `/shared/{screener,backtest}/:token` | [SharedResult.tsx](EdgeFlow/client/src/pages/SharedResult.tsx) |

### P3 — Premium feature pages (2 pages, `d421fe3`)

| Page | Route | File |
|--|--|--|
| TipTease AI Chat | `/tip-tease` | [TipTease.tsx](EdgeFlow/client/src/pages/TipTease.tsx) |
| Developer API portal | `/developers` | [Developers.tsx](EdgeFlow/client/src/pages/Developers.tsx) |

> Note: `/alpha-generation` was **removed** and now redirects to the external
> EquityPro AI tool ([commit 2885568](https://github.com/Avishah8879/EdgeFlow/commit/2885568)).

---

## ⚪ Tier 3 — Basic UI updates (masthead-only) (~38 pages)

These have the new EquityPro masthead and the brand tokens are flowing through,
but the **panel body still uses the old EdgeFlow styling** (`bg-card/50
border-primary/20`, raw `text-green-500` / `text-red-500`, default shadcn cards).

### Financial Terminal panels (16 pages remaining, masthead from `2a55239`)

These all need full deep rebuilds matching the FII/DII / Black-Scholes / Compare / Monitor template.

| Group | Page | Route | Effort |
|--|--|--|--|
| **Charts / Trading** | Advanced Chart | `/chart/:symbol?` | L |
| | Order Book | `/order-book/:symbol?` | M |
| | Time & Sales | `/time-sales/:symbol?` | S |
| | Watchlist | `/watchlist` | M |
| **Options** | Options Visualizer | `/options-visualizer/:symbol?` | L |
| **Analysis / Tools** | Pair Trading | `/pair-trading` | L |
| | Pattern Search | `/pattern-search` | M |
| | Portfolio Optimizer | `/portfolio-optimizer` | L |
| | Calculator | `/calculator` | M |
| | Equity Screener (FT) | `/equity-screener` | M |
| **Research / Events** | Research Reports | `/research-reports` | S |
| | Corporate Actions | `/corporate-actions/:symbol?` | S |
| | Financial Results | `/financial-results/:symbol?` | M |
| **Personal / Community** | Notes | `/notes` | M |
| | Forum | `/forum` | M |
| | Help | `/help` | S |

S = ~30–60 min · M = 1–2 h · L = 2–4 h (may need new endpoint)

### Admin pages — partially rebuilt (5 of 13 still pending)

**Deep-rebuilt** (7): `/admin`, `/admin/users`, `/admin/notifications`,
`/admin/api-keys`, `/admin/security`, `/admin/coin-packs`, `/admin/coins`
(see commits `97069a1`, `1eb9d3e`).

**Partially rebuilt** (1): `/admin/analytics` — 4-tile KPI strip swapped to
the new `AdminKpiStrip` primitive; the 9 chart-heavy tabs below still use
generic shadcn cards.

**Still on Tier 3 — masthead-only** (5):
- `/admin/audit` — large tabbed audit-log table (929 lines)
- `/admin/feature-flags` — 1,005-line CRUD + audit + overrides
- `/admin/rate-limits` — 893-line CRUD + violations dashboards
- `/admin/settings` — 682-line categorised config editor
- `/admin/email-settings` — 816-line preferences + queue + templates

These 5 are the largest admin pages and need a dedicated follow-up
batch. Lower priority because only staff sees them.

### Content pages (7 pages, masthead from `b6ef99b`)

| Page | Route | File |
|--|--|--|
| Blog | `/blog` | [Blog.tsx](EdgeFlow/client/src/pages/Blog.tsx) |
| Advanced Strategies (blog) | `/blog/advanced-strategies` | [AdvancedStrategies.tsx](EdgeFlow/client/src/pages/AdvancedStrategies.tsx) |
| Market Reports hub | `/market-reports` | [MarketReports.tsx](EdgeFlow/client/src/pages/MarketReports.tsx) |
| Steel sector outlook | `/market-reports/steel` | [pages/market-reports/SteelSectorOutlook.tsx](EdgeFlow/client/src/pages/market-reports/SteelSectorOutlook.tsx) |
| Gas sector outlook | `/market-reports/gas` | [pages/market-reports/GasSectorOutlook.tsx](EdgeFlow/client/src/pages/market-reports/GasSectorOutlook.tsx) |
| Healthcare sector outlook | `/market-reports/healthcare` | [pages/market-reports/HealthcareSector.tsx](EdgeFlow/client/src/pages/market-reports/HealthcareSector.tsx) |
| Privacy Policy | `/privacy` | [PrivacyPolicy.tsx](EdgeFlow/client/src/pages/PrivacyPolicy.tsx) |

### Misc (3 pages, masthead from `b6ef99b`)

| Page | Route | File |
|--|--|--|
| Seasonality | `/seasonality` | [Seasonality.tsx](EdgeFlow/client/src/pages/Seasonality.tsx) |
| Portfolio (hidden) | `/portfolio` | [Portfolio.tsx](EdgeFlow/client/src/pages/Portfolio.tsx) |
| Fyers token update | `/fyers-token` | [FyersTokenUpdate.tsx](EdgeFlow/client/src/pages/FyersTokenUpdate.tsx) |

---

## Out of scope / no rebuild needed

| Page | Route | Reason |
|--|--|--|
| Landing | `/` | Has its own bespoke marketing hero with HalvorsenAttractor 3D animation — kept intentionally. |
| Learn | (no route) | Hidden per [MIGRATION_PLAN.md](MIGRATION_PLAN.md) decision 3. |
| `/_design` | internal | Component showcase page. |
| Changelog, Systematic Patterns | `/changelog`, `/systematic-patterns` | Not in reference set; auto-themed by token swap. |
| 404 / Not Found | catch-all | Trivial; auto-themed. |

---

## Totals

| Tier | Pages | Status |
|--|--|--|
| 🟢 Deep rebuild | **18** | shipped |
| 🟡 Full page rebuild | **17** | shipped |
| ⚪ Basic UI update (masthead-only) | **~31** | **pending deep rebuild** |
| Out of scope | **~6** | n/a |
| **Total touched** | **~72 pages** | |

**Pending work breakdown** (~31 pages):
- 16 FT panels (largest visual debt for active users)
- 5 large admin pages (Audit / FeatureFlags / RateLimits / Settings / EmailSettings)
- 7 content pages (Blog / sector outlooks / privacy)
- 3 misc (Seasonality / Portfolio / Fyers token)

**Auth pages note**: All 5 auth pages already use `AuthShell`, brand
tokens, `font-display` headings, mono numerics, and the design's
editorial chrome. They were previously listed in Tier 2; this audit
confirmed they meet Tier 1 (deep rebuild) standards already.

---

## Reference

- Design source: [design/equitypro-v1/](EdgeFlow/design/equitypro-v1/) — 56 reference HTML pages
- Brand tokens & primitives: [CLAUDE.md](EdgeFlow/CLAUDE.md), [client/src/components/ui/](EdgeFlow/client/src/components/ui/), [client/src/components/viz/](EdgeFlow/client/src/components/viz/)
- Templates to copy from: [Home.tsx](EdgeFlow/client/src/pages/Home.tsx), [StockDetail.tsx](EdgeFlow/client/src/pages/StockDetail.tsx), [FiiDii.tsx](EdgeFlow/client/src/pages/ft/FiiDii.tsx), [BlackScholesPanel.tsx](EdgeFlow/client/src/components/ft/BlackScholesPanel.tsx)
- Companion trackers: [MIGRATION_PLAN.md](EdgeFlow/MIGRATION_PLAN.md), [FT_PANEL_REBUILDS.md](EdgeFlow/FT_PANEL_REBUILDS.md), [errors_to_resolve.md](EdgeFlow/errors_to_resolve.md)
