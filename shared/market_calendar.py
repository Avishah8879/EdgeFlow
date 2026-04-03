"""
NSE Market Calendar Utilities

Provides functions for determining trading days, market hours, and cache TTLs.
Used by depth ingester and WebSocket endpoints for market-hours awareness.
"""

from datetime import datetime, timedelta, date
from typing import Optional
import pytz

# Indian Standard Time
IST = pytz.timezone('Asia/Kolkata')

# NSE Trading Holidays 2025
# Source: https://www.nseindia.com/resources/exchange-communication-holidays
NSE_HOLIDAYS_2025 = {
    "2025-01-26",  # Republic Day
    "2025-02-26",  # Maha Shivaratri
    "2025-03-14",  # Holi
    "2025-03-31",  # Id-Ul-Fitr (Tentative)
    "2025-04-10",  # Shri Mahavir Jayanti
    "2025-04-14",  # Dr. Baba Saheb Ambedkar Jayanti
    "2025-04-18",  # Good Friday
    "2025-05-01",  # Maharashtra Day
    "2025-06-07",  # Id-Ul-Adha (Bakri Id) (Tentative)
    "2025-08-15",  # Independence Day
    "2025-08-27",  # Ganesh Chaturthi
    "2025-10-02",  # Mahatma Gandhi Jayanti
    "2025-10-21",  # Diwali Laxmi Pujan
    "2025-10-22",  # Diwali Balipratipada
    "2025-11-05",  # Prakash Gurpurab Sri Guru Nanak Dev
    "2025-12-25",  # Christmas
}

# NSE Trading Holidays 2026 (partial - add more as NSE announces)
NSE_HOLIDAYS_2026 = {
    "2026-01-26",  # Republic Day
}

# Combined set of all holidays
ALL_HOLIDAYS = NSE_HOLIDAYS_2025 | NSE_HOLIDAYS_2026


def is_trading_day(d: date) -> bool:
    """
    Check if given date is an NSE trading day.
    Returns False for weekends and holidays.

    Args:
        d: Date to check

    Returns:
        True if trading day, False otherwise
    """
    # Saturday = 5, Sunday = 6
    if d.weekday() >= 5:
        return False

    if d.isoformat() in ALL_HOLIDAYS:
        return False

    return True


def is_market_hours(now: Optional[datetime] = None) -> bool:
    """
    Check if current time is within NSE market hours (9:15 AM - 3:30 PM IST).

    Args:
        now: Optional datetime, defaults to current time

    Returns:
        True if within market hours, False otherwise
    """
    if now is None:
        now = datetime.now(IST)
    elif now.tzinfo is None:
        now = IST.localize(now)

    if not is_trading_day(now.date()):
        return False

    market_open = now.replace(hour=9, minute=15, second=0, microsecond=0)
    market_close = now.replace(hour=15, minute=30, second=0, microsecond=0)

    return market_open <= now <= market_close


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

    next_day = now.replace(hour=9, minute=0, second=0, microsecond=0)

    if now.hour >= 9:
        next_day += timedelta(days=1)

    # Skip to next trading day
    while not is_trading_day(next_day.date()):
        next_day += timedelta(days=1)

    return next_day


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

    today = now.date()

    if not is_trading_day(today):
        if today.weekday() >= 5:
            return "CLOSED (Weekend)"
        else:
            return "CLOSED (Holiday)"

    if now.hour < 9 or (now.hour == 9 and now.minute < 15):
        return "PRE-MARKET"
    elif now.hour < 15 or (now.hour == 15 and now.minute <= 30):
        return "OPEN"
    else:
        return "CLOSED (After Hours)"
