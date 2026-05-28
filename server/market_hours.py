"""
Market Hours Utility for NSE (National Stock Exchange of India)

Provides functions to check if the market is currently open and get market status information.
"""

from datetime import datetime, time, timedelta, date
import pytz

# NSE market timings (IST)
MARKET_OPEN_TIME = time(9, 15)  # 9:15 AM IST
MARKET_CLOSE_TIME = time(15, 30)  # 3:30 PM IST
IST_TIMEZONE = pytz.timezone('Asia/Kolkata')

# Source: NSE equity holidays 2026. Update annually each November.
NSE_HOLIDAYS = {
    "2026-01-26": "Republic Day",
    "2026-02-15": "Mahashivratri",
    "2026-03-03": "Holi",
    "2026-03-21": "Id-Ul-Fitr (Ramadan Eid)",
    "2026-03-26": "Shri Ram Navami",
    "2026-03-31": "Shri Mahavir Jayanti",
    "2026-04-03": "Good Friday",
    "2026-04-14": "Dr. Baba Saheb Ambedkar Jayanti",
    "2026-05-01": "Maharashtra Day",
    "2026-05-28": "Bakri Id",
    "2026-06-26": "Muharram",
    "2026-08-15": "Independence Day",
    "2026-09-14": "Ganesh Chaturthi",
    "2026-10-02": "Mahatma Gandhi Jayanti",
    "2026-10-20": "Dussehra",
    "2026-11-08": "Diwali Laxmi Pujan",
    "2026-11-10": "Diwali-Balipratipada",
    "2026-11-24": "Prakash Gurpurb Sri Guru Nanak Dev",
    "2026-12-25": "Christmas",
}


def get_current_ist_time():
    """Get current time in IST timezone."""
    return datetime.now(IST_TIMEZONE)


def _as_ist(value=None):
    if value is None:
        return get_current_ist_time()
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return IST_TIMEZONE.localize(value)
        return value.astimezone(IST_TIMEZONE)
    raise TypeError("Expected datetime or None")


def get_holiday_name(check_date: date) -> str | None:
    """Return NSE holiday name for a date, if configured."""
    return NSE_HOLIDAYS.get(check_date.isoformat())


def is_nse_holiday(check_date: date) -> bool:
    """Check whether a date is a configured NSE equity holiday."""
    return get_holiday_name(check_date) is not None


def is_trading_day(check_date: date) -> bool:
    """Check whether a date is an NSE trading day."""
    return check_date.weekday() < 5 and not is_nse_holiday(check_date)


def get_next_market_open(now=None):
    """Get the next trading-session open datetime in IST."""
    now = _as_ist(now)
    candidate = now.replace(
        hour=MARKET_OPEN_TIME.hour,
        minute=MARKET_OPEN_TIME.minute,
        second=0,
        microsecond=0,
    )
    if now >= candidate or not is_trading_day(candidate.date()):
        candidate += timedelta(days=1)
        while not is_trading_day(candidate.date()):
            candidate += timedelta(days=1)
        candidate = candidate.replace(
            hour=MARKET_OPEN_TIME.hour,
            minute=MARKET_OPEN_TIME.minute,
            second=0,
            microsecond=0,
        )
    return candidate


def format_relative_time(target_datetime):
    """
    Format time difference as relative time string.

    Args:
        target_datetime: Target datetime to calculate difference to

    Returns:
        str: Formatted string like "2h 30m", "45m", "5h 15m"
    """
    now = get_current_ist_time()
    time_diff = target_datetime - now

    total_seconds = int(time_diff.total_seconds())
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60

    if hours > 0:
        return f"{hours}h {minutes}m"
    else:
        return f"{minutes}m"


def is_market_open():
    """
    Check if NSE market is currently open.

    Market hours: 9:15 AM - 3:30 PM IST, Monday-Friday

    Returns:
        bool: True if market is open, False otherwise
    """
    now = get_current_ist_time()
    if not is_trading_day(now.date()):
        return False
    current_time = now.time()
    return MARKET_OPEN_TIME <= current_time <= MARKET_CLOSE_TIME


def get_market_status(now=None):
    """
    Get detailed market status information.

    Returns:
        dict: Market status with keys:
            - is_open (bool): Whether market is currently open
            - status (str): "HOLIDAY", "WEEKEND", "PRE_MARKET", "OPEN", or "AFTER_HOURS"
            - reason (str): Same enum as status, for display classification
            - message (str): Human-readable status message
            - current_time (str): Current IST time
    """
    now = _as_ist(now)
    current_time = now.time()
    today = now.date()

    status_data = {
        "current_time": now.strftime("%I:%M %p IST"),
        "is_open": False,
    }

    holiday_name = get_holiday_name(today)
    if holiday_name:
        status_data.update({
            "status": "HOLIDAY",
            "reason": "HOLIDAY",
            "message": f"Holiday: {holiday_name}",
            "next_open": get_next_market_open(now).strftime("%A %I:%M %p"),
        })
    elif today.weekday() >= 5:
        status_data.update({
            "status": "WEEKEND",
            "reason": "WEEKEND",
            "message": "Weekend: market closed",
            "next_open": get_next_market_open(now).strftime("%A %I:%M %p"),
        })
    elif current_time < MARKET_OPEN_TIME:
        status_data.update({
            "status": "PRE_MARKET",
            "reason": "PRE_MARKET",
            "message": "Market opens at 9:15 AM IST",
            "next_open": "Today 09:15 AM",
        })
    elif MARKET_OPEN_TIME <= current_time <= MARKET_CLOSE_TIME:
        status_data.update({
            "is_open": True,
            "status": "OPEN",
            "reason": "OPEN",
            "message": now.strftime("%I:%M %p IST"),
        })
    else:
        status_data.update({
            "status": "AFTER_HOURS",
            "reason": "AFTER_HOURS",
            "message": "After market hours",
            "next_open": get_next_market_open(now).strftime("%A %I:%M %p"),
        })

    return status_data


def is_data_fresh(data_timestamp, max_age_minutes=5):
    """
    Check if a timestamp is recent enough to be considered "live" data.

    Args:
        data_timestamp: datetime object (timezone-aware or naive)
        max_age_minutes: Maximum age in minutes to consider data fresh

    Returns:
        bool: True if data is fresh and market is open, False otherwise
    """
    if not is_market_open():
        return False

    now = get_current_ist_time()

    # Make data_timestamp timezone-aware if it's naive
    if data_timestamp.tzinfo is None:
        data_timestamp = IST_TIMEZONE.localize(data_timestamp)

    # Calculate age in minutes
    age_seconds = (now - data_timestamp).total_seconds()
    age_minutes = age_seconds / 60

    return age_minutes <= max_age_minutes
