"""
Smoke tests for the 10 reversal-pattern detectors (multi-occurrence aware).

Run with either:
  python server/test_price_pattern_detector.py
  python -m server.test_price_pattern_detector

No test framework — just bare `assert`. Exits 0 on pass, non-zero on failure.
Each pattern has a textbook positive case (now expected as a 1-element list)
plus the most likely false-positive shape (expected []). Trend-context
patterns also verify the context check rejects matches without the right
prior trend. A second block verifies the sliding-window scan surfaces
multiple historical occurrences (most-recent-first) and caps at
OCCURRENCE_CAP.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta
from typing import Dict, List

# Allow `python server/test_price_pattern_detector.py` from repo root.
sys.path.insert(0, '.')

from server.price_pattern_detector import (  # noqa: E402
    OCCURRENCE_CAP,
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
    _detect_gap_up,
    _detect_gap_down,
    _detect_strong_bullish_candle,
    _detect_strong_bearish_candle,
    _detect_consecutive_green,
    _detect_consecutive_red,
    _detect_near_day_high,
    _detect_near_day_low,
    _detect_breakout_prev_high,
    _detect_breakdown_prev_low,
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


# ─── Section 1: single positive + anti-example (list-shaped) ───────────────
# Detectors now return List[Dict]: a textbook positive → exactly 1 element,
# an anti-example → []. Field access goes through r[0].

# Bullish Engulfing -----------------------------------------------------------
ohlc = [
    candle(0, 105.0, 106.0, 100.0, 101.0),  # bearish
    candle(1, 100.5, 110.0, 100.0, 109.0),  # bullish, engulfs
]
r = _detect_bullish_engulfing(ohlc)
check('Bullish Engulfing positive', len(r) == 1 and r[0]['direction'] == 'bullish')

# Anti: Day-2 body smaller than Day-1
ohlc = [
    candle(0, 110.0, 111.0, 100.0, 101.0),  # bearish, large body
    candle(1, 102.0, 105.0, 101.5, 104.0),  # bullish, smaller body, doesn't engulf
]
check('Bullish Engulfing rejects smaller-Day-2', _detect_bullish_engulfing(ohlc) == [])


# Bearish Engulfing -----------------------------------------------------------
ohlc = [
    candle(0, 100.0, 105.0, 99.5, 104.0),   # bullish
    candle(1, 104.5, 105.5, 95.0, 96.0),    # bearish, engulfs
]
r = _detect_bearish_engulfing(ohlc)
check('Bearish Engulfing positive', len(r) == 1 and r[0]['direction'] == 'bearish')

# Anti: same color
ohlc = [
    candle(0, 100.0, 105.0, 99.5, 104.0),   # bullish
    candle(1, 104.5, 109.0, 104.0, 108.0),  # also bullish
]
check('Bearish Engulfing rejects same-direction', _detect_bearish_engulfing(ohlc) == [])


# Doji -----------------------------------------------------------------------
# Tiny body, real range
ohlc = [candle(0, 100.0, 102.0, 98.0, 100.05)]
r = _detect_doji(ohlc)
check('Doji positive', len(r) == 1 and r[0]['direction'] == 'neutral')

# Anti: small body but flat range (no real trading)
ohlc = [candle(0, 100.0, 100.05, 99.95, 100.02)]
check('Doji rejects flat range (DOJI_MIN_RANGE_PCT)', _detect_doji(ohlc) == [])

# Anti: large body
ohlc = [candle(0, 100.0, 105.0, 99.0, 104.5)]
check('Doji rejects large body', _detect_doji(ohlc) == [])


# Hammer (requires downtrend) -------------------------------------------------
# Body 0.3, lower shadow 5.2, upper shadow 0.05 — passes the 2.0× / 0.25× ratios.
hammer_bar = candle(6, 100.5, 100.55, 95.0, 100.2)
ohlc = downtrend_prefix() + [hammer_bar]
r = _detect_hammer(ohlc)
check('Hammer positive (with downtrend)', len(r) == 1 and r[0]['direction'] == 'bullish')

# Anti: same shape but in an uptrend → context rejects
ohlc = uptrend_prefix(start=80.0) + [
    candle(6, 90.0, 90.05, 84.5, 89.7),
]
check('Hammer rejects uptrend context', _detect_hammer(ohlc) == [])

# Anti: flat trend → context rejects
ohlc = flat_prefix() + [hammer_bar]
check('Hammer rejects flat-trend context', _detect_hammer(ohlc) == [])


# Inverted Hammer (requires downtrend) ---------------------------------------
# Body 0.3, upper shadow 5.0, lower shadow 0.05.
inv_hammer_bar = candle(6, 95.05, 100.5, 95.0, 95.35)
ohlc = downtrend_prefix() + [inv_hammer_bar]
r = _detect_inverted_hammer(ohlc)
check('Inverted Hammer positive (with downtrend)',
      len(r) == 1 and r[0]['direction'] == 'bullish')

# Anti: same shape but in an uptrend → must NOT match (that's a Shooting Star)
ohlc = uptrend_prefix() + [
    candle(6, 89.55, 95.0, 89.5, 89.85),
]
check('Inverted Hammer rejects uptrend context', _detect_inverted_hammer(ohlc) == [])


# Shooting Star (requires uptrend) -------------------------------------------
ohlc = uptrend_prefix() + [
    candle(6, 89.55, 95.0, 89.5, 89.85),  # long upper, small body near bottom, top of uptrend
]
r = _detect_shooting_star(ohlc)
check('Shooting Star positive (with uptrend)',
      len(r) == 1 and r[0]['direction'] == 'bearish')

# Anti: same shape but in a downtrend → must NOT match (that's an Inverted Hammer)
ohlc = downtrend_prefix() + [inv_hammer_bar]
check('Shooting Star rejects downtrend context', _detect_shooting_star(ohlc) == [])


# Three White Soldiers --------------------------------------------------------
ohlc = [
    candle(0, 100.0, 102.0, 99.8, 101.8),  # bullish, body 1.8 / range 2.2 ≈ 0.82
    candle(1, 101.0, 103.5, 100.8, 103.2),  # bullish, opens within prior body
    candle(2, 102.5, 105.0, 102.3, 104.8),  # bullish, opens within prior body
]
r = _detect_three_white_soldiers(ohlc)
check('Three White Soldiers positive',
      len(r) == 1 and r[0].get('keyPoints') and len(r[0]['keyPoints']) == 3)

# Anti: third candle has long upper wick
ohlc = [
    candle(0, 100.0, 102.0, 99.8, 101.8),
    candle(1, 101.0, 103.5, 100.8, 103.2),
    candle(2, 102.5, 109.0, 102.3, 104.8),  # long upper wick
]
check('Three White Soldiers rejects long upper wick',
      _detect_three_white_soldiers(ohlc) == [])


# Three Black Crows -----------------------------------------------------------
ohlc = [
    candle(0, 105.0, 105.2, 102.8, 103.0),  # bearish, body 2.0 / range 2.4 ≈ 0.83
    candle(1, 104.0, 104.2, 101.5, 101.8),  # opens within prior body
    candle(2, 102.5, 102.7, 99.8, 100.0),   # opens within prior body
]
r = _detect_three_black_crows(ohlc)
check('Three Black Crows positive',
      len(r) == 1 and r[0]['direction'] == 'bearish'
      and len(r[0].get('keyPoints', [])) == 3)

# Anti: middle candle bullish
ohlc = [
    candle(0, 105.0, 105.2, 102.8, 103.0),
    candle(1, 103.0, 104.5, 102.5, 104.2),  # bullish — breaks the chain
    candle(2, 102.5, 102.7, 99.8, 100.0),
]
check('Three Black Crows rejects middle bullish', _detect_three_black_crows(ohlc) == [])


# Morning Star ----------------------------------------------------------------
ohlc = [
    candle(0, 105.0, 105.5, 99.0, 99.5),    # Day1: long bearish, body 5.5 / range 6.5 ≈ 0.85
    candle(1, 98.0, 99.0, 97.0, 98.5),      # Day2: small body, max(open,close)=98.5 < d1.close=99.5 ✓ gap-down
    candle(2, 99.0, 105.0, 98.8, 104.5),    # Day3: long bullish, closes above d1 mid (102.25)
]
r = _detect_morning_star(ohlc)
check('Morning Star positive',
      len(r) == 1 and r[0]['direction'] == 'bullish'
      and len(r[0].get('keyPoints', [])) == 3)

# Anti: Day-3 closes BELOW Day-1 midpoint
ohlc = [
    candle(0, 105.0, 105.5, 99.0, 99.5),    # Day1 mid = 102.25
    candle(1, 98.0, 99.0, 97.0, 98.5),
    candle(2, 99.0, 102.0, 98.8, 101.5),    # closes below 102.25 → reject
]
check('Morning Star rejects Day-3 below D1 midpoint', _detect_morning_star(ohlc) == [])


# Evening Star ----------------------------------------------------------------
# Day2 needs body/range < 0.30 — pick body 0.3 in range 1.5 → ratio 0.20.
ohlc = [
    candle(0, 99.5, 105.5, 99.0, 105.0),    # Day1: long bullish, body/range ≈ 0.85
    candle(1, 106.1, 107.0, 105.5, 106.4),  # Day2: small body above d1.close, gap-up
    candle(2, 106.0, 106.2, 100.0, 100.5),  # Day3: long bearish, closes below d1 mid (102.25)
]
r = _detect_evening_star(ohlc)
check('Evening Star positive',
      len(r) == 1 and r[0]['direction'] == 'bearish'
      and len(r[0].get('keyPoints', [])) == 3)

# Anti: Day-3 closes ABOVE Day-1 midpoint
ohlc = [
    candle(0, 99.5, 105.5, 99.0, 105.0),    # Day1 mid = 102.25
    candle(1, 106.1, 107.0, 105.5, 106.4),
    candle(2, 106.0, 106.2, 102.5, 103.0),  # closes above 102.25 → reject
]
check('Evening Star rejects Day-3 above D1 midpoint', _detect_evening_star(ohlc) == [])


# patternStart / patternEnd / keyPoints envelope checks ----------------------
ohlc = [
    candle(0, 105.0, 105.5, 99.0, 99.5),
    candle(1, 98.0, 99.0, 97.0, 98.5),
    candle(2, 99.0, 105.0, 98.8, 104.5),
]
r = _detect_morning_star(ohlc)
check('Morning Star envelope: patternStart != patternEnd',
      len(r) == 1 and r[0]['patternStart'] != r[0]['patternEnd'])
check('Morning Star envelope: keyPoints labelled',
      len(r) == 1 and [kp['label'] for kp in r[0]['keyPoints']] == ['Day 1', 'Star', 'Day 3'])

ohlc = [
    candle(0, 105.0, 106.0, 100.0, 101.0),
    candle(1, 100.5, 110.0, 100.0, 109.0),
]
r = _detect_bullish_engulfing(ohlc)
check('Engulfing envelope: patternStart != patternEnd (2-bar)',
      len(r) == 1 and r[0]['patternStart'] != r[0]['patternEnd'])
check('Engulfing envelope: no keyPoints (2-bar pattern)',
      len(r) == 1 and 'keyPoints' not in r[0])


# ─── Section 2: multi-occurrence sliding-window scan ───────────────────────
# `assemble` concatenates pattern "units" separated by inert spacer bars and
# re-stamps every bar with a strictly-increasing day so detectedAt ordering is
# deterministic. Geometry depends only on OHLC, so re-stamping is safe.

def _inert(o: float = 100.0, h: float = 100.5, l: float = 99.5, c: float = 100.2) -> Dict:
    """A bar that triggers none of the 10 detectors: body/range 0.20 (not a
    doji), no qualifying shadow geometry, never 3-strong-in-a-row."""
    return candle(0, o, h, l, c)


def assemble(units: List[List[Dict]], spacer_n: int = 3, spacer_fn=_inert) -> List[Dict]:
    out: List[Dict] = []
    day = 0
    base = datetime(2026, 1, 1)

    def stamp(bar: Dict) -> Dict:
        nonlocal day
        nb = dict(bar)
        nb['timestamp'] = base + timedelta(days=day)
        day += 1
        return nb

    for idx, unit in enumerate(units):
        if idx > 0:
            for _ in range(spacer_n):
                out.append(stamp(spacer_fn()))
        for b in unit:
            out.append(stamp(b))
    return out


def _strictly_desc(seq: List[str]) -> bool:
    return all(seq[i] > seq[i + 1] for i in range(len(seq) - 1))


# Reusable single-occurrence "units" (each fires at its last bar).
U_BULL_ENGULF = [candle(0, 105.0, 106.0, 100.0, 101.0), candle(0, 100.5, 110.0, 100.0, 109.0)]
U_BEAR_ENGULF = [candle(0, 100.0, 105.0, 99.5, 104.0), candle(0, 104.5, 105.5, 95.0, 96.0)]
U_DOJI = [candle(0, 100.0, 102.0, 98.0, 100.05)]
U_HAMMER = downtrend_prefix() + [candle(0, 100.5, 100.55, 95.0, 100.2)]
U_INV_HAMMER = downtrend_prefix() + [candle(0, 95.05, 100.5, 95.0, 95.35)]
U_SHOOT_STAR = uptrend_prefix() + [candle(0, 89.55, 95.0, 89.5, 89.85)]
U_TWS = [
    candle(0, 100.0, 102.0, 99.8, 101.8),
    candle(0, 101.0, 103.5, 100.8, 103.2),
    candle(0, 102.5, 105.0, 102.3, 104.8),
]
U_TBC = [
    candle(0, 105.0, 105.2, 102.8, 103.0),
    candle(0, 104.0, 104.2, 101.5, 101.8),
    candle(0, 102.5, 102.7, 99.8, 100.0),
]
U_MORNING = [
    candle(0, 105.0, 105.5, 99.0, 99.5),
    candle(0, 98.0, 99.0, 97.0, 98.5),
    candle(0, 99.0, 105.0, 98.8, 104.5),
]
U_EVENING = [
    candle(0, 99.5, 105.5, 99.0, 105.0),
    candle(0, 106.1, 107.0, 105.5, 106.4),
    candle(0, 106.0, 106.2, 100.0, 100.5),
]

MULTI_CASES = [
    ('Bullish Engulfing', _detect_bullish_engulfing, U_BULL_ENGULF),
    ('Bearish Engulfing', _detect_bearish_engulfing, U_BEAR_ENGULF),
    ('Doji', _detect_doji, U_DOJI),
    ('Hammer', _detect_hammer, U_HAMMER),
    ('Inverted Hammer', _detect_inverted_hammer, U_INV_HAMMER),
    ('Shooting Star', _detect_shooting_star, U_SHOOT_STAR),
    ('Three White Soldiers', _detect_three_white_soldiers, U_TWS),
    ('Three Black Crows', _detect_three_black_crows, U_TBC),
    ('Morning Star', _detect_morning_star, U_MORNING),
    ('Evening Star', _detect_evening_star, U_EVENING),
]

for _name, _fn, _unit in MULTI_CASES:
    _ohlc = assemble([list(_unit), list(_unit), list(_unit)])
    _r = _fn(_ohlc)
    _dates = [o['detectedAt'] for o in _r]
    check(f'{_name} multi: 3 occurrences', len(_r) == 3)
    check(f'{_name} multi: most-recent-first', _strictly_desc(_dates))


# Cap test: 8 Doji occurrences → exactly OCCURRENCE_CAP, newest-first.
_ohlc = assemble([list(U_DOJI) for _ in range(8)])
_r = _detect_doji(_ohlc)
_dates = [o['detectedAt'] for o in _r]
check(f'Doji cap: 8 occurrences capped at OCCURRENCE_CAP ({OCCURRENCE_CAP})',
      len(_r) == OCCURRENCE_CAP)
check('Doji cap: capped set still most-recent-first', _strictly_desc(_dates))


# ─── Section 3: price-action multi-occurrence + run-dedup ──────────────────
# Price-action detectors now slide the same window. Needs a stricter spacer:
# the reversal `_inert()` is bullish (extends green runs), closes within 0.3%
# of its high (fires Near Day High), and back-to-back inerts gap. `_pa_inert`
# is strictly neutral (body 0, mid-range, no gap vs identical neighbours).

def _pa_inert() -> Dict:
    return candle(0, 50.0, 50.4, 49.6, 50.0)


# Single-occurrence units, all near price 50 so spacer boundaries don't
# spuriously fire the *target* detector.
U_GAP_UP = [candle(0, 50.0, 50.2, 49.9, 50.0), candle(0, 50.4, 50.6, 50.3, 50.45)]
U_GAP_DOWN = [candle(0, 50.0, 50.1, 49.8, 50.0), candle(0, 49.6, 49.7, 49.4, 49.55)]
U_STRONG_BULL = [candle(0, 49.0, 51.05, 48.95, 51.0)]
U_STRONG_BEAR = [candle(0, 51.0, 51.05, 48.95, 49.0)]
U_NEAR_HIGH = [candle(0, 49.5, 50.0, 49.4, 49.99)]
U_NEAR_LOW = [candle(0, 50.5, 50.6, 50.0, 50.01)]
U_BREAKOUT = [candle(0, 50.0, 50.2, 49.9, 50.0), candle(0, 50.1, 50.6, 50.05, 50.5)]
U_BREAKDOWN = [candle(0, 50.0, 50.1, 49.8, 50.0), candle(0, 49.95, 49.99, 49.5, 49.6)]

PA_CASES = [
    ('Gap Up', _detect_gap_up, U_GAP_UP),
    ('Gap Down', _detect_gap_down, U_GAP_DOWN),
    ('Strong Bullish Candle', _detect_strong_bullish_candle, U_STRONG_BULL),
    ('Strong Bearish Candle', _detect_strong_bearish_candle, U_STRONG_BEAR),
    ('Near Day High', _detect_near_day_high, U_NEAR_HIGH),
    ('Near Day Low', _detect_near_day_low, U_NEAR_LOW),
    ('Breakout above Prev High', _detect_breakout_prev_high, U_BREAKOUT),
    ('Breakdown below Prev Low', _detect_breakdown_prev_low, U_BREAKDOWN),
]

for _name, _fn, _unit in PA_CASES:
    _r1 = _fn(assemble([list(_unit)], spacer_fn=_pa_inert))
    check(f'{_name} single still 1-element', len(_r1) == 1)
    _r3 = _fn(assemble([list(_unit), list(_unit), list(_unit)], spacer_fn=_pa_inert))
    check(f'{_name} multi: 3 occurrences', len(_r3) == 3)
    check(f'{_name} multi: most-recent-first',
          _strictly_desc([o['detectedAt'] for o in _r3]))
    _r8 = _fn(assemble([list(_unit) for _ in range(8)], spacer_fn=_pa_inert))
    check(f'{_name} cap: 8 occurrences -> {OCCURRENCE_CAP}', len(_r8) == OCCURRENCE_CAP)
    check(f'{_name} cap: most-recent-first',
          _strictly_desc([o['detectedAt'] for o in _r8]))


# Consecutive Green/Red — run-dedup: one occurrence per maximal run.
def _green_run(n: int) -> List[Dict]:
    bars = []
    base = 50.0
    for k in range(n):
        o = base + 0.2 * k
        bars.append(candle(0, o, o + 0.3, o - 0.1, o + 0.2))  # close > open
    return bars


def _red_run(n: int) -> List[Dict]:
    bars = []
    base = 50.0
    for k in range(n):
        o = base - 0.2 * k
        bars.append(candle(0, o, o + 0.1, o - 0.3, o - 0.2))  # close < open
    return bars


for _cname, _cfn, _runfn, _dir in [
    ('Consecutive Green', _detect_consecutive_green, _green_run, 'bullish'),
    ('Consecutive Red', _detect_consecutive_red, _red_run, 'bearish'),
]:
    # Single 4-bar run still collapses to exactly 1 occurrence.
    _r = _cfn(assemble([_runfn(4)], spacer_fn=_pa_inert))
    check(f'{_cname} single run -> 1 occurrence', len(_r) == 1)
    # A single 6-bar run → 1 occurrence, streak capped at 5 (confidence 92).
    _r = _cfn(assemble([_runfn(6)], spacer_fn=_pa_inert))
    check(f'{_cname} 6-bar run -> 1 occurrence (dedup)', len(_r) == 1)
    check(f'{_cname} 6-bar run streak==5 (conf {62 + min(5 * 7, 30)})',
          len(_r) == 1 and _r[0]['confidence'] == 62 + min(5 * 7, 30))
    # Three separate runs → 3 occurrences, most-recent-first.
    _r = _cfn(assemble([_runfn(4), _runfn(4), _runfn(4)], spacer_fn=_pa_inert))
    check(f'{_cname} 3 runs -> 3 occurrences', len(_r) == 3)
    check(f'{_cname} 3 runs most-recent-first',
          _strictly_desc([o['detectedAt'] for o in _r]))
    # Eight runs → capped at OCCURRENCE_CAP.
    _r = _cfn(assemble([_runfn(4) for _ in range(8)], spacer_fn=_pa_inert))
    check(f'{_cname} cap: 8 runs -> {OCCURRENCE_CAP}', len(_r) == OCCURRENCE_CAP)


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
