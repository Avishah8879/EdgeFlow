"""
NSE Market Calendar Utilities

Provides functions for determining trading days, market hours, and cache TTLs.
Used by depth ingester and WebSocket endpoints for market-hours awareness.
"""

from datetime import datetime, timedelta, date
from typing import Optional
import pytz

try:
    from market_hours import (
        get_market_status as _canonical_market_status,
        get_next_market_open as _canonical_next_market_open,
        is_market_open as _canonical_is_market_open,
        is_trading_day as _canonical_is_trading_day,
    )
except ImportError:  # pragma: no cover - package import fallback
    from server.market_hours import (
        get_market_status as _canonical_market_status,
        get_next_market_open as _canonical_next_market_open,
        is_market_open as _canonical_is_market_open,
        is_trading_day as _canonical_is_trading_day,
    )

# Indian Standard Time
IST = pytz.timezone('Asia/Kolkata')

def is_trading_day(d: date) -> bool:
    """
    Check if given date is an NSE trading day.
    Returns False for weekends and holidays.

    Args:
        d: Date to check

    Returns:
        True if trading day, False otherwise
    """
    return _canonical_is_trading_day(d)


def is_market_hours(now: Optional[datetime] = None) -> bool:
    """
    Check if current time is within NSE market hours (9:15 AM - 3:30 PM IST).

    Args:
        now: Optional datetime, defaults to current time

    Returns:
        True if within market hours, False otherwise
    """
    if now is None:
        return _canonical_is_market_open()
    if now.tzinfo is None:
        now = IST.localize(now)
    status = _canonical_market_status(now)
    return bool(status.get("is_open"))


def get_trading_date(now: Optional[datetime] = None) -> str:
    """
    Get the current trading date in YYYY-MM-DD format.
    Before 9:00 AM, returns previous trading day.

    Args:
        now: Optional datetime, defaults to current time

    Returns:
        Trading date as ISO format string (YYYY-MM-DD)
    """
    if now is None:
        now = datetime.now(IST)
    elif now.tzinfo is None:
        now = IST.localize(now)

    if now.hour < 9:
        # Before market open, use previous trading day
        check_date = now.date() - timedelta(days=1)
    else:
        check_date = now.date()

    # Find most recent trading day
    while not is_trading_day(check_date):
        check_date -= timedelta(days=1)

    return check_date.isoformat()


def get_next_trading_day(now: Optional[datetime] = None) -> datetime:
    """
    Get the next trading day at 9:00 AM IST.
    Used for calculating cache TTL.

    Args:
        now: Optional datetime, defaults to current time

    Returns:
        Next trading day at 9:00 AM IST
    """
    if now is None:
        now = datetime.now(IST)
    elif now.tzinfo is None:
        now = IST.localize(now)

    return _canonical_next_market_open(now)


def get_cache_ttl(now: Optional[datetime] = None) -> int:
    """
    Get TTL in seconds until next trading day 9:00 AM.
    Minimum 1 hour to prevent issues near market open.

    Args:
        now: Optional datetime, defaults to current time

    Returns:
        TTL in seconds
    """
    if now is None:
        now = datetime.now(IST)
    elif now.tzinfo is None:
        now = IST.localize(now)

    next_trading = get_next_trading_day(now)
    ttl = int((next_trading - now).total_seconds())
    return max(ttl, 3600)  # At least 1 hour


def get_market_status(now: Optional[datetime] = None) -> str:
    """
    Get human-readable market status.

    Args:
        now: Optional datetime, defaults to current time

    Returns:
        Market status string
    """
    if now is None:
        now = datetime.now(IST)
    elif now.tzinfo is None:
        now = IST.localize(now)

    status = _canonical_market_status(now)
    return status.get("message") or status.get("status", "CLOSED")
