"""
LTP 2-Day Retention Cleanup Script

Deletes ltp_live data older than 2 trading days.
Runs daily at 5:30 PM IST to maintain rolling 2-day window.

Schedule: Daily at 5:30 PM IST via cron
Cron: 30 17 * * * cd /path/to/Tiphub && /usr/bin/python3 server/cron/ltp_2day_retention_cleanup.py

Author: Database Tuning Implementation
Date: December 2025
"""

import sys
import os
from datetime import datetime
from pathlib import Path

# Add parent directories to Python path
script_dir = Path(__file__).resolve().parent
server_dir = script_dir.parent
project_dir = server_dir.parent
sys.path.insert(0, str(server_dir))
sys.path.insert(0, str(project_dir))

import psycopg2
from psycopg2.extras import DictCursor
from server.nse_trading_calendar import get_retention_cutoff_date, IST_TIMEZONE

# Database configuration (load from environment)
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "***REMOVED***"),
    "port": int(os.getenv("DB_PORT", "5432")),
    "database": os.getenv("DB_NAME", "Tiphub"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", ""),
}

# Retention configuration
RETENTION_DAYS = 2  # Keep 2 trading days of data


def log_message(message: str, level: str = "INFO"):
    """
    Log message with timestamp.

    Args:
        message: Message to log
        level: Log level (INFO, WARNING, ERROR)
    """
    timestamp = datetime.now(IST_TIMEZONE).strftime("%Y-%m-%d %H:%M:%S %Z")
    print(f"[{timestamp}] [{level}] {message}")


def get_db_connection():
    """
    Create database connection.

    Returns:
        psycopg2 connection object
    """
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        log_message(f"Failed to connect to database: {e}", "ERROR")
        raise


def get_table_stats(conn) -> dict:
    """
    Get current ltp_live table statistics.

    Args:
        conn: Database connection

    Returns:
        Dictionary with table statistics
    """
    cursor = conn.cursor(cursor_factory=DictCursor)

    # Get row count and size
    cursor.execute("""
        SELECT
            COUNT(*) as row_count,
            pg_size_pretty(pg_total_relation_size('public.ltp_live')) as total_size,
            pg_size_pretty(pg_relation_size('public.ltp_live')) as table_size,
            pg_size_pretty(pg_total_relation_size('public.ltp_live') - pg_relation_size('public.ltp_live')) as indexes_size
        FROM ltp_live;
    """)
    stats = dict(cursor.fetchone())

    # Get data span
    cursor.execute("""
        SELECT
            MIN(timestamp) as oldest_timestamp,
            MAX(timestamp) as newest_timestamp,
            COUNT(DISTINCT DATE(timestamp)) as days_of_data,
            COUNT(DISTINCT ticker_id) as ticker_count
        FROM ltp_live;
    """)
    span = dict(cursor.fetchone())

    stats.update(span)
    cursor.close()

    return stats


def cleanup_old_data(conn, cutoff_datetime: datetime) -> int:
    """
    Delete data older than cutoff datetime.

    Args:
        conn: Database connection
        cutoff_datetime: Cutoff timestamp (data older than this will be deleted)

    Returns:
        Number of rows deleted
    """
    cursor = conn.cursor()

    # Count rows to be deleted
    cursor.execute("""
        SELECT COUNT(*) FROM ltp_live
        WHERE timestamp < %s;
    """, (cutoff_datetime,))
    rows_to_delete = cursor.fetchone()[0]

    if rows_to_delete == 0:
        log_message("No rows to delete (all data is within retention window)")
        cursor.close()
        return 0

    log_message(f"Deleting {rows_to_delete:,} rows older than {cutoff_datetime}")

    # Delete old data
    cursor.execute("""
        DELETE FROM ltp_live
        WHERE timestamp < %s;
    """, (cutoff_datetime,))

    rows_deleted = cursor.rowcount
    conn.commit()
    cursor.close()

    return rows_deleted


