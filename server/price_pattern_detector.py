"""
Price Pattern Detector - candle and price-action recognition.

This module is read-only: it scans existing OHLC data and returns UI-ready
signals for gap, candle strength, consecutive candle, day high/low,
previous-day breakout/breakdown, and classic candlestick reversal patterns.

Calibration surface: the constants block immediately below is the single
place to tune detection thresholds. If hit rates feel off in production,
adjust there — no detector logic changes required.
"""

import logging
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# ─── Tunable thresholds (calibration surface) ──────────────────────────────
# Doji — small body relative to range, with non-trivial range
DOJI_BODY_RATIO          = 0.10   # body/range below this counts as a doji
DOJI_MIN_RANGE_PCT       = 0.003  # range must be >= 0.3% of close (looser than 0.5%
                                  # so we catch real doji in low-vol large-caps)

# Hammer / Inverted Hammer / Shooting Star — shadow geometry
HAMMER_SHADOW_RATIO      = 2.0    # primary shadow >= 2x body
HAMMER_OPPOSITE_RATIO    = 0.25   # opposite shadow <= 0.25x body
HAMMER_BODY_NEAR_EDGE    = 0.30   # body sits in the top/bottom 30% of range

# Trend context — for Hammer / Inverted Hammer / Shooting Star
TREND_LOOKBACK           = 5      # bars of prior trend required
TREND_LOCAL_EXTREME_TOL  = 1.005  # candle's low (uptrend: high) must be within
                                  # 0.5% of the local min (uptrend: max) of the
                                  # last TREND_LOOKBACK bars

# Star patterns
STAR_DAY13_BODY_RATIO    = 0.6    # Day1 / Day3 long candle body/range > 0.6
STAR_DAY2_BODY_RATIO     = 0.3    # Day2 "small body" body/range < 0.3

# Three White Soldiers / Three Black Crows
SOLDIERS_MIN_BODY_RATIO     = 0.5   # each soldier/crow body/range > 0.5
SOLDIERS_UPPER_SHADOW_RATIO = 0.3   # upper (or lower) wick <= 0.3x body

# ─── Pattern registry ──────────────────────────────────────────────────────
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
    'Bullish Engulfing',
    'Bearish Engulfing',
    'Doji',
    'Hammer',
    'Inverted Hammer',
    'Shooting Star',
    'Three White Soldiers',
    'Three Black Crows',
    'Morning Star',
    'Evening Star',
}

# Grouping metadata consumed by GET /api/price-pattern-types and used to
# render the dropdown groups on the frontend. `rare: true` triggers the
# pattern-specific empty-state hint when a scan returns zero results.
PRICE_PATTERN_GROUPS = [
    {
        'label': 'Price action',
        'types': [
            {'name': 'Gap Up', 'rare': False},
            {'name': 'Gap Down', 'rare': False},
            {'name': 'Strong Bullish Candle', 'rare': False},
            {'name': 'Strong Bearish Candle', 'rare': False},
            {'name': 'Consecutive Green Candles', 'rare': False},
            {'name': 'Consecutive Red Candles', 'rare': False},
            {'name': 'Near Day High', 'rare': False},
            {'name': 'Near Day Low', 'rare': False},
            {'name': 'Breakout above Previous Day High', 'rare': False},
            {'name': 'Breakdown below Previous Day Low', 'rare': False},
        ],
    },
    {
        'label': 'Reversal patterns',
        'types': [
            {'name': 'Bullish Engulfing', 'rare': False},
            {'name': 'Bearish Engulfing', 'rare': False},
            {'name': 'Doji', 'rare': False},
            {'name': 'Hammer', 'rare': False},
            {'name': 'Inverted Hammer', 'rare': False},
            {'name': 'Shooting Star', 'rare': False},
            {'name': 'Three White Soldiers', 'rare': True},
            {'name': 'Three Black Crows', 'rare': True},
            {'name': 'Morning Star', 'rare': True},
            {'name': 'Evening Star', 'rare': True},
        ],
    },
]


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
        # Price action
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
        # Reversal patterns
        'Bullish Engulfing': _detect_bullish_engulfing,
        'Bearish Engulfing': _detect_bearish_engulfing,
        'Doji': _detect_doji,
        'Hammer': _detect_hammer,
        'Inverted Hammer': _detect_inverted_hammer,
        'Shooting Star': _detect_shooting_star,
        'Three White Soldiers': _detect_three_white_soldiers,
        'Three Black Crows': _detect_three_black_crows,
        'Morning Star': _detect_morning_star,
        'Evening Star': _detect_evening_star,
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


