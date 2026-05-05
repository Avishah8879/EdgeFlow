# EquityPro v1 — UI Migration Plan

> Auto-generated record of the migration approach approved before code was written. Mirror of [.claude plan](C:\Users\getav\.claude\plans\squishy-bouncing-salamander.md). Per [design/equitypro-v1/CLAUDE.md](design/equitypro-v1/CLAUDE.md), each phase ends with **stop and show diff** for human review.

## Context

The reference design at [design/equitypro-v1/](design/equitypro-v1/) is a finished visual spec — 56 static HTML pages plus `app.css`, `colors_and_type.css`, `partials/topbar.html`, and brand assets. The host is a mature React 18 + Vite + Tailwind v3 + shadcn ("new-york" variant) + Wouter app with 51 of the 56 reference pages already implemented. **This is a re-skin, not a rewrite.** API routes, data hooks, auth flows, Cashfree, coin wallet, admin dashboard all stay untouched.

**Decisions locked**:
1. **Brand** = EquityPro (navy `#1F3A5F` + gold `#C8A04A`). Coral primary retires.
2. **Theme default** = **light-first** (matches the design source). `:root` holds light tokens; `.dark` holds dark overrides.
3. **Hidden pages**: skip Learn; **migrate** Portfolio and add it to the sidebar.

---

## 1. Token destination

- [client/src/index.css](client/src/index.css) — `:root` (light, default) + `.dark` (dark overrides). Existing `.light` block deleted (light is default; the existing decorative `.light .X` rules in this file will continue to fire when next-themes adds `class="light"`).
- [tailwind.config.ts](tailwind.config.ts) — extends Tailwind colors / fonts / radii / shadows referencing the CSS vars.
- All values are HSL component triplets (`H S% L%`), so `hsl(var(--token) / <alpha>)` works.

### Token diff highlights (host current → design light-mode `:root`)

| Token | Host (was, dark `:root`) | Design (new, light `:root`) |
|--|--|--|
| `--primary` | `11 100% 64%` (coral) | `212 51% 24%` (brand navy) |
| `--background` | `220 20% 6%` | `210 25% 98%` |
| `--foreground` | `210 20% 95%` | `213 41% 18%` |
| `--card` | `220 20% 9%` | `0 0% 100%` |
| `--ring` | derived from primary | `38 56% 53%` (brand gold) |
| `--positive` | `150 80% 45%` | `150 60% 35%` |
| `--negative` | `0 72% 51%` | `0 72% 45%` |
| `--chart-1..5` | coral / neon green / amber / purple / pink | navy / sky / gold-bright / gold / purple |
| `--font-sans` | Geist | Inter |
| `--font-mono` | Geist Mono | JetBrains Mono |
| `--font-display` | (none) | Playfair Display (editorial only) |
| `--radius` | `0.75rem` | `0.5rem` |

### New tokens introduced
- `--brand-{navy,navy-deep,gold,gold-bright,sky,silver}` — brand anchors
- `--shadow-{card,card-lg,glow-primary,glow-gold}` — calibrated card + glow
- `--ls-{tight,normal,wide,uppercase}` — letter-spacing scale (eyebrow `0.12em`)
- `--lh-{tight,snug,base,loose}` — line-height scale
- `--ease-{out,bounce,spring}` + `--t-{fast,base,slow}` — motion vocabulary
- `--space-1..16` — explicit spacing scale (Tailwind covers this; alias only if a component references `var(--space-N)`)

---

## 2. Reference page → host route table (56 pages)

Status: **extant** = host has page → re-skin only · **partial** = page exists, no nav route → wire up · **missing** = build new · **n/a** = sitemap

