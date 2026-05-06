# FT Panel Deep Rebuilds — tracking doc

> Companion to [MIGRATION_PLAN.md](MIGRATION_PLAN.md). Tracks which Financial
> Terminal panels still have the original EdgeFlow visual treatment vs. which
> have been rebuilt to the EquityPro v1 design language.

## Status legend

- ✅ **Deep rebuild done** — masthead + panel internals match design spec, real data wired, no mock numbers
- ☑️ **Masthead-only** (Batch 3) — page wrapper has the FtPageHeader band, but the inner panel still uses old EdgeFlow styling
- 🔧 **In flight** — partial work in progress

## Done

| Page | Route | Panel | Commit | Notes |
|--|--|--|--|--|
| ✅ FII / DII | `/fii-dii` | [FiiDii.tsx](EdgeFlow/client/src/pages/ft/FiiDii.tsx) | `890e197` | Reference template — KPI strip, paired bars, cumulative line, session table |
| ✅ Black-Scholes calculator | `/black-scholes` | [BlackScholesPanel.tsx](EdgeFlow/client/src/components/ft/BlackScholesPanel.tsx) | `6937d90` | 340px sidebar with sliders, gold-bordered theoretical-price card, 5-col Greeks row, dual charts, formula card. New IV solver + dividend yield. |
| ✅ Stock comparator | `/compare` | [GraphComparisonPanel.tsx](EdgeFlow/client/src/components/ft/GraphComparisonPanel.tsx) | `3c40202` | Pill selector, rebased perf chart with 1M-5Y + return-mode tabs, 15-row metrics table, correlation matrix, risk-return scatter. New `/api/compare/metrics` endpoint. |
| ✅ Monitor (multi-asset workspace) | `/monitor` | [QuickMonitor.tsx](EdgeFlow/client/src/components/ft/QuickMonitor.tsx) | `fa04f6c` | 3 quote tiles + 4 ranking tables (gainers / losers / 52w highs / 52w lows) + FII/DII / News / Sector heat. New `/api/monitor/sector-heat` and `/api/monitor/extremes` endpoints. |

## Pending (panel internals still original)

These pages already have the design-spec masthead from Batch 3, but the
panel components below still use old styling (`bg-card/50 border-primary/20`,
raw `text-green-500` / `text-red-500`, default shadcn cards, etc.). Each is
a self-contained per-page rebuild.

### Markets / Data

| Page | Route | Panel file | Approx. effort | Notes |
|--|--|--|--|--|
| ☑️ Most active | `/most-active` | [MostActivePanel.tsx](EdgeFlow/client/src/components/ft/MostActivePanel.tsx) | S | Already a clean table; restyling only. Real data via `/api/most-active`. |
| ☑️ World indices | `/world-indices` | [WorldIndicesPanel.tsx](EdgeFlow/client/src/components/ft/WorldIndicesPanel.tsx) | M | 12-card grid of global benchmarks. Verify yfinance fallback after recent NaN fix. |
| ☑️ News | `/news` | [TopNewsPanel.tsx](EdgeFlow/client/src/components/ft/TopNewsPanel.tsx) | S | List view; visual upgrade only. |
| ☑️ IPOs | `/ipos` | [IPOPanel.tsx](EdgeFlow/client/src/components/ft/IPOPanel.tsx) | M | Tabs (upcoming / open / listed) + table. |

### Charts / Trading

| Page | Route | Panel file | Approx. effort | Notes |
|--|--|--|--|--|
| ☑️ Advanced chart | `/chart/:symbol?` | [StockChart.tsx](EdgeFlow/client/src/components/ft/StockChart.tsx) | L | Lightweight-charts setup; mostly chrome restyling. |
| ☑️ Order book | `/order-book/:symbol?` | [OrderBookHeatmap.tsx](EdgeFlow/client/src/components/ft/OrderBookHeatmap.tsx) | M | L2 depth heatmap. Brand-aligned heat colours. |
| ☑️ Time & sales | `/time-sales/:symbol?` | [TimeAndSalesPanel.tsx](EdgeFlow/client/src/components/ft/TimeAndSalesPanel.tsx) | S | Tape view, mono numerics, design-token semantic colours. |
| ☑️ Watchlist | `/watchlist` | [WatchlistPanel.tsx](EdgeFlow/client/src/components/ft/WatchlistPanel.tsx) | M | Already redesigned somewhat in `/home`. Align with main panel. |

### Options