def _make_result(
    pattern_type: str,
    confidence: int,
    direction: str,
    detected_at: str,
    description: str,
    pattern_start: Optional[str] = None,
    pattern_end: Optional[str] = None,
    key_points: Optional[List[Dict]] = None,
) -> Dict:
    """Build a UI-ready pattern result dict.

    `pattern_start` / `pattern_end` default to `detected_at` so existing
    single-bar detectors don't need to change their call sites. Multi-bar
    detectors should pass explicit start/end dates so the chart annotation
    spans the full pattern. `key_points` is optional per-bar markers for
    multi-bar patterns where labelling individual candles helps the reader.
    """
    confidence_clamped = max(50, min(98, int(confidence)))
    result = {
        'patternType': pattern_type,
        'confidence': confidence_clamped,
        'detectedAt': detected_at,
        'direction': direction,
        'signalStrength': confidence_clamped,
        'description': description,
        'patternStart': pattern_start or detected_at,
        'patternEnd': pattern_end or detected_at,
    }
    if key_points:
        result['keyPoints'] = key_points
    return result


# ─── Candle geometry + trend helpers ───────────────────────────────────────
def _body(c: Dict) -> float:
    return abs(c['close'] - c['open'])


def _range(c: Dict) -> float:
    return c['high'] - c['low']


def _upper_shadow(c: Dict) -> float:
    return c['high'] - max(c['open'], c['close'])


def _lower_shadow(c: Dict) -> float:
    return min(c['open'], c['close']) - c['low']


def _is_bullish(c: Dict) -> bool:
    return c['close'] > c['open']


def _is_bearish(c: Dict) -> bool:
    return c['close'] < c['open']


def _is_downtrend(candles: List[Dict], lookback: int = TREND_LOOKBACK) -> bool:
    """Strict downtrend check over `lookback` bars BEFORE the candle at -1.

    Requires: net decline (closes[-1] < closes[0] of window), negative mean
    diff, and the candle being evaluated is at or near the local low.
    """
    if len(candles) < lookback + 1:
        return False
    window = candles[-(lookback + 1):-1]
    if len(window) < lookback:
        return False
    closes = [c['close'] for c in window]
    diffs = [closes[i + 1] - closes[i] for i in range(len(closes) - 1)]
    if not diffs:
        return False
    last_low = candles[-1]['low']
    local_min = min(c['low'] for c in window)
    return (
        closes[-1] < closes[0]
        and (sum(diffs) / len(diffs)) < 0
        and last_low <= local_min * TREND_LOCAL_EXTREME_TOL
    )


def _is_uptrend(candles: List[Dict], lookback: int = TREND_LOOKBACK) -> bool:
    """Mirror of `_is_downtrend`."""
    if len(candles) < lookback + 1:
        return False
    window = candles[-(lookback + 1):-1]
    if len(window) < lookback:
        return False
    closes = [c['close'] for c in window]
    diffs = [closes[i + 1] - closes[i] for i in range(len(closes) - 1)]
    if not diffs:
        return False
    last_high = candles[-1]['high']
    local_max = max(c['high'] for c in window)
    return (
        closes[-1] > closes[0]
        and (sum(diffs) / len(diffs)) > 0
        and last_high >= local_max / TREND_LOCAL_EXTREME_TOL
    )


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


# ─── Reversal patterns ─────────────────────────────────────────────────────
# All 10 added per the run-it-now-sunny-marshmallow plan. Each follows the
# existing `_detect_X(ohlc) -> Optional[Dict]` shape; multi-bar patterns set
# `pattern_start` / `pattern_end` and 3-bar patterns add `key_points`.

