"""
Technical Indicator Calculator Library

This module provides functions for calculating technical indicators from OHLC data.
All functions work with pandas Series/DataFrames and return the latest calculated value.

Usage:
    from server.indicator_calculator import calculate_sma, calculate_ema, calculate_rsi

    # Calculate indicators
    sma_20 = calculate_sma(close_series, 20)
    ema_50 = calculate_ema(close_series, 50)
    rsi_14 = calculate_rsi(close_series, 14)
"""

import pandas as pd
import numpy as np
from typing import Dict, Optional


def calculate_sma(close: pd.Series, period: int) -> Optional[float]:
    """
    Calculate Simple Moving Average.

    Args:
        close: Pandas Series of closing prices
        period: Number of periods for SMA

    Returns:
        Latest SMA value or None if insufficient data
    """
    if len(close) < period:
        return None

    sma = close.rolling(window=period).mean()
    return float(sma.iloc[-1]) if not pd.isna(sma.iloc[-1]) else None


def calculate_ema(close: pd.Series, period: int) -> Optional[float]:
    """
    Calculate Exponential Moving Average.

    Args:
        close: Pandas Series of closing prices
        period: Number of periods for EMA

    Returns:
        Latest EMA value or None if insufficient data
    """
    if len(close) < period:
        return None

    ema = close.ewm(span=period, adjust=False).mean()
    return float(ema.iloc[-1]) if not pd.isna(ema.iloc[-1]) else None


def calculate_rsi(close: pd.Series, period: int = 14) -> Optional[float]:
    """
    Calculate Relative Strength Index.

    Args:
        close: Pandas Series of closing prices
        period: Number of periods for RSI (default: 14)

    Returns:
        Latest RSI value (0-100) or None if insufficient data
    """
    if len(close) < period + 1:
        return None

    # Calculate price changes
    delta = close.diff()

    # Separate gains and losses
    gain = delta.where(delta > 0, 0)
    loss = -delta.where(delta < 0, 0)

    # Calculate average gain and loss
    avg_gain = gain.rolling(window=period).mean()
    avg_loss = loss.rolling(window=period).mean()

    # Calculate RS and RSI
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))

    return float(rsi.iloc[-1]) if not pd.isna(rsi.iloc[-1]) else None


def calculate_atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> Optional[float]:
    """
    Calculate Average True Range (volatility indicator).

    Args:
        high: Pandas Series of high prices
        low: Pandas Series of low prices
        close: Pandas Series of closing prices
        period: Number of periods for ATR (default: 14)

    Returns:
        Latest ATR value or None if insufficient data
    """
    if len(close) < period + 1:
        return None

    # Calculate True Range components
    tr1 = high - low
    tr2 = abs(high - close.shift())
    tr3 = abs(low - close.shift())

    # True Range is the maximum of the three
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    # ATR is the moving average of True Range
    atr = tr.rolling(window=period).mean()

    return float(atr.iloc[-1]) if not pd.isna(atr.iloc[-1]) else None


def calculate_macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> Dict[str, Optional[float]]:
    """
    Calculate MACD (Moving Average Convergence Divergence).

    Args:
        close: Pandas Series of closing prices
        fast: Fast EMA period (default: 12)
        slow: Slow EMA period (default: 26)
        signal: Signal line EMA period (default: 9)

    Returns:
        Dictionary with macd_line, macd_signal, macd_histogram
    """
    if len(close) < slow + signal:
        return {
            'macd_line': None,
            'macd_signal': None,
            'macd_histogram': None
        }

    # Calculate fast and slow EMAs
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()

    # MACD line
    macd_line = ema_fast - ema_slow

    # Signal line
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()

    # Histogram
    histogram = macd_line - signal_line

    return {
        'macd_line': float(macd_line.iloc[-1]) if not pd.isna(macd_line.iloc[-1]) else None,
        'macd_signal': float(signal_line.iloc[-1]) if not pd.isna(signal_line.iloc[-1]) else None,
        'macd_histogram': float(histogram.iloc[-1]) if not pd.isna(histogram.iloc[-1]) else None
    }


def calculate_bollinger_bands(close: pd.Series, period: int = 20, std_dev: float = 2.0) -> Dict[str, Optional[float]]:
    """
    Calculate Bollinger Bands.

    Args:
        close: Pandas Series of closing prices
        period: Number of periods for moving average (default: 20)
        std_dev: Number of standard deviations (default: 2.0)

    Returns:
        Dictionary with bb_upper, bb_middle, bb_lower
    """
    if len(close) < period:
        return {
            'bb_upper': None,
            'bb_middle': None,
            'bb_lower': None
        }

    # Middle band (SMA)
    sma = close.rolling(window=period).mean()

    # Standard deviation
    std = close.rolling(window=period).std()

    # Upper and lower bands
    bb_upper = sma + (std * std_dev)
    bb_lower = sma - (std * std_dev)

    return {
        'bb_upper': float(bb_upper.iloc[-1]) if not pd.isna(bb_upper.iloc[-1]) else None,
        'bb_middle': float(sma.iloc[-1]) if not pd.isna(sma.iloc[-1]) else None,
        'bb_lower': float(bb_lower.iloc[-1]) if not pd.isna(bb_lower.iloc[-1]) else None
    }


