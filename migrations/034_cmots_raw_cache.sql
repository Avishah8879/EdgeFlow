-- Migration 034: CMOTS — raw cache tables
-- Database: equityprodata
-- Purpose:  Stores raw CMOTS API responses keyed by (endpoint, co_code).
--           Foundation for the sync orchestrator; downstream normalizers read
--           cmots_api_rows.payload_json to populate the hot-path tables added
--           by migration 035.
--
-- Idempotent: uses CREATE TABLE / INDEX IF NOT EXISTS, DO-block guards for
-- unique constraints, and ON CONFLICT for the seed row. Re-running is a no-op.
--
-- Apply with:
--   psql --single-transaction --set ON_ERROR_STOP=1 \
--        -d equityprodata -f migrations/034_cmots_raw_cache.sql
--
-- The wrapping transaction comes from psql's --single-transaction; no inner
-- BEGIN/COMMIT here.

-- 1. Endpoint registry ------------------------------------------------------
-- One row per CMOTS URL template (191 endpoints across 13 sections).
-- Seeded by server/cmots_endpoints.py at sync startup.

CREATE TABLE IF NOT EXISTS cmots_endpoints (
  id              SERIAL  PRIMARY KEY,
  section         TEXT    NOT NULL,
  slug            TEXT    NOT NULL,
  report_name     TEXT,
  url_template    TEXT    NOT NULL,
  is_ticker_bound BOOLEAN NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_cmots_endpoints_section_slug'
  ) THEN
    ALTER TABLE cmots_endpoints
      ADD CONSTRAINT uq_cmots_endpoints_section_slug UNIQUE (section, slug);
  END IF;
END $$;

-- 2. Per-call cache ---------------------------------------------------------
-- One row per (endpoint, co_code) cache slot. UPSERTed on every sync.
-- For static endpoints, co_code IS NULL.
-- NB: the unique constraint uses NULLS NOT DISTINCT (PG 15+) so static
--     endpoints (co_code IS NULL) UPSERT cleanly on the second sync rather
--     than accumulating duplicate rows under standard SQL NULL semantics.

CREATE TABLE IF NOT EXISTS cmots_api_calls (
  id          SERIAL      PRIMARY KEY,
  endpoint_id INTEGER     NOT NULL REFERENCES cmots_endpoints(id) ON DELETE CASCADE,
  co_code     INTEGER              REFERENCES tickers(co_code)    ON DELETE CASCADE,
  called_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  http_status INTEGER,
  success     BOOLEAN,
  message     TEXT,
  row_count   INTEGER     NOT NULL DEFAULT 0
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_cmots_api_calls_endpoint_cocode'
  ) THEN
    ALTER TABLE cmots_api_calls
      ADD CONSTRAINT uq_cmots_api_calls_endpoint_cocode
        UNIQUE NULLS NOT DISTINCT (endpoint_id, co_code);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cmots_api_calls_co_code
  ON cmots_api_calls (co_code);

-- 3. Per-row payload --------------------------------------------------------
-- One row per response-row, raw JSONB. The rows for a given api_call_id are
-- wiped and reinserted on each re-sync (so re-syncs are clean snapshots).

CREATE TABLE IF NOT EXISTS cmots_api_rows (
  id           SERIAL  PRIMARY KEY,
  api_call_id  INTEGER NOT NULL REFERENCES cmots_api_calls(id) ON DELETE CASCADE,
  row_index    INTEGER NOT NULL,
  payload_json JSONB   NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cmots_api_rows_call
  ON cmots_api_rows (api_call_id, row_index);

-- 4. Singleton sync state ---------------------------------------------------
-- Polled by the admin frontend during sync. Updated by the orchestrator
-- in cmots_sync.py.

CREATE TABLE IF NOT EXISTS cmots_sync_state (
  id          INTEGER     PRIMARY KEY CHECK (id = 1),
  status      TEXT        NOT NULL DEFAULT 'idle'
                          CHECK (status IN ('idle','running','done','error')),
  total       INTEGER     NOT NULL DEFAULT 0,
  done        INTEGER     NOT NULL DEFAULT 0,
  failed      INTEGER     NOT NULL DEFAULT 0,
  current     TEXT,
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

INSERT INTO cmots_sync_state (id, status, total, done, failed)
VALUES (1, 'idle', 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- 5. Comments ---------------------------------------------------------------

COMMENT ON TABLE  cmots_endpoints                IS 'Registry of CMOTS endpoint URL templates (one row per slug).';
COMMENT ON COLUMN cmots_endpoints.is_ticker_bound IS 'TRUE if URL contains {co_code} placeholder; FALSE for static/universe endpoints.';

COMMENT ON TABLE  cmots_api_calls                IS 'One row per (endpoint, co_code) cache slot. UPSERTed on every sync. Failed calls also written.';
COMMENT ON COLUMN cmots_api_calls.co_code        IS 'NULL for static/universe endpoints. UNIQUE constraint uses NULLS NOT DISTINCT so static endpoints UPSERT cleanly.';
COMMENT ON COLUMN cmots_api_calls.success        IS 'API-level success (envelope.success boolean). Never matched against the misspelled "Sucessful" string.';

COMMENT ON TABLE  cmots_api_rows                 IS 'Raw response rows as JSONB; wiped + reinserted on each api_call re-sync to keep them consistent with the latest payload.';

COMMENT ON TABLE  cmots_sync_state               IS 'Singleton row tracking the current/most-recent sync. id is fixed at 1.';
