"""
Stock Scorecard Module for Tiphub.

Calculates a 7-dimension stock scorecard:
1. Valuation - P/E, P/B, P/S, PEG vs sector medians
2. Profitability - ROE, ROA, NPM vs thresholds
3. Growth - 2Y Revenue & Net Income CAGR
4. Financial Health - D/E, Interest Coverage
5. Business Quality - ROE + Margin combo
6. Momentum - 1-year price return
7. Entry Rating - Price vs MA200, RSI, 52W high

Uses database data (stock_fundamentals, ohlc_daily) instead of yfinance API.
"""

import asyncio
import numpy as np
import logging
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timedelta

from redis_client import (
    get_cached, set_cached, try_acquire_lock, release_lock,
    TTL_SECTOR_MEDIANS, TTL_STOCK_SCORECARD, TTL_STOCK_SCORECARD_MARKET,
    LOCK_TTL_SCORECARD, LOCK_TTL_SECTOR_MEDIANS
)
from market_hours import is_market_open

logger = logging.getLogger(__name__)


# ======================
# Helper Functions
# ======================

def safe(v) -> float:
    """Safely convert value to float, return NaN on failure."""
    try:
        if v is None:
            return np.nan
        return float(v)
    except (TypeError, ValueError):
        return np.nan


def is_valid_number(v) -> bool:
    """Check if value is a valid number (not None, not NaN)."""
    return v is not None and not np.isnan(v)


def clamp(v: float, lo: float, hi: float) -> float:
    """Clamp value between lo and hi."""
    return max(lo, min(hi, v))


def cagr(start: float, end: float, years: float) -> float:
    """Calculate Compound Annual Growth Rate."""
    if start <= 0 or end <= 0 or years <= 0:
        return np.nan
    return (end / start) ** (1 / years) - 1


def fmt_pct(v: float) -> str:
    """Format value as percentage string."""
    if not is_valid_number(v):
        return "n/a"
    return f"{v * 100:.1f}%"


def fmt_num(v: float, digits: int = 2) -> str:
    """Format value as number string."""
    if not is_valid_number(v):
        return "n/a"
    return f"{v:.{digits}f}"


def compute_rsi(closes: List[float], period: int = 14) -> float:
    """Compute RSI from close prices."""
    if len(closes) < period + 1:
        return np.nan

    closes_arr = np.array(closes)
    deltas = np.diff(closes_arr)

    gains = np.where(deltas > 0, deltas, 0)
    losses = np.where(deltas < 0, -deltas, 0)

    avg_gain = np.mean(gains[-period:])
    avg_loss = np.mean(losses[-period:])

    if avg_loss == 0:
        return 100.0

    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def add_ratio_signal(
    signals: List[Tuple[float, float]],
    value: float,
    median: float,
    weight: float = 1.0,
    invert: bool = False,
    cap: Tuple[float, float] = (0.3, 3.0),
    details: Optional[List[Dict]] = None,
    name: Optional[str] = None,
) -> None:
    """Add a ratio signal for valuation analysis."""
    if not is_valid_number(value) or not is_valid_number(median):
        return
    if value <= 0 or median <= 0 or weight <= 0:
        return

    ratio = (median / value) if invert else (value / median)
    ratio = clamp(ratio, cap[0], cap[1])
    signals.append((ratio, weight))

    if details is not None and name:
        details.append({
            "name": name,
            "value": value,
            "median": median,
            "ratio": ratio,
        })


def format_valuation_detail(detail: Dict) -> str:
    """Format a valuation detail for explanation."""
    name = detail["name"]
    value = detail["value"]
    median = detail["median"]
    ratio = detail["ratio"]
    if name == "FCF Yield":
        return f"{name} {fmt_pct(value)} vs {fmt_pct(median)} ({ratio:.2f}x)"
    return f"{name} {fmt_num(value)} vs {fmt_num(median)} ({ratio:.2f}x)"


# ======================
# Sector Medians
# ======================

