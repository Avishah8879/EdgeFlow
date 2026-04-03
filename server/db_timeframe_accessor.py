"""
TimeframeDataAccessor - Optimized accessor for historical OHLC data

Queries TimescaleDB hypertables and continuous aggregates for compressed historical price data:
- ohlc_1hour: 5-year hourly data (compressed after 7 days)
- ohlc_1min_intraday: Current day 1-minute data (1-day retention policy)
- ohlc_daily: Daily aggregates (continuous aggregate, 10-year retention)
- ohlc_weekly: Weekly aggregates (continuous aggregate, 20-year retention)
- ohlc_monthly: Monthly aggregates (continuous aggregate, indefinite retention)

Table schema: ticker_id, ts/day/week/month (timestamp), open, high, low, close, volume
"""

import logging
import hashlib
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from market_hours import get_current_ist_time

# Redis caching for OHLC data (optional - graceful fallback if not available)
try:
    from redis_client import get_cached, get_cached_bulk, set_cached, TTL_OHLC_DATA
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    TTL_OHLC_DATA = 300  # 5 minutes default

    def get_cached_bulk(keys):
        return {}

logger = logging.getLogger(__name__)


class TimeframeDataAccessor:
    """
    Optimized accessor for historical OHLC data with TimescaleDB hypertables and continuous aggregates.

    Supports five timeframes:
    - 1min: Intraday 1-minute data (current day only)
    - 1hour: Historical hourly data (up to 5 years)
    - 1day: Daily aggregates (up to 10 years)
    - 1week: Weekly aggregates (up to 20 years)
    - 1month: Monthly aggregates (indefinite retention)
    """

    # Direct table mapping - no detection needed
    TIMEFRAME_TABLES = {
        '1min': 'ohlc_1min_intraday',       # Current day only, 1-day retention
        '1hour': 'ohlc_1hour',              # Historical 5 years, compressed
        '1day': 'ohlc_daily',               # Daily continuous aggregate, 10 years
        '1week': 'ohlc_weekly',             # Weekly continuous aggregate, 20 years
        '1month': 'ohlc_monthly',           # Monthly continuous aggregate, indefinite
    }

    # Timestamp column name for each timeframe
    TIMEFRAME_TS_COLUMN = {
        '1min': 'ts',
        '1hour': 'ts',
        '1day': 'day',
        '1week': 'week',
        '1month': 'month',
    }

    def __init__(self, conn):
        """
        Initialize accessor with database connection.

        Args:
            conn: psycopg2 connection object
        """
        self.conn = conn
        # Note: Removed verbose initialization logging (was called 60+ times per screener run)

    def get_table_for_timeframe(self, timeframe: str) -> Optional[str]:
        """
        Get the table name for a given timeframe.

        Args:
            timeframe: '1min' or '1hour'

        Returns:
            Table name or None if not available
        """
        return self.TIMEFRAME_TABLES.get(timeframe)

    def fetch_ohlc(
        self,
        ticker_id: int,
        timeframe: str = '1hour',
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: Optional[int] = None
    ) -> List[Dict]:
        """
        Fetch OHLC data for a ticker in specified timeframe.

        Args:
            ticker_id: ID of the ticker
            timeframe: '1min', '1hour', '1day', '1week', or '1month'
            start_date: Optional start date filter
            end_date: Optional end date filter
            limit: Optional limit on number of rows

        Returns:
            List of dicts with keys: timestamp, open, high, low, close, volume

        Raises:
            ValueError: If timeframe not available
        """
        table_name = self.get_table_for_timeframe(timeframe)

        if not table_name:
            available = ', '.join(self.TIMEFRAME_TABLES.keys())
            raise ValueError(
                f"Timeframe '{timeframe}' not available. "
                f"Available timeframes: {available}"
            )

        # Get the correct timestamp column for this timeframe
        ts_column = self.TIMEFRAME_TS_COLUMN.get(timeframe, 'ts')

        cursor = self.conn.cursor()

        # Build query (using correct timestamp column for each timeframe)
        query = f"""
            SELECT
                {ts_column} as timestamp,
                open,
                high,
                low,
                close,
                volume
            FROM {table_name}
            WHERE ticker_id = %s
        """

        params = [ticker_id]

        # For 1min intraday, automatically filter to current day only (IST)
        if timeframe == '1min':
            # Ensure we only get current day data in IST timezone
            if not start_date:
                start_date = get_current_ist_time().replace(hour=0, minute=0, second=0, microsecond=0)

        # Add date filters if provided
        if start_date:
            query += f" AND {ts_column} >= %s"
            params.append(start_date)

        if end_date:
            query += f" AND {ts_column} <= %s"
            params.append(end_date)

        # Order by timestamp
        query += f" ORDER BY {ts_column} ASC"

        # Add limit if provided
        if limit:
            query += " LIMIT %s"
            params.append(limit)

        try:
            cursor.execute(query, params)
            results = cursor.fetchall()

            # Convert to list of dicts
            data = []
            for row in results:
                data.append({
                    'timestamp': row[0],
                    'open': float(row[1]) if row[1] is not None else None,
                    'high': float(row[2]) if row[2] is not None else None,
                    'low': float(row[3]) if row[3] is not None else None,
                    'close': float(row[4]) if row[4] is not None else None,
                    'volume': int(row[5]) if row[5] is not None else None
                })

            cursor.close()
            return data

        except Exception as e:
            cursor.close()
            logger.error(f"Error fetching OHLC data for ticker {ticker_id}, timeframe {timeframe}: {e}")
            raise

    def fetch_latest_close(self, ticker_id: int, timeframe: str = '1hour') -> Optional[float]:
        """
        Fetch the most recent closing price for a ticker.

        Args:
            ticker_id: ID of the ticker
            timeframe: Timeframe to query (default: '1hour')

        Returns:
            Latest close price or None if not found
        """
        table_name = self.get_table_for_timeframe(timeframe)

        if not table_name:
            logger.warning(f"Timeframe '{timeframe}' not available for fetch_latest_close")
            return None

        # Get the correct timestamp column for this timeframe
        ts_column = self.TIMEFRAME_TS_COLUMN.get(timeframe, 'ts')

        cursor = self.conn.cursor()

        query = f"""
            SELECT close
            FROM {table_name}
            WHERE ticker_id = %s
            ORDER BY {ts_column} DESC
            LIMIT 1
        """

        try:
            cursor.execute(query, [ticker_id])
            result = cursor.fetchone()
            cursor.close()

            return float(result[0]) if result and result[0] is not None else None

        except Exception as e:
            cursor.close()
            logger.error(f"Error fetching latest close for ticker {ticker_id}: {e}")
            return None

    def _make_ohlc_ticker_cache_key(self, ticker_id: int, timeframe: str, limit: int) -> str:
        """Generate Redis cache key for a single ticker's OHLC data."""
        return f"ohlc:{ticker_id}:{timeframe}:{limit}"

    def _make_ohlc_cache_key(self, ticker_ids: List[int], timeframe: str, limit: Optional[int]) -> str:
        """Generate Redis cache key for OHLC bulk fetch (legacy, for backwards compat)."""
        # Sort ticker_ids for consistent hashing
        sorted_ids = sorted(ticker_ids)
        # Create hash of ticker IDs (to handle large lists)
        ids_str = ','.join(map(str, sorted_ids))
        ids_hash = hashlib.md5(ids_str.encode()).hexdigest()[:12]
        return f"ohlc_bulk:{timeframe}:{limit}:{ids_hash}"

    def fetch_ohlc_bulk(
        self,
        ticker_ids: List[int],
        timeframe: str = '1hour',
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: Optional[int] = None,
        use_cache: bool = True
    ) -> Dict[int, List[Dict]]:
        """
        Fetch OHLC data for multiple tickers in a single query (optimized for screener).

        Uses Redis caching for repeated queries (5-minute TTL).

        Args:
            ticker_ids: List of ticker IDs to fetch
            timeframe: '1min', '1hour', '1day', '1week', or '1month'
            start_date: Optional start date filter
            end_date: Optional end date filter
            limit: Optional limit on number of rows PER TICKER
            use_cache: Whether to use Redis cache (default True)

        Returns:
            Dict mapping ticker_id to list of OHLC dicts
            {123: [{'timestamp': ..., 'open': ..., ...}, ...], 456: [...]}

        Raises:
            ValueError: If timeframe not available or no ticker IDs provided
        """
        if not ticker_ids:
            raise ValueError("At least one ticker_id must be provided")

        table_name = self.get_table_for_timeframe(timeframe)

        if not table_name:
            available = ', '.join(self.TIMEFRAME_TABLES.keys())
            raise ValueError(
                f"Timeframe '{timeframe}' not available. "
                f"Available timeframes: {available}"
            )

        # Per-ticker caching: Check Redis for each ticker using bulk MGET
        # This ensures cache hits work regardless of batch sizes
        cached_data = {}
        missing_ticker_ids = []

        if use_cache and REDIS_AVAILABLE and limit and not start_date and not end_date:
            # Build cache keys for all tickers
            cache_keys = [self._make_ohlc_ticker_cache_key(tid, timeframe, limit) for tid in ticker_ids]

            # Bulk fetch from Redis (single MGET call)
            cached_by_key = get_cached_bulk(cache_keys)

            # Map cached data back to ticker IDs and find missing ones
            for tid in ticker_ids:
                cache_key = self._make_ohlc_ticker_cache_key(tid, timeframe, limit)
                if cache_key in cached_by_key:
                    cached_data[tid] = cached_by_key[cache_key]
                else:
                    missing_ticker_ids.append(tid)

            if cached_data:
                logger.info(f"[CACHE HIT] {len(cached_data)}/{len(ticker_ids)} tickers from Redis (bulk)")

            # If all tickers were cached, return immediately
            if not missing_ticker_ids:
                return cached_data
        else:
            missing_ticker_ids = list(ticker_ids)

        # Get the correct timestamp column for this timeframe
        ts_column = self.TIMEFRAME_TS_COLUMN.get(timeframe, 'ts')

        cursor = self.conn.cursor()

        # Build query for ONLY missing tickers (not already in cache)
        query = f"""
            SELECT
                ticker_id,
                {ts_column} as timestamp,
                open,
                high,
                low,
                close,
                volume
            FROM {table_name}
            WHERE ticker_id = ANY(%s)
        """

        params = [missing_ticker_ids]

        # For 1min intraday, automatically filter to current day only (IST)
        if timeframe == '1min':
            if not start_date:
                start_date = get_current_ist_time().replace(hour=0, minute=0, second=0, microsecond=0)

        # Add date filters if provided
        if start_date:
            query += f" AND {ts_column} >= %s"
            params.append(start_date)

        if end_date:
            query += f" AND {ts_column} <= %s"
            params.append(end_date)

        # Order by ticker_id and timestamp for efficient grouping
        query += f" ORDER BY ticker_id, {ts_column} ASC"

        # If limit is specified, use LATERAL JOIN (much faster than window function)
        if limit:
            query = f"""
                SELECT t.ticker_id, sub.timestamp, sub.open, sub.high, sub.low, sub.close, sub.volume
                FROM (SELECT unnest(%s::int[]) AS ticker_id) t
                CROSS JOIN LATERAL (
                    SELECT
                        {ts_column} as timestamp,
                        open,
                        high,
                        low,
                        close,
                        volume
                    FROM {table_name}
                    WHERE ticker_id = t.ticker_id
                    {f"AND {ts_column} >= %s" if start_date else ""}
                    {f"AND {ts_column} <= %s" if end_date else ""}
                    ORDER BY {ts_column} DESC
                    LIMIT %s
                ) sub
                ORDER BY t.ticker_id, sub.timestamp ASC
            """
            params.append(limit)

        try:
            # Set statement timeout to 60 seconds to prevent hanging
            logger.info(f"[OHLC] Executing query for {len(missing_ticker_ids)} tickers (timeout: 60s)...")
            cursor.execute("SET statement_timeout = '60s'")
            cursor.execute(query, params)
            logger.info(f"[OHLC] Query completed, fetching results...")
            results = cursor.fetchall()
            logger.info(f"[OHLC] Fetched {len(results)} rows")
            # Reset timeout for subsequent queries on this connection
            cursor.execute("SET statement_timeout = '0'")

            # Group results by ticker_id
            data_by_ticker = {}
            for row in results:
                ticker_id = row[0]
                if ticker_id not in data_by_ticker:
                    data_by_ticker[ticker_id] = []

                # Convert timestamp to ISO string for JSON serialization
                ts = row[1]
                ts_str = ts.isoformat() if hasattr(ts, 'isoformat') else str(ts)

                data_by_ticker[ticker_id].append({
                    'timestamp': ts_str,
                    'open': float(row[2]) if row[2] is not None else None,
                    'high': float(row[3]) if row[3] is not None else None,
                    'low': float(row[4]) if row[4] is not None else None,
                    'close': float(row[5]) if row[5] is not None else None,
                    'volume': int(row[6]) if row[6] is not None else None
                })

            cursor.close()
            logger.info(f"Fetched OHLC data for {len(data_by_ticker)} tickers in timeframe {timeframe}")

            # Cache each ticker individually in Redis
            if use_cache and REDIS_AVAILABLE and limit and not start_date and not end_date and data_by_ticker:
                for tid, ticker_data in data_by_ticker.items():
                    cache_key = self._make_ohlc_ticker_cache_key(tid, timeframe, limit)
                    set_cached(cache_key, ticker_data, TTL_OHLC_DATA)
                logger.info(f"[CACHE SET] {len(data_by_ticker)} tickers cached individually (TTL: {TTL_OHLC_DATA}s)")

            # Merge cached data with newly fetched data
            result = {**cached_data, **data_by_ticker}
            return result

        except Exception as e:
            cursor.close()
            logger.error(f"Error fetching bulk OHLC data for {len(missing_ticker_ids)} tickers, timeframe {timeframe}: {e}")
            raise

    def get_available_timeframes(self) -> List[str]:
        """
        Get list of available timeframes.

        Returns:
            List of timeframe strings: ['1min', '1hour', '1day', '1week', '1month']
        """
        return list(self.TIMEFRAME_TABLES.keys())

    def get_table_info(self) -> Dict:
        """
        Get information about available tables and timeframes.

        Returns:
            Dict with available timeframes and table mappings
        """
        return {
            'available_timeframes': self.get_available_timeframes(),
            'table_mappings': self.TIMEFRAME_TABLES.copy(),
            'timestamp_columns': self.TIMEFRAME_TS_COLUMN.copy(),
            'timescaledb_enabled': True,
            'compression_enabled': {
                'ohlc_1min_intraday': False,  # No compression (1-day retention)
                'ohlc_1hour': True,           # Compressed after 7 days
                'ohlc_daily': True,           # Continuous aggregate, compressed after 30 days
                'ohlc_weekly': True,          # Continuous aggregate, compressed after 90 days
                'ohlc_monthly': False         # Continuous aggregate, no compression needed
            },
            'retention_policies': {
                'ohlc_1min_intraday': '1 day',
                'ohlc_1hour': '5 years',
                'ohlc_daily': '10 years',
                'ohlc_weekly': '20 years',
                'ohlc_monthly': 'indefinite'
            },
            'aggregate_types': {
                'ohlc_1min_intraday': 'hypertable',
                'ohlc_1hour': 'hypertable',
                'ohlc_daily': 'continuous_aggregate',
                'ohlc_weekly': 'continuous_aggregate',
                'ohlc_monthly': 'continuous_aggregate'
            }
        }
