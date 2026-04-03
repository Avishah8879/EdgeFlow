-- ================================================================
-- PERFORMANCE VERIFICATION FOR ADVANCED SCREENER
-- ================================================================
--
-- This file tests the performance of the advanced screener queries
-- after the database schema migration.
--
-- NEW SCHEMA (2025-11-15):
-- - technical_indicators → technical_indicators_live (ticker_id as PK)
-- - ltp_data_ohlc → ltp_live (one row per ticker)
-- - timeframe_data → ohlc_1hour (no timeframe column)
--
-- Expected results:
-- - Execution Time: 50-150ms (very fast with PK lookups)
-- - Index Scan on technical_indicators_live (ticker_id PK)
-- - Index Scan on ltp_live (symbol or ticker_id index)
-- ================================================================

-- Test 1: Verify all required indexes exist
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN (
    'technical_indicators_live',
    'ltp_live',
    'tickers',
    'stock_fundamentals'
)
ORDER BY tablename, indexname;

-- ================================================================
-- Test 2: Check index usage statistics
-- ================================================================
SELECT
    schemaname,
    relname as tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE relname IN (
    'technical_indicators_live',
    'ltp_live'
)
ORDER BY tablename, indexname;

-- ================================================================
-- Test 3: Test screener query performance (RSI < 30 example)
-- ================================================================
-- Should complete in <150ms with proper indexes (faster than before!)
-- No DISTINCT ON needed - ticker_id is PRIMARY KEY
EXPLAIN ANALYZE
SELECT
    t.id, t.symbol, t.name,
    sf.market_cap,
    ti.sma_20, ti.rsi_14,
    ltp.ltp, ltp.prev_close
FROM technical_indicators_live ti
JOIN tickers t ON t.id = ti.ticker_id
JOIN stock_fundamentals sf ON sf.ticker_id = t.id
JOIN ltp_live ltp ON ltp.ticker_id = t.id
WHERE t.is_active = true
  AND ti.rsi_14 < 30
  AND ltp.ltp IS NOT NULL
ORDER BY t.name ASC
LIMIT 50;

-- ================================================================
-- Test 4: Test default screener (all stocks with indicators)
-- ================================================================
-- Should complete in <100ms with proper indexes
EXPLAIN ANALYZE
SELECT COUNT(*) as total
FROM technical_indicators_live ti
JOIN tickers t ON t.id = ti.ticker_id
JOIN stock_fundamentals sf ON sf.ticker_id = t.id
JOIN ltp_live ltp ON ltp.ticker_id = t.id
WHERE t.is_active = true
  AND ltp.ltp IS NOT NULL;

-- ================================================================
-- Test 5: Test search query performance
-- ================================================================
-- Should complete in <150ms with proper indexes
EXPLAIN ANALYZE
SELECT
    t.symbol, t.name,
    ti.rsi_14,
    ltp.ltp
FROM technical_indicators_live ti
JOIN tickers t ON t.id = ti.ticker_id
JOIN ltp_live ltp ON ltp.ticker_id = t.id
WHERE t.is_active = true
  AND (t.symbol ILIKE '%RELIANCE%' OR t.name ILIKE '%RELIANCE%')
  AND ltp.ltp IS NOT NULL
ORDER BY t.name ASC
LIMIT 50;

-- ================================================================
-- Test 6: Test market movers performance (new simplified schema)
-- ================================================================
-- Should complete in <50ms with category index
EXPLAIN ANALYZE
SELECT *
FROM market_movers_live
WHERE category = 'GAINER'
ORDER BY rank ASC
LIMIT 10;

-- ================================================================
-- Test 7: Test OHLC historical data query
-- ================================================================
-- Should complete in <200ms with ticker_id, ts index
EXPLAIN ANALYZE
SELECT
    ticker_id,
    ts,
    open,
    high,
    low,
    close,
    volume
FROM ohlc_1hour
WHERE ticker_id = (SELECT id FROM tickers WHERE symbol = 'RELIANCE' LIMIT 1)
  AND ts >= NOW() - INTERVAL '30 days'
ORDER BY ts DESC
LIMIT 100;

-- ================================================================
-- EXPECTED OUTPUT ANALYSIS
-- ================================================================
--
-- For Tests 3-7, look for these indicators in EXPLAIN ANALYZE:
--
-- GOOD SIGNS (Fast Query):
-- - "Index Scan using technical_indicators_live_pkey" or similar PK scan
-- - "Index Scan using idx_ltp_live_ticker_id" or "idx_ltp_live_symbol"
-- - "Index Scan using idx_market_movers_live_composite"
-- - Execution Time: < 200ms
-- - No "Seq Scan" on main tables
--
-- BAD SIGNS (Slow Query):
-- - "Seq Scan on technical_indicators_live"
-- - "Seq Scan on ltp_live"
-- - "Seq Scan on market_movers_live"
-- - Execution Time: > 500ms
-- - "external merge" in Sort operations
--
-- If you see BAD SIGNS, the indexes are missing or not being used.
-- Run: ANALYZE technical_indicators_live;
-- Run: ANALYZE ltp_live;
-- Run: ANALYZE market_movers_live;
-- Then retry the queries.
--
-- ================================================================
-- NOTES
-- ================================================================
--
-- 1. The new schema eliminates DISTINCT ON queries entirely!
--    technical_indicators_live and ltp_live both use ticker_id
--    as the unique identifier, making queries 2-3x faster.
--
-- 2. Expected performance improvements vs old schema:
--    - Old schema (DISTINCT ON): 150-300ms per query
--    - New schema (direct PK): 50-150ms per query (2-3x faster!)
--
-- 3. Empty tables (technical_indicators_live, ohlc_1min_intraday):
--    These queries will return 0 rows until data is populated.
--    This is expected and NOT an error.
--
-- 4. If queries are still slow after adding indexes, check:
--    - Table statistics: SELECT * FROM pg_stat_user_tables WHERE relname = 'technical_indicators_live';
--    - Index usage: SELECT * FROM pg_stat_user_indexes WHERE relname = 'ltp_live';
--    - Autovacuum status: SELECT * FROM pg_stat_activity WHERE query LIKE '%autovacuum%';
--
-- 5. Performance bottleneck hierarchy (fix in this order):
--    a) Missing indexes (run database_indexes.sql)
--    b) Stale statistics (run ANALYZE on tables)
--    c) Bloated tables (run VACUUM FULL if needed)
--    d) Connection pool exhaustion (increase pool size)
--
-- ================================================================
