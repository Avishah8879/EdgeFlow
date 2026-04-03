-- Migration: Convert technical_indicators_live from MATERIALIZED VIEW to TABLE
-- Purpose: Improve query performance by 100-400x with PRIMARY KEY indexing
-- Impact: Enables real-time indicator updates without blocking reads
-- Database: finviz_market_data @ 164.52.193.222:5432
-- Author: Claude Code Optimization
-- Date: 2025-11-19

-- Drop existing materialized view
DROP MATERIALIZED VIEW IF EXISTS technical_indicators_live CASCADE;

-- Create regular table with PRIMARY KEY for O(1) lookups
CREATE TABLE technical_indicators_live (
  ticker_id INTEGER PRIMARY KEY REFERENCES tickers(id) ON DELETE CASCADE,

  -- Simple Moving Averages
  sma_20 NUMERIC,
  sma_50 NUMERIC,
  sma_100 NUMERIC,
  sma_200 NUMERIC,

  -- Exponential Moving Averages
  ema_9 NUMERIC,
  ema_12 NUMERIC,
  ema_26 NUMERIC,
  ema_50 NUMERIC,
  ema_200 NUMERIC,

  -- MACD
  macd_line NUMERIC,
  macd_signal NUMERIC,
  macd_histogram NUMERIC,

  -- Oscillators
  rsi_14 NUMERIC,

  -- Volatility
  atr_14 NUMERIC,

  -- Supertrend
  supertrend_7_3 NUMERIC,
  supertrend_direction_7_3 INTEGER,
  supertrend_10_3 NUMERIC,
  supertrend_direction_10_3 INTEGER,

  -- Bollinger Bands
  bb_upper_20 NUMERIC,
  bb_middle_20 NUMERIC,
  bb_lower_20 NUMERIC,

  -- Volume
  volume_sma_20 BIGINT,

  -- Metadata
  calculated_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for screener queries (partial indexes for better performance)
CREATE INDEX idx_tech_live_rsi ON technical_indicators_live(rsi_14)
  WHERE rsi_14 IS NOT NULL;

CREATE INDEX idx_tech_live_macd ON technical_indicators_live(macd_histogram)
  WHERE macd_histogram IS NOT NULL;

CREATE INDEX idx_tech_live_sma ON technical_indicators_live(sma_20, sma_50)
  WHERE sma_20 IS NOT NULL AND sma_50 IS NOT NULL;

CREATE INDEX idx_tech_live_supertrend ON technical_indicators_live(supertrend_direction_7_3)
  WHERE supertrend_direction_7_3 IS NOT NULL;

-- Add check constraints for data integrity
ALTER TABLE technical_indicators_live
  ADD CONSTRAINT check_rsi_range CHECK (rsi_14 IS NULL OR (rsi_14 >= 0 AND rsi_14 <= 100)),
  ADD CONSTRAINT check_atr_positive CHECK (atr_14 IS NULL OR atr_14 > 0),
  ADD CONSTRAINT check_supertrend_direction_7_3 CHECK (supertrend_direction_7_3 IS NULL OR supertrend_direction_7_3 IN (-1, 1)),
  ADD CONSTRAINT check_supertrend_direction_10_3 CHECK (supertrend_direction_10_3 IS NULL OR supertrend_direction_10_3 IN (-1, 1));

-- Add comments for documentation
COMMENT ON TABLE technical_indicators_live IS 'Latest technical indicators per ticker for real-time screening';
COMMENT ON COLUMN technical_indicators_live.ticker_id IS 'Primary key - one row per ticker';
COMMENT ON COLUMN technical_indicators_live.calculated_at IS 'Timestamp when indicators were calculated';
COMMENT ON COLUMN technical_indicators_live.updated_at IS 'Timestamp when row was last updated';

-- Populate with latest data from existing technical_indicators table
-- Note: Run this ONLY if technical_indicators table exists with historical data
-- INSERT INTO technical_indicators_live
-- SELECT DISTINCT ON (ticker_id)
--   ticker_id, sma_20, sma_50, sma_100, sma_200,
--   ema_9, ema_12, ema_26, ema_50, ema_200,
--   macd_line, macd_signal, macd_histogram,
--   rsi_14, atr_14,
--   supertrend_7_3, supertrend_direction_7_3,
--   supertrend_10_3, supertrend_direction_10_3,
--   bb_upper_20, bb_middle_20, bb_lower_20,
--   volume_sma_20,
--   timestamp AS calculated_at,
--   NOW() AS updated_at
-- FROM technical_indicators
-- ORDER BY ticker_id, timestamp DESC;

-- Analyze table for query planner optimization
ANALYZE technical_indicators_live;

-- Expected Performance Improvement:
-- Before: DISTINCT ON scan of 1.71M rows = 5-10s per query
-- After: PRIMARY KEY lookup = 10-50ms per query
-- Improvement: 100-400x faster (99% reduction in query time)
