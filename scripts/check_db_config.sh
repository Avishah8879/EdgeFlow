#!/bin/bash
# PostgreSQL Configuration and Resource Check Script
# Run this to diagnose current database state

echo "================================"
echo "PostgreSQL Health Check"
echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================"
echo ""

# Database connection settings (update these)
DB_HOST="${DB_HOST:-***REMOVED***}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-Tiphub}"
DB_USER="${DB_USER:-postgres}"

echo "Connecting to: $DB_HOST:$DB_PORT/$DB_NAME"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "ERROR: psql command not found. Please install PostgreSQL client."
    exit 1
fi

# Check if we can connect
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" &> /dev/null; then
    echo "ERROR: Cannot connect to PostgreSQL. Check credentials and network."
    exit 1
fi

echo "✅ Connection successful"
echo ""

# Run the comprehensive SQL check
echo "Running comprehensive configuration check..."
echo ""
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$(dirname "$0")/check_db_config.sql"

echo ""
echo "================================"
echo "Quick Summary"
echo "================================"

# Get critical values
MAX_CONN=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SHOW max_connections;" | tr -d ' ')
CURR_CONN=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT count(*) FROM pg_stat_activity;" | tr -d ' ')
SHARED_BUF=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SHOW shared_buffers;" | tr -d ' ')
WORK_MEM=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SHOW work_mem;" | tr -d ' ')

echo "max_connections:    $MAX_CONN (current: $CURR_CONN)"
echo "shared_buffers:     $SHARED_BUF"
echo "work_mem:           $WORK_MEM"
echo ""

# Check for critical issues
if [ "$CURR_CONN" -gt $((MAX_CONN * 80 / 100)) ]; then
    echo "⚠️  WARNING: Connection usage > 80% ($CURR_CONN / $MAX_CONN)"
fi

if [ "$MAX_CONN" -lt 400 ]; then
    echo "⚠️  WARNING: max_connections ($MAX_CONN) is below recommended 400"
fi

echo ""
echo "Full report saved to: db_health_$(date +%Y%m%d_%H%M%S).log"
