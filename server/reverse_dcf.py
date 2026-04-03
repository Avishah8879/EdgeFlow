# ============================================================
# Reverse DCF Module
# Calculates implied growth rate from current market valuation
# ============================================================

import math
import logging
from dataclasses import dataclass, replace, asdict
from functools import lru_cache
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import yfinance as yf

# -------------------------
# Constants
# -------------------------
DEFAULT_WACC = 0.10
DEFAULT_TERMINAL_GROWTH = 0.03
DEFAULT_FORECAST_YEARS = 5
DEFAULT_TAX_RATE = 0.25  # India corporate tax rate
DEFAULT_REINVESTMENT_RATE = 0.0

# Solver controls
G_MIN = -0.80  # Minimum growth rate to search
G_MAX = 2.00   # Maximum growth rate to search
G_STEP = 0.02  # Grid step size
MAX_ITERS = 200

# Convergence tolerances
G_TOL = 1e-6
REL_EQUITY_TOL = 1e-4
ABS_EQUITY_TOL = 1e6

# -------------------------
# Helper functions
# -------------------------
def to_float(value: Any) -> Optional[float]:
    """Safely convert value to float, handling NaN and None."""
    if value is None:
        return None
    try:
        if isinstance(value, float) and math.isnan(value):
            return None
    except TypeError:
        pass
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def latest_from_row(row) -> Optional[float]:
    """
    Get the latest (most recent date) value from a DataFrame row.

    yfinance returns columns as dates - we sort descending to get newest first.
    """
    try:
        # Sort columns by date descending (newest first)
        sorted_row = row.sort_index(ascending=False)
        for val in sorted_row:
            v = to_float(val)
            if v is not None:
                return v
    except Exception:
        # Fallback: just return first value
        return to_float(row.iloc[0]) if len(row) > 0 else None
    return None


def pick_latest(df, labels: List[str]) -> Optional[float]:
    """Pick the latest value from a DataFrame for given row labels."""
    if df is None or getattr(df, "empty", True):
        return None
    for label in labels:
        if label in df.index:
            return latest_from_row(df.loc[label])
    # Try case-insensitive match
    lower_map = {str(i).lower(): i for i in df.index}
    for label in labels:
        if label.lower() in lower_map:
            return latest_from_row(df.loc[lower_map[label.lower()]])
    return None


def clamp_rate(value: Optional[float], lower: float = 0.0, upper: float = 0.6) -> Optional[float]:
    """Clamp a rate value to a reasonable range."""
    if value is None:
        return None
    return max(lower, min(upper, value))


def format_indian_currency(value: float) -> str:
    """Format large numbers in Indian notation (Cr, L)."""
    if value is None:
        return "N/A"
    abs_value = abs(value)
    if abs_value >= 1e7:  # Crores
        return f"{'−' if value < 0 else ''}₹{abs_value / 1e7:.2f} Cr"
    elif abs_value >= 1e5:  # Lakhs
        return f"{'−' if value < 0 else ''}₹{abs_value / 1e5:.2f} L"
    else:
        return f"{'−' if value < 0 else ''}₹{abs_value:,.2f}"


def valuation_status(implied_cagr: Optional[float], wacc: float) -> Optional[str]:
    """
    Determine valuation status based on implied CAGR vs WACC spread.

    Spread = Implied CAGR - WACC

    | Spread         | Status        | Interpretation                           |
    |----------------|---------------|------------------------------------------|
    | < 0%           | Conservative  | Market has low growth expectations       |
    | 0% to 2%       | Fairly valued | Reasonable baseline expectations         |
    | 2% to 4%       | Reasonable    | Healthy growth premium above WACC        |
    | 4% to 5%       | Fairly valued | Upper range of reasonable                |
    | >= 5%          | Aggressive    | Market expects exceptional growth        |
    """
    if implied_cagr is None:
        return None

    spread = implied_cagr - wacc

    if spread < 0:
        return "Conservative"
    elif 0.02 <= spread <= 0.04:
        return "Reasonable"
    elif spread >= 0.05:
        return "Aggressive"
    else:
        # 0 <= spread < 0.02 OR 0.04 < spread < 0.05
        return "Fairly valued"


# -------------------------
# Exceptions & Data model
# -------------------------
class NoSolutionError(Exception):
    """Raised when the DCF solver cannot find an implied growth rate."""
    pass


@dataclass
class DCFInputs:
    """Inputs for Reverse DCF calculation."""
    starting_revenue: float
    ebit_margin: float
    tax_rate: float
    reinvestment_rate: float
    wacc: float
    terminal_growth: float
    forecast_years: int
    net_debt: float
    shares_out: float
    target_price: Optional[float] = None
    market_cap: Optional[float] = None