async def get_sector_medians(sector: str, conn) -> Dict[str, float]:
    """
    Get median valuation metrics for a sector from database.
    Uses Redis caching with locking.
    """
    if not sector:
        sector = "All"

    cache_key = f"sector_medians:{sector.lower().replace(' ', '_')}"
    lock_key = f"lock:{cache_key}"

    # Check cache first
    cached = get_cached(cache_key)
    if cached:
        return cached

    # Try to acquire lock
    if try_acquire_lock(lock_key, ttl=LOCK_TTL_SECTOR_MEDIANS):
        try:
            # Double-check cache
            cached = get_cached(cache_key)
            if cached:
                return cached

            # Calculate medians from database
            medians = await _calculate_sector_medians(sector, conn)

            # Cache result
            set_cached(cache_key, medians, TTL_SECTOR_MEDIANS)
            return medians
        finally:
            release_lock(lock_key)
    else:
        # Lock held by another process, wait and retry
        await asyncio.sleep(0.3)
        cached = get_cached(cache_key)
        if cached:
            return cached
        # Fallback: calculate without caching
        return await _calculate_sector_medians(sector, conn)


async def _calculate_sector_medians(sector: str, conn) -> Dict[str, float]:
    """Calculate median valuation metrics for a sector from database."""
    sector_filter = ""
    params = []

    if sector and sector.lower() != "all":
        sector_filter = "WHERE sf.sector = %s"
        params = [sector]

    query = f"""
        SELECT
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY trailing_pe) FILTER (WHERE trailing_pe > 0 AND trailing_pe < 500) as pe,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY forward_pe) FILTER (WHERE forward_pe > 0 AND forward_pe < 500) as forward_pe,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_to_book) FILTER (WHERE price_to_book > 0 AND price_to_book < 100) as pb,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_to_sales) FILTER (WHERE price_to_sales > 0 AND price_to_sales < 100) as ps,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY peg_ratio) FILTER (WHERE peg_ratio > 0 AND peg_ratio < 10) as peg
        FROM stock_fundamentals sf
        {sector_filter}
    """

    with conn.cursor() as cur:
        cur.execute(query, params)
        row = cur.fetchone()

    if not row:
        # Return default medians
        return {
            "pe": 20.0, "forward_pe": 18.0, "pb": 3.0,
            "ps": 2.5, "peg": 1.5, "ev_ebitda": 12.0,
            "ev_rev": 3.0, "fcf_yield": 0.04
        }

    return {
        "pe": safe(row[0]) if row[0] else 20.0,
        "forward_pe": safe(row[1]) if row[1] else 18.0,
        "pb": safe(row[2]) if row[2] else 3.0,
        "ps": safe(row[3]) if row[3] else 2.5,
        "peg": safe(row[4]) if row[4] else 1.5,
        "ev_ebitda": 12.0,  # Not in our DB, use default
        "ev_rev": 3.0,      # Not in our DB, use default
        "fcf_yield": 0.04   # Not in our DB, use default
    }


# ======================
# Core Scoring Functions
# ======================

