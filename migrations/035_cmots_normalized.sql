-- Migration 035: CMOTS — normalized hot-path tables
-- Database: equityprodata
-- Purpose:  Tables read by frontend accessors. Populated by the sync
--           orchestrator's normalizers (server/cmots_normalizers.py) from
--           the raw cache (cmots_api_rows.payload_json).
--
-- All eight tables FK their co_code column to tickers.co_code with
-- ON DELETE CASCADE. CHECK constraints enforce enumerated string domains
-- (statement, report, doc_type, source) matching the defensive instincts
-- from 033/034.
--
-- Idempotent: CREATE TABLE / INDEX IF NOT EXISTS throughout.
--
-- Apply with:
--   psql --single-transaction --set ON_ERROR_STOP=1 \
--        -d equityprodata -f migrations/035_cmots_normalized.sql
--
-- The wrapping transaction comes from psql's --single-transaction; no inner
-- BEGIN/COMMIT here.

-- 1. cmots_financial_line ---------------------------------------------------
-- Long form of the wide-layout financial endpoints (P&L, BS, CF, quarterly /
-- yearly / half / nine results). One row per (period × rid). Period encoded
-- YYYYMM (e.g. 202503 = March 2025 fiscal-period end).

CREATE TABLE IF NOT EXISTS cmots_financial_line (
  co_code     INTEGER NOT NULL REFERENCES tickers(co_code) ON DELETE CASCADE,
  statement   TEXT    NOT NULL CHECK (statement IN ('S','C')),
  report      TEXT    NOT NULL CHECK (report IN ('quarter','year','half','nine')),
  period      INTEGER NOT NULL,
  rid         INTEGER NOT NULL,
  column_name TEXT    NOT NULL,
  value       NUMERIC,
  PRIMARY KEY (co_code, statement, report, period, rid)
);

CREATE INDEX IF NOT EXISTS idx_cmots_financial_line_lookup
  ON cmots_financial_line (co_code, statement, report, period DESC);

-- 2. cmots_ratio_yearly -----------------------------------------------------
-- Long-format yearly ratio endpoints (Yearly_Ratio_S/_C). Typed columns for
-- the headline metrics the frontend reads directly; raw_json keeps every
-- column we did not promote.

CREATE TABLE IF NOT EXISTS cmots_ratio_yearly (
  co_code             INTEGER NOT NULL REFERENCES tickers(co_code) ON DELETE CASCADE,
  statement           TEXT    NOT NULL CHECK (statement IN ('S','C')),
  yearend             INTEGER NOT NULL,
  pe                  NUMERIC,
  pbv                 NUMERIC,
  ev_ebitda           NUMERIC,
  div_yield           NUMERIC,
  roa                 NUMERIC,
  roe                 NUMERIC,
  roce                NUMERIC,
  ebit                NUMERIC,
  ebitda              NUMERIC,
  debt_equity         NUMERIC,
  current_ratio       NUMERIC,
  mcap                NUMERIC,
  ev                  NUMERIC,
  eps                 NUMERIC,
  book_value          NUMERIC,
  dividend_payout     NUMERIC,
  net_income_margin   NUMERIC,
  gross_income_margin NUMERIC,
  asset_turnover      NUMERIC,
  fcf_margin          NUMERIC,
  sales_totalasset    NUMERIC,
  netdebt_fcf         NUMERIC,
  raw_json            JSONB,
  PRIMARY KEY (co_code, statement, yearend)
);

-- 3. cmots_ratio_quarterly --------------------------------------------------
-- Subset of yearly's metric columns; same shape, smaller typed surface.

CREATE TABLE IF NOT EXISTS cmots_ratio_quarterly (
  co_code           INTEGER NOT NULL REFERENCES tickers(co_code) ON DELETE CASCADE,
  statement         TEXT    NOT NULL CHECK (statement IN ('S','C')),
  qtrend            INTEGER NOT NULL,
  pe                NUMERIC,
  pbv               NUMERIC,
  ev_ebitda         NUMERIC,
  roa               NUMERIC,
  roe               NUMERIC,
  ebit              NUMERIC,
  ebitda            NUMERIC,
  debt_equity       NUMERIC,
  current_ratio     NUMERIC,
  mcap              NUMERIC,
  ev                NUMERIC,
  eps               NUMERIC,
  book_value        NUMERIC,
  net_income_margin NUMERIC,
  asset_turnover    NUMERIC,
  raw_json          JSONB,
  PRIMARY KEY (co_code, statement, qtrend)
);

-- 4. cmots_shareholding -----------------------------------------------------
-- Per-quarter shareholding aggregates extracted by normalize_shareholding().
-- Promoter % uses TotalPromoter_PerShares (NOT NPFSUBTOT — that's a share
-- count, not a percent — see plan §11.2). raw_json preserves all 163 source
-- columns for ad-hoc queries.

CREATE TABLE IF NOT EXISTS cmots_shareholding (
  co_code                INTEGER NOT NULL REFERENCES tickers(co_code) ON DELETE CASCADE,
  yrc                    INTEGER NOT NULL,
  promoter_pct           NUMERIC,
  promoter_pledge_pct    NUMERIC,
  fii_pct                NUMERIC,
  dii_pct                NUMERIC,
  govt_pct               NUMERIC,
  public_pct             NUMERIC,
  custodian_pct          NUMERIC,
  total_shares           BIGINT,
  total_promoter_shares  BIGINT,
  total_pledged_shares   BIGINT,
  n_shareholders         INTEGER,
  raw_json               JSONB,
  PRIMARY KEY (co_code, yrc)
);

