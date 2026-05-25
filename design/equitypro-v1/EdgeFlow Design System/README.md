# EdgeFlow / Tiphub Design System

> Production brand: **Tiphub** (tiphub.ai). Codebase repo: **EdgeFlow**.
> Tagline: *"AI-Powered Stock Analysis for Indian Investors."*

This is a **financial analytics product** — not a generic SaaS. The design language
is purpose-built for fast-changing data: dense numbers in tabular mono, two saturated
semantic colors (green/red) doing 80% of the comprehension work, and a dark-by-default
chrome that lets the data and charts sit forward.

## Sources

| Source | Access |
|---|---|
| GitHub repo | `Avishah8879/EdgeFlow` (default branch `main`) |
| Production site | https://tiphub.ai |
| LLM context file | `reference/llms.txt` (lifted from `client/public/llms.txt`) |
| Original Tailwind / shadcn tokens | `client/src/index.css` (extracted into `colors_and_type.css`) |
| Reference React components | `reference/components/*.tsx` (do not edit, read-only ground truth) |
| Reference pages | `reference/pages/*.tsx` |

The project is open: a React 18 + Vite + shadcn/ui (new-york variant) frontend on top
of a dual Node/Express + Python/FastAPI backend, with TimescaleDB + Redis + Celery for
the financial data pipeline. None of that backend matters for design — what matters is
the visual vocabulary the frontend has built up around financial UI primitives.

## Product surface

Tiphub is a single web product with these top-level surfaces:

| Surface | What it is |
|---|---|
| **Landing** (`/`) | Marketing-style intro for unauthenticated visitors. Hero, feature grid, FAQs. |
| **Home** (`/home`) | Logged-in dashboard: market mood gauge, indices, top gainers/losers, news, marquee. |
| **Stocks** (`/stocks`) | Paginated browser of 3,000+ NSE stocks with cap filter + search. |
| **Stock detail** (`/stocks/:ticker`) | Per-stock page: scorecard, multi-timeframe candlestick, 24 indicators, sentiment, Sankey, reverse DCF. |
| **Indices** (`/indices`) | 57 NSE indices grid. |
| **Expert Screener** (`/screener`) | Boolean expression screener over 68 indicators with SSE streaming. |
| **Strategy Backtesting** (`/alpha-generation`) | QIGA optimiser, 3 modes, equity curve, PineScript export. |
| **Saved results, Profile, Pricing, Developers, Admin** | Standard SaaS surfaces, themed identically. |

The design system in this folder targets the **logged-in product** first and the
landing page second.

---

## CONTENT FUNDAMENTALS

**Voice.** Practical, capability-led, slightly technical. Tiphub talks to retail
traders and analysts who want institutional tools without the price tag, so the copy
doesn't soften jargon — it leans into it. RSI, Calmar ratio, Supertrend (10,3),
Sankey, Reverse DCF appear in headings without translation. But it's never academic;
sentences are short, action verbs lead, and there is no marketing euphoria.

**Person.** Mostly **second-person** (*"You can screen the entire NSE universe…"*) and
**imperative** (*"Run a backtest", "Generate Alpha", "Save & share"*). Rarely first-person;
"we" appears almost exclusively in the privacy/legal pages.

**Casing.**
- Sentence case for all sentences and most button labels (*"Save result"*, *"Cancel job"*).
- **UPPERCASE eyebrow labels** with wide letter-spacing on cards and metrics
  (*"NIFTY 50"*, *"GENERATE ALPHA"*, *"TIPHUB AI"*) — this is the most recognisable
  type tic in the product.
- Tickers always uppercase (`RELIANCE`, `HDFCBANK`).
- Capability/feature names are TitleCased (*"Expert Screener"*, *"Market Mood Index"*,
  *"Strategy Backtesting"*).

**Vibe.** Confident, mildly futuristic, never cute. The codebase calls the dark theme
*"EdgeFlow Futuristic Dark Theme"* and *"Deep Space"* — that captures it. There is a
kind of late-night-trading-desk energy: glowing cyan accents, a Halvorsen attractor
running quietly in the landing hero, mono numbers, market-status pulse dots.

