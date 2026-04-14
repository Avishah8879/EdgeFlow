"""
Options Chain Visualizer - Gamma Exposure Calculations

This module provides gamma exposure (GxOI, GEX) calculations and IV surface
data for the Options Visualiser window.

Key functions:
- bs_gamma: Black-Scholes gamma calculation
- compute_exposures: Calculate GxOI and GEX by strike
- build_iv_surface: Build IV surface data for 3D visualization
- Time series storage for ATM GxOI tracking
"""

import json
import logging
import math
from datetime import datetime, timedelta, date
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from scipy.stats import norm

from redis_cache import get_redis, cache_get, cache_set

logger = logging.getLogger(__name__)

# =============================================================================
# Constants
# =============================================================================

IST = ZoneInfo("Asia/Kolkata")
RISK_FREE_RATE = 0.065  # India risk-free rate (~6.5%)

# NSE Trading Holidays 2025
NSE_HOLIDAYS_2025 = {
    date(2025, 2, 26),   # Mahashivratri
    date(2025, 3, 14),   # Holi
    date(2025, 3, 31),   # Id-Ul-Fitr
    date(2025, 4, 10),   # Shri Mahavir Jayanti
    date(2025, 4, 14),   # Dr. Ambedkar Jayanti
    date(2025, 4, 18),   # Good Friday
    date(2025, 5, 1),    # Maharashtra Day
    date(2025, 6, 7),    # Bakri Id
    date(2025, 8, 15),   # Independence Day
    date(2025, 8, 27),   # Janmashtami
    date(2025, 10, 2),   # Gandhi Jayanti
    date(2025, 10, 21),  # Diwali Laxmi Pujan
    date(2025, 10, 22),  # Diwali Balipratipada
    date(2025, 11, 5),   # Prakash Gurpurab Sri Guru Nanak Dev
    date(2025, 12, 25),  # Christmas
}

# NSE Trading Holidays 2026 (partial - add more as NSE announces)
NSE_HOLIDAYS_2026 = {
    date(2026, 1, 26),  # Republic Day
}

ALL_HOLIDAYS = NSE_HOLIDAYS_2025 | NSE_HOLIDAYS_2026


# =============================================================================
# Market Hours & Trading Day Utilities
# =============================================================================

def is_trading_day(dt: date) -> bool:
    """Check if a given date is a trading day (not weekend, not holiday)."""
    if dt.weekday() >= 5:  # Saturday = 5, Sunday = 6
        return False
    if dt in ALL_HOLIDAYS:
        return False
    return True


def is_market_hours() -> bool:
    """Check if NSE market is currently open."""
    now = datetime.now(IST)

    # Must be a trading day
    if not is_trading_day(now.date()):
        return False

    # Market hours: 9:15 AM - 3:30 PM IST
    market_open = now.replace(hour=9, minute=15, second=0, microsecond=0)
    market_close = now.replace(hour=15, minute=30, second=0, microsecond=0)

    return market_open <= now <= market_close


def get_ttl_until_next_market_open() -> int:
    """
    Calculate seconds until next market open (9:15 AM IST).
    Accounts for weekends and holidays.
    """
    now = datetime.now(IST)

    # Start with next 9:15 AM
    next_open = now.replace(hour=9, minute=15, second=0, microsecond=0)
    if now >= next_open:
        next_open += timedelta(days=1)

    # Skip non-trading days (weekends + holidays)
    while not is_trading_day(next_open.date()):
        next_open += timedelta(days=1)

    return int((next_open - now).total_seconds())


def get_visualization_ttl() -> int:
    """Get appropriate TTL for visualization cache."""
    if is_market_hours():
        return 10  # 10 seconds during market hours
    else:
        return get_ttl_until_next_market_open()


# =============================================================================
# Black-Scholes Greeks
# =============================================================================