def score_valuation(fundamentals: Dict, sector_medians: Dict, sector: str) -> Dict:
    """
    Calculate valuation score comparing metrics to sector medians.
    Returns: label (Undervalued/Fair/Overvalued), explanation, metrics, confidence
    """
    sector_lower = (sector or "").lower()

    # Adjust weights by sector
    weights = {
        "pe": 1.0, "forward_pe": 0.7, "pb": 0.8,
        "ps": 0.6, "peg": 0.5
    }

    if "financial" in sector_lower or "real estate" in sector_lower:
        weights["pb"] = 1.3
        weights["pe"] = 1.1
        weights["ps"] = 0.4
    elif "technology" in sector_lower or "communication" in sector_lower:
        weights["peg"] = 0.8
        weights["pb"] = 0.4

    signals = []
    details = []

    add_ratio_signal(signals, safe(fundamentals.get("trailing_pe")),
                     safe(sector_medians.get("pe")), weight=weights["pe"],
                     details=details, name="P/E")
    add_ratio_signal(signals, safe(fundamentals.get("forward_pe")),
                     safe(sector_medians.get("forward_pe", sector_medians.get("pe"))),
                     weight=weights["forward_pe"], details=details, name="Forward P/E")
    add_ratio_signal(signals, safe(fundamentals.get("price_to_book")),
                     safe(sector_medians.get("pb")), weight=weights["pb"],
                     details=details, name="P/B")
    add_ratio_signal(signals, safe(fundamentals.get("price_to_sales")),
                     safe(sector_medians.get("ps")), weight=weights["ps"],
                     details=details, name="P/S")
    add_ratio_signal(signals, safe(fundamentals.get("peg_ratio")),
                     safe(sector_medians.get("peg")), weight=weights["peg"],
                     details=details, name="PEG")

    if not signals:
        return {
            "label": "Fair",
            "explanation": "Fair because valuation metrics or sector medians are missing.",
            "metrics": {},
            "confidence": 0.0
        }

    # Calculate weighted geometric mean
    ratios = np.array([r for r, w in signals])
    signal_weights = np.array([w for r, w in signals])
    avg = np.exp(np.sum(np.log(ratios) * signal_weights) / signal_weights.sum())

    # Calculate confidence
    count = len(signals)
    coverage = min(1.0, count / 5.0)
    dispersion = np.std(np.log(ratios)) if count > 1 else 0.0
    confidence = coverage * (1.0 / (1.0 + dispersion * 1.5))

    # Determine thresholds based on confidence
    cheap_threshold = 0.80 if confidence < 0.35 else 0.85
    expensive_threshold = 1.20 if confidence < 0.35 else 1.15

    # Determine label
    if avg < cheap_threshold:
        label = "Undervalued"
    elif avg > expensive_threshold:
        label = "Overvalued"
    else:
        label = "Fair"

    # Build explanation
    detail_text = ", ".join(format_valuation_detail(d) for d in details)
    confidence_note = " Low confidence due to limited or inconsistent signals." if confidence < 0.35 else ""

    explanation = (
        f"{label} because the weighted ratio vs sector medians is {avg:.2f}x from "
        f"{count} signals ({detail_text}). Thresholds: <{cheap_threshold:.2f} "
        f"undervalued, >{expensive_threshold:.2f} overvalued.{confidence_note}"
    )

    return {
        "label": label,
        "explanation": explanation,
        "metrics": {
            "trailing_pe": fundamentals.get("trailing_pe"),
            "forward_pe": fundamentals.get("forward_pe"),
            "price_to_book": fundamentals.get("price_to_book"),
            "price_to_sales": fundamentals.get("price_to_sales"),
            "peg_ratio": fundamentals.get("peg_ratio"),
            "weighted_avg": float(avg) if is_valid_number(avg) else None
        },
        "confidence": float(confidence)
    }


def score_profitability(fundamentals: Dict) -> Dict:
    """
    Calculate profitability score based on ROE, ROA, NPM.
    Returns: label (High/Average/Low), explanation, metrics
    """
    roe = safe(fundamentals.get("return_on_equity"))
    roa = safe(fundamentals.get("return_on_assets"))
    npm = safe(fundamentals.get("profit_margin"))

    # Check thresholds
    metrics_info = [
        ("ROE", roe, 0.18, 0.12),
        ("ROA", roa, 0.15, 0.10),
        ("NPM", npm, 0.12, 0.06),
    ]

    high_count = 0
    avg_count = 0
    available = 0
    parts = []

    for name, value, high_threshold, avg_threshold in metrics_info:
        if is_valid_number(value):
            available += 1
            meets_high = value >= high_threshold
            meets_avg = value >= avg_threshold
            if meets_high:
                status = f"meets high {fmt_pct(high_threshold)}"
                high_count += 1
                avg_count += 1
            elif meets_avg:
                status = f"meets avg {fmt_pct(avg_threshold)}"
                avg_count += 1
            else:
                status = f"below avg {fmt_pct(avg_threshold)}"
            parts.append(f"{name} {fmt_pct(value)} ({status})")
        else:
            parts.append(f"{name} n/a (high {fmt_pct(high_threshold)}, avg {fmt_pct(avg_threshold)})")

    if available == 0:
        return {
            "label": "Average",
            "explanation": "Average because ROE/ROA/NPM data is missing.",
            "metrics": {"return_on_equity": None, "return_on_assets": None, "profit_margin": None}
        }

    # Determine label
    if high_count >= 2:
        label = "High"
    elif avg_count >= 1:
        label = "Average"
    else:
        label = "Low"

    missing = len(metrics_info) - available
    missing_note = f" {missing} metric(s) missing." if missing else ""
    explanation = (
        f"{label} because {', '.join(parts)}; met {high_count} of {available} high "
        f"thresholds and {avg_count} of {available} average thresholds.{missing_note}"
    )

    return {
        "label": label,
        "explanation": explanation,
        "metrics": {
            "return_on_equity": fundamentals.get("return_on_equity"),
            "return_on_assets": fundamentals.get("return_on_assets"),
            "profit_margin": fundamentals.get("profit_margin")
        }
    }


