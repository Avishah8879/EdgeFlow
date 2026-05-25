"""
Pattern Detector Module - Chart pattern recognition for stock price data.

Detects classic chart patterns using scipy pivot detection and geometric template matching:
- Head and Shoulders + Inverse Head and Shoulders
- Double Top / Double Bottom, Triple Top / Triple Bottom
- Ascending / Descending / Symmetric Triangle
- Bullish Flag / Bearish Flag, Pennant
- Cup and Handle
- Rising Wedge / Falling Wedge
- Ascending Channel / Descending Channel
- Rounding Top / Rounding Bottom

Uses ohlc_daily for longer timeframes (1M, 3M) and ohlc_1hour for shorter (1D, 5D).
"""

import logging
import uuid
import numpy as np
from scipy.signal import argrelextrema
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# Historical success rates from financial literature
PATTERN_SUCCESS_RATES = {
    'Head and Shoulders': 83,
    'Inverse Head and Shoulders': 83,
    'Double Top': 75,
    'Double Bottom': 78,
    'Triple Top': 79,
    'Triple Bottom': 79,
    'Ascending Triangle': 77,
    'Descending Triangle': 72,
    'Symmetric Triangle': 54,
    'Bullish Flag': 67,
    'Bearish Flag': 67,
    'Pennant': 65,
    'Cup and Handle': 61,
    'Rising Wedge': 68,
    'Falling Wedge': 68,
    'Ascending Channel': 73,
    'Descending Channel': 73,
    'Rounding Top': 65,
    'Rounding Bottom': 70,
}

PATTERN_DESCRIPTIONS = {
    'Head and Shoulders': 'A bearish reversal pattern with three peaks — the middle (head) is the highest, flanked by two lower peaks (shoulders). A break below the neckline confirms the reversal.',
    'Inverse Head and Shoulders': 'A bullish reversal pattern with three troughs — the middle (head) is the lowest, flanked by two higher troughs (shoulders). A break above the neckline confirms the reversal.',
    'Double Top': 'A bearish reversal pattern where price reaches a resistance level twice and fails to break through, forming an "M" shape.',
    'Double Bottom': 'A bullish reversal pattern where price tests a support level twice and bounces, forming a "W" shape.',
    'Triple Top': 'A bearish reversal pattern where price tests a resistance level three times and fails to break through.',
    'Triple Bottom': 'A bullish reversal pattern where price tests a support level three times and bounces each time.',
    'Ascending Triangle': 'A bullish continuation pattern with a flat resistance line and rising support (higher lows). Breakout is typically upward.',
    'Descending Triangle': 'A bearish continuation pattern with flat support and falling resistance (lower highs). Breakout is typically downward.',
    'Symmetric Triangle': 'A neutral consolidation pattern with converging trendlines (lower highs and higher lows). Can break in either direction.',
    'Bullish Flag': 'A bullish continuation pattern — a strong upward pole followed by a small downward-sloping consolidation channel before breakout.',
    'Bearish Flag': 'A bearish continuation pattern — a strong downward pole followed by a small upward-sloping consolidation channel before breakdown.',
    'Pennant': 'A continuation pattern — a small symmetric triangle forming after a strong price move (the pole). Breakout continues the prior trend.',
    'Cup and Handle': 'A bullish continuation pattern resembling a tea cup — a rounded bottom (cup) followed by a small downward drift (handle) before breakout.',
    'Rising Wedge': 'A bearish pattern where both trendlines slope upward but converge (lows rise faster than highs). Typically resolves to the downside.',
    'Falling Wedge': 'A bullish pattern where both trendlines slope downward but converge (highs fall faster than lows). Typically resolves to the upside.',
    'Ascending Channel': 'A bullish trend channel with two parallel rising trendlines containing price action. Breakouts above resistance signal continuation.',
    'Descending Channel': 'A bearish trend channel with two parallel falling trendlines containing price action. Breakdowns below support signal continuation.',
    'Rounding Top': 'A bearish reversal pattern showing a slow, gradual change from an uptrend to a downtrend — an inverted U shape.',
    'Rounding Bottom': 'A bullish reversal pattern showing a slow, gradual change from a downtrend to an uptrend — a U shape.',
}


def scan_patterns(
    conn,
    pattern_filter: str = 'all',
    timeframe: str = '1M',
    min_confidence: int = 70,
    max_tickers: int = 200,
) -> List[Dict]:
    """
    Scan top stocks for chart patterns.

    Args:
        conn: psycopg2 connection
        pattern_filter: 'all' or specific pattern name
        timeframe: '1D', '5D', '1M', '3M'
        min_confidence: minimum confidence threshold (50-100)
        max_tickers: max stocks to scan

    Returns:
        List of pattern dicts matching the frontend Pattern interface.
    """
    tickers = _get_top_tickers(conn, max_tickers)
    if not tickers:
        return []

    # Determine OHLC source and lookback
    # Use generous lookback to handle data gaps / non-trading days
    if timeframe in ('1D', '5D'):
        db_timeframe = '1hour'
        days_back = 3 if timeframe == '1D' else 10
        pivot_order = 2
    else:
        db_timeframe = '1day'
        days_back = 90 if timeframe == '1M' else 200
        pivot_order = 3

    start_date = datetime.now() - timedelta(days=days_back)

    # Determine which pattern detectors to run
    if pattern_filter == 'all':
        detectors = ALL_DETECTORS
    else:
        detectors = {k: v for k, v in ALL_DETECTORS.items() if k == pattern_filter}
        if not detectors:
            detectors = ALL_DETECTORS

    results = []

    for ticker in tickers:
        try:
            ohlc = _fetch_ohlc(conn, ticker['ticker_id'], db_timeframe, start_date)
            if not ohlc or len(ohlc) < 15:
                continue

            close = np.array([row['close'] for row in ohlc if row['close'] is not None])
            volume = np.array([row['volume'] for row in ohlc if row['volume'] is not None])
            timestamps = [str(row['timestamp']) for row in ohlc if row['close'] is not None]

            if len(close) < 15:
                continue

            highs_idx, lows_idx = _find_pivots(close, order=pivot_order)

            if len(highs_idx) < 2 and len(lows_idx) < 2:
                continue

            for pattern_name, detector_fn in detectors.items():
                try:
                    result = detector_fn(close, highs_idx, lows_idx, timestamps, volume)
                    if result and result['confidence'] >= min_confidence:
                        result['id'] = str(uuid.uuid4())[:8]
                        result['symbol'] = ticker['symbol']
                        result['companyName'] = ticker['company_name']
                        result['successRate'] = PATTERN_SUCCESS_RATES.get(pattern_name, 65)
                        if 'description' not in result or not result['description']:
                            result['description'] = PATTERN_DESCRIPTIONS.get(pattern_name, '')
                        results.append(result)
                except Exception as e:
                    logger.debug(f"Pattern {pattern_name} detection error for {ticker['symbol']}: {e}")

        except Exception as e:
            logger.debug(f"Error scanning {ticker['symbol']}: {e}")
            continue

    # Sort by confidence descending
    results.sort(key=lambda x: (x['endDate'], x['confidence']), reverse=True)
    return results


