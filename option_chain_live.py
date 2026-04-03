"""
Option Chain Live Data with Redis Caching.

This module fetches option chain data from NSE and stores it in Redis.
Background tasks refresh the data every 5 seconds during market hours.
Users always read from Redis (never wait for NSE API).

Architecture:
- Background task fetches from NSE API → Redis
- User endpoint reads from Redis → instant response
- Pub/sub notifies SSE clients of updates
"""

import asyncio
import json
import logging
import math
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import httpx
from scipy.stats import norm

from redis_cache import (
    get_redis,
    cache_options,
    get_cached_options,
    get_dynamic_ttl,
    is_market_hours,
)

logger = logging.getLogger(__name__)

# =============================================================================
# Configuration
# =============================================================================

BASE_URL = "https://www.nseindia.com/"
# NSE v3 API endpoints (as of Dec 2025)
CONTRACT_INFO_URL = BASE_URL + "api/option-chain-contract-info?symbol={symbol}"
OPTION_CHAIN_V3_URL = BASE_URL + "api/option-chain-v3?type=Indices&symbol={symbol}&expiry={expiry}"
HEADERS = {
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    ),
    "accept-language": "en-US,en;q=0.8",
    "accept": "application/json,text/html",
    "referer": "https://www.nseindia.com/option-chain",
    "connection": "keep-alive",
}

RISK_FREE_RATE = 0.065  # Approximate India risk-free rate
SUPPORTED_SYMBOLS = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"]

# Legacy in-memory cache (fallback when Redis unavailable)
_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL = timedelta(seconds=55)


# =============================================================================
# Helper Functions
# =============================================================================

def _safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _safe_int(value: Any) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def _calculate_delta(
    spot: float,
    strike: float,
    time_to_expiry: float,
    rate: float,
    sigma: float,
    option_type: str
) -> float:
    """Calculate Black-Scholes delta for an option."""
    if spot <= 0 or strike <= 0 or sigma <= 0 or time_to_expiry <= 0:
        return 0.0
    d1 = (math.log(spot / strike) + (rate + 0.5 * sigma * sigma) * time_to_expiry) / (
        sigma * math.sqrt(time_to_expiry)
    )
    if option_type.upper() == "CE":
        return float(norm.cdf(d1))
    return float(norm.cdf(d1) - 1.0)


def _parse_expiry(value: str) -> datetime:
    try:
        return datetime.strptime(value, "%d-%b-%Y")
    except Exception:
        return datetime.now()


def _select_expiry(available: List[str], requested: Optional[str]) -> Optional[str]:
    if not available:
        return None
    if requested and requested in available:
        return requested
    sorted_expiries = sorted(available, key=_parse_expiry)
    return sorted_expiries[0]


def _process_raw_chain(
    raw: Dict[str, Any],
    symbol: str,
    expiry: Optional[str] = None
) -> Dict[str, Any]:
    """Process raw NSE response into structured option chain data."""
    now = datetime.now()
    normalized_symbol = symbol.upper()

    records = raw.get("records") or {}
    data_records = records.get("data") or []
    available_expiries = records.get("expiryDates") or []
    underlying = _safe_float(records.get("underlyingValue") or 0.0)

    target_expiry = _select_expiry(available_expiries, expiry)
    if not target_expiry:
        return {
            "symbol": normalized_symbol,
            "expiry": None,
            "availableExpiries": available_expiries,
            "calls": [],
            "puts": [],
            "underlying": underlying,
            "source": "nse",
            "fetchedAt": now.isoformat(),
        }

    expiry_dt = _parse_expiry(target_expiry)
    time_to_expiry = max((expiry_dt - now).total_seconds() / (365.25 * 86400), 1e-6)

    calls: List[Dict[str, Any]] = []
    puts: List[Dict[str, Any]] = []

    for record in data_records:
        # v3 API uses 'expiryDates' (plural) in data items
        record_expiry = record.get("expiryDates") or record.get("expiryDate")
        if record_expiry != target_expiry:
            continue

        strike = _safe_float(record.get("strikePrice"))
        ce = record.get("CE")
        pe = record.get("PE")

        if ce:
            iv_pct = _safe_float(ce.get("impliedVolatility"))
            calls.append({
                "contract": str(ce.get("identifier") or f"{normalized_symbol}-{target_expiry}-{strike}-CE"),
                "strike": strike,
                "lastPrice": _safe_float(ce.get("lastPrice")),
                "bid": _safe_float(ce.get("bidprice") or ce.get("bidPrice")),
                "ask": _safe_float(ce.get("askPrice") or ce.get("askprice")),
                "change": _safe_float(ce.get("change")),
                "changePercent": _safe_float(ce.get("pChange") or ce.get("percentChange")),
                "volume": _safe_int(ce.get("totalTradedVolume")),
                "openInterest": _safe_int(ce.get("openInterest")),
                "impliedVolatility": iv_pct,
                "inTheMoney": bool(ce.get("inTheMoney")),
                "delta": round(
                    _calculate_delta(
                        underlying, strike, time_to_expiry,
                        RISK_FREE_RATE, iv_pct / 100 if iv_pct else 0.0, "CE"
                    ),
                    2,
                ),
            })

        if pe:
            iv_pct = _safe_float(pe.get("impliedVolatility"))
            puts.append({
                "contract": str(pe.get("identifier") or f"{normalized_symbol}-{target_expiry}-{strike}-PE"),
                "strike": strike,
                "lastPrice": _safe_float(pe.get("lastPrice")),
                "bid": _safe_float(pe.get("bidprice") or pe.get("bidPrice")),
                "ask": _safe_float(pe.get("askPrice") or pe.get("askprice")),
                "change": _safe_float(pe.get("change")),
                "changePercent": _safe_float(pe.get("pChange") or pe.get("percentChange")),
                "volume": _safe_int(pe.get("totalTradedVolume")),
                "openInterest": _safe_int(pe.get("openInterest")),
                "impliedVolatility": iv_pct,
                "inTheMoney": bool(pe.get("inTheMoney")),
                "delta": round(
                    _calculate_delta(
                        underlying, strike, time_to_expiry,
                        RISK_FREE_RATE, iv_pct / 100 if iv_pct else 0.0, "PE"
                    ),
                    2,
                ),
            })

    return {
        "symbol": normalized_symbol,
        "expiry": target_expiry,
        "availableExpiries": available_expiries,
        "calls": calls,
        "puts": puts,
        "underlying": underlying,
        "source": "nse",
        "fetchedAt": now.isoformat(),
    }


