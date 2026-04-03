"""
LTPDataAccessor - Optimized accessor for real-time tick data

Queries the ltp_live table for sub-5ms response times.
Table schema (v2): id (PK), ticker_id (indexed), symbol, exchange, token, ltp, open, high, low, close,
                   percent_change, trade_volume, lower_circuit, upper_circuit, week_52_low, week_52_high, timestamp (indexed)

Multiple records per ticker with different timestamps - queries use DISTINCT ON to get latest.
Cleared End Of Day (EOD) for fresh intraday data.
"""

import logging
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class LTPDataAccessor:
    """
    Optimized accessor for real-time LTP data.

    Uses the ltp_live table with indexed ticker_id and timestamp columns.
    DISTINCT ON queries ensure only the latest record per ticker is returned.
    """

    TABLE_NAME = 'ltp_live'

    def __init__(self, conn):
        """
        Initialize accessor with database connection.

        Args:
            conn: psycopg2 connection object
        """
        self.conn = conn
        self.ltp_table = self.TABLE_NAME  # Backwards compatibility
        logger.info(f"LTPDataAccessor initialized (table: {self.TABLE_NAME})")

    def get_latest_ltp(self, ticker_id: int) -> Optional[Dict]:
        """
        Fetch the latest LTP data for a single ticker.

        Args:
            ticker_id: ID of the ticker

        Returns:
            Dict with keys: ticker_id, symbol, exchange, token, ltp, open, high, low, close,
                           percent_change, trade_volume, lower_circuit, upper_circuit,
                           week_52_low, week_52_high, timestamp
            Returns None if ticker not found
        """
        cursor = self.conn.cursor()

        query = f"""
            SELECT
                ticker_id,
                symbol,
                exchange,
                token,
                ltp,
                open,
                high,
                low,
                close,
                percent_change,
                trade_volume,
                lower_circuit,
                upper_circuit,
                week_52_low,
                week_52_high,
                timestamp
            FROM {self.TABLE_NAME}
            WHERE ticker_id = %s
            ORDER BY timestamp DESC
            LIMIT 1
        """

        try:
            cursor.execute(query, [ticker_id])
            result = cursor.fetchone()
            cursor.close()

            if not result:
                return None

            return {
                'ticker_id': result[0],
                'symbol': result[1],
                'exchange': result[2],
                'token': result[3],
                'ltp': float(result[4]) if result[4] is not None else None,
                'open': float(result[5]) if result[5] is not None else None,
                'high': float(result[6]) if result[6] is not None else None,
                'low': float(result[7]) if result[7] is not None else None,
                'close': float(result[8]) if result[8] is not None else None,
                'percent_change': float(result[9]) if result[9] is not None else None,
                'trade_volume': result[10],
                'lower_circuit': float(result[11]) if result[11] is not None else None,
                'upper_circuit': float(result[12]) if result[12] is not None else None,
                'week_52_low': float(result[13]) if result[13] is not None else None,
                'week_52_high': float(result[14]) if result[14] is not None else None,
                'timestamp': result[15]
            }

        except Exception as e:
            cursor.close()
            logger.error(f"Error fetching latest LTP for ticker {ticker_id}: {e}")
            return None

    def get_latest_ltps(self, ticker_ids: List[int]) -> List[Dict]:
        """
        Fetch the latest LTP data for multiple tickers (batch operation).

        Args:
            ticker_ids: List of ticker IDs

        Returns:
            List of dicts with LTP data (same format as get_latest_ltp)
        """
        if not ticker_ids:
            return []

        cursor = self.conn.cursor()

        # Use DISTINCT ON to get only the latest record per ticker
        query = f"""
            SELECT DISTINCT ON (ticker_id)
                ticker_id,
                symbol,
                exchange,
                token,
                ltp,
                open,
                high,
                low,
                close,
                percent_change,
                trade_volume,
                lower_circuit,
                upper_circuit,
                week_52_low,
                week_52_high,
                timestamp
            FROM {self.TABLE_NAME}
            WHERE ticker_id = ANY(%s)
            ORDER BY ticker_id, timestamp DESC
        """

        try:
            cursor.execute(query, [ticker_ids])
            results = cursor.fetchall()
            cursor.close()

            data = []
            for row in results:
                data.append({
                    'ticker_id': row[0],
                    'symbol': row[1],
                    'exchange': row[2],
                    'token': row[3],
                    'ltp': float(row[4]) if row[4] is not None else None,
                    'open': float(row[5]) if row[5] is not None else None,
                    'high': float(row[6]) if row[6] is not None else None,
                    'low': float(row[7]) if row[7] is not None else None,
                    'close': float(row[8]) if row[8] is not None else None,
                    'percent_change': float(row[9]) if row[9] is not None else None,
                    'trade_volume': row[10],
                    'lower_circuit': float(row[11]) if row[11] is not None else None,
                    'upper_circuit': float(row[12]) if row[12] is not None else None,
                    'week_52_low': float(row[13]) if row[13] is not None else None,
                    'week_52_high': float(row[14]) if row[14] is not None else None,
                    'timestamp': row[15]
                })

            return data

        except Exception as e:
            cursor.close()
            logger.error(f"Error fetching latest LTPs: {e}")
            return []

    def get_all_ltps(self, limit: Optional[int] = None) -> List[Dict]:
        """
        Fetch the latest LTP data for all available tickers.

        Args:
            limit: Optional limit on number of results

        Returns:
            List of dicts with LTP data
        """
        cursor = self.conn.cursor()

        # Use DISTINCT ON to get only the latest record per ticker
        query = f"""
            SELECT DISTINCT ON (ticker_id)
                ticker_id,
                symbol,
                exchange,
                token,
                ltp,
                open,
                high,
                low,
                close,
                percent_change,
                trade_volume,
                lower_circuit,
                upper_circuit,
                week_52_low,
                week_52_high,
                timestamp
            FROM {self.TABLE_NAME}
            ORDER BY ticker_id, timestamp DESC
        """

        if limit:
            query += f" LIMIT {int(limit)}"

        try:
            cursor.execute(query)
            results = cursor.fetchall()
            cursor.close()

            data = []
            for row in results:
                data.append({
                    'ticker_id': row[0],
                    'symbol': row[1],
                    'exchange': row[2],
                    'token': row[3],
                    'ltp': float(row[4]) if row[4] is not None else None,
                    'open': float(row[5]) if row[5] is not None else None,
                    'high': float(row[6]) if row[6] is not None else None,
                    'low': float(row[7]) if row[7] is not None else None,
                    'close': float(row[8]) if row[8] is not None else None,
                    'percent_change': float(row[9]) if row[9] is not None else None,
                    'trade_volume': row[10],
                    'lower_circuit': float(row[11]) if row[11] is not None else None,
                    'upper_circuit': float(row[12]) if row[12] is not None else None,
                    'week_52_low': float(row[13]) if row[13] is not None else None,
                    'week_52_high': float(row[14]) if row[14] is not None else None,
                    'timestamp': row[15]
                })

            return data

        except Exception as e:
            cursor.close()
            logger.error(f"Error fetching all LTPs: {e}")
            return []

    def get_ltp_by_symbol(self, symbol: str) -> Optional[Dict]:
        """
        Fetch the latest LTP data for a ticker by symbol.

        Args:
            symbol: Stock symbol (e.g., 'RELIANCE', 'TCS')

        Returns:
            Dict with LTP data or None if not found
        """
        cursor = self.conn.cursor()

        query = f"""
            SELECT
                ticker_id,
                symbol,
                exchange,
                token,
                ltp,
                open,
                high,
                low,
                close,
                percent_change,
                trade_volume,
                lower_circuit,
                upper_circuit,
                week_52_low,
                week_52_high,
                timestamp
            FROM {self.TABLE_NAME}
            WHERE symbol = %s
            ORDER BY timestamp DESC
            LIMIT 1
        """

        try:
            cursor.execute(query, [symbol])
            result = cursor.fetchone()
            cursor.close()

            if not result:
                return None

            return {
                'ticker_id': result[0],
                'symbol': result[1],
                'exchange': result[2],
                'token': result[3],
                'ltp': float(result[4]) if result[4] is not None else None,
                'open': float(result[5]) if result[5] is not None else None,
                'high': float(result[6]) if result[6] is not None else None,
                'low': float(result[7]) if result[7] is not None else None,
                'close': float(result[8]) if result[8] is not None else None,
                'percent_change': float(result[9]) if result[9] is not None else None,
                'trade_volume': result[10],
                'lower_circuit': float(result[11]) if result[11] is not None else None,
                'upper_circuit': float(result[12]) if result[12] is not None else None,
                'week_52_low': float(result[13]) if result[13] is not None else None,
                'week_52_high': float(result[14]) if result[14] is not None else None,
                'timestamp': result[15]
            }

        except Exception as e:
            cursor.close()
            logger.error(f"Error fetching LTP for symbol {symbol}: {e}")
            return None

    def calculate_change_percent(self, ltp_data: Dict) -> Optional[float]:
        """
        Get percentage change from LTP data.

        Args:
            ltp_data: Dict from get_latest_ltp or similar

        Returns:
            Percentage change or None if not available
        """
        if not ltp_data:
            return None

        # Return pre-computed percent_change from database
        return ltp_data.get('percent_change')

    def get_table_info(self) -> Dict:
        """
        Get information about the LTP table.

        Returns:
            Dict with table_name and schema info
        """
        return {
            'table_name': self.TABLE_NAME,
            'has_ohlc': True,
            'has_percent_change': True,
            'has_exchange': True,
            'has_token': True,
            'has_trade_volume': True,
            'has_circuit_limits': True,
            'has_52_week_range': True,
            'eod_cleared': True
        }