**Emoji.** **No.** Tiphub does not use emoji in product copy, headings, or buttons.
Status meaning is conveyed through Lucide icons, semantic color, and pulse dots — not
emoji.

**Specific copy examples** (from the live README, llms.txt, and product strings):

> *"Free AI stock analysis platform & TradingView alternative."*
> *"Generate Alpha"* (CTA on every stock page that deep-links into the backtester)
> *"Run"* (primary screener/backtest button — single verb, shimmer treatment)
> *"Pre-Market"* / *"Market Open"* / *"After Hours"* / *"Market Closed"* (status badge)
> *"Extreme Fear · Fear · Neutral · Greed · Extreme Greed"* (mood index bands)
> *"sma_50 > sma_200 and rsi_14 < 70"* (screener expressions are surfaced verbatim)
> *"3,000+ NSE stocks · 57 indices · 13M+ OHLC rows"* (capability-as-stat)

Notice: numbers are always Indian-locale formatted (`30,872`, `₹4,999/year`),
percentages always include the sign (`+1.24%`, `−0.81%`), tickers uppercase, units
spelled out (`min`, `hour`, `day`, `month`).

---

## VISUAL FOUNDATIONS

### Mode

**Dark by default** — `next-themes` is configured with `defaultTheme="dark"` and the
inline script in `<html>` sets the class before paint to prevent FOUC. Light mode is
supported (animated sun/moon switch in the nav) but the brand "looks like itself" in
dark.

### Color system

The brand has a **dual-color identity**, which is unusual and worth understanding:

| Role | Token | Hex | Where |
|---|---|---|---|
| **Brand orange** (logo, marquee, run-button shimmer, theme-color meta) | `--brand-orange` | `#FFA31A` | Wordmark, attractor fallback gradient, shimmer "Run" CTA |
| **Interface primary** (links, focus rings, charts, hover glows) | `--primary` | `#00BFFF` (dark) / `#0EA5C7` (light) | Buttons, badges, focus ring, primary chart series |
| **Background** | `--background` | `#0D1117` ("Deep Space") | App canvas |
| **Card** | `--card` | `#151B23` | Elevated surfaces (1 step above background) |
| **Sidebar** | `--sidebar` | `#0A0F14` | Top nav and side panels (1 step *below* background) |
| **Border** | `--border` | `#1E2A3A` | Hairlines, card edges |

**Financial semantics** sit alongside these and never substitute:

- `--positive` neon green `hsl(150 80% 45%)` — gains, longs, "Bullish" verdicts
- `--negative` red `hsl(0 72% 51%)` — losses, shorts, "Bearish" verdicts
- `--neutral` slate `hsl(215 10% 50%)` — flat / no-data / "Neutral" verdict
- `--status-pre-market` amber `hsl(45 100% 55%)` — pre-market and post-market badges

The chart palette adds **purple** (`hsl(280 80% 60%)`) and **pink** (`hsl(340 80% 60%)`)
for additional series, but those are chart-only — never UI chrome.

### Typography

- **Geist** (400/500/600/700) — UI sans, all body and headings. Loaded from Google Fonts.
- **JetBrains Mono** (400/500/600) — every number that represents data: prices, %, counts,
  RSI values, screener expressions, ticker codes inside tables, kbd shortcuts.
- **Fontastique** — ONE PLACE ONLY: the `iphub` part of the wordmark in `logo.svg`.
  TTF lives in `fonts/Fontastique.ttf`.

The most distinctive type pattern: **uppercase eyebrow labels** on cards
(`text-xs font-medium uppercase tracking-wide text-muted-foreground`) sitting above a
large mono value. This appears on every IndexCard, MetricDisplay, market-status badge,
DCF row, and section header.

### Backgrounds & imagery

