# EdgeFlow / EquityPro — Database Migration Plan

> Companion to [db-audit.md](db-audit.md), [db-target-schema.md](db-target-schema.md), [db-target-schema.sql](db-target-schema.sql), [db-er-diagram.mermaid](db-er-diagram.mermaid).
>
> **Documentation only. No migrations applied by this plan.**
>
> Each phase is one or more numbered SQL migration files under [../migrations/](../migrations/) starting at `030_`. Current head is `029_coin_pricing.sql`.

---

## Principles

1. **Non-destructive by default.** Every legacy table stays alongside its replacement until at least one quarter of green parallel-run reports. Production reads from old + new during the cutover window.
2. **Reversible.** Each migration step has an explicit rollback. Forward and rollback scripts are checked in side-by-side.
3. **Phase boundaries are review gates.** The architect (user) reviews after each phase before the next starts.
4. **Idempotent migrations.** All `CREATE TABLE ... IF NOT EXISTS`, every `ALTER TABLE` that adds a column has its own check. Re-running a phase is a no-op.
5. **`pg_dump` before destructive change.** Phases 6 (drop legacy) and the JSONB-drop step in Phase 3 always `pg_dump` the affected table to R2 first; retain 90 days.
6. **Hosting migration aware.** Phase 1 lands **after** the two-box E2E setup is stable, not during. Phase 0 is the only thing safe to do mid-hosting-migration.

---

## Phase 0 — Pre-migration verification (Day -7 to Day 0)

**Purpose**: confirm the foundations the redesign assumes. No schema changes.

### Steps

