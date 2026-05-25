"""
Seasonality Analysis Module

Calculates weekly and monthly seasonal return patterns from historical OHLC data.
Groups returns by ISO week number (1-52) and month to identify recurring patterns.

Uses ohlc_daily (up to 10 years) or ohlc_1hour (up to 5 years).
"""

import logging
import calendar
import pandas as pd
import numpy as np
from typing import Dict, Optional, Any
from datetime import datetime

from db_timeframe_accessor import TimeframeDataAccessor

logger = logging.getLogger(__name__)


def calculate_seasonality(
    conn,
    ticker_symbol: str,
) -> Optional[Dict[str, Any]]:
    """
    Calculate weekly seasonality analysis for a stock using all available daily data.

    Args:
        conn: psycopg2 connection
        ticker_symbol: Stock symbol (e.g., 'RELIANCE')

    Returns:
        Dict with weekly_stats, monthly_stats, yearly_heatmap, summary
        or None if insufficient data.
    """
    # Resolve ticker_id
    ticker_info = _resolve_ticker(conn, ticker_symbol)
    if not ticker_info:
        return None

    ticker_id = ticker_info['ticker_id']
    company_name = ticker_info['company_name']

    # Fetch all available daily OHLC data (no date filter — use everything in DB)
    db_timeframe = '1day'

    accessor = TimeframeDataAccessor(conn)
    ohlc = accessor.fetch_ohlc(ticker_id, timeframe=db_timeframe)

    if not ohlc or len(ohlc) < 52:
        return None

    # Build DataFrame
    df = pd.DataFrame(ohlc)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.set_index('timestamp').sort_index()
    df = df[df['close'].notna()]

    if len(df) < 52:
        return None

    # Resample to weekly (Friday close) and calculate returns
    weekly = df['close'].resample('W-FRI').last().dropna()
    weekly_returns = weekly.pct_change().dropna() * 100

    if len(weekly_returns) < 10:
        return None

    # Build returns DataFrame with week and year info
    iso_cal = weekly_returns.index.isocalendar()
    returns_df = pd.DataFrame({
        'return': weekly_returns.values,
        'week': iso_cal.week.values.astype(int),
        'year': iso_cal.year.values.astype(int),
    })

    # Weekly stats (1-52)
    weekly_stats = []
    for week_num in range(1, 53):
        week_data = returns_df[returns_df['week'] == week_num]['return']
        if len(week_data) == 0:
            continue
        weekly_stats.append({
            'week': int(week_num),
            'avg_return': round(float(week_data.mean()), 4),
            'median_return': round(float(week_data.median()), 4),
            'win_rate': round(float((week_data > 0).sum() / len(week_data) * 100), 1),
            'std_dev': round(float(week_data.std()), 4) if len(week_data) > 1 else 0.0,
            'min_return': round(float(week_data.min()), 4),
            'max_return': round(float(week_data.max()), 4),
            'count': int(len(week_data)),
        })

    # Yearly heatmap
    yearly_heatmap = []
    for year in sorted(returns_df['year'].unique()):
        year_data = returns_df[returns_df['year'] == year]
        weeks = {}
        for _, row in year_data.iterrows():
            weeks[int(row['week'])] = round(float(row['return']), 4)
        yearly_heatmap.append({'year': int(year), 'weeks': weeks})

    # Monthly stats
    monthly_returns = df['close'].resample('ME').last().pct_change().dropna() * 100
    monthly_stats = []
    for month in range(1, 13):
        month_data = monthly_returns[monthly_returns.index.month == month]
        if len(month_data) == 0:
            continue
        monthly_stats.append({
            'month': int(month),
            'month_name': calendar.month_abbr[month],
            'avg_return': round(float(month_data.mean()), 4),
            'median_return': round(float(month_data.median()), 4),
            'win_rate': round(float((month_data > 0).sum() / len(month_data) * 100), 1),
            'std_dev': round(float(month_data.std()), 4) if len(month_data) > 1 else 0.0,
            'count': int(len(month_data)),
        })

    # Summary
    best_week = max(weekly_stats, key=lambda x: x['avg_return']) if weekly_stats else None
    worst_week = min(weekly_stats, key=lambda x: x['avg_return']) if weekly_stats else None
    best_month = max(monthly_stats, key=lambda x: x['avg_return']) if monthly_stats else None
    worst_month = min(monthly_stats, key=lambda x: x['avg_return']) if monthly_stats else None

    summary = {
        'ticker': ticker_symbol,
        'company_name': company_name,
        'data_range': {
            'start': str(df.index.min().date()),
            'end': str(df.index.max().date()),
        },
        'total_weeks': int(len(weekly_returns)),
        'years_covered': int(len(returns_df['year'].unique())),
        'overall_avg_weekly_return': round(float(weekly_returns.mean()), 4),
        'best_week': best_week['week'] if best_week else None,
        'worst_week': worst_week['week'] if worst_week else None,
        'best_month': best_month['month'] if best_month else None,
        'worst_month': worst_month['month'] if worst_month else None,
    }

    return {
        'weekly_stats': weekly_stats,
        'monthly_stats': monthly_stats,
        'yearly_heatmap': yearly_heatmap,
        'summary': summary,
    }


def _resolve_ticker(conn, symbol: str) -> Optional[Dict]:
    """Resolve ticker symbol to ticker_id and company name."""
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT t.id, t.symbol, COALESCE(sf.long_name, t.name) as company_name
            FROM tickers t
            LEFT JOIN stock_fundamentals sf ON sf.ticker_id = t.id
            WHERE UPPER(t.symbol) = %s AND t.is_active = true
            LIMIT 1
        """, [symbol.upper()])
        row = cursor.fetchone()
        if row:
            return {'ticker_id': row[0], 'symbol': row[1], 'company_name': row[2] or row[1]}
        return None
    except Exception as e:
        logger.error(f"Error resolving ticker {symbol}: {e}")
        return None
    finally:
        cursor.close()
