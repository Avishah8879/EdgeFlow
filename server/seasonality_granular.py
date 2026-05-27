"""
Granular Seasonality Analysis Module

Calculates daily close-to-close return seasonality buckets for monthly,
week-of-month by month, and weekday by week-of-month heatmaps.
"""

import calendar
import logging
import sys
from typing import Any, Dict, Optional
from pathlib import Path

import pandas as pd

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from db_timeframe_accessor import TimeframeDataAccessor  # noqa: E402
from server.seasonality import _resolve_ticker  # noqa: E402

logger = logging.getLogger(__name__)


def _bucket_stats(series: pd.Series) -> Dict[str, Any]:
    return {
        "avg_return": round(float(series.mean()), 4),
        "win_pct": round(float((series > 0).mean()), 4),
        "count": int(series.count()),
    }


def calculate_granular_seasonality(
    conn,
    ticker_symbol: str,
    years: int,
) -> Optional[Dict[str, Any]]:
    """
    Compute daily close-to-close return seasonality buckets:
      - monthly: 12 buckets (Jan..Dec)
      - weekly: 48 buckets ({Month}_W{1-4})
      - daily: 20 buckets (W{1-4}_{Mon..Fri})

    Each bucket: { avg_return, win_pct, count }.

    Date window is the last `years` years measured from the most recent date
    in the DB for this ticker (not today, to handle stale data).
    """
    ticker_info = _resolve_ticker(conn, ticker_symbol)
    if not ticker_info:
        return None

    accessor = TimeframeDataAccessor(conn)
    ohlc = accessor.fetch_ohlc(ticker_info["ticker_id"], timeframe="1day")

    if not ohlc or len(ohlc) < 30:
        return None

    df = pd.DataFrame(ohlc)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.set_index("timestamp").sort_index()
    df = df[df["close"].notna()]

    if len(df) < 30:
        return None

    max_date = df.index.max()
    cutoff = max_date - pd.DateOffset(years=years)
    df = df.loc[df.index >= cutoff].copy()

    if len(df) < 30:
        return None

    df["ret"] = df["close"].pct_change() * 100
    df = df.dropna(subset=["ret"]).copy()

    if len(df) < 30:
        return None

    df["month"] = df.index.month
    df["month_name"] = df["month"].map(lambda month: calendar.month_abbr[int(month)])
    df["dow"] = df.index.dayofweek
    df = df[df["dow"] < 5].copy()

    if len(df) < 30:
        return None

    df["day_rank"] = df.groupby([df.index.year, df.index.month]).cumcount() + 1
    df["wom"] = ((df["day_rank"] - 1) // 5).clip(upper=3) + 1

    monthly: Dict[str, Dict[str, Any]] = {}
    for month in range(1, 13):
        month_name = calendar.month_abbr[month]
        month_data = df[df["month"] == month]["ret"]
        if not month_data.empty:
            monthly[month_name] = _bucket_stats(month_data)

    weekly: Dict[str, Dict[str, Any]] = {}
    for month in range(1, 13):
        month_name = calendar.month_abbr[month]
        for wom in range(1, 5):
            bucket_data = df[(df["month"] == month) & (df["wom"] == wom)]["ret"]
            if not bucket_data.empty:
                weekly[f"{month_name}_W{wom}"] = _bucket_stats(bucket_data)

    dow_abbr = ["Mon", "Tue", "Wed", "Thu", "Fri"]
    daily: Dict[str, Dict[str, Any]] = {}
    for wom in range(1, 5):
        for dow, label in enumerate(dow_abbr):
            bucket_data = df[(df["wom"] == wom) & (df["dow"] == dow)]["ret"]
            if not bucket_data.empty:
                daily[f"W{wom}_{label}"] = _bucket_stats(bucket_data)

    return {
        "monthly": monthly,
        "weekly": weekly,
        "daily": daily,
    }
