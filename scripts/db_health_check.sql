-- PostgreSQL Database Health Check SQL Script
-- Run this to monitor database health metrics
-- Author: Database Tuning Implementation
-- Date: December 2025

\echo '================================'
\echo 'Database Health Check'
\echo '================================'
\echo ''

-- 1. ltp_live Table Statistics
\echo '1. ltp_live Table Health:'
SELECT
    COUNT(*) as row_count,
    pg_size_pretty(pg_total_relation_size('public.ltp_live')) as total_size,
    pg_size_pretty(pg_relation_size('public.ltp_live')) as table_size,
    pg_size_pretty(pg_total_relation_size('public.ltp_live') - pg_relation_size('public.ltp_live')) as indexes_size,
    MIN(timestamp) as oldest_data,
    MAX(timestamp) as newest_data,
    COUNT(DISTINCT DATE(timestamp)) as days_of_data,
    COUNT(DISTINCT ticker_id) as ticker_count
FROM ltp_live;
\echo ''

-- 2. Database Size
\echo '2. Database Size:'
SELECT
    pg_database.datname,
    pg_size_pretty(pg_database_size(pg_database.datname)) AS size
FROM pg_database
WHERE datname IN ('Tiphub', 'Tiphub_auth')
ORDER BY pg_database_size(pg_database.datname) DESC;
\echo ''

-- 3. Top 10 Largest Tables
\echo '3. Top 10 Largest Tables:'
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;
\echo ''

-- 4. Table Bloat (Dead Rows)
\echo '4. Table Bloat Analysis (Top 10):'
SELECT
    schemaname,
    tablename as relname,
    n_live_tup AS live_rows,
    n_dead_tup AS dead_rows,
    ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_pct,
    last_vacuum,
    last_autovacuum
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_live_tup + n_dead_tup > 0
ORDER BY n_dead_tup DESC
LIMIT 10;
\echo ''

-- 5. Connection Usage
\echo '5. Connection Usage:'
SELECT
    count(*) as current_connections,
    (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections,
    ROUND(100.0 * count(*) / (SELECT setting::int FROM pg_settings WHERE name = 'max_connections'), 2) as percent_used
FROM pg_stat_activity;
\echo ''

-- 6. Active Connections by Database
\echo '6. Active Connections by Database:'
SELECT
    datname,
    count(*) as connections,
    count(*) FILTER (WHERE state = 'active') as active,
    count(*) FILTER (WHERE state = 'idle') as idle,
    count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
FROM pg_stat_activity
WHERE datname IS NOT NULL
GROUP BY datname
ORDER BY connections DESC;
\echo ''

-- 7. Long-Running Queries (> 30 seconds)
\echo '7. Long-Running Queries (> 30 seconds):'
SELECT
    pid,
    now() - query_start AS duration,
    state,
    LEFT(query, 100) AS query
FROM pg_stat_activity
WHERE state != 'idle'
  AND query_start < NOW() - INTERVAL '30 seconds'
ORDER BY duration DESC;
\echo ''

-- 8. Memory Configuration
\echo '8. Memory Configuration:'
SELECT
    name,
    setting,
    unit,
    CASE
        WHEN unit = '8kB' THEN pg_size_pretty((setting::bigint * 8192))
        WHEN unit = 'kB' THEN pg_size_pretty((setting::bigint * 1024))
        ELSE setting || COALESCE(unit, '')
    END AS formatted_value
FROM pg_settings
WHERE name IN (
    'shared_buffers',
    'effective_cache_size',
    'work_mem',
    'maintenance_work_mem',
    'max_connections'
)
ORDER BY name;
\echo ''

\echo '================================'
\echo 'Health Check Complete'
\echo '================================'