# -------------------------
# Cached Yahoo Finance fetch
# -------------------------
@lru_cache(maxsize=64)
def fetch_ticker_data(symbol: str) -> Dict[str, Any]:
    """
    Fetch financial data from yfinance with in-memory caching.

    Note: This is process-level caching. Redis caching is done at API level.
    """
    logging.info(f"[ReverseDCF] Fetching yfinance data for {symbol}")
    try:
        t = yf.Ticker(symbol)
        info = t.info or {}

        # Check if we got valid data
        if not info or info.get("regularMarketPrice") is None:
            logging.warning(f"[ReverseDCF] No valid data for {symbol}")
            return {"info": {}, "financials": None, "balance": None, "has_data": False}

        return {
            "info": info,
            "financials": t.financials,
            "balance": t.balance_sheet,
            "has_data": True,
        }
    except Exception as e:
        logging.error(f"[ReverseDCF] yfinance error for {symbol}: {e}")
        return {"info": {}, "financials": None, "balance": None, "has_data": False}


# -------------------------
# Vectorized Reverse DCF engine
# -------------------------
class ReverseDCF:
    """Reverse DCF solver using bisection method."""

    @staticmethod
    def equity_value_given_growth(inputs: DCFInputs, g: float) -> Tuple[float, float, float]:
        """
        Calculate equity value for a given growth rate.

        Returns: (equity_value, enterprise_value, price_per_share)
        """
        t = np.arange(1, inputs.forecast_years + 1)
        rev = inputs.starting_revenue * (1 + g) ** t
        nopat = rev * inputs.ebit_margin * (1 - inputs.tax_rate)
        fcfs = nopat * (1 - inputs.reinvestment_rate)

        pv_fcfs = np.sum(fcfs / (1 + inputs.wacc) ** t)

        # Ensure terminal growth < WACC
        g_term = min(inputs.terminal_growth, inputs.wacc - 1e-6)
        tv = fcfs[-1] * (1 + g_term) / (inputs.wacc - g_term)
        pv_tv = tv / (1 + inputs.wacc) ** inputs.forecast_years

        ev = pv_fcfs + pv_tv
        equity = ev - inputs.net_debt
        price = equity / inputs.shares_out if inputs.shares_out > 0 else 0

        return float(equity), float(ev), float(price)

    @staticmethod
    def solve_implied_growth(
        inputs: DCFInputs,
        use_market_cap: bool = True
    ) -> Tuple[float, float, float, float, int]:
        """
        Grid search + bisection method to find implied growth rate.

        Uses a coarse grid search to find the best bracket, then refines with bisection.

        Args:
            inputs: DCF inputs
            use_market_cap: If True, solve for market cap. If False, solve for target_price.

        Returns: (implied_growth, equity_value, enterprise_value, price, iterations)
        """
        if use_market_cap:
            target_equity = inputs.market_cap if inputs.market_cap else 0
        else:
            target_equity = inputs.target_price * inputs.shares_out if inputs.target_price else 0

        if target_equity <= 0:
            return 0.0, 0.0, 0.0, 0.0, 0

        def f(g: float) -> Optional[float]:
            eq, _, _ = ReverseDCF.equity_value_given_growth(inputs, g)
            if not np.isfinite(eq):
                return None
            return eq - target_equity

        # Grid search to find bracket with sign change
        gs = np.arange(G_MIN, G_MAX + G_STEP, G_STEP)
        vals = [f(g) for g in gs]

        # Find the best bracket (one with smallest mid-point error)
        bracket = None
        best_mid_abs = None

        for i in range(len(gs) - 1):
            f1, f2 = vals[i], vals[i + 1]
            if f1 is None or f2 is None:
                continue
            if f1 * f2 < 0:  # Sign change = root exists in this interval
                mid = 0.5 * (gs[i] + gs[i + 1])
                fmid = f(mid) or (f1 + f2) / 2
                score = abs(fmid)
                if best_mid_abs is None or score < best_mid_abs:
                    best_mid_abs = score
                    bracket = (gs[i], gs[i + 1], f1, f2)

        if bracket is None:
            # No solution found in search range
            logging.warning(f"[ReverseDCF] No implied growth rate found for target equity {target_equity}")
            return 0.0, 0.0, 0.0, 0.0, 0

        a, b, fa, fb = bracket
        tol_equity = max(ABS_EQUITY_TOL, REL_EQUITY_TOL * abs(target_equity))

        # Bisection refinement
        m = 0.5 * (a + b)
        for it in range(1, MAX_ITERS + 1):
            m = 0.5 * (a + b)
            fm = f(m)
            if fm is None:
                a = m
                continue

            if abs(fm) <= tol_equity or (b - a) <= G_TOL:
                eq, ev, px = ReverseDCF.equity_value_given_growth(inputs, m)
                return m, eq, ev, px, it

            if fa * fm < 0:
                b = m
            else:
                a = m
                fa = fm

        eq, ev, px = ReverseDCF.equity_value_given_growth(inputs, m)
        return m, eq, ev, px, MAX_ITERS


