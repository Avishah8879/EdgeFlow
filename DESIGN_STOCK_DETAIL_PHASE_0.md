# Stock Detail Redesign — Phase 0 Report

Verification + decision-staging output. **No code yet.** User reviews → Phase A greenlit.

**Principle internalized:** *"The design is a visual reference, not a feature contract. Every existing capability on the current StockDetail page stays in the redesigned page."* When the design omits an existing element, the agent's job is to find a sensible new placement — never drop unilaterally.

---

## 1. Beta field verification — **RESULT: FIELD ABSENT**

Queried `equityprodata_sync_dev` (PROD-superset, restored 2026-05-15):

```sql
SELECT column_name FROM information_schema.columns
 WHERE table_name='stock_fundamentals' AND lower(column_name) LIKE '%beta%';
-- (0 rows)
```

**`stock_fundamentals` has 44 scalar columns. None of them contain "beta".** Full inventory (non-JSONB): id, ticker_id, long_name, sector, industry, market_cap, current_price, trailing_pe, forward_pe, price_to_book, price_to_sales, peg_ratio, profit_margin, operating_margin, return_on_equity, return_on_assets, revenue_growth, earnings_growth, debt_to_equity, current_ratio, quick_ratio, total_cash, total_debt, shares_outstanding, float_shares, dividend_yield, dividend_rate, payout_ratio, ex_dividend_date, volume, avg_volume, enterprise_value, previous_close, open_price, day_high, day_low, fifty_two_week_high, fifty_two_week_low, description, website, last_updated, fetch_error, data_source, cmots_synced_at.

**Decision required before Phase B:**

| Option | What it means | Effort | Risk |
|---|---|---|---|
| (a) Backfill via yfinance | Migration to add `beta NUMERIC` column + extend yfinance writer to populate it. yfinance's `Ticker(...).info['beta']` is generally reliable for liquid NSE tickers; sparse on small-caps and recently-listed names. | 1 migration + 1 writer change. Low. | Sparse coverage → "—" placeholder for small-caps. |
| (b) Drop Beta cell from hero | Reduce stat strip from 7 cells to 6, OR replace Beta with another metric (e.g. "Volume / Avg" relative volume, which is already in `stock_fundamentals`). | Pure UI change. Zero backend. | Loses the metric. |
| (c) Derive client-side from price chart | Compute 252-day daily-return correlation with NIFTY-50 returns. Requires NIFTY-50 OHLC alongside ticker OHLC; both already in `ohlc_daily`. | Medium — new client-side hook + correlation lib. Renders every page-load. | Compute cost on cold renders; values shift daily without explicit invalidation. |

**My recommendation:** (a) **backfill via yfinance**. Two reasons: (1) yfinance already provides this field in its standard payload, so the writer change is one extra column write; (2) Beta is a "stable" fundamental — daily updates are fine; client-side computation per-render would be wasteful for a slow-moving number. Surface for your decision.

---

## 2. Sankey decision confirmation — **LOCKED 2026-05-18**

**Decision: keep `FinancialSankey.tsx`, nested inside the P&L section as an inline-expandable secondary view.**

### Interaction pattern (confirmed inline, NOT modal/route)

- A `View Revenue Flow →` toggle button lives in the P&L section header (right side, next to existing "Schedule of P&L →" button).
- Clicking the toggle **expands the Sankey diagram inline beneath the P&L table within the same section**. State is local React state, no URL change.
- Clicking again collapses it back to the default closed state.
- Default state: **closed** (Sankey hidden, table shown). Avoids long initial page render and keeps the P&L section scannable.
- Smooth height transition (grid-rows trick or framer-motion) for the expand/collapse, matching the existing `CollapsibleSection` animation primitive.

**Why inline (not modal):**
- Keeps users on the page; no route navigation, no nested modal context-switch
- Matches the user-preferred behavior ("keeps users on the page, no route navigation")
- Sankey state lives next to the P&L data it visualizes — locality of reasoning
- Modal would compete with the existing CollapsibleSection collapse-toggle UX, which we're already removing per §7 q11

### What stays unchanged

- `FinancialSankey.tsx` internals — no component changes
- `useSankey` + `useSankeyYears` hooks — no changes
- `server/sankey.py` — no changes

### What changes (Phase C scope)

