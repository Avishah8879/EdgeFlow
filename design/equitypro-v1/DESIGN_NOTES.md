# EquityPro — Design Notes (v1)

A handoff document for engineers integrating this design system into the live
EquityPro app. The reference implementation lives next to this file in
`design/equitypro-v1/` (56 static HTML pages, plus `app.css`, `app.js`, and
`assets/`).

> **Use the reference HTML as a visual spec, not as source code.** Lift tokens,
> layouts, copy, and density. Rebuild the actual pages using the existing
> framework, components, data layer, and routing.

---

## 1. Brand & visual identity

| Aspect | Decision |
| --- | --- |
| **Brand voice** | Premium, FT-style. Calm navy + gold. Restrained, not flashy. |
| **Reference brand** | Financial Times terminal × Bloomberg / Sentieo for density |
| **Tagline** | _Technical Precision · Fundamental Insight · Quantitative Rigor · Integrated Solutions_ |
| **Logo** | Navy shield with gold crown + central gold cube and rising sky-blue arrows. Wordmark is `EquityPro` in heavy Inter, tracked tight. |

---

## 2. Color tokens (canonical — copy these into your theme)

All values are stored as **HSL components** so `hsl(var(--token) / <alpha>)`
works. This pattern is compatible with shadcn/ui, Tailwind v3+ HSL token
config, and any CSS-vars-based theme provider.

### 2.1 Brand core
```css
--brand-navy:        212 51% 24%;   /* #1F3A5F  shield body, wordmark */
--brand-navy-deep:   213 41% 18%;   /* #1B2E48  deepest shadow */
--brand-gold:        38 56% 53%;    /* #C8A04A  crown / outer ring */
--brand-gold-bright: 36 87% 56%;    /* #F4A024  cube highlight */
--brand-sky:         200 64% 55%;   /* #3FA9D6  rising arrows */
--brand-silver:      0 0% 73%;      /* #B9B9B9  building blocks */
```

### 2.2 Light surfaces (default theme)
```css
--background:  210 25% 98%;   /* #F7F9FC page canvas */
--foreground:  var(--brand-navy-deep);
--border:      213 20% 88%;
--card:        0 0% 100%;
--muted:       213 22% 95%;
--muted-foreground: 213 14% 42%;
--accent:      38 50% 95%;    /* faint gold wash */
--primary:     var(--brand-navy);
--ring:        var(--brand-gold);
```

### 2.3 Dark surfaces
```css
--background:  213 41% 8%;
--foreground:  38 30% 95%;
--card:        213 41% 11%;
--border:      213 30% 18%;
--muted:       213 30% 14%;
--primary:     var(--brand-gold);   /* primary flips to gold in dark */
```

### 2.4 Financial semantics (DO NOT redefine per page)
```css
--positive: 150 60% 35%;   /* gains — calmer than typical green */
--negative: 0   72% 45%;   /* losses */
--neutral:  213 14% 45%;
--status-open:       150 60% 35%;
--status-closed:     0   72% 45%;
--status-pre-market: 38  87% 50%;
```

Use `text-positive` / `text-negative` / `change-up` / `change-down` helper
classes — never raw hex codes for gains/losses.

### 2.5 Chart palette
```css
--chart-1: var(--brand-navy);     /* primary series */
--chart-2: var(--brand-sky);      /* benchmark / secondary */
--chart-3: var(--brand-gold-bright);
--chart-4: var(--brand-gold);
--chart-5: 280 40% 55%;
--chart-volume: 213 14% 75%;
```