def _detect_bullish_engulfing(ohlc: List[Dict]) -> Optional[Dict]:
    prev, latest = _latest_pair(ohlc)
    if not prev or not latest:
        return None
    if not (_is_bearish(prev) and _is_bullish(latest)):
        return None
    prev_body = _body(prev)
    cur_body = _body(latest)
    if prev_body <= 0 or cur_body <= 0:
        return None
    if not (latest['open'] <= prev['close'] and latest['close'] >= prev['open']):
        return None
    confidence = 60 + min((cur_body / prev_body) * 10, 30)
    return _make_result(
        'Bullish Engulfing', confidence, 'bullish',
        _detected_at(latest),
        f"Bullish body engulfs prior bearish body ({cur_body / prev_body:.1f}x).",
        pattern_start=_detected_at(prev),
        pattern_end=_detected_at(latest),
    )


def _detect_bearish_engulfing(ohlc: List[Dict]) -> Optional[Dict]:
    prev, latest = _latest_pair(ohlc)
    if not prev or not latest:
        return None
    if not (_is_bullish(prev) and _is_bearish(latest)):
        return None
    prev_body = _body(prev)
    cur_body = _body(latest)
    if prev_body <= 0 or cur_body <= 0:
        return None
    if not (latest['open'] >= prev['close'] and latest['close'] <= prev['open']):
        return None
    confidence = 60 + min((cur_body / prev_body) * 10, 30)
    return _make_result(
        'Bearish Engulfing', confidence, 'bearish',
        _detected_at(latest),
        f"Bearish body engulfs prior bullish body ({cur_body / prev_body:.1f}x).",
        pattern_start=_detected_at(prev),
        pattern_end=_detected_at(latest),
    )


def _detect_doji(ohlc: List[Dict]) -> Optional[Dict]:
    candles = _valid_candles(ohlc)
    if not candles:
        return None
    latest = candles[-1]
    rng = _range(latest)
    if rng <= 0 or latest['close'] <= 0:
        return None
    if rng < latest['close'] * DOJI_MIN_RANGE_PCT:
        return None
    body_ratio = _body(latest) / rng
    if body_ratio >= DOJI_BODY_RATIO:
        return None
    confidence = 60 + min((1 - body_ratio) * 35, 35)
    return _make_result(
        'Doji', confidence, 'neutral', _detected_at(latest),
        f"Body is {body_ratio:.0%} of range — indecision candle.",
    )


def _detect_hammer(ohlc: List[Dict]) -> Optional[Dict]:
    candles = _valid_candles(ohlc)
    if len(candles) < TREND_LOOKBACK + 1:
        return None
    latest = candles[-1]
    body = _body(latest)
    rng = _range(latest)
    if body <= 0 or rng <= 0:
        return None
    lower = _lower_shadow(latest)
    upper = _upper_shadow(latest)
    if lower < HAMMER_SHADOW_RATIO * body:
        return None
    if upper > HAMMER_OPPOSITE_RATIO * body:
        return None
    body_top = max(latest['open'], latest['close'])
    if (latest['high'] - body_top) / rng > HAMMER_BODY_NEAR_EDGE:
        return None
    if not _is_downtrend(candles):
        return None
    confidence = 65 + min((lower / body) * 5, 25) + (5 if upper == 0 else 0)
    return _make_result(
        'Hammer', confidence, 'bullish', _detected_at(latest),
        f"Lower shadow {lower / body:.1f}x body in a downtrend.",
    )


def _detect_inverted_hammer(ohlc: List[Dict]) -> Optional[Dict]:
    candles = _valid_candles(ohlc)
    if len(candles) < TREND_LOOKBACK + 1:
        return None
    latest = candles[-1]
    body = _body(latest)
    rng = _range(latest)
    if body <= 0 or rng <= 0:
        return None
    upper = _upper_shadow(latest)
    lower = _lower_shadow(latest)
    if upper < HAMMER_SHADOW_RATIO * body:
        return None
    if lower > HAMMER_OPPOSITE_RATIO * body:
        return None
    body_bottom = min(latest['open'], latest['close'])
    if (body_bottom - latest['low']) / rng > HAMMER_BODY_NEAR_EDGE:
        return None
    if not _is_downtrend(candles):
        return None
    confidence = 65 + min((upper / body) * 5, 25) + (5 if lower == 0 else 0)
    return _make_result(
        'Inverted Hammer', confidence, 'bullish', _detected_at(latest),
        f"Upper shadow {upper / body:.1f}x body in a downtrend.",
    )


