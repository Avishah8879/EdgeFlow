#!/bin/bash
#
# PostgreSQL Database Health Monitoring Script
# Runs daily health check and logs results
#
# Schedule: Daily at 6:00 AM IST via cron
# Cron: 0 6 * * * /path/to/Tiphub/scripts/db_health_monitor.sh
#
# Author: Database Tuning Implementation
# Date: December 2025

# Database connection settings (load from environment or use defaults)
DB_HOST="${DB_HOST:-***REMOVED***}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-Tiphub}"
DB_USER="${DB_USER:-postgres}"

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Log directory and file
LOG_DIR="/var/log/tiphub"
TIMESTAMP=$(date '+%Y%m%d')
LOG_FILE="${LOG_DIR}/db_health_${TIMESTAMP}.log"

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR" 2>/dev/null || {
    # Fallback to project logs directory if /var/log/tiphub is not writable
    LOG_DIR="${PROJECT_DIR}/logs"
    mkdir -p "$LOG_DIR"
    LOG_FILE="${LOG_DIR}/db_health_${TIMESTAMP}.log"
}

echo "================================" | tee -a "$LOG_FILE"
echo "Database Health Check: $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG_FILE"
echo "================================" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "ERROR: psql command not found. Please install PostgreSQL client." | tee -a "$LOG_FILE"
    exit 1
fi

# Run health check SQL
echo "Running health check queries..." | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "${SCRIPT_DIR}/db_health_check.sql" >> "$LOG_FILE" 2>&1; then
    echo "ERROR: Health check failed" | tee -a "$LOG_FILE"
    exit 1
fi

echo "" | tee -a "$LOG_FILE"
echo "================================" | tee -a "$LOG_FILE"
echo "Quick Summary" | tee -a "$LOG_FILE"
echo "================================" | tee -a "$LOG_FILE"

# Get critical values
LTP_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM ltp_live;" 2>/dev/null | tr -d ' ')
DB_SIZE=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT pg_size_pretty(pg_database_size('Tiphub'));" 2>/dev/null | tr -d ' ')
CONN_USED=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT count(*) FROM pg_stat_activity;" 2>/dev/null | tr -d ' ')
MAX_CONN=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SHOW max_connections;" 2>/dev/null | tr -d ' ')

echo "ltp_live rows:      $LTP_COUNT" | tee -a "$LOG_FILE"
echo "Database size:      $DB_SIZE" | tee -a "$LOG_FILE"
echo "Connections:        $CONN_USED / $MAX_CONN" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Alert if ltp_live has > 10M rows (should be ~9M for 2 trading days with current volume)
if [ ! -z "$LTP_COUNT" ] && [ "$LTP_COUNT" -gt 10000000 ]; then
    echo "⚠️  WARNING: ltp_live has $LTP_COUNT rows (expected ~9M for 2 trading days)" | tee -a "$LOG_FILE"
fi

# Alert if connection usage > 80%
if [ ! -z "$CONN_USED" ] && [ ! -z "$MAX_CONN" ] && [ "$CONN_USED" -gt $((MAX_CONN * 80 / 100)) ]; then
    echo "⚠️  WARNING: Connection usage > 80% ($CONN_USED / $MAX_CONN)" | tee -a "$LOG_FILE"
fi

echo "" | tee -a "$LOG_FILE"
echo "Full report saved to: $LOG_FILE" | tee -a "$LOG_FILE"
echo "================================" | tee -a "$LOG_FILE"

exit 0