1. **Verify TimescaleDB compression on `ohlc_1hour`.**
   ```sql
   SELECT * FROM hypertable_compression_stats('ohlc_1hour');
   ```
   Expect `before_compression_total_bytes / after_compression_total_bytes` ratio in 8–12× range for chunks > 7 days old.
   - If `before_compression_total_bytes` is NULL across all chunks: the policy at [hosting_plan.md:122-134](../hosting_plan.md#L122-L134) is configured but no chunk has been compressed. Bootstrap manually:
     ```sql
     SELECT compress_chunk(c) FROM show_chunks('ohlc_1hour', older_than => INTERVAL '7 days') c;
     ```
   - If even after bootstrap the ratio is poor (< 4×), audit `compress_segmentby` — it should be `ticker_id`.

2. **Capture baseline `EXPLAIN ANALYZE` for the broken endpoints.**
   ```sql
   EXPLAIN (ANALYZE, BUFFERS)
   SELECT DISTINCT ON (ticker_id) ticker_id, symbol, ltp, percent_change, volume_traded
   FROM ltp_live
   ORDER BY ticker_id, timestamp DESC
   LIMIT 25;
   ```
   Confirms the slow path is the 28 M-row scan. If the plan shows a different bottleneck (e.g. a missing index on `ticker_id`), update the Phase 2 design.

3. **Schema-only `pg_dump` of the financial DB.** Anchor for rollback.
   ```bash
   pg_dump --schema-only --no-owner --no-acl -h $DB_HOST -p $DB_PORT -d Tiphub > backups/Tiphub-schema-pre-cmots.sql
   ```

4. **Stand up a staging copy on the new DB box.** Restore from a recent base backup. Run all Phase 0 verifications against staging first.

5. **Audit the missing migration `028`.** The chain jumps from `027_payment_intents.sql` to `029_coin_pricing.sql`. Confirm whether `028` was rolled back, deleted, or never existed. Document in `migrations/README.md`.

6. **Confirm CMOTS sample feed access.** Even one feed file (e.g. a sample Bhavcopy) lets us validate that `co_code` is INTEGER vs VARCHAR, confirm column names, and spot-check ratios. Note all gaps vs the public-convention design as Day-0 open questions; route to architect.

### Rollback

None — no schema changes.

### Exit criteria

- [ ] Compression ratio on `ohlc_1hour` is 8–12×.
- [ ] `EXPLAIN ANALYZE` on `/api/most-active`'s SQL confirms `DISTINCT ON` over 28 M rows.
- [ ] Schema dump exists in `backups/`.
- [ ] Staging environment matches production schema-wise.
- [ ] CMOTS sample feed accessible; first-look discrepancies documented.

---

## Phase 1 — Master layer (Day 0 to Day +7)

**Purpose**: stand up `companies` / `scrips` / `instruments` / `instrument_identifiers` / `indices` / `mf_amcs` / `mf_schemes` alongside legacy `tickers`. No legacy table is touched.

### Migrations

| File | What it does | Reversible? |
|---|---|---|
| `030_create_companies.sql` | `CREATE TABLE companies` + indexes | yes — `DROP TABLE companies` |
| `031_create_scrips.sql` | `CREATE TABLE scrips` + indexes | yes |
| `032_create_indices_master.sql` | `CREATE TABLE indices` + `index_constituents` + indexes | yes |
| `033_create_mf_amcs_schemes.sql` | `CREATE TABLE mf_amcs`, `mf_schemes` + indexes | yes |
| `034_create_instruments.sql` | `CREATE TABLE instruments` (FK to scrips/indices/mf_schemes) | yes |
| `035_create_instrument_identifiers.sql` | `CREATE TABLE instrument_identifiers` + critical partial unique on `(vendor, vendor_id) WHERE valid_to IS NULL` | yes |
| `036_create_scrip_segments.sql` | `CREATE TABLE scrip_segments` + `scrip_segment_change_log` | yes |
| `037_create_instrument_xref_view.sql` | `CREATE OR REPLACE VIEW instrument_xref` | yes |
| `038_add_instrument_id_to_tickers.sql` | `ALTER TABLE tickers ADD COLUMN instrument_id BIGINT NULL`; backfill via separate Python script; later `ADD CONSTRAINT UNIQUE` | yes — `DROP COLUMN` |

### Backfill scripts (run after migrations)

| Script | What it does |
|---|---|
| `tools/migrate_tickers_to_instruments.py` | Walk every active `tickers` row, insert `companies` (key by ISIN; fall back to name match for legacy BSE rows missing ISIN), insert `scrips`, insert `instruments`, populate `instrument_identifiers` rows for `FYERS_SYMBOL`, `FYERS_FY_TOKEN`, `FYERS_EX_TOKEN` from `tickers.fyers_symbol`/`fy_token`/`token`. Set `instruments.legacy_ticker_id` and `tickers.instrument_id`. |
| `tools/migrate_segments.py` | Copy every `stock_segments` row → `scrip_segments` with `scrip_id` from `instruments.legacy_ticker_id` join. Same for `segment_change_log`. |
| `tools/seed_indices_from_existing.py` | Insert any indices already implicitly represented (NIFTY, BANKNIFTY, sectoral). Mostly placeholder until CMOTS sample lands. |
| `tools/extend_verify_sync.py` | Update `verify_sync.py` to scan: every `tickers` row has a matching `instruments` row; every active `instrument_identifiers (vendor, vendor_id)` triple is unique; no `scrips` row points at a non-existent `companies.co_code`. |

### Validation queries (run nightly)

```sql
-- Q1.1: every active ticker has an instrument
SELECT t.id, t.symbol
FROM tickers t LEFT JOIN instruments i ON i.legacy_ticker_id = t.id
WHERE t.is_active AND i.instrument_id IS NULL;

-- Q1.2: no instrument has stale FK
SELECT i.instrument_id FROM instruments i
LEFT JOIN scrips s ON i.scrip_id = s.scrip_id
WHERE i.scrip_id IS NOT NULL AND s.scrip_id IS NULL;

-- Q1.3: every active vendor id is unique
SELECT vendor, vendor_id, COUNT(*)
FROM instrument_identifiers
WHERE valid_to IS NULL
GROUP BY 1, 2 HAVING COUNT(*) > 1;
```

### Rollback

```sql
-- Reverse order:
ALTER TABLE tickers DROP COLUMN instrument_id;
DROP VIEW IF EXISTS instrument_xref;
DROP TABLE IF EXISTS scrip_segment_change_log;
DROP TABLE IF EXISTS scrip_segments;
DROP TABLE IF EXISTS instrument_identifiers;
DROP TABLE IF EXISTS instruments;
DROP TABLE IF EXISTS mf_schemes;
DROP TABLE IF EXISTS mf_amcs;
DROP TABLE IF EXISTS index_constituents;
DROP TABLE IF EXISTS indices;
DROP TABLE IF EXISTS scrips;
DROP TABLE IF EXISTS companies;
```

No legacy table is modified beyond the additive `instrument_id` column on `tickers` — rollback is clean.

### Exit criteria

- [ ] All Phase 1 migrations applied.
- [ ] Backfill scripts complete with zero validation-query rows.
- [ ] `verify_sync.py` extended.
- [ ] `instrument_xref` returns the same row count as active rows in `tickers`.

---

## Phase 2 — Time-series rebuild (Day +7 to Day +21)

**Purpose**: build `ltp_snapshot` (kills the 28 M-row bug structurally), `bhavcopy_eod` hypertable, F&O master + EOD, indices EOD/1-min, MF NAV, and the `ohlc_5min` / `ohlc_15min` continuous aggregates.

### Migrations

| File | What it does |
|---|---|
| `039_create_ltp_snapshot.sql` | `CREATE TABLE ltp_snapshot (PK = scrip_id)` + indexes |
| `040_create_bhavcopy_eod.sql` | `CREATE TABLE bhavcopy_eod` + `create_hypertable` + indexes + compression policy + retention policy |
| `041_create_fno_contracts.sql` | `CREATE TABLE fno_contracts` + indexes |
| `042_create_fno_eod.sql` | `CREATE TABLE fno_eod` + `create_hypertable` + compression + retention |
| `043_create_oi_snapshot_5min.sql` | `CREATE TABLE oi_snapshot_5min` + hypertable + compression + retention |
| `044_create_index_eod.sql` | `CREATE TABLE index_eod` (flat, no hypertable) |
| `045_create_index_ohlc_1min.sql` | `CREATE TABLE index_ohlc_1min` + hypertable + compression + retention |
| `046_create_mf_nav.sql` | `CREATE TABLE mf_nav` + hypertable + compression |
| `047_create_ohlc_5min_cagg.sql` | `CREATE MATERIALIZED VIEW ohlc_5min` as TimescaleDB continuous aggregate from `ohlc_1min_intraday`; refresh policy every 5 min |
| `048_create_ohlc_15min_cagg.sql` | Continuous aggregate from `ohlc_5min`; refresh policy every 15 min |
| `049_create_sector_eod_aggregates.sql` | Plain table; refresh via Celery nightly task |

### Backfill / cutover

1. Add `load_cmots_bhavcopy.py` Celery task to beat schedule. Daily at 19:00 IST (after EOD settlement).
2. Add `flush_fno_intraday_to_parquet.py` Celery task at 16:30 IST. Pulls from Redis Streams, writes Parquet to R2 partitioned by `expiry_year=YYYY/expiry_month=MM/date=YYYY-MM-DD/`.
3. **Dual-write LTP**: deploy a writer that updates **both** legacy `ltp_live` AND new `ltp_snapshot` with `ON CONFLICT DO UPDATE`. Run this for the dual-write window.
4. **Backfill historical bhavcopy**: one-shot `backfill_bhavcopy_from_history.py` populates last 5 years from CMOTS history (assuming CMOTS supports historical Bhavcopy retrieval). If they only ship forward-looking data, accept that history starts on cutover day; keep `ohlc_1hour` and continuous aggregates for pre-cutover history.

### Parity / validation queries (run nightly during dual-write)

```sql
-- Q2.1: every recently-active ticker has a current ltp_snapshot row
SELECT i.legacy_ticker_id, i.display_symbol
FROM instruments i LEFT JOIN ltp_snapshot ls ON ls.scrip_id = i.scrip_id
WHERE i.asset_class = 'EQUITY'
  AND i.is_active = TRUE
  AND (ls.scrip_id IS NULL OR ls.updated_at < NOW() - INTERVAL '30 minutes');

-- Q2.2: ltp_snapshot price matches latest ltp_live within tolerance
WITH latest_legacy AS (
  SELECT ticker_id, ltp, MAX(timestamp) AS ts
  FROM ltp_live WHERE timestamp > NOW() - INTERVAL '15 minutes'
  GROUP BY ticker_id, ltp
)
SELECT i.legacy_ticker_id, ls.ltp AS ltp_new, ll.ltp AS ltp_legacy,
       ABS(ls.ltp - ll.ltp) / NULLIF(ll.ltp, 0) AS drift
FROM ltp_snapshot ls
JOIN instruments i ON i.scrip_id = ls.scrip_id
JOIN latest_legacy ll ON ll.ticker_id = i.legacy_ticker_id
WHERE ABS(ls.ltp - ll.ltp) / NULLIF(ll.ltp, 0) > 0.001;

-- Q2.3: bhavcopy_eod row count for yesterday matches expected count
SELECT trade_date, exchange, COUNT(*)
FROM bhavcopy_eod
WHERE trade_date = CURRENT_DATE - 1
GROUP BY 1, 2;
```

### Cutover criteria (legacy `ltp_live` reads → `ltp_snapshot`)

- 7 consecutive days of zero rows on Q2.1 and Q2.2.
- p99 of `/api/most-active` (k6 load test, 100 RPS sustained) < 100 ms (vs current 15 s+ timeout).
- Logging shows zero reads against legacy `ltp_live` table from app code (audit log added in Phase 2).

### Rollback

```sql
-- For ltp_snapshot: drop the table; readers point back at legacy.
DROP TABLE IF EXISTS ltp_snapshot;

-- For bhavcopy_eod and the new hypertables:
SELECT remove_compression_policy('bhavcopy_eod', if_exists => TRUE);
SELECT remove_retention_policy('bhavcopy_eod', if_exists => TRUE);
DROP TABLE IF EXISTS bhavcopy_eod CASCADE;
-- ... same for fno_eod, fno_contracts, oi_snapshot_5min, index_eod, index_ohlc_1min, mf_nav.

-- For continuous aggregates:
DROP MATERIALIZED VIEW IF EXISTS ohlc_15min CASCADE;
DROP MATERIALIZED VIEW IF EXISTS ohlc_5min CASCADE;
```

### Exit criteria

- [ ] All Phase 2 migrations applied.
- [ ] Dual-write LTP daemon stable.
- [ ] CMOTS Bhavcopy daily load running.
- [ ] F&O Parquet flush running.
- [ ] Parity queries green for 7 days.
- [ ] `/api/most-active` k6 load test passes p99 < 100 ms.
- [ ] App reads cut over from `ltp_live` to `ltp_snapshot`.

---

## Phase 3 — Fundamentals + JSONB normalisation (Day +21 to Day +49)

**Purpose**: build the long-format `financial_statements` + `key_ratios` + materialised wide pivots; replace JSONB columns on `stock_fundamentals`. Replace Redis-only shareholding with full history.

### Migrations

| File | What it does |
|---|---|
| `050_create_line_item_dictionary.sql` | `CREATE TABLE line_item_dictionary` + `cmots_line_item_mapping` |
| `051_seed_line_item_dictionary.sql` | INSERT initial dictionary rows (REVENUE, COGS, OPERATING_PROFIT, EBITDA, EBIT, NET_PROFIT, INTEREST_EXPENSE, EPS_BASIC, EPS_DILUTED, TOTAL_ASSETS, TOTAL_EQUITY, TOTAL_BORROWINGS, CURRENT_ASSETS, CURRENT_LIABILITIES, CFO, CFI, CFF, CAPEX, FREE_CASH_FLOW + sector-specific bank/NBFC lines) |
| `052_create_financial_statements.sql` | Long-format table + indexes |
| `053_create_financial_summary_latest_mv.sql` | Materialised view + UNIQUE index for CONCURRENT refresh |
| `054_create_key_ratios.sql` | Long table + indexes |
| `055_create_key_ratios_latest_wide_mv.sql` | Wide MV + indexes |
| `056_create_shareholding_pattern.sql` | + indexes |
| `057_create_shareholding_individual.sql` | + indexes |
| `058_create_shareholding_changes_qoq_view.sql` | View, not MV |

### Sub-phases (the JSONB migration)

#### Phase 3A — Backfill (Day +21 to Day +28)

1. CMOTS history written to `financial_statements` with `source = 'CMOTS'`.
2. JSONB-extraction script `tools/backfill_financials_from_jsonb.py` walks every `stock_fundamentals` row, parses each of the five JSONB columns (`income_statement`, `balance_sheet`, `cash_flow`, `quarterly_financials`, `dividends_history`), maps yfinance keys → `line_item_dictionary.code`, writes rows tagged `source = 'JSONB_BACKFILL'`. Any `(co_code, period_end)` not covered by CMOTS gets backfilled from JSONB; CMOTS-covered periods are left as the canonical value.
3. `REFRESH MATERIALIZED VIEW CONCURRENTLY financial_summary_latest;`
4. Same path for shareholding: `tools/backfill_shareholding_from_redis.py` extracts whatever Redis has cached + screener.in re-scrapes for any company missing a recent quarter.

#### Phase 3B — Dual-write (Day +28 to Day +35)

1. `sync_cmots_fundamentals.py` Celery task (weekly Sunday 03:00 IST) writes to `financial_statements`, `key_ratios`, `shareholding_pattern`, `earnings_estimates`.
2. **Reads still come from JSONB** (the existing `/api/quote`, `/api/stock-detail` endpoints).
3. Parity queries (below) run nightly. Failures email the data team; non-zero status blocks switchover.

#### Phase 3C — Switchover (Day +35 to Day +42)

1. API endpoints flip to read from `financial_summary_latest` and the long table.
2. Hold for 7 days with **JSONB fallback**: if new path returns no rows, log a `fallback_count` metric and read from JSONB. The fallback rate must be zero for 7 consecutive days.
3. After 7 zero-fallback days, run `pg_dump` of just the JSONB columns to R2 (retain 90 days), then drop them in `070_drop_legacy_jsonb_columns.sql` (Phase 6).

### Parity validation queries

These four queries must all return zero (Q1, Q3, Q4) or < 0.5% (Q2) for 7 consecutive nights to gate Phase 3C completion.

#### Q3.1 — JSONB revenue ↔ financial_statements REVENUE

```sql
WITH jsonb_revenue AS (
  SELECT t.co_code,
         (q.value->>'fiscalDateEnding')::date AS period_end,
         (q.value->>'totalRevenue')::numeric AS revenue
  FROM stock_fundamentals sf
  JOIN tickers t ON t.id = sf.ticker_id
  CROSS JOIN LATERAL jsonb_array_elements(sf.quarterly_financials) AS q
  WHERE t.co_code IS NOT NULL
),
fs_revenue AS (
  SELECT co_code, period_end, amount AS revenue
  FROM financial_statements
  WHERE statement_type = 'INCOME'
    AND line_item_code = 'REVENUE'
    AND period_type IN ('Q1','Q2','Q3','Q4')
    AND reporting_basis = 'STANDALONE'
)
SELECT j.co_code, j.period_end, j.revenue AS jsonb_revenue, f.revenue AS fs_revenue,
       (j.revenue - f.revenue) AS delta,
       CASE
         WHEN f.revenue IS NULL THEN 'MISSING_IN_FS'
         WHEN j.revenue IS NULL THEN 'MISSING_IN_JSONB'
         WHEN abs(j.revenue - f.revenue) / nullif(j.revenue, 0) > 0.01 THEN 'DRIFT_GT_1PCT'
         ELSE 'OK'
       END AS status
FROM jsonb_revenue j
FULL OUTER JOIN fs_revenue f USING (co_code, period_end)
WHERE COALESCE(j.revenue, 0) <> COALESCE(f.revenue, 0)
   OR j.revenue IS NULL OR f.revenue IS NULL;
```

The exact JSONB key names (`totalRevenue`, `fiscalDateEnding`) come from yfinance — verify against an actual blob before running.

#### Q3.2 — Annual revenue equals sum of four quarters

```sql
SELECT co_code, fiscal_year, reporting_basis,
       SUM(amount) FILTER (WHERE period_type IN ('Q1','Q2','Q3','Q4')) AS sum_quarters,
       MAX(amount) FILTER (WHERE period_type = 'ANNUAL') AS annual,
       SUM(amount) FILTER (WHERE period_type IN ('Q1','Q2','Q3','Q4'))
         - MAX(amount) FILTER (WHERE period_type = 'ANNUAL') AS reconciliation_delta
FROM financial_statements
WHERE statement_type = 'INCOME' AND line_item_code = 'REVENUE'
GROUP BY co_code, fiscal_year, reporting_basis
HAVING abs(SUM(amount) FILTER (WHERE period_type IN ('Q1','Q2','Q3','Q4'))
       - MAX(amount) FILTER (WHERE period_type = 'ANNUAL')) > 1;  -- 1 Cr tolerance
```

Drift > 1 Cr indicates either a missing quarter or a CMOTS restatement that didn't propagate.

#### Q3.3 — Shareholding sums to 100%

```sql
SELECT co_code, period_end, SUM(holding_pct) AS total_pct
FROM shareholding_pattern
WHERE holder_category <> 'MUTUAL_FUND'   -- MF is subset of DII; exclude to avoid double-count
GROUP BY co_code, period_end
HAVING abs(SUM(holding_pct) - 100) > 0.5;
```

#### Q3.4 — Every active company has at least one statement row

```sql
SELECT t.symbol, t.co_code
FROM tickers t
WHERE t.co_code IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM financial_statements fs
    WHERE fs.co_code = t.co_code
      AND fs.statement_type = 'INCOME'
      AND fs.period_end >= CURRENT_DATE - INTERVAL '15 months'
  );
```

15-month threshold accommodates Indian filing lag.

### Rollback

- Phase 3A: drop the new tables; backfill data is gone but JSONB is untouched.
- Phase 3B: switch off the new writer Celery task.
- Phase 3C: re-enable JSONB reads (the columns aren't dropped until Phase 6).

### Exit criteria

- [ ] All four parity queries return zero (Q1/Q3/Q4) or < 0.5% (Q2) for 7 consecutive nights.
- [ ] API endpoints read from new MVs.
- [ ] Fallback rate to JSONB is zero for 7 consecutive days.
- [ ] `pg_dump` of JSONB columns completed and uploaded to R2.

---

## Phase 4 — Corporate actions, indices history, news/announcements (Day +49 to Day +63)

### Migrations

| File | What it does |
|---|---|
| `059_drop_empty_placeholders.sql` | `DROP TABLE corporate_actions, bulk_deals, pcr_data, delivery_data, vix_signals, quarterly_announcements, analyst_recommendations, announcement_performance` (all confirmed empty in audit). |
| `060_create_corporate_actions.sql` | New shape with ENUMs + indexes |
| `061_create_corporate_action_adjustments.sql` | + indexes |
| `062_create_dividend_payments_view.sql` | View on corporate_actions |
| `063_create_news_articles.sql` | + indexes |
| `064_create_news_article_tags.sql` | Junction with CHECK constraint |
| `065_create_corporate_announcements.sql` | + indexes |

### Backfill / cutover

1. `tools/load_cmots_corporate_actions.py` Celery task. Daily 06:30 IST on weekdays.
2. `tools/compute_adjustment_factors.py` one-shot — walks corporate_actions ordered by `effective_date`, populates `corporate_action_adjustments`.
3. `tools/news_ingest_cmots.py` Celery task every 15 min during market hours.
4. The existing on-demand sentiment path ([../main.py:3657](../main.py#L3657)) becomes a UPSERT into `news_articles` instead of Redis-only. The cron `news_ingest_googlenews.py` and `news_ingest_zerodha_pulse.py` use the same `INSERT ... ON CONFLICT (source, source_article_id) DO UPDATE` — Postgres handles the race.

### Parity / validation queries

```sql
-- Q4.1: adjustment factors complete for every scrip with corporate actions
SELECT ca.scrip_id, COUNT(ca.*) AS n_actions, COUNT(caa.*) AS n_adjustments
FROM corporate_actions ca
LEFT JOIN corporate_action_adjustments caa
  ON caa.corporate_action_id = ca.id
WHERE ca.action_type IN ('SPLIT','BONUS','RIGHTS') AND ca.is_active = TRUE
GROUP BY ca.scrip_id
HAVING COUNT(ca.*) <> COUNT(caa.*);

-- Q4.2: representative adjusted-price spot-check
-- Pull RELIANCE chart for 2017 (1:1 bonus) and verify hand-computed prices
SELECT ts, close, close * (
  SELECT price_factor FROM corporate_action_adjustments
  WHERE scrip_id = (SELECT scrip_id FROM scrips WHERE nse_symbol = 'RELIANCE' AND series = 'EQ' LIMIT 1)
    AND effective_date <= ts::date
  ORDER BY effective_date DESC LIMIT 1
) AS close_adj
FROM ohlc_1hour
WHERE ticker_id = (SELECT id FROM tickers WHERE symbol = 'RELIANCE' LIMIT 1)
  AND ts BETWEEN '2017-09-07' AND '2017-09-15'
ORDER BY ts;
-- Expected: close_adj on the day before bonus equals close on the day after bonus,
-- within 0.01 INR rounding.

-- Q4.3: news articles dedup by url_hash
SELECT url_hash, COUNT(*) FROM news_articles GROUP BY url_hash HAVING COUNT(*) > 1;
-- Should always be empty (UNIQUE constraint).
```

### Rollback

```sql
DROP TABLE IF EXISTS corporate_announcements;
DROP TABLE IF EXISTS news_article_tags;
DROP TABLE IF EXISTS news_articles;
DROP VIEW IF EXISTS dividend_payments;
DROP TABLE IF EXISTS corporate_action_adjustments;
DROP TABLE IF EXISTS corporate_actions;
-- Empty placeholder tables are gone for good — they had no data to lose.
```

### Exit criteria

- [ ] All Phase 4 migrations applied.
- [ ] Q4.1 returns zero rows.
- [ ] Q4.2 spot-check passes within 0.01 INR.
- [ ] Q4.3 returns zero (no url_hash dupes).
- [ ] CMOTS news ingest writing daily.
- [ ] On-demand sentiment path persists to `news_articles` (no longer Redis-only).

---

## Phase 5 — Derived caches + analyst data + market-wide signals (Day +63 to Day +84)

### Migrations

| File | What it does |
|---|---|
| `066_rename_stock_analysis_to_internal_notes.sql` | `ALTER TABLE stock_analysis RENAME TO internal_analyst_notes` |
| `067_create_brokers.sql` | + UNIQUE on broker_name |
| `068_create_analyst_recommendations.sql` | + indexes |
| `069_create_analyst_consensus_latest_mv.sql` | + UNIQUE index for refresh |
| `070_create_earnings_estimates.sql` | + indexes |
| `071_create_eps_revisions.sql` | derived nightly |
| `072_create_quarterly_announcements.sql` | + indexes |
| `073_create_announcement_performance.sql` | + GENERATED columns for alpha |
| `074_create_stock_scorecard.sql` | + partial index for today |
| `075_create_reverse_dcf_estimates.sql` | + partial index for aggressive valuations |
| `076_create_pcr_data.sql` | + partial index aggregate (expiry IS NULL) |
| `077_create_vix_regime_thresholds.sql` | + seed default 13/20/30 thresholds |
| `078_create_vix_signals.sql` | + index on regime |
| `079_create_fii_dii_flows.sql` | + partial indexes |
| `080_create_bulk_deals.sql` | + indexes; new shape |
| `081_create_block_deals.sql` | + indexes |
| `082_create_delivery_data.sql` | + partial index high-delivery |

### Cutover / new daily Celery tasks

| Task | Cadence | Target table |
|---|---|---|
| `compute_scorecards.py` | nightly 22:00 IST | `stock_scorecard` (one row per company per day) |
| `compute_reverse_dcf.py` | nightly 22:30 IST | `reverse_dcf_estimates` (default-assumption snapshot) |
| `sync_cmots_analyst_recommendations.py` | nightly 03:30 IST | `analyst_recommendations` |
| `refresh_analyst_consensus_mv.py` | nightly 04:00 IST | `analyst_consensus_latest` |
| `compute_eps_revisions.py` | nightly 04:30 IST | `eps_revisions` |
| `compute_announcement_performance.py` | nightly 05:00 IST | `announcement_performance` |
| `sync_cmots_fii_dii.py` | weekdays 19:00 IST | `fii_dii_flows` |
| `sync_cmots_pcr.py` | weekdays 19:30 IST | `pcr_data` |
| `sync_nse_vix.py` | weekdays 18:30 IST | `vix_signals` (regime computed at write time) |
| `sync_cmots_bulk_block_deals.py` | weekdays 19:00 IST | `bulk_deals`, `block_deals` |
| `sync_nse_delivery.py` | T+1 06:30 IST | `delivery_data` |

The existing [server/stock_scorecard.py](../server/stock_scorecard.py) compute-on-read becomes a **read-through** to the precomputed table: read from Redis → fall back to `stock_scorecard` → fall back to compute (with logging) on miss.

### Validation queries

```sql
-- Q5.1: every company with fundamentals has a scorecard for yesterday
SELECT c.co_code, c.company_name
FROM companies c
WHERE c.status = 'ACTIVE'
  AND EXISTS (SELECT 1 FROM financial_statements fs WHERE fs.co_code = c.co_code)
  AND NOT EXISTS (
    SELECT 1 FROM stock_scorecard sc
    WHERE sc.co_code = c.co_code AND sc.scorecard_date = CURRENT_DATE - 1
  );

-- Q5.2: scorecard endpoint p95 latency dropped >50%
-- (Application-level metric, not a DB query — capture from Grafana before/after)

-- Q5.3: VIX regime classification
SELECT regime, COUNT(*) FROM vix_signals
WHERE trade_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY regime;
-- Sanity: no NULL regimes.
```

### Rollback

Drop tables in reverse order. The renamed `internal_analyst_notes` can be renamed back if Phase 5 fails: `ALTER TABLE internal_analyst_notes RENAME TO stock_analysis`. The legacy `stock_analysis` rows are preserved through the rename.

### Exit criteria

- [ ] All Phase 5 migrations applied.
- [ ] Nightly Celery tasks all firing.
- [ ] Q5.1 returns zero rows.
- [ ] Stock-scorecard endpoint p95 down by > 50%.

---

## Phase 6 — Drop legacy (Day +90+, after one full quarter green)

**Hard cutover. Each step preceded by a `pg_dump` of the affected table to R2 (retain 90 days).**

### Migrations

| File | What it does | Pre-step |
|---|---|---|
| `083_drop_legacy_jsonb_columns.sql` | `ALTER TABLE stock_fundamentals DROP COLUMN income_statement, DROP COLUMN balance_sheet, DROP COLUMN cash_flow, DROP COLUMN quarterly_financials, DROP COLUMN dividends_history` | `pg_dump --table stock_fundamentals` to R2 |
| `084_drop_legacy_ltp_live.sql` | `DROP TABLE ltp_live, ltp_live_realtime` | `pg_dump --table ltp_live --table ltp_live_realtime` to R2 |
| `085_drop_legacy_stock_segments.sql` | `DROP TABLE stock_segments, segment_change_log` (data was ported to scrip_segments in Phase 1) | `pg_dump` to R2 |
| `086_convert_tickers_to_view.sql` | `DROP TABLE tickers; CREATE VIEW tickers AS SELECT ... FROM instruments JOIN scrips JOIN companies WHERE asset_class = 'EQUITY' AND is_active = TRUE` | Audit every reader; `pg_dump tickers` to R2 |
| `087_drop_legacy_market_movers_live.sql` | (optional) keep — frontend still reads it. Refresh logic is simpler under `ltp_snapshot`. | n/a |

### Pre-flight checks per step

Before each `DROP`:

```sql
-- Confirm no recent reads against the legacy table
SELECT relname, seq_scan, idx_scan, n_tup_ins, n_tup_upd, n_tup_del
FROM pg_stat_user_tables WHERE relname IN ('ltp_live', 'stock_fundamentals', 'tickers');
-- After app cutover, seq_scan/idx_scan should be ~0 for at least 7 days.
-- Reset stats first: SELECT pg_stat_reset();
```

### Rollback

Restore from the `pg_dump` taken pre-step. Re-attach FKs only if the legacy table is re-created with the same shape — which is unlikely if the team has moved on.

**This phase is intentionally hard to roll back.** That's by design — you've had 90 days of green parallel run and the architect has signed off.

### Exit criteria

- [ ] `pg_total_relation_size('stock_fundamentals')` drops by ~70% (JSONB columns gone).
- [ ] `pg_total_relation_size('ltp_live')` zero (table gone).
- [ ] `tickers` is now a view; all FKs from `ohlc_1hour`, etc. resolve through it.
- [ ] No application errors in the 7 days post-drop.

---

## Risk register (full)

| # | Risk | Likelihood | Blast radius | Mitigation | Trigger / detection |
|---|---|---|---|---|---|
| R1 | CMOTS dictionary differs from public conventions | High | Phase 1+3 require column rework | Defer Phase 3 until at least one CMOTS sample feed lands; keep Phase 1 against the most stable conventions | Mismatch at first sample-feed validation in Phase 0 |
| R2 | TimescaleDB compression policy not actually applied to `ohlc_1hour` | High | Disk fills during backfill | Phase 0 verification step; manual `compress_chunk()` if needed | `hypertable_compression_stats` ratio < 4× |
| R3 | `ltp_snapshot` cutover: app reads still hit `ltp_live` from a missed code path | Medium | Stale prices on stock detail | 7-day dual-write window minimum; log every read of legacy `ltp_live`; only drop after 7 zero-read days | App log shows `ltp_live` reads after Phase 2 completion |
| R4 | F&O Parquet path under-tested; DuckDB read latency > 200 ms cold | Medium | Backtest UX degraded for new queries | Pilot with one expiry month before generalising; fall back to keeping 6 months of F&O 1-min in TimescaleDB if DuckDB is too slow | Backtest endpoint p95 > 5 s |
| R5 | JSONB drift during dual-write produces silent miscounts | Medium | Wrong screener results | Four parity queries (Q3.1–Q3.4) run nightly; any non-zero status blocks switchover | Parity queries non-zero |
| R6 | `tickers.id` FK fanout — one of the 9 dependents missed during Phase 1 backfill | Medium | Orphan FK errors at write time | Extend `verify_sync.py` to cover every dependent before migration; run in CI | `verify_sync.py` errors |
| R7 | PgBouncer transaction-pool breaks asyncpg prepared statements | Low (known) | All hot reads error | Set `statement_cache_size=0` in pool init; add a startup self-test | App startup log |
| R8 | Hosting migration introduces a window where DB IPs change | High | All connections fail at cutover | Phase 1 lands **after** the two-box E2E setup is stable, not during | Hosting team notification |
| R9 | News volume + retention: `news_articles` grows ~1 K/day = 365 K/year | Low | Storage bloat eventually | Convert to TimescaleDB hypertable with retention policy if volume crosses 5 M | Row count check |
| R10 | Three-level identifier hierarchy is too complex for the team | Medium | Slow developer onboarding | `db-target-schema.md` opens with identifier-strategy explainer; `instrument_xref` view hides the 3-level join | Code-review feedback |
| R11 | NSE corrections to corporate_actions create stale `corporate_action_adjustments` | Medium | Adjusted prices subtly wrong | Recompute trigger / end-of-job pass; `superseded_by_id` chain in `corporate_actions` keeps history | Q4.2 spot-check fails |
| R12 | TimescaleDB continuous aggregate refresh takes longer than its interval | Low | Charts show stale data | Monitor refresh job duration; widen interval if > 50% of cadence | TimescaleDB job log |
| R13 | CMOTS feed authentication / rate limits hit during backfill | Medium | Backfill takes longer than expected | Backfill scripts honor rate limits; resumable via checkpointing | Backfill error log |
| R14 | Drizzle schema in Node side doesn't represent any new table | Low | Auth-side ignorance of financial schema | Drizzle is already out of sync with the auth DB; this is a known gap, not introduced by this redesign | Code review |
| R15 | Cross-database transactions (financial × auth) — none exist; if introduced ad-hoc during this work, will be inconsistent | Low | Inconsistent state on partial failures | Disallow cross-DB transactions; surface to architect if a use case arises | Code review |
| R16 | The `028` migration gap suggests prior rollback that wasn't documented | Low | Confusion during this team's onboarding | Phase 0 step 5 documents the gap | Pre-migration audit |
| R17 | `world-indices` thread-pool starvation (out of DB scope but blocks `most-active`) | High | `most-active` keeps timing out even after schema fix | Coordinate with the world-indices fix: separate executor / proper async wrapper. Track in [errors_to_resolve.md](../errors_to_resolve.md). | App-level latency monitoring |
| R18 | `compress_segmentby = 'ticker_id'` on `ohlc_1hour` while we move to `instrument_id` based reads | Low | Compressed chunks need decompress to be re-inserted with new key | Don't change the segmentby on existing hypertable; new hypertables (`bhavcopy_eod`) segment on `scrip_id` | Manual audit |
| R19 | F&O 1-min Parquet schema evolves with CMOTS schema changes | Medium | Older Parquet files become unreadable | Use Apache Iceberg-style schema evolution conventions (additive only); one-shot rewrite if a breaking change is unavoidable | DuckDB read errors |
| R20 | Quarter-of-parallel-run (Phase 6) drift if architect signs off too quickly | Medium | Lost data on legacy drop | `pg_dump` to R2 with 90-day retention before every drop step; rollback path documented | Architect approval gate |

---

## Verification plan (end-to-end)

After each phase, run the phase's exit criteria. Across all phases:

1. **Phase 0**: `hypertable_compression_stats('ohlc_1hour')` shows 8–12× ratio for chunks > 7 days.
2. **Phase 1**: `verify_sync.py` orphan scan zero across all FKs.
3. **Phase 2**: k6 load test against `/api/most-active` shows p99 < 100 ms at 100 RPS sustained.
4. **Phase 3**: All four parity queries zero (Q1/Q3/Q4) or < 0.5% (Q2) for 7 nights.
5. **Phase 4**: RELIANCE 2017 bonus spot-check, adjusted close matches within 0.01 INR.
6. **Phase 5**: Stock-scorecard endpoint p95 down > 50%.
7. **Phase 6**: `pg_total_relation_size('stock_fundamentals')` down ~70%; `pg_total_relation_size('ltp_live')` = 0.
8. **End-to-end browser test at staging**: full screener + chart user session, sub-200 ms first-meaningful-paint for `/quote/{symbol}`, screener with 50-condition expression over 3,000 tickers completes in < 30 s.

---

## What's deliberately NOT in this migration plan

- **Tick / Level 1 storage in Postgres.** Off-Postgres path (Redis Streams → Parquet) only.
- **Cross-database transactions.** Financial × auth coordination is out of scope.
- **Read replicas.** Tier-C work per [hosting_plan.md](../hosting_plan.md); 2,500 users doesn't justify it.
- **Drizzle schema regeneration.** Auth-DB-only concern; doesn't affect CMOTS migration.
- **Auth DB tables.** No changes here — these 35+ tables are owned by Node and not in CMOTS scope.
- **Cron schedule restructuring.** Celery beat additions are listed per phase but the broader question of "should world-indices be on a separate executor" is tracked in [errors_to_resolve.md](../errors_to_resolve.md).

---

## Reference: file-by-file ownership

The implementation phases map to file ownership as follows:

| Owner | Files |
|---|---|
| Migration files | [../migrations/030_*.sql](../migrations/) onward — all idempotent, all reversible |
| Backfill scripts | `tools/migrate_*.py`, `tools/backfill_*.py`, `tools/load_cmots_*.py` |
| Daily Celery tasks | [../celery_tasks.py](../celery_tasks.py) — new tasks added; [../celery_config.py](../celery_config.py) — beat schedule extended |
| Loader scripts (CMOTS) | new under `tools/cmots/` — one per feed family |
| Verify scripts | extension of existing `verify_sync.py` pattern |
| API routing changes | [../main.py](../main.py) for asyncpg-pool migration; [../server/db_*.py](../server/) for accessor updates |
| Documentation | [docs/db-*.md](../docs/), this file, the SQL, the Mermaid |

---

End of migration plan. Implementation begins after architect approval of this document and all four siblings: [db-audit.md](db-audit.md), [db-target-schema.md](db-target-schema.md), [db-target-schema.sql](db-target-schema.sql), [db-er-diagram.mermaid](db-er-diagram.mermaid).