-- 5. cmots_corporate_action -------------------------------------------------
-- One row per corporate action (dividend / bonus / split / agm / egm / etc).
-- action_type is free-text (no CHECK) so new CMOTS slugs flow through
-- without a schema change.

CREATE TABLE IF NOT EXISTS cmots_corporate_action (
  id          BIGSERIAL   PRIMARY KEY,
  co_code     INTEGER     NOT NULL REFERENCES tickers(co_code) ON DELETE CASCADE,
  action_type TEXT        NOT NULL,
  action_date DATE,
  payload     JSONB,
  source_slug TEXT        NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cmots_corporate_action_lookup
  ON cmots_corporate_action (co_code, action_type, action_date DESC);

-- 6. cmots_narrative --------------------------------------------------------
-- Free-text HTML bodies (Director's Report, Chairman, Auditor, MD&A, Notes).
-- body_html is bleach-sanitized at write time. body_text is the tag-stripped
-- plaintext used for full-text search.

CREATE TABLE IF NOT EXISTS cmots_narrative (
  id         BIGSERIAL   PRIMARY KEY,
  co_code    INTEGER     NOT NULL REFERENCES tickers(co_code) ON DELETE CASCADE,
  doc_type   TEXT        NOT NULL CHECK (doc_type IN (
               'director_report',
               'chairman_report',
               'auditor_report',
               'notes_to_account',
               'mda')),
  year       INTEGER,
  body_html  TEXT,
  body_text  TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cmots_narrative_co_doc_year
  ON cmots_narrative (co_code, doc_type, year DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_cmots_narrative_fulltext
  ON cmots_narrative USING gin (to_tsvector('english', body_text));

-- 7. cmots_announcement -----------------------------------------------------
-- BSE/NSE feed. co_code is nullable: some announcements arrive without a
-- co_code (universe-wide / unmappable) and we want to keep them rather than
-- drop them on the floor. agency / rating populated by the credit-rating
-- regex extractor (plan §9.4).

CREATE TABLE IF NOT EXISTS cmots_announcement (
  id                BIGSERIAL   PRIMARY KEY,
  co_code           INTEGER     REFERENCES tickers(co_code) ON DELETE CASCADE,
  source            TEXT        NOT NULL CHECK (source IN ('BSE','NSE')),
  caption           TEXT,
  memo              TEXT,
  descriptor        TEXT,
  type              TEXT,
  announcement_date TIMESTAMPTZ,
  file_url          TEXT,
  agency            TEXT,
  rating            TEXT
);

CREATE INDEX IF NOT EXISTS idx_cmots_announcement_co_date
  ON cmots_announcement (co_code, announcement_date DESC);

-- Partial index for "rated announcements only" — credit-rating panel reads.
CREATE INDEX IF NOT EXISTS idx_cmots_announcement_rated
  ON cmots_announcement (co_code, announcement_date DESC) WHERE rating IS NOT NULL;

-- 8. cmots_company_extended -------------------------------------------------
-- One row per ticker. Compiled from Company_Profile + Board_Of_Directors +
-- Bankers + Subsidiaries + Locations during sync.

CREATE TABLE IF NOT EXISTS cmots_company_extended (
  co_code            INTEGER PRIMARY KEY REFERENCES tickers(co_code) ON DELETE CASCADE,
  chairman           TEXT,
  auditor            TEXT,
  company_secretary  TEXT,
  registrar          TEXT,
  registered_office  TEXT,
  head_office        TEXT,
  corporate_office   TEXT,
  website            TEXT,
  incorporation_year INTEGER,
  directors_json     JSONB,
  bankers_json       JSONB,
  subsidiaries_json  JSONB,
  locations_json     JSONB
);

-- 9. Comments ---------------------------------------------------------------

COMMENT ON TABLE  cmots_financial_line          IS 'Long form of CMOTS wide-layout financial endpoints (P&L / BS / CF / quarterly / yearly).';
COMMENT ON COLUMN cmots_financial_line.statement IS 'S = Standalone, C = Consolidated.';
COMMENT ON COLUMN cmots_financial_line.report    IS 'quarter | year | half | nine. Maps to CMOTS slug suffix.';
COMMENT ON COLUMN cmots_financial_line.period    IS 'YYYYMM integer, e.g. 202503 for fiscal-period ending March 2025.';

COMMENT ON TABLE  cmots_ratio_yearly             IS 'Yearly ratio snapshots; promoted columns + raw_json for full payload.';
COMMENT ON TABLE  cmots_ratio_quarterly          IS 'Quarterly ratio snapshots; subset of yearly''s typed columns + raw_json.';

COMMENT ON TABLE  cmots_shareholding             IS 'Quarterly shareholding aggregates. Promoter % uses TotalPromoter_PerShares (not NPFSUBTOT).';
COMMENT ON COLUMN cmots_shareholding.yrc         IS 'CMOTS YRC integer (YYYYMM) — same encoding as financial_line.period.';

COMMENT ON TABLE  cmots_corporate_action         IS 'One row per corporate action; action_type is free-text.';
COMMENT ON TABLE  cmots_narrative                IS 'HTML/text bodies for director / chairman / auditor / MD&A / notes reports. body_html is bleach-sanitized.';

COMMENT ON TABLE  cmots_announcement             IS 'BSE/NSE announcement feed. co_code nullable (some announcements are universe-wide).';
COMMENT ON COLUMN cmots_announcement.agency      IS 'Credit-rating agency, populated by regex extraction (CRISIL | ICRA | CARE | Brickwork | Acuite | India Ratings | FITCH).';

COMMENT ON TABLE  cmots_company_extended         IS 'Compiled per-ticker profile: officers, addresses, directors/bankers/subsidiaries/locations as JSONB.';