def bs_gamma(S: float, K: float, T: float, r: float, sigma: float) -> float:
    """
    Calculate Black-Scholes gamma.

    Args:
        S: Spot price
        K: Strike price
        T: Time to expiry in years
        r: Risk-free rate (decimal)
        sigma: Implied volatility (decimal, e.g., 0.20 for 20%)

    Returns:
        Gamma value
    """
    if S <= 0 or K <= 0 or sigma <= 0 or T <= 0:
        return 0.0

    try:
        d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
        gamma = norm.pdf(d1) / (S * sigma * math.sqrt(T))
        return gamma
    except (ValueError, ZeroDivisionError):
        return 0.0


def bs_vega(S: float, K: float, T: float, r: float, sigma: float) -> float:
    """
    Calculate Black-Scholes vega (sensitivity of option price to volatility).

    Args:
        S: Spot price
        K: Strike price
        T: Time to expiry in years
        r: Risk-free rate (decimal)
        sigma: Implied volatility (decimal, e.g., 0.20 for 20%)

    Returns:
        Vega value (change in option price per 1% change in IV)
    """
    if S <= 0 or K <= 0 or sigma <= 0 or T <= 0:
        return 0.0

    try:
        d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
        vega = S * norm.pdf(d1) * math.sqrt(T) / 100  # Per 1% IV change
        return vega
    except (ValueError, ZeroDivisionError):
        return 0.0


def time_to_expiry_years(expiry_str: str) -> float:
    """
    Calculate time to expiry in years.

    Args:
        expiry_str: Expiry date string in format "DD-Mon-YYYY" (e.g., "26-Dec-2024")

    Returns:
        Time to expiry in years (minimum 1 microsecond to avoid division by zero)
    """
    try:
        expiry_dt = datetime.strptime(expiry_str, "%d-%b-%Y")
        expiry_dt = expiry_dt.replace(hour=15, minute=30, tzinfo=IST)
    except ValueError:
        return 1e-6

    now = datetime.now(IST)
    seconds = (expiry_dt - now).total_seconds()

    if seconds <= 0:
        return 1e-6  # Minimum to avoid division by zero

    return seconds / (365 * 24 * 3600)


# =============================================================================
# Exposure Calculations
# =============================================================================

