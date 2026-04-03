-- Migration 009: Add Chart-Related Fields to Saved Backtest Results
-- This migration adds columns for storing chart visualization data
-- so the saved results page can display the same chart as the Alpha Gen page
-- without recalculating values on the frontend.

-- Add train_end_date column (string date for train/test split marker)
ALTER TABLE saved_backtest_results
ADD COLUMN IF NOT EXISTS train_end_date VARCHAR(50);

-- Add train_end_index column (integer index for the split point)
ALTER TABLE saved_backtest_results
ADD COLUMN IF NOT EXISTS train_end_index INTEGER;

-- Add max_drawdown_point column (JSONB for date + value of max DD)
ALTER TABLE saved_backtest_results
ADD COLUMN IF NOT EXISTS max_drawdown_point JSONB;

-- Add comments for documentation
COMMENT ON COLUMN saved_backtest_results.train_end_date IS 'Date string marking the end of training period (70/30 split)';
COMMENT ON COLUMN saved_backtest_results.train_end_index IS 'Index in equity_curve array marking the train/test split';
COMMENT ON COLUMN saved_backtest_results.max_drawdown_point IS 'JSONB with date and value of maximum drawdown point in training period';