def score_growth(income_statement: Optional[Dict]) -> Dict:
    """
    Calculate growth score based on 2Y Revenue & Net Income CAGR.
    Uses income_statement JSONB from stock_fundamentals.
    Returns: label (High/Average/Low), explanation, metrics
    """
    if not income_statement:
        return {
            "label": "Average",
            "explanation": "Average because income statement data is missing.",
            "metrics": {"revenue_cagr": None, "net_income_cagr": None}
        }

    try:
        # income_statement is a dict with year keys
        # Structure: {"2024": {"Total Revenue": ..., "Net Income": ...}, "2023": {...}, ...}
        years = sorted(income_statement.keys(), reverse=True)

        if len(years) < 3:
            return {
                "label": "Average",
                "explanation": "Average because fewer than 3 years of financial data are available.",
                "metrics": {"revenue_cagr": None, "net_income_cagr": None}
            }

        # Get Total Revenue and Net Income for most recent 3 years
        recent_year = years[0]
        oldest_year = years[2]

        rev_recent = safe(income_statement.get(recent_year, {}).get("Total Revenue"))
        rev_old = safe(income_statement.get(oldest_year, {}).get("Total Revenue"))

        ni_recent = safe(income_statement.get(recent_year, {}).get("Net Income"))
        ni_old = safe(income_statement.get(oldest_year, {}).get("Net Income"))

        rev_cagr = cagr(rev_old, rev_recent, 2)
        ni_cagr = cagr(ni_old, ni_recent, 2)

        if not is_valid_number(rev_cagr) and not is_valid_number(ni_cagr):
            return {
                "label": "Average",
                "explanation": "Average because revenue or net income is non-positive, so CAGR is unreliable.",
                "metrics": {"revenue_cagr": None, "net_income_cagr": None}
            }

        # Determine label
        rev_cagr_val = rev_cagr if is_valid_number(rev_cagr) else 0
        ni_cagr_val = ni_cagr if is_valid_number(ni_cagr) else 0

        if rev_cagr_val >= 0.12 and ni_cagr_val >= 0.12:
            label = "High"
        elif rev_cagr_val >= 0.08 or ni_cagr_val >= 0.08:
            label = "Average"
        else:
            label = "Low"

        explanation = (
            f"{label} because revenue CAGR is {fmt_pct(rev_cagr)} and net income CAGR is "
            f"{fmt_pct(ni_cagr)} over ~2 years (High requires both >=12%, Average requires at "
            "least one >=8%)."
        )

        return {
            "label": label,
            "explanation": explanation,
            "metrics": {
                "revenue_cagr": float(rev_cagr) if is_valid_number(rev_cagr) else None,
                "net_income_cagr": float(ni_cagr) if is_valid_number(ni_cagr) else None
            }
        }
    except Exception as e:
        logger.warning(f"Error calculating growth score: {e}")
        return {
            "label": "Average",
            "explanation": f"Average because unable to parse income statement data.",
            "metrics": {"revenue_cagr": None, "net_income_cagr": None}
        }