def compute_exposures(chain_data: Dict[str, Any], spot: float) -> Dict[str, Any]:
    """
    Compute GxOI and GEX for each strike.

    Args:
        chain_data: Option chain data with 'calls', 'puts', 'expiry' keys
        spot: Current spot price

    Returns:
        Dict with:
        - by_strike: List of exposure data per strike
        - atm_strike: ATM strike price
        - atm_gxoi: Net GxOI at ATM
        - total_gex: Total GEX (market gamma regime indicator)
        - spot: Current spot price
        - timestamp: ISO timestamp
    """
    expiry_str = chain_data.get("expiry")
    if not expiry_str:
        return _empty_exposure_response(spot)

    T = time_to_expiry_years(expiry_str)

    calls = chain_data.get("calls", [])
    puts = chain_data.get("puts", [])

    # Build strike maps
    call_map = {c.get("strike"): c for c in calls if c.get("strike")}
    put_map = {p.get("strike"): p for p in puts if p.get("strike")}
    all_strikes = sorted(set(call_map.keys()) | set(put_map.keys()))

    if not all_strikes:
        return _empty_exposure_response(spot)

    # Find ATM strike
    atm_strike = min(all_strikes, key=lambda k: abs(k - spot))

    exposures = []
    total_gex = 0.0

    for strike in all_strikes:
        ce = call_map.get(strike, {})
        pe = put_map.get(strike, {})

        # Get IV (convert from percentage if > 1)
        ce_iv_raw = _safe_float(ce.get("impliedVolatility", 0))
        pe_iv_raw = _safe_float(pe.get("impliedVolatility", 0))
        ce_iv = ce_iv_raw / 100 if ce_iv_raw > 1 else ce_iv_raw
        pe_iv = pe_iv_raw / 100 if pe_iv_raw > 1 else pe_iv_raw

        # Get OI
        ce_oi = _safe_int(ce.get("openInterest", 0))
        pe_oi = _safe_int(pe.get("openInterest", 0))

        # Calculate gammas
        ce_gamma = bs_gamma(spot, strike, T, RISK_FREE_RATE, ce_iv) if ce_iv > 0.001 else 0
        pe_gamma = bs_gamma(spot, strike, T, RISK_FREE_RATE, pe_iv) if pe_iv > 0.001 else 0

        # Calculate vegas
        ce_vega = bs_vega(spot, strike, T, RISK_FREE_RATE, ce_iv) if ce_iv > 0.001 else 0
        pe_vega = bs_vega(spot, strike, T, RISK_FREE_RATE, pe_iv) if pe_iv > 0.001 else 0

        # GxOI = Gamma * OI (raw gamma exposure)
        ce_gxoi = ce_gamma * ce_oi
        pe_gxoi = pe_gamma * pe_oi

        # VxOI = Vega * OI (raw vega exposure)
        ce_vxoi = ce_vega * ce_oi
        pe_vxoi = pe_vega * pe_oi

        # GEX (SqueezeMetrics formula):
        # Dealers are typically short options, so:
        # - Short calls: positive gamma exposure (move with market)
        # - Short puts: negative gamma exposure (move against market)
        ce_gex = ce_gxoi * spot * 100  # Scale by spot and contract size
        pe_gex = -pe_gxoi * spot * 100  # Negative for puts

        # VEX (Vega Exposure): same dealer-short logic
        ce_vex = ce_vxoi * 100   # Scale by contract size
        pe_vex = -pe_vxoi * 100  # Negative for puts

        net_gxoi = ce_gxoi - pe_gxoi
        net_gex = ce_gex + pe_gex
        net_vxoi = ce_vxoi - pe_vxoi
        net_vex = ce_vex + pe_vex
        total_gex += net_gex

        exposures.append({
            "strike": strike,
            "ce_gxoi": round(ce_gxoi, 4),
            "pe_gxoi": round(pe_gxoi, 4),
            "net_gxoi": round(net_gxoi, 4),
            "ce_gex": round(ce_gex, 2),
            "pe_gex": round(pe_gex, 2),
            "net_gex": round(net_gex, 2),
            "ce_vxoi": round(ce_vxoi, 4),
            "pe_vxoi": round(pe_vxoi, 4),
            "net_vxoi": round(net_vxoi, 4),
            "ce_vex": round(ce_vex, 2),
            "pe_vex": round(pe_vex, 2),
            "net_vex": round(net_vex, 2),
            "ce_oi": ce_oi,
            "pe_oi": pe_oi,
            "ce_iv": round(ce_iv * 100, 2),
            "pe_iv": round(pe_iv * 100, 2),
        })

    # Get ATM exposure
    atm_data = next((e for e in exposures if e["strike"] == atm_strike), None)
    atm_gxoi = atm_data["net_gxoi"] if atm_data else 0

    # Determine gamma regime
    gamma_regime = "LONG GAMMA" if total_gex > 0 else "SHORT GAMMA"

    return {
        "by_strike": exposures,
        "atm_strike": atm_strike,
        "atm_gxoi": round(atm_gxoi, 4),
        "total_gex": round(total_gex, 2),
        "gamma_regime": gamma_regime,
        "spot": spot,
        "expiry": expiry_str,
        "timestamp": datetime.now(IST).isoformat(),
    }


def _empty_exposure_response(spot: float) -> Dict[str, Any]:
    """Return empty exposure response."""
    return {
        "by_strike": [],
        "atm_strike": None,
        "atm_gxoi": 0,
        "total_gex": 0,
        "gamma_regime": "UNKNOWN",
        "spot": spot,
        "expiry": None,
        "timestamp": datetime.now(IST).isoformat(),
    }


# =============================================================================
# IV Surface
# =============================================================================