| Reference HTML | Host route | Host page file | Status |
|--|--|--|--|
| index.html | `/` | RootRedirect (App.tsx) | extant |
| dashboard.html | `/home` | pages/Home.tsx | extant |
| pricing.html | `/pricing` | pages/Pricing.tsx | extant |
| privacy-policy.html | `/privacy` | pages/PrivacyPolicy.tsx | extant |
| login.html | `/login` | pages/EquityProLogin.tsx | extant |
| signup.html | `/signup` | pages/EquityProSignup.tsx | extant |
| forgot.html | `/forgot-password` | pages/EquityProForgotPassword.tsx | extant |
| auth-callback.html | `/auth/callback` | pages/AuthCallback.tsx | extant |
| oauth-setup.html | `/auth/oauth-setup` | pages/OAuthSetup.tsx | extant |
| fyers-token.html | `/fyers-token` | pages/FyersTokenUpdate.tsx | extant |
| profile.html | `/profile` | pages/Profile.tsx | extant |
| developers.html | `/developers` | pages/Developers.tsx | extant |
| tip-tease.html | `/tip-tease` | pages/TipTease.tsx | extant |
| stock-detail.html | `/stocks/:ticker` | pages/StockDetail.tsx | extant |
| stocks.html | `/stocks` | pages/Stocks.tsx | extant |
| screener.html | `/screener` | pages/Screener.tsx | extant |
| backtesting.html | `/alpha-generation` | pages/StrategyBacktesting.tsx | extant |
| indices.html | `/indices` | pages/Indices.tsx | extant |
| watchlist.html | `/watchlist` | pages/ft/Watchlist.tsx | extant |
| portfolio.html | `/portfolio` | pages/Portfolio.tsx | partial — no sidebar entry |
| saved-results.html | `/saved-results` | pages/SavedResults.tsx | extant |
| news.html | `/news` | pages/ft/NewsPage.tsx | extant |
| market-reports.html | `/market-reports` | pages/MarketReports.tsx | extant |
| blog.html | `/blog` | pages/Blog.tsx | extant |
| learn.html | (no route) | pages/Learn.tsx | **skip** |
| seasonality.html | `/seasonality` | pages/Seasonality.tsx | extant |
| advanced-strategies.html | `/blog/advanced-strategies` | pages/AdvancedStrategies.tsx | extant |
| advanced-chart.html | `/chart/:symbol?` | pages/ft/AdvancedChart.tsx | extant |
| time-sales.html | `/time-sales/:symbol?` | pages/ft/TimeSales.tsx | extant |
| order-book.html | `/order-book/:symbol?` | pages/ft/OrderBook.tsx | extant |
| compare.html | `/compare` | pages/ft/Compare.tsx | extant |
| most-active.html | `/most-active` | pages/ft/MostActive.tsx | extant |
| world-indices.html | `/world-indices` | pages/ft/WorldIndices.tsx | extant |
| option-chain.html | `/options/:symbol?` | pages/ft/OptionChain.tsx | extant |
| ft-options-visualizer.html | `/options-visualizer/:symbol?` | pages/ft/OptionsVisualizer.tsx | extant |
| black-scholes.html | `/black-scholes` | pages/ft/BlackScholes.tsx | extant |
| fii-dii.html | `/fii-dii` | pages/ft/FiiDii.tsx | extant |
| corporate-actions.html | `/corporate-actions/:symbol?` | pages/ft/CorporateActions.tsx | extant |
| pair-trading.html | `/pair-trading` | pages/ft/PairTrading.tsx | extant |
| pattern-search.html | `/pattern-search` | pages/ft/PatternSearch.tsx | extant |
| portfolio-optimizer.html | `/portfolio-optimizer` | pages/ft/PortfolioOptimizer.tsx | extant |
| calculator.html | `/calculator` | pages/ft/FinancialCalculatorPage.tsx | extant |
| monitor.html | `/monitor` | pages/ft/Monitor.tsx | extant |
| notes.html | `/notes` | pages/ft/Notes.tsx | extant |
| research-reports.html | `/research-reports` | pages/ft/ResearchReports.tsx | extant |
| financial-results.html | `/financial-results/:symbol?` | pages/ft/FinancialResultsPage.tsx | extant |
| ipo.html | `/ipos` | pages/ft/IpoPage.tsx | extant |
| forum.html | `/forum` | pages/ft/Forum.tsx | extant |
| help.html | `/help` | pages/ft/Help.tsx | extant |
| admin.html | `/admin` | pages/admin/AdminDashboard.tsx | extant |
| admin-analytics.html | `/admin/analytics` | pages/admin/AdminAnalytics.tsx | extant |
| admin-users.html | `/admin/users` | pages/admin/AdminUsers.tsx | extant |
| admin-feature-flags.html | `/admin/feature-flags` | pages/admin/AdminFeatureFlags.tsx | extant |
| admin-audit-logs.html | `/admin/audit` | pages/admin/AdminAuditLogs.tsx | extant |
| admin-coin-packs.html | `/admin/coin-packs` | pages/admin/AdminCoinPacks.tsx | extant |
| admin-coin-transactions.html | `/admin/coins` | pages/admin/AdminCoinTransactions.tsx | extant |
| admin-email-settings.html | `/admin/email-settings` | pages/admin/AdminEmailSettings.tsx | extant |
| admin-api-keys.html | `/admin/api-keys` | pages/admin/AdminApiKeys.tsx | extant |
| all-pages.html | — | — | n/a |