def score_financial_health(fundamentals: Dict, income_statement: Optional[Dict]) -> Dict:
    """
    Calculate financial health score based on D/E ratio and Interest Coverage.
    Returns: label (Strong/Average/Weak/Unknown), explanation, metrics
    """
    total_debt = safe(fundamentals.get("total_debt"))
    total_equity = None  # Not directly in our DB, estimate from balance sheet or use D/E
    debt_to_equity = safe(fundamentals.get("debt_to_equity"))

    # Try to get EBIT and Interest Expense from income statement
    ebit = np.nan
    interest_expense = np.nan

    if income_statement:
        try:
            years = sorted(income_statement.keys(), reverse=True)
            if years:
                recent = income_statement.get(years[0], {})
                ebit = safe(recent.get("Ebit") or recent.get("Operating Income"))
                interest_expense = safe(recent.get("Interest Expense"))
        except Exception:
            pass

    # Calculate interest coverage
    interest_coverage = np.nan
    if is_valid_number(ebit) and is_valid_number(interest_expense) and interest_expense != 0:
        interest_coverage = abs(ebit / interest_expense)

    de = debt_to_equity
    ic = interest_coverage

    de_display = fmt_num(de) if is_valid_number(de) else "n/a"
    ic_display = f"{ic:.1f}x" if is_valid_number(ic) else "n/a"

    # Determine label
    if not is_valid_number(de) and not is_valid_number(ic):
        label = "Unknown"
        explanation = (
            f"{label} because debt/equity or interest coverage data is missing "
            f"(debt/equity {de_display}, interest coverage {ic_display})."
        )
    else:
        # Use available data for scoring
        de_val = de if is_valid_number(de) else 1.0  # Assume average if missing
        ic_val = ic if is_valid_number(ic) else 3.0  # Assume average if missing

        if de_val <= 0.5 and ic_val >= 5:
            label = "Strong"
        elif de_val <= 1.5 and ic_val >= 2:
            label = "Average"
        else:
            label = "Weak"

        explanation = (
            f"{label} because debt/equity is {de_display} and interest coverage is {ic_display} "
            "(Strong <=0.5 & >=5x, Average <=1.5 & >=2x, Weak otherwise)."
        )

    return {
        "label": label,
        "explanation": explanation,
        "metrics": {
            "debt_to_equity": fundamentals.get("debt_to_equity"),
            "interest_coverage": float(ic) if is_valid_number(ic) else None
        }
    }


def score_business_quality(fundamentals: Dict) -> Dict:
    """
    Calculate business quality score based on ROE + Profit Margin combo.
    Returns: label (Excellent/Good/Weak), explanation, metrics
    """
    roe = safe(fundamentals.get("return_on_equity"))
    margin = safe(fundamentals.get("profit_margin"))

    if not is_valid_number(roe) and not is_valid_number(margin):
        return {
            "label": "Weak",
            "explanation": "Weak because ROE and profit margin data are missing.",
            "metrics": {"return_on_equity": None, "profit_margin": None}
        }

    # Use 0 for missing values (conservative)
    roe_val = roe if is_valid_number(roe) else 0
    margin_val = margin if is_valid_number(margin) else 0

    if roe_val >= 0.18 and margin_val >= 0.12:
        label = "Excellent"
    elif roe_val >= 0.12 and margin_val >= 0.06:
        label = "Good"
    else:
        label = "Weak"

    explanation = (
        f"{label} because ROE is {fmt_pct(roe)} and profit margin is {fmt_pct(margin)} "
        "(Excellent requires ROE>=18% & margin>=12%, Good requires ROE>=12% & margin>=6%)."
    )

    return {
        "label": label,
        "explanation": explanation,
        "metrics": {
            "return_on_equity": fundamentals.get("return_on_equity"),
            "profit_margin": fundamentals.get("profit_margin")
        }
    }


def score_momentum(price_history: List[Dict], current_price: float) -> Dict:
    """
    Calculate momentum score based on 1-year price return.
    Returns: label (Strong/Neutral/Weak), explanation, metrics
    """
    if not price_history or len(price_history) < 252:
        return {
            "label": "Neutral",
            "explanation": "Neutral because there is less than 1 year of price history.",
            "metrics": {"return_1y": None}
        }

    # Get close price from 1 year ago
    close_1y_ago = safe(price_history[-252].get("close"))
    close_current = safe(current_price)

    if not is_valid_number(close_1y_ago) or not is_valid_number(close_current) or close_1y_ago <= 0:
        return {
            "label": "Neutral",
            "explanation": "Neutral because price data is invalid.",
            "metrics": {"return_1y": None}
        }

    ret_1y = (close_current / close_1y_ago) - 1

    if ret_1y >= 0.20:
        label = "Strong"
    elif ret_1y >= 0:
        label = "Neutral"
    else:
        label = "Weak"

    explanation = (
        f"{label} because the 1-year return is {fmt_pct(ret_1y)} "
        "(Strong >=20%, Neutral 0-20%, Weak <0%)."
    )

    return {
        "label": label,
        "explanation": explanation,
        "metrics": {"return_1y": float(ret_1y) if is_valid_number(ret_1y) else None}
    }