- **No gradients on chrome.** Solid surfaces, hairline borders.
- **Gradients only as accents:** the gradient-glow card border (cyan → orange,
  `linear-gradient(163deg, hsl(var(--primary)) 0%, hsl(35 100% 50%) 100%)`) wraps
  IndexCards; the `run-button` has a horizontal orange shimmer; the conic
  `attractor-fallback` is a non-WebGL fallback for the landing hero.
- **No stock photos**, no abstract texture libraries, no patterns.
- The **Halvorsen attractor** (a Three.js point cloud strange-attractor) plays in
  the background of the landing hero — quiet, monochrome cyan/orange, not a focal point.
- The only photographic imagery is **market-report PNGs** (steel/gas/healthcare RRG
  charts, etc.) — these are screenshots of charts, not lifestyle photography.

### Animation

- **Easing:** almost everything is `cubic-bezier(0.4, 0, 0.2, 1)` (the standard
  Material "ease-out") OR `cubic-bezier(0, -0.02, 0.4, 1.25)` (slight overshoot for
  the theme switch / spring elements) OR `cubic-bezier(0.7, -0.5, 0.3, 1.5)` (springy
  bounce, used on the Ask-AI icon and ripple effects).
- **Durations:** 150ms (instant feedback), 300ms (default), 500ms (theme switch,
  expandable badges), 800ms (mood card flip).
- **Pulse animations** are everywhere: market-open dot (`status-pulse 2s`), DCF card
  glow (`dcf-glow 2.5s`), valuation badge pulses (`pulse-green/orange/red 2s`).
  These are *content* signaling — used to indicate liveness — not decoration.
- **Marquee** runs the top stock ticker at 60s per loop, pauses on hover.
- No bounce-on-load, no entrance animations on page transitions, no fade-ups.

### Hover & press states

The codebase uses a custom `hover-elevate` / `active-elevate-2` utility system that
applies a **brightness overlay** (`var(--elevate-1)` = `rgba(0,191,255,0.03)`,
`var(--elevate-2)` = `rgba(0,191,255,0.07)`) via a `::after` pseudo. So hover is *not*
a color change — it's a translucent cyan film that gets brighter on press. This works
identically on cards, buttons, and badges.

Press / active: `transform: scale(0.95)` on big CTAs (Run button), `scale(0.98)` on
profile dropdown items.

### Borders & shadows

- **1px hairline borders everywhere**, color = `--border` (`#1E2A3A`). Cards, inputs,
  popovers, sidebars, table rows. The hairline is the primary spatial separator.
- **Almost no traditional drop-shadows** in dark mode. Where elevation is needed it
  is signaled with **colored glows** (`box-shadow: 0 0 12px hsl(var(--primary) / 0.4)`)
  not gray shadows.
- Light mode does use mild gray shadows on tables (`0 2px 8px hsl(0 0% 0% / 0.08)`).
- **Neumorphic cards** (`.neumorphic-card`) appear in a few places (radius 20px,
  inset light + dark shadow pair). Reserved for "section container" surfaces with
  scrollable content.

### Corners

- `--radius` = **8px** is the system default (buttons, inputs, badges, most cards).
- Cards-of-cards: 12px (`--radius-lg`).
- Featured cards (Ask-AI input, neumorphic): 16–20px.
- Pills (signal badges, status chips, valuation badges): `9999px`.

### Cards

Default card pattern, taken straight from `IndexCard`:
```
<div class="gradient-glow-card">          <!-- gradient border 1px padding -->
  <div class="gradient-glow-card-inner    <!-- bg-card, content -->
              p-4 cursor-pointer">
    <span class="eyebrow">NIFTY 50</span>
    <span class="numeric text-lg">22,041.45</span>
    <span class="text-positive">+1.24%</span>
  </div>
</div>
```

Cards do not stack drop-shadow + border + gradient simultaneously. They pick one
elevation strategy per card.

### Transparency & blur

- Used **sparingly**: the search-bar focus glow uses `filter: blur(20px)` and 0.4
  opacity behind the input.
- Backdrop blur is used on the mobile nav drawer overlay.
- Generally the brand prefers solid surfaces over frosted/glass.

### Imagery color vibe