# -------------------------
# Input extraction
# -------------------------
def extract_dcf_inputs(
    symbol: str,
    target_price: Optional[float] = None,
    wacc: float = DEFAULT_WACC,
    terminal_growth: float = DEFAULT_TERMINAL_GROWTH,
    forecast_years: int = DEFAULT_FORECAST_YEARS
) -> Tuple[DCFInputs, List[str]]:
    """
    Extract DCF inputs from yfinance data with fallbacks.

    Returns: (DCFInputs, list of warnings/notes)
    """
    td = fetch_ticker_data(symbol)
    info, fin, bal = td["info"], td["financials"], td["balance"]
    warnings: List[str] = []

    if not td["has_data"]:
        raise ValueError(f"Could not fetch data for {symbol}")

    # Revenue
    rev = pick_latest(fin, ["Total Revenue", "Revenue"])
    if rev is None or rev <= 0:
        raise ValueError(f"Missing or invalid revenue data for {symbol}")

    # EBIT margin
    ebit = pick_latest(fin, ["Ebit", "EBIT", "Operating Income"])
    if ebit is not None:
        ebit_margin = ebit / rev
    else:
        # Fallback: use profit margin * 0.8
        profit_margin = to_float(info.get("profitMargins"))
        if profit_margin is not None:
            ebit_margin = profit_margin * 0.8
            warnings.append("EBIT margin estimated from profit margin")
        else:
            ebit_margin = 0.10  # Default 10%
            warnings.append("EBIT margin defaulted to 10%")

    # Tax rate
    tax_rate = to_float(info.get("effectiveTaxRate"))
    if tax_rate is not None:
        tax_rate = clamp_rate(tax_rate, 0.0, 0.5)
    else:
        # Try to compute from financials
        tax_exp = pick_latest(fin, ["Income Tax Expense", "Tax Provision"])
        pretax = pick_latest(fin, ["Pretax Income", "Ebt", "Income Before Tax"])
        if tax_exp is not None and pretax and pretax != 0:
            tax_rate = clamp_rate(tax_exp / pretax, 0.0, 0.5)
        else:
            tax_rate = DEFAULT_TAX_RATE
            warnings.append(f"Tax rate assumed at {DEFAULT_TAX_RATE*100:.0f}%")

    # Net debt
    debt = to_float(info.get("totalDebt"))
    cash = to_float(info.get("totalCash"))
    if debt is not None and cash is not None:
        net_debt = debt - cash
    elif debt is not None:
        net_debt = debt
        warnings.append("Net debt estimated (cash data unavailable)")
    else:
        net_debt = 0.0
        warnings.append("Net debt defaulted to 0")

    # Shares outstanding
    shares = to_float(info.get("sharesOutstanding"))
    if shares is None or shares <= 0:
        raise ValueError(f"Missing shares outstanding for {symbol}")

    # Market cap
    mcap = to_float(info.get("marketCap"))
    if mcap is None:
        # Try to compute from price and shares
        price = to_float(info.get("regularMarketPrice") or info.get("currentPrice"))
        if price and shares:
            mcap = price * shares

    inputs = DCFInputs(
        starting_revenue=rev,
        ebit_margin=ebit_margin,
        tax_rate=tax_rate,
        reinvestment_rate=DEFAULT_REINVESTMENT_RATE,
        wacc=wacc,
        terminal_growth=terminal_growth,
        forecast_years=forecast_years,
        net_debt=net_debt,
        shares_out=shares,
        market_cap=mcap,
        target_price=target_price,
    )

    return inputs, warnings


