"""
Price Pattern Detector - candle and price-action recognition.

This module is read-only: it scans existing OHLC data and returns UI-ready
signals for gap, candle strength, consecutive candle, day high/low, and
previous-day breakout/breakdown patterns.
"""

import logging
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

PRICE_PATTERN_TYPES = {
    'Gap Up',
    'Gap Down',
    'Strong Bullish Candle',
    'Strong Bearish Candle',
    'Consecutive Green Candles',
    'Consecutive Red Candles',
    'Near Day High',
    'Near Day Low',
    'Breakout above Previous Day High',
    'Breakdown below Previous Day Low',
}


def scan_price_patterns(
    conn,
    pattern_filter: str = 'all',
    timeframe: str = '1D',
    min_confidence: int = 70,
    symbol_filter: Optional[str] = None,
    max_tickers: int = 200,
) -> List[Dict]:
    tickers = _get_tickers(conn, symbol_filter, max_tickers)
    if not tickers:
        return []

    db_timeframe, days_back, limit = _timeframe_params(timeframe)
    start_date = datetime.now() - timedelta(days=days_back)

    detectors = _selected_detectors(pattern_filter)
    results: List[Dict] = []

    for ticker in tickers:
        try:
            ohlc = _fetch_ohlc(conn, ticker['ticker_id'], db_timeframe, start_date, limit)
            if len(ohlc) < 2:
                continue

            for detector_name, detector_fn in detectors.items():
                result = detector_fn(ohlc)
                if not result or result['confidence'] < min_confidence:
                    continue

                result.update({
                    'id': str(uuid.uuid4())[:8],
                    'symbol': ticker['symbol'],
                    'companyName': ticker['company_name'],
                })
                results.append(result)
        except Exception as exc:
            logger.debug("Price pattern scan failed for %s: %s", ticker.get('symbol'), exc)

    results.sort(key=lambda item: item['confidence'], reverse=True)
    return results


def _timeframe_params(timeframe: str):
    if timeframe == '1D':
        return '1day', 10, 10
    if timeframe == '5D':
        return '1day', 15, 15
    if timeframe == '3M':
        return '1day', 120, 200
    return '1day', 45, 80


def _selected_detectors(pattern_filter: str):
    detectors = {
        'Gap Up': _detect_gap_up,
        'Gap Down': _detect_gap_down,
        'Strong Bullish Candle': _detect_strong_bullish_candle,
        'Strong Bearish Candle': _detect_strong_bearish_candle,
        'Consecutive Green Candles': _detect_consecutive_green,
        'Consecutive Red Candles': _detect_consecutive_red,
        'Near Day High': _detect_near_day_high,
        'Near Day Low': _detect_near_day_low,
        'Breakout above Previous Day High': _detect_breakout_prev_high,
        'Breakdown below Previous Day Low': _detect_breakdown_prev_low,
    }
    if pattern_filter == 'all':
        return detectors
    if pattern_filter in detectors:
        return {pattern_filter: detectors[pattern_filter]}
    return detectors


def _get_tickers(conn, symbol_filter: Optional[str], limit: int) -> List[Dict]:
    cursor = conn.cursor()
    try:
        params = []
        where = """
            WHERE t.is_active = true
              AND (t.suffix IS NULL OR t.suffix = '-EQ')
        """
        if symbol_filter:
            where += " AND (UPPER(t.symbol) LIKE %s OR UPPER(COALESCE(sf.long_name, t.name, '')) LIKE %s)"
            search = f"%{symbol_filter.upper()}%"
            params.extend([search, search])

        query = f"""
            SELECT t.id as ticker_id, t.symbol, COALESCE(sf.long_name, t.name) as company_name
            FROM tickers t
            LEFT JOIN stock_fundamentals sf ON sf.ticker_id = t.id
            {where}
            ORDER BY COALESCE(sf.market_cap, 0) DESC, t.symbol ASC
            LIMIT %s
        """
        params.append(limit)
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [{'ticker_id': row[0], 'symbol': row[1], 'company_name': row[2] or row[1]} for row in rows]
    except Exception as exc:
        logger.error("Error fetching price pattern tickers: %s", exc)
        return []
    finally:
        cursor.close()


def _fetch_ohlc(conn, ticker_id: int, timeframe: str, start_date: datetime, limit: int) -> List[Dict]:
    from db_timeframe_accessor import TimeframeDataAccessor

    accessor = TimeframeDataAccessor(conn)
    return accessor.fetch_ohlc(
        ticker_id,
        timeframe=timeframe,
        start_date=start_date,
        limit=limit,
    )


def _valid_candles(ohlc: List[Dict]) -> List[Dict]:
    return [
        row for row in ohlc
        if row.get('open') is not None
        and row.get('high') is not None
        and row.get('low') is not None
        and row.get('close') is not None
    ]


def _latest_pair(ohlc: List[Dict]):
    candles = _valid_candles(ohlc)
    if len(candles) < 2:
        return None, None
    return candles[-2], candles[-1]


def _detected_at(candle: Dict) -> str:
    ts = candle.get('timestamp')
    if hasattr(ts, 'strftime'):
        return ts.strftime('%Y-%m-%d')
    return str(ts)[:10]


def _make_result(pattern_type: str, confidence: int, direction: str, detected_at: str, description: str) -> Dict:
    return {
        'patternType': pattern_type,
        'confidence': max(50, min(98, int(confidence))),
        'detectedAt': detected_at,
        'direction': direction,
        'signalStrength': max(50, min(98, int(confidence))),
        'description': description,
    }


