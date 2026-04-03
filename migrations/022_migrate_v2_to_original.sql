-- ============================================================================
-- MIGRATION: ltp_live_v2 → ltp_live, market_movers_live_v2 → market_movers_live
-- File: 010_migrate_v2_to_original.sql
-- Run with: psql -h <host> -U <user> -d Tiphub -f migrations/010_migrate_v2_to_original.sql
-- ============================================================================

BEGIN;

-- Step 1: Add missing indexes to ltp_live_v2
CREATE INDEX IF NOT EXISTS idx_ltp_live_v2_ticker ON public.ltp_live_v2 USING btree (ticker_id);

-- Step 2: Add missing indexes to market_movers_live_v2
CREATE INDEX IF NOT EXISTS idx_market_movers_v2_category_rank ON public.market_movers_live_v2 USING btree (category, rank);
CREATE INDEX IF NOT EXISTS idx_market_movers_v2_latest_rank ON public.market_movers_live_v2 USING btree (category, snapshot_time DESC, rank);
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_movers_v2_unique_snapshot ON public.market_movers_live_v2 USING btree (ticker_id, category, snapshot_time);

-- Step 3: Add check constraints to market_movers_live_v2
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'market_movers_live_v2_rank_check') THEN
        ALTER TABLE market_movers_live_v2 ADD CONSTRAINT market_movers_live_v2_rank_check CHECK (rank > 0 AND rank <= 20);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'market_movers_live_v2_category_check') THEN
        ALTER TABLE market_movers_live_v2 ADD CONSTRAINT market_movers_live_v2_category_check CHECK (category IN ('GAINER', 'LOSER', 'NEAR_52W_HIGH', 'NEAR_52W_LOW', 'VOLUME_GAINER'));
    END IF;
END $$;

-- Step 4: Rename OLD table indexes first (to free up names)
ALTER INDEX IF EXISTS idx_ltp_live_symbol RENAME TO idx_ltp_live_old_symbol;
ALTER INDEX IF EXISTS idx_ltp_live_ticker RENAME TO idx_ltp_live_old_ticker;
ALTER INDEX IF EXISTS idx_ltp_live_ticker_timestamp RENAME TO idx_ltp_live_old_ticker_timestamp;
ALTER INDEX IF EXISTS idx_ltp_live_timestamp RENAME TO idx_ltp_live_old_timestamp;
ALTER INDEX IF EXISTS ltp_live_pkey RENAME TO ltp_live_old_pkey;
ALTER INDEX IF EXISTS idx_ohlc_symbol RENAME TO idx_ohlc_old_symbol;
ALTER INDEX IF EXISTS idx_ohlc_ticker_timestamp RENAME TO idx_ohlc_old_ticker_timestamp;

ALTER INDEX IF EXISTS idx_movers_category_rank RENAME TO idx_movers_old_category_rank;
ALTER INDEX IF EXISTS idx_movers_latest_rank RENAME TO idx_movers_old_latest_rank;
ALTER INDEX IF EXISTS idx_movers_snapshot RENAME TO idx_movers_old_snapshot;
ALTER INDEX IF EXISTS idx_movers_ticker RENAME TO idx_movers_old_ticker;
ALTER INDEX IF EXISTS idx_movers_unique_snapshot RENAME TO idx_movers_old_unique_snapshot;
ALTER INDEX IF EXISTS market_movers_live_pkey RENAME TO market_movers_live_old_pkey;

-- Step 5: Backup original tables
ALTER TABLE ltp_live RENAME TO ltp_live_old;
ALTER TABLE market_movers_live RENAME TO market_movers_live_old;

-- Step 6: Promote v2 tables
ALTER TABLE ltp_live_v2 RENAME TO ltp_live;
ALTER TABLE market_movers_live_v2 RENAME TO market_movers_live;

-- Step 7: Rename ltp_live indexes (v2 → original names)
ALTER INDEX idx_ltp_live_v2_symbol RENAME TO idx_ltp_live_symbol;
ALTER INDEX idx_ltp_live_v2_ticker RENAME TO idx_ltp_live_ticker;
ALTER INDEX idx_ltp_live_v2_ticker_timestamp RENAME TO idx_ltp_live_ticker_timestamp;
ALTER INDEX idx_ltp_live_v2_timestamp RENAME TO idx_ltp_live_timestamp;
ALTER INDEX ltp_live_v2_pkey RENAME TO ltp_live_pkey;

-- Step 8: Rename market_movers_live indexes (v2 → original names)
ALTER INDEX idx_market_movers_v2_category RENAME TO idx_movers_category;
ALTER INDEX idx_market_movers_v2_category_rank RENAME TO idx_movers_category_rank;
ALTER INDEX idx_market_movers_v2_latest_rank RENAME TO idx_movers_latest_rank;
ALTER INDEX idx_market_movers_v2_snapshot RENAME TO idx_movers_snapshot;
ALTER INDEX idx_market_movers_v2_ticker RENAME TO idx_movers_ticker;
ALTER INDEX idx_market_movers_v2_unique_snapshot RENAME TO idx_movers_unique_snapshot;
ALTER INDEX market_movers_live_v2_pkey RENAME TO market_movers_live_pkey;

-- Step 9: Rename constraints
ALTER TABLE market_movers_live RENAME CONSTRAINT market_movers_live_v2_category_check TO market_movers_live_category_check;
ALTER TABLE market_movers_live RENAME CONSTRAINT market_movers_live_v2_rank_check TO market_movers_live_rank_check;

-- Step 10: Rename foreign key constraints
ALTER TABLE ltp_live RENAME CONSTRAINT ltp_live_v2_ticker_id_fkey TO ltp_live_ticker_id_fkey;
ALTER TABLE market_movers_live RENAME CONSTRAINT market_movers_live_v2_ticker_id_fkey TO market_movers_live_ticker_id_fkey;

-- Step 11: Rename sequences
ALTER SEQUENCE ltp_live_v2_id_seq RENAME TO ltp_live_id_seq_new;
ALTER SEQUENCE market_movers_live_v2_id_seq RENAME TO market_movers_live_id_seq_new;

COMMIT;

-- Verification queries
SELECT 'ltp_live' as table_name, COUNT(*) as rows FROM ltp_live
UNION ALL SELECT 'market_movers_live', COUNT(*) FROM market_movers_live
UNION ALL SELECT 'ltp_live_old', COUNT(*) FROM ltp_live_old
UNION ALL SELECT 'market_movers_live_old', COUNT(*) FROM market_movers_live_old;

-- ============================================================================
-- CLEANUP (uncomment and run separately after verifying app works)
-- ============================================================================
-- DROP TABLE ltp_live_old;
-- DROP TABLE market_movers_live_old;
-- DROP SEQUENCE ltp_live_id_seq;
-- DROP SEQUENCE market_movers_live_id_seq;
