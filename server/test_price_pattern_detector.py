"""
Smoke tests for the 10 reversal-pattern detectors.

Run with either:
  python server/test_price_pattern_detector.py
  python -m server.test_price_pattern_detector

No test framework — just bare `assert`. Exits 0 on pass, non-zero on failure.
Each pattern has a textbook positive case + the most likely false-positive
shape that should NOT match. Trend-context patterns also verify the context
check rejects matches without the right prior trend.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta
from typing import Dict, List

# Allow `python server/test_price_pattern_detector.py` from repo root.
sys.path.insert(0, '.')

from server.price_pattern_detector import (  # noqa: E402
    _detect_bullish_engulfing,
    _detect_bearish_engulfing,
    _detect_doji,
    _detect_hammer,
    _detect_inverted_hammer,
    _detect_shooting_star,
    _detect_three_white_soldiers,
    _detect_three_black_crows,
    _detect_morning_star,
    _detect_evening_star,
)


def candle(day: int, o: float, h: float, l: float, c: float) -> Dict:
    """Construct a single OHLC bar with a deterministic timestamp."""
    base = datetime(2026, 1, 1)
    return {
        'timestamp': base + timedelta(days=day),
        'open': o,
        'high': h,
        'low': l,
        'close': c,
    }


def downtrend_prefix(start: float = 110.0, step: float = 1.5, n: int = 6) -> List[Dict]:
    """Generate `n` declining bars to seed the trend-context check."""
    bars = []
    for i in range(n):
        c = start - step * i
        # body is bearish; range slightly wider than body
        bars.append(candle(i, c + 0.5, c + 0.7, c - 0.4, c))
    return bars


def uptrend_prefix(start: float = 80.0, step: float = 1.5, n: int = 6) -> List[Dict]:
    bars = []
    for i in range(n):
        c = start + step * i
        bars.append(candle(i, c - 0.5, c + 0.4, c - 0.7, c))
    return bars


def flat_prefix(level: float = 100.0, n: int = 6) -> List[Dict]:
    bars = []
    for i in range(n):
        bars.append(candle(i, level, level + 0.3, level - 0.3, level + 0.05))
    return bars


# ─── Test cases ────────────────────────────────────────────────────────────
results: List[tuple] = []  # (name, passed, message)


def check(name: str, condition: bool, message: str = '') -> None:
    results.append((name, bool(condition), message))


# Bullish Engulfing -----------------------------------------------------------
ohlc = [
    candle(0, 105.0, 106.0, 100.0, 101.0),  # bearish
    candle(1, 100.5, 110.0, 100.0, 109.0),  # bullish, engulfs
]
r = _detect_bullish_engulfing(ohlc)
check('Bullish Engulfing positive', r is not None and r['direction'] == 'bullish')

# Anti: Day-2 body smaller than Day-1
ohlc = [
    candle(0, 110.0, 111.0, 100.0, 101.0),  # bearish, large body
    candle(1, 102.0, 105.0, 101.5, 104.0),  # bullish, smaller body, doesn't engulf
]
check('Bullish Engulfing rejects smaller-Day-2', _detect_bullish_engulfing(ohlc) is None)


# Bearish Engulfing -----------------------------------------------------------
ohlc = [
    candle(0, 100.0, 105.0, 99.5, 104.0),   # bullish
    candle(1, 104.5, 105.5, 95.0, 96.0),    # bearish, engulfs
]
r = _detect_bearish_engulfing(ohlc)
check('Bearish Engulfing positive', r is not None and r['direction'] == 'bearish')

# Anti: same color
ohlc = [
    candle(0, 100.0, 105.0, 99.5, 104.0),   # bullish
    candle(1, 104.5, 109.0, 104.0, 108.0),  # also bullish
]
check('Bearish Engulfing rejects same-direction', _detect_bearish_engulfing(ohlc) is None)


# Doji -----------------------------------------------------------------------
# Tiny body, real range
ohlc = [candle(0, 100.0, 102.0, 98.0, 100.05)]
r = _detect_doji(ohlc)
check('Doji positive', r is not None and r['direction'] == 'neutral')

# Anti: small body but flat range (no real trading)
ohlc = [candle(0, 100.0, 100.05, 99.95, 100.02)]
check('Doji rejects flat range (DOJI_MIN_RANGE_PCT)', _detect_doji(ohlc) is None)

# Anti: large body
ohlc = [candle(0, 100.0, 105.0, 99.0, 104.5)]
check('Doji rejects large body', _detect_doji(ohlc) is None)


# Hammer (requires downtrend) -------------------------------------------------
# Body 0.3, lower shadow 5.2, upper shadow 0.05 — passes the 2.0× / 0.25× ratios.
hammer_bar = candle(6, 100.5, 100.55, 95.0, 100.2)
ohlc = downtrend_prefix() + [hammer_bar]
r = _detect_hammer(ohlc)
check('Hammer positive (with downtrend)', r is not None and r['direction'] == 'bullish')

# Anti: same shape but in an uptrend → context rejects
ohlc = uptrend_prefix(start=80.0) + [
    candle(6, 90.0, 90.05, 84.5, 89.7),
]
check('Hammer rejects uptrend context', _detect_hammer(ohlc) is None)

# Anti: flat trend → context rejects
ohlc = flat_prefix() + [hammer_bar]
check('Hammer rejects flat-trend context', _detect_hammer(ohlc) is None)


# Inverted Hammer (requires downtrend) ---------------------------------------
# Body 0.3, upper shadow 5.0, lower shadow 0.05.
inv_hammer_bar = candle(6, 95.05, 100.5, 95.0, 95.35)
ohlc = downtrend_prefix() + [inv_hammer_bar]
r = _detect_inverted_hammer(ohlc)
check('Inverted Hammer positive (with downtrend)', r is not None and r['direction'] == 'bullish')

# Anti: same shape but in an uptrend → must NOT match (that's a Shooting Star)
ohlc = uptrend_prefix() + [
    candle(6, 89.55, 95.0, 89.5, 89.85),
]
check('Inverted Hammer rejects uptrend context', _detect_inverted_hammer(ohlc) is None)


# Shooting Star (requires uptrend) -------------------------------------------
ohlc = uptrend_prefix() + [
    candle(6, 89.55, 95.0, 89.5, 89.85),  # long upper, small body near bottom, top of uptrend
]
r = _detect_shooting_star(ohlc)
check('Shooting Star positive (with uptrend)', r is not None and r['direction'] == 'bearish')

# Anti: same shape but in a downtrend → must NOT match (that's an Inverted Hammer)
ohlc = downtrend_prefix() + [inv_hammer_bar]
check('Shooting Star rejects downtrend context', _detect_shooting_star(ohlc) is None)


# Three White Soldiers --------------------------------------------------------
ohlc = [
    candle(0, 100.0, 102.0, 99.8, 101.8),  # bullish, body 1.8 / range 2.2 ≈ 0.82
    candle(1, 101.0, 103.5, 100.8, 103.2),  # bullish, opens within prior body
    candle(2, 102.5, 105.0, 102.3, 104.8),  # bullish, opens within prior body
]
r = _detect_three_white_soldiers(ohlc)
check('Three White Soldiers positive',
      r is not None and r.get('keyPoints') and len(r['keyPoints']) == 3)

# Anti: third candle has long upper wick
ohlc = [
    candle(0, 100.0, 102.0, 99.8, 101.8),
    candle(1, 101.0, 103.5, 100.8, 103.2),
    candle(2, 102.5, 109.0, 102.3, 104.8),  # long upper wick
]
check('Three White Soldiers rejects long upper wick', _detect_three_white_soldiers(ohlc) is None)


# Three Black Crows -----------------------------------------------------------
ohlc = [
    candle(0, 105.0, 105.2, 102.8, 103.0),  # bearish, body 2.0 / range 2.4 ≈ 0.83
    candle(1, 104.0, 104.2, 101.5, 101.8),  # opens within prior body
    candle(2, 102.5, 102.7, 99.8, 100.0),   # opens within prior body
]
r = _detect_three_black_crows(ohlc)
check('Three Black Crows positive',
      r is not None and r['direction'] == 'bearish' and len(r.get('keyPoints', [])) == 3)

# Anti: middle candle bullish
ohlc = [
    candle(0, 105.0, 105.2, 102.8, 103.0),
    candle(1, 103.0, 104.5, 102.5, 104.2),  # bullish — breaks the chain
    candle(2, 102.5, 102.7, 99.8, 100.0),
]
check('Three Black Crows rejects middle bullish', _detect_three_black_crows(ohlc) is None)


# Morning Star ----------------------------------------------------------------
ohlc = [
    candle(0, 105.0, 105.5, 99.0, 99.5),    # Day1: long bearish, body 5.5 / range 6.5 ≈ 0.85
    candle(1, 98.0, 99.0, 97.0, 98.5),      # Day2: small body, max(open,close)=98.5 < d1.close=99.5 ✓ gap-down
    candle(2, 99.0, 105.0, 98.8, 104.5),    # Day3: long bullish, closes above d1 mid (102.25)
]
r = _detect_morning_star(ohlc)
check('Morning Star positive',
      r is not None and r['direction'] == 'bullish' and len(r.get('keyPoints', [])) == 3)

# Anti: Day-3 closes BELOW Day-1 midpoint
ohlc = [
    candle(0, 105.0, 105.5, 99.0, 99.5),    # Day1 mid = 102.25
    candle(1, 98.0, 99.0, 97.0, 98.5),
    candle(2, 99.0, 102.0, 98.8, 101.5),    # closes below 102.25 → reject
]
check('Morning Star rejects Day-3 below D1 midpoint', _detect_morning_star(ohlc) is None)


# Evening Star ----------------------------------------------------------------
# Day2 needs body/range < 0.30 — pick body 0.3 in range 1.5 → ratio 0.20.
ohlc = [
    candle(0, 99.5, 105.5, 99.0, 105.0),    # Day1: long bullish, body/range ≈ 0.85
    candle(1, 106.1, 107.0, 105.5, 106.4),  # Day2: small body above d1.close, gap-up
    candle(2, 106.0, 106.2, 100.0, 100.5),  # Day3: long bearish, closes below d1 mid (102.25)
]
r = _detect_evening_star(ohlc)
check('Evening Star positive',
      r is not None and r['direction'] == 'bearish' and len(r.get('keyPoints', [])) == 3)

# Anti: Day-3 closes ABOVE Day-1 midpoint
ohlc = [
    candle(0, 99.5, 105.5, 99.0, 105.0),    # Day1 mid = 102.25
    candle(1, 106.1, 107.0, 105.5, 106.4),
    candle(2, 106.0, 106.2, 102.5, 103.0),  # closes above 102.25 → reject
]
check('Evening Star rejects Day-3 above D1 midpoint', _detect_evening_star(ohlc) is None)


# patternStart / patternEnd / keyPoints envelope checks ----------------------
ohlc = [
    candle(0, 105.0, 105.5, 99.0, 99.5),
    candle(1, 98.0, 99.0, 97.0, 98.5),
    candle(2, 99.0, 105.0, 98.8, 104.5),
]
r = _detect_morning_star(ohlc)
check('Morning Star envelope: patternStart != patternEnd',
      r is not None and r['patternStart'] != r['patternEnd'])
check('Morning Star envelope: keyPoints labelled',
      r is not None and [kp['label'] for kp in r['keyPoints']] == ['Day 1', 'Star', 'Day 3'])

ohlc = [
    candle(0, 105.0, 106.0, 100.0, 101.0),
    candle(1, 100.5, 110.0, 100.0, 109.0),
]
r = _detect_bullish_engulfing(ohlc)
check('Engulfing envelope: patternStart != patternEnd (2-bar)',
      r is not None and r['patternStart'] != r['patternEnd'])
check('Engulfing envelope: no keyPoints (2-bar pattern)',
      r is not None and 'keyPoints' not in r)


# ─── Summary ────────────────────────────────────────────────────────────────
def main() -> int:
    failed = 0
    for name, passed, message in results:
        tag = '[PASS]' if passed else '[FAIL]'
        suffix = f'  -- {message}' if (message and not passed) else ''
        print(f'{tag} {name}{suffix}')
        if not passed:
            failed += 1
    total = len(results)
    print()
    print(f'{total - failed} passed, {failed} failed')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