def _detect_gap_up(ohlc: List[Dict]) -> Optional[Dict]:
    prev, latest = _latest_pair(ohlc)
    if not prev or not latest or not prev['close']:
        return None
    gap = (latest['open'] - prev['close']) / prev['close']
    if gap < 0.002:
        return None
    confidence = 65 + min(gap * 3000, 30)
    return _make_result('Gap Up', confidence, 'bullish', _detected_at(latest), f"Open gapped {gap:.2%} above the previous close.")


def _detect_gap_down(ohlc: List[Dict]) -> Optional[Dict]:
    prev, latest = _latest_pair(ohlc)
    if not prev or not latest or not prev['close']:
        return None
    gap = (prev['close'] - latest['open']) / prev['close']
    if gap < 0.002:
        return None
    confidence = 65 + min(gap * 3000, 30)
    return _make_result('Gap Down', confidence, 'bearish', _detected_at(latest), f"Open gapped {gap:.2%} below the previous close.")


def _detect_strong_bullish_candle(ohlc: List[Dict]) -> Optional[Dict]:
    latest = _valid_candles(ohlc)[-1] if _valid_candles(ohlc) else None
    if not latest:
        return None
    candle_range = latest['high'] - latest['low']
    body = latest['close'] - latest['open']
    if candle_range <= 0 or body <= 0:
        return None
    body_ratio = body / candle_range
    close_position = (latest['close'] - latest['low']) / candle_range
    if body_ratio < 0.55 or close_position < 0.7:
        return None
    confidence = 55 + body_ratio * 25 + close_position * 18
    return _make_result('Strong Bullish Candle', confidence, 'bullish', _detected_at(latest), f"Wide bullish body covers {body_ratio:.0%} of the candle range.")


def _detect_strong_bearish_candle(ohlc: List[Dict]) -> Optional[Dict]:
    latest = _valid_candles(ohlc)[-1] if _valid_candles(ohlc) else None
    if not latest:
        return None
    candle_range = latest['high'] - latest['low']
    body = latest['open'] - latest['close']
    if candle_range <= 0 or body <= 0:
        return None
    body_ratio = body / candle_range
    close_position = (latest['high'] - latest['close']) / candle_range
    if body_ratio < 0.55 or close_position < 0.7:
        return None
    confidence = 55 + body_ratio * 25 + close_position * 18
    return _make_result('Strong Bearish Candle', confidence, 'bearish', _detected_at(latest), f"Wide bearish body covers {body_ratio:.0%} of the candle range.")


def _detect_consecutive_green(ohlc: List[Dict]) -> Optional[Dict]:
    candles = _valid_candles(ohlc)[-5:]
    streak = _ending_streak(candles, lambda row: row['close'] > row['open'])
    if streak < 3:
        return None
    confidence = 62 + min(streak * 7, 30)
    return _make_result('Consecutive Green Candles', confidence, 'bullish', _detected_at(candles[-1]), f"{streak} consecutive bullish candles detected.")


def _detect_consecutive_red(ohlc: List[Dict]) -> Optional[Dict]:
    candles = _valid_candles(ohlc)[-5:]
    streak = _ending_streak(candles, lambda row: row['close'] < row['open'])
    if streak < 3:
        return None
    confidence = 62 + min(streak * 7, 30)
    return _make_result('Consecutive Red Candles', confidence, 'bearish', _detected_at(candles[-1]), f"{streak} consecutive bearish candles detected.")


def _ending_streak(candles: List[Dict], predicate) -> int:
    streak = 0
    for row in reversed(candles):
        if not predicate(row):
            break
        streak += 1
    return streak


def _detect_near_day_high(ohlc: List[Dict]) -> Optional[Dict]:
    candles = _valid_candles(ohlc)
    if not candles:
        return None
    latest = candles[-1]
    day_high = latest['high']
    if day_high <= 0:
        return None
    distance = (day_high - latest['close']) / day_high
    if distance > 0.003:
        return None
    confidence = 88 - distance * 5000
    return _make_result('Near Day High', confidence, 'bullish', _detected_at(latest), f"Latest close is within {distance:.2%} of the session high.")


def _detect_near_day_low(ohlc: List[Dict]) -> Optional[Dict]:
    candles = _valid_candles(ohlc)
    if not candles:
        return None
    latest = candles[-1]
    day_low = latest['low']
    if latest['close'] <= 0:
        return None
    distance = (latest['close'] - day_low) / latest['close']
    if distance > 0.003:
        return None
    confidence = 88 - distance * 5000
    return _make_result('Near Day Low', confidence, 'bearish', _detected_at(latest), f"Latest close is within {distance:.2%} of the session low.")


def _detect_breakout_prev_high(ohlc: List[Dict]) -> Optional[Dict]:
    prev, latest = _latest_pair(ohlc)
    if not prev or not latest or prev['high'] <= 0:
        return None
    breakout = (latest['close'] - prev['high']) / prev['high']
    if breakout < 0:
        return None
    confidence = 70 + min(breakout * 2500, 25)
    return _make_result('Breakout above Previous Day High', confidence, 'bullish', _detected_at(latest), f"Latest close is {breakout:.2%} above the previous candle high.")


def _detect_breakdown_prev_low(ohlc: List[Dict]) -> Optional[Dict]:
    prev, latest = _latest_pair(ohlc)
    if not prev or not latest or prev['low'] <= 0:
        return None
    breakdown = (prev['low'] - latest['close']) / prev['low']
    if breakdown < 0:
        return None
    confidence = 70 + min(breakdown * 2500, 25)
    return _make_result('Breakdown below Previous Day Low', confidence, 'bearish', _detected_at(latest), f"Latest close is {breakdown:.2%} below the previous candle low.")