Host pages NOT in the reference (kept as-is, auto-themed by token swap): `/index/:symbol`, `/changelog`, `/systematic-patterns`, `/saved-results/screener/:id`, `/saved-results/backtest/:id`, `/shared/screener/:token`, `/shared/backtest/:token`, `/blog/{steel,gas,healthcare}-sector-outlook`, additional admin pages (notifications, settings, security, rate-limits, platforms, signup-bonus, feature-costs, payments).

---

## 3. New component primitives

| Component | Location | Notes |
|--|--|--|
| `Eyebrow` | `client/src/components/ui/eyebrow.tsx` | `<span>`, uppercase, `letter-spacing-uppercase`, gold or muted |
| `DeltaBadge` | `client/src/components/ui/delta-badge.tsx` | Mono + `tabular-nums` + arrow + SR-only "up"/"down" |
| `MarketStatusPill` | `client/src/components/ui/market-status-pill.tsx` | Extend existing `MarketStatusBadge.tsx` to design's pulse-dot + pill |
| `ChipFilter` | `client/src/components/ui/chip-filter.tsx` | Pill button, active=primary |
| `TabBar` | `client/src/components/ui/tab-bar.tsx` | Underline-on-active, wraps shadcn Tabs |
| `Sparkline` | `client/src/components/viz/sparkline.tsx` | 84×24 SVG, Recharts |
| `KpiTile` | `client/src/components/viz/kpi-tile.tsx` | Eyebrow + mono value + DeltaBadge |
| `ScorecardRing` | `client/src/components/viz/scorecard-ring.tsx` | SVG donut with stroke-dasharray |
| `HeatmapCell` | `client/src/components/viz/heatmap-cell.tsx` | 7-step diverging scale |
| `PayoffChart` | `client/src/components/viz/payoff-chart.tsx` | Recharts LineChart + ReferenceLine |
| `ScoreBar` | `client/src/components/viz/score-bar.tsx` | Inline progress bar (gold fill) |
| `TargetTrack` | `client/src/components/viz/target-track.tsx` | Horizontal SVG track with markers |
| `SentimentGauge` | `client/src/components/viz/sentiment-gauge.tsx` | Radial SVG gauge (verify existing one matches) |
| `HealthMeter` | `client/src/components/viz/health-meter.tsx` | Mini progress + uptime % |
| `LayoutToggle` | local to `pages/Home.tsx` | Dashboard's Classic / Focus / Terminal switcher |
| `SectorHeatmap` | `client/src/components/dashboard/sector-heatmap.tsx` | 6-col grid wired to `heatmap_sector_data` |
| `AlphaCTA` | `client/src/components/dashboard/alpha-cta.tsx` | Gradient navy card with gold glow |

`/_design` showcase route — `client/src/pages/DesignShowcase.tsx` — `AuthGuard`-only, renders every primitive in light + dark.

---

## 4. Conflicts already addressed

- **Brand color flip** — coral → navy/gold. Resolved (locked decision).
- **Theme default** — host already defaults to light (`defaultTheme="light"` in [App.tsx](client/src/App.tsx)). No flip needed despite earlier plan note.
- **Sidebar always-navy** — design renders navy sidebar in both themes; host's `--sidebar` token will hold navy in `:root` and a deeper navy in `.dark`. Component code unchanged.
- **Existing `.light .X` decorative rules** — host has rules like `.light .neumorphic-card`, `.light .dcf-table-container`. These keep firing when next-themes adds `class="light"`. Their base counterparts now apply only when theme=dark (dark gets `class="dark"`). Pattern remains semantically correct.
- **Stock Detail collapsibles** — recently shipped in commit 6330c43. Migration **preserves** this structure; re-skin visuals only.