# =============================================================================
# Async Functions (for background tasks and FastAPI)
# =============================================================================

async def fetch_nse_option_chain_async(
    symbol: str = "NIFTY",
    expiry: Optional[str] = None,
    save_to_redis: bool = True,
    publish_update: bool = True
) -> Dict[str, Any]:
    """
    Fetch option chain from NSE asynchronously.

    This is the primary function used by:
    - Celery background tasks (refresh every 5s)
    - Manual refresh endpoints

    Args:
        symbol: Index symbol (NIFTY, BANKNIFTY, etc.)
        expiry: Specific expiry date (defaults to nearest)
        save_to_redis: Whether to cache in Redis
        publish_update: Whether to publish update to SSE subscribers

    Returns:
        Processed option chain data
    """
    normalized_symbol = symbol.upper()

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            # Get cookies first (NSE requires this)
            await client.get(BASE_URL, headers=HEADERS)

            # Step 1: Get available expiry dates from contract-info endpoint
            contract_url = CONTRACT_INFO_URL.format(symbol=normalized_symbol)
            contract_resp = await client.get(contract_url, headers=HEADERS)
            contract_resp.raise_for_status()
            contract_data = contract_resp.json()

            available_expiries = contract_data.get("expiryDates", [])
            if not available_expiries:
                logger.warning(f"No expiry dates available for {normalized_symbol}")
                return _process_raw_chain({}, normalized_symbol, expiry)

            # Select expiry (requested or nearest)
            target_expiry = expiry if expiry in available_expiries else available_expiries[0]

            # Step 2: Fetch option chain for the expiry from v3 endpoint
            chain_url = OPTION_CHAIN_V3_URL.format(symbol=normalized_symbol, expiry=target_expiry)
            response = await client.get(chain_url, headers=HEADERS)
            response.raise_for_status()
            raw = response.json()

        except httpx.TimeoutException:
            logger.warning(f"Timeout fetching options for {normalized_symbol}")
            raise
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error fetching options for {normalized_symbol}: {e}")
            raise
        except Exception as e:
            logger.error(f"Error fetching options for {normalized_symbol}: {e}")
            raise

    # Process raw data
    payload = _process_raw_chain(raw, normalized_symbol, expiry)

    # Save to Redis
    if save_to_redis:
        try:
            await cache_options(normalized_symbol, payload)
            logger.debug(f"Cached options for {normalized_symbol}")
        except Exception as e:
            logger.warning(f"Failed to cache options for {normalized_symbol}: {e}")

    # Publish update to SSE subscribers
    if publish_update:
        try:
            redis = await get_redis()
            if redis:
                await redis.publish(
                    "options:updates",
                    json.dumps({
                        "symbol": normalized_symbol,
                        "underlying": payload["underlying"],
                        "expiry": payload["expiry"],
                        "timestamp": datetime.now().isoformat(),
                    })
                )
        except Exception as e:
            logger.warning(f"Failed to publish options update: {e}")

    return payload