def run_vacuum(conn):
    """
    Run VACUUM ANALYZE to reclaim space and update statistics.

    Args:
        conn: Database connection
    """
    log_message("Running VACUUM ANALYZE on ltp_live...")

    # Need to close transaction for VACUUM
    conn.commit()
    old_isolation_level = conn.isolation_level
    conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)

    cursor = conn.cursor()
    cursor.execute("VACUUM ANALYZE ltp_live;")
    cursor.close()

    # Restore isolation level
    conn.set_isolation_level(old_isolation_level)

    log_message("VACUUM ANALYZE completed")


def main():
    """
    Main cleanup routine.
    """
    log_message("=" * 60)
    log_message("LTP 2-Day Retention Cleanup - Starting")
    log_message("=" * 60)

    try:
        # Calculate cutoff date
        cutoff_datetime = get_retention_cutoff_date(retention_days=RETENTION_DAYS)
        log_message(f"Retention: {RETENTION_DAYS} trading days")
        log_message(f"Cutoff timestamp: {cutoff_datetime.strftime('%Y-%m-%d %H:%M:%S %Z')}")
        log_message(f"Data older than {cutoff_datetime.date()} will be deleted")

        # Connect to database
        log_message("Connecting to database...")
        conn = get_db_connection()
        log_message(f"Connected to {DB_CONFIG['database']} @ {DB_CONFIG['host']}")

        # Get stats before cleanup
        log_message("\nTable Statistics BEFORE Cleanup:")
        stats_before = get_table_stats(conn)
        log_message(f"  Rows: {stats_before['row_count']:,}")
        log_message(f"  Total Size: {stats_before['total_size']}")
        log_message(f"  Table Size: {stats_before['table_size']}")
        log_message(f"  Indexes Size: {stats_before['indexes_size']}")
        log_message(f"  Data Span: {stats_before['oldest_timestamp']} to {stats_before['newest_timestamp']}")
        log_message(f"  Days of Data: {stats_before['days_of_data']}")
        log_message(f"  Tickers: {stats_before['ticker_count']:,}")

        # Cleanup old data
        log_message("\nExecuting Cleanup...")
        rows_deleted = cleanup_old_data(conn, cutoff_datetime)

        if rows_deleted > 0:
            log_message(f"Deleted {rows_deleted:,} rows ({rows_deleted / stats_before['row_count'] * 100:.1f}% of total)")

            # Run VACUUM to reclaim space
            run_vacuum(conn)

            # Get stats after cleanup
            log_message("\nTable Statistics AFTER Cleanup:")
            stats_after = get_table_stats(conn)
            log_message(f"  Rows: {stats_after['row_count']:,}")
            log_message(f"  Total Size: {stats_after['total_size']}")
            log_message(f"  Table Size: {stats_after['table_size']}")
            log_message(f"  Indexes Size: {stats_after['indexes_size']}")
            log_message(f"  Data Span: {stats_after['oldest_timestamp']} to {stats_after['newest_timestamp']}")
            log_message(f"  Days of Data: {stats_after['days_of_data']}")

            # Calculate space savings
            log_message("\nSpace Savings:")
            rows_removed = stats_before['row_count'] - stats_after['row_count']
            log_message(f"  Rows Removed: {rows_removed:,} ({rows_removed / stats_before['row_count'] * 100:.1f}%)")
        else:
            log_message("\nNo cleanup needed - all data within retention window")

        # Close connection
        conn.close()
        log_message("\nDatabase connection closed")

        log_message("=" * 60)
        log_message("LTP 2-Day Retention Cleanup - Completed Successfully")
        log_message("=" * 60)

        return 0

    except Exception as e:
        log_message(f"Cleanup failed: {e}", "ERROR")
        log_message("=" * 60)
        log_message("LTP 2-Day Retention Cleanup - FAILED", "ERROR")
        log_message("=" * 60)
        return 1


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
