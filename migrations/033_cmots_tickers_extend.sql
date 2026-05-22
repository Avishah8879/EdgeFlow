-- Migration 033: CMOTS — extend tickers + stock_fundamentals
-- Database: equityprodata
-- Purpose:  Additive-only column changes to existing tables so that the CMOTS
--           sync orchestrator and accessors can tag tickers with their CMOTS
--           co_code, mark coverage, blacklist specific tickers, and track
--           which source most recently populated the fundamentals row.
--
-- Idempotent: uses ADD COLUMN IF NOT EXISTS and a DO-block guard for the
-- UNIQUE constraint. Re-running is a no-op.
--
-- Apply with:
--   psql --single-transaction --set ON_ERROR_STOP=1 \
--        -d equityprodata -f migrations/033_cmots_tickers_extend.sql
--
-- The wrapping transaction comes from psql's --single-transaction; no inner
-- BEGIN/COMMIT here.

ALTER TABLE tickers
  ADD COLUMN IF NOT EXISTS co_code              INTEGER,
  ADD COLUMN IF NOT EXISTS isin                 TEXT,
  ADD COLUMN IF NOT EXISTS bse_code             TEXT,
  ADD COLUMN IF NOT EXISTS mcap_type            TEXT
       CHECK (mcap_type IN ('Large Cap','Mid Cap','Small Cap') OR mcap_type IS NULL),
  ADD COLUMN IF NOT EXISTS has_cmots_data       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cmots_disabled       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cmots_last_synced_at TIMESTAMPTZ;

-- Full UNIQUE constraint (NOT a partial unique index) so it can serve as the
-- target of FK references in migration 031. PostgreSQL treats NULLs as
-- distinct under standard SQL semantics, so the constraint admits many rows
-- with co_code IS NULL while enforcing uniqueness across non-NULL values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_tickers_co_code'
  ) THEN
    ALTER TABLE tickers ADD CONSTRAINT uq_tickers_co_code UNIQUE (co_code);
  END IF;
END $$;

ALTER TABLE stock_fundamentals
  ADD COLUMN IF NOT EXISTS data_source     VARCHAR(16) NOT NULL DEFAULT 'yfinance',
  ADD COLUMN IF NOT EXISTS cmots_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN tickers.co_code              IS 'CMOTS company code; nullable for tickers not covered by CMOTS.';
COMMENT ON COLUMN tickers.has_cmots_data       IS 'TRUE once a CMOTS sync has populated this ticker''s rich data.';
COMMENT ON COLUMN tickers.cmots_disabled       IS 'Admin blacklist: skip CMOTS for this ticker even if has_cmots_data=TRUE.';
COMMENT ON COLUMN tickers.cmots_last_synced_at IS 'Wall-clock timestamp of the most recent successful CMOTS sync for this ticker.';
COMMENT ON COLUMN stock_fundamentals.data_source     IS 'Which provider populated the current row: ''yfinance'' or ''cmots''.';
COMMENT ON COLUMN stock_fundamentals.cmots_synced_at IS 'Wall-clock timestamp of the most recent CMOTS-sourced repopulation.';