When wiring Recharts / visx / Lightweight Charts, map series colors to these
tokens (don't hard-code).

---

## 3. Typography

| Role | Family | Weights | Use |
| --- | --- | --- | --- |
| Sans | **Inter** | 400 / 500 / 600 / 700 / 800 | UI, body, headings (default) |
| Mono | **JetBrains Mono** | 400 / 500 / 600 | All numeric values, prices, tickers |
| Display | **Playfair Display** | 600 / 700 | Marketing hero, page-title H1 in editorial pages only |
| Serif fallback | Georgia | – | Long-form articles, blog body |

Load via Google Fonts:
```
https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&family=Playfair+Display:wght@600;700&display=swap
```

### Type scale
```
xs  0.75rem   sm  0.875rem   base 1rem    lg  1.125rem
xl  1.25rem   2xl 1.5rem     3xl  1.875   4xl 2.25rem
5xl 3rem
```

### Critical type rules
- **All numeric values** (prices, percentages, P/E, volume, market cap) must
  use `font-family: var(--font-mono)` with `font-variant-numeric: tabular-nums`.
  Never break this rule — it's the "premium terminal" signal.
- **Eyebrow / section labels** use the `.eyebrow` class:
  `font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 600`.
  This mirrors the spaced-uppercase tagline under the wordmark.
- **Hero H1s** in marketing pages may use Playfair italic for an emphasized
  word (e.g. _"Research like an analyst, <em>trade like a quant.</em>"_).
- Never use system font, Roboto, Arial, or any other family.

---

## 4. Spacing, radii, shadows, motion

```css
--radius-sm: 0.375rem;  --radius-md: 0.5rem;   --radius-lg: 0.75rem;
--radius-xl: 1rem;      --radius-2xl: 1.25rem; --radius-pill: 9999px;

--shadow-card:    0 2px 8px hsl(213 30% 20% / 0.08);
--shadow-card-lg: 0 8px 24px hsl(213 30% 20% / 0.12);

--t-fast: 150ms;  --t-base: 300ms;  --t-slow: 500ms;
--ease-out:    cubic-bezier(0.4, 0, 0.2, 1);
--ease-spring: cubic-bezier(0, -0.02, 0.4, 1.25);
```

Spacing scale follows Tailwind defaults (`0.25rem` increments). Most cards
use `padding: 18–22px`, `border-radius: var(--radius-lg)`.

---

## 5. Layout primitives

- **Top bar** — `64px` tall, sticky, `backdrop-filter: blur(12px)`, hairline
  bottom border. Contains brand lockup + nav + market-status pill + theme
  toggle + avatar.
- **Container** — `max-width: 1440px`, `padding: 0 32px`.
- **Page header** — `padding: 24–28px 0`, eyebrow + display H1 + subtle muted
  byline. Sits inside `<section>` with `background: hsl(var(--card))` and a
  hairline bottom border.
- **Two-column research layouts** — `grid-template-columns: 1fr 320px`,
  `gap: 20–24px`. Right column is the side rail (insights / related / etc.).
- **Three-column terminal layouts** — `grid-template-columns: 280px 1fr 320px`.
  Left rail is navigation/list; center is the workspace; right is context.

---

## 6. Component vocabulary

These show up across most pages — extract them as React components first,
then build the pages on top.

| Component | Where it appears | Notes |
| --- | --- | --- |
| `<Eyebrow>` | Above every page H1 | Uppercase, gold or muted |
| `<KpiTile>` | Dashboard, Portfolio header | Eyebrow + mono value + delta |
| `<ScorecardRing>` | Stock detail | SVG donut with center label |
| `<Sparkline>` | Watchlist, dashboard | 84×24 SVG, positive/negative stroke |
| `<DeltaBadge>` | Everywhere | `+1.42%` mono, semantic color |
| `<MarketStatusPill>` | Top bar | Green / red / amber dot + label |
| `<DataTable>` | Stocks, screener, watchlist, portfolio | Mono cells, sticky header, hover row, sortable |
| `<HeatmapCell>` | Seasonality, sector views | 7-step diverging scale |
| `<TabBar>` | Most pages | Underline-on-active, gold underline |
| `<ChipFilter>` | Stocks, saved-results | Pill, navy when active |
| `<PayoffChart>` | Options pages | SVG line, breakeven dashed |

Buttons:
```css
.btn         /* base */
.btn-primary /* navy fill, white text */
.btn-gold    /* gold fill, navy text — used for primary CTA on marketing */
.btn-ghost   /* transparent, hairline border on hover */
.btn-sm  / .btn-lg
```

---

## 7. Page → existing route map (fill this in)

The reference HTML files use flat slugs. When you migrate, map each one to
the route already in your app.

| Reference file | Likely existing route | Status |
| --- | --- | --- |
| `index.html` | `/` | – |
| `pricing.html` | `/pricing` | – |
| `login.html` | `/login` | – |
| `signup.html` | `/signup` | – |
| `forgot.html` | `/forgot-password` | – |
| `auth-callback.html` | `/auth/callback` | – |
| `oauth-setup.html` | `/settings/brokers` | – |
| `fyers-token.html` | `/settings/brokers/fyers` | – |
| `privacy-policy.html` | `/legal/privacy` | – |
| `tip-tease.html` | `/tips/[id]` (locked) | – |
| `dashboard.html` | `/dashboard` | – |
| `stock-detail.html` | `/stocks/[symbol]` | – |
| `stocks.html` | `/stocks` | – |
| `screener.html` | `/screener` | – |
| `backtesting.html` | `/research/backtesting` | – |
| `indices.html` | `/indices` | – |
| `watchlist.html` | `/watchlists` | – |
| `portfolio.html` | `/portfolio` | – |
| `saved-results.html` | `/library` | – |
| `news.html` | `/news` | – |
| `market-reports.html` | `/research/reports` | – |
| `blog.html` | `/blog` | – |
| `learn.html` | `/learn` | – |
| `seasonality.html` | `/research/seasonality` | – |
| `advanced-strategies.html` | `/research/strategies` | – |
| `advanced-chart.html` | `/terminal/chart` | – |
| `time-sales.html` | `/terminal/time-and-sales` | – |
| `order-book.html` | `/terminal/order-book` | – |
| `compare.html` | `/terminal/compare` | – |
| `most-active.html` | `/terminal/movers` | – |
| `world-indices.html` | `/terminal/world` | – |
| `option-chain.html` | `/terminal/option-chain` | – |
| `ft-options-visualizer.html` | `/terminal/options-visualizer` | – |
| `black-scholes.html` | `/terminal/black-scholes` | – |
| `fii-dii.html` | `/terminal/fii-dii` | – |
| `corporate-actions.html` | `/terminal/corporate-actions` | – |
| `pair-trading.html` | `/terminal/pair-trading` | – |
| `pattern-search.html` | `/terminal/patterns` | – |
| `portfolio-optimizer.html` | `/terminal/optimizer` | – |
| `calculator.html` | `/terminal/calculator` | – |
| `monitor.html` | `/terminal/monitor` | – |
| `notes.html` | `/notes` | – |
| `research-reports.html` | `/research/broker-reports` | – |
| `financial-results.html` | `/results` | – |
| `ipo.html` | `/ipo` | – |
| `forum.html` | `/community` | – |
| `help.html` | `/help` | – |
| `profile.html` | `/settings/profile` | – |
| `developers.html` | `/developers` | – |
| `admin.html` | `/admin` | – |
| `admin-analytics.html` | `/admin/analytics` | – |
| `admin-users.html` | `/admin/users` | – |
| `admin-feature-flags.html` | `/admin/flags` | – |
| `admin-audit-logs.html` | `/admin/audit` | – |
| `admin-coin-packs.html` | `/admin/coin-packs` | – |
| `admin-coin-transactions.html` | `/admin/coin-transactions` | – |
| `admin-email-settings.html` | `/admin/email` | – |
| `admin-api-keys.html` | `/admin/api-keys` | – |

---

## 8. Migration order (recommended)

1. **Tokens & shell** — extract colors/type/radii into your theme, then build
   the top-bar + footer shell. Affects every page.
2. **Component primitives** — `Button`, `Card`, `Eyebrow`, `KpiTile`,
   `DataTable`, `DeltaBadge`, `MarketStatusPill`, `Sparkline`, tab bar, chip
   filter. Build a `/_design` route or Storybook to lock them in.
3. **Pricing or Privacy** — simplest read-only pages, prove the token
   migration works end-to-end.
4. **Dashboard** — exercises real hooks/queries.
5. **Stock detail** — most complex single page; if it lands, the rest is easy.
6. **Remaining pages in batches of 5–8**, going section-by-section.

---

## 9. Things to NOT copy verbatim from the reference

- `app.js` — vanilla JS for the static demo (theme toggle, mobile nav, top-bar
  injection). Rebuild via your existing theme provider and router.
- Inline SVG charts — they're placeholders. Use Recharts / visx /
  Lightweight Charts (whatever is already in the app), but keep colors mapped
  to `--chart-*` tokens.
- Hard-coded mock data (prices, P/L, news headlines). Replace with real
  hooks/queries from the existing data layer.
- The `<div data-shell-topbar>` / `<div data-shell-footer>` injection
  pattern — replace with normal layout components.

---

## 10. Things to definitely keep

- The HSL token system and dark-mode strategy (`.dark` ancestor flips tokens).
- The mono-numeric rule. Every number = JetBrains Mono, tabular nums.
- The eyebrow → display H1 → muted byline pattern at the top of every page.
- The 1440 px container / 32 px gutter / 64 px sticky top-bar layout.
- The semantic `--positive` / `--negative` colors — never override.
- The premium-restrained density: cards have generous padding, tables use
  10–11 px row padding with 13 px mono text.

---

## 11. Accessibility floor

- Focus rings: `outline: 2px solid hsl(var(--ring)); outline-offset: 2px`.
- Min hit target: 40 × 40 px on touch surfaces (44 × 44 on the marketing site).
- All eyebrow labels must be `<span>` not `<h6>` — they're decorative, not
  headings.
- All financial deltas must include an SR-only word: `<span class="sr-only">up</span> +1.42%`.
- Color contrast: light theme ≥ 4.5:1 for body, ≥ 3:1 for large UI text.
  Dark theme: same.

---

## 12. Open questions for the engineering team

- Which charting library is canonical? (decides the `<Sparkline>` and main
  chart implementations)
- Is dark mode a per-user setting or a system-pref auto-detect?
- Where does `MarketStatusPill` get its session state from? (existing API or
  derived client-side from market hours?)
- Is the `/admin/*` console served from the same Next.js app or a separate
  bundle?
