# Stock Detail Page — Design Migration Spec (Phase 1)

> Mini-spec for migrating `/stocks/:symbol` (current implementation: [client/src/pages/StockDetail.tsx](client/src/pages/StockDetail.tsx)) to the target visual design captured in `design/equitypro-v1/EdgeFlow Design System/stock-detail.html`.
>
> **Status (2026-05-18):** Phase 1 spec complete + Phase 0 verification + decisions locked (see "Phase 0 outcomes" section below). Phase A (layout shell) is gated on user row-by-row review of the classifier ruleset (Phase 0 §5.1) and confirmation of the prior-bar-history proposal (Phase 0 §6).
>
> **Companion artifact:** [DESIGN_STOCK_DETAIL_PHASE_0.md](DESIGN_STOCK_DETAIL_PHASE_0.md) — pre-Phase-A verification, threshold sources, edge-case handling, test-case enumeration.

---

## Cross-cutting principle (locked 2026-05-18)

**"The design is a visual reference, not a feature contract."**

Every existing capability on the current `/stocks/:symbol` page **stays** in the redesigned page. When the design omits an element, the redesign's job is to find a sensible new placement — never drop unilaterally. If no natural placement exists, flag as a §7-style question and surface for decision; don't decide alone.

This principle applies across all redesign phases and supersedes any visual-only interpretation of the design HTML.

---

## 1. Design inventory

| File | Size | Format | Role |
|---|---|---|---|
| `design/equitypro-v1/DESIGN_NOTES.md` | ~9 KB | Markdown | Engineer handoff: tokens, type, components, migration order |
| `design/equitypro-v1/CLAUDE.md` | ~4 KB | Markdown | Hard rules for working in this folder (no new CSS framework, no mock data, etc.) |
| `design/equitypro-v1/EdgeFlow Design System/README.md` | ~15 KB | Markdown | Design system overview (brand voice, foundations, animation) |
| `design/equitypro-v1/EdgeFlow Design System/SKILL.md` | ~2 KB | Markdown | Agent-skill metadata; critical rules (mono numbers, uppercase eyebrow, etc.) |
| `design/equitypro-v1/EdgeFlow Design System/colors_and_type.css` | ~9 KB | CSS | Design tokens (HSL colors, type scale, spacing, shadows, easing) |
| `design/equitypro-v1/EdgeFlow Design System/app.css` | ~13 KB | CSS | Application-level styles (layout, topbar, cards, badges, tables, tabs) |
| `design/equitypro-v1/EdgeFlow Design System/stock-detail.html` | **~71 KB** | HTML | **PRIMARY TARGET** — full RELIANCE Industries page mockup |
| `design/equitypro-v1/EdgeFlow Design System/partials/topbar.html` | ~2 KB | HTML | Shared header fragment (logo, nav, search, theme toggle, auth) |
| `design/equitypro-v1/EdgeFlow Design System/app.js` | ~11 KB | JS | Shell script (theme toggle, topbar injection — explicitly NOT to copy verbatim per CLAUDE.md) |

**Files not read (out of scope for this page):** 47 other `*.html` files for unrelated routes (admin/, screener.html, backtesting.html, etc.), `assets/`, `fonts/`, `preview/`, `reference/`, `uploads/`. Per design-folder CLAUDE.md hard rules, this is a /stocks/:symbol-only migration.

**Format note:** The design is **static HTML** with vanilla JS and inline SVG. The handoff doc explicitly states: *"Treat the reference as a visual spec, not as source code. Lift tokens, layouts, copy, and density. Rebuild using the existing framework."*

---

## 2. Visual breakdown of the target page (top to bottom)

The page has two macro regions: a global **topbar/footer shell** (already present in the host app) and a **two-column main layout** with a fluid left column and a 360px sticky right sidebar.

### Hero strip

Single column, gradient background (radial gold @ 90% -50% → linear navy fade). Inner grid `1fr auto; align-items: end;`.

- **Breadcrumbs:** `Markets / Stocks / RELIANCE` (12px muted, gold-hover)
- **Stock ID block:**
  - Ticker mark — 56×56 navy gradient square with 3-char abbreviation (e.g. "RIL"), gold border, shadow
  - Stock name h1 (Playfair 30px) — "Reliance Industries Ltd."
  - Meta line — ticker (bold navy) · NSE · sector · 2 badges (navy "Large Cap", gold "Index · NIFTY 50")
- **Price block (right-aligned, baseline-aligned with name):**
  - LTP mono 36px (₹2,948.55)
  - Change row — `+42.30   +1.46 %` green
  - Timestamp — "Live · NSE · 14:32 IST" (uppercase muted)
- **Quick actions (right):** `+ Watchlist`, `Compare`, `Generate Alpha →` (gold primary)
- **Stat strip (7 columns, no gap):** Market Cap · P/E · P/B · Div Yield · 52W Range · Beta · ROE. Each cell is `label / value / subtext`.

### Main layout (`grid-template-columns: 1fr 360px; gap: 24px`)

Left column (flex column, gap 20px) holds the deep-data sections in order. Right column (sticky top 80px, flex column, gap 20px) holds nav + CTA + analyst + DCF.

### Left column — sections in order

#### Section 01 — Price Chart (`id="sec-chart"`)
- Toolbar: 7 timeframe tabs (1D, 5D, 1M, 3M, 1Y, 5Y, MAX), Indicators / Compare / fullscreen buttons
- Chart canvas (380px): legend top-left (O/H/L/C/VOL mono), SVG area+line with volume bars + crosshair

#### Section 02 — Scorecard + AI Sentiment (side-by-side, `1fr 1fr`)

**Scorecard** (`id="sec-scorecard"`):
- Header — eyebrow "Scorecard" · title "Quality · Value · Growth" · badge "7.8 / 10" (gold)
- 3-column grid of radial rings (gold/sky/positive), each with score, label, one-line description

**AI Sentiment** (`id="sec-sentiment"`):
- Header — eyebrow "AI Sentiment · 24h" · title · badge "Bullish" (with pulse dot)
- 96px radial gauge ("72" / "SCORE") + 3-bar stack (Positive 74%, Neutral 18%, Negative 8%) with article counts
- 3 news items below — 4px sentiment color strip + headline + summary + source/time/sentiment-score badge

#### Section 03 — Technicals (`id="sec-technicals"`)
- Header — title "24 indicators · 1H timeframe" · timeframe tabs (1D, 1H, 15m, 5m)
- 2-column grid of 24 indicator rows: `name | value (mono) | signal badge (bull/bear/neut)`

#### Section 04 — Pros & Cons (`id="sec-proscons"`)
- Header — eyebrow "Quick read" · title "Pros & cons" · badge "AI synthesized" (gold)
- 2-column grid: pros (green dot, 5 items) / cons (red dot, 4 items)
- Items contain inline **bold mono** value emphasis (e.g. "_Profit growth of **26.4 %** CAGR_")

#### Section 05 — Peer Comparison (`id="sec-peers"`)
- Header — eyebrow "Peer comparison" · title "Refining & Marketing · 8 companies" · tabs (Mcap / P/E / ROCE)
- Wide scrollable table — sticky left name column, 9 metric columns, **`.me` row** highlights current ticker with gold bg, **`.med` row** shows sector median (italic), `+/-%` columns colored