| Page | Route | Panel file | Approx. effort | Notes |
|--|--|--|--|--|
| ☑️ Option chain | `/options/:symbol?` | [OptionChainPanel.tsx](EdgeFlow/client/src/components/ft/OptionChainPanel.tsx) | L | Big matrix, ATM strike highlight, IV / OI / Greeks columns. |
| ☑️ Options visualizer | `/options-visualizer/:symbol?` | [OptionsVisualiser.tsx](EdgeFlow/client/src/components/ft/OptionsVisualiser.tsx) | L | 4-row stacked Plotly. Visual chrome + control panel restyling. |

### Analysis / Tools

| Page | Route | Panel file | Approx. effort | Notes |
|--|--|--|--|--|
| ☑️ Pair trading | `/pair-trading` | [PairFeasibilityPanel.tsx](EdgeFlow/client/src/components/ft/pair-trading/PairFeasibilityPanel.tsx) | L | Cointegration table + scatter + residuals. Coming Soon tabs already brand-clean. |
| ☑️ Pattern search | `/pattern-search` | [PatternSearchPanel.tsx](EdgeFlow/client/src/components/ft/PatternSearchPanel.tsx) | M | Form + result cards. |
| ☑️ Portfolio optimizer | `/portfolio-optimizer` | [PortfolioOptimizerPanel.tsx](EdgeFlow/client/src/components/ft/PortfolioOptimizerPanel.tsx) | L | Allocation pie, frontier scatter, weight table. |
| ☑️ Calculator | `/calculator` | [FinancialCalculator.tsx](EdgeFlow/client/src/components/ft/FinancialCalculator.tsx) | M | Position-size / P&L forms. |
| ☑️ Fundamental scanner | `/equity-screener` | [EquityScreener.tsx](EdgeFlow/client/src/components/ft/EquityScreener.tsx) | M | Boolean-rule builder + result table. |

### Research / Events

| Page | Route | Panel file | Approx. effort | Notes |
|--|--|--|--|--|
| ☑️ Research reports | `/research-reports` | [ResearchReportsPanel.tsx](EdgeFlow/client/src/components/ft/ResearchReportsPanel.tsx) | S | Card grid, target-price chips. |
| ☑️ Corporate actions | `/corporate-actions/:symbol?` | [CorporateActionsPanel.tsx](EdgeFlow/client/src/components/ft/CorporateActionsPanel.tsx) | S | Timeline-style table. |
| ☑️ Financial results | `/financial-results/:symbol?` | [FinancialResultsPanel.tsx](EdgeFlow/client/src/components/ft/FinancialResultsPanel.tsx) | M | Quarterly KPI strip + revenue/profit charts. |

### Personal / Community

| Page | Route | Panel file | Approx. effort | Notes |
|--|--|--|--|--|
| ☑️ Notes | `/notes` | [NotesEditor.tsx](EdgeFlow/client/src/components/ft/NotesEditor.tsx) | M | Markdown editor + tag rail. |
| ☑️ Forum | `/forum` | [ForumChat.tsx](EdgeFlow/client/src/components/ft/ForumChat.tsx) | M | Chat-style threads. |
| ☑️ Help | `/help` | [HelpPanel.tsx](EdgeFlow/client/src/components/ft/HelpPanel.tsx) | S | Docs/FAQ sections. |

## What "deep rebuild" means here

A deep rebuild brings the panel internals to the same standard as the
already-rebuilt examples (Black-Scholes / Compare / Monitor). Concretely:

1. **Layout** — match the design reference (`design/equitypro-v1/{page}.html`)
   for the panel section. Sidebar / main / sub-grid / tabs as the design shows.
2. **Editorial chrome** — section eyebrows, display-font (Playfair) headings on
   panel sub-sections, gold rule accents where the design uses them.
3. **Typography** — every numeric value uses `font-mono tabular-nums`. Every
   gain / loss uses `text-positive` / `text-negative` (no raw greens/reds).
   Card backgrounds use `bg-card`, borders `border-border` (no
   `bg-card/50 border-primary/20`).
4. **Charts** — Recharts series colours read via `getCSSColor("--chart-N")` or
   brand tokens. No hard-coded hex.
5. **Real data** — every field backed by an existing API or, if missing, a new
   endpoint added explicitly (like we did for `/api/compare/metrics`,
   `/api/monitor/sector-heat`, `/api/monitor/extremes`). No mock numbers.

## Effort key

- **S** (small, ~30–60 min): single-section panel, mostly token swaps.
- **M** (medium, 1–2 h): table + form layout restructure plus styling.
- **L** (large, 2–4 h): multi-section dashboard with multiple charts; may
  need a new backend endpoint.

## How to request a rebuild

Tell me which panel(s) by name (e.g. "rebuild Option chain"). I'll run the
same audit pattern used for Compare / Monitor — read the reference HTML,
inspect the panel and DB, propose what's available vs. missing, wait for
approval, then ship.