def _detect_shooting_star(ohlc: List[Dict]) -> Optional[Dict]:
    candles = _valid_candles(ohlc)
    if len(candles) < TREND_LOOKBACK + 1:
        return None
    latest = candles[-1]
    body = _body(latest)
    rng = _range(latest)
    if body <= 0 or rng <= 0:
        return None
    upper = _upper_shadow(latest)
    lower = _lower_shadow(latest)
    if upper < HAMMER_SHADOW_RATIO * body:
        return None
    if lower > HAMMER_OPPOSITE_RATIO * body:
        return None
    body_bottom = min(latest['open'], latest['close'])
    if (body_bottom - latest['low']) / rng > HAMMER_BODY_NEAR_EDGE:
        return None
    if not _is_uptrend(candles):
        return None
    confidence = 65 + min((upper / body) * 5, 25) + (5 if lower == 0 else 0)
    return _make_result(
        'Shooting Star', confidence, 'bearish', _detected_at(latest),
        f"Upper shadow {upper / body:.1f}x body in an uptrend.",
    )


def _detect_three_white_soldiers(ohlc: List[Dict]) -> Optional[Dict]:
    candles = _valid_candles(ohlc)
    if len(candles) < 3:
        return None
    c1, c2, c3 = candles[-3], candles[-2], candles[-1]

    for c in (c1, c2, c3):
        rng = _range(c)
        body = _body(c)
        if rng <= 0 or body <= 0 or not _is_bullish(c):
            return None
        if body / rng < SOLDIERS_MIN_BODY_RATIO:
            return None
        if _upper_shadow(c) > SOLDIERS_UPPER_SHADOW_RATIO * body:
            return None

    # Each close higher than the previous; each open within or above prior body.
    if not (c2['close'] > c1['close'] and c3['close'] > c2['close']):
        return None
    if not (c1['open'] <= c2['open'] <= c1['close']):
        return None
    if not (c2['open'] <= c3['open'] <= c2['close']):
        return None

    avg_body_ratio = sum(_body(c) / _range(c) for c in (c1, c2, c3)) / 3
    confidence = 70 + min(avg_body_ratio * 30, 25)
    key_points = [
        {'ts': _detected_at(c1), 'price': c1['close'], 'label': 'Soldier 1'},
        {'ts': _detected_at(c2), 'price': c2['close'], 'label': 'Soldier 2'},
        {'ts': _detected_at(c3), 'price': c3['close'], 'label': 'Soldier 3'},
    ]
    return _make_result(
        'Three White Soldiers', confidence, 'bullish', _detected_at(c3),
        "Three rising bullish candles with overlapping bodies.",
        pattern_start=_detected_at(c1),
        pattern_end=_detected_at(c3),
        key_points=key_points,
    )


def _detect_three_black_crows(ohlc: List[Dict]) -> Optional[Dict]:
    candles = _valid_candles(ohlc)
    if len(candles) < 3:
        return None
    c1, c2, c3 = candles[-3], candles[-2], candles[-1]

    for c in (c1, c2, c3):
        rng = _range(c)
        body = _body(c)
        if rng <= 0 or body <= 0 or not _is_bearish(c):
            return None
        if body / rng < SOLDIERS_MIN_BODY_RATIO:
            return None
        if _lower_shadow(c) > SOLDIERS_UPPER_SHADOW_RATIO * body:
            return None

    if not (c2['close'] < c1['close'] and c3['close'] < c2['close']):
        return None
    if not (c1['close'] <= c2['open'] <= c1['open']):
        return None
    if not (c2['close'] <= c3['open'] <= c2['open']):
        return None

    avg_body_ratio = sum(_body(c) / _range(c) for c in (c1, c2, c3)) / 3
    confidence = 70 + min(avg_body_ratio * 30, 25)
    key_points = [
        {'ts': _detected_at(c1), 'price': c1['close'], 'label': 'Crow 1'},
        {'ts': _detected_at(c2), 'price': c2['close'], 'label': 'Crow 2'},
        {'ts': _detected_at(c3), 'price': c3['close'], 'label': 'Crow 3'},
    ]
    return _make_result(
        'Three Black Crows', confidence, 'bearish', _detected_at(c3),
        "Three falling bearish candles with overlapping bodies.",
        pattern_start=_detected_at(c1),
        pattern_end=_detected_at(c3),
        key_points=key_points,
    )