def score_entry_rating(price_history: List[Dict], current_price: float) -> Dict:
    """
    Calculate entry rating based on price vs MA200, RSI, 52W high.
    Returns: label (Good/Average/Bad), explanation, metrics
    """
    if not price_history or len(price_history) < 200:
        return {
            "label": "Average",
            "explanation": "Average because there are fewer than 200 trading days of data.",
            "metrics": {"ma200": None, "rsi": None, "high_52w": None, "pct_from_52w_high": None}
        }

    closes = [safe(p.get("close")) for p in price_history]
    closes = [c for c in closes if is_valid_number(c)]

    if len(closes) < 200:
        return {
            "label": "Average",
            "explanation": "Average because insufficient valid price data.",
            "metrics": {"ma200": None, "rsi": None, "high_52w": None, "pct_from_52w_high": None}
        }

    price = safe(current_price)
    ma200 = np.mean(closes[-200:])
    rsi = compute_rsi(closes)
    high_52w = max(closes[-252:]) if len(closes) >= 252 else max(closes)

    if not is_valid_number(price) or price <= 0:
        return {
            "label": "Average",
            "explanation": "Average because current price is invalid.",
            "metrics": {"ma200": None, "rsi": None, "high_52w": None, "pct_from_52w_high": None}
        }

    pct_from_high = (price / high_52w) if high_52w > 0 else np.nan

    # Determine label
    reasons = []
    if price > ma200 and 35 <= rsi <= 60 and pct_from_high < 0.9:
        label = "Good"
        reasons = ["price above 200d MA", "RSI in 35-60 range", ">10% below 52w high"]
    elif price < ma200 or (is_valid_number(rsi) and rsi > 70) or pct_from_high >= 0.95:
        label = "Bad"
        if price < ma200:
            reasons.append("price below 200d MA")
        if is_valid_number(rsi) and rsi > 70:
            reasons.append("RSI above 70")
        if pct_from_high >= 0.95:
            reasons.append("near 52w high")
    else:
        label = "Average"
        if is_valid_number(rsi) and 25 <= rsi < 35:
            reasons.append("RSI in 25-35 (oversold but risky)")
        else:
            reasons.append("mixed signals")

    rsi_display = f"{rsi:.1f}" if is_valid_number(rsi) else "n/a"
    explanation = (
        f"{label} because {', '.join(reasons)} (price {fmt_num(price)}, MA200 {fmt_num(ma200)}, "
        f"RSI {rsi_display}, 52w high {fmt_num(high_52w)})."
    )

    return {
        "label": label,
        "explanation": explanation,
        "metrics": {
            "ma200": float(ma200) if is_valid_number(ma200) else None,
            "rsi": float(rsi) if is_valid_number(rsi) else None,
            "high_52w": float(high_52w) if is_valid_number(high_52w) else None,
            "pct_from_52w_high": float(pct_from_high) if is_valid_number(pct_from_high) else None
        }
    }


# ======================
# Main Scorecard Function
# ======================

async def calculate_stock_scorecard(ticker: str, conn) -> Dict:
    """
    Calculate full 7-dimension stock scorecard.
    Uses Redis caching with locking to prevent duplicate calculations.

    Accepts ticker with or without .NS suffix (e.g., "RELIANCE" or "RELIANCE.NS").
    Internally normalizes to plain symbol for consistent caching.
    """
    # Normalize ticker: strip .NS suffix for consistent cache keys
    ticker_upper = ticker.upper().replace('.NS', '')
    cache_key = f"scorecard:{ticker_upper}"
    lock_key = f"lock:{cache_key}"

    # 1. Check cache
    cached = get_cached(cache_key)
    if cached:
        logger.debug(f"Scorecard cache HIT for {ticker_upper}")
        return cached

    # 2. Acquire lock
    if try_acquire_lock(lock_key, ttl=LOCK_TTL_SCORECARD):
        try:
            # Double-check cache
            cached = get_cached(cache_key)
            if cached:
                return cached

            # 3. Calculate scorecard
            result = await _do_calculate_scorecard(ticker_upper, conn)

            # 4. Cache with market-aware TTL
            ttl = TTL_STOCK_SCORECARD_MARKET if is_market_open() else TTL_STOCK_SCORECARD
            set_cached(cache_key, result, ttl)

            logger.info(f"Scorecard calculated for {ticker_upper}, cached for {ttl}s")
            return result
        finally:
            release_lock(lock_key)
    else:
        # Lock held by another process, wait and retry cache
        await asyncio.sleep(0.5)
        cached = get_cached(cache_key)
        if cached:
            return cached
        # Fallback: calculate without caching (rare)
        return await _do_calculate_scorecard(ticker_upper, conn)


