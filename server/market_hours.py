"""
Market Hours Utility for NSE (National Stock Exchange of India)

Provides functions to check if the market is currently open and get market status information.
"""

from datetime import datetime, time
import pytz

# NSE market timings (IST)
PRE_MARKET_START_TIME = time(8, 0)  # 8:00 AM IST
MARKET_OPEN_TIME = time(9, 15)  # 9:15 AM IST
MARKET_CLOSE_TIME = time(15, 30)  # 3:30 PM IST
POST_MARKET_END_TIME = time(17, 0)  # 5:00 PM IST
IST_TIMEZONE = pytz.timezone('Asia/Kolkata')


def get_current_ist_time():
    """Get current time in IST timezone."""
    return datetime.now(IST_TIMEZONE)


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

    # Check if it's a weekday (Monday=0, Sunday=6)
    if now.weekday() >= 5:  # Saturday or Sunday
        return False

    # Check if current time is within market hours
    current_time = now.time()
    return MARKET_OPEN_TIME <= current_time <= MARKET_CLOSE_TIME


def get_market_status():
    """
    Get detailed market status information.

    Returns:
        dict: Market status with keys:
            - is_open (bool): Whether market is currently open
            - status (str): "PRE-MARKET", "OPEN", "POST-MARKET", or "CLOSED"
            - message (str): Human-readable status message (current IST time when open, relative time when closed)
            - next_open (str): When market opens next (if not open)
            - current_time (str): Current IST time
    """
    now = get_current_ist_time()
    current_time = now.time()
    weekday = now.weekday()

    status_data = {
        "current_time": now.strftime("%I:%M %p IST")
    }

    # Determine market status based on time and day
    is_weekday = weekday < 5

    if is_weekday and PRE_MARKET_START_TIME <= current_time < MARKET_OPEN_TIME:
        # PRE-MARKET (8:00 AM - 9:15 AM on weekdays)
        status_data["is_open"] = False
        status_data["status"] = "PRE-MARKET"
        next_open = now.replace(hour=MARKET_OPEN_TIME.hour, minute=MARKET_OPEN_TIME.minute, second=0, microsecond=0)
        status_data["message"] = f"opens in {format_relative_time(next_open)}"
        status_data["next_open"] = f"Today {MARKET_OPEN_TIME.strftime('%I:%M %p')}"

    elif is_weekday and MARKET_OPEN_TIME <= current_time < MARKET_CLOSE_TIME:
        # OPEN (9:15 AM - 3:30 PM on weekdays)
        status_data["is_open"] = True
        status_data["status"] = "OPEN"
        status_data["message"] = now.strftime("%I:%M %p IST")

    elif is_weekday and MARKET_CLOSE_TIME <= current_time < POST_MARKET_END_TIME:
        # POST-MARKET (3:30 PM - 5:00 PM on weekdays)
        status_data["is_open"] = False
        status_data["status"] = "POST-MARKET"
        # Calculate next market open (tomorrow or Monday if Friday)
        from datetime import timedelta
        if weekday == 4:  # Friday
            next_open = (now + timedelta(days=3)).replace(hour=MARKET_OPEN_TIME.hour, minute=MARKET_OPEN_TIME.minute, second=0, microsecond=0)
            status_data["message"] = f"opens in {format_relative_time(next_open)}"
            status_data["next_open"] = f"Monday {MARKET_OPEN_TIME.strftime('%I:%M %p')}"
        else:
            next_open = (now + timedelta(days=1)).replace(hour=MARKET_OPEN_TIME.hour, minute=MARKET_OPEN_TIME.minute, second=0, microsecond=0)
            status_data["message"] = f"opens in {format_relative_time(next_open)}"
            status_data["next_open"] = f"Tomorrow {MARKET_OPEN_TIME.strftime('%I:%M %p')}"

    else:
        # CLOSED (weekends, after 5 PM, before 8 AM)
        status_data["is_open"] = False
        status_data["status"] = "CLOSED"

        # Calculate next market open
        from datetime import timedelta
        if weekday >= 5:  # Weekend
            days_until_monday = (7 - weekday) % 7
            if days_until_monday == 0:
                days_until_monday = 1
            next_open = (now + timedelta(days=days_until_monday)).replace(hour=MARKET_OPEN_TIME.hour, minute=MARKET_OPEN_TIME.minute, second=0, microsecond=0)
            status_data["message"] = f"opens in {format_relative_time(next_open)}"
            status_data["next_open"] = f"Monday {MARKET_OPEN_TIME.strftime('%I:%M %p')}"
        elif current_time < PRE_MARKET_START_TIME:
            # Before 8 AM today
            next_open = now.replace(hour=MARKET_OPEN_TIME.hour, minute=MARKET_OPEN_TIME.minute, second=0, microsecond=0)
            status_data["message"] = f"opens in {format_relative_time(next_open)}"
            status_data["next_open"] = f"Today {MARKET_OPEN_TIME.strftime('%I:%M %p')}"
        else:
            # After 5 PM today
            if weekday == 4:  # Friday
                next_open = (now + timedelta(days=3)).replace(hour=MARKET_OPEN_TIME.hour, minute=MARKET_OPEN_TIME.minute, second=0, microsecond=0)
                status_data["message"] = f"opens in {format_relative_time(next_open)}"
                status_data["next_open"] = f"Monday {MARKET_OPEN_TIME.strftime('%I:%M %p')}"
            else:
                next_open = (now + timedelta(days=1)).replace(hour=MARKET_OPEN_TIME.hour, minute=MARKET_OPEN_TIME.minute, second=0, microsecond=0)
                status_data["message"] = f"opens in {format_relative_time(next_open)}"
                status_data["next_open"] = f"Tomorrow {MARKET_OPEN_TIME.strftime('%I:%M %p')}"

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
