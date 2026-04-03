from __future__ import annotations

import ast
import asyncio
from collections import defaultdict
from datetime import datetime
import re
from typing import Any, Dict, List, Optional, Set, Tuple, TYPE_CHECKING
import warnings

import numpy as np
import pandas as pd
import yfinance as yf

if TYPE_CHECKING:
    import asyncpg

warnings.filterwarnings("ignore")

# Period to SQL interval mapping
PERIOD_MAP = {
    "1mo": "1 month",
    "3mo": "3 months",
    "6mo": "6 months",
    "1y": "1 year",
    "2y": "2 years",
    "5y": "5 years",
    "max": "100 years",
}


async def fetch_all_symbols(pool: "asyncpg.Pool") -> List[Dict[str, Any]]:
    """Fetch all symbols from tickers table."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, symbol FROM tickers ORDER BY symbol"
        )
        return [{"id": row["id"], "symbol": row["symbol"]} for row in rows]


async def _fetch_single_batch(
    pool: "asyncpg.Pool",
    batch: List[int],
    sql_interval: str,
    max_retries: int = 3,
) -> List[Any]:
    """Fetch a single batch with retry logic."""
    for attempt in range(max_retries):
        try:
            async with pool.acquire() as conn:
                # Set statement timeout on connection
                await conn.execute("SET statement_timeout = '180000'")  # 3 minutes

                # Use CURRENT_DATE for consistent date comparison (timezone-independent)
                rows = await conn.fetch(
                    f"""
                    SELECT ticker_id, day, open, high, low, close, volume
                    FROM ohlc_daily
                    WHERE ticker_id = ANY($1::int[])
                      AND day >= CURRENT_DATE - INTERVAL '{sql_interval}'
                    ORDER BY ticker_id, day ASC
                    """,
                    batch,
                    timeout=180,  # 3 minute timeout
                )
                return list(rows)
        except (TimeoutError, asyncio.TimeoutError) as e:
            if attempt < max_retries - 1:
                wait_time = (attempt + 1) * 2  # 2, 4, 6 seconds
                print(f"Batch timeout, retrying in {wait_time}s (attempt {attempt + 1}/{max_retries})")
                await asyncio.sleep(wait_time)
            else:
                print(f"Batch failed after {max_retries} attempts")
                raise
    return []


async def _fetch_ohlcv_from_db(
    pool: "asyncpg.Pool",
    ticker_ids: List[int],
    period: str,
    batch_size: int = 100,
    max_concurrent: int = 5,
) -> Dict[int, pd.DataFrame]:
    """Fetch OHLCV data directly from database (internal).

    Uses batched queries with concurrency for better performance.
    """
    sql_interval = PERIOD_MAP.get(period.lower(), "1 year")
    result: Dict[int, pd.DataFrame] = {}

    # Split into batches
    batches = [
        ticker_ids[i : i + batch_size]
        for i in range(0, len(ticker_ids), batch_size)
    ]

    # Process batches with limited concurrency
    semaphore = asyncio.Semaphore(max_concurrent)

    async def fetch_with_semaphore(batch: List[int]) -> List[Any]:
        async with semaphore:
            return await _fetch_single_batch(pool, batch, sql_interval)

    # Run all batches concurrently (limited by semaphore)
    print(f"    Fetching {len(batches)} batches ({len(ticker_ids)} tickers total)...")
    all_rows_lists = await asyncio.gather(
        *[fetch_with_semaphore(batch) for batch in batches],
        return_exceptions=True
    )

    # Process results
    successful_batches = 0
    failed_batches = 0
    total_rows = 0
    for rows_or_exc in all_rows_lists:
        if isinstance(rows_or_exc, Exception):
            failed_batches += 1
            print(f"    Batch error: {rows_or_exc}")
            continue

        successful_batches += 1
        rows = rows_or_exc
        total_rows += len(rows)

        # Group rows by ticker_id and convert to DataFrames
        grouped: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
        for row in rows:
            grouped[row["ticker_id"]].append({
                "Date": row["day"],
                "Open": float(row["open"]) if row["open"] else 0.0,
                "High": float(row["high"]) if row["high"] else 0.0,
                "Low": float(row["low"]) if row["low"] else 0.0,
                "Close": float(row["close"]) if row["close"] else 0.0,
                "Volume": int(row["volume"]) if row["volume"] else 0,
            })

        for ticker_id, records in grouped.items():
            df = pd.DataFrame(records)
            df.set_index("Date", inplace=True)
            df.index = pd.to_datetime(df.index)
            result[ticker_id] = df

    print(f"    Done: {successful_batches}/{len(batches)} batches, {total_rows} rows, {len(result)} tickers")
    return result


async def fetch_ohlcv_batch(
    pool: "asyncpg.Pool",
    ticker_ids: List[int],
    period: str,
    batch_size: int = 100,
    max_concurrent: int = 5,
) -> Dict[int, pd.DataFrame]:
    """Fetch OHLCV data with Redis cache layer.

    Checks Redis cache first, fetches missing data from DB, caches results.
    """
    import redis_cache

    result: Dict[int, pd.DataFrame] = {}

    # Step 1: Check Redis cache first
    try:
        cached_data, missing_ids = await redis_cache.get_cached_ohlcv_batch(
            ticker_ids, period
        )

        # Convert cached data to DataFrames
        for ticker_id, records in cached_data.items():
            df = pd.DataFrame(records)
            df.set_index("Date", inplace=True)
            df.index = pd.to_datetime(df.index)
            result[ticker_id] = df

        cache_hit_pct = (
            len(cached_data) / len(ticker_ids) * 100 if ticker_ids else 0
        )
        print(
            f"OHLCV cache: {len(cached_data)} hit, {len(missing_ids)} miss "
            f"({cache_hit_pct:.1f}% hit rate)"
        )

        if not missing_ids:
            return result  # All data from cache!

    except Exception as e:
        print(f"Redis cache error: {e}, falling back to DB")
        missing_ids = list(ticker_ids)

    # Step 2: Fetch missing data from DB
    if missing_ids:
        db_data = await _fetch_ohlcv_from_db(
            pool, missing_ids, period, batch_size, max_concurrent
        )

        # Cache the fetched data
        try:
            to_cache: Dict[int, List[Dict[str, Any]]] = {}
            for tid, df in db_data.items():
                # Convert DataFrame to list of dicts for caching
                records = df.reset_index().to_dict("records")
                # Convert dates to ISO strings for JSON serialization
                for r in records:
                    if hasattr(r["Date"], "isoformat"):
                        r["Date"] = r["Date"].isoformat()
                    else:
                        r["Date"] = str(r["Date"])
                to_cache[tid] = records

            cached_count = await redis_cache.cache_ohlcv_batch(to_cache, period)
            print(f"Cached {cached_count} tickers to Redis")
        except Exception as e:
            print(f"Failed to cache OHLCV: {e}")

        result.update(db_data)

    return result


async def preload_ohlcv_cache(
    pool: "asyncpg.Pool",
    periods: Optional[List[str]] = None,
    force_refresh: bool = False,
) -> Dict[str, int]:
    """Preload OHLCV data for all symbols into Redis cache.

    Called at startup and scheduled before trading day.

    Args:
        pool: Database connection pool
        periods: List of periods to preload (default: ["6mo"])
        force_refresh: If True, clear existing cache and reload all data

    Returns:
        Dict mapping period to number of tickers cached
    """
    import redis_cache

    periods = periods or ["6mo"]
    stats: Dict[str, int] = {}

    # Get only ticker IDs that have OHLCV data in ohlc_daily
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT DISTINCT ticker_id FROM ohlc_daily"
        )
        all_ids = [row["ticker_id"] for row in rows]

    print(f"Preloading OHLCV cache for {len(all_ids)} tickers (with OHLCV data)...")

    for period in periods:
        # Force refresh: clear existing cache for this period
        if force_refresh:
            try:
                deleted = await redis_cache.clear_ohlcv_cache(period)
                print(f"  {period}: Cleared {deleted} cached entries (force refresh)")
            except Exception as e:
                print(f"  {period}: Failed to clear cache: {e}")

        # Check what's already cached
        try:
            _, missing_ids = await redis_cache.get_cached_ohlcv_batch(all_ids, period)
        except Exception:
            missing_ids = all_ids

        if not missing_ids:
            print(f"  {period}: Already cached (100%)")
            stats[period] = len(all_ids)
            continue

        print(f"  {period}: Loading {len(missing_ids)} tickers from DB...")

        # Fetch from DB (larger batches for background preload)
        db_data = await _fetch_ohlcv_from_db(
            pool, missing_ids, period, batch_size=200, max_concurrent=3
        )

        print(f"  {period}: Fetched {len(db_data)} tickers from DB")

        if not db_data:
            # These tickers exist but have no data in this period (stale/delisted)
            # Cache empty results so they won't be re-queried
            try:
                empty_cache: Dict[int, List[Dict[str, Any]]] = {tid: [] for tid in missing_ids}
                await redis_cache.cache_ohlcv_batch(empty_cache, period)
                print(f"  {period}: Cached {len(missing_ids)} tickers as empty (stale data)")
            except Exception as e:
                print(f"  {period}: Failed to cache empty results: {e}")
            stats[period] = len(missing_ids)
            continue

        # Cache to Redis
        try:
            to_cache: Dict[int, List[Dict[str, Any]]] = {}
            for tid, df in db_data.items():
                if df.empty:
                    continue
                records = df.reset_index().to_dict("records")
                for r in records:
                    if hasattr(r["Date"], "isoformat"):
                        r["Date"] = r["Date"].isoformat()
                    else:
                        r["Date"] = str(r["Date"])
                to_cache[tid] = records

            if not to_cache:
                print(f"  {period}: WARNING - All fetched DataFrames were empty!")
                stats[period] = 0
                continue

            cached_count = await redis_cache.cache_ohlcv_batch(to_cache, period)
            print(f"  {period}: Cached {cached_count} tickers to Redis")
            stats[period] = cached_count
        except Exception as e:
            print(f"  {period}: Cache error - {e}")
            stats[period] = 0

    return stats


class ConditionEvaluator:
    """Safely compile and evaluate boolean expressions."""

    _ALLOWED_NODE_TYPES = (
        ast.Expression,
        ast.BoolOp,
        ast.BinOp,
        ast.UnaryOp,
        ast.Compare,
        ast.Name,
        ast.Load,
        ast.Constant,
        ast.operator,
        ast.unaryop,
        ast.boolop,
        ast.cmpop,
    )

    _DISALLOWED_NODE_TYPES = (
        ast.Call,
        ast.Attribute,
        ast.Subscript,
        ast.Dict,
        ast.List,
        ast.Set,
        ast.ListComp,
        ast.DictComp,
        ast.GeneratorExp,
        ast.Lambda,
        ast.IfExp,
        ast.Await,
        ast.Yield,
    )

    def __init__(self, expression: str) -> None:
        if not expression or not expression.strip():
            raise ValueError("Condition expression is required")

        self.expression = expression.strip()
        tree = ast.parse(self.expression, mode="eval")
        self._validate(tree)
        self._code = compile(tree, "<condition_expr>", "eval")

    def _validate(self, tree: ast.AST) -> None:
        for node in ast.walk(tree):
            if isinstance(node, self._DISALLOWED_NODE_TYPES):
                raise ValueError("Unsupported syntax in condition expression")
            if not isinstance(node, self._ALLOWED_NODE_TYPES):
                raise ValueError("Unsupported syntax in condition expression")
            if isinstance(node, ast.Name) and node.id.startswith("__"):
                raise ValueError("Invalid variable name in expression")

    def evaluate(self, context: Dict[str, Any]) -> bool:
        try:
            return bool(eval(self._code, {"__builtins__": {}}, context))
        except Exception as exc:  # pragma: no cover - guardrail
            raise ValueError(f"Failed to evaluate condition: {exc}") from exc


class StockScreener:
    """Optimized stock screener for NSE stocks."""

    def __init__(
        self,
        symbols: List[str],
        period: str = "1y",
        ticker_map: Optional[Dict[str, int]] = None,
    ) -> None:
        self.symbols = symbols
        self.period = period
        self.ticker_map = ticker_map or {}  # symbol -> ticker_id mapping
        self.data: Dict[str, pd.DataFrame] = {}
        self.indicators: Dict[str, Dict[str, pd.Series]] = {}
        self.atr_periods: Set[int] = set()
        self.ema_periods: Set[int] = set()
        self.sma_periods: Set[int] = set()
        self.rsi_periods: Set[int] = set()
        self.bb_specs: Set[Tuple[int, float]] = set()
        self.supertrend_specs: Set[Tuple[int, float]] = set()
        self.max_high_specs: Set[Tuple[int, str]] = set()

    @staticmethod
    def _to_float(value: Any, default: float = 0.0) -> float:
        if pd.isna(value):
            return default
        return float(value)

    def load_data_from_dict(
        self, data_by_ticker_id: Dict[int, pd.DataFrame]
    ) -> Dict[str, pd.DataFrame]:
        """Load OHLCV data from pre-fetched dictionary (database source)."""
        self.data.clear()

        # Reverse map: ticker_id -> symbol
        id_to_symbol = {v: k for k, v in self.ticker_map.items()}

        for ticker_id, df in data_by_ticker_id.items():
            symbol = id_to_symbol.get(ticker_id)
            if not symbol or symbol not in self.symbols:
                continue

            if df.empty:
                continue

            # Ensure datetime index
            if not isinstance(df.index, pd.DatetimeIndex):
                df.index = pd.to_datetime(df.index)

            # Drop rows with all NaN values
            df = df.dropna(how="all")
            if not df.empty:
                self.data[symbol] = df

        return self.data

    def download_data(self) -> Dict[str, pd.DataFrame]:
        """Download OHLCV data for all symbols."""
        if not self.symbols:
            return {}

        try:
            data = yf.download(
                self.symbols,
                period=self.period,
                group_by="ticker",
                auto_adjust=True,
                threads=True,
                progress=False,
            )
        except Exception:
            return {}

        self.data.clear()
        for symbol in self.symbols:
            try:
                if len(self.symbols) == 1:
                    df = data.copy()
                else:
                    df = data[symbol].copy()

                df = df.dropna(how="all")
                if not df.empty:
                    # Ensure datetime index for indicator resampling
                    if not isinstance(df.index, pd.DatetimeIndex):
                        df.index = pd.to_datetime(df.index)
                    self.data[symbol] = df
            except Exception:
                continue
        return self.data

    def calculate_atr(self, df: pd.DataFrame, period: int = 14) -> pd.Series:
        high = df["High"]
        low = df["Low"]
        close = df["Close"]

        tr1 = high - low
        tr2 = (high - close.shift()).abs()
        tr3 = (low - close.shift()).abs()

        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        atr = tr.ewm(alpha=1 / period, adjust=False).mean()
        return atr
  
    def calculate_ema(self, series: pd.Series, period: int) -> pd.Series:
        return series.ewm(span=period, adjust=False).mean()

    def calculate_sma(self, series: pd.Series, period: int) -> pd.Series:
        return series.rolling(window=period).mean()

    def calculate_rsi(self, df: pd.DataFrame, period: int = 14) -> pd.Series:
        delta = df["Close"].diff()
        gain = delta.where(delta > 0, 0)
        loss = -delta.where(delta < 0, 0)
        avg_gain = gain.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
        avg_loss = loss.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        return rsi

    def calculate_bollinger(
        self, df: pd.DataFrame, period: int = 20, std: float = 2.0
    ) -> Tuple[pd.Series, pd.Series, pd.Series]:
        middle = df["Close"].rolling(window=period).mean()
        std_dev = df["Close"].rolling(window=period).std()
        upper = middle + (std_dev * std)
        lower = middle - (std_dev * std)
        return upper, middle, lower

    def calculate_supertrend(
        self, df: pd.DataFrame, period: int = 10, multiplier: float = 3.0
    ) -> pd.Series:
        high = df["High"]
        low = df["Low"]
        close = df["Close"]

        atr = (
            self.calculate_atr(df, period)
            .fillna(method="bfill")
            .fillna(method="ffill")
        )

        hl2 = (high + low) / 2
        basic_upperband = hl2 + multiplier * atr
        basic_lowerband = hl2 - multiplier * atr

        final_upperband = basic_upperband.copy()
        final_lowerband = basic_lowerband.copy()

        for i in range(1, len(df)):
            current_upperband = basic_upperband.iloc[i]
            prev_upperband = final_upperband.iloc[i - 1]
            current_lowerband = basic_lowerband.iloc[i]
            prev_lowerband = final_lowerband.iloc[i - 1]

            if current_upperband < prev_upperband or close.iloc[i - 1] > prev_upperband:
                final_upperband.iloc[i] = current_upperband
            else:
                final_upperband.iloc[i] = prev_upperband

            if current_lowerband > prev_lowerband or close.iloc[i - 1] < prev_lowerband:
                final_lowerband.iloc[i] = current_lowerband
            else:
                final_lowerband.iloc[i] = prev_lowerband

        supertrend = pd.Series(np.nan, index=df.index, dtype=float)
        supertrend.iloc[0] = final_upperband.iloc[0]

        for i in range(1, len(df)):
            prev_value = supertrend.iloc[i - 1]

            if prev_value == final_upperband.iloc[i - 1]:
                if close.iloc[i] <= final_upperband.iloc[i]:
                    supertrend.iloc[i] = final_upperband.iloc[i]
                else:
                    supertrend.iloc[i] = final_lowerband.iloc[i]
            else:
                if close.iloc[i] >= final_lowerband.iloc[i]:
                    supertrend.iloc[i] = final_lowerband.iloc[i]
                else:
                    supertrend.iloc[i] = final_upperband.iloc[i]

        return supertrend

    def calculate_max_high(
        self, df: pd.DataFrame, period: int = 52, freq: str = "W"
    ) -> pd.Series:
        if freq == "W":
            weekly_high = df["High"].resample("W").max()
            rolling_max = weekly_high.rolling(window=period).max()
            return rolling_max.reindex(df.index, method="ffill")
        return df["High"].rolling(window=period).max()

    def calculate_indicators(self, shift_dict: Dict[str, Set[int]]) -> None:
        for symbol, df in self.data.items():
            try:
                ind: Dict[str, pd.Series] = {}

                for p in self.atr_periods:
                    key = f"atr_{p}"
                    ind[key] = self.calculate_atr(df, p)

                for p in self.ema_periods:
                    key = f"ema_{p}"
                    ind[key] = self.calculate_ema(df["Close"], p)

                for p in self.sma_periods:
                    key = f"sma_{p}"
                    ind[key] = self.calculate_sma(df["Close"], p)

                for p in self.rsi_periods:
                    key = f"rsi_{p}"
                    ind[key] = self.calculate_rsi(df, p)

                for period, std in self.bb_specs:
                    upper, middle, lower = self.calculate_bollinger(df, period, std)
                    std_key = (
                        str(int(std)) if std == int(std) else str(std).replace(".", "_")
                    )
                    ind[f"bb_upper_{period}_{std_key}"] = upper
                    ind[f"bb_middle_{period}_{std_key}"] = middle
                    ind[f"bb_lower_{period}_{std_key}"] = lower

                for period, mult in self.supertrend_specs:
                    mult_key = (
                        str(int(mult)) if mult == int(mult) else str(mult).replace(".", "_")
                    )
                    key = f"supertrend_{period}_{mult_key}"
                    ind[key] = self.calculate_supertrend(df, period, mult)

                for period, freq in self.max_high_specs:
                    key = f"high_{period}_{freq}"
                    ind[key] = self.calculate_max_high(df, period, freq)

                ind["liquidity"] = df["Close"] * df["Volume"]

                for ind_name, shifts in shift_dict.items():
                    if ind_name not in ind:
                        continue
                    for sh in shifts:
                        shift_key = f"{ind_name}_shift_{sh}"
                        ind[shift_key] = ind[ind_name].shift(sh)

                self.indicators[symbol] = ind
            except Exception:
                continue

    def screen_stocks(
        self, condition_expr: str, evaluator: Optional[ConditionEvaluator] = None
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        evaluator = evaluator or ConditionEvaluator(condition_expr)
        matches: List[Dict[str, Any]] = []
        indicator_names: Set[str] = set()
        base_keys = {"close", "volume", "liquidity"}

        for symbol, df in self.data.items():
            if df.empty or symbol not in self.indicators:
                continue

            ind = self.indicators[symbol]
            latest = df.iloc[-1]
            close_value = self._to_float(latest["Close"])
            volume_value = self._to_float(latest["Volume"])
            liquidity_series = ind.get("liquidity")
            liquidity_value = (
                self._to_float(liquidity_series.iloc[-1]) if liquidity_series is not None else 0.0
            )

            context: Dict[str, Any] = {
                "close": close_value,
                "volume": volume_value,
                "liquidity": liquidity_value,
            }

            for key, series in ind.items():
                val = series.iloc[-1]
                context[key] = self._to_float(val)

            try:
                if not evaluator.evaluate(context):
                    continue
            except ValueError as exc:
                raise exc
            except Exception:
                continue

            indicator_values: Dict[str, Optional[float]] = {}
            for key, value in context.items():
                if key in base_keys:
                    continue
                indicator_names.add(key)
                if pd.isna(value) or (isinstance(value, float) and np.isnan(value)):
                    indicator_values[key] = None
                else:
                    indicator_values[key] = round(float(value), 4)

            timestamp = df.index[-1]
            if hasattr(timestamp, "to_pydatetime"):
                timestamp_iso = timestamp.to_pydatetime().isoformat()
            elif hasattr(timestamp, "isoformat"):
                timestamp_iso = timestamp.isoformat()
            else:
                timestamp_iso = str(timestamp)

            matches.append(
                {
                    "symbol": symbol,
                    "close": round(close_value, 2),
                    "volume": int(volume_value),
                    "liquidity": round(liquidity_value, 2),
                    "as_of": timestamp_iso,
                    "indicators": indicator_values,
                }
            )

        matches.sort(key=lambda row: row["liquidity"], reverse=True)
        return matches, sorted(indicator_names)


def get_nse_top_100_symbols() -> List[str]:
    symbols = [
        "RELIANCE.NS",
        "TCS.NS",
        "HDFCBANK.NS",
        "INFY.NS",
        "ICICIBANK.NS",
        "HINDUNILVR.NS",
        "ITC.NS",
        "SBIN.NS",
        "BHARTIARTL.NS",
        "KOTAKBANK.NS",
        "LT.NS",
        "AXISBANK.NS",
        "ASIANPAINT.NS",
        "MARUTI.NS",
        "TITAN.NS",
        "BAJFINANCE.NS",
        "HCLTECH.NS",
        "SUNPHARMA.NS",
        "ULTRACEMCO.NS",
        "NESTLEIND.NS",
        "WIPRO.NS",
        "ONGC.NS",
        "NTPC.NS",
        "POWERGRID.NS",
        "TATAMOTORS.NS",
        "TECHM.NS",
        "M&M.NS",
        "ADANIPORTS.NS",
        "JSWSTEEL.NS",
        "TATASTEEL.NS",
        "INDUSINDBK.NS",
        "DIVISLAB.NS",
        "BAJAJFINSV.NS",
        "DRREDDY.NS",
        "CIPLA.NS",
        "EICHERMOT.NS",
        "GRASIM.NS",
        "HINDALCO.NS",
        "BRITANNIA.NS",
        "COALINDIA.NS",
        "BPCL.NS",
        "SHREECEM.NS",
        "HEROMOTOCO.NS",
        "UPL.NS",
        "SBILIFE.NS",
        "APOLLOHOSP.NS",
        "TATACONSUM.NS",
        "ADANIENT.NS",
        "VEDL.NS",
        "PIDILITIND.NS",
        "GODREJCP.NS",
        "DABUR.NS",
        "DLF.NS",
        "BANKBARODA.NS",
        "INDIGO.NS",
        "HAVELLS.NS",
        "HDFCLIFE.NS",
        "TORNTPHARM.NS",
        "IOC.NS",
        "SIEMENS.NS",
        "BAJAJ-AUTO.NS",
        "ICICIPRULI.NS",
        "ADANIGREEN.NS",
        "LUPIN.NS",
        "AMBUJACEM.NS",
        "BERGEPAINT.NS",
        "MARICO.NS",
        "BOSCHLTD.NS",
        "ACC.NS",
        "PNB.NS",
        "GAIL.NS",
        "HINDZINC.NS",
        "BIOCON.NS",
        "SRF.NS",
        "COLPAL.NS",
        "BANDHANBNK.NS",
        "CHOLAFIN.NS",
        "INDUSTOWER.NS",
        "INDHOTEL.NS",
        "PEL.NS",
        "MOTHERSON.NS",
        "RECLTD.NS",
        "ICICIGI.NS",
        "SAIL.NS",
        "TORNTPOWER.NS",
        "ALKEM.NS",
        "PAGEIND.NS",
        "GODREJPROP.NS",
        "CUMMINSIND.NS",
        "NAUKRI.NS",
        "ZYDUSLIFE.NS",
        "MPHASIS.NS",
        "TRENT.NS",
        "HAL.NS",
        "CONCOR.NS",
        "VOLTAS.NS",
        "AUBANK.NS",
        "PIIND.NS",
        "LTIM.NS",
    ]
    return symbols


def parse_expression(
    condition_expr: str,
) -> Tuple[
    Set[int],
    Set[int],
    Set[int],
    Set[int],
    Set[Tuple[int, float]],
    Set[Tuple[int, float]],
    Set[Tuple[int, str]],
    Dict[str, Set[int]],
]:
    vars_found = re.findall(r"\b([a-zA-Z0-9_]+)\b", condition_expr)
    atr_periods: Set[int] = set()
    ema_periods: Set[int] = set()
    sma_periods: Set[int] = set()
    rsi_periods: Set[int] = set()
    bb_specs: Set[Tuple[int, float]] = set()
    supertrend_specs: Set[Tuple[int, float]] = set()
    max_high_specs: Set[Tuple[int, str]] = set()
    shift_dict: Dict[str, Set[int]] = {}

    for v in set(vars_found):
        if v.lower() in ["close", "volume", "liquidity", "and", "or", "not", "true", "false"]:
            continue

        match = re.match(r"(atr|ema|sma|rsi)_(\d+)$", v)
        if match:
            typ, per = match.groups()
            per_int = int(per)
            if typ == "atr":
                atr_periods.add(per_int)
            elif typ == "ema":
                ema_periods.add(per_int)
            elif typ == "sma":
                sma_periods.add(per_int)
            elif typ == "rsi":
                rsi_periods.add(per_int)
            continue

        match = re.match(r"(atr|ema|sma|rsi)_(\d+)_shift_(\d+)$", v)
        if match:
            typ, per, sh = match.groups()
            per_int = int(per)
            sh_int = int(sh)
            ind_name = f"{typ}_{per_int}"
            if typ == "atr":
                atr_periods.add(per_int)
            elif typ == "ema":
                ema_periods.add(per_int)
            elif typ == "sma":
                sma_periods.add(per_int)
            elif typ == "rsi":
                rsi_periods.add(per_int)
            shift_dict.setdefault(ind_name, set()).add(sh_int)
            continue

        match = re.match(r"bb_(upper|middle|lower)_(\d+)_([\d_]+)$", v)
        if match:
            _, per, std_str = match.groups()
            per_int = int(per)
            std = float(std_str.replace("_", "."))
            bb_specs.add((per_int, std))
            continue

        match = re.match(r"bb_(upper|middle|lower)_(\d+)_([\d_]+)_shift_(\d+)$", v)
        if match:
            _, per, std_str, sh = match.groups()
            per_int = int(per)
            std = float(std_str.replace("_", "."))
            sh_int = int(sh)
            bb_specs.add((per_int, std))
            for band in ["upper", "middle", "lower"]:
                key = f"bb_{band}_{per_int}_{std_str}"
                shift_dict.setdefault(key, set()).add(sh_int)
            continue

        match = re.match(r"supertrend_(\d+)_([\d_]+)$", v)
        if match:
            per, mult_str = match.groups()
            per_int = int(per)
            mult = float(mult_str.replace("_", "."))
            supertrend_specs.add((per_int, mult))
            atr_periods.add(per_int)
            continue

        match = re.match(r"supertrend_(\d+)_([\d_]+)_shift_(\d+)$", v)
        if match:
            per, mult_str, sh = match.groups()
            per_int = int(per)
            mult = float(mult_str.replace("_", "."))
            sh_int = int(sh)
            ind_name = f"supertrend_{per_int}_{mult_str}"
            supertrend_specs.add((per_int, mult))
            atr_periods.add(per_int)
            shift_dict.setdefault(ind_name, set()).add(sh_int)
            continue

        match = re.match(r"high_(\d+)_([A-Z])$", v)
        if match:
            per, freq = match.groups()
            max_high_specs.add((int(per), freq))
            continue

        match = re.match(r"high_(\d+)_([A-Z])_shift_(\d+)$", v)
        if match:
            per, freq, sh = match.groups()
            per_int = int(per)
            sh_int = int(sh)
            ind_name = f"high_{per_int}_{freq}"
            max_high_specs.add((per_int, freq))
            shift_dict.setdefault(ind_name, set()).add(sh_int)
            continue

    return (
        atr_periods,
        ema_periods,
        sma_periods,
        rsi_periods,
        bb_specs,
        supertrend_specs,
        max_high_specs,
        shift_dict,
    )


def run_screener(
    condition_expr: str,
    *,
    symbols: Optional[List[str]] = None,
    period: str = "1y",
) -> Dict[str, Any]:
    expression = (condition_expr or "").strip()
    if not expression:
        raise ValueError("Condition expression is required")

    target_symbols = symbols or get_nse_top_100_symbols()
    screener = StockScreener(target_symbols, period=period)

    expr_atr, expr_ema, expr_sma, expr_rsi, expr_bb, expr_st, expr_high, shift_dict = (
        parse_expression(expression)
    )

    screener.atr_periods = expr_atr
    screener.ema_periods = expr_ema
    screener.sma_periods = expr_sma
    screener.rsi_periods = expr_rsi
    screener.bb_specs = expr_bb
    screener.supertrend_specs = expr_st
    screener.max_high_specs = expr_high

    data = screener.download_data()
    if not data:
        raise RuntimeError("Failed to download NSE price data")

    screener.calculate_indicators(shift_dict)
    evaluator = ConditionEvaluator(expression)
    rows, indicator_columns = screener.screen_stocks(expression, evaluator=evaluator)

    available_symbols = sorted(screener.data.keys())
    missing_symbols = sorted(set(target_symbols) - set(available_symbols))

    return {
        "expression": expression,
        "generated_at": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "matched": len(rows),
        "universe": len(available_symbols),
        "missing_symbols": missing_symbols,
        "results": rows,
        "indicator_columns": indicator_columns,
    }


async def run_screener_async(
    pool: "asyncpg.Pool",
    condition_expr: str,
    *,
    symbols: Optional[List[str]] = None,
    period: str = "1y",
) -> Dict[str, Any]:
    """Async version of run_screener that uses database instead of yfinance."""
    expression = (condition_expr or "").strip()
    if not expression:
        raise ValueError("Condition expression is required")

    # Fetch all symbols from database
    all_tickers = await fetch_all_symbols(pool)

    # Build symbol -> ticker_id map
    ticker_map = {t["symbol"]: t["id"] for t in all_tickers}

    # Determine target symbols
    if symbols:
        # Clean provided symbols: remove .NS/.BO suffix, uppercase
        target_symbols = [
            s.replace(".NS", "").replace(".BO", "").upper() for s in symbols
        ]
        # Filter to only symbols that exist in database
        target_symbols = [s for s in target_symbols if s in ticker_map]
    else:
        # Use all symbols from database
        target_symbols = list(ticker_map.keys())

    if not target_symbols:
        raise RuntimeError("No valid symbols found in database")

    # Get ticker_ids for target symbols
    target_ticker_ids = [ticker_map[s] for s in target_symbols]

    # Fetch OHLCV data in batch from database
    ohlcv_data = await fetch_ohlcv_batch(pool, target_ticker_ids, period)

    if not ohlcv_data:
        raise RuntimeError("Failed to fetch OHLCV data from database")

    # Parse expression to determine required indicators
    expr_atr, expr_ema, expr_sma, expr_rsi, expr_bb, expr_st, expr_high, shift_dict = (
        parse_expression(expression)
    )

    # Run synchronous screener with pre-fetched data in thread pool
    def sync_screen() -> Dict[str, Any]:
        # Build ticker_map for only target symbols
        filtered_ticker_map = {s: ticker_map[s] for s in target_symbols}

        screener = StockScreener(
            target_symbols, period=period, ticker_map=filtered_ticker_map
        )

        screener.atr_periods = expr_atr
        screener.ema_periods = expr_ema
        screener.sma_periods = expr_sma
        screener.rsi_periods = expr_rsi
        screener.bb_specs = expr_bb
        screener.supertrend_specs = expr_st
        screener.max_high_specs = expr_high

        # Load pre-fetched data from database
        screener.load_data_from_dict(ohlcv_data)

        if not screener.data:
            raise RuntimeError("No OHLCV data available after loading from database")

        # Calculate indicators and screen
        screener.calculate_indicators(shift_dict)
        evaluator = ConditionEvaluator(expression)
        rows, indicator_columns = screener.screen_stocks(expression, evaluator=evaluator)

        available_symbols = sorted(screener.data.keys())
        missing_symbols = sorted(set(target_symbols) - set(available_symbols))

        return {
            "expression": expression,
            "generated_at": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
            "matched": len(rows),
            "universe": len(available_symbols),
            "missing_symbols": missing_symbols,
            "results": rows,
            "indicator_columns": indicator_columns,
        }

    # Run CPU-intensive indicator calculations in thread pool
    return await asyncio.to_thread(sync_screen)


if __name__ == "__main__":  # pragma: no cover - simple smoke test
    sample_expression = (
        "(close > ema_50) and (ema_50 > ema_150) and (liquidity > 1000000) "
        "and (close > 0.75 * high_52_W)"
    )
    summary = run_screener(sample_expression)
    print(
        f"{summary['matched']} matches out of {summary['universe']} symbols "
        f"for expression: {summary['expression']}"
    )