#### Section 06 — Quarterly Results (`id="sec-quarterly"`)
- Header — eyebrow · title "Consolidated · last 10 quarters · ₹1 Cr" · tabs (Standalone / Consolidated) · buttons (Raw data / Product segments)
- Narrow table: 10 quarter columns, last column (Apr'26) highlighted as **current**
- Row types: `.sub` subtotal rows, `.hl` highlight rows (Net Profit), `.cur` column

#### Section 07 — Profit & Loss (`id="sec-pnl"`)
- Same narrow-table pattern, 10-year + TTM columns
- **Below table:** 4-column **growth grid** — Compounded Sales Growth, Compounded Profit Growth, Stock Price CAGR, Return on Equity. Each card has 10Y/5Y/3Y/TTM rows.

#### Section 08 — Balance Sheet (`id="sec-balance"`)
- Same narrow-table pattern, 10-year columns (2017–Sep'25)
- Equity section + Assets section, total rows highlighted

#### Section 09 — Cash Flows (`id="sec-cashflow"`)
- Same pattern, 9 years, 4 rows (Operating / Investing / Financing / Net)

#### Section 10 — Ratios (`id="sec-ratios"`)
- Same pattern, 9 years — Operational efficiency rows (Debtor Days, Inventory Days, Cash Conversion Cycle, ROCE)

#### Section 11 — Key Fundamentals "At a Glance" (`id="sec-fundamentals"`)
- 2-column key-value table (12 cells / 6 rows) — Market Cap, Current Price, 52W H/L, P/E, Book Value, Div Yield, ROCE, ROE, Face Value, D/E, Interest Coverage, EPS (TTM)

#### Section 12 — Documents / Filings (`id="sec-docs"`)
- Header — title "Filings, calls & ratings" · "View all 248 →" link
- 3-column grid:
  - **Announcements** (5 items: date + headline)
  - **Annual reports & concalls** (5 items: period + PDF link)
  - **Credit ratings** (4 items: agency + grade/outlook line, color-coded by grade `.b-aaa` / `.b-a1`)

#### Section 13 — Shareholding Pattern (`id="sec-shareholding"`)
- Header — eyebrow · title "As of Sep 2024" · "View Sankey →" link
- 4 horizontal bar rows: `label (100px) | bar fill (1fr) | % (60px mono)`
- Categories: Promoter (navy), FII (gold), DII (sky), Public (muted)

### Right sidebar — sections in order

#### TOC (`.toc`)
- Sticky, 16 numbered anchor links (01–16): Price chart, Scorecard, AI Sentiment, Technicals, Pros & cons, Peer comparison, Quarterly, P&L, Balance sheet, Cash flows, Ratios, At a glance, Documents, Shareholding, Analysts, Reverse DCF
- Active state has accent bg + bold

#### Generate Alpha CTA (`.alpha-card`)
- Navy gradient card with gold pseudo-glow, eyebrow "EquityPro AI", h3 "Generate alpha for RELIANCE", gold CTA button

#### Analyst Targets / Consensus
- Header — title "17 analysts · Buy"
- 12-month price target (mono 22px gold) + delta badge (+7.85 %)
- Gradient target-track bar (red→muted→green) with **Current** marker (2px navy line) and **Target** marker (gold square), low/high labels
- 5-column ratings breakdown (Strong Buy / Buy / Hold / Sell / Strong Sell counts)

#### Reverse DCF
- Header — "Implied growth"
- Big mono number `14.2 %` (gold), description "Market is pricing in a 10-year FCF growth rate of", consensus comparison "vs. 11.8 %", verdict badge "Reasonable premium", `Adjust assumptions →` ghost button

---

## 3. Field-to-data mapping

Table of every visible data point with its current source. Status legend:
- ✅ already in current API/component
- 🟡 derivable from existing data
- 🆕 needs new endpoint/accessor
- 🎨 cosmetic / static

### Hero

| Design element | Data type | Current source | Action needed |
|---|---|---|---|
| Company name | text | `stock_fundamentals.long_name` via `useStockDetail` | ✅ reuse |
| Ticker (symbol) | text | `tickers.symbol` via `useStockDetail` | ✅ reuse |
| Ticker mark (3-char abbreviation) | text | derive from symbol[:3] | 🟡 derive client-side |
| Exchange | text | `tickers.exchange` via `useStockDetail` | ✅ reuse |
| Sector | text | `tickers.sector` via `useStockDetail` | ✅ reuse |
| "Large Cap" / "Mid Cap" / "Small Cap" badge | enum | `tickers.mcap_type` (added by CMOTS migration 030 — currently NULL on uncovered tickers) | 🟡 if NULL, derive from market_cap thresholds |
| "Index · NIFTY 50" badge | text | **NOT in current data** | 🆕 NIFTY-membership lookup. Sources: hard-coded index lists, or new endpoint that reads from existing `indices` data |
| LTP | currency | `ltp_live.ltp` via `useStockLTP` | ✅ reuse |
| Price change absolute | currency | derived from `ltp - prev_close` | ✅ reuse via `useStockLTP` |
| Price change percent | percentage | `useStockLTP.percent_change` | ✅ reuse |
| Quote timestamp + "Live" label | time + status | `ltp_live.timestamp` + `useMarketStatus` | ✅ both hooks exist |
| Market Cap | currency (lakh-crore) | `stock_fundamentals.market_cap` | ✅ reuse |
| P/E (stock) | ratio | `stock_fundamentals.trailing_pe` | ✅ reuse |
| P/E sector subtext (e.g. "Sector 18.2×") | ratio | **NOT in current data** | 🆕 sector median P/E. CMOTS `cmots_accessor.get_sector_medians(sector)` already exists (TODO_CMOTS notes process-wide in-memory cache) — but only for CMOTS-covered tickers |
| P/B | ratio | `stock_fundamentals.price_to_book` | ✅ reuse |
| P/B 5-year average subtext | ratio | **NOT directly available** | 🆕 derive from `cmots_ratio_yearly.pbv` history (CMOTS-only) |
| Dividend Yield | percentage | `stock_fundamentals.dividend_yield` | ✅ reuse |
| Dividend per share subtext (₹110/share) | currency | `stock_fundamentals.dividend_rate` | ✅ reuse |
| 52W Range low/high | currency | `stock_fundamentals.fifty_two_week_low/high` | ✅ reuse |
| 52W Range placement ("73rd %ile") | percentile | **NOT in current data** | 🟡 derive client-side from `(ltp - low) / (high - low) * 100` |
| Beta | ratio | **NOT confirmed in stock_fundamentals** | 🆕 verify yfinance backfill of `beta` field. If absent, source unclear |
| Beta subtext ("Lower than mkt") | enum | derived (β < 1 = lower, β > 1 = higher) | 🟡 derive client-side |
| ROE | percentage | `stock_fundamentals.return_on_equity` | ✅ reuse |
| ROE 5-year average subtext | percentage | **NOT directly available** | 🆕 derive from `cmots_ratio_yearly.roe` history (CMOTS-only) |
| "+ Watchlist" CTA | action | watchlist endpoints exist but page is hidden | 🎨 button only; wire later or stub |
| "Compare" CTA | action | no /compare route in current app | 🎨 stub button or hide |
| "Generate Alpha →" CTA | action | `VITE_EQUITYPRO_AI_URL` env-driven external link | ✅ reuse (existing `GenerateAlphaCard` pattern) |

### Price Chart section

| Design element | Data type | Current source | Action needed |
|---|---|---|---|
| OHLC series | series | `/api/price-chart/{ticker}` via `usePriceChart` | ✅ reuse |
| Timeframe tabs (1D, 5D, 1M, 3M, 1Y, 5Y, MAX) | enum | `usePriceChart(ticker, timeframe, months)` accepts timeframe param | ✅ reuse |
| Legend O/H/L/C/VOL | series snapshot | derive from latest bar of `usePriceChart` data | 🟡 already in existing `ChartLegend.tsx` |
| Indicators / Compare / fullscreen buttons | action | indicators wiring exists (`useTechnicalIndicators`); compare doesn't | 🎨 partial — wire indicators; stub or hide compare |

### Scorecard

| Design element | Data type | Current source | Action needed |
|---|---|---|---|
| Overall score "7.8 / 10" | numeric (0–10) | `useStockScorecard` returns 7-dimension scores; need overall mean | 🟡 derive from existing 7-dim scorecard average |
| Quality score (8.4) | numeric (0–10) | Existing scorecard has dimensions: Valuation, Profitability, Growth, Financial Health, Business Quality, Momentum, Entry Rating. **"Quality" not 1:1 mapped** | 🟡 design has 3 buckets vs current 7 dimensions; map: Quality ← (Financial Health + Business Quality) / 2; Value ← Valuation; Growth ← Growth |
| Value score (5.2) | numeric | `useStockScorecard.valuation` | 🟡 map as above |
| Growth score (7.6) | numeric | `useStockScorecard.growth` | 🟡 map as above |
| 1-line description per ring | text | not currently exposed (server returns numeric + commentary in some dimensions) | 🟡 verify `stock_scorecard.py` response; may need template |

### AI Sentiment

| Design element | Data type | Current source | Action needed |
|---|---|---|---|
| Sentiment score 72/100 | numeric | async sentiment flow returns a positive/negative/neutral breakdown; **single "score" field NOT clearly defined** | 🟡 derive from existing FinBERT analysis (e.g. `positive% - negative%` rescaled to 0–100) |
| Bullish/Bearish verdict | enum | derive from score | 🟡 derive |
| 3-bar % breakdown (Pos / Neu / Neg) | percentages | async sentiment result returns article-level scores; aggregate to % | ✅ data exists, presentation new |
| Article count "23 of 31" | count | async sentiment result count | ✅ exists |
| News items (3) — headline, summary, source, time, sentiment score | object | async sentiment result returns article list from GoogleNews/Pulse fallback | ✅ exists, but page must trigger the analysis (Celery task; uses 24h cache for non-empty results) |

Frontend contract: stock-detail sentiment uses only the async flow: `POST /api/sentiment-analysis/start` → `GET /api/sentiment-analysis/stream/{task_id}` → render the final result. The legacy sync Python endpoint `POST /api/sentiment-analysis` is internal/backward-compatible only and is not a frontend path.

### Technicals

| Design element | Data type | Current source | Action needed |
|---|---|---|---|
| 24 indicators (SMA/EMA/RSI/MACD/Bollinger/ATR/Supertrend/Stochastic/CCI/ADX/+DI/-DI/OBV/VolumeSMA/52WHigh/VWAP) | numeric | `useTechnicalIndicators` already returns most of these via `indicator_calculator.py` | ✅ mostly exists |
| **+DI / −DI / VWAP / Stochastic / CCI** | numeric | NOT in the standard 24-indicator set listed in CLAUDE.md (CLAUDE.md says: SMA, EMA, MACD, RSI, ATR, Supertrend, Bollinger, Volume SMA = 24 fields when expanded with multiple periods) | 🆕 verify what `indicator_calculator.calculate_all_indicators()` returns. If +DI/−DI/VWAP/Stochastic/CCI missing, add to that calculator |
| Signal classifications (Bullish/Bearish/Neutral/Above/Below/Approaching/Cross up/Long/Overbought/Rising/etc.) | enum | **NOT in current data** — current returns raw numeric, no signal classification | 🆕 derive client-side OR add a server-side classifier. Classification rules per indicator (e.g. `RSI > 70 = Overbought`) |
| Timeframe tabs (1D / 1H / 15m / 5m) | enum | `useTechnicalIndicators` is on-demand; only 1H is currently computed routinely | 🟡 add timeframe param if multi-resolution required, OR limit to 1D/1H |

### Pros & Cons

| Design element | Data type | Current source | Action needed |
|---|---|---|---|
| Pros list (5 items with inline bold numbers) | string[] | `ProsConsPanel` (CMOTS rule engine on covered, yfinance fallback on uncovered) | ✅ reuse |
| Cons list (4 items) | string[] | same | ✅ reuse |
| "AI synthesized" badge | text | cosmetic | 🎨 add badge to existing panel header |
| Inline **bold** value emphasis | rendering | text-rendering choice — embed `<b>` in entries server-side OR mark-and-render client-side | 🟡 enhancement; existing entries are plain strings — needs ParsedEntry or markdown-lite rendering |

### Peer Comparison

| Design element | Data type | Current source | Action needed |
|---|---|---|---|
| Peer table (8 companies + median row + current row) | rows | **NOT currently available** | 🆕 **NEW ENDPOINT NEEDED.** Sources to consider: (a) join `tickers.sector` to get peer symbol list, then pull each peer's `stock_fundamentals` row (CMP, P/E, mkt cap, div yield, quarterly net profit, sales, ROCE) — high-traffic, ~100ms ×8 round-trips; (b) CMOTS `cmots_accessor.get_sector_medians(sector)` exists for median row aggregates; (c) a new `GET /api/peers/{ticker}` that batches all 8 peers + median in one query |
| Tabs (Mcap / P/E / ROCE) — re-rank | sort | client-side sort given (a) | 🟡 |
| Current ticker row (`.me` highlight) | flag | match `peer.symbol == current_ticker` | 🟡 |
| Median row (`.med`) | row | `get_sector_medians` result (CMOTS-only) OR client-side compute over peer list | 🟡 |
| +%/-% colored deltas | percentage signed | already in `stock_fundamentals` (e.g. quarterly_profit_growth_yoy if exists; **may not exist**) | 🆕 verify yfinance backfill includes YoY deltas per metric; if absent, derive from quarterly_financials JSONB |

### Quarterly Results / P&L / Balance Sheet / Cash Flows / Ratios

| Design element | Data type | Current source | Action needed |
|---|---|---|---|
| Particulars rows (Sales, Expenses, Operating Profit, OPM%, Other Income, Interest, Depreciation, PBT, Tax%, Net Profit, EPS, Dividend Payout %, ROCE %, Days metrics, etc.) | string | `FinancialTable` already renders yfinance JSONB; CMOTS `FinancialStatementsPanel` renders WideTable | ✅ existing components |
| Period columns (10 quarters / 10 years) | string[] | yfinance JSONB has 10y annual + 40 quarters quarterly | ✅ exists |
| Highlighted current column (`.cur`) | flag | last period | 🟡 styling change on existing `FinancialTable` |
| Subtotal rows (`.sub`) and highlight rows (`.hl`) | flag | RowDef in `financial-rows.ts` controls `bold` already; would need a `kind: 'sub' \| 'hl'` distinction | 🟡 extend RowDef |
| Standalone / Consolidated tab | enum | CMOTS `FinancialStatementsPanel` already has this; yfinance has only consolidated | 🟡 wire CMOTS panel here OR keep existing yfinance + add CMOTS toggle |
| **Growth grid under P&L (4 cards: Sales/Profit/Price CAGR/ROE — 10Y/5Y/3Y/TTM)** | computed | existing `computeCagr` helper in StockDetail.tsx covers Sales & Profit. Stock Price CAGR and historical ROE NOT yet computed | 🟡 extend `computeCagr` to price chart data; pull historical ROE from `cmots_ratio_yearly.roe` (CMOTS-only) |
| Days metrics (Debtor / Inventory / Payable / CCC / WC) | numeric | **NOT in current data** | 🆕 derive from quarterly_financials (Receivables, Inventory, Payables, Sales) JSONB. Likely yfinance-derivable. CMOTS exposes ROCE separately; days metrics may need a derivation helper |
| ROCE history row | percentage | **NOT in current data** | 🆕 CMOTS `cmots_ratio_yearly.roce` provides this (CMOTS-only) |

### Key Fundamentals "At a Glance"

| Design element | Data type | Current source | Action needed |
|---|---|---|---|
| Market Cap, Current Price, 52W H/L, P/E, Book Value, Div Yield, ROCE, ROE, Face Value, D/E, Interest Coverage, EPS (TTM) | mixed | `stock_fundamentals` row covers ~10 of these; ROCE separate (CMOTS); Face Value separate; Interest Coverage separate | 🟡 mostly ✅; verify Face Value (`face_value`?) and Interest Coverage (`interest_coverage`?) columns |

### Documents / Filings

| Design element | Data type | Current source | Action needed |
|---|---|---|---|
| Column 1: Announcements (5) | list | `external_analyst.announcements` via `useStockDetail` | ✅ reuse |
| Column 2: Annual reports & concalls (5) | list | **NOT in current data** | 🆕 source unclear; possibly CMOTS narratives (Director's/Auditor's reports) but those have no PDF URL exposed yet, possibly broker research-reports endpoint |
| Column 3: Credit ratings (4 — CRISIL/ICRA/CARE/S&P with grade + outlook) | list | `CreditRatingsPanel` (CMOTS) already does this | ✅ reuse |
| "View all 248 →" button | action | cosmetic; no full-list page exists | 🎨 stub or hide |

### Shareholding Pattern

| Design element | Data type | Current source | Action needed |
|---|---|---|---|
| 4 rows (Promoter / FII / DII / Public) with bar + % | numeric | `useShareholding` (Selenium scraper, CMOTS-backed for covered) | ✅ reuse |
| "As of Sep 2024" date label | date | shareholding endpoint returns period | ✅ reuse |
| "View Sankey →" link | action | `useSankey` + `FinancialSankey` exist but route to a separate section | 🎨 cosmetic link |

### TOC sidebar

| Design element | Data type | Current source | Action needed |
|---|---|---|---|
| 16 numbered anchor links | static | StockDetail.tsx already has `navSections` array — just expand | 🟡 reuse existing pattern; current is 10-16 entries depending on coverage |
| Active scroll-spy highlighting | computed | `useScrollSpy` exists in `StockDetailNav.tsx` | ✅ reuse |

### Generate Alpha CTA

| Design element | Data type | Current source | Action needed |
|---|---|---|---|
| Marketing card with navy gradient + gold glow | rendering | `GenerateAlphaCard.tsx` exists | 🟡 may need restyling to match design's gradient + pseudo-glow |
| External link via `VITE_EQUITYPRO_AI_URL` | env | ✅ exists | ✅ reuse |

### Analyst Targets

| Design element | Data type | Current source | Action needed |
|---|---|---|---|
| "17 analysts · Buy" header | counts + verdict | `useExternalAnalyst` returns recommendation distribution | ✅ data exists |
| 12-month price target | currency | `useExternalAnalyst` returns target | ✅ exists |
| Upside % delta | percentage | derive `(target - ltp) / ltp * 100` | 🟡 derive |
| **Gradient target track with Current + Target markers, low/high labels** | viz | **NEW VISUALIZATION** — no current component | 🆕 new component (CSS gradient + absolutely-positioned markers) |
| 5-cell rating breakdown (SB/B/H/S/SS counts) | counts | `useExternalAnalyst` returns these | ✅ exists |

### Reverse DCF

| Design element | Data type | Current source | Action needed |
|---|---|---|---|
| Implied growth value | percentage | `useReverseDCF` returns implied growth | ✅ reuse |
| Consensus comparison | percentage | external analyst forecast OR static (depends on if `useExternalAnalyst` returns consensus growth) | 🟡 verify or stub |
| "Reasonable premium" verdict | enum | derive from delta between implied and consensus | 🟡 derive |
| Adjust assumptions button | action | `ReverseDCFCard` has param controls | ✅ reuse |

---

## 4. Endpoint coverage check

### Currently used by the design

| Endpoint | Used for (sections) | Status |
|---|---|---|
| `GET /api/stock-detail/{ticker}` | Hero (sector, name, badges), Fundamentals (P/E, P/B, ROE, etc.), Financials tables, Pros/Cons fallback | Heavy use |
| `GET /api/stock-ltp/{ticker}` | Hero (LTP, change, timestamp) | Heavy use |
| `GET /api/market-status` | Hero "Live" pill | Used |
| `GET /api/price-chart/{ticker}` | Chart section | Used |
| `GET /api/technical-indicators/{ticker}` | Technicals (partial — see gaps) | Used |
| `GET /api/stock-scorecard/{ticker}` | Scorecard (needs remapping 7→3 dimensions) | Used |
| `POST /api/reverse-dcf/{ticker}` | Reverse DCF sidebar | Used |
| `GET /api/shareholding/{ticker}` | Shareholding pattern | Used |
| `GET /api/stock-detail/{ticker}/analyst` | Analyst targets sidebar (counts, target) | Used |
| `POST /api/sentiment-analysis/start` + `GET /api/sentiment-analysis/stream/{id}` | AI Sentiment section | Used — async frontend contract (Celery + 24h cache for non-empty results) |
| `GET /v1/api/tickers/{ticker}/has-cmots-data` | Gating | Used |
| `GET /v1/api/tickers/{ticker}/corporate-actions` | (no direct equivalent in design; documents section uses external_analyst.announcements) | **Likely unused on this page** |
| `GET /v1/api/tickers/{ticker}/credit-ratings` | Documents column 3 | Used |
| `GET /v1/api/tickers/{ticker}/pros-cons` | Pros/Cons | Used |
| `GET /v1/api/tickers/{ticker}/ratios/yearly|quarterly|daily` | **Sector P/E subtext, ROCE history, days metrics, growth grid** | Used (heavy on CMOTS) |
| `GET /v1/api/tickers/{ticker}/financials/{type}/{report}` | Standalone/Consolidated tab on quarterly + P&L + BS + CF + Ratios sections | Used (heavy on CMOTS) |
| `GET /v1/api/tickers/{ticker}/narratives/{doc_type}` | **No direct match in design** — design's "Annual reports & concalls" column may map here but format is PDF-link list, narratives return body_html | Possibly unused |
| `GET /v1/api/tickers/{ticker}/announcements` | Documents column 1 | Used |
| `GET /v1/api/tickers/{ticker}/screener` | (no direct equivalent in design) | **Likely unused** |

### Unused by design (candidates to keep but de-emphasize)

- `useSankey` / `FinancialSankey.tsx` — design shows shareholding only; no Sankey rendered. Existing component could be reached via "View Sankey →" link.
- `CorporateActionsTimeline.tsx` — design does NOT have a corporate-actions timeline section. Either (a) drop from page, (b) merge into Documents column 1.
- `NarrativesPanel.tsx` — same situation; design does not surface Director's/Chairman's/Auditor's report bodies.

### NEW endpoints / accessors needed for the design

| Need | Proposed endpoint / accessor | Source data |
|---|---|---|
| **Peer comparison** (8 peers + median, sector-grouped) | `GET /api/peers/{ticker}` — returns `{ peers: [{ symbol, name, cmp, pe, mcap, div_yield, np_qtr, np_yoy, sales_qtr, sales_yoy, roce }], median: {…}, sector: string }` | Join `tickers` by sector + bulk-fetch `stock_fundamentals` rows; for `np_yoy` / `sales_yoy` derive from quarterly_financials JSONB |
| **Days metrics** (Debtor / Inventory / Payable / CCC / WC, per year) | Either extend `ratios` accessor (CMOTS) or derive from `stock_fundamentals` quarterly_financials JSONB | Receivables / Sales × 365 etc. |
| **Stock Price CAGR** (10Y/5Y/3Y/1Y) | Derive client-side from `usePriceChart` long-range data | Existing |
| **Historical ROE** (10Y/5Y/3Y) for growth grid | CMOTS `cmots_ratio_yearly.roe` per year (CMOTS-only) | Existing |
| **NIFTY-50 membership flag** for hero badge | Static lookup table OR query existing `indices` constituent data if available | TBD |
| **Sector median P/E** for P/E subtext | `cmots_accessor.get_sector_medians(sector)` exists but is CMOTS-only; OR compute over `stock_fundamentals` peer rows | Existing CMOTS path |
| **Beta** confirmation | Verify `stock_fundamentals.beta` exists from yfinance backfill | Verification only |
| **Technical signal classification** ("Bullish", "Above", "Overbought", "Approaching", etc.) | Either client-side derivation rules per indicator, OR new server-side accessor `classify_indicators(values) -> {indicator: signal}` | Derivation |

---

## 5. Component reuse vs new-build assessment

### Reuse as-is

- `CollapsibleSection.tsx` — for any sections we keep as expandable
- `StockDetailNav.tsx` + `useScrollSpy` — the TOC sidebar variant is similar pattern
- `useStockDetail`, `useStockLTP`, `useCmotsCoverage` — all coverage probes / page data
- `useShareholding`, `useReverseDCFMutation`, `useExternalAnalyst`, `useStockScorecard`, `usePriceChart`, `useTechnicalIndicators` — primary data hooks
- `ProsConsPanel` (with restyling and "AI synthesized" badge addition)
- `CreditRatingsPanel` — embeds inside Documents column 3
- `CmotsBadge` — already self-hides; can stay or move to hero "Large Cap" badge area
- `Eyebrow`, `DeltaBadge`, `MetricDisplay`, `ChangeIndicator`, shadcn primitives

### Reuse with restyling (CSS/JSX changes only)

| Component | Scope |
|---|---|
| `PriceChartSection.tsx` + `price-chart/` subcomponents | Adopt design's compact toolbar (7 timeframes inline), gradient area fill, crosshair styling. No new data. |
| `FinancialTable.tsx` | Extend RowDef to support `kind: 'sub' \| 'hl'`. Add `.cur` column class on last period. Narrow variant (smaller padding + smaller mono). Sticky-left enhancement. |
| `ShareholdingPattern.tsx` | Design renders a simpler 4-row horizontal bar layout; current renders a richer quarterly/yearly table. Restyling to match the design's compact bar pattern. The richer view could be a drilldown. |
| `GenerateAlphaCard.tsx` | Restyle to navy gradient with gold pseudo-glow per `.alpha-card` design. |
| `AnalystRecommendationCard.tsx` | Restructure to add the gradient track + markers visualization; rating breakdown row is already present. |
| `ReverseDCFCard.tsx` | Restyle to compact sidebar version (big mono number + verdict badge + adjust button), matching design. |
| `StockScorecard.tsx` | Restructure significantly: design wants 3-bucket radial rings (Quality/Value/Growth) with overall score; current is 7-dimension. Need a 7→3 aggregation layer OR a new rendering of the same data as 3 rings. |
| `SentimentGauge.tsx` + `SentimentMetrics.tsx` + `SentimentNewsSection.tsx` | Compose into a single side-by-side card matching design layout (96px gauge left + 3-bar stack + 3 news items inline). |

### Restructure / extend

| Component | Scope |
|---|---|
| `TechnicalIndicatorsTable.tsx` | Add 2-column grid layout, signal-badge column, timeframe tabs. May need to expand indicator set (Stochastic, CCI, ADX, +DI/−DI, VWAP) — verify what `indicator_calculator.py` returns first. |
| `StockDetailNav.tsx` | Convert from horizontal sticky bar to vertical sidebar variant for this page only; add numbered "01 02 03…" prefixes. Existing scroll-spy + click-to-expand-and-scroll logic reused. |

### New components

| Component | Purpose | Props (proposed) |
|---|---|---|
| `HeroStrip.tsx` | Replaces current hero block; gradient bg, ticker mark, name, badges, price block, quick actions, 7-cell stat strip | `{ ticker, fundamentals, ltp, marketStatus }` |
| `StatStrip.tsx` | The 7-column stat strip in hero; reusable | `{ stats: Array<{label, value, subtext?}> }` |
| `ScorecardRing.tsx` | SVG radial ring with center label + caption (replaces current scorecard's bar style) | `{ score: number, max: number, label: string, description: string, color: string }` |
| `IndicatorRow.tsx` | Single 3-column row (name / value / signal badge) for technicals grid | `{ name, value, signal, signalType: 'bull' \| 'bear' \| 'neut' }` |
| `PeerComparisonTable.tsx` | Sticky-left scrollable peer table with `.me` and `.med` rows | `{ peers, median, currentSymbol }` |
| `GrowthGrid.tsx` | 4-column growth metrics card under P&L (Sales/Profit/Price CAGR/ROE × 10Y/5Y/3Y/TTM) | `{ sales, profit, price, roe }` (each an object of 4 periods) |
| `KeyFundamentalsGrid.tsx` | "At a glance" 2-col KV table (replaces current `KeyMetricsCard` if needed) | `{ rows: Array<{label, value}> }` |
| `DocumentsGrid.tsx` | 3-column filings/concalls/ratings grid (composes existing announcement + credit-rating data, adds concalls column) | `{ announcements, concalls, ratings }` |
| `AnalystTargetTrack.tsx` | Gradient bar with Current/Target markers + low/high labels | `{ low, current, target, high }` |
| `SentimentSummaryCard.tsx` | Side-by-side gauge + 3-bar stack + news items | `{ sentimentData }` |
| `TocSidebar.tsx` | Vertical scroll-spy sidebar with numbered links | `{ sections: NavSection[] }` |
| `AlphaCtaCard.tsx` | Navy gradient marketing card with gold glow (refines existing `GenerateAlphaCard`) | `{ symbol }` |

---

## 6. CMOTS coverage gating

Per the §9 contract: **5 panels hidden on uncovered, ProsConsPanel always visible.** The new design changes the section composition; here's the proposed gating per section.

| Section | Has CMOTS-only data | Has yfinance fallback | Gating |
|---|---|---|---|
| Hero strip | partly (sector P/E, mcap_type, ROE 5y-avg need CMOTS) | mostly yfinance | **Always visible**; CMOTS-only subtexts hide individually when null |
| Price Chart | no | yes | **Always visible** |
| Scorecard | no | yes (uses `stock_scorecard` accessor) | **Always visible** |
| AI Sentiment | no | yes (FinBERT pipeline) | **Always visible** |
| Technicals | no | yes (`indicator_calculator`) | **Always visible** |
| Pros & Cons | enhanced on covered | yes (yfinance fallback via adapter) | **Always visible** (per §9 contract) |
| **Peer Comparison** | depends on data source | yes if built from `stock_fundamentals` join | **Always visible** assuming yfinance-buildable; **CMOTS-gated** if it depends on `cmots_accessor.get_sector_medians` exclusively |
| Quarterly Results | richer 10-quarter view on CMOTS | yes (yfinance `quarterly_financials`) | **Always visible**, Standalone/Consolidated toggle only when CMOTS |
| Profit & Loss | richer 10y view on CMOTS | yes (yfinance `income_statement`) | **Always visible**, growth grid uses `cmots_ratio_yearly.roe` history → ROE row gracefully degrades on uncovered |
| Balance Sheet | richer on CMOTS | yes (yfinance) | **Always visible** |
| Cash Flows | richer on CMOTS | yes (yfinance) | **Always visible** |
| Ratios (days metrics + ROCE history) | yes (CMOTS) | partial (CCC can be derived from yfinance) | **CMOTS-gated** for ROCE row; days metrics can be derived from yfinance |
| Key Fundamentals (At a Glance) | no | yes | **Always visible** |
| Documents — Column 1 Announcements | no | yes (external_analyst.announcements) | **Always visible** |
| Documents — Column 2 Concalls/AR | **source unclear — open question §7** | TBD | TBD |
| Documents — Column 3 Credit Ratings | yes | none (no fallback) | **CMOTS-gated** — hide column on uncovered, or hide entire section if all 3 cols depend on CMOTS |
| Shareholding | richer on CMOTS | yes (Selenium scraper from screener.in) | **Always visible** |
| TOC sidebar | sections dynamically added based on what's rendered | n/a | dynamic |
| Generate Alpha CTA | no | yes | **Always visible** |
| Analyst Targets | no | yes (`useExternalAnalyst`) | **Always visible** |
| Reverse DCF | no | yes (`useReverseDCF`) | **Always visible** |

**The 5 currently CMOTS-gated panels** (RatiosPanel, FinancialStatementsPanel, CorporateActionsTimeline, NarrativesPanel, CreditRatingsPanel) get **re-distributed** in the new design:
- `FinancialStatementsPanel` → effectively replaces or augments existing yfinance financial-table sections (Quarterly/P&L/BS/CF/Ratios) — but the design doesn't gate these on coverage. Resolution: keep the yfinance-shape `FinancialTable` always-visible; add a Standalone/Consolidated toggle that only appears on CMOTS-covered tickers; CMOTS data flows through `stock_fundamentals` already via §6 backfill.
- `RatiosPanel` → its "Key Ratios" data feeds the "Days metrics + ROCE history" row in the design's Ratios section. Same gating logic.
- `CorporateActionsTimeline` → **not in new design**. Either drop or merge into Documents column 1.
- `NarrativesPanel` → **not in new design**. Either drop or repurpose as Documents column 2 source (PDF links to narrative documents).
- `CreditRatingsPanel` → embedded in Documents column 3, CMOTS-gated (hide column on uncovered).

---

## 7. Open questions / decisions needed

Listed in priority order. Each requires a decision before implementation.

### Data sourcing

1. **Peer comparison source.** Three paths:
   - (a) Build from `stock_fundamentals` peer rows by sector — fast, yfinance-only, won't have all metrics
   - (b) Use `cmots_accessor.get_sector_medians` — CMOTS-only, only median row not full peer rows
   - (c) Build a new `GET /api/peers/{ticker}` endpoint that does (a) plus median computation
   - **Which path?**

2. **"NIFTY 50" / index-membership badge.** Design shows this in hero for RELIANCE. Source options:
   - (a) Hard-coded constituent list in frontend (stale; needs manual updates)
   - (b) Query existing `indices` data — does the app already have NIFTY 50 constituent symbol lists?
   - (c) Skip the badge until a data source is wired
   - **Which path?**

3. **Documents column 2 "Annual reports & concalls"**. Design shows 5 items: FY25 annual report (PDF), Q4'25 concall transcript, Q3'25 concall, Q2'25 concall, FY24 annual report. **No current data source for this.** Options:
   - (a) Source from CMOTS `cmots_narrative` (Director's Report, MD&A, etc.) — but those are HTML blobs, not PDF links
   - (b) Source from `external_analyst` research reports endpoint — depends on what's actually in that response
   - (c) Skip column 2 entirely (drop from layout) and use a 2-column docs grid
   - **Which path?**

4. **Beta** field source. Design shows it in the hero stat strip. Does `stock_fundamentals` actually have a `beta` column populated by yfinance? **Verification needed** — if absent, source is unclear.

5. **Stock Price CAGR** (10Y/5Y/3Y/1Y) for the growth grid under P&L. Derivable from `usePriceChart` over long ranges — but `usePriceChart` typically returns a single timeframe at a time. Either (a) fetch monthly data over 10y and compute client-side, or (b) add a server-side helper. **Which?**

6. **Technical indicator signal classifications** ("Bullish", "Above", "Overbought", "Approaching", "Cross up", "Long", "Rising", etc.). Currently `indicator_calculator.py` returns raw numerics, no signal labels. Options:
   - (a) Client-side derivation rules per indicator (RSI > 70 = Overbought, MACD > 0 + rising = Bullish, etc.)
   - (b) Server-side classifier added to `indicator_calculator.py`
   - **Which path?** Either is fine; client-side keeps backend untouched.

7. **Sentiment score 0–100**. Design shows a single numeric sentiment score (72/100) plus a Pos/Neu/Neg breakdown. Current pipeline returns article-level scores. Derivation rule for the headline number?

### Visual / design system

8. **Color palette.** The design's tokens (HSL navy/gold/sky) **already exist in the current `client/src/index.css`** per `CLAUDE.md`. Confirm: no new color tokens to add; existing tokens already match the design.

9. **Geist vs Inter.** The design extraction references "Geist (400/500/600/700/800)". Current app uses Inter per `CLAUDE.md`. Both are similar; **stick with Inter or switch to Geist?** Switching adds a font load and design-token churn for marginal visual gain.

10. **Vertical TOC sidebar.** The design has the TOC in the right sidebar. The current `StockDetailNav` is a sticky **horizontal** bar at top. Keep both (horizontal nav stays as scroll-spy + add right-rail TOC), or replace? Mobile responsiveness matters here — the design is desktop-only.

11. **Section-level interaction.** The design shows all sections expanded by default (no collapse/expand). The current `CollapsibleSection` pattern allows users to collapse. Keep collapsing, or honor the design's always-expanded layout?

### Scope / pruning

12. **Drop `CorporateActionsTimeline.tsx` from this page?** It's not in the design. Options: (a) drop entirely from /stocks/:symbol, (b) merge actions into Documents column 1, (c) keep it as a hidden-by-default section accessible from a "View all" link.

13. **Drop `NarrativesPanel.tsx` from this page?** Same situation — not in the design. Options: (a) drop, (b) repurpose as Documents column 2 source.

14. **"+ Watchlist" and "Compare" buttons.** Watchlist is hidden in the current app (per `CLAUDE.md` Known Issues #6). Compare has no route. Wire them now (which means implementing watchlist), stub them, or hide?

15. **"View Sankey →" link in Shareholding section.** The Sankey component exists. Wire as a modal/drawer, route to a separate page, or just an in-page anchor scroll?

16. **The `Quarterly Results / P&L / Balance Sheet / Cash Flows / Ratios` block in the design is 5 tables.** The current page already has these. The design adds: Standalone/Consolidated tabs (CMOTS-only), narrow density (smaller padding/font), current-column highlight, sticky left, growth-grid card under P&L. All cosmetic/structural to existing `FinancialTable`. **Confirm: same data, restyled rendering — no data changes intended for these 5 sections?**

### Implementation philosophy

17. **Granularity of "phases".** Phase A in my proposal (page structure) means rebuilding the StockDetail.tsx layout shell BEFORE any new components are built. This means the page will look broken (wrong content per slot) for one phase. Acceptable, or prefer a different sequencing where every phase ships a fully-working page?

---

## 8. Implementation order proposal

Phasing principle: each phase is independently shippable. `/stocks/:symbol` works for both covered (ITC) and uncovered (RELIANCE) tickers after every step. Browser-verify both after every phase.

### Phase A — Layout shell + theme parity (no new data, no new components)

Rebuild `StockDetail.tsx` page structure to match the design's 2-column layout. Move existing components into the new slots; don't restyle them yet.

- Replace single-column layout with `grid-template-columns: 1fr 360px; gap: 24px`
- Move existing nav from horizontal sticky bar at top → vertical TOC sidebar in right column
- Right column: add CTA card slot + AnalystRecommendationCard slot + ReverseDCFCard slot (existing components, repositioned)
- Hero strip: keep existing hero block as-is (no restyling)
- Left column: keep current section order (price → pros/cons → quarterly/pnl/bs/cf/ratios → cmots sections → shareholding → sentiment → news → documents)
- **Verification:** page renders both covered and uncovered tickers with no breakage. Sidebar TOC works (scroll-spy + click). No visual polish yet.

### Phase B — Hero + Stat Strip + tokens

- Replace hero block with new `HeroStrip.tsx` matching the design (gradient bg, ticker mark, name+badges, price block, quick actions, 7-cell `StatStrip`).
- Wire P/E sector subtext (CMOTS sector-medians), 5Y P/B avg (CMOTS), 5Y ROE avg (CMOTS), 52W placement (derive), Beta (verify field) → all subtext lines gracefully degrade to nothing when not available
- "+ Watchlist" / "Compare" buttons stubbed (disabled or hidden — decision per §7 q14)
- Index badges (Large Cap from `tickers.mcap_type` if set; NIFTY 50 per decision in §7 q2)
- **Verification:** hero looks like the design; uncovered tickers still render their hero with derived/yfinance subtexts where possible

### Phase C — Restyle existing financial sections

- `FinancialTable.tsx` extensions: `.cur` column highlight, `.sub`/`.hl` row variants, narrow density variant, sticky-left enforcement
- Add growth grid card (`GrowthGrid.tsx`) under P&L section (uses existing `computeCagr` for Sales/Profit; defers Price CAGR + historical ROE to a CMOTS-gated path)
- Add Standalone/Consolidated tab on Quarterly + P&L sections (CMOTS-covered tickers only; existing `FinancialStatementsPanel` already supports this — wire through)
- Restyle Shareholding to match 4-row bar layout (existing data, new rendering)
- Restyle ReverseDCFCard to the sidebar variant
- **Verification:** all financial sections look like the design on covered (ITC) and uncovered (RELIANCE)

### Phase D — New components for existing data

- `ScorecardRing.tsx` × 3 (Quality/Value/Growth) — re-aggregate 7-dim scorecard into 3 rings per §3 mapping
- `IndicatorRow.tsx` + signal classification (client-side rules per §7 q6) — convert TechnicalIndicatorsTable to 2-column grid
- `SentimentSummaryCard.tsx` (compose existing sentiment gauge + bars + news items into one card)
- `AnalystTargetTrack.tsx` (new gradient-bar viz)
- `KeyFundamentalsGrid.tsx` (2-col KV table; aggregates fields already in `stock_fundamentals`)
- `DocumentsGrid.tsx` (3-column composition of existing `external_analyst.announcements` + CMOTS credit ratings + concalls source per §7 q3 decision)
- Restyle `GenerateAlphaCard.tsx` → `AlphaCtaCard.tsx`
- **Verification:** all sections in the design are visually represented on covered tickers; uncovered tickers gracefully degrade

### Phase E — New endpoints / accessors (if approved)

- `GET /api/peers/{ticker}` (per §7 q1 decision)
- Sector-median enhancements if `cmots_accessor.get_sector_medians` extension is approved
- Days-metrics derivation helpers (Debtor/Inventory/Payable/CCC/WC) — server-side or client-side per §7 q-various
- Beta field verification + backfill if absent
- **Verification:** Peer Comparison renders for ITC and RELIANCE (yfinance peer data sufficient for uncovered)

### Phase F — Polish: animations, hover states, mobile responsiveness

- Pulse dot on sentiment badge
- Score-ring fill animation on mount
- Table-row hover effects
- Mobile breakpoints: collapse to single column at `lg:` breakpoint, hide right sidebar (or move it to a drawer)
- Light/dark mode parity check on every new component

### Phase G — Cleanup

- Remove unused panels per §7 q12/q13 decisions (CorporateActionsTimeline, NarrativesPanel)
- Update TODO_CMOTS.md if any §10 prep gates shift
- Final `npm run check` clean run

---

## Summary / sanity check

- **Sections in design:** 16 (10 main + 6 sidebar/scattered)
- **Sections in current StockDetail.tsx:** ~14 (after §9 Phase 3 wiring)
- **Sections to drop entirely:** **0** (per principle — every existing capability stays; placement decided in Phase 0)
- **Sections to add:** 4–5 (Scorecard 3-ring, Peer Comparison, At a Glance, Documents 3-col grid, AnalystTargetTrack)
- **New endpoints needed:** 1 (Peers — CMOTS sector medians path) + 1 deferred (Annual Reports & Concalls)
- **CMOTS-gating contract:** **preserved**. ProsConsPanel always visible, days-metrics+ROCE row gracefully degrades, Documents column 3 CMOTS-gated, Section 13 (CorporateActions + Narratives pair) entirely CMOTS-gated.

**Phases A–C are non-risky** (layout + restyling of existing components + existing data). **Phase D** is medium-risk (new components but existing data; threshold-sensitive classifier work). **Phase E** is the riskier one (new endpoint surface area). **Phases F–G** are polish/cleanup.

---

## Phase 0 outcomes — DECISIONS LOCKED (2026-05-18)

All §7 open questions resolved. This section is the **canonical record** — if anyone picks up this redesign in 2 weeks or hands it off, the rationale lives here, not in chat history.

### §7 q1 — Peer comparison source
**LOCKED: path (a) — CMOTS sector medians.** Aggregate medians only, no named-peer rows. Named-peer comparison waits for production token + sector taxonomy. The current trial-token CMOTS `cmots_accessor.get_sector_medians(sector)` returns medians for the covered ticker's sector; uncovered tickers degrade gracefully.

### §7 q2 — NIFTY-50 / index-membership badge
**LOCKED: keep badge in design markup as static element for now.** Wire to real data later as a UI enhancement (not Phase B blocker). Mark wiring as deferred TODO in code with a clear comment. Source TBD when wiring (likely existing `indices` constituent data if available).

### §7 q3 — Documents column 2: Annual reports & concalls
**LOCKED: keep column in UI shell, initial empty state.** Add to deferred backlog: build `/v1/api/tickers/{symbol}/annual-reports` + concalls accessor on CMOTS. Phase D ships the empty-state UI; the endpoint is post-Phase-E follow-up.

### §7 q4 — Beta verification
**LOCKED: option (b) — drop Beta cell from hero stat strip.**
- Verified 2026-05-18: `stock_fundamentals` has 44 scalar columns; **none contain `beta`**. yfinance backfill didn't include it.
- Not backfilling, not client-deriving. Beta wasn't an existing feature; the design added it as new field; our data doesn't have it → remove from hero layout.
- Hero stat strip restructure: Phase B proposes a 6-cell layout OR a 7-cell layout with another existing scalar in Beta's place. Sketch to be surfaced in Phase B.
- If beta becomes important later, it gets added back as a proper feature with proper data sourcing.

### §7 q5 — Sankey placement (originally listed earlier; now formalized)
**LOCKED: keep `FinancialSankey.tsx`, inline expand inside P&L section.**
- Interaction: `View Revenue Flow →` toggle button in P&L section header. Click expands Sankey inline beneath the P&L table. Click again collapses.
- Default state: closed. Lazy mount on first toggle to avoid the `@nivo/sankey` bundle cost for users who don't expand.
- NOT a modal. NOT a separate route. Same page, no navigation.

### §7 q6 — Technical signal classification
**LOCKED: build client-side classifier module** at `client/src/lib/signal-classifiers.ts`. One pure function per indicator, returns typed string enum or null. **Two requirements before merge:**
1. **Row-by-row ruleset review** — surfaced in [DESIGN_STOCK_DETAIL_PHASE_0.md §5.1](DESIGN_STOCK_DETAIL_PHASE_0.md) with sources, edge cases, and 4 test cases per rule. User reviews each row before any classifier code is written. Highest-stakes review of the redesign.
2. **Unit tests** — minimum 3 cases per rule (above threshold, below threshold, edge boundary) + 1 null-input case. Documented inline in the rule entry. 26 rules × 4 = ~104 test cases.

### §7 q7 — Sentiment score 0–100 derivation
Pending: derivation rule for the headline number from FinBERT article-level scores. Not Phase A blocker; will be addressed during Phase D's SentimentSummaryCard build.

### §7 q8, q9 — Color palette + Geist/Inter font
**LOCKED: existing tokens stay.** Current `client/src/index.css` already has the navy/gold/sky HSL tokens; no new palette tokens. Continue with **Inter** as the sans family (design says Geist but functional difference is marginal; switching adds bundle + cache churn for no measurable visual gain).

### §7 q10 — Nav: vertical TOC vs horizontal sticky
**LOCKED: replace horizontal with vertical TOC.** Single nav in the right sidebar. Existing `useScrollSpy` + click-to-expand-and-scroll logic reused.

### §7 q11 — Section collapsing
**LOCKED: always-expanded.** Remove the collapse-toggle UI affordance from `CollapsibleSection.tsx` for the stock-detail page. If the component is used elsewhere where collapse matters, fork into a new component OR add `collapsible={false}` prop. No dead toggle UI in section headers.

### §7 q12 — CorporateActionsTimeline placement
**LOCKED: keep. Pair with NarrativesPanel in 1fr 1fr grid as Section 13.**
- Mirrors the Scorecard/Sentiment pair pattern at Section 02
- Both CMOTS-gated together; entire row hides on uncovered tickers (predictable single gate)
- Visual: two equal-width cards in one row, same `.card` frame as other sections
- TOC entry: "Corp Actions & Reports" (or two entries: "Corp Actions" + "Reports") — Phase D decision

### §7 q13 — NarrativesPanel placement
**LOCKED: same as §7 q12 — paired with CorporateActionsTimeline.**

### §7 q14 — "+ Watchlist" / "Compare" hero buttons
Pending Phase B decision: stub/hide, or wire to existing (hidden) watchlist + new compare route.

### §7 q15 — "View Sankey →" link target
Resolved by q5: inline expand within P&L. Not a separate Sankey section.

### §7 q16 — Financial tables data scope
**LOCKED: same data, restyled rendering. No data changes** for the 5 sections (Quarterly / P&L / BS / CF / Ratios). Design's additions are cosmetic: sticky-left, current-column highlight, narrow density, sub/highlight row variants, Standalone/Consolidated tab (CMOTS-only via existing `FinancialStatementsPanel`), growth grid under P&L.

### §7 q17 — Phasing granularity
**LOCKED: each phase is independently shippable.** Both ITC (covered) and RELIANCE (uncovered) must render after every phase. Browser-verify both after every phase. Verify-before-act discipline per §9 contract carries forward.

---

## Phase 0 outcomes — REQUIREMENTS LOCKED (operational)

### Indicator calculator extension (server-side)

**LOCKED: extend `server/indicator_calculator.py`** for all 7 missing indicators (Stochastic %K/%D, CCI 20, ADX 14, +DI, -DI, OBV, VWAP). Three operational requirements:

1. **Unit tests per indicator** using `pandas-ta` as the reference library. For each new indicator: generate a 100-bar synthetic OHLCV series, run both `pandas-ta` and our impl, assert match to 4 decimal places. Cite the `pandas-ta` source URL in each test file. Tests land at `tests/python/test_indicator_calculator_extensions.py`.
2. **Cross-verify against TradingView** for at least one real ticker (RELIANCE or ITC) per indicator on the daily timeframe. Numbers match to 2-decimal display precision. Discrepancies → investigate (Wilder smoothing vs EMA, windowing, etc.) before declaring done.
3. **Prior-bar-history problem** addressed via §6 below.

### Prior-bar-history proposal (data contract change)

**RECOMMENDED: option (a) — extend snapshot endpoint with `_prior` fields.** Awaiting final user confirmation.

The current `/api/technical-indicators/{ticker}` returns single-snapshot values. Classifier rules 12 (MACD cross) and 24 (OBV direction) need the previous bar's value. Option (a) adds 3 fields to the response (`macd_line_prior`, `macd_signal_prior`, `obv_prior`); the backend computes them from `series.iloc[-2]` on already-loaded data. ~10 LOC change. No cache layer, no race conditions.

Alternatives (rejected): (b) server-side cache → split-brain classifier logic, cache invalidation hell; (c) larger client-side window → duplicates server compute, bundle bloat. See [DESIGN_STOCK_DETAIL_PHASE_0.md §6](DESIGN_STOCK_DETAIL_PHASE_0.md) for full reasoning.

### Mobile responsiveness defaults (heuristic — analytics insufficient)

`page_views` has only 14 rows; mobile traffic share for `/stocks/:symbol` is undetectable. Phase F defaults to propose later: `lg:` (1024px) as the 2-col breakpoint; below `lg:` stacks to single column + drawer for TOC. To be revisited if traffic instrumentation lands before Phase F.

---

## Implementation gate (resolved 2026-05-18)

Both pre-Phase-A reviews resolved:

1. **Classifier ruleset (§5.1) shipped with v1 thresholds without row-by-row user pre-review.**
   - **Risk accepted:** some thresholds may not match trader expectations or canonical conventions in edge cases.
   - **Mitigation:** all thresholds live in a single client-side module (`client/src/lib/signal-classifiers.ts`); changes are a single-file edit with no backend or schema impact.
   - **Tuning-section requirement (locked):** the file MUST open with a clearly-commented `TUNING SECTION` exposing the 8 heuristic thresholds as named constants — MA position deadzone (±0.5%), MACD zero-line deadzone (0.1% of price), ATR vol bands (1% / 3% of price), volume multipliers (1.3× / 0.7×), Bollinger buffer (2%), OBV direction deadzone (0.1% of |prior|). Constants live at the top of the module; rule bodies reference them by name. Future tuning = edit constants, no logic changes.
   - **Post-launch tuning expected** based on user feedback within the first 30 days of live traffic.

2. **Prior-bar-history option (a) — extend snapshot endpoint with `_prior` fields — confirmed.** Backend change scoped for Phase D / Phase E.

**Phase A greenlit (2026-05-18).** Layout shell rebuild proceeds. Verification gate after Phase A: both ITC (covered) and RELIANCE (uncovered) render the new shell without regressions to existing functionality.
