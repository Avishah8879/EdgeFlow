-- PostgreSQL Configuration Check Script
-- Run this to see current database configuration and resource usage

\echo '================================'
\echo 'PostgreSQL Configuration Check'
\echo '================================'
\echo ''

-- 1. PostgreSQL Version
\echo '1. PostgreSQL Version:'
SELECT version();
\echo ''

-- 2. Critical Memory Settings
\echo '2. Memory Configuration:'
SELECT
    name,
    setting,
    unit,
    context,
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
    'wal_buffers'
)
ORDER BY name;
\echo ''

-- 3. Connection Settings
\echo '3. Connection Configuration:'
SELECT
    name,
    setting,
    context
FROM pg_settings
WHERE name IN (
    'max_connections',
    'max_wal_senders',
    'max_replication_slots'
)
ORDER BY name;
\echo ''

-- 4. Current Active Connections
\echo '4. Current Database Connections:'
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

-- 5. Total Connections vs Max
\echo '5. Connection Usage:'
SELECT
    count(*) as current_connections,
    (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections,
    ROUND(100.0 * count(*) / (SELECT setting::int FROM pg_settings WHERE name = 'max_connections'), 2) as percent_used
FROM pg_stat_activity;
\echo ''

-- 6. Autovacuum Settings
\echo '6. Autovacuum Configuration:'
SELECT
    name,
    setting,
    context
FROM pg_settings
WHERE name LIKE 'autovacuum%'
ORDER BY name;
\echo ''

-- 7. Database Size
\echo '7. Database Size:'
SELECT
    datname,
    pg_size_pretty(pg_database_size(datname)) AS size
FROM pg_database
WHERE datname IN ('Tiphub', 'Tiphub_auth')
ORDER BY pg_database_size(datname) DESC;
\echo ''

-- 8. Table Sizes (Top 10)
\echo '8. Top 10 Largest Tables:'
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

-- 9. Table Bloat (Dead Rows)
\echo '9. Table Bloat Analysis:'
SELECT
    schemaname,
    tablename,
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

-- 10. Checkpoint & WAL Settings
\echo '10. Checkpoint & WAL Configuration:'
SELECT
    name,
    setting,
    unit,
    context
FROM pg_settings
WHERE name IN (
    'checkpoint_completion_target',
    'wal_buffers',
    'min_wal_size',
    'max_wal_size',
    'checkpoint_timeout'
)
ORDER BY name;
\echo ''

-- 11. Query Performance Settings
\echo '11. Query Planner Settings:'
SELECT
    name,
    setting,
    unit
FROM pg_settings
WHERE name IN (
    'random_page_cost',
    'effective_io_concurrency',
    'default_statistics_target'
)
ORDER BY name;
\echo ''

-- 12. Long-Running Queries
\echo '12. Long-Running Queries (> 30 seconds):'
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

-- 13. Unused Indexes (Potential Waste)
\echo '13. Unused Indexes (0 scans):'
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(schemaname||'.'||indexname)) AS size,
    idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
  AND indexrelid::regclass::text NOT LIKE '%_pkey'
ORDER BY pg_relation_size(schemaname||'.'||indexname) DESC
LIMIT 10;
\echo ''

-- 14. TimescaleDB Hypertable Info (if applicable)
\echo '14. TimescaleDB Hypertables:'
SELECT
    hypertable_name,
    num_chunks,
    pg_size_pretty(total_bytes) AS total_size,
    pg_size_pretty(compressed_total_bytes) AS compressed_size,
    ROUND(100.0 * compressed_total_bytes / NULLIF(total_bytes, 0), 2) AS compression_ratio_pct
FROM timescaledb_information.hypertables h
LEFT JOIN timescaledb_information.compressed_hypertable_stats c ON h.hypertable_name = c.hypertable_name
ORDER BY total_bytes DESC;
\echo ''

\echo '================================'
\echo 'Configuration Check Complete'
\echo '================================'