# -------------------------
# Main entry point
# -------------------------
def run_reverse_dcf(
    symbol: str,
    target_price: Optional[float] = None,
    wacc: float = DEFAULT_WACC,
    terminal_growth: float = DEFAULT_TERMINAL_GROWTH,
    forecast_years: int = DEFAULT_FORECAST_YEARS
) -> Dict[str, Any]:
    """
    Main entry point for Reverse DCF calculation.

    Args:
        symbol: Stock symbol (e.g., "RELIANCE.NS")
        target_price: Optional user-provided target price
        wacc: Weighted average cost of capital (default 10%)
        terminal_growth: Terminal growth rate (default 3%)
        forecast_years: Number of forecast years (default 5)

    Returns:
        Dictionary with DCF results, warnings, and inputs used
    """
    logging.info(f"[ReverseDCF] Running for {symbol}, target_price={target_price}, wacc={wacc}")

    try:
        inputs, warnings = extract_dcf_inputs(
            symbol, target_price, wacc, terminal_growth, forecast_years
        )
    except ValueError as e:
        return {
            "success": False,
            "error": str(e),
            "ticker": symbol,
        }

    # Sanity checks
    if inputs.wacc <= inputs.terminal_growth:
        warnings.append("WACC <= terminal growth (invalid Gordon growth model)")

    if inputs.ebit_margin > 0.5:
        warnings.append("EBIT margin unusually high (>50%)")

    # Solve for market-implied growth
    mg, meq, mev, mpx, mit = ReverseDCF.solve_implied_growth(inputs, use_market_cap=True)

    # Solve for target-price-implied growth (if target provided)
    tg, teq, tev, tpx, tit = (None, None, None, None, None)
    if target_price is not None:
        inputs_with_target = replace(inputs, target_price=target_price)
        tg, teq, tev, tpx, tit = ReverseDCF.solve_implied_growth(
            inputs_with_target, use_market_cap=False
        )

    # Add growth rate warnings
    if mg > 0.25:
        warnings.append("Market-implied growth >25% may be unrealistic")
    if mg < -0.10:
        warnings.append("Negative implied growth suggests overvaluation")

    # Determine valuation status
    current_price = inputs.market_cap / inputs.shares_out if inputs.market_cap and inputs.shares_out else 0

    # Get valuation status using the helper function
    market_status = valuation_status(mg, inputs.wacc)
    target_status = valuation_status(tg, inputs.wacc) if tg is not None else None

    # Calculate upside based on target implied growth vs market implied
    upside_percent = None
    if target_price and current_price > 0:
        upside_percent = ((target_price - current_price) / current_price) * 100

    # Determine data quality
    if len(warnings) == 0:
        data_quality = "Good"
    elif len(warnings) <= 2:
        data_quality = "Partial"
    else:
        data_quality = "Estimated"

    return {
        "success": True,
        "ticker": symbol,

        # Market implied results
        "implied_growth_rate": round(mg * 100, 2),  # As percentage
        "enterprise_value": round(mev, 2),
        "equity_value": round(meq, 2),
        "implied_price": round(mpx, 2),

        # Target price implied results (if provided)
        "implied_growth_rate_target": round(tg * 100, 2) if tg is not None else None,
        "enterprise_value_target": round(tev, 2) if tev is not None else None,
        "equity_value_target": round(teq, 2) if teq is not None else None,
        "implied_price_target": round(tpx, 2) if tpx is not None else None,

        # Current valuation
        "current_price": round(current_price, 2),
        "target_price": target_price,
        "upside_percent": round(upside_percent, 2) if upside_percent is not None else None,
        "valuation_status": market_status,
        "valuation_status_target": target_status,

        # Data quality
        "data_quality": data_quality,
        "warnings": warnings,

        # Inputs used (for transparency)
        "inputs_used": {
            "starting_revenue": round(inputs.starting_revenue, 2),
            "ebit_margin": round(inputs.ebit_margin * 100, 2),  # As percentage
            "tax_rate": round(inputs.tax_rate * 100, 2),  # As percentage
            "reinvestment_rate": round(inputs.reinvestment_rate * 100, 2),
            "wacc": round(inputs.wacc * 100, 2),  # As percentage
            "terminal_growth": round(inputs.terminal_growth * 100, 2),  # As percentage
            "forecast_years": inputs.forecast_years,
            "net_debt": round(inputs.net_debt, 2),
            "shares_outstanding": round(inputs.shares_out, 2),
            "market_cap": round(inputs.market_cap, 2) if inputs.market_cap else None,
        },

        # Solver info
        "solver_iterations": mit,
    }


# -------------------------
# Clear cache utility
# -------------------------
def clear_yfinance_cache():
    """Clear the in-memory yfinance cache."""
    fetch_ticker_data.cache_clear()
    logging.info("[ReverseDCF] yfinance cache cleared")