def build_iv_surface(chain_data: Dict[str, Any], spot: float) -> Dict[str, Any]:
    """
    Build IV surface data for 3D visualization.

    Args:
        chain_data: Option chain data
        spot: Current spot price

    Returns:
        Dict with strikes, IV values, moneyness, and metadata
    """
    calls = chain_data.get("calls", [])
    puts = chain_data.get("puts", [])

    # Build strike -> IV map (average of CE and PE)
    call_map = {c.get("strike"): c for c in calls if c.get("strike")}
    put_map = {p.get("strike"): p for p in puts if p.get("strike")}
    all_strikes = sorted(set(call_map.keys()) | set(put_map.keys()))

    if not all_strikes:
        return _empty_surface_response(spot, chain_data.get("expiry"))

    strikes = []
    iv_values = []
    moneyness = []

    for strike in all_strikes:
        ce = call_map.get(strike, {})
        pe = put_map.get(strike, {})

        ce_iv = _safe_float(ce.get("impliedVolatility", 0))
        pe_iv = _safe_float(pe.get("impliedVolatility", 0))

        # Convert from percentage if needed
        if ce_iv > 1:
            ce_iv /= 100
        if pe_iv > 1:
            pe_iv /= 100

        # Use average IV, or whichever is available
        if ce_iv > 0.001 and pe_iv > 0.001:
            avg_iv = (ce_iv + pe_iv) / 2
        else:
            avg_iv = ce_iv or pe_iv

        if avg_iv > 0.001:  # Only include valid IV
            strikes.append(strike)
            iv_values.append(round(avg_iv * 100, 2))  # Store as percentage
            moneyness.append(round(strike / spot, 4))

    return {
        "strikes": strikes,
        "iv_values": iv_values,
        "moneyness": moneyness,
        "spot": spot,
        "expiry": chain_data.get("expiry"),
        "timestamp": datetime.now(IST).isoformat(),
    }


def _empty_surface_response(spot: float, expiry: Optional[str]) -> Dict[str, Any]:
    """Return empty surface response."""
    return {
        "strikes": [],
        "iv_values": [],
        "moneyness": [],
        "spot": spot,
        "expiry": expiry,
        "timestamp": datetime.now(IST).isoformat(),
    }


# =============================================================================
# Redis Time Series Storage
# =============================================================================

async def append_atm_gxoi(symbol: str, timestamp: datetime, atm_gxoi: float) -> bool:
    """
    Append ATM GxOI data point to Redis list for time series tracking.

    Args:
        symbol: Index symbol (NIFTY, BANKNIFTY)
        timestamp: Data point timestamp
        atm_gxoi: ATM GxOI value

    Returns:
        True if successful
    """
    try:
        date_key = timestamp.strftime("%Y-%m-%d")
        redis_key = f"options_viz:timeseries:{symbol.upper()}:{date_key}"

        data_point = json.dumps({
            "timestamp": timestamp.isoformat(),
            "atm_gxoi": round(atm_gxoi, 4),
        })

        redis = await get_redis()
        await redis.rpush(redis_key, data_point)

        # Set expiry to next market open
        ttl = get_ttl_until_next_market_open()
        await redis.expire(redis_key, ttl)

        return True
    except Exception as e:
        logger.warning(f"Failed to append ATM GxOI: {e}")
        return False


async def get_atm_gxoi_timeseries(symbol: str, date_str: Optional[str] = None) -> List[Dict]:
    """
    Get ATM GxOI time series for a trading session.

    Args:
        symbol: Index symbol
        date_str: Date in YYYY-MM-DD format (defaults to today)

    Returns:
        List of {timestamp, atm_gxoi} dicts
    """
    try:
        if date_str is None:
            date_str = datetime.now(IST).strftime("%Y-%m-%d")

        redis_key = f"options_viz:timeseries:{symbol.upper()}:{date_str}"
        redis = await get_redis()

        raw_points = await redis.lrange(redis_key, 0, -1)
        return [json.loads(p) for p in raw_points]
    except Exception as e:
        logger.warning(f"Failed to get ATM GxOI timeseries: {e}")
        return []