- New toggle UI in the P&L section header (matches design's button styling)
- Local `useState` in the P&L section to gate the Sankey render
- Initial render: Sankey is NOT in the DOM (mounted lazily on first toggle) — avoids the `@nivo/sankey` bundle hit for users who never expand

---

## 3. Mobile traffic share — **DATA INSUFFICIENT**

Queried `page_views`:
- Table exists with `device_type`, `browser`, `os`, `screen_resolution` columns.
- **Total rows: 14.** Sample size far too small to derive a mobile traffic share for `/stocks/:symbol`.

**Implication for Phase F (responsive design):**
- Analytics signal is unavailable. Mobile breakpoint decisions will be design-heuristic rather than data-driven.
- The reference design is **desktop-only** — no mobile breakpoints visible in the HTML mockup.
- Defaults to propose in Phase F (for you to confirm later):
  - **`lg:` (1024px)** as the desktop-shell breakpoint — full 2-column layout
  - **Below `lg:`** — stack to single column, move TOC sidebar to a `Sheet` drawer (existing shadcn pattern), keep horizontal scroll on financial tables (already there)
  - **Below `md:` (768px)** — collapse stat strip from 7 columns to 2-up (4 rows of 2)

No blocker for Phase A.

---

## 4. Placement proposals for CorporateActionsTimeline + NarrativesPanel

Both have rich existing functionality and CMOTS-only data sources. Per the locked principle, both must be placed in the new layout, not dropped.

### 4.1 CorporateActionsTimeline

**Current data:** ~8–19 events per covered ticker (per §9 baseline: ITC has 8, VEDL has 19). Includes dividends, bonuses, splits, rights, board meetings, AGM, EGM, book closures, mergers/demergers, OFS, change-of-name, delistings, forthcoming events. Existing internal rendering is a color-coded vertical timeline.

**Option A — Standalone full-width section between Documents and Shareholding.**
- Position: section #13 in the new TOC (after Documents, before Shareholding)
- Title: "Corporate Actions" with subtitle "Dividends, bonuses, board meetings & more"
- Visual: same `.card` frame as other sections; internal timeline rendering kept as-is (`<CorporateActionsTimeline>` already renders this)
- Pros: clean separation; doesn't crowd Documents; CMOTS-gated (hide entire section on uncovered, same §9 contract)
- Cons: adds vertical length to an already-long page

**Option B — Side-by-side with NarrativesPanel in a 1fr 1fr grid (paired section).**
- Position: section #13, mirroring the Scorecard/Sentiment pair pattern at section #02
- Title left card "Corporate Actions" / right card "Reports"
- Visual: two equal-width cards in one row; matches the existing visual pattern of paired cards
- Pros: density; both CMOTS-only sections grouped together so the entire row hides on uncovered tickers; visual rhythm with Section #02
- Cons: vertical timelines compete for visual attention next to narrative content blocks; on narrow viewports both stack vertically (loses the pairing)

**🟢 My recommended choice: Option B (paired with NarrativesPanel).** Reasoning:
- Both are CMOTS-gated; pairing makes the gating predictable (either both visible or neither)
- Mirrors the existing Scorecard/Sentiment pair (Section #02), reinforcing the page's visual rhythm
- The current 16-section TOC already feels long — pairing reduces it by 1 entry

### 4.2 NarrativesPanel

**Current data:** 5 doc-type toggles (Director's Report / Chairman / Auditor / MD&A / Notes), HTML body rendering. ~5 entries per covered ticker (one per doc type).

**Option A — Standalone full-width section between Documents and Shareholding.**
- Position: section #14 in TOC
- Title: "Reports" with subtitle "Director's Report, Auditor's Report, MD&A"
- Visual: same `.card` frame; internal toggle button row + body content area kept as-is
- Pros: gives the long narrative HTML space to breathe; users can read in full
- Cons: adds vertical length

**Option B — Side-by-side with CorporateActionsTimeline (paired, as per §4.1 Option B).**

**🟢 My recommended choice: Option B (paired with CorporateActionsTimeline).** Same rationale as above — predictable CMOTS gating + visual rhythm.

### 4.3 Proposed layout sketch (with placements)

```
Hero (always visible)
├─ Section 01: Price Chart (always)
├─ Section 02: [ Scorecard | Sentiment ]   (1fr 1fr pair — both always)
├─ Section 03: Technicals (always)
├─ Section 04: Pros & Cons (always, ProsConsPanel adapter)
├─ Section 05: Peer Comparison (always — CMOTS sector medians; aggregate-only)
├─ Section 06: Quarterly Results (always — yfinance / CMOTS-augmented)
├─ Section 07: P&L  + Growth Grid  + Revenue Flow link → Sankey (always)
├─ Section 08: Balance Sheet (always)
├─ Section 09: Cash Flows (always)
├─ Section 10: Ratios (always — days metrics derivable; ROCE-history row CMOTS-only)
├─ Section 11: At a Glance (always)
├─ Section 12: Documents (3-col: Announcements | AR+Concalls | Credit Ratings)
│              ├─ Col 1: Announcements (yfinance external_analyst.announcements)
│              ├─ Col 2: Annual Reports & Concalls — initially empty state with TODO comment; deferred endpoint
│              └─ Col 3: Credit Ratings (CMOTS-gated; hide column on uncovered)
├─ Section 13: [ Corporate Actions | Reports ]   (1fr 1fr pair — BOTH CMOTS-gated; entire row hides on uncovered)
└─ Section 14: Shareholding (always)

Right sidebar (sticky top 80px, 360px wide):
├─ TOC sidebar (vertical, numbered, scroll-spy)
├─ Generate Alpha CTA card
├─ Analyst Targets (with new gradient track)
└─ Reverse DCF
```

**Total TOC entries:** 14 sections × 1 nav entry per section, with Documents being one entry pointing to the whole 3-col grid. On covered tickers: 14 entries. On uncovered: 13 (Section 13 paired-CMOTS-row hides).

---

## 5. Technical signal classifier ruleset — **REVISED 2026-05-18 with citations + edge cases + test cases**

To be implemented at `client/src/lib/signal-classifiers.ts`. **Pure functions, no React deps, fully unit-testable.** Each function takes raw numeric input(s) and returns one of:

- A typed string literal from the rule's output enum
- `null` — when the input is missing, NaN, or insufficient (e.g. zero-divide guard, history-less rules)

### 5.0 Universal preconditions (apply to every rule)

Every classifier MUST run this guard BEFORE its rule body:

```
if any input is undefined, null, NaN, +/-Infinity → return null
if a denominator would be zero (e.g. 52W high = 0) → return null
```

**Null-output rendering convention (UI contract, applies to every rule that can return null):**

When a classifier returns `null`, the UI MUST render **an informative fallback string**, not a bare `—`. Each rule below documents its specific fallback text in its "Edge cases" section. The fallback should be specific enough that the user understands *why* there's no signal (insufficient data, suspended ticker, zero-divide, etc.) — never just a dash.

Standard fallback patterns by failure mode:
- **Missing prior bar:** `"Insufficient history"` with tooltip explaining what history is needed
- **Suspended / illiquid ticker** (e.g. `vol_sma20 == 0`): `"Data unavailable"`
- **Out-of-range / NaN input:** `"—"` with tooltip `"Indicator unavailable"`
- **Zero denominator** (e.g. `52W high = 0`): `"—"` with tooltip `"Reference value missing"`

Implementation: the renderer takes `(classification: string | null, fallbackContext: 'missing_history' | 'suspended' | 'invalid' | 'zero_denom')` and produces the right label + tooltip. The classifier function itself only returns the enum or `null`; the renderer maps null → user-facing copy.

Bollinger rules 13–14 return the literal string `"—"` (an explicit enum value, NOT null) when CMP is mid-band — that's a semantically meaningful "no proximity event", not a missing-data state. It renders as a plain dash with no tooltip. Distinguishes from null cases.

**Citation-source legend** used in §5.1:
- **Wilder (1978)** — Wilder, J. Welles. *New Concepts in Technical Trading Systems*. Trend Research. Standard reference for RSI, ATR, ADX/DMI thresholds.
- **Lane (1984)** — Lane, George C. "Lane's Stochastics", *Technical Analysis of Stocks and Commodities*, May 1984.
- **Lambert (1980)** — Lambert, Donald R. "Commodity Channel Index: Tool for Trading Cyclic Trends", *Commodities*, October 1980.
- **Granville (1963)** — Granville, Joseph E. *Granville's New Key to Stock Market Profits*. Prentice-Hall.
- **Bollinger (2001)** — Bollinger, John. *Bollinger on Bollinger Bands*. McGraw-Hill.
- **Murphy (1999)** — Murphy, John J. *Technical Analysis of the Financial Markets*. NYIF. General chartist conventions (moving averages, trend identification).
- **Investopedia** — used as a cross-check; URL form `investopedia.com/terms/<i>/<indicator>.asp`. Cited specifically where it confirms or contradicts the primary source.
- **Heuristic** — explicitly labeled when no canonical source supports the threshold. These rules are the most likely targets for your edits.

### 5.1 Rule-by-rule specification

Each rule below is independently testable. Format: **Inputs / Outputs / Rule / Source / Edge cases / Test cases**.

---

#### Rule 1–4: SMA position (SMA 20, SMA 50, SMA 100, SMA 200) vs CMP

- **Inputs:** `cmp: number`, `sma: number`
- **Outputs:** `"Above" | "Below" | "At" | null`
- **Rule:**
  ```
  if cmp > sma * 1.005 → "Above"
  if cmp < sma * 0.995 → "Below"
  else                  → "At"
  ```
- **Source:** Murphy (1999), Ch. 9 (moving averages). The Above/Below classification is fundamental chartist practice. The **±0.5% deadzone** is **heuristic** (not canonical) — chosen to suppress noise on tickers trading within 50bps of a moving average. Common screener convention (e.g. Finviz, TradingView use similar tight bands).
- **Edge cases:** null/NaN inputs → null. `sma == 0` is impossible for a real ticker but defensively → null.
- **Test cases:**
  1. `cmp=2912.50, sma=2889.40` → "Above" (0.80% above, ITC SMA 20 from design)
  2. `cmp=2862.10, sma=2889.40` → "Below" (-0.95% below)
  3. `cmp=2900.00, sma=2889.40` → "At" (+0.37%, within deadzone)
  4. `cmp=null, sma=2889.40` → null

---

#### Rule 5–9: EMA position (EMA 9, EMA 12, EMA 26, EMA 50, EMA 200) vs CMP

- **Inputs:** `cmp: number`, `ema: number`
- **Outputs:** `"Above" | "Below" | "At" | null`
- **Rule:** identical to rules 1–4 (SMA), substituting `ema` for `sma`.
- **Source:** Same as rules 1–4. EMA is mechanically different but the position classification rule is the same.
- **Edge cases:** same.
- **Test cases:** same shape as rules 1–4 (one per output + null).

---

#### Rule 10: RSI 14

- **Inputs:** `rsi: number` (0–100)
- **Outputs:** `"Overbought" | "Oversold" | "Bullish" | "Bearish" | "Neutral" | null`
- **Rule:**
  ```
  if rsi > 70  → "Overbought"
  if rsi < 30  → "Oversold"
  if rsi > 50  → "Bullish"
  if rsi < 50  → "Bearish"
  if rsi == 50 → "Neutral"
  ```
- **Source:** Wilder (1978), Ch. 4. The **70/30 thresholds** are Wilder's original specification and remain the universal default. Cross-check: Investopedia. **Disagreement note:** some Forex traders use **80/20** for aggressive markets; we follow the equity-standard 70/30. **No support** for the 80/20 variant in the literature for Indian equities.
- **Edge cases:** `rsi < 0` or `rsi > 100` should be impossible (RSI is bounded); defensively return null for those. NaN/null → null.
- **Test cases:**
  1. `rsi=75` → "Overbought"
  2. `rsi=25` → "Oversold"
  3. `rsi=63.4` → "Bullish" (ITC RSI from design)
  4. `rsi=70` → "Bullish" (boundary — strict greater-than, so 70 is NOT overbought)
  5. `rsi=null` → null

---

#### Rule 11: MACD line vs zero

- **Inputs:** `macd: number`, `cmp: number` (for relative-deadzone scaling)
- **Outputs:** `"Bullish" | "Bearish" | "Neutral" | null`
- **Rule:**
  ```
  if |macd| < 0.001 * cmp → "Neutral"  (≈ 1 paisa per ₹10 of stock price)
  if macd > 0            → "Bullish"
  if macd < 0            → "Bearish"
  ```
- **Source:** Appel, Gerald (1979). Original MACD specification: MACD > 0 is bullish, MACD < 0 is bearish. Cross-check: Investopedia. The **0.1% deadzone** is **heuristic** — without it, MACD oscillating around zero would flicker between Bullish/Bearish on small price changes. 0.1% of price is a common smoothing convention; user may want stricter (0.05%) or looser (0.5%).
- **Edge cases:** `cmp` must be > 0 for the deadzone calculation; if `cmp` is null/0, return null.
- **Test cases:**
  1. `macd=18.42, cmp=2948.55` → "Bullish" (ITC MACD line from design)
  2. `macd=-5.20, cmp=2948.55` → "Bearish"
  3. `macd=1.50, cmp=2948.55` → "Neutral" (|1.50| < 2.95, within 0.1% deadzone)
  4. `macd=null, cmp=2948.55` → null

---

#### Rule 12: MACD signal-line crossover

- **Inputs:** `macd: number`, `macd_signal: number`, `macd_prior: number`, `macd_signal_prior: number`
- **Outputs:** `"Cross up" | "Cross down" | "Bullish" | "Bearish" | null`
- **Rule:**
  ```
  if any input is null → return single-bar fallback (see edge cases)
  if macd > macd_signal AND macd_prior ≤ macd_signal_prior → "Cross up"
  if macd < macd_signal AND macd_prior ≥ macd_signal_prior → "Cross down"
  if macd > macd_signal → "Bullish"
  if macd < macd_signal → "Bearish"
  if macd == macd_signal → "Bullish" (favors continuation on the deadzone)
  ```
- **Source:** Appel (1979). Signal-line crossover is the canonical MACD trade trigger. Cross-check: Investopedia https://www.investopedia.com/terms/m/macd.asp.
- **Edge cases (single-bar fallback):** When `macd_prior` or `macd_signal_prior` is null (insufficient history — see §6 prior-bar-history proposal), the function **degrades gracefully**:
  ```
  if macd > macd_signal → "Bullish"
  if macd < macd_signal → "Bearish"
  ```
  No "Cross up/down" can be reported without history. UI displays "Bullish" or "Bearish" instead of cross detection.
- **Test cases:**
  1. `macd=18.42, signal=12.10, macd_prior=8.50, signal_prior=10.00` → "Cross up" (crossed from below)
  2. `macd=18.42, signal=12.10, macd_prior=15.00, signal_prior=11.00` → "Bullish" (was already above)
  3. `macd=5.00, signal=12.10, macd_prior=15.00, signal_prior=10.00` → "Cross down" (crossed from above)
  4. `macd=18.42, signal=12.10, macd_prior=null, signal_prior=null` → "Bullish" (fallback, no cross detection)
  5. `macd=null, …` → null

---

#### Rule 13: Bollinger upper-band proximity

- **Inputs:** `cmp: number`, `boll_upper: number`
- **Outputs:** `"At upper" | "Approaching upper" | "—" | null`
- **Rule:**
  ```
  if cmp ≥ boll_upper          → "At upper"
  if cmp > boll_upper * 0.98   → "Approaching upper"
  else                          → "—"
  ```
- **Source:** Bollinger (2001), Ch. 8 — touching/crossing the upper band is a defined event. The "Approaching" zone at **98% of upper band** is **heuristic** (no canonical "approaching" definition in Bollinger's framework). Chosen as a 2% buffer common in screener UIs.
- **Edge cases:** `boll_upper ≤ 0` (impossible for real tickers) → null.
- **Test cases:**
  1. `cmp=2980, boll_upper=2973` → "At upper"
  2. `cmp=2945, boll_upper=2973` → "Approaching upper" (~99.06% of upper)
  3. `cmp=2900, boll_upper=2973` → "—"
  4. `cmp=null, boll_upper=2973` → null

---

#### Rule 14: Bollinger lower-band proximity

- **Inputs:** `cmp: number`, `boll_lower: number`
- **Outputs:** `"At lower" | "Approaching lower" | "—" | null`
- **Rule:**
  ```
  if cmp ≤ boll_lower          → "At lower"
  if cmp < boll_lower * 1.02   → "Approaching lower"
  else                          → "—"
  ```
- **Source:** Bollinger (2001). Same framework as Rule 13. The 102% buffer is the symmetric heuristic of the 98% buffer for the upper band.
- **Edge cases:** `boll_lower ≤ 0` → null.
- **Test cases:**
  1. `cmp=2800, boll_lower=2805.80` → "At lower"
  2. `cmp=2845, boll_lower=2805.80` → "Approaching lower" (~101.4% of lower)
  3. `cmp=2900, boll_lower=2805.80` → "—"
  4. `cmp=null, boll_lower=2805.80` → null

---

#### Rule 15: ATR 14 volatility classification

- **Inputs:** `atr14: number`, `cmp: number`
- **Outputs:** `"Vol high" | "Vol normal" | "Vol low" | null`
- **Rule:**
  ```
  ratio = atr14 / cmp
  if ratio > 0.03 → "Vol high"   (ATR > 3% of price)
  if ratio < 0.01 → "Vol low"    (ATR < 1% of price)
  else            → "Vol normal"
  ```
- **Source:** Wilder (1978), Ch. 2 (ATR introduction). Wilder did NOT define "high/low" thresholds — only the calculation method. The **1%/3% bands** are **heuristic**, based on typical NSE equity ATR-to-price ratios (large-caps are usually 1–3%, small-caps higher). User may prefer a comparative basis (e.g., current ATR vs 60-period mean ATR) for cross-ticker comparability — flagged as edit target.
- **Edge cases:** `cmp == 0` → null. `atr14 < 0` (impossible) → null.
- **Test cases:**
  1. `atr14=42.18, cmp=2948.55` → "Vol normal" (1.43%, ITC values from design)
  2. `atr14=120, cmp=2948.55` → "Vol high" (~4.07%)
  3. `atr14=20, cmp=2948.55` → "Vol low" (~0.68%)
  4. `atr14=null, cmp=2948.55` → null

---

#### Rule 16–17: Supertrend (7,3) and Supertrend (10,3) vs CMP

- **Inputs:** `cmp: number`, `supertrend: number`
- **Outputs:** `"Long" | "Short" | null`
- **Rule:**
  ```
  if cmp > supertrend → "Long"
  if cmp < supertrend → "Short"
  if cmp == supertrend → "Long" (continuation default)
  ```
- **Source:** Seban, Olivier (~2008, original implementation in TradeStation/MT4) — Supertrend was popularized by `pandas-ta` documentation https://github.com/twopirllc/pandas-ta. The Long/Short classification is **definitional**: Supertrend itself flips direction at the crossover (most implementations return a direction flag alongside the band value). We use the cmp-vs-line comparison as the canonical re-derivation.
- **Edge cases:** null inputs → null. No deadzone — Supertrend's stair-step nature makes "At" meaningless (the line jumps in discrete steps when direction flips).
- **Test cases:**
  1. `cmp=2948.55, supertrend=2832.40` → "Long" (ITC ST 7,3 from design)
  2. `cmp=2800, supertrend=2832.40` → "Short"
  3. `cmp=2832.40, supertrend=2832.40` → "Long" (equality favors continuation)
  4. `cmp=null, supertrend=2832.40` → null

---

#### Rule 18: Volume vs Volume SMA 20

- **Inputs:** `volume: number`, `vol_sma20: number`
- **Outputs:** `"Above avg" | "Below avg" | "Normal" | null`
- **Rule:**
  ```
  ratio = volume / vol_sma20
  if ratio > 1.3 → "Above avg"
  if ratio < 0.7 → "Below avg"
  else           → "Normal"
  ```
- **Source:** Murphy (1999), Ch. 12 — volume confirmation is standard. The **1.3× / 0.7× bands are heuristic** — no canonical thresholds exist. Compared to peers: Finviz "Unusual volume" uses 1.5×; TradingView's volume oscillator uses session multipliers. Our 1.3×/0.7× is mid-aggressive. User may want 1.5×/0.5× or 1.2×/0.8×.
- **Edge cases:** `vol_sma20 == 0` (suspended tickers) → null. `volume < 0` (impossible) → null.
- **Test cases:**
  1. `volume=10_500_000, vol_sma20=6_810_000` → "Above avg" (1.54×, ITC values from design)
  2. `volume=4_000_000, vol_sma20=6_810_000` → "Below avg" (0.59×)
  3. `volume=7_500_000, vol_sma20=6_810_000` → "Normal" (1.10×)
  4. `volume=null, vol_sma20=6_810_000` → null

---

#### Rule 19–20: Stochastic %K and Stochastic %D

- **Inputs:** `stoch: number` (0–100)
- **Outputs:** `"Overbought" | "Oversold" | "Neutral" | null`
- **Rule:**
  ```
  if stoch > 80 → "Overbought"
  if stoch < 20 → "Oversold"
  else          → "Neutral"
  ```
- **Source:** Lane (1984). The **80/20 thresholds** are Lane's original specification. Cross-check: Investopedia. **Disagreement note:** Some practitioners use **75/25** (more sensitive) or **70/30** (matches RSI for uniformity). The 80/20 is dominant in modern usage; we use it.
- **Edge cases:** stoch < 0 or > 100 → null (impossible for real Stochastic).
- **Test cases:**
  1. `stoch=85` → "Overbought"
  2. `stoch=15` → "Oversold"
  3. `stoch=81.2` → "Overbought" (ITC Stoch %K from design)
  4. `stoch=80` → "Neutral" (boundary — strict greater-than)
  5. `stoch=null` → null

---

#### Rule 21: CCI 20

- **Inputs:** `cci: number`
- **Outputs:** `"Strong" | "Weak" | "Neutral" | null`
- **Rule:**
  ```
  if cci > 100  → "Strong"
  if cci < -100 → "Weak"
  else          → "Neutral"
  ```
- **Source:** Lambert (1980). The **±100 thresholds** are Lambert's original specification — designed so that ~70–80% of CCI values fall within ±100 (cyclic trend zone). Cross-check: Investopedia. **No common variant** — ±100 is universal. Some traders use ±200 as "extreme" zones (would add additional "Strong+" / "Weak+" enums); we don't model this in v1.
- **Edge cases:** null/NaN → null. CCI is unbounded so no range check.
- **Test cases:**
  1. `cci=118.4` → "Strong" (ITC CCI 20 from design)
  2. `cci=-150` → "Weak"
  3. `cci=50` → "Neutral"
  4. `cci=null` → null

---

#### Rule 22: ADX 14

- **Inputs:** `adx: number`
- **Outputs:** `"Strong trend" | "Trending" | "Weak" | "No trend" | null`
- **Rule:**
  ```
  if adx > 50         → "Strong trend"
  if adx > 25         → "Trending"
  if adx < 20         → "No trend"
  else (20 ≤ adx ≤ 25) → "Weak"
  ```
- **Source:** Wilder (1978), Ch. 5 (DMI/ADX). Wilder's original: ADX > 25 = trending market, ADX > 50 = exceptionally strong. Cross-check: Investopedia. **Disagreement note:** Some platforms use **ADX > 20** as the "trend exists" threshold (looser); Wilder's 25 is more conservative. We use 25/50 per Wilder.
- **Edge cases:** ADX is bounded 0–100; out-of-range → null.
- **Test cases:**
  1. `adx=55` → "Strong trend"
  2. `adx=26.8` → "Trending" (ITC ADX 14 from design)
  3. `adx=22` → "Weak"
  4. `adx=15` → "No trend"
  5. `adx=null` → null

---

#### Rule 23: +DI vs -DI

- **Inputs:** `plus_di: number`, `minus_di: number`
- **Outputs:** `"Above -DI" | "Below -DI" | null`
- **Rule:**
  ```
  if plus_di > minus_di → "Above -DI"
  if plus_di < minus_di → "Below -DI"
  if plus_di == minus_di → "Above -DI" (favors continuation default)
  ```
- **Source:** Wilder (1978), Ch. 5. +DI > -DI = bullish directional movement. Cross-check: Investopedia.
- **Edge cases:** null inputs → null. Cross detection (similar to MACD) is not modeled here for simplicity; "Above -DI" / "Below -DI" is the equivalent of Bullish/Bearish without history.
- **Test cases:**
  1. `plus_di=28.1, minus_di=14.6` → "Above -DI" (ITC values from design)
  2. `plus_di=14.6, minus_di=28.1` → "Below -DI"
  3. `plus_di=20.0, minus_di=20.0` → "Above -DI" (equality default)
  4. `plus_di=null, minus_di=14.6` → null

---

#### Rule 24: OBV direction (vs prior bar)

- **Inputs:** `obv_current: number`, `obv_prior: number`
- **Outputs:** `"Rising" | "Falling" | "Flat" | null`
- **Rule:**
  ```
  if any input is null → return null (no fallback — direction is meaningless without history)
  delta = obv_current - obv_prior
  if delta > 0.001 * |obv_prior| → "Rising"
  if delta < -0.001 * |obv_prior| → "Falling"
  else                            → "Flat"
  ```
- **Source:** Granville (1963). OBV is a cumulative indicator; direction = sign of period-over-period change. Cross-check: Investopedia. The **0.1% deadzone** is **heuristic** — OBV magnitudes can be in billions, so absolute deltas need scaling. Common screener convention treats < 0.1% changes as noise.
- **Edge cases:** If history is unavailable, return null (no graceful fallback like MACD — there's no single-bar interpretation of OBV direction).
  - **UI fallback when null:** render `"Insufficient history"` with tooltip text `"OBV direction requires the prior bar's OBV value. Will populate once /api/technical-indicators returns the _prior fields per Phase 0 §6."` (See §5.0 universal null-rendering convention.)
- **Test cases:**
  1. `obv_current=1_420_000_000, obv_prior=1_400_000_000` → "Rising" (Δ +1.4%)
  2. `obv_current=1_380_000_000, obv_prior=1_400_000_000` → "Falling" (Δ -1.4%)
  3. `obv_current=1_400_500_000, obv_prior=1_400_000_000` → "Flat" (Δ +0.036%)
  4. `obv_current=1_420_000_000, obv_prior=null` → null

---

#### Rule 25 (extra): VWAP vs CMP

- **Inputs:** `cmp: number`, `vwap: number`
- **Outputs:** `"Above" | "Below" | null`
- **Rule:**
  ```
  if cmp > vwap → "Above"
  if cmp < vwap → "Below"
  if cmp == vwap → "Above" (equality default)
  ```
- **Source:** No canonical academic source — VWAP-vs-price is an institutional convention. Cross-check: Investopedia https://www.investopedia.com/terms/v/vwap.asp ("price > VWAP = bullish intraday"). No deadzone since VWAP is computed for a specific session and is meaningful to the cent.
- **Edge cases:** null inputs → null. `vwap ≤ 0` is impossible → null.
- **Test cases:**
  1. `cmp=2948.55, vwap=2924.55` → "Above" (ITC VWAP from design)
  2. `cmp=2900.00, vwap=2924.55` → "Below"
  3. `cmp=2924.55, vwap=2924.55` → "Above" (equality)
  4. `cmp=null, vwap=2924.55` → null

---

#### Rule 26 (extra): 52W High proximity

- **Inputs:** `cmp: number`, `fifty_two_week_high: number`
- **Outputs:** `number` (signed percentage, e.g. `-8.4`) | `null`
- **Rule:**
  ```
  result = (cmp - high) / high * 100
  ```
  Returns the raw signed percentage. Renderer formats as e.g. `−8.4 %` (negative below) or `+0.5 %` (rare positive when CMP exceeds prior 52W high).
- **Source:** Standard — no canonical "signal" classification, just the distance metric. Cross-check: Investopedia. **Not a "signal" classifier** in the same sense as the others — returns a number, not a string enum. The design renders this as a percentage delta, not a badge.
- **Edge cases:** `high == 0` → null. `high < cmp` is valid (just-broke-out tickers) — returns positive percentage.
- **Test cases:**
  1. `cmp=2948.55, high=3217.70` → `-8.36` (ITC values from design)
  2. `cmp=3250.00, high=3217.70` → `+1.00` (breakout)
  3. `cmp=3217.70, high=3217.70` → `0.00`
  4. `cmp=null, high=3217.70` → null

---

### 5.2 Indicator coverage gap

Per [server/indicator_calculator.py](server/indicator_calculator.py) and CLAUDE.md's standard set:

| Indicator | Currently returned by `calculate_all_indicators()`? |
|---|---|
| SMA 20/50/100/200, EMA 9/12/26/50/200 | ✅ |
| MACD line + signal | ✅ |
| RSI 14 | ✅ |
| ATR 14 | ✅ |
| Supertrend (7,3) + (10,3) | ✅ |
| Bollinger upper + lower (20-period) | ✅ |
| Volume SMA 20 | ✅ |
| Stochastic %K + %D | ❌ |
| CCI 20 | ❌ |
| ADX 14 | ❌ |
| +DI + -DI | ❌ |
| OBV | ❌ |
| VWAP | ❌ |

**7 indicators missing** out of 24+2 = 26 design slots. Per Phase 0 decision #5 (locked): **YES, extend `indicator_calculator.py`** to add all 7. Three requirements per the user:

1. **Unit tests per indicator** with input/output pairs from a known reference. Approach:
   - Use **`pandas-ta`** as the reference library (already a likely dependency or easily added). For each new indicator, generate a 100-bar synthetic OHLCV series, run both `pandas-ta` and our implementation, assert values match to 4 decimal places.
   - Cite the `pandas-ta` source URL in each test file.
   - Alternative reference for ADX/+DI/-DI: Wilder's original arithmetic example in his 1978 book — slower to compute but exactly canonical.

2. **Cross-verify against TradingView** for at least one real ticker (RELIANCE or ITC) per indicator. Approach:
   - Take a TradingView screenshot of each indicator's current value on the daily timeframe for RELIANCE.
   - Compute our value via the new function against the same date's data.
   - Compare to rounding precision (typically 2 decimals for TradingView's displayed values).
   - File `tests/python/test_indicator_calculator_extensions.py` with the assertions.
   - If values differ by more than rounding: investigate (windowing, smoothing variant, exponential-vs-Wilder for ADX, etc.) before declaring done.

3. **Prior-bar-history problem** — addressed in §6 below.

---

## 6. Prior-bar-history proposal (MACD cross + OBV direction)

Rules 12 (MACD cross-up/cross-down detection) and 24 (OBV direction) need the **previous bar's** value of the same indicator, not just the current snapshot. The current `/api/technical-indicators/{ticker}` endpoint returns only a single snapshot per indicator. Three implementation paths considered:

### Option (a) — Extend snapshot endpoint to include prior bar values

**Approach:** Add a `_prior` field on the response for each indicator that needs history. Specifically:

```jsonc
{
  // existing fields
  "macd_line": 18.42,
  "macd_signal": 12.10,
  "obv": 1420000000,

  // NEW
  "macd_line_prior": 8.50,
  "macd_signal_prior": 10.00,
  "obv_prior": 1400000000
}
```

Compute as: `series.iloc[-2]` for each indicator's pandas Series at the same point we currently read `series.iloc[-1]`. Same data window already loaded; zero additional DB hits.

**Effort:** ~10 LOC change in `indicator_calculator.calculate_all_indicators()`. Add 3 fields to the response dict. Frontend hook `useTechnicalIndicators` type extended with optional `_prior` fields.

**Bandwidth cost:** +3 numbers per API call (~30 bytes). Negligible.

**Frontend ergonomics:** classifier receives both current + prior as plain args; no state management; rule body is straightforward.

### Option (b) — Server-side rolling state via cache

**Approach:** Server computes the cross/direction signal pre-classified ("Cross up", "Rising", etc.) and returns it as a string field. Uses a Redis cache to retain prior values between requests.

**Pros:** Frontend gets fully-classified signals; no classifier code on the frontend for these specific rules.

**Cons (significant):**
- Server now owns half the classifier logic — split-brain between Python and TypeScript classifiers
- Cache invalidation: which key? Per-ticker? Per-timeframe? On EOD reset?
- Race conditions: two concurrent requests racing to update the cache
- Less testable (server now has state); harder to unit-test cross-detection scenarios
- Adds Redis dependency to a code path that doesn't otherwise need it

### Option (c) — Larger window client-side

**Approach:** Frontend fetches a longer time series (e.g. 50 bars) and computes indicators + cross detection client-side.

**Pros:** Maximum flexibility; backend stays simple.

**Cons (significant):**
- Duplicates server-side compute on every client (RSI, MACD, etc. recomputed in JS)
- Bundle size: a TA library (`indicatorts`, `pandas-ta-js`, or hand-rolled) adds 30–100 KB
- Bandwidth: 50 bars × OHLCV = ~50× the current payload
- Two implementations of every indicator → drift risk between Python and JS
- The whole point of `/api/technical-indicators/{ticker}` is server-side compute; option (c) negates it

### Recommendation: **(a) Extend snapshot endpoint with `_prior` fields**

**Reasoning:**
- Minimal data contract change: 3 new optional numeric fields
- Backend code change is trivial (`iloc[-2]` instead of `iloc[-1]`, on already-loaded data)
- Frontend classifier stays pure and testable
- No cache layer, no race conditions
- Symmetric with how classifiers already work: current + prior → classification
- Cross-detection becomes deterministic and reproducible from the API response alone

**Decision required before Phase D:** confirm (a), or override with (b)/(c).

### Forward extension (Rule 12 advanced cases)

If we later want cross detection over **multiple bars** (e.g. "Cross up within last 3 bars"), option (a) extends cleanly to a small array:

```jsonc
"macd_line_history": [8.50, 10.20, 15.40, 18.42]  // last 4 bars, oldest first
```

Out of scope for Phase D — current rules only need the previous bar.

---

## Phase 0 close-out

| Item | Status (2026-05-18) |
|---|---|
| Beta verification | ✅ Verified ABSENT in `stock_fundamentals`. **User-locked decision: option (b) — drop Beta cell from hero stat strip.** Hero stat-strip restructure proposal lands in Phase B. |
| Sankey placement + interaction | ✅ **User-locked: inline expand inside P&L section** via `View Revenue Flow →` toggle. NOT modal/route. Lazy-mounted on first toggle. |
| Mobile traffic | ⚠ Insufficient data (14 `page_views` rows). Phase F defaults proposed (`lg:` 1024px for 2-col, drawer below). No blocker. |
| CorporateActionsTimeline placement | ✅ **User-approved: paired with NarrativesPanel in 1fr 1fr grid as Section 13.** Single CMOTS gate hides both. |
| NarrativesPanel placement | ✅ Same as above. |
| Classifier ruleset (§5.1) | ✅ Revised with sources, edge cases, 4 test cases per rule (3 + null). 26 rules total. **Awaiting user row-by-row review before Phase D.** |
| Indicator calculator extension | ✅ **User-locked: extend `indicator_calculator.py` for all 7 missing indicators** (Stochastic %K/%D, CCI 20, ADX 14, +DI, -DI, OBV, VWAP). Tests per `pandas-ta` reference + TradingView spot-check per indicator. |
| Prior-bar-history (§6) | ✅ **Recommended option (a): extend snapshot endpoint with `_prior` fields** for MACD line, MACD signal, OBV. **Awaiting user confirmation.** |

**Pending your review:**
1. ✅ **Classifier ruleset (§5.1)** — row-by-row review of 26 rules: thresholds, sources, edge cases, test cases. Edit thresholds in this file. Highest-stakes review.
2. ✅ **Prior-bar-history proposal (§6)** — confirm option (a), or override with (b)/(c).

Once those two land + DESIGN_STOCK_DETAIL_SPEC.md is updated with locked decisions (in flight separately), **Phase A is greenlit.**

No code changes will happen until then. Standing by.
