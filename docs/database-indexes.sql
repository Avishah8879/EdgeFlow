-- Database Performance Optimization Indexes
-- Run these commands on your PostgreSQL database to dramatically improve query performance
-- For the Stocks API (/api/stocks endpoint)

-- ================================================================
-- CRITICAL INDEXES FOR STOCKS PAGE PERFORMANCE
-- ================================================================

-- 1. Index on stock_fundamentals.current_price (used in WHERE clause filter)
-- This is the most selective filter - speeds up initial filtering
CREATE INDEX IF NOT EXISTS idx_stock_fundamentals_current_price
ON stock_fundamentals(current_price)
WHERE current_price IS NOT NULL AND current_price > 0;

-- 2. Index on stock_fundamentals.market_cap (used for filtering and sorting)
-- Covers Large/Mid/Small cap filtering and ORDER BY
CREATE INDEX IF NOT EXISTS idx_stock_fundamentals_market_cap
ON stock_fundamentals(market_cap DESC NULLS LAST)
WHERE market_cap IS NOT NULL;

-- 3. Composite index for JOIN optimization
-- Speeds up the INNER JOIN between tickers and stock_fundamentals
CREATE INDEX IF NOT EXISTS idx_stock_fundamentals_ticker_id
ON stock_fundamentals(ticker_id);

-- 4. Index on tickers.symbol for sorting and search
-- Helps with ORDER BY t.symbol and ILIKE searches
CREATE INDEX IF NOT EXISTS idx_tickers_symbol
ON tickers(symbol);

-- Enable trigram extension FIRST (required for text search index)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 5. Text search index for symbol/name searches (GIN index for faster ILIKE)
-- Dramatically speeds up search functionality
CREATE INDEX IF NOT EXISTS idx_tickers_symbol_name_gin
ON tickers USING gin(symbol gin_trgm_ops, name gin_trgm_ops);

-- ================================================================
-- ADDITIONAL INDEXES FOR OTHER FEATURES
-- ================================================================

-- 6. Index on tickers for market_movers_live queries
CREATE INDEX IF NOT EXISTS idx_market_movers_live_composite
ON market_movers_live(category, rank, snapshot_time DESC);

-- 7. Index on ohlc_1hour for chart queries
CREATE INDEX IF NOT EXISTS idx_ohlc_1hour_composite
ON ohlc_1hour(ticker_id, ts DESC);

-- ================================================================
-- INDEXES FOR REAL-TIME LTP DATA (ltp_live)
-- ================================================================

-- 8. Fast ticker lookup for real-time LTP queries
-- Used by /api/stock-ltp/{symbol} endpoint
-- Note: ticker_id is PRIMARY KEY, so this index may be redundant
CREATE INDEX IF NOT EXISTS idx_ltp_live_ticker_id
ON ltp_live(ticker_id);

-- 9. Fast symbol lookup for direct symbol queries
-- Used by LTPDataAccessor.get_ltp_by_symbol()
CREATE INDEX IF NOT EXISTS idx_ltp_live_symbol
ON ltp_live(symbol);

-- 10. Timestamp index for time-based queries
-- Partial index for today's data only (cleared EOD)
CREATE INDEX IF NOT EXISTS idx_ltp_live_timestamp
ON ltp_live(timestamp DESC)
WHERE timestamp > NOW() - INTERVAL '1 day';

-- ================================================================
-- INDEXES FOR TECHNICAL INDICATORS (ADVANCED SCREENER)
-- ================================================================

-- 11. CRITICAL: Fast lookup for indicator values
-- Note: ticker_id is PRIMARY KEY, so direct lookups are already optimized
-- Used by advanced screener queries
CREATE INDEX IF NOT EXISTS idx_technical_indicators_live_ticker_id
ON technical_indicators_live(ticker_id);

-- 12. Index on calculated_at for timestamp-based filtering
-- Speeds up queries that filter by indicator calculation time
CREATE INDEX IF NOT EXISTS idx_technical_indicators_live_calculated_at
ON technical_indicators_live(calculated_at DESC);

-- ================================================================
-- ANALYZE TABLES AFTER INDEX CREATION
-- ================================================================

ANALYZE tickers;
ANALYZE stock_fundamentals;
ANALYZE market_movers_live;
ANALYZE ohlc_1hour;
ANALYZE ohlc_1min_intraday;
ANALYZE ltp_live;
ANALYZE technical_indicators_live;

-- ================================================================
-- VERIFY INDEXES
-- ================================================================

-- Run this query to see all indexes on stock_fundamentals table:
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'stock_fundamentals';

-- Run this query to see all indexes on tickers table:
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'tickers';

-- ================================================================
-- PERFORMANCE TESTING QUERY
-- ================================================================

-- Test the optimized query performance:
-- EXPLAIN ANALYZE
-- SELECT
--     t.id, t.symbol, t.name, t.exchange, t.sector, t.industry,
--     sf.current_price, sf.previous_close, sf.market_cap,
--     sf.trailing_pe, sf.forward_pe, sf.price_to_book,
--     sf.fifty_two_week_high, sf.fifty_two_week_low,
--     COUNT(*) OVER() as total_count
-- FROM tickers t
-- INNER JOIN stock_fundamentals sf ON t.id = sf.ticker_id
-- WHERE sf.current_price IS NOT NULL
--   AND sf.current_price > 0
--   AND sf.market_cap > 200000000000
-- ORDER BY sf.market_cap DESC NULLS LAST, t.symbol ASC
-- LIMIT 30 OFFSET 0;

-- ================================================================
-- NOTES
-- ================================================================
--
-- Expected Performance Improvements:
-- - Without indexes: 2-5 seconds per query
-- - With indexes: 50-200ms per query (10-50x faster!)
--
-- The window function COUNT(*) OVER() adds minimal overhead (~10-20ms)
-- but eliminates the need for a separate COUNT query.
--
-- Ordering by market_cap DESC puts largest companies first,
-- which is more useful than alphabetical ordering.