async def append_surface_snapshot(
    symbol: str,
    timestamp: datetime,
    surface_data: Dict[str, Any]
) -> bool:
    """
    Append IV/GxOI surface snapshot for 3D time brush visualization.

    Args:
        symbol: Index symbol
        timestamp: Snapshot timestamp
        surface_data: Surface data (IV or GxOI)

    Returns:
        True if successful
    """
    try:
        date_key = timestamp.strftime("%Y-%m-%d")
        redis_key = f"options_viz:surface_history:{symbol.upper()}:{date_key}"

        snapshot = json.dumps({
            "timestamp": timestamp.isoformat(),
            "strikes": surface_data.get("strikes", []),
            "iv_values": surface_data.get("iv_values", []),
            "gxoi_values": surface_data.get("gxoi_values", []),
            "spot": surface_data.get("spot", 0),
        })

        redis = await get_redis()
        await redis.rpush(redis_key, snapshot)

        # Limit to ~120 snapshots (about 2 hours at 1-min intervals)
        await redis.ltrim(redis_key, -120, -1)

        # Set expiry to next market open
        ttl = get_ttl_until_next_market_open()
        await redis.expire(redis_key, ttl)

        return True
    except Exception as e:
        logger.warning(f"Failed to append surface snapshot: {e}")
        return False


async def get_surface_history(
    symbol: str,
    date_str: Optional[str] = None,
    normalize: bool = True,
    band: float = 0.10,
    step: int = 50
) -> List[Dict]:
    """
    Get IV surface history for 3D visualization with time brush.

    Args:
        symbol: Index symbol
        date_str: Date in YYYY-MM-DD format (defaults to today)
        normalize: If True, normalize all snapshots to a common strike grid
        band: Band size for normalization (default 0.10 = ±10%)
        step: Strike step size for normalization (default 50)

    Returns:
        List of surface snapshots (normalized if requested)
    """
    try:
        if date_str is None:
            date_str = datetime.now(IST).strftime("%Y-%m-%d")

        redis_key = f"options_viz:surface_history:{symbol.upper()}:{date_str}"
        redis = await get_redis()

        raw_snapshots = await redis.lrange(redis_key, 0, -1)
        snapshots = [json.loads(s) for s in raw_snapshots]

        # Normalize to common grid if requested (ensures rectangular Z matrix)
        if normalize and snapshots:
            snapshots = normalize_surface_history(snapshots, band, step)

        return snapshots
    except Exception as e:
        logger.warning(f"Failed to get surface history: {e}")
        return []


# =============================================================================
# Visualization Caching
# =============================================================================

async def cache_exposure_data(symbol: str, data: Dict[str, Any]) -> bool:
    """Cache exposure data with dynamic TTL."""
    key = f"options_viz:exposure:{symbol.upper()}"
    ttl = get_visualization_ttl()
    return await cache_set(key, data, ttl)


async def get_cached_exposure_data(symbol: str) -> Optional[Dict[str, Any]]:
    """Get cached exposure data."""
    key = f"options_viz:exposure:{symbol.upper()}"
    return await cache_get(key)


async def cache_surface_data(symbol: str, data: Dict[str, Any]) -> bool:
    """Cache surface data with dynamic TTL."""
    key = f"options_viz:surface:{symbol.upper()}"
    ttl = get_visualization_ttl()
    # Use longer TTL for surface data (less frequently changing)
    if is_market_hours():
        ttl = 30  # 30 seconds during market
    return await cache_set(key, data, ttl)


async def get_cached_surface_data(symbol: str) -> Optional[Dict[str, Any]]:
    """Get cached surface data."""
    key = f"options_viz:surface:{symbol.upper()}"
    return await cache_get(key)


# =============================================================================
# Helper Functions
# =============================================================================