def calculate_supertrend(high: pd.Series, low: pd.Series, close: pd.Series,
                         period: int = 7, multiplier: float = 3.0) -> Dict[str, Optional[float]]:
    """
    Calculate Supertrend indicator.

    Args:
        high: Pandas Series of high prices
        low: Pandas Series of low prices
        close: Pandas Series of closing prices
        period: ATR period (default: 7)
        multiplier: ATR multiplier (default: 3.0)

    Returns:
        Dictionary with supertrend value and direction (1=bullish, -1=bearish)
    """
    if len(close) < period + 1:
        return {
            'supertrend': None,
            'direction': None
        }

    # Calculate ATR
    tr1 = high - low
    tr2 = abs(high - close.shift())
    tr3 = abs(low - close.shift())
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr = tr.rolling(window=period).mean()

    # Calculate basic bands
    hl_avg = (high + low) / 2
    upper_band = hl_avg + (multiplier * atr)
    lower_band = hl_avg - (multiplier * atr)

    # Initialize Supertrend series
    supertrend = pd.Series(index=close.index, dtype=float)
    direction = pd.Series(index=close.index, dtype=int)

    # Calculate Supertrend
    for i in range(period, len(close)):
        if i == period:
            supertrend.iloc[i] = lower_band.iloc[i]
            direction.iloc[i] = 1
        else:
            # Check trend direction
            if close.iloc[i] > supertrend.iloc[i-1]:
                supertrend.iloc[i] = lower_band.iloc[i]
                direction.iloc[i] = 1
            elif close.iloc[i] < supertrend.iloc[i-1]:
                supertrend.iloc[i] = upper_band.iloc[i]
                direction.iloc[i] = -1
            else:
                supertrend.iloc[i] = supertrend.iloc[i-1]
                direction.iloc[i] = direction.iloc[i-1]

            # Adjust supertrend based on previous values
            if direction.iloc[i] == 1 and supertrend.iloc[i] < supertrend.iloc[i-1]:
                supertrend.iloc[i] = supertrend.iloc[i-1]
            elif direction.iloc[i] == -1 and supertrend.iloc[i] > supertrend.iloc[i-1]:
                supertrend.iloc[i] = supertrend.iloc[i-1]

    return {
        'supertrend': float(supertrend.iloc[-1]) if not pd.isna(supertrend.iloc[-1]) else None,
        'direction': int(direction.iloc[-1]) if not pd.isna(direction.iloc[-1]) else None
    }


def calculate_volume_sma(volume: pd.Series, period: int = 20) -> Optional[float]:
    """
    Calculate Simple Moving Average of volume.

    Args:
        volume: Pandas Series of volume data
        period: Number of periods for SMA (default: 20)

    Returns:
        Latest volume SMA or None if insufficient data
    """
    if len(volume) < period:
        return None

    vol_sma = volume.rolling(window=period).mean()
    return float(vol_sma.iloc[-1]) if not pd.isna(vol_sma.iloc[-1]) else None


def calculate_52_week_high(high: pd.Series, weeks: int = 52) -> Optional[float]:
    """
    Calculate 52-week high.

    Args:
        high: Pandas Series of high prices
        weeks: Number of weeks to look back (default: 52)

    Returns:
        Highest price in the period or None if insufficient data
    """
    # Assuming hourly data, 52 weeks = 52 * 5 days * 6.5 hours = ~1690 hours
    # For daily data, 52 weeks = 52 * 5 = 260 days
    # We'll use a flexible approach based on data length
    lookback = min(len(high), weeks * 5 * 6 if len(high) > 1000 else weeks * 5)

    if len(high) < 50:  # Need at least some data
        return None

    high_52w = high.tail(lookback).max()
    return float(high_52w) if not pd.isna(high_52w) else None


def calculate_all_indicators(df: pd.DataFrame) -> Dict[str, Optional[float]]:
    """
    Calculate all standard technical indicators from OHLC dataframe.

    Args:
        df: DataFrame with columns: open, high, low, close, volume

    Returns:
        Dictionary with all indicator values
    """
    close = df['close']
    high = df['high']
    low = df['low']
    volume = df['volume']

    indicators = {
        # SMAs (20, 50, 100 only)
        'sma_20': calculate_sma(close, 20),
        'sma_50': calculate_sma(close, 50),
        'sma_100': calculate_sma(close, 100),

        # EMAs (20, 50, 100 only)
        'ema_20': calculate_ema(close, 20),
        'ema_50': calculate_ema(close, 50),
        'ema_100': calculate_ema(close, 100),

        # RSI
        'rsi_14': calculate_rsi(close, 14),

        # ATR
        'atr_14': calculate_atr(high, low, close, 14),

        # Volume
        'volume_sma_20': calculate_volume_sma(volume, 20),
    }

    # MACD
    macd = calculate_macd(close)
    indicators.update(macd)

    # Bollinger Bands
    bb = calculate_bollinger_bands(close, 20, 2.0)
    indicators['bb_upper_20'] = bb['bb_upper']
    indicators['bb_middle_20'] = bb['bb_middle']
    indicators['bb_lower_20'] = bb['bb_lower']

    # Supertrend (7, 3)
    st_7_3 = calculate_supertrend(high, low, close, 7, 3.0)
    indicators['supertrend_7_3'] = st_7_3['supertrend']
    indicators['supertrend_direction_7_3'] = st_7_3['direction']

    # Supertrend (10, 3)
    st_10_3 = calculate_supertrend(high, low, close, 10, 3.0)
    indicators['supertrend_10_3'] = st_10_3['supertrend']
    indicators['supertrend_direction_10_3'] = st_10_3['direction']

    return indicators