def _detect_morning_star(ohlc: List[Dict]) -> Optional[Dict]:
    candles = _valid_candles(ohlc)
    if len(candles) < 3:
        return None
    d1, d2, d3 = candles[-3], candles[-2], candles[-1]

    r1, r2, r3 = _range(d1), _range(d2), _range(d3)
    if r1 <= 0 or r2 <= 0 or r3 <= 0:
        return None
    b1, b2, b3 = _body(d1), _body(d2), _body(d3)

    # Day 1: long bearish
    if not (_is_bearish(d1) and b1 / r1 > STAR_DAY13_BODY_RATIO):
        return None
    # Day 2: small body, gapped down vs Day 1's close
    if not (b2 / r2 < STAR_DAY2_BODY_RATIO):
        return None
    if max(d2['open'], d2['close']) >= d1['close']:
        return None
    # Day 3: long bullish, closing above Day 1 midpoint
    d1_mid = (d1['open'] + d1['close']) / 2
    if not (_is_bullish(d3) and b3 / r3 > STAR_DAY13_BODY_RATIO):
        return None
    if d3['close'] <= d1_mid:
        return None

    gap = (d1['close'] - max(d2['open'], d2['close'])) / d1['close'] if d1['close'] else 0
    penetration = (d3['close'] - d1_mid) / abs(d1_mid) if d1_mid else 0
    confidence = 70 + (5 if gap > 0.005 else 0) + min(penetration * 500, 23)
    key_points = [
        {'ts': _detected_at(d1), 'price': d1['close'], 'label': 'Day 1'},
        {'ts': _detected_at(d2), 'price': d2['close'], 'label': 'Star'},
        {'ts': _detected_at(d3), 'price': d3['close'], 'label': 'Day 3'},
    ]
    return _make_result(
        'Morning Star', confidence, 'bullish', _detected_at(d3),
        f"Bullish reversal: Day 3 closes {penetration:.1%} above Day 1 midpoint.",
        pattern_start=_detected_at(d1),
        pattern_end=_detected_at(d3),
        key_points=key_points,
    )


def _detect_evening_star(ohlc: List[Dict]) -> Optional[Dict]:
    candles = _valid_candles(ohlc)
    if len(candles) < 3:
        return None
    d1, d2, d3 = candles[-3], candles[-2], candles[-1]

    r1, r2, r3 = _range(d1), _range(d2), _range(d3)
    if r1 <= 0 or r2 <= 0 or r3 <= 0:
        return None
    b1, b2, b3 = _body(d1), _body(d2), _body(d3)

    # Day 1: long bullish
    if not (_is_bullish(d1) and b1 / r1 > STAR_DAY13_BODY_RATIO):
        return None
    # Day 2: small body, gapped up vs Day 1's close
    if not (b2 / r2 < STAR_DAY2_BODY_RATIO):
        return None
    if min(d2['open'], d2['close']) <= d1['close']:
        return None
    # Day 3: long bearish, closing below Day 1 midpoint
    d1_mid = (d1['open'] + d1['close']) / 2
    if not (_is_bearish(d3) and b3 / r3 > STAR_DAY13_BODY_RATIO):
        return None
    if d3['close'] >= d1_mid:
        return None

    gap = (min(d2['open'], d2['close']) - d1['close']) / d1['close'] if d1['close'] else 0
    penetration = (d1_mid - d3['close']) / abs(d1_mid) if d1_mid else 0
    confidence = 70 + (5 if gap > 0.005 else 0) + min(penetration * 500, 23)
    key_points = [
        {'ts': _detected_at(d1), 'price': d1['close'], 'label': 'Day 1'},
        {'ts': _detected_at(d2), 'price': d2['close'], 'label': 'Star'},
        {'ts': _detected_at(d3), 'price': d3['close'], 'label': 'Day 3'},
    ]
    return _make_result(
        'Evening Star', confidence, 'bearish', _detected_at(d3),
        f"Bearish reversal: Day 3 closes {penetration:.1%} below Day 1 midpoint.",
        pattern_start=_detected_at(d1),
        pattern_end=_detected_at(d3),
        key_points=key_points,
    )
