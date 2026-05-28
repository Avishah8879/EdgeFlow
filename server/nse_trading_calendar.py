"""
NSE Trading Calendar Module

Provides NSE (National Stock Exchange of India) market hours and holiday calendar
for calculating trading days and retention windows.

Author: Database Tuning Implementation
Date: December 2025
"""

from datetime import datetime, date, timedelta
from typing import List
import pytz

try:
    from market_hours import (
        NSE_HOLIDAYS,
        is_nse_holiday as _canonical_is_nse_holiday,
        is_trading_day as _canonical_is_trading_day,
    )
except ImportError:  # pragma: no cover - package import fallback
    from server.market_hours import (
        NSE_HOLIDAYS,
        is_nse_holiday as _canonical_is_nse_holiday,
        is_trading_day as _canonical_is_trading_day,
    )

# IST Timezone
IST_TIMEZONE = pytz.timezone('Asia/Kolkata')

# NSE Market Hours (IST)
MARKET_OPEN_TIME = "09:15"
MARKET_CLOSE_TIME = "15:30"

def get_nse_holidays(year: int = None) -> List[date]:
    """
    Get list of NSE holidays for a given year.

    Args:
        year: Year to get holidays for. If None, returns all holidays.

    Returns:
        List of date objects representing NSE holidays
    """
    holidays = [date.fromisoformat(value) for value in NSE_HOLIDAYS]
    if year is not None:
        holidays = [holiday for holiday in holidays if holiday.year == year]
    return sorted(holidays)


def is_weekend(check_date: date) -> bool:
    """
    Check if date is a weekend (Saturday or Sunday).

    Args:
        check_date: Date to check

    Returns:
        True if weekend, False otherwise
    """
    return check_date.weekday() >= 5  # 5 = Saturday, 6 = Sunday


def is_nse_holiday(check_date: date) -> bool:
    """
    Check if date is an NSE holiday.

    Args:
        check_date: Date to check

    Returns:
        True if NSE holiday, False otherwise
    """
    return _canonical_is_nse_holiday(check_date)


def is_trading_day(check_date: date) -> bool:
    """
    Check if date is a trading day (not weekend, not holiday).

    Args:
        check_date: Date to check

    Returns:
        True if trading day, False otherwise
    """
    return _canonical_is_trading_day(check_date)


def get_previous_trading_day(from_date: date = None) -> date:
    """
    Get the previous trading day before the given date.

    Args:
        from_date: Reference date. If None, uses today.

    Returns:
        Previous trading day
    """
    if from_date is None:
        from_date = datetime.now(IST_TIMEZONE).date()

    check_date = from_date - timedelta(days=1)
    while not is_trading_day(check_date):
        check_date -= timedelta(days=1)

    return check_date


def get_n_trading_days_back(n: int, from_date: date = None) -> date:
    """
    Get the date N trading days back from the given date.

    Args:
        n: Number of trading days to go back
        from_date: Reference date. If None, uses today.

    Returns:
        Date N trading days back
    """
    if from_date is None:
        from_date = datetime.now(IST_TIMEZONE).date()

    trading_days_found = 0
    check_date = from_date

    while trading_days_found < n:
        check_date -= timedelta(days=1)
        if is_trading_day(check_date):
            trading_days_found += 1

    return check_date


def get_retention_cutoff_date(retention_days: int = 2) -> datetime:
    """
    Calculate the cutoff timestamp for LTP data retention.
    Keeps N trading days of data (default: 2 trading days).

    Args:
        retention_days: Number of trading days to retain (default: 2)

    Returns:
        Cutoff datetime (timezone-aware IST) - data older than this should be deleted
    """
    today = datetime.now(IST_TIMEZONE).date()
    cutoff_date = get_n_trading_days_back(retention_days, from_date=today)

    # Convert to datetime at midnight IST
    cutoff_datetime = IST_TIMEZONE.localize(
        datetime.combine(cutoff_date, datetime.min.time())
    )

    return cutoff_datetime


def get_trading_day_info(check_date: date = None) -> dict:
    """
    Get comprehensive trading day information for a date.

    Args:
        check_date: Date to check. If None, uses today.

    Returns:
        Dictionary with trading day information
    """
    if check_date is None:
        check_date = datetime.now(IST_TIMEZONE).date()

    is_trading = is_trading_day(check_date)
    prev_trading_day = get_previous_trading_day(check_date)

    info = {
        "date": check_date,
        "is_trading_day": is_trading,
        "is_weekend": is_weekend(check_date),
        "is_holiday": is_nse_holiday(check_date),
        "previous_trading_day": prev_trading_day,
        "days_since_last_trading_day": (check_date - prev_trading_day).days if is_trading else None,
    }

    return info


if __name__ == "__main__":
    # Example usage and testing
    print("NSE Trading Calendar Module - Test")
    print("=" * 50)

    # Test today
    today = datetime.now(IST_TIMEZONE).date()
    info = get_trading_day_info(today)
    print(f"\nToday: {today}")
    print(f"  Is Trading Day: {info['is_trading_day']}")
    print(f"  Is Weekend: {info['is_weekend']}")
    print(f"  Is Holiday: {info['is_holiday']}")
    print(f"  Previous Trading Day: {info['previous_trading_day']}")

    # Test retention cutoff
    cutoff = get_retention_cutoff_date(retention_days=2)
    print(f"\n2-Day Retention Cutoff: {cutoff}")
    print(f"  Delete data older than: {cutoff.strftime('%Y-%m-%d %H:%M:%S %Z')}")

    # Test specific dates
    test_dates = [
        date(2025, 12, 13),  # Friday
        date(2025, 12, 14),  # Saturday
        date(2025, 12, 15),  # Monday
        date(2025, 1, 26),   # Republic Day 2025
    ]

    print("\nTest Dates:")
    for d in test_dates:
        info = get_trading_day_info(d)
        status = "TRADING" if info['is_trading_day'] else "NON-TRADING"
        print(f"  {d} ({d.strftime('%A')}): {status}")