# =============================================================================
# Data helpers
# =============================================================================

def _get_top_tickers(conn, limit: int) -> List[Dict]:
    """Get top tickers by market cap for scanning."""
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT t.id as ticker_id, t.symbol, COALESCE(sf.long_name, t.name) as company_name
            FROM tickers t
            JOIN stock_fundamentals sf ON sf.ticker_id = t.id
            WHERE t.is_active = true
              AND (t.suffix IS NULL OR t.suffix = '-EQ')
              AND sf.market_cap IS NOT NULL
              AND sf.market_cap > 0
            ORDER BY sf.market_cap DESC
            LIMIT %s
        """, [limit])
        rows = cursor.fetchall()
        return [{'ticker_id': r[0], 'symbol': r[1], 'company_name': r[2] or r[1]} for r in rows]
    except Exception as e:
        logger.error(f"Error fetching top tickers: {e}")
        return []
    finally:
        cursor.close()


def _fetch_ohlc(conn, ticker_id: int, timeframe: str, start_date: datetime) -> List[Dict]:
    """Fetch OHLC data for a single ticker."""
    from db_timeframe_accessor import TimeframeDataAccessor
    accessor = TimeframeDataAccessor(conn)
    return accessor.fetch_ohlc(ticker_id, timeframe=timeframe, start_date=start_date)


def _find_pivots(close: np.ndarray, order: int = 5) -> Tuple[np.ndarray, np.ndarray]:
    """Find local maxima and minima in price series."""
    highs_idx = argrelextrema(close, np.greater_equal, order=order)[0]
    lows_idx = argrelextrema(close, np.less_equal, order=order)[0]
    return highs_idx, lows_idx


def _linear_slope(values: np.ndarray) -> float:
    """Calculate normalized linear regression slope."""
    if len(values) < 2:
        return 0.0
    x = np.arange(len(values))
    coeffs = np.polyfit(x, values, 1)
    return coeffs[0] / np.mean(values)  # normalized by mean price


def _format_date(ts_str: str) -> str:
    """Format timestamp to YYYY-MM-DD."""
    try:
        dt = datetime.fromisoformat(str(ts_str).replace('Z', '+00:00'))
        return dt.strftime('%Y-%m-%d')
    except Exception:
        return str(ts_str)[:10]


def _kp(idx: int, close: np.ndarray, timestamps: List[str], label: str, price: Optional[float] = None) -> Dict:
    """Build a key-point dict {ts, price, label} used by the frontend to draw pattern shapes."""
    i = int(idx)
    return {
        'ts': _format_date(timestamps[i]),
        'price': float(price if price is not None else close[i]),
        'label': label,
    }


# =============================================================================
# Pattern detectors
# =============================================================================

def _detect_head_and_shoulders(
    close: np.ndarray,
    highs_idx: np.ndarray,
    lows_idx: np.ndarray,
    timestamps: List[str],
    volume: np.ndarray,
) -> Optional[Dict]:
    """Head and Shoulders: 3 peaks, middle highest, roughly equal shoulders."""
    if len(highs_idx) < 3 or len(lows_idx) < 2:
        return None

    best = None
    best_conf = 0

    for i in range(len(highs_idx) - 2):
        left_idx = highs_idx[i]
        head_idx = highs_idx[i + 1]
        right_idx = highs_idx[i + 2]

        left_p = close[left_idx]
        head_p = close[head_idx]
        right_p = close[right_idx]

        # Head must be highest
        if head_p <= left_p or head_p <= right_p:
            continue

        # Shoulders within 15% of each other
        shoulder_diff = abs(left_p - right_p) / max(left_p, right_p)
        if shoulder_diff > 0.15:
            continue

        # Find troughs between the peaks for neckline
        troughs_between = lows_idx[(lows_idx > left_idx) & (lows_idx < right_idx)]
        if len(troughs_between) < 1:
            continue

        neckline_prices = close[troughs_between]
        neckline_flatness = 1.0 - min(np.std(neckline_prices) / np.mean(neckline_prices) * 10, 1.0)

        symmetry = 1.0 - shoulder_diff
        head_prominence = (head_p - max(left_p, right_p)) / head_p

        # Volume confirmation: volume should decrease from left shoulder to right
        vol_score = 0.5
        if len(volume) > right_idx:
            left_vol = np.mean(volume[max(0, left_idx - 2):left_idx + 3])
            right_vol = np.mean(volume[max(0, right_idx - 2):right_idx + 3])
            if left_vol > 0 and right_vol < left_vol:
                vol_score = min(1.0, (left_vol - right_vol) / left_vol + 0.5)

        confidence = int(symmetry * 30 + neckline_flatness * 25 + min(head_prominence * 200, 25) + vol_score * 20)
        confidence = max(50, min(98, confidence))

        if confidence > best_conf:
            best_conf = confidence
            best = {
                'patternType': 'Head and Shoulders',
                'confidence': confidence,
                'startDate': _format_date(timestamps[left_idx]),
                'endDate': _format_date(timestamps[right_idx]),
                'breakoutDirection': 'bearish',
                'description': f'Head and Shoulders detected. Head prominence: {head_prominence:.1%}. Shoulder symmetry: {symmetry:.0%}.',
                'keyPoints': [
                    _kp(left_idx, close, timestamps, 'Left Shoulder'),
                    _kp(head_idx, close, timestamps, 'Head'),
                    _kp(right_idx, close, timestamps, 'Right Shoulder'),
                    _kp(troughs_between[0], close, timestamps, 'Neckline L'),
                    _kp(troughs_between[-1], close, timestamps, 'Neckline R'),
                ],
            }

    return best


def _detect_inverse_head_and_shoulders(
    close: np.ndarray,
    highs_idx: np.ndarray,
    lows_idx: np.ndarray,
    timestamps: List[str],
    volume: np.ndarray,
) -> Optional[Dict]:
    """Inverse Head and Shoulders: 3 troughs, middle lowest, roughly equal shoulders."""
    if len(lows_idx) < 3 or len(highs_idx) < 1:
        return None

    best = None
    best_conf = 0

    for i in range(len(lows_idx) - 2):
        left_idx = lows_idx[i]
        head_idx = lows_idx[i + 1]
        right_idx = lows_idx[i + 2]

        left_p = close[left_idx]
        head_p = close[head_idx]
        right_p = close[right_idx]

        # Head must be lowest
        if head_p >= left_p or head_p >= right_p:
            continue

        # Shoulders within 15% of each other
        shoulder_diff = abs(left_p - right_p) / max(left_p, right_p)
        if shoulder_diff > 0.15:
            continue

        # Find peaks between troughs for neckline
        peaks_between = highs_idx[(highs_idx > left_idx) & (highs_idx < right_idx)]
        if len(peaks_between) < 1:
            continue

        neckline_prices = close[peaks_between]
        neckline_flatness = 1.0 - min(np.std(neckline_prices) / np.mean(neckline_prices) * 10, 1.0)

        symmetry = 1.0 - shoulder_diff
        head_depth = (min(left_p, right_p) - head_p) / min(left_p, right_p)

        # Volume confirmation: volume should expand on the right shoulder breakout
        vol_score = 0.5
        if len(volume) > right_idx:
            head_vol = np.mean(volume[max(0, head_idx - 2):head_idx + 3])
            right_vol = np.mean(volume[max(0, right_idx - 2):right_idx + 3])
            if head_vol > 0 and right_vol > head_vol:
                vol_score = min(1.0, (right_vol - head_vol) / right_vol + 0.5)

        confidence = int(symmetry * 30 + neckline_flatness * 25 + min(head_depth * 200, 25) + vol_score * 20)
        confidence = max(50, min(98, confidence))

        if confidence > best_conf:
            best_conf = confidence
            best = {
                'patternType': 'Inverse Head and Shoulders',
                'confidence': confidence,
                'startDate': _format_date(timestamps[left_idx]),
                'endDate': _format_date(timestamps[right_idx]),
                'breakoutDirection': 'bullish',
                'description': f'Inverse Head and Shoulders detected. Head depth: {head_depth:.1%}. Shoulder symmetry: {symmetry:.0%}.',
                'keyPoints': [
                    _kp(left_idx, close, timestamps, 'Left Shoulder'),
                    _kp(head_idx, close, timestamps, 'Head'),
                    _kp(right_idx, close, timestamps, 'Right Shoulder'),
                    _kp(peaks_between[0], close, timestamps, 'Neckline L'),
                    _kp(peaks_between[-1], close, timestamps, 'Neckline R'),
                ],
            }

    return best


def _detect_double_top(
    close: np.ndarray,
    highs_idx: np.ndarray,
    lows_idx: np.ndarray,
    timestamps: List[str],
    volume: np.ndarray,
) -> Optional[Dict]:
    """Double Top: two peaks at similar price level with a trough between."""
    if len(highs_idx) < 2:
        return None

    best = None
    best_conf = 0

    for i in range(len(highs_idx) - 1):
        p1_idx = highs_idx[i]
        p2_idx = highs_idx[i + 1]
        p1 = close[p1_idx]
        p2 = close[p2_idx]

        # Peaks within 3% of each other
        price_diff = abs(p1 - p2) / max(p1, p2)
        if price_diff > 0.03:
            continue

        # Must have a trough between them
        troughs_between = lows_idx[(lows_idx > p1_idx) & (lows_idx < p2_idx)]
        if len(troughs_between) == 0:
            continue

        trough_price = close[troughs_between[0]]
        depth = (max(p1, p2) - trough_price) / max(p1, p2)

        # Trough should be meaningfully lower (at least 2%)
        if depth < 0.02:
            continue

        similarity = 1.0 - price_diff / 0.03
        depth_score = min(depth / 0.05, 1.0)

        # Spacing: peaks shouldn't be too close together
        spacing = p2_idx - p1_idx
        spacing_score = min(spacing / 10, 1.0)

        confidence = int(similarity * 35 + depth_score * 30 + spacing_score * 20 + 15)
        confidence = max(50, min(98, confidence))

        if confidence > best_conf:
            best_conf = confidence
            best = {
                'patternType': 'Double Top',
                'confidence': confidence,
                'startDate': _format_date(timestamps[p1_idx]),
                'endDate': _format_date(timestamps[p2_idx]),
                'breakoutDirection': 'bearish',
                'description': f'Double Top with {price_diff:.1%} price difference between peaks. Trough depth: {depth:.1%}.',
                'keyPoints': [
                    _kp(p1_idx, close, timestamps, 'Peak 1'),
                    _kp(troughs_between[0], close, timestamps, 'Trough'),
                    _kp(p2_idx, close, timestamps, 'Peak 2'),
                ],
            }

    return best


def _detect_double_bottom(
    close: np.ndarray,
    highs_idx: np.ndarray,
    lows_idx: np.ndarray,
    timestamps: List[str],
    volume: np.ndarray,
) -> Optional[Dict]:
    """Double Bottom: two troughs at similar price level with a peak between."""
    if len(lows_idx) < 2:
        return None

    best = None
    best_conf = 0

    for i in range(len(lows_idx) - 1):
        t1_idx = lows_idx[i]
        t2_idx = lows_idx[i + 1]
        t1 = close[t1_idx]
        t2 = close[t2_idx]

        price_diff = abs(t1 - t2) / max(t1, t2)
        if price_diff > 0.03:
            continue

        peaks_between = highs_idx[(highs_idx > t1_idx) & (highs_idx < t2_idx)]
        if len(peaks_between) == 0:
            continue

        peak_price = close[peaks_between[0]]
        height = (peak_price - min(t1, t2)) / peak_price
        if height < 0.02:
            continue

        similarity = 1.0 - price_diff / 0.03
        height_score = min(height / 0.05, 1.0)
        spacing = t2_idx - t1_idx
        spacing_score = min(spacing / 10, 1.0)

        confidence = int(similarity * 35 + height_score * 30 + spacing_score * 20 + 15)
        confidence = max(50, min(98, confidence))

        if confidence > best_conf:
            best_conf = confidence
            best = {
                'patternType': 'Double Bottom',
                'confidence': confidence,
                'startDate': _format_date(timestamps[t1_idx]),
                'endDate': _format_date(timestamps[t2_idx]),
                'breakoutDirection': 'bullish',
                'description': f'Double Bottom with {price_diff:.1%} price difference between troughs. Peak height: {height:.1%}.',
                'keyPoints': [
                    _kp(t1_idx, close, timestamps, 'Bottom 1'),
                    _kp(peaks_between[0], close, timestamps, 'Peak'),
                    _kp(t2_idx, close, timestamps, 'Bottom 2'),
                ],
            }

    return best


def _detect_triple_top(
    close: np.ndarray,
    highs_idx: np.ndarray,
    lows_idx: np.ndarray,
    timestamps: List[str],
    volume: np.ndarray,
) -> Optional[Dict]:
    """Triple Top: three peaks at similar price level with troughs between."""
    if len(highs_idx) < 3 or len(lows_idx) < 2:
        return None

    best = None
    best_conf = 0

    for i in range(len(highs_idx) - 2):
        p1_idx = highs_idx[i]
        p2_idx = highs_idx[i + 1]
        p3_idx = highs_idx[i + 2]
        p1, p2, p3 = close[p1_idx], close[p2_idx], close[p3_idx]

        max_p = max(p1, p2, p3)
        min_p = min(p1, p2, p3)
        spread = (max_p - min_p) / max_p
        if spread > 0.04:
            continue

        troughs1 = lows_idx[(lows_idx > p1_idx) & (lows_idx < p2_idx)]
        troughs2 = lows_idx[(lows_idx > p2_idx) & (lows_idx < p3_idx)]
        if len(troughs1) == 0 or len(troughs2) == 0:
            continue

        t1_price = close[troughs1[0]]
        t2_price = close[troughs2[0]]

        depth1 = (max_p - t1_price) / max_p
        depth2 = (max_p - t2_price) / max_p
        avg_depth = (depth1 + depth2) / 2.0
        if avg_depth < 0.02:
            continue

        similarity = 1.0 - spread / 0.04
        depth_score = min(avg_depth / 0.06, 1.0)
        spacing_score = min((p3_idx - p1_idx) / 20.0, 1.0)

        confidence = int(similarity * 32 + depth_score * 30 + spacing_score * 18 + 15)
        confidence = max(50, min(96, confidence))

        if confidence > best_conf:
            best_conf = confidence
            best = {
                'patternType': 'Triple Top',
                'confidence': confidence,
                'startDate': _format_date(timestamps[p1_idx]),
                'endDate': _format_date(timestamps[p3_idx]),
                'breakoutDirection': 'bearish',
                'description': f'Triple Top with {spread:.1%} spread between peaks. Avg trough depth: {avg_depth:.1%}.',
                'keyPoints': [
                    _kp(p1_idx, close, timestamps, 'Peak 1'),
                    _kp(troughs1[0], close, timestamps, 'Trough 1'),
                    _kp(p2_idx, close, timestamps, 'Peak 2'),
                    _kp(troughs2[0], close, timestamps, 'Trough 2'),
                    _kp(p3_idx, close, timestamps, 'Peak 3'),
                ],
            }

    return best


def _detect_triple_bottom(
    close: np.ndarray,
    highs_idx: np.ndarray,
    lows_idx: np.ndarray,
    timestamps: List[str],
    volume: np.ndarray,
) -> Optional[Dict]:
    """Triple Bottom: three troughs at similar price level with peaks between."""
    if len(lows_idx) < 3 or len(highs_idx) < 2:
        return None

    best = None
    best_conf = 0

    for i in range(len(lows_idx) - 2):
        t1_idx = lows_idx[i]
        t2_idx = lows_idx[i + 1]
        t3_idx = lows_idx[i + 2]
        t1, t2, t3 = close[t1_idx], close[t2_idx], close[t3_idx]

        min_p = min(t1, t2, t3)
        max_p = max(t1, t2, t3)
        spread = (max_p - min_p) / max_p
        if spread > 0.04:
            continue

        peaks1 = highs_idx[(highs_idx > t1_idx) & (highs_idx < t2_idx)]
        peaks2 = highs_idx[(highs_idx > t2_idx) & (highs_idx < t3_idx)]
        if len(peaks1) == 0 or len(peaks2) == 0:
            continue

        p1_price = close[peaks1[0]]
        p2_price = close[peaks2[0]]

        height1 = (p1_price - min_p) / p1_price
        height2 = (p2_price - min_p) / p2_price
        avg_height = (height1 + height2) / 2.0
        if avg_height < 0.02:
            continue

        similarity = 1.0 - spread / 0.04
        height_score = min(avg_height / 0.06, 1.0)
        spacing_score = min((t3_idx - t1_idx) / 20.0, 1.0)

        confidence = int(similarity * 32 + height_score * 30 + spacing_score * 18 + 15)
        confidence = max(50, min(96, confidence))

        if confidence > best_conf:
            best_conf = confidence
            best = {
                'patternType': 'Triple Bottom',
                'confidence': confidence,
                'startDate': _format_date(timestamps[t1_idx]),
                'endDate': _format_date(timestamps[t3_idx]),
                'breakoutDirection': 'bullish',
                'description': f'Triple Bottom with {spread:.1%} spread between troughs. Avg peak height: {avg_height:.1%}.',
                'keyPoints': [
                    _kp(t1_idx, close, timestamps, 'Bottom 1'),
                    _kp(peaks1[0], close, timestamps, 'Peak 1'),
                    _kp(t2_idx, close, timestamps, 'Bottom 2'),
                    _kp(peaks2[0], close, timestamps, 'Peak 2'),
                    _kp(t3_idx, close, timestamps, 'Bottom 3'),
                ],
            }

    return best


def _detect_ascending_triangle(
    close: np.ndarray,
    highs_idx: np.ndarray,
    lows_idx: np.ndarray,
    timestamps: List[str],
    volume: np.ndarray,
) -> Optional[Dict]:
    """Ascending Triangle: flat resistance + rising support (higher lows)."""
    if len(highs_idx) < 3 or len(lows_idx) < 3:
        return None

    # Use the last few pivots
    recent_high_indices = highs_idx[-4:] if len(highs_idx) >= 4 else highs_idx
    recent_low_indices = lows_idx[-4:] if len(lows_idx) >= 4 else lows_idx
    recent_highs = close[recent_high_indices]
    recent_lows = close[recent_low_indices]

    high_slope = _linear_slope(recent_highs)
    low_slope = _linear_slope(recent_lows)

    # Flat highs (slope near zero) and rising lows (positive slope)
    if abs(high_slope) > 0.02 or low_slope < 0.005:
        return None

    flatness = 1.0 - min(abs(high_slope) / 0.02, 1.0)
    rise = min(low_slope / 0.02, 1.0)

    # Volume should decrease during formation
    vol_score = 0.5
    if len(volume) > highs_idx[-1]:
        early_vol = np.mean(volume[lows_idx[0]:lows_idx[min(1, len(lows_idx) - 1)] + 1])
        late_vol = np.mean(volume[lows_idx[-2]:lows_idx[-1] + 1])
        if early_vol > 0 and late_vol < early_vol:
            vol_score = 0.8

    confidence = int(flatness * 28 + rise * 30 + vol_score * 18 + 10)
    confidence = max(50, min(90, confidence))

    start_i = min(highs_idx[0], lows_idx[0])
    end_i = max(highs_idx[-1], lows_idx[-1])

    return {
        'patternType': 'Ascending Triangle',
        'confidence': confidence,
        'startDate': _format_date(timestamps[start_i]),
        'endDate': _format_date(timestamps[end_i]),
        'breakoutDirection': 'bullish',
        'description': f'Ascending Triangle with flat resistance and rising support. Low slope: {low_slope:.4f}.',
        'keyPoints': [
            _kp(recent_high_indices[0], close, timestamps, 'Upper Start'),
            _kp(recent_high_indices[-1], close, timestamps, 'Upper End'),
            _kp(recent_low_indices[0], close, timestamps, 'Lower Start'),
            _kp(recent_low_indices[-1], close, timestamps, 'Lower End'),
        ],
    }


def _detect_descending_triangle(
    close: np.ndarray,
    highs_idx: np.ndarray,
    lows_idx: np.ndarray,
    timestamps: List[str],
    volume: np.ndarray,
) -> Optional[Dict]:
    """Descending Triangle: flat support + falling resistance (lower highs)."""
    if len(highs_idx) < 3 or len(lows_idx) < 3:
        return None

    recent_high_indices = highs_idx[-4:] if len(highs_idx) >= 4 else highs_idx
    recent_low_indices = lows_idx[-4:] if len(lows_idx) >= 4 else lows_idx
    recent_highs = close[recent_high_indices]
    recent_lows = close[recent_low_indices]

    high_slope = _linear_slope(recent_highs)
    low_slope = _linear_slope(recent_lows)

    # Falling highs (negative slope) and flat lows (slope near zero)
    if high_slope > -0.005 or abs(low_slope) > 0.02:
        return None

    fall = min(abs(high_slope) / 0.02, 1.0)
    flatness = 1.0 - min(abs(low_slope) / 0.02, 1.0)

    confidence = int(fall * 30 + flatness * 30 + 15 + 10)
    confidence = max(50, min(92, confidence))

    start_i = min(highs_idx[0], lows_idx[0])
    end_i = max(highs_idx[-1], lows_idx[-1])

    return {
        'patternType': 'Descending Triangle',
        'confidence': confidence,
        'startDate': _format_date(timestamps[start_i]),
        'endDate': _format_date(timestamps[end_i]),
        'breakoutDirection': 'bearish',
        'description': f'Descending Triangle with falling resistance and flat support. High slope: {high_slope:.4f}.',
        'keyPoints': [
            _kp(recent_high_indices[0], close, timestamps, 'Upper Start'),
            _kp(recent_high_indices[-1], close, timestamps, 'Upper End'),
            _kp(recent_low_indices[0], close, timestamps, 'Lower Start'),
            _kp(recent_low_indices[-1], close, timestamps, 'Lower End'),
        ],
    }


def _detect_symmetric_triangle(
    close: np.ndarray,
    highs_idx: np.ndarray,
    lows_idx: np.ndarray,
    timestamps: List[str],
    volume: np.ndarray,
) -> Optional[Dict]:
    """Symmetric Triangle: converging trendlines (lower highs + higher lows)."""
    if len(highs_idx) < 3 or len(lows_idx) < 3:
        return None

    recent_high_indices = highs_idx[-4:] if len(highs_idx) >= 4 else highs_idx
    recent_low_indices = lows_idx[-4:] if len(lows_idx) >= 4 else lows_idx
    recent_highs = close[recent_high_indices]
    recent_lows = close[recent_low_indices]

    high_slope = _linear_slope(recent_highs)
    low_slope = _linear_slope(recent_lows)

    # Highs falling, lows rising (converging)
    if high_slope > -0.003 or low_slope < 0.003:
        return None

    convergence = min(abs(high_slope) / 0.01, 1.0) * 0.5 + min(low_slope / 0.01, 1.0) * 0.5

    # Symmetry: both slopes should be roughly equal in magnitude
    slope_ratio = min(abs(high_slope), low_slope) / max(abs(high_slope), low_slope) if max(abs(high_slope), low_slope) > 0 else 0
    symmetry = slope_ratio

    confidence = int(convergence * 30 + symmetry * 25 + 15 + 10)
    confidence = max(50, min(88, confidence))

    start_i = min(highs_idx[0], lows_idx[0])
    end_i = max(highs_idx[-1], lows_idx[-1])

    return {
        'patternType': 'Symmetric Triangle',
        'confidence': confidence,
        'startDate': _format_date(timestamps[start_i]),
        'endDate': _format_date(timestamps[end_i]),
        'breakoutDirection': 'neutral',
        'description': f'Symmetric Triangle with converging trendlines. Symmetry: {symmetry:.0%}.',
        'keyPoints': [
            _kp(recent_high_indices[0], close, timestamps, 'Upper Start'),
            _kp(recent_high_indices[-1], close, timestamps, 'Upper End'),
            _kp(recent_low_indices[0], close, timestamps, 'Lower Start'),
            _kp(recent_low_indices[-1], close, timestamps, 'Lower End'),
        ],
    }


def _detect_flag_directional(
    close: np.ndarray,
    timestamps: List[str],
    bullish: bool,
) -> Optional[Dict]:
    """Shared logic for Bullish/Bearish Flag detection."""
    n = len(close)
    if n < 20:
        return None

    pole_end = n // 3
    flag_start = pole_end
    flag_end = n - 1

    pole_return = (close[pole_end] - close[0]) / close[0]
    if abs(pole_return) < 0.03:
        return None

    if bullish and pole_return <= 0:
        return None
    if not bullish and pole_return >= 0:
        return None

    flag_section = close[flag_start:flag_end + 1]
    if len(flag_section) < 5:
        return None

    flag_slope = _linear_slope(flag_section)

    # Flag should slope against the pole direction
    if bullish and flag_slope > 0:
        return None
    if not bullish and flag_slope < 0:
        return None

    flag_range = (np.max(flag_section) - np.min(flag_section)) / np.mean(flag_section)
    if flag_range > 0.08:
        return None

    pole_strength = min(abs(pole_return) / 0.05, 1.0)
    channel_quality = 1.0 - min(flag_range / 0.05, 1.0)
    counter_slope = min(abs(flag_slope) / 0.01, 1.0)

    confidence = int(pole_strength * 25 + channel_quality * 25 + counter_slope * 18 + 12)
    confidence = max(50, min(88, confidence))

    flag_hi_price = float(np.max(flag_section))
    flag_lo_price = float(np.min(flag_section))
    pattern_type = 'Bullish Flag' if bullish else 'Bearish Flag'
    direction = 'bullish' if bullish else 'bearish'

    return {
        'patternType': pattern_type,
        'confidence': confidence,
        'startDate': _format_date(timestamps[0]),
        'endDate': _format_date(timestamps[flag_end]),
        'breakoutDirection': direction,
        'description': f'{pattern_type} pattern. Pole return: {pole_return:.1%}. Channel range: {flag_range:.1%}.',
        'keyPoints': [
            _kp(0, close, timestamps, 'Pole Start'),
            _kp(pole_end, close, timestamps, 'Pole End'),
            _kp(flag_start, close, timestamps, 'Flag Top Start', price=flag_hi_price),
            _kp(flag_end, close, timestamps, 'Flag Top End', price=flag_hi_price),
            _kp(flag_start, close, timestamps, 'Flag Bottom Start', price=flag_lo_price),
            _kp(flag_end, close, timestamps, 'Flag Bottom End', price=flag_lo_price),
        ],
    }


def _detect_bullish_flag(
    close: np.ndarray,
    highs_idx: np.ndarray,
    lows_idx: np.ndarray,
    timestamps: List[str],
    volume: np.ndarray,
) -> Optional[Dict]:
    """Bullish Flag: strong upward pole + small downward-sloping channel."""
    return _detect_flag_directional(close, timestamps, bullish=True)


def _detect_bearish_flag(
    close: np.ndarray,
    highs_idx: np.ndarray,
    lows_idx: np.ndarray,
    timestamps: List[str],
    volume: np.ndarray,
) -> Optional[Dict]:
    """Bearish Flag: strong downward pole + small upward-sloping channel."""
    return _detect_flag_directional(close, timestamps, bullish=False)


def _detect_pennant(
    close: np.ndarray,
    highs_idx: np.ndarray,
    lows_idx: np.ndarray,
    timestamps: List[str],
    volume: np.ndarray,
) -> Optional[Dict]:
    """Pennant: strong move followed by small converging triangle."""
    n = len(close)
    if n < 20:
        return None

    pole_end = n // 3
    pole_return = (close[pole_end] - close[0]) / close[0]
    if abs(pole_return) < 0.03:
        return None

    bullish_pole = pole_return > 0

    # Pennant section
    pennant_highs = highs_idx[highs_idx > pole_end]
    pennant_lows = lows_idx[lows_idx > pole_end]

    if len(pennant_highs) < 2 or len(pennant_lows) < 2:
        return None

    ph_slope = _linear_slope(close[pennant_highs])
    pl_slope = _linear_slope(close[pennant_lows])

    # Converging: highs falling, lows rising
    if ph_slope > -0.001 or pl_slope < 0.001:
        return None

    pole_strength = min(abs(pole_return) / 0.05, 1.0)
    convergence = min(abs(ph_slope) / 0.01, 1.0) * 0.5 + min(pl_slope / 0.01, 1.0) * 0.5

    confidence = int(pole_strength * 28 + convergence * 28 + 15 + 10)
    confidence = max(50, min(88, confidence))

    direction = 'bullish' if bullish_pole else 'bearish'

    return {
        'patternType': 'Pennant',
        'confidence': confidence,
        'startDate': _format_date(timestamps[0]),
        'endDate': _format_date(timestamps[-1]),
        'breakoutDirection': direction,
        'description': f'{"Bullish" if bullish_pole else "Bearish"} Pennant after {pole_return:.1%} pole move.',
        'keyPoints': [
            _kp(0, close, timestamps, 'Pole Start'),
            _kp(pole_end, close, timestamps, 'Pole End'),
            _kp(pennant_highs[0], close, timestamps, 'Upper Start'),
            _kp(pennant_highs[-1], close, timestamps, 'Upper End'),
            _kp(pennant_lows[0], close, timestamps, 'Lower Start'),
            _kp(pennant_lows[-1], close, timestamps, 'Lower End'),
        ],
    }


def _detect_cup_and_handle(
    close: np.ndarray,
    highs_idx: np.ndarray,
    lows_idx: np.ndarray,
    timestamps: List[str],
    volume: np.ndarray,
) -> Optional[Dict]:
    """Cup and Handle: U-shaped bottom followed by small downward drift."""
    n = len(close)
    if n < 25:
        return None

    # Cup should be roughly 60-80% of the data, handle the rest
    cup_end = int(n * 0.75)
    cup_section = close[:cup_end]

    # Cup: start and end should be near highs, middle should be the low
    cup_start_price = cup_section[0]
    cup_end_price = cup_section[-1]
    cup_min_idx = np.argmin(cup_section)
    cup_min_price = cup_section[cup_min_idx]

    # Cup minimum should be in the middle third
    if cup_min_idx < cup_end * 0.2 or cup_min_idx > cup_end * 0.8:
        return None

    # Both sides of cup should be roughly equal height
    left_depth = (cup_start_price - cup_min_price) / cup_start_price
    right_depth = (cup_end_price - cup_min_price) / cup_end_price

    if left_depth < 0.03 or right_depth < 0.03:
        return None

    depth_symmetry = 1.0 - abs(left_depth - right_depth) / max(left_depth, right_depth)
    if depth_symmetry < 0.5:
        return None

    # Check U-shape (not V-shape): fit a polynomial and check curvature
    x = np.arange(len(cup_section))
    coeffs = np.polyfit(x, cup_section, 2)
    # Positive quadratic coefficient = U shape
    if coeffs[0] <= 0:
        return None

    # Handle: small downward drift
    handle_section = close[cup_end:]
    if len(handle_section) < 3:
        return None

    handle_slope = _linear_slope(handle_section)
    handle_range = (np.max(handle_section) - np.min(handle_section)) / np.mean(handle_section)

    # Handle should drift slightly down or sideways, and be smaller than the cup
    if handle_slope > 0.01 or handle_range > left_depth * 0.5:
        return None

    u_shape_score = min(coeffs[0] * 1000, 1.0)
    handle_score = 1.0 - min(abs(handle_slope) / 0.02, 1.0) if handle_slope <= 0 else 0.5

    confidence = int(depth_symmetry * 25 + u_shape_score * 30 + handle_score * 25 + 20)
    confidence = max(50, min(98, confidence))

    handle_low_idx = int(cup_end + int(np.argmin(handle_section)))
    cup_end_idx = max(0, cup_end - 1)

    return {
        'patternType': 'Cup and Handle',
        'confidence': confidence,
        'startDate': _format_date(timestamps[0]),
        'endDate': _format_date(timestamps[-1]),
        'breakoutDirection': 'bullish',
        'description': f'Cup and Handle pattern. Cup depth: {left_depth:.1%}. Depth symmetry: {depth_symmetry:.0%}.',
        'keyPoints': [
            _kp(0, close, timestamps, 'Cup Start'),
            _kp(int(cup_min_idx), close, timestamps, 'Cup Bottom'),
            _kp(cup_end_idx, close, timestamps, 'Cup End'),
            _kp(cup_end, close, timestamps, 'Handle Start'),
            _kp(handle_low_idx, close, timestamps, 'Handle Low'),
            _kp(n - 1, close, timestamps, 'Handle End'),
        ],
    }


def _detect_rising_wedge(
    close: np.ndarray,
    highs_idx: np.ndarray,
    lows_idx: np.ndarray,
    timestamps: List[str],
    volume: np.ndarray,
) -> Optional[Dict]:
    """Rising Wedge: both trendlines slope upward, lows rising faster (converging upward). Bearish."""
    if len(highs_idx) < 3 or len(lows_idx) < 3:
        return None

    recent_high_indices = highs_idx[-4:] if len(highs_idx) >= 4 else highs_idx
    recent_low_indices = lows_idx[-4:] if len(lows_idx) >= 4 else lows_idx
    recent_highs = close[recent_high_indices]
    recent_lows = close[recent_low_indices]

    high_slope = _linear_slope(recent_highs)
    low_slope = _linear_slope(recent_lows)

    # Both rising
    if high_slope <= 0 or low_slope <= 0:
        return None
    # Lows must rise faster than highs (converging upward)
    if low_slope <= high_slope:
        return None

    slope_diff = abs(low_slope - high_slope)
    convergence_score = min(slope_diff / 0.015, 1.0)
    direction_score = min((high_slope + low_slope) / 0.03, 1.0)

    confidence = int(convergence_score * 30 + direction_score * 25 + 15 + 10)
    confidence = max(50, min(88, confidence))

    start_i = min(highs_idx[0], lows_idx[0])
    end_i = max(highs_idx[-1], lows_idx[-1])

    return {
        'patternType': 'Rising Wedge',
        'confidence': confidence,
        'startDate': _format_date(timestamps[start_i]),
        'endDate': _format_date(timestamps[end_i]),
        'breakoutDirection': 'bearish',
        'description': f'Rising Wedge — both trendlines slope upward and converge. Convergence: {slope_diff:.4f}.',
        'keyPoints': [
            _kp(recent_high_indices[0], close, timestamps, 'Upper Start'),
            _kp(recent_high_indices[-1], close, timestamps, 'Upper End'),
            _kp(recent_low_indices[0], close, timestamps, 'Lower Start'),
            _kp(recent_low_indices[-1], close, timestamps, 'Lower End'),
        ],
    }


def _detect_falling_wedge(
    close: np.ndarray,
    highs_idx: np.ndarray,
    lows_idx: np.ndarray,
    timestamps: List[str],
    volume: np.ndarray,
) -> Optional[Dict]:
    """Falling Wedge: both trendlines slope downward, highs falling faster (converging downward). Bullish."""
    if len(highs_idx) < 3 or len(lows_idx) < 3:
        return None

    recent_high_indices = highs_idx[-4:] if len(highs_idx) >= 4 else highs_idx
    recent_low_indices = lows_idx[-4:] if len(lows_idx) >= 4 else lows_idx
    recent_highs = close[recent_high_indices]
    recent_lows = close[recent_low_indices]

    high_slope = _linear_slope(recent_highs)
    low_slope = _linear_slope(recent_lows)

    # Both falling
    if high_slope >= 0 or low_slope >= 0:
        return None
    # Highs must fall faster than lows (converging downward)
    if abs(high_slope) <= abs(low_slope):
        return None

    slope_diff = abs(abs(high_slope) - abs(low_slope))
    convergence_score = min(slope_diff / 0.015, 1.0)
    direction_score = min(abs(high_slope + low_slope) / 0.03, 1.0)

    confidence = int(convergence_score * 30 + direction_score * 25 + 15 + 10)
    confidence = max(50, min(88, confidence))

    start_i = min(highs_idx[0], lows_idx[0])
    end_i = max(highs_idx[-1], lows_idx[-1])

    return {
        'patternType': 'Falling Wedge',
        'confidence': confidence,
        'startDate': _format_date(timestamps[start_i]),
        'endDate': _format_date(timestamps[end_i]),
        'breakoutDirection': 'bullish',
        'description': f'Falling Wedge — both trendlines slope downward and converge. Convergence: {slope_diff:.4f}.',
        'keyPoints': [
            _kp(recent_high_indices[0], close, timestamps, 'Upper Start'),
            _kp(recent_high_indices[-1], close, timestamps, 'Upper End'),
            _kp(recent_low_indices[0], close, timestamps, 'Lower Start'),
            _kp(recent_low_indices[-1], close, timestamps, 'Lower End'),
        ],
    }


def _detect_channel_directional(
    close: np.ndarray,
    highs_idx: np.ndarray,
    lows_idx: np.ndarray,
    timestamps: List[str],
    ascending: bool,
) -> Optional[Dict]:
    """Shared logic for Ascending/Descending Channel — parallel sloped trendlines."""
    if len(highs_idx) < 3 or len(lows_idx) < 3:
        return None

    recent_high_indices = highs_idx[-4:] if len(highs_idx) >= 4 else highs_idx
    recent_low_indices = lows_idx[-4:] if len(lows_idx) >= 4 else lows_idx
    recent_highs = close[recent_high_indices]
    recent_lows = close[recent_low_indices]

    high_slope = _linear_slope(recent_highs)
    low_slope = _linear_slope(recent_lows)

    if ascending:
        if high_slope < 0.005 or low_slope < 0.005:
            return None
        magnitudes = (high_slope, low_slope)
    else:
        if high_slope > -0.005 or low_slope > -0.005:
            return None
        magnitudes = (abs(high_slope), abs(low_slope))

    # Roughly parallel — slopes within ~30% of each other
    parallelism = min(magnitudes) / max(magnitudes) if max(magnitudes) > 0 else 0.0
    if parallelism < 0.65:
        return None

    direction_score = min((magnitudes[0] + magnitudes[1]) / 0.04, 1.0)
    parallel_score = (parallelism - 0.65) / 0.35

    confidence = int(parallel_score * 35 + direction_score * 30 + 15)
    confidence = max(50, min(90, confidence))

    pattern_type = 'Ascending Channel' if ascending else 'Descending Channel'
    direction = 'bullish' if ascending else 'bearish'

    start_i = int(min(highs_idx[0], lows_idx[0]))
    end_i = int(max(highs_idx[-1], lows_idx[-1]))

    return {
        'patternType': pattern_type,
        'confidence': confidence,
        'startDate': _format_date(timestamps[start_i]),
        'endDate': _format_date(timestamps[end_i]),
        'breakoutDirection': direction,
        'description': f'{pattern_type} — parallel {"rising" if ascending else "falling"} trendlines. Parallelism: {parallelism:.0%}.',
        'keyPoints': [
            _kp(recent_high_indices[0], close, timestamps, 'Upper Start'),
            _kp(recent_high_indices[-1], close, timestamps, 'Upper End'),
            _kp(recent_low_indices[0], close, timestamps, 'Lower Start'),
            _kp(recent_low_indices[-1], close, timestamps, 'Lower End'),
        ],
    }


def _detect_ascending_channel(
    close: np.ndarray,
    highs_idx: np.ndarray,
    lows_idx: np.ndarray,
    timestamps: List[str],
    volume: np.ndarray,
) -> Optional[Dict]:
    """Ascending Channel: parallel rising trendlines."""
    return _detect_channel_directional(close, highs_idx, lows_idx, timestamps, ascending=True)


def _detect_descending_channel(
    close: np.ndarray,
    highs_idx: np.ndarray,
    lows_idx: np.ndarray,
    timestamps: List[str],
    volume: np.ndarray,
) -> Optional[Dict]:
    """Descending Channel: parallel falling trendlines."""
    return _detect_channel_directional(close, highs_idx, lows_idx, timestamps, ascending=False)


def _detect_rounding_directional(
    close: np.ndarray,
    timestamps: List[str],
    bottom: bool,
) -> Optional[Dict]:
    """Shared logic for Rounding Bottom (U) and Rounding Top (inverted U) via quadratic fit."""
    n = len(close)
    if n < 20:
        return None

    x = np.arange(n)
    coeffs = np.polyfit(x, close, 2)
    a = coeffs[0]

    if bottom and a <= 0:
        return None
    if not bottom and a >= 0:
        return None

    # Vertex location (must be in middle 50% of window)
    vertex_x = -coeffs[1] / (2 * a)
    if vertex_x < n * 0.25 or vertex_x > n * 0.75:
        return None

    # Goodness of fit
    fitted = np.polyval(coeffs, x)
    ss_res = float(np.sum((close - fitted) ** 2))
    ss_tot = float(np.sum((close - np.mean(close)) ** 2))
    if ss_tot == 0:
        return None
    r2 = 1.0 - ss_res / ss_tot
    if r2 < 0.55:
        return None

    vertex_price = float(np.polyval(coeffs, vertex_x))
    edge_avg = float((close[0] + close[-1]) / 2.0)

    if bottom:
        # Vertex is the low; edges should sit above it
        depth = (edge_avg - vertex_price) / edge_avg if edge_avg > 0 else 0.0
    else:
        # Vertex is the high; edges should sit below it
        depth = (vertex_price - edge_avg) / vertex_price if vertex_price > 0 else 0.0

    if depth < 0.03:
        return None

    fit_score = (r2 - 0.55) / 0.45
    depth_score = min(depth / 0.10, 1.0)
    centered = 1.0 - abs(vertex_x - n / 2.0) / (n / 2.0)

    confidence = int(fit_score * 35 + depth_score * 30 + centered * 18 + 12)
    confidence = max(50, min(94, confidence))

    vertex_idx = int(np.clip(round(vertex_x), 0, n - 1))
    pattern_type = 'Rounding Bottom' if bottom else 'Rounding Top'
    direction = 'bullish' if bottom else 'bearish'
    label = 'Bottom' if bottom else 'Top'

    return {
        'patternType': pattern_type,
        'confidence': confidence,
        'startDate': _format_date(timestamps[0]),
        'endDate': _format_date(timestamps[-1]),
        'breakoutDirection': direction,
        'description': f'{pattern_type} — gradual {"U" if bottom else "inverted U"} reversal. Fit R²: {r2:.0%}. Depth: {depth:.1%}.',
        'keyPoints': [
            _kp(0, close, timestamps, 'Start'),
            _kp(vertex_idx, close, timestamps, label),
            _kp(n - 1, close, timestamps, 'End'),
        ],
    }


def _detect_rounding_bottom(
    close: np.ndarray,
    highs_idx: np.ndarray,
    lows_idx: np.ndarray,
    timestamps: List[str],
    volume: np.ndarray,
) -> Optional[Dict]:
    """Rounding Bottom: gradual U-shaped bullish reversal."""
    return _detect_rounding_directional(close, timestamps, bottom=True)


def _detect_rounding_top(
    close: np.ndarray,
    highs_idx: np.ndarray,
    lows_idx: np.ndarray,
    timestamps: List[str],
    volume: np.ndarray,
) -> Optional[Dict]:
    """Rounding Top: gradual inverted-U bearish reversal."""
    return _detect_rounding_directional(close, timestamps, bottom=False)


# =============================================================================
# Detector registry
# =============================================================================

ALL_DETECTORS = {
    'Head and Shoulders': _detect_head_and_shoulders,
    'Inverse Head and Shoulders': _detect_inverse_head_and_shoulders,
    'Double Top': _detect_double_top,
    'Double Bottom': _detect_double_bottom,
    'Triple Top': _detect_triple_top,
    'Triple Bottom': _detect_triple_bottom,
    'Ascending Triangle': _detect_ascending_triangle,
    'Descending Triangle': _detect_descending_triangle,
    'Symmetric Triangle': _detect_symmetric_triangle,
    'Bullish Flag': _detect_bullish_flag,
    'Bearish Flag': _detect_bearish_flag,
    'Pennant': _detect_pennant,
    'Cup and Handle': _detect_cup_and_handle,
    'Rising Wedge': _detect_rising_wedge,
    'Falling Wedge': _detect_falling_wedge,
    'Ascending Channel': _detect_ascending_channel,
    'Descending Channel': _detect_descending_channel,
    'Rounding Top': _detect_rounding_top,
    'Rounding Bottom': _detect_rounding_bottom,
}
