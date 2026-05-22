# EdgeFlow / EquityPro — Target Database Schema

> Narrative design. The DDL is in [db-target-schema.sql](db-target-schema.sql). The migration order is in [db-migration-plan.md](db-migration-plan.md). The audit context is in [db-audit.md](db-audit.md).
>
> **CMOTS data dictionary is not yet available.** Every column where the CMOTS field name is uncertain is marked `[CMOTS?]` here and in the SQL. Confirm before implementation.
>
> **Growth target**: 24 → 2,500 active retail users in 18 months. Bursty market open/close. Hosting mid-migration to two-box E2E with PgBouncer (transaction pool, max 500 client / 50 default pool).

---

## Reading order

1. **[Identifier strategy](#1-identifier-strategy)** — read this first; it changes how every other table is keyed.
2. **[Master / reference layer](#2-master--reference-layer)** — companies, scrips, instruments, indices, MF schemes, news/announcements masters.
3. **[Time-series layer](#3-time-series-layer)** — bhavcopy, FNO, indices, MF NAV, LTP.
4. **[Fundamentals layer](#4-fundamentals-layer)** — financial statements, ratios, shareholding, analyst data, derived caches.
5. **[Connection management](#5-connection-management--pool-routing)** — sync vs async, pool sizes, PgBouncer gotchas.
6. **[Compression and retention](#6-compression-and-retention)** — TimescaleDB policies per hypertable.
7. **[Caching boundaries](#7-caching-boundaries)** — what stays in Redis vs Postgres.
8. **[Open questions](#8-open-questions)** — answers needed from architect / CMOTS / product.

---

## 1. Identifier strategy

**The single most important decision in this redesign.** The current `tickers` table conflates "company" and "listing" — fundamentals (P&L, BS, CF) are properties of a *company*, but `stock_fundamentals.ticker_id` keys at the *listing* level. Same for shareholding, corporate filings, analyst ratings. Net effect: any company with both NSE and BSE listings has duplicated rows or a chosen primary that the reader cannot inspect.

The vendor switch is the one chance to fix this cleanly. Three levels:

```
companies (co_code)            CMOTS company master — one legal entity
   │
   │ 1:N
   │
   ▼
scrips (scrip_id)              one row per (exchange, series) listing
   │                           e.g. RELIANCE-NSE-EQ, RELIANCE-BSE-A,
   │                           RELIANCE_DVR-NSE-EQ
   │ 1:1 for cash; 1:N for derivatives
   │
   ▼
instruments (instrument_id)    universal asset id used by every time-series
                               table. asset_class = EQUITY|INDEX|FUTURE|
                               OPTION|MF|ETF|BOND
```

- **Fundamentals, shareholding, analyst data, corporate filings, news tags** FK to `companies(co_code)`.
- **Bhavcopy, delivery, corporate actions, segment history** FK to `scrips(scrip_id)`.
- **OHLC, LTP, indicators, derived caches** FK to `instruments(instrument_id)`.

A junction table `instrument_identifiers` carries every vendor id (CMOTS `co_code`, BSE code, NSE symbol, ISIN, Fyers symbol/token, Upstox token, AMFI scheme code) with SCD-2 history (`valid_from`/`valid_to`). Partial unique on `(vendor, vendor_id) WHERE valid_to IS NULL` is the single hottest LTP-stream lookup.

A flat view `instrument_xref` denormalises the three-level join for routine queries — readers never have to write the joins themselves.

### Migration from `tickers.id`

We do **not** drop or rename `tickers`. Instead:

1. New tables go up alongside.
2. `instruments.legacy_ticker_id INTEGER UNIQUE REFERENCES tickers(id)` is populated 1:1 during backfill.
3. `tickers.instrument_id BIGINT UNIQUE REFERENCES instruments(instrument_id)` is added and backfilled.
4. New code reads `instruments` / `scrips` / `companies`. Old code keeps reading `tickers`.
5. Phase 6 (Day +90+, after one quarter of green parallel run) converts `tickers` to a **view** over the new layer. All FKs from existing tables (ohlc_1hour, ltp_live, stock_fundamentals, stock_analysis, stock_segments, market_movers_live, the 3 continuous aggregates) keep resolving.

---

## 2. Master / reference layer

### 2.1 `companies`

CMOTS-shaped company master. PK `co_code` (CMOTS internal company id). One row per legal entity.

Columns:
- `co_code INTEGER PRIMARY KEY` — CMOTS id. `[CMOTS?]` Confirm INTEGER vs VARCHAR.
- `company_name VARCHAR(255) NOT NULL` — `[CMOTS?]` likely `LongName`.
- `short_name VARCHAR(100)` — `[CMOTS?]`.
- `industry VARCHAR(100)` — denormalised label (saves a join on every list).
- `industry_code INTEGER` — `[CMOTS?]` future FK to a CMOTS industry table.
- `sector VARCHAR(100)`.
- `mcap_class VARCHAR(20)` — Large/Mid/Small/Micro.
- `isin_primary CHAR(12)` — canonical ISIN; multi-class ISINs go on `scrips`.
- `incorporation_date DATE` — `[CMOTS?]`.
- `country CHAR(2) NOT NULL DEFAULT 'IN'` — future-proofing for ADRs.
- `bse_listed BOOLEAN`, `nse_listed BOOLEAN` — convenience rollup.
- `status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'` — `ACTIVE | MERGED | DELISTED | SUSPENDED | WOUND_UP`.
- `merged_into_co_code INTEGER REFERENCES companies(co_code)` — merger lineage.
- `created_at`, `updated_at`, `cmots_last_seen_at TIMESTAMPTZ`.

Indexes:
- `(isin_primary)` — search-by-ISIN.
- `(industry)` — sector / industry screens.
- `(co_code) WHERE status = 'ACTIVE'` partial — every UI list.
- GIN trigram on `company_name` — search bar.

### 2.2 `scrips`

One row per listing. PK is a surrogate `scrip_id`; the natural key `(exchange, bse_code|nse_symbol, series)` is unique but used only for upserts.

Columns:
- `scrip_id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY` — surrogate, never re-assigned.
- `co_code INTEGER NOT NULL REFERENCES companies(co_code) ON DELETE RESTRICT`.
- `exchange VARCHAR(8) NOT NULL` — `'NSE'` or `'BSE'`.
- `bse_code VARCHAR(10)`, `nse_symbol VARCHAR(20)` — at least one non-NULL per exchange.
- `series VARCHAR(4) NOT NULL` — NSE EQ/BE/SM/ST/IT/IV/XX; BSE A/B/T/XT/X/Z/P/E/W/Y/XX.
- `isin CHAR(12) NOT NULL` — listing-level (DVR has different ISIN).
- `face_value NUMERIC(10,2)`, `lot_size INTEGER NOT NULL DEFAULT 1`, `tick_size NUMERIC(8,4) NOT NULL DEFAULT 0.05`.
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`.
- `listing_date DATE`, `delisting_date DATE`, `suspended_from DATE`, `suspended_reason VARCHAR(50)`.
- `created_at`, `updated_at`, `cmots_last_seen_at TIMESTAMPTZ`.

Constraints:
- `UNIQUE (exchange, bse_code) WHERE bse_code IS NOT NULL` partial.
- `UNIQUE (exchange, nse_symbol, series) WHERE nse_symbol IS NOT NULL` — `RELIANCE-EQ` and `RELIANCE-BE` can coexist.
- `UNIQUE (isin, exchange)` — same ISIN on NSE+BSE.
- `CHECK ((exchange='NSE' AND nse_symbol IS NOT NULL) OR (exchange='BSE' AND bse_code IS NOT NULL))`.

Indexes:
- `(co_code)`, `(isin)`, `(scrip_id) WHERE is_active = TRUE` partial.
- `(nse_symbol) WHERE nse_symbol IS NOT NULL`, `(bse_code) WHERE bse_code IS NOT NULL`.
- `(series)` — series-filtered screens.

### 2.3 `instruments`

Universal asset table. Single fat table + JSONB extensions. **Subtype tables rejected** — screener cannot afford an extra join per row at 2,500 users.

Columns:
- `instrument_id BIGINT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY`.
- `asset_class VARCHAR(10) NOT NULL` — `EQUITY | INDEX | FUTURE | OPTION | MF | ETF | BOND`.
- `scrip_id INTEGER REFERENCES scrips(scrip_id)` — populated for `EQUITY | ETF | BOND`.
- `index_id INTEGER REFERENCES indices(index_id)` — populated for `INDEX`.
- `mf_scheme_id INTEGER REFERENCES mf_schemes(mf_scheme_id)` — populated for `MF`.
- `underlying_instrument_id BIGINT REFERENCES instruments(instrument_id)` — self-FK for FNO contracts.
- `display_symbol VARCHAR(80) NOT NULL` — `RELIANCE`, `NIFTY 50`, `RELIANCE 30JAN26 1500 CE`.
- `display_long_name VARCHAR(255)`.
- `currency CHAR(3) NOT NULL DEFAULT 'INR'`.
- `is_tradeable BOOLEAN NOT NULL DEFAULT TRUE`.
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`.
- `derivative_meta JSONB` — `{ expiry, strike, option_type, contract_size }` for FUTURE/OPTION.
- `bond_meta JSONB`, `etf_meta JSONB`.
- `legacy_ticker_id INTEGER UNIQUE REFERENCES tickers(id)` — bridge during transition.
- `created_at`, `updated_at TIMESTAMPTZ`.

Constraints: CHECK exactly one of `(scrip_id, index_id, mf_scheme_id)` is non-NULL according to `asset_class`.

Indexes:
- `(asset_class) WHERE is_active = TRUE` partial.
- `(scrip_id) WHERE scrip_id IS NOT NULL`.
- `(underlying_instrument_id) WHERE underlying_instrument_id IS NOT NULL` — option chain.
- `((derivative_meta->>'expiry')) WHERE asset_class IN ('FUTURE','OPTION')` — expiry-based queries.
- `(display_symbol)`.

### 2.4 `instrument_identifiers`

Junction with SCD-2 vendor-id history. PK `(instrument_id, vendor, valid_from)`.

Columns:
- `instrument_id BIGINT NOT NULL REFERENCES instruments(instrument_id) ON DELETE CASCADE`.
- `vendor VARCHAR(20) NOT NULL` — `CMOTS_CO_CODE`, `BSE_CODE`, `NSE_SYMBOL`, `ISIN`, `FYERS_SYMBOL`, `FYERS_FY_TOKEN`, `FYERS_EX_TOKEN`, `UPSTOX_SYMBOL`, `UPSTOX_TOKEN`, `ANGEL_TOKEN`, `AMFI_CODE`, `KITE_TOKEN`.
- `vendor_id VARCHAR(80) NOT NULL`.
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`.
- `valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `valid_to TIMESTAMPTZ`.
- `meta JSONB`.

Indexes (the critical ones):
- `UNIQUE (vendor, vendor_id) WHERE valid_to IS NULL` — single b-tree probe for "which instrument is Fyers ex-token X?". Hottest read in the system.
- `(instrument_id, vendor) WHERE valid_to IS NULL` — reverse lookup.
- `(vendor, vendor_id, valid_from DESC)` — token-rotation audit trail.

### 2.5 `instrument_xref` (view)

```sql
CREATE VIEW instrument_xref AS
SELECT i.instrument_id, i.asset_class, i.display_symbol,
       s.co_code, s.bse_code, s.nse_symbol, s.isin,
       max(CASE WHEN ii.vendor='FYERS_SYMBOL'   AND ii.valid_to IS NULL THEN ii.vendor_id END) AS fyers_symbol,
       max(CASE WHEN ii.vendor='FYERS_FY_TOKEN' AND ii.valid_to IS NULL THEN ii.vendor_id END) AS fy_token,
       max(CASE WHEN ii.vendor='UPSTOX_TOKEN'   AND ii.valid_to IS NULL THEN ii.vendor_id END) AS upstox_token
FROM instruments i
LEFT JOIN scrips s ON i.scrip_id = s.scrip_id
LEFT JOIN instrument_identifiers ii ON ii.instrument_id = i.instrument_id
GROUP BY i.instrument_id, i.asset_class, i.display_symbol, s.co_code, s.bse_code, s.nse_symbol, s.isin;
```

Replaces the existing `tickers_with_segments` view ([schema_plan_fyers.md](../../schema_plan_fyers.md) line 147) for new code.

### 2.6 `scrip_segments` + `scrip_segment_change_log`

Direct port of today's `stock_segments` (SCD-2) and `segment_change_log`. FK swapped to `scrip_id`.

Decision: **port keyed on scrip_id** (do not fold into `scrips`, do not co-locate with company-level segment moves). Cardinality of changes is low but every read would need `valid_to IS NULL` filter — separate table is cleaner.

### 2.7 `corporate_actions`

PK `(scrip_id, action_type, ex_date, sequence_no, source)`. Action_type is a Postgres ENUM:

```
DIVIDEND, BONUS, SPLIT, RIGHTS, BUYBACK,
MERGER, DEMERGER, NAME_CHANGE, ISIN_CHANGE, FACE_VALUE_CHANGE,
LISTING, DELISTING, SUSPENSION, REVOCATION,
CONSOLIDATION, AMALGAMATION
```

Columns: ex_date, record_date, payment_date, effective_date, announcement_date; ratio_numerator/denominator (INT for exact math); amount_per_share; dividend_type (INTERIM/FINAL/SPECIAL); fiscal_year; old_value/new_value (for NAME/ISIN/FV changes); purpose_text; source (NSE/BSE/CMOTS); source_id; is_active; superseded_by_id (self-FK for NSE corrections).

Indexes:
- `(scrip_id, ex_date DESC) WHERE is_active = TRUE` partial — per-stock corporate-actions panel.
- `(ex_date DESC, action_type) WHERE is_active = TRUE` partial — calendar view.
- `(co_code, ex_date DESC)` — drill-down by company (denormalised co_code on the row).
- `(announcement_date DESC) WHERE announcement_date IS NOT NULL`.

### 2.8 `corporate_action_adjustments` (pre-computed factors)

PK `(scrip_id, effective_date, adjustment_kind)`. Cumulative price/volume factors per scrip per date. `adjustment_kind ∈ SPLIT | BONUS | RIGHTS | DIVIDEND_TR`.

Used at chart query time:

```sql
SELECT ts, open*f.price_factor AS open_adj, ...
FROM ohlc_1hour o
LEFT JOIN LATERAL (
  SELECT price_factor FROM corporate_action_adjustments a
  WHERE a.scrip_id = (...) AND a.effective_date <= o.ts::date
        AND a.adjustment_kind IN ('SPLIT','BONUS','RIGHTS')
  ORDER BY a.effective_date DESC LIMIT 1
) f ON TRUE WHERE ...;
```

Recomputed when corporate_actions change (end-of-job recompute pass — simpler than triggers under PgBouncer transaction pool). ~300 K rows lifetime.

### 2.9 `indices` + `index_constituents`

`indices` master: `index_code` (CMOTS), `index_symbol`, `index_name`, `index_family` (NIFTY/SENSEX/sectoral), `index_kind` (BROAD/SECTORAL/THEMATIC/STRATEGY/VOLATILITY/BOND), `base_value`, `base_date`, `is_tradeable`.

`index_constituents` SCD-2 with `valid_from/valid_to`, weight_pct. Constituents change quarterly (NIFTY rebalances March/September).

Index OHLC has different invariants from equity OHLC (volume can be NULL or derived; first-bar `open` can be NULL) — see [time-series layer](#3-time-series-layer).

### 2.10 MF master

`mf_amcs` (small lookup: `amfi_amc_code`, `amc_name`, `amc_short_name`).

`mf_schemes`: `scheme_code` (AMFI integer), `scheme_name`, `amc_id`, `category` (SEBI: EQUITY/DEBT/HYBRID/SOLUTION/OTHER), `sub_category` (LARGE_CAP/MID_CAP/MULTI_CAP/ELSS/...), `risk_grade`, `plan_type` (DIRECT/REGULAR), `option_type` (GROWTH/IDCW_REINVEST/IDCW_PAYOUT), `isin_growth`, `isin_idcw`, `nav_publish_frequency` (DAILY/WEEKLY/MONTHLY), `inception_date`.

### 2.11 `news_articles`, `news_article_tags`, `corporate_announcements`

`news_articles`: PK `id BIGSERIAL`. `url_hash BYTEA NOT NULL UNIQUE` (SHA-256 of normalised URL — 32 bytes vs 64-char hex). Plus `source` (CMOTS_NEWS/GOOGLE_NEWS/ZERODHA_PULSE/BSE_FILING/NSE_FILING), `source_article_id`, `headline`, `summary`, `body`, `language`, `category`, `importance`, `published_at`, `fetched_at`.

Constraints: `UNIQUE (source, source_article_id) WHERE source_article_id IS NOT NULL` + `UNIQUE (url_hash)`.

Same news event from N sources = N rows. Cross-source merging is a search/UX concern, not a schema concern.

`news_article_tags`: junction table, kind ∈ INSTRUMENT/COMPANY/SECTOR/INDEX. CHECK enforces exactly one of `instrument_id/co_code/index_id/sector` is non-NULL per kind. `tagged_by` ∈ auto/manual/source. Partial indexes per kind.

`corporate_announcements`: BSE/NSE filings (distinct from news). PK BIGSERIAL. Keyed `(scrip_id, filed_at, announcement_type)` plus dedupe on `(source, source_id)`. Indexes: `(scrip_id, filed_at DESC)`, `(filed_at DESC)`, `(announcement_type, filed_at DESC)`, `(co_code, filed_at DESC)`.

---

## 3. Time-series layer

### 3.1 `ltp_snapshot` — the structural fix for the 28 M-row bug

**PK = `(scrip_id)`**. Single row per scrip, period.

Writes: `INSERT INTO ltp_snapshot (...) VALUES (...) ON CONFLICT (scrip_id) DO UPDATE SET ltp = EXCLUDED.ltp, ..., updated_at = NOW();`

Bounded at ~5,000 rows lifetime regardless of cleanup script. No retention policy needed. No tick history kept here.

Columns: `scrip_id`, `ltp`, `prev_close`, `open`, `high`, `low`, `close`, `percent_change`, `volume_traded`, `total_buy_qty`, `total_sell_qty`, `lower_circuit`, `upper_circuit`, `week_52_high`, `week_52_low` (back-filled from bhavcopy_eod daily, not per tick), `last_trade_ts`, `updated_at`.

Indexes:
- PK only for point-lookups.
- `(percent_change DESC NULLS LAST)` — `/api/most-active` gainers/losers, fits in memory at 5K rows.
- `(volume_traded DESC NULLS LAST)` — same shape, for volume sort.

Merges `ltp_live_realtime` (52W columns nullable, populated when feed has them).

`ltp_history` is **not** built. Postgres is not a tick database. If ever needed, it goes to Redis Streams → daily Parquet.

### 3.2 `bhavcopy_eod` — TimescaleDB hypertable

PK `(scrip_id, exchange, trade_date)`. One row per (scrip, exchange, day). Columns: prev_close, open, high, low, close, last, vwap, volume_traded, turnover, total_trades, delivery_qty, delivery_pct, week_52_high, week_52_low, loaded_at.

Hypertable parameters:
- `chunk_time_interval = INTERVAL '90 days'`.
- `compress_segmentby = 'scrip_id'`, `compress_orderby = 'trade_date DESC'`.
- `compress_after = INTERVAL '90 days'`.
- `retention = INTERVAL '10 years'` (defensive; cheap to keep).

**Single table, NSE+BSE share** — splitting is rejected because BSE-only smallcaps and dual-listed primary-exchange swaps make a unified table cleaner.

Indexes:
- PK covers per-stock latest-N reads.
- `(trade_date DESC, exchange)` — universe-scan for "today's full bhavcopy".
- BRIN on `trade_date` for chunks > 1 year (much smaller than btree, scans well for batches).

Volume: ~5K scrips × 365 days × 2 exchanges = **3.6 M/year**. 18 M / 5 years.

### 3.3 F&O master + EOD

`fno_contracts` (master): id BIGSERIAL, instrument_token (exchange-issued, unique within exchange), underlying_scrip_id or underlying_index_id, exchange, instrument_type (CE/PE/FUT), expiry_date, strike (NULL for futures), lot_size, tick_size, is_active, listed_on, last_trading_day. Flat table, no partitioning. ~780K rows over 5 years.

`fno_eod` hypertable: PK `(contract_id, trade_date)`. Columns: open, high, low, close, prev_close, settle, volume, turnover, open_interest, change_in_oi, iv (when CMOTS provides). 30-day chunks, segment_by `contract_id`, compress_after 14 days, retention 5 years. ~15M rows total.

### 3.4 F&O 1-min — OFF Postgres

**Hard recommendation. Math: 12K active contracts × 375 mins × 250 days = 1.125 B rows/year.** Even at 10× compression that's 100 GB/year and starves shared_buffers.

Path:
- CMOTS feed → Redis Streams (already happening for options today, [celery_config.py:138-143](../celery_config.py#L138-L143)).
- Daily Celery task at 16:30 IST flushes the day's stream to Parquet on Cloudflare R2, partitioned by `expiry_year=YYYY/expiry_month=MM/date=YYYY-MM-DD/`.
- DuckDB inside the FastAPI process queries Parquet via httpfs.

Why not ClickHouse: another moving piece on the App box (8–16 GB RAM). R2 + DuckDB is zero new infrastructure (R2 already in the backup path per [hosting_plan.md:101-105](../hosting_plan.md#L101-L105)).

If product later demands intraday F&O analytics in SQL, promote a derived **5-min** F&O hypertable to Postgres (~225 M/year — workable). Don't put 1-min in Postgres ever.

### 3.5 Index OHLC

`index_eod`: PK `(index_id, trade_date)`. No volume column (or nullable). Flat table, ~91K rows/year — no hypertable needed.

`index_ohlc_1min`: PK `(index_id, ts)`. Hypertable, 7-day chunks, compress_after 7 days, retention 2 years. ~4.7 M/year.

### 3.6 MF NAV

`mf_nav` hypertable: PK `(scheme_code, nav_date)`. Columns: nav, repurchase_nav, sale_nav. Yearly chunks, compress_after 1 year, indefinite retention.

Volume: ~12K schemes × 250 days × 25 years ≈ 75 M rows max. With compression: ~25 MB/year.

### 3.7 Continuous aggregate pipeline (CMOTS-fed)

```
CMOTS 1-min ──→ ohlc_1min_intraday (hypertable, 1-day retention)
                  │
                  ▼ (cont. agg, refresh every 5 min)
                ohlc_5min (hypertable, 7-day retention)
                  │
                  ▼ (cont. agg, refresh every 15 min)
                ohlc_15min (hypertable, 30-day retention)
                  │
                  ▼ (cont. agg, refresh hourly)
                ohlc_1hour (existing — 5-year retention)
                  │
                  ▼ (cont. agg, refresh daily)
                ohlc_daily (existing — indefinite)
                  │
                  ▼
                ohlc_weekly, ohlc_monthly (existing)
```

CMOTS supplies 1-min; everything below derives via TimescaleDB continuous aggregates with incremental refresh.

### 3.8 Sector aggregates + market movers

`market_movers_live` — keep as-is for frontend compatibility. Refresh logic simplifies under `ltp_snapshot` (5K-row scan).

`sector_eod_aggregates` (new): PK `(sector, trade_date)`. Columns: avg_return_pct, median_return_pct, top_quartile_return_pct, bottom_quartile_return_pct, mcap_weighted_return_pct, breadth_advance, breadth_decline, total_scrips. Refreshed nightly via Celery (NOT continuous aggregate — needs JOIN to `companies.sector` which CAggs don't support). 5-year retention.

### 3.9 Screener result cache — Redis only

Combinatorial explosion. Cache by `hash(expression_canonical_form, universe_hash, period)` in Redis with 60 s TTL during market hours, 30 min outside. `request_coalescing.py` ([../request_coalescing.py:24-40](../request_coalescing.py#L24-L40)) ensures simultaneous requesters of the same screen run one DB query.

### 3.10 5-min OI snapshot persistence

The existing 5-min OI snapshot task ([celery_config.py:162-166](../celery_config.py#L162-L166)) currently rotates Redis `:current`/`:previous` only. Phase 2 adds a write-through to a new `oi_snapshot_5min` hypertable: ~2.5K contracts × 75 snapshots/day × 250 days = **47M/year**. Segment_by contract_id, compress_after 7 days. This is the only hot-cadence Postgres write justified by historical-OI-delta queries from the screener.

---

## 4. Fundamentals layer

### 4.1 `financial_statements` — long format (recommended hard)

PK `(co_code, statement_type, period_type, period_end, line_item_code, reporting_basis)`. Composite natural key, no surrogate id.

ENUMs:
- `statement_type ∈ INCOME | BALANCE_SHEET | CASH_FLOW | EQUITY_CHANGES`.
- `period_type ∈ Q1 | Q2 | Q3 | Q4 | H1 | H2 | ANNUAL | TTM`.
- `reporting_basis ∈ STANDALONE | CONSOLIDATED`.

Columns: `amount NUMERIC(20,4)` (nullable — CMOTS may send NULL for non-reported lines), `amount_currency CHAR(3) DEFAULT 'INR'`, `amount_unit ∈ CR | LAKH | ABSOLUTE`, `restated_flag`, `source` (CMOTS|JSONB_BACKFILL|YFIN_FALLBACK), `source_payload_id BIGINT`, `ingested_at`.

**Why long over wide** (explicit divergence from [schema_plan_financial_data.md:166-248](../../schema_plan_financial_data.md#L166-L248)):
1. CMOTS line-item set is unstable. New post-IndAS-116 line items would require ALTER TABLE across 5K companies × 10 years history.
2. Banks and NBFCs don't have "revenue" or "COGS" — wide schema either grows extra columns per banking line or splits into `_bank` variants. Long lets `line_item_code = 'INTEREST_INCOME'` simply not appear for non-banks.
3. The screener does NOT need wide rows in the source-of-truth table. It needs them in a pre-computed pivot — that's the materialised view in §4.3.
4. Restatements upsert cleanly with `restated_flag = TRUE` on the same PK.

Volume: ~50 line items × 4 quarters × 10 years × 2 bases × 5K companies ≈ **20 M rows**.

Indexes:
- PK is the per-line-item lookup.
- `(line_item_code, period_end DESC, co_code)` — cross-sectional screener.
- `(period_end DESC, statement_type) WHERE reporting_basis = 'CONSOLIDATED'` partial — ingest health + MV refresh.

### 4.2 `line_item_dictionary` (data, not code)

PK `code VARCHAR(64)`. Columns: statement_type, display_name, indian_synonym, us_gaap_synonym, parent_code (self-FK), sort_order, is_subtotal, is_calculated, formula, applies_to_sectors TEXT[], data_type.

**No FK from `financial_statements.line_item_code` to this table.** Loose coupling so a new CMOTS line lands the day it arrives, even if dictionary seed isn't run yet. Nightly health-check finds orphans.

### 4.3 `cmots_line_item_mapping`

PK `(cmots_field_name, cmots_feed, valid_from)`. Columns: internal_code (FK to dictionary), valid_to. Isolates ingestion from upstream renames — ETL joins by `(cmots_field_name, cmots_feed)` and writes `internal_code` to `financial_statements`.

### 4.4 `financial_summary_latest` (materialised view)

Pivot of ~25 most-used line items wide, one row per `(co_code, period_type, period_end, reporting_basis)`. Columns: revenue, operating_revenue, other_income, total_expenses, operating_profit, ebitda, ebit, depreciation, interest_expense, profit_before_tax, tax_expense, net_profit, eps_basic, eps_diluted, total_assets, total_equity, total_borrowings, current_assets, current_liabilities, cfo, cfi, cff, capex, free_cash_flow, n_line_items_present.

Refresh: `REFRESH MATERIALIZED VIEW CONCURRENTLY` after every ingest batch. ~400K rows. Sub-minute refresh.

Indexes:
- `UNIQUE (co_code, period_type, period_end DESC, reporting_basis)` — required for CONCURRENT refresh.
- `(period_end DESC, reporting_basis) WHERE period_type = 'ANNUAL'` partial.
- `(period_end DESC, reporting_basis) WHERE period_type IN ('Q1','Q2','Q3','Q4')` partial.

The screener and stock detail read this MV. Only line-item drill-down (Sankey) hits the long table.

### 4.5 `key_ratios` + `key_ratios_latest_wide` MV

`key_ratios` long format. PK `(co_code, period_type, period_end, ratio_code, reporting_basis, source)` — `source ∈ CMOTS | INTERNAL_CALC` is part of the key so both rows coexist.

Internal nightly job recomputes from `financial_statements` and writes parallel `INTERNAL_CALC` rows. Reconciliation report flags any `|CMOTS - INTERNAL| / |CMOTS| > 5%`.

`key_ratios_latest_wide` MV pivots PE, PB, PS, PEG, EV_EBITDA, EV_SALES, ROE, ROCE, ROA, NPM, OPM, EBITDA_MARGIN, debt_to_equity, current_ratio, quick_ratio, interest_coverage, asset_turnover, inventory_turnover, receivable_days, payable_days, dividend_yield, payout_ratio, revenue_growth_3y, profit_growth_3y, eps_growth_3y. Partial indexes on `pe`, `pb`, `roe` for screener filters (mirrors today's partial indexes on `stock_fundamentals`).

### 4.6 `shareholding_pattern` + `shareholding_individual`

**`shareholding_pattern`** PK `(co_code, period_end, holder_category)`. holder_category ∈ PROMOTER | DOMESTIC_INSTITUTION | FOREIGN_INSTITUTION | MUTUAL_FUND | RETAIL | GOVERNMENT | OTHERS (MUTUAL_FUND is a subset of DOMESTIC_INSTITUTION; both rows coexist).

Columns: holding_pct, holding_qty, pledged_qty (PROMOTER only), pledged_pct, encumbered_pct, source.

Partial indexes:
- `(co_code, period_end DESC) WHERE holder_category = 'PROMOTER' AND pledged_pct > 0` — promoter-pledge risk screen.
- `(period_end DESC, holder_category)` — "FII stake increased last quarter" rankings.

**`shareholding_individual`** PK `(co_code, period_end, holder_type, holder_name_normalized)`. holder_type ∈ PROMOTER_INDIVIDUAL | PROMOTER_GROUP_ENTITY | FII_FUND | DII_FUND | MF_SCHEME | INSURANCE | RETAIL_GT_1PCT.

`holder_name_normalized` (lowercased, punctuation-stripped) avoids "ICICI Prudential AMC Ltd" vs "ICICI Prudential AMC LTD" duplicates.

Indexes: `(holder_name_normalized, period_end DESC)` for "all Vanguard holdings"; `(holder_type, period_end DESC, holding_pct DESC) WHERE rank_in_category <= 10` for top-10 leaderboards.

`shareholding_changes_qoq` — plain view (NOT MV) using LATERAL join.

The current [server/shareholding_scraper.py](../server/shareholding_scraper.py) (Redis-only, 6 h TTL) becomes a fallback for companies CMOTS doesn't cover.

### 4.7 Bulk / block / delivery

`bulk_deals` and `block_deals` — same shape, separate tables (different regulatory definitions, different consumers). Columns: deal_date, exchange, co_code, ticker_id, scrip_symbol (raw), client_name, client_name_normalized, deal_type (BUY/SELL), quantity, avg_price, deal_value_cr (GENERATED), remarks, source, ingested_at. PK BIGSERIAL.

Soft-dedupe `UNIQUE (deal_date, exchange, scrip_symbol, client_name, deal_type, quantity, avg_price)`.

Indexes: `(co_code, deal_date DESC) WHERE co_code IS NOT NULL` partial; `(deal_date DESC, exchange)`; `(client_name_normalized, deal_date DESC)`; `(deal_value_cr DESC) WHERE deal_value_cr > 50` partial.

`delivery_data` — separate from bhavcopy_eod (lands T+1, missing-by-row-absence beats nullable columns). PK `(ticker_id, exchange, trade_date)`. Columns: traded_qty, delivery_qty, delivery_pct, turnover_cr.

### 4.8 Analyst data

`analyst_recommendations` — broker ratings. PK `(co_code, broker_id, recommendation_date, COALESCE(analyst_name, ''))`. Columns: rating ENUM (STRONG_BUY/BUY/HOLD/REDUCE/SELL/STRONG_SELL), target_price, time_horizon_months, report_url, report_title, notes, source ENUM (BLOOMBERG/REUTERS/CMOTS_BROKERAGE/INTERNAL_PDF).

Existing `stock_analysis` (manual notes) **renamed to `internal_analyst_notes`** — different beast.

`analyst_consensus_latest` MV refreshed nightly with 6-month rolling window. Columns: n_analysts, n_buy/hold/sell, avg_rating_numeric, avg_rating_label, target_price_mean/median/std/high/low, upside_pct_mean (vs latest LTP, joined at refresh).

`earnings_estimates` PK `(co_code, period_end, period_type, estimate_type, asof_date)`. Snapshot history matters — "show me how analyst EPS estimates for FY25 evolved over 12 months".

`eps_revisions` (small derived table) PK `(co_code, asof_date, period_end, period_type)`. Computed nightly from earnings_estimates history. Columns: n_up_30d/down_30d/up_90d/down_90d, mean_change_30d_pct, mean_change_90d_pct.

### 4.9 Quarterly announcements + post-event drift

`quarterly_announcements` — 1:1 onto `corporate_announcements` rows where category = 'QUARTERLY_RESULTS'. PK = `announcement_id` (FK). Adds: period_end, period_type, announced_at, result_type, revenue_actual, net_profit_actual, eps_actual, eps_estimate, surprise_pct, yoy_revenue_pct, yoy_profit_pct, sentiment_score (FinBERT on press release), press_release_url.

`announcement_performance` — post-event drift. PK = `announcement_id`. Columns: ret_t_plus_1/5/30, nifty_ret_t_plus_*, alpha_t_plus_* (GENERATED), volume_ratio_t_plus_1. Computed nightly from `ohlc_daily`.

### 4.10 Derived caches

`stock_scorecard` PK `(co_code, scorecard_date)`. The 7-dim scorecard pre-computed nightly (Performance/Valuation/Growth/Profitability/Entry-Point/Red-Flags/Buyback-Sentiment). Replaces today's compute-on-read in [server/stock_scorecard.py](../server/stock_scorecard.py). `inputs_hash CHAR(64)` for cache invalidation. Daily history kept.

`reverse_dcf_estimates` PK `(co_code, valuation_date, wacc, terminal_growth, forecast_years)`. Nightly default-assumption runs persist. User-supplied DCF snapshots compute live, not stored.

`technical_indicators_live` — keep as TABLE (correct as-of [migrations/001_convert_technical_indicators_live.sql](../migrations/001_convert_technical_indicators_live.sql)). Single-row updates as bars arrive; PK on `ticker_id`. No change.

### 4.11 Market-wide signals

`pcr_data` PK `(trade_date, symbol, expiry_date)`. Sentinel `expiry_date IS NULL` = aggregate across expiries.

`vix_signals` PK `(trade_date)`. Columns: vix_open/high/low/close, vix_change_pct, regime ENUM (LOW_VOL <13 / NORMAL 13-20 / HIGH_VOL 20-30 / CRISIS >30 — thresholds in a separate config table), percentile_1y. Regime computed nightly.

`fii_dii_flows` PK `(trade_date, segment, participant)`. segment ∈ CASH/INDEX_FUT/STOCK_FUT/INDEX_OPT/STOCK_OPT. participant ∈ FII/DII/PROP/CLIENT. Wider than the prior-art proposal — segment+participant as part of the key avoids 4× column explosion.

---

## 5. Connection management & pool routing

### 5.1 Sync vs async split

| Endpoint family | Driver | Justification |
|---|---|---|
| `/api/quote/{symbol}`, `/api/quotes`, `/api/most-active`, `/api/price-chart`, `/api/expert-screener` reads | **asyncpg** | Latency-sensitive, no transaction needed, hits PgBouncer transaction-pool sweet spot |
| Existing FinTerminal (RRG, batch quotes) | **asyncpg** (already in use) | [main.py:9707](../main.py#L9707), [main.py:10635](../main.py#L10635) |
| Celery tasks (`celery_tasks.py`) | **psycopg2** | Sync execution model, often need transactions for write batches |
| Migrations / admin tools | **psycopg2** | Full session control |
| Daily CMOTS load (Bhavcopy, fundamentals) | **psycopg2** | COPY → staging → upsert in a single transaction |

### 5.2 Pool sizes per FastAPI worker (with PgBouncer in front)

- psycopg2 ThreadedConnectionPool: `min=2, max=10` per worker (down from current `max=100/workers`).
- asyncpg pool: `min_size=5, max_size=20` per worker.
- At 4 Uvicorn workers: 4 × (10 + 20) = **120 connections** requested at peak.
- PgBouncer multiplexes onto 50-connection upstream pool. Postgres server-side ~30–50 active backends, well within max_connections=200.

### 5.3 PgBouncer transaction-pool gotchas

| Feature | Status under transaction pool | Mitigation |
|---|---|---|
| Session-level prepared statements | **BREAKS** in asyncpg | Pass `statement_cache_size=0` to `asyncpg.create_pool()`. This is non-optional. |
| `SET` (no LOCAL) | breaks | Use `SET LOCAL` or move to env config. Audit all `SET search_path`. |
| `LISTEN/NOTIFY` | incompatible | Route LISTEN connections through a separate PgBouncer entry with `pool_mode=session` on a different port. Or use Redis pub/sub instead. |
| Temp tables across statements | breaks | Wrap in single transaction; CMOTS loader does this. |
| Advisory locks across statements | breaks | We don't use them. |

---

## 6. Compression and retention

| Hypertable | chunk_time_interval | segmentby | orderby | compress_after | retention |
|---|---|---|---|---|---|
| `bhavcopy_eod` | 90 days | scrip_id | trade_date DESC | 90 days | 10 years |
| `fno_eod` | 30 days | contract_id | trade_date DESC | 14 days | 5 years |
| `oi_snapshot_5min` | 7 days | contract_id | snapshot_ts DESC | 7 days | 2 years |
| `index_ohlc_1min` | 7 days | index_id | ts DESC | 7 days | 2 years |
| `mf_nav` | 1 year | scheme_code | nav_date DESC | 1 year | indefinite |
| `ohlc_1min_intraday` (existing CMOTS-fed) | 1 day | ticker_id | ts DESC | 7 days | 30 days |
| `ohlc_5min` (new CAgg-backed) | 7 days | ticker_id | ts DESC | 14 days | 1 year |
| `ohlc_15min` (new CAgg-backed) | 30 days | ticker_id | ts DESC | 30 days | 3 years |
| `ohlc_1hour` (existing) | 30 days (default) | ticker_id | ts DESC | 7 days | 5 years |

**Phase 0 (pre-migration) verification**: run `SELECT * FROM hypertable_compression_stats('ohlc_1hour');`. If `before_compression_total_bytes` is NULL, manually `compress_chunk()` for chunks > 7 days old before any new load. The compression policy commands at [hosting_plan.md:122-134](../hosting_plan.md#L122-L134) are configured but not verified-applied.

---

## 7. Caching boundaries

| Always Redis (never DB on hot path) | Always Postgres (source of truth) |
|---|---|
| Live quote (10 s TTL market hours) | LTP snapshot (Postgres-backed, Redis read-through) |
| Live option chain + OI delta | corporate_actions, corporate_action_adjustments |
| Live screener task state + result list | financial_statements + MVs |
| Live sentiment task results | shareholding_pattern (with Redis read-through 6-h TTL) |
| Live fear-and-greed | bhavcopy_eod |
| Top-N gainers/losers (30 s TTL) | analyst_recommendations |
| Market mood / breadth | stock_scorecard (Redis read-through, DB-precomputed nightly) |

The pattern: **Redis-only for ephemeral live data. DB-as-source-of-truth + Redis read-through for everything that's queried historically.**

The 5-min OI snapshot is the exception — it persists from Redis to Postgres because users want historical OI delta over months for backtests.

---

## 8. Open questions

These do not block plan approval — they're called out here and as `[CMOTS?]` markers in the SQL.

### CMOTS-specific

1. **Data dictionary timing** — until it lands, ~15 columns are guesses (marked `[CMOTS?]`). Specifically:
   - `co_code` numeric vs alphanumeric — designed as INTEGER; would need VARCHAR if CMOTS ever returns non-numeric IDs.
   - CMOTS company-master column names (`LongName`/`CompanyName`/etc.).
   - CMOTS industry/sector hierarchy depth.
   - CMOTS news tags vs URL+timestamp.
   - CMOTS line-item names for P&L (EBITDA vs OPERATING_PROFIT_BEFORE_DEPN; INTEREST_INCOME for non-banks; EQUITY_CHANGES as 4th statement type).
   - CMOTS F&O contract ID stability across expiry rolls.
   - CMOTS intraday cadence (tick / 1-second / 1-minute / 5-minute).
   - CMOTS delivery quantity in EOD bhavcopy or separate feed.
   - MF NAV cadence on hybrid funds (EOD vs twice-daily).

2. **CMOTS-supplied vs computed ratios** — designed for both (CMOTS as authoritative, internal recompute as audit). Confirm acceptable.

### Product / domain

3. **Multi-class equity policy** (DVR + main equity) — designed as one company / two scrips / two instruments. Confirm.
4. **MF Direct vs Regular plans** — designed as separate `mf_schemes` rows (matches AMFI). Confirm.
5. **Index TR vs PR series** — designed as one `indices` row + a `total_return_index_id` self-FK column. Confirm.
6. **Corporate-actions source priority** when NSE/BSE disagree — designed CMOTS > NSE > BSE. Confirm.
7. **News retention** — designed indefinite with TimescaleDB conversion if volume crosses 5M rows. Acceptable?
8. **JSONB parallel-run window** — designed for 7 days. Extend to 14?
9. **F&O 1-min Parquet vs in-Postgres** — recommended Parquet. Confirm acceptable to product.
10. **Shareholding individual retention** — designed indefinite. Confirm.
11. **VIX regime thresholds** — used 13/20/30 as LOW/NORMAL/HIGH/CRISIS. Tune?
12. **PCR symbol cardinality** — design supports stock-level PCR for all 500 F&O stocks. Confirm scope.

### Operational

13. **Hosting-migration coordination** — Phase 1 should land **after** the two-box E2E setup stabilises, not during.
14. **`stock_segments` cutover** — port to `scrip_segments` in parallel for one quarter, or hard-cut on Phase 2 release?
15. **`ON DELETE CASCADE` on legacy `tickers(id)`** — kept for compatibility during transition; tightened to `RESTRICT` only on new tables. Audit existing soft-delete paths if tightening.
16. **`brokers` master ownership** — `analyst_recommendations.broker_id` FKs into a master broker list; design adds it under master/reference.

---

## 9. What's deliberately not in this design

- **Tick / Level 1 streaming.** Never in Postgres. NSE EQ alone produces 50–200 K updates/sec at peak. Same Redis Streams → daily Parquet path if/when needed.
- **Historical tick storage on `ltp_history`.** Not built. Use cases (intraday sparkline, percent-change-over-Xmin) are served by `ohlc_1min_intraday`.
- **Cross-source news merging at DB level.** The same news event from N sources = N rows. Merging is a search/UX concern.
- **Replication / read replica.** [hosting_plan.md](../hosting_plan.md) calls this Tier-C work; out of scope at 2,500-user target.
- **Cross-database transactions** (financial × auth). Not done today; out of CMOTS scope.

---

End of narrative design. Continue to [db-target-schema.sql](db-target-schema.sql) for the DDL, [db-er-diagram.mermaid](db-er-diagram.mermaid) for the visual, [db-migration-plan.md](db-migration-plan.md) for the rollout.
