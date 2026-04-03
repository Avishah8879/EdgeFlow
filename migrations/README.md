# Database Migrations for Tiphub Optimization

This directory contains SQL migration scripts to optimize the Tiphub database for 10,000 concurrent users.

## Database Connection

**Target Database:** finviz_market_data @ 164.52.193.222:5432
**Credentials:** See main.py (DB_CONFIG)

## Migration Scripts

### 001_convert_technical_indicators_live.sql
**Purpose:** Convert `technical_indicators_live` from MATERIALIZED VIEW to TABLE with PRIMARY KEY
**Impact:** 100-400x faster indicator queries (5-10s → 10-50ms)
**Risk:** LOW - Drops materialized view, creates new table
**Downtime:** None (CONCURRENTLY used for indexes)

**Before Running:**
- Verify `technical_indicators` table exists (for data population)
- Backup materialized view if needed: `pg_dump -t technical_indicators_live > backup.sql`

**To Execute:**
```bash
psql -h 164.52.193.222 -p 5432 -U your_user -d finviz_market_data -f 001_convert_technical_indicators_live.sql
```

### 002_optimize_ltp_live.sql
**Purpose:** Add composite indexes for "latest per ticker" queries
**Impact:** 15x faster LTP lookups (1,500ms → 100ms for 30 stocks)
**Risk:** VERY LOW - Only adds indexes, no data changes
**Downtime:** None (CONCURRENTLY used)

**Note:** Current table has 2.24M rows (73x larger than expected). Consider implementing EOD cleanup job to reduce to 30K rows.

**To Execute:**
```bash
psql -h 164.52.193.222 -p 5432 -U your_user -d finviz_market_data -f 002_optimize_ltp_live.sql
```

### 003_add_critical_indexes.sql
**Purpose:** Add covering and partial indexes for stock queries
**Impact:** 3-4x faster stock page loads (700ms → 200ms)
**Risk:** VERY LOW - Only adds indexes
**Downtime:** None (CONCURRENTLY used)
**Storage:** +10 MB additional index storage

**Indexes Created:**
- Covering index for market cap sorting
- Partial indexes for Large/Mid/Small cap filters
- GIN index for full-text ticker search
- Composite index for market movers

**To Execute:**
```bash
psql -h 164.52.193.222 -p 5432 -U your_user -d finviz_market_data -f 003_add_critical_indexes.sql
```

## Execution Order

**IMPORTANT:** Run migrations in sequential order:
1. 001_convert_technical_indicators_live.sql
2. 002_optimize_ltp_live.sql
3. 003_add_critical_indexes.sql

## Rollback Procedures

### Rollback 001 (Restore Materialized View)
```sql
-- Drop table
DROP TABLE IF EXISTS technical_indicators_live CASCADE;

-- Restore materialized view (if you have backup)
\i backup.sql
```

### Rollback 002 (Drop LTP Indexes)
```sql
DROP INDEX CONCURRENTLY IF EXISTS idx_ltp_live_ticker_ts;
DROP INDEX CONCURRENTLY IF EXISTS idx_ltp_live_symbol;
```

### Rollback 003 (Drop All Indexes)
```sql
DROP INDEX CONCURRENTLY IF EXISTS idx_stocks_market_cap_price;
DROP INDEX CONCURRENTLY IF EXISTS idx_stocks_large_cap;
DROP INDEX CONCURRENTLY IF EXISTS idx_stocks_mid_cap;
DROP INDEX CONCURRENTLY IF EXISTS idx_stocks_small_cap;
DROP INDEX CONCURRENTLY IF EXISTS idx_tickers_search;
DROP INDEX CONCURRENTLY IF EXISTS idx_tickers_symbol;
DROP INDEX CONCURRENTLY IF EXISTS idx_tickers_active;
DROP INDEX CONCURRENTLY IF EXISTS idx_market_movers_category_rank;
```

## Verification

### Verify Migration 001
```sql
-- Check table exists with PRIMARY KEY
\d technical_indicators_live

-- Verify row count
SELECT COUNT(*) FROM technical_indicators_live;

-- Check indexes
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'technical_indicators_live';
```

### Verify Migration 002
```sql
-- Check indexes exist
SELECT indexname FROM pg_indexes
WHERE tablename = 'ltp_live' AND indexname LIKE 'idx_ltp_live%';

-- Check index usage (after some queries)
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE tablename = 'ltp_live';
```

### Verify Migration 003
```sql
-- Check all indexes exist
SELECT indexname FROM pg_indexes
WHERE tablename IN ('stock_fundamentals', 'tickers', 'market_movers_live')
  AND indexname LIKE 'idx_%';

-- Check index sizes
SELECT indexname, pg_size_pretty(pg_relation_size(indexname::regclass))
FROM pg_indexes
WHERE tablename IN ('stock_fundamentals', 'tickers')
  AND indexname LIKE 'idx_%';
```

## Expected Performance Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Stock Detail Load | 10-15s | <1s | **93% faster** |
| Expert Screener | 20-180s | <500ms | **99% faster** |
| Stocks Page Load | 700ms | 200ms | **3.5x faster** |
| LTP Bulk Query | 1,500ms | 100ms | **15x faster** |
| Ticker Search | 500ms | 10ms | **50x faster** |

## Monitoring

After running migrations, monitor query performance:

```sql
-- Check slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Check table bloat
SELECT schemaname, tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## Next Steps

After running these migrations:

1. **Implement Redis caching** - See pre_aws_changes.md Section 5
2. **Set up EOD cleanup job** - Reduce ltp_live from 2.24M to 30K rows
3. **Deploy to EC2** - See aws_changes.md for deployment guide
4. **Load testing** - Verify 10K concurrent user capacity

## Support

If you encounter any issues:
1. Check PostgreSQL logs: `/var/log/postgresql/postgresql-*.log`
2. Verify connection: `psql -h 164.52.193.222 -p 5432 -U your_user -d finviz_market_data`
3. Check table locks: `SELECT * FROM pg_locks WHERE NOT granted;`
4. Review query plans: `EXPLAIN ANALYZE <your_query>;`