## 5. Conflicts to address during page migration (NOT in Phase A)

- Dashboard's 3 layout modes (Classic / Focus / Terminal) — new feature; build with `LayoutToggle` + conditional grid in `Home.tsx`.
- Stock Detail's "Analyst consensus target track" — design's horizontal target bar; existing `AnalystRecommendationCard.tsx` may render differently. Re-skin to match.
- Reference's mock data (prices, news, P/L) — must NOT ship. Wire to existing hooks during page migration.
- Reference's inline-SVG charts — replace with Recharts using `--chart-1..5` tokens.
- Reference's vanilla `app.js` — DO NOT copy. Host has its own theme provider, layout, mobile nav.

---

## 6. Migration phases

### Phase A — Tokens & shell (this PR)
1. Update [client/src/index.css](client/src/index.css): `:root` = design's light tokens; replace `.light` block with `.dark` block holding design's dark overrides.
2. Update [tailwind.config.ts](tailwind.config.ts): add `fontFamily.display`, `borderRadius.{xl,2xl,pill}`, `boxShadow.{card,'card-lg','glow-primary','glow-gold'}`, `transitionTimingFunction.{spring,bounce}`, `transitionDuration.{fast,base,slow}`, `letterSpacing.uppercase`.
3. Update [client/index.html](client/index.html): swap Geist Google Fonts link → Inter + JetBrains Mono + Playfair Display.
4. Create `client/src/components/EquityProLogo.tsx` (shield SVG + EquityPro wordmark).
5. Re-wire [Topbar.tsx](client/src/components/layout/Topbar.tsx) to use `EquityProLogo`.
6. Update [CLAUDE.md](CLAUDE.md) project-overview + brand-identity (Tiphub/coral → EquityPro/navy+gold).
7. Smoke-test [Pricing](client/src/pages/Pricing.tsx) — confirm tokens cascade, theme toggle works in both modes.

### Phase B — Component primitives (`/_design` showcase, next PR)
Build all primitives from §3. Stop for review.

### Phase C — Foundational pages
1. Pricing + Privacy Policy (proves tokens)
2. Auth cluster — Login + Signup + Forgot + AuthCallback + OAuthSetup
3. Settings — Profile + Developers

### Phase D — Major workspaces
1. Dashboard
2. Stock Detail
3. Stocks browser, Screener, Indices

### Phase E — Long tail (batches of 5–8, grouped by section)
Markets, Charts/Data, Options, Analysis, Research, Tip-Tease/Misc, Admin pages.

---

## 7. Verification (after every phase)

- `npm run check` clean
- Theme toggle switches every token live (no FOUC, no hardcoded leftovers)
- Every `<table>` cell with a number has `font-mono tabular-nums`
- Every gain/loss color comes from `text-positive` / `text-negative`
- Existing loading / error / empty / permission states still render
- Tip-Tease + Backtest + Screener SSE still connect cleanly
- Cashfree drop-in still loads
- Coin debit + verify-on-return still works

---

## 8. Files edited in Phase A

**Edits**:
- [client/src/index.css](client/src/index.css) — token rewrite
- [tailwind.config.ts](tailwind.config.ts) — fontFamily, borderRadius, boxShadow, transitions, letterSpacing
- [client/index.html](client/index.html) — Google Fonts swap
- [client/src/components/layout/Topbar.tsx](client/src/components/layout/Topbar.tsx) — use EquityProLogo
- [CLAUDE.md](CLAUDE.md) — brand identity update

**New**:
- [client/src/components/EquityProLogo.tsx](client/src/components/EquityProLogo.tsx)
- `client/public/equitypro-shield.png`
- `client/public/equitypro-logo.svg`
- [MIGRATION_PLAN.md](MIGRATION_PLAN.md) (this file)

**No deletes** in Phase A.