async def _do_calculate_scorecard(ticker: str, conn) -> Dict:
    """Internal function to calculate scorecard (no caching logic)."""

    # 1. Fetch fundamentals from database
    fundamentals = await _fetch_fundamentals(ticker, conn)

    if not fundamentals:
        return {
            "ticker": ticker,
            "error": "Stock not found or no fundamental data available",
            "scores": None,
            "data_availability": {"fundamentals": False}
        }

    sector = fundamentals.get("sector") or "All"

    # 2. Get sector medians
    sector_medians = await get_sector_medians(sector, conn)

    # 3. Fetch price history for momentum/entry rating
    price_history = await _fetch_price_history(fundamentals.get("ticker_id"), conn)
    current_price = safe(fundamentals.get("current_price"))

    # 4. Get income statement JSONB for growth/financial health
    income_statement = fundamentals.get("income_statement")

    # 5. Calculate all 7 scores
    scores = {
        "valuation": score_valuation(fundamentals, sector_medians, sector),
        "profitability": score_profitability(fundamentals),
        "growth": score_growth(income_statement),
        "financial_health": score_financial_health(fundamentals, income_statement),
        "business_quality": score_business_quality(fundamentals),
        "momentum": score_momentum(price_history, current_price),
        "entry_rating": score_entry_rating(price_history, current_price),
    }

    return {
        "ticker": ticker,
        "sector": sector,
        "current_price": current_price if is_valid_number(current_price) else None,
        "scores": scores,
        "data_availability": {
            "fundamentals": True,
            "sector_medians": bool(sector_medians),
            "price_history": len(price_history) if price_history else 0,
            "income_statement": bool(income_statement)
        },
        "calculated_at": datetime.utcnow().isoformat()
    }


async def _fetch_fundamentals(ticker: str, conn) -> Optional[Dict]:
    """Fetch fundamentals from stock_fundamentals table."""
    query = """
        SELECT
            t.id as ticker_id,
            t.symbol,
            sf.sector,
            sf.industry,
            sf.current_price,
            sf.trailing_pe,
            sf.forward_pe,
            sf.price_to_book,
            sf.price_to_sales,
            sf.peg_ratio,
            sf.return_on_equity,
            sf.return_on_assets,
            sf.profit_margin,
            sf.operating_margin,
            sf.debt_to_equity,
            sf.total_debt,
            sf.total_cash,
            sf.revenue_growth,
            sf.earnings_growth,
            sf.income_statement
        FROM tickers t
        LEFT JOIN stock_fundamentals sf ON t.id = sf.ticker_id
        WHERE t.symbol = %s OR t.symbol = %s
        LIMIT 1
    """

    # Handle both SYMBOL.NS and SYMBOL formats
    ticker_ns = ticker if ticker.endswith('.NS') else f"{ticker}.NS"
    ticker_plain = ticker.replace('.NS', '')

    with conn.cursor() as cur:
        cur.execute(query, (ticker_ns, ticker_plain))
        row = cur.fetchone()

    if not row:
        return None

    columns = [
        "ticker_id", "symbol", "sector", "industry", "current_price",
        "trailing_pe", "forward_pe", "price_to_book", "price_to_sales", "peg_ratio",
        "return_on_equity", "return_on_assets", "profit_margin", "operating_margin",
        "debt_to_equity", "total_debt", "total_cash", "revenue_growth", "earnings_growth",
        "income_statement"
    ]

    return dict(zip(columns, row))


async def _fetch_price_history(ticker_id: int, conn, days: int = 400) -> List[Dict]:
    """Fetch daily price history from ohlc_daily for momentum/entry calculations."""
    if not ticker_id:
        return []

    query = """
        SELECT day, open, high, low, close, volume
        FROM ohlc_daily
        WHERE ticker_id = %s
        ORDER BY day DESC
        LIMIT %s
    """

    with conn.cursor() as cur:
        cur.execute(query, (ticker_id, days))
        rows = cur.fetchall()

    if not rows:
        return []

    # Return in chronological order (oldest first)
    history = []
    for row in reversed(rows):
        history.append({
            "day": row[0].isoformat() if row[0] else None,
            "open": row[1],
            "high": row[2],
            "low": row[3],
            "close": row[4],
            "volume": row[5]
        })

    return history