When images appear (market-report PNGs), they're chart screenshots that already match
the dark theme. No filters or grain are applied. The brand is **cool + saturated
accents on a near-black canvas**, not warm or sepia.

### Layout rules

- **Top nav is sticky**, sits inside `--sidebar` background (slightly darker than
  the page) so it visually recedes a hair from card surfaces.
- **MarqueeTicker** runs above or below the nav, full-bleed, 28–32px tall.
- Page content lives in a centered max-w container (`max-w-7xl mx-auto px-4`).
- Dashboard pages use a **3-column grid** at desktop (mood + indices left, news right,
  stock list bottom). Stock detail pages use a **left chart / right metrics** split.

---

## ICONOGRAPHY

**Library:** Lucide React (`lucide-react@0.453.0`) — used everywhere, single source of
truth. Stroke-based, 24×24 default, weight 1.5 (Lucide default). Icons inherit
`currentColor` so they tint to the surrounding text token.

In addition: `react-icons` (`5.4.0`) is in `package.json` for occasional brand glyphs
(Google G on the OAuth button), but Lucide is the working set.

**Sizes used in product:**
- 14–16px inside chips / badges / inline with `text-sm`
- 18–20px in nav and dropdown items
- 24px in section headers and card icons

**Common icons:** `TrendingUp`, `TrendingDown`, `Activity`, `Search`, `Clock`,
`BarChart3`, `LineChart`, `Filter`, `Zap` (Generate Alpha), `Sparkles` (TipHub AI),
`Bell` (alerts), `User`, `Settings`, `LogOut`, `ArrowUpRight`, `Plus`, `X`.

**Logo / wordmark:**
- `assets/logo.svg` — full lockup (icon glyph + Fontastique "iphub" wordmark)
- `assets/favicon.svg` — icon-only square version
- `assets/favicon.png` — 32×32 raster fallback
- The icon glyph itself is **two strokes**: a sweeping S-curve and a tall rounded
  bar, both filled with solid `#FFA31A`. It reads as a stylised candlestick.

**Emoji:** never. No emoji are used as icons or in copy.

**Unicode chars:** rare — `▲` `▼` are used inside `ChangeIndicator` as alternates to
the Lucide arrows in some compact contexts. `₹` is used for INR currency.

**Substitutions for this design system:** none — Lucide is freely available via CDN
(`https://unpkg.com/lucide@latest`) so all icon needs are met without subbing. The
Lucide React package is the same icon set, just shipped as React components.

---

## INDEX (manifest)

| File | Purpose |
|---|---|
| `README.md` | This file. |
| `SKILL.md` | Agent-Skill front-matter so this folder works as a Claude Code skill. |
| `colors_and_type.css` | All design tokens (CSS vars) + base type styles. Import into any HTML. |
| `assets/logo.svg` | Full Tiphub wordmark (icon + "iphub"). |
| `assets/favicon.svg` | Icon-only logo. |
| `assets/favicon.png` | 32×32 raster favicon. |
| `fonts/Fontastique.ttf` | Display font for the wordmark. |
| `reference/components/*.tsx` | Original React components from the codebase. Read-only — use as ground truth when building new HTML mocks. |
| `reference/pages/*.tsx` | Original page-level components. |
| `reference/llms.txt` | Tiphub's own LLM-context manifest. |
| `preview/*.html` | Design-system cards: type, color, components. Registered in the Design System tab. |
| `ui_kits/web/` | Recreated Tiphub web product (logged-in dashboard + stock detail) as a click-thru HTML+JSX prototype. |

---

## CAVEATS

- **Fontastique** is loaded from a TTF in `fonts/`. It is the only place the wordmark
  font is required, and it ships with the design system. If the user wants the
  wordmark fully editable, the TTF can be replaced 1:1.
- **No mobile-app surface exists** in the codebase — Tiphub is web-only. The mobile
  experience is a responsive shrink of the web product, not a separate native UI kit.
- The Halvorsen attractor is a Three.js scene; we mock its visual feel with the
  `attractor-fallback` conic gradient in HTML previews rather than re-implementing
  the WebGL.