def _safe_float(value: Any) -> float:
    """Safely convert value to float."""
    try:
        if value is None or value in ("NA", "-", "", "--", "N/A"):
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _safe_int(value: Any) -> int:
    """Safely convert value to int."""
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def make_strike_grid(center_spot: float, band: float = 0.10, step: int = 50) -> List[float]:
    """
    Create a strike grid centered on spot price.

    Args:
        center_spot: Center spot price
        band: Band size as fraction (default 0.10 = ±10%)
        step: Strike step size (default 50)

    Returns:
        List of strike prices
    """
    lo = int(round(center_spot * (1 - band) / step) * step)
    hi = int(round(center_spot * (1 + band) / step) * step)
    return list(range(lo, hi + step, step))


def interpolate_to_grid(
    old_strikes: List[float],
    old_values: List[float],
    new_grid: List[float]
) -> List[float]:
    """
    Interpolate values from old strikes to new grid.

    Args:
        old_strikes: Original strike prices
        old_values: Values at original strikes
        new_grid: New strike grid to interpolate to

    Returns:
        Interpolated values on new grid
    """
    if not old_strikes or not old_values or len(old_strikes) != len(old_values):
        return [0.0] * len(new_grid)

    result = []
    for strike in new_grid:
        # Find bracketing strikes for interpolation
        if strike <= old_strikes[0]:
            result.append(old_values[0])
        elif strike >= old_strikes[-1]:
            result.append(old_values[-1])
        else:
            # Binary search for bracketing strikes
            for i in range(len(old_strikes) - 1):
                if old_strikes[i] <= strike <= old_strikes[i + 1]:
                    # Linear interpolation
                    t = (strike - old_strikes[i]) / (old_strikes[i + 1] - old_strikes[i])
                    val = old_values[i] + t * (old_values[i + 1] - old_values[i])
                    result.append(val)
                    break
            else:
                result.append(0.0)

    return result


def normalize_surface_history(snapshots: List[Dict], band: float = 0.10, step: int = 50) -> List[Dict]:
    """
    Normalize surface history to a common strike grid.

    When spot price moves, each snapshot may have different strikes.
    This function reinterpolates all snapshots to a common grid
    centered on the latest spot price.

    Args:
        snapshots: Raw surface snapshots from Redis
        band: Band size as fraction (default 0.10 = ±10%)
        step: Strike step size (default 50)

    Returns:
        Normalized snapshots with consistent strike grid
    """
    if not snapshots:
        return []

    # Get latest spot to center the grid
    latest_spot = snapshots[-1].get("spot", 0)
    if latest_spot <= 0:
        # Fallback: find any valid spot
        for snap in reversed(snapshots):
            if snap.get("spot", 0) > 0:
                latest_spot = snap["spot"]
                break
        if latest_spot <= 0:
            return snapshots  # Can't normalize without spot

    # Create common grid centered on latest spot
    common_grid = make_strike_grid(latest_spot, band, step)
    grid_size = len(common_grid)

    # Reinterpolate all snapshots to common grid
    normalized = []
    for snap in snapshots:
        old_strikes = snap.get("strikes", [])
        old_iv = snap.get("iv_values", [])
        old_gxoi = snap.get("gxoi_values", [])

        # Skip snapshots with no valid data
        if not old_strikes:
            continue

        # Interpolate IV values (fill with zeros if no data)
        if old_iv and len(old_iv) == len(old_strikes):
            new_iv = interpolate_to_grid(old_strikes, old_iv, common_grid)
        else:
            new_iv = [0.0] * grid_size

        # Interpolate GxOI values (fill with zeros if no data)
        if old_gxoi and len(old_gxoi) == len(old_strikes):
            new_gxoi = interpolate_to_grid(old_strikes, old_gxoi, common_grid)
        else:
            new_gxoi = [0.0] * grid_size

        # Only include snapshot if we have at least one valid value set
        if any(v != 0 for v in new_iv) or any(v != 0 for v in new_gxoi):
            normalized.append({
                "timestamp": snap.get("timestamp"),
                "strikes": common_grid,
                "iv_values": new_iv,
                "gxoi_values": new_gxoi,
                "spot": snap.get("spot", 0),
            })

    return normalized