async def get_option_chain_from_redis(
    symbol: str = "NIFTY",
    expiry: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Get option chain from Redis cache.

    This is the primary function for user-facing endpoints.
    Returns None if not cached (background task will populate).

    Args:
        symbol: Index symbol
        expiry: Specific expiry date (filters from cached data)

    Returns:
        Cached option chain data or None
    """
    normalized_symbol = symbol.upper()

    try:
        cached = await get_cached_options(normalized_symbol)
        if cached:
            # Filter by expiry if requested
            if expiry and cached.get("expiry") != expiry:
                # Return with different expiry - client can use availableExpiries
                # to request a refresh with specific expiry
                pass
            return cached
    except Exception as e:
        logger.warning(f"Redis error getting options for {normalized_symbol}: {e}")

    return None


async def refresh_all_options() -> Dict[str, bool]:
    """
    Refresh option chains for all supported symbols.

    Called by Celery beat task every 5 seconds during market hours.

    Returns:
        Dict mapping symbol to success status
    """
    results = {}

    # Only refresh during market hours (or slightly before/after)
    if not is_market_hours():
        # During off-hours, refresh less frequently (handled by Celery schedule)
        # But still allow manual refresh
        pass

    for symbol in SUPPORTED_SYMBOLS:
        try:
            await fetch_nse_option_chain_async(symbol)
            results[symbol] = True
            logger.debug(f"Refreshed options for {symbol}")
        except Exception as e:
            results[symbol] = False
            logger.error(f"Failed to refresh options for {symbol}: {e}")

        # Small delay between requests to avoid rate limiting
        await asyncio.sleep(0.5)

    return results


# =============================================================================
# Synchronous Functions (legacy compatibility)
# =============================================================================

def _fetch_raw_chain_sync(symbol: str, expiry: Optional[str] = None) -> Dict[str, Any]:
    """
    Synchronous fetch using NSE v3 API (two-step process).

    Step 1: Get available expiry dates from contract-info endpoint
    Step 2: Fetch option chain data for specific expiry from v3 endpoint
    """
    import requests

    normalized_symbol = symbol.upper()
    session = requests.Session()
    try:
        # Get cookies first (required by NSE)
        session.get(BASE_URL, headers=HEADERS, timeout=10)

        # Step 1: Get available expiry dates
        contract_url = CONTRACT_INFO_URL.format(symbol=normalized_symbol)
        contract_resp = session.get(
            contract_url,
            headers=HEADERS,
            cookies=session.cookies.get_dict(),
            timeout=15,
        )
        contract_resp.raise_for_status()
        contract_data = contract_resp.json()

        available_expiries = contract_data.get("expiryDates", [])
        if not available_expiries:
            logger.warning(f"No expiry dates available for {normalized_symbol}")
            return {}

        # Select expiry (requested or nearest)
        target_expiry = expiry if expiry in available_expiries else available_expiries[0]

        # Step 2: Fetch option chain for the expiry
        chain_url = OPTION_CHAIN_V3_URL.format(symbol=normalized_symbol, expiry=target_expiry)
        chain_resp = session.get(
            chain_url,
            headers=HEADERS,
            cookies=session.cookies.get_dict(),
            timeout=15,
        )
        chain_resp.raise_for_status()
        return chain_resp.json()
    finally:
        session.close()


def fetch_nse_index_option_chain(
    symbol: str = "NIFTY",
    expiry: Optional[str] = None
) -> Dict[str, Any]:
    """
    Fetch live option chain (NIFTY/BANKNIFTY) - synchronous version.

    This is the legacy function for backwards compatibility.
    Prefer fetch_nse_option_chain_async for new code.

    Uses in-memory cache as fallback when Redis unavailable.
    """
    now = datetime.now()
    normalized_symbol = symbol.upper()

    # Check in-memory cache
    cached = _CACHE.get(normalized_symbol)
    if cached and (now - cached["timestamp"]) < CACHE_TTL:
        payload = cached["payload"]
        if not expiry or expiry == payload.get("expiry"):
            return payload

    # Fetch from NSE (v3 API with two-step process)
    raw = _fetch_raw_chain_sync(normalized_symbol, expiry)
    payload = _process_raw_chain(raw, normalized_symbol, expiry)

    # Update in-memory cache
    _CACHE[normalized_symbol] = {"timestamp": now, "payload": payload}

    return payload


# =============================================================================
# Celery Task Helper
# =============================================================================

def refresh_options_sync() -> Dict[str, bool]:
    """
    Synchronous wrapper for Celery task.

    Celery tasks can't be async directly, so we run the async
    function in an event loop.
    """
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(refresh_all_options())


__all__ = [
    "fetch_nse_index_option_chain",
    "fetch_nse_option_chain_async",
    "get_option_chain_from_redis",
    "refresh_all_options",
    "refresh_options_sync",
    "SUPPORTED_SYMBOLS",
]
