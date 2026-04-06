"""
Pattern Detector Module - Chart pattern recognition for stock price data.

Detects 10 classic chart patterns using scipy pivot detection and geometric template matching:
- Head and Shoulders, Double Top, Double Bottom
- Ascending/Descending/Symmetric Triangle
- Flag, Pennant, Cup and Handle, Wedge

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
    'Double Top': 75,
    'Double Bottom': 78,
    'Ascending Triangle': 77,
    'Descending Triangle': 72,
    'Symmetric Triangle': 54,
    'Flag': 67,
    'Pennant': 65,
    'Cup and Handle': 61,
    'Wedge': 68,
}

PATTERN_DESCRIPTIONS = {
    'Head and Shoulders': 'A bearish reversal pattern with three peaks — the middle (head) is the highest, flanked by two lower peaks (shoulders). A break below the neckline confirms the reversal.',
    'Double Top': 'A bearish reversal pattern where price reaches a resistance level twice and fails to break through, forming an "M" shape.',
    'Double Bottom': 'A bullish reversal pattern where price tests a support level twice and bounces, forming a "W" shape.',
    'Ascending Triangle': 'A bullish continuation pattern with a flat resistance line and rising support (higher lows). Breakout is typically upward.',
    'Descending Triangle': 'A bearish continuation pattern with flat support and falling resistance (lower highs). Breakout is typically downward.',
    'Symmetric Triangle': 'A neutral consolidation pattern with converging trendlines (lower highs and higher lows). Can break in either direction.',
    'Flag': 'A continuation pattern — a small rectangular consolidation channel that slopes against the prior trend, followed by a breakout in the trend direction.',
    'Pennant': 'A continuation pattern — a small symmetric triangle forming after a strong price move (the pole). Breakout continues the prior trend.',
    'Cup and Handle': 'A bullish continuation pattern resembling a tea cup — a rounded bottom (cup) followed by a small downward drift (handle) before breakout.',
    'Wedge': 'A pattern where both trendlines converge in the same direction. Rising wedges are bearish; falling wedges are bullish.',
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
    results.sort(key=lambda x: x['confidence'], reverse=True)
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
    recent_highs = close[highs_idx[-4:]] if len(highs_idx) >= 4 else close[highs_idx]
    recent_lows = close[lows_idx[-4:]] if len(lows_idx) >= 4 else close[lows_idx]

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

    recent_highs = close[highs_idx[-4:]] if len(highs_idx) >= 4 else close[highs_idx]
    recent_lows = close[lows_idx[-4:]] if len(lows_idx) >= 4 else close[lows_idx]

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

    recent_highs = close[highs_idx[-4:]] if len(highs_idx) >= 4 else close[highs_idx]
    recent_lows = close[lows_idx[-4:]] if len(lows_idx) >= 4 else close[lows_idx]

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
    }


def _detect_flag(
    close: np.ndarray,
    highs_idx: np.ndarray,
    lows_idx: np.ndarray,
    timestamps: List[str],
    volume: np.ndarray,
) -> Optional[Dict]:
    """Flag: strong move (pole) followed by small counter-trend channel."""
    n = len(close)
    if n < 20:
        return None

    # Look for a strong move in the first portion, then a channel
    pole_end = n // 3
    flag_start = pole_end
    flag_end = n - 1

    pole_return = (close[pole_end] - close[0]) / close[0]
    if abs(pole_return) < 0.03:
        return None

    bullish_pole = pole_return > 0

    # Flag channel: small counter-trend slope
    flag_section = close[flag_start:flag_end + 1]
    if len(flag_section) < 5:
        return None

    flag_slope = _linear_slope(flag_section)

    # Flag should slope against the pole direction
    if bullish_pole and flag_slope > 0:
        return None
    if not bullish_pole and flag_slope < 0:
        return None

    # Channel width (volatility within flag)
    flag_range = (np.max(flag_section) - np.min(flag_section)) / np.mean(flag_section)
    if flag_range > 0.08:  # Too wide for a flag
        return None

    pole_strength = min(abs(pole_return) / 0.05, 1.0)
    channel_quality = 1.0 - min(flag_range / 0.05, 1.0)
    counter_slope = min(abs(flag_slope) / 0.01, 1.0)

    confidence = int(pole_strength * 25 + channel_quality * 25 + counter_slope * 18 + 12)
    confidence = max(50, min(88, confidence))

    direction = 'bullish' if bullish_pole else 'bearish'

    return {
        'patternType': 'Flag',
        'confidence': confidence,
        'startDate': _format_date(timestamps[0]),
        'endDate': _format_date(timestamps[flag_end]),
        'breakoutDirection': direction,
        'description': f'{"Bullish" if bullish_pole else "Bearish"} Flag pattern. Pole return: {pole_return:.1%}. Channel range: {flag_range:.1%}.',
    }


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

    return {
        'patternType': 'Cup and Handle',
        'confidence': confidence,
        'startDate': _format_date(timestamps[0]),
        'endDate': _format_date(timestamps[-1]),
        'breakoutDirection': 'bullish',
        'description': f'Cup and Handle pattern. Cup depth: {left_depth:.1%}. Depth symmetry: {depth_symmetry:.0%}.',
    }


def _detect_wedge(
    close: np.ndarray,
    highs_idx: np.ndarray,
    lows_idx: np.ndarray,
    timestamps: List[str],
    volume: np.ndarray,
) -> Optional[Dict]:
    """Wedge: both trendlines slope same direction but converge."""
    if len(highs_idx) < 3 or len(lows_idx) < 3:
        return None

    recent_highs = close[highs_idx[-4:]] if len(highs_idx) >= 4 else close[highs_idx]
    recent_lows = close[lows_idx[-4:]] if len(lows_idx) >= 4 else close[lows_idx]

    high_slope = _linear_slope(recent_highs)
    low_slope = _linear_slope(recent_lows)

    # Both slopes same direction (both positive = rising wedge, both negative = falling wedge)
    if high_slope * low_slope <= 0:
        return None

    # Must be converging: the steeper slope should be on the side closer to the other
    rising = high_slope > 0 and low_slope > 0
    falling = high_slope < 0 and low_slope < 0

    if not (rising or falling):
        return None

    # Convergence: one slope should be steeper than the other
    if rising:
        converging = low_slope > high_slope  # lows rising faster
    else:
        converging = abs(high_slope) > abs(low_slope)  # highs falling faster

    if not converging:
        return None

    slope_diff = abs(abs(high_slope) - abs(low_slope))
    convergence_score = min(slope_diff / 0.015, 1.0)
    direction_score = min(abs(high_slope + low_slope) / 0.03, 1.0)

    confidence = int(convergence_score * 30 + direction_score * 25 + 15 + 10)
    confidence = max(50, min(88, confidence))

    # Rising wedge = bearish, falling wedge = bullish
    direction = 'bearish' if rising else 'bullish'
    wedge_type = 'Rising' if rising else 'Falling'

    start_i = min(highs_idx[0], lows_idx[0])
    end_i = max(highs_idx[-1], lows_idx[-1])

    return {
        'patternType': 'Wedge',
        'confidence': confidence,
        'startDate': _format_date(timestamps[start_i]),
        'endDate': _format_date(timestamps[end_i]),
        'breakoutDirection': direction,
        'description': f'{wedge_type} Wedge pattern. Convergence rate: {slope_diff:.4f}.',
    }


# =============================================================================
# Detector registry
# =============================================================================

ALL_DETECTORS = {
    'Head and Shoulders': _detect_head_and_shoulders,
    'Double Top': _detect_double_top,
    'Double Bottom': _detect_double_bottom,
    'Ascending Triangle': _detect_ascending_triangle,
    'Descending Triangle': _detect_descending_triangle,
    'Symmetric Triangle': _detect_symmetric_triangle,
    'Flag': _detect_flag,
    'Pennant': _detect_pennant,
    'Cup and Handle': _detect_cup_and_handle,
    'Wedge': _detect_wedge,
}
