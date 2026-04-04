"""
Portfolio Optimizer Module

Black-Litterman portfolio optimization with Max Sharpe ratio.
Exactly matches the logic in optimiser_portfolio.py.
"""

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from typing import Dict, List, Any, Tuple
from datetime import datetime
import asyncpg
import yfinance as yf
import logging

logger = logging.getLogger(__name__)

# =============================================================================
# CONSTANTS (matching optimiser_portfolio.py)
# =============================================================================
RISK_FREE_RATE = 0.068  # 6.8% for India
IS_START, IS_END = "2018-01-01", "2020-12-31"
OOS_START, OOS_END = "2021-01-01", None

FREQ_MAP = {"W": 52, "2W": 26, "M": 12}
BOUNDS = (0.0, 0.30)  # Min 0%, Max 30% per stock

# NIFTY 50 Universe
NIFTY50 = [
    "ADANIENT", "ADANIPORTS", "APOLLOHOSP", "ASIANPAINT", "AXISBANK",
    "BAJAJ-AUTO", "BAJFINANCE", "BAJAJFINSV", "BHARTIARTL", "BPCL",
    "BRITANNIA", "CIPLA", "COALINDIA", "DIVISLAB", "DRREDDY",
    "EICHERMOT", "GRASIM", "HCLTECH", "HDFCBANK", "HDFCLIFE",
    "HEROMOTOCO", "HINDALCO", "HINDUNILVR", "ICICIBANK", "INDUSINDBK",
    "INFY", "ITC", "JSWSTEEL", "KOTAKBANK", "LT",
    "M&M", "MARUTI", "NESTLEIND", "NTPC", "ONGC",
    "POWERGRID", "RELIANCE", "SBILIFE", "SBIN", "SUNPHARMA",
    "TATACONSUM", "TATAMOTORS", "TATASTEEL", "TCS", "TECHM",
    "TITAN", "ULTRACEMCO", "UPL", "WIPRO"
]


# =============================================================================
# BLACK-LITTERMAN (Equilibrium only) - exact copy from optimiser_portfolio.py
# =============================================================================
def black_litterman_equilibrium(cov: np.ndarray) -> np.ndarray:
    """Calculate Black-Litterman equilibrium expected returns."""
    n = cov.shape[0]
    w_mkt = np.ones(n) / n
    delta = 1 / (w_mkt.T @ cov @ w_mkt)
    return delta * cov @ w_mkt


# =============================================================================
# MAX SHARPE (CONSTRAINED) - exact copy from optimiser_portfolio.py
# =============================================================================
def max_sharpe(mu: np.ndarray, cov: np.ndarray) -> np.ndarray:
    """Find portfolio weights that maximize Sharpe ratio."""
    n = len(mu)
    w0 = np.ones(n) / n
    cons = {"type": "eq", "fun": lambda w: np.sum(w) - 1}

    def neg_sharpe(w):
        r = w @ mu
        v = np.sqrt(w.T @ cov @ w)
        return -((r - RISK_FREE_RATE) / v)

    res = minimize(
        neg_sharpe, w0, method="SLSQP",
        bounds=[BOUNDS] * n, constraints=cons
    )
    return res.x


# =============================================================================
# BACKTEST - exact copy from optimiser_portfolio.py
# =============================================================================
def backtest(
    returns: pd.DataFrame,
    freq: str,
    start: str,
    end: str
) -> Tuple[pd.Series, pd.DataFrame]:
    """
    Walk-forward backtest with rolling optimization.
    Exactly matches optimiser_portfolio.py backtest function.
    """
    r = returns.loc[start:end].resample(freq).apply(lambda x: (1 + x).prod() - 1)
    lookback = FREQ_MAP[freq]

    port_rets, weights = [], []

    for i in range(lookback, len(r) - 1):
        train = r.iloc[i - lookback:i]
        cov = train.cov().values * FREQ_MAP[freq]
        mu = black_litterman_equilibrium(cov)

        w = max_sharpe(mu, cov)
        port_rets.append(w @ r.iloc[i + 1].values)
        weights.append(w)

    idx = r.index[lookback + 1:]
    return (
        pd.Series(port_rets, index=idx),
        pd.DataFrame(weights, index=idx, columns=r.columns)
    )


def ann_sharpe(rets: pd.Series, ppy: int) -> float:
    """Calculate annualized Sharpe ratio."""
    ann_ret = (1 + rets).prod() ** (ppy / len(rets)) - 1
    ann_vol = rets.std() * np.sqrt(ppy)
    return (ann_ret - RISK_FREE_RATE) / ann_vol


# =============================================================================
# DATA FETCHING
# =============================================================================
async def fetch_price_data(symbols: List[str]) -> pd.DataFrame:
    """
    Fetch historical price data from yfinance.
    Matches optimiser_portfolio.py data fetching.
    """
    tickers = [f"{s.upper()}.NS" for s in symbols]

    logger.info(f"Fetching price data for {tickers} from {IS_START}")

    prices = yf.download(
        tickers,
        start=IS_START,
        end=None,
        auto_adjust=True,
        progress=False
    )["Close"]

    if isinstance(prices, pd.Series):
        prices = prices.to_frame(tickers[0])

    logger.info(f"Fetched {len(prices)} rows of price data")
    return prices


async def get_current_prices(
    pool: asyncpg.Pool,
    symbols: List[str]
) -> Dict[str, Dict[str, Any]]:
    """Fetch current prices from database or yfinance."""
    symbols_upper = [s.upper() for s in symbols]
    result = {}

    # Try database first
    try:
        query = """
            SELECT t.symbol, l.ltp as price, t.name
            FROM tickers t
            JOIN ltp_live l ON t.id = l.ticker_id
            WHERE UPPER(t.symbol) = ANY($1::text[])
        """
        async with pool.acquire() as conn:
            rows = await conn.fetch(query, symbols_upper)

        for row in rows:
            result[row['symbol'].upper()] = {
                'price': float(row['price']) if row['price'] else 0,
                'name': row['name'] or row['symbol']
            }
    except Exception as e:
        logger.warning(f"Database price fetch failed: {e}")

    # Fallback to yfinance for missing
    missing = set(symbols_upper) - set(result.keys())
    if missing:
        logger.info(f"Fetching missing prices from yfinance: {missing}")
        for symbol in missing:
            try:
                ticker = yf.Ticker(f"{symbol}.NS")
                hist = ticker.history(period='5d')
                if not hist.empty:
                    result[symbol] = {
                        'price': float(hist['Close'].iloc[-1]),
                        'name': symbol
                    }
            except Exception as e:
                logger.warning(f"yfinance fallback failed for {symbol}: {e}")

    return result


# =============================================================================
# MAIN OPTIMIZATION FUNCTION
# =============================================================================
async def run_full_optimization(
    pool: asyncpg.Pool,
    holdings: List[Dict[str, Any]],
    **kwargs  # Accept but ignore extra parameters for compatibility
) -> Dict[str, Any]:
    """
    Run complete portfolio optimization.
    Exactly matches optimiser_portfolio.py logic.

    Args:
        pool: Database connection pool
        holdings: List of {symbol, quantity} - quantity is used to derive equal weights

    Returns:
        Complete optimization result dict
    """
    logger.info(f"Starting optimization for {len(holdings)} holdings")

    # Extract symbols and create current allocation (equal weights from quantity)
    symbols = [h['symbol'].upper() for h in holdings]
    total_qty = sum(h['quantity'] for h in holdings)

    # Convert to allocation (matching optimiser_portfolio.py input format)
    user_current_allocation = {
        h['symbol'].upper(): h['quantity'] / total_qty
        for h in holdings
    }

    # Validate allocation sums to 1
    if abs(sum(user_current_allocation.values()) - 1.0) > 1e-6:
        raise ValueError("Allocation must sum to 1.0")

    selected_tickers = [f"{k}.NS" for k in user_current_allocation]
    current_weights = pd.Series(
        {f"{k}.NS": v for k, v in user_current_allocation.items()},
        name="Current Weight"
    ).reindex(selected_tickers)

    logger.info(f"Current allocation: {user_current_allocation}")

    # Fetch price data
    prices = await fetch_price_data(symbols)

    # Calculate returns (matching optimiser_portfolio.py)
    returns_all = prices.pct_change().dropna(how="all")
    returns = returns_all[selected_tickers].dropna()

    logger.info(f"Returns data: {len(returns)} rows, {returns.columns.tolist()}")

    # Optimize rebalance frequency (matching optimiser_portfolio.py)
    logger.info("Optimizing rebalance frequency...")
    is_sharpes = {}
    for f in FREQ_MAP:
        try:
            rets, _ = backtest(returns, f, IS_START, IS_END)
            if len(rets) > 0:
                is_sharpes[f] = ann_sharpe(rets, FREQ_MAP[f])
        except Exception as e:
            logger.warning(f"Backtest failed for frequency {f}: {e}")

    if not is_sharpes:
        raise ValueError("All backtest frequencies failed")

    best_freq = max(is_sharpes, key=is_sharpes.get)
    logger.info(f"Optimal rebalance frequency: {best_freq}")

    # Full run (matching optimiser_portfolio.py)
    full_rets, full_weights = backtest(returns, best_freq, IS_START, OOS_END)
    equity = (1 + full_rets).cumprod()

    logger.info(f"Backtest complete: {len(equity)} periods, final equity: {equity.iloc[-1]:.4f}")

    # Current vs Optimal (matching optimiser_portfolio.py)
    latest_weights = full_weights.iloc[-1]

    # Build weight comparison (2 decimal places)
    weight_comparison = []
    for ticker in selected_tickers:
        symbol = ticker.replace(".NS", "")
        curr_w = current_weights.get(ticker, 0) * 100
        opt_w = latest_weights.get(ticker, 0) * 100
        weight_comparison.append({
            'symbol': symbol,
            'current_weight': round(curr_w, 2),
            'optimal_weight': round(opt_w, 2),
            'change': round(opt_w - curr_w, 2)
        })

    # Efficient Frontier (matching optimiser_portfolio.py)
    cov_annual = returns.cov().values * 252
    mu_bl = black_litterman_equilibrium(cov_annual)

    try:
        inv_cov = np.linalg.inv(cov_annual)
    except np.linalg.LinAlgError:
        inv_cov = np.linalg.inv(cov_annual + np.eye(cov_annual.shape[0]) * 1e-6)

    ones = np.ones(len(mu_bl))

    A = ones @ inv_cov @ ones
    B = ones @ inv_cov @ mu_bl
    C = mu_bl @ inv_cov @ mu_bl
    D = A * C - B ** 2

    target_ret = np.linspace(mu_bl.min(), mu_bl.max(), 120)
    frontier_vol = np.sqrt((A * target_ret**2 - 2 * B * target_ret + C) / D)

    # Efficient frontier - raw decimal values (matching Python reference)
    efficient_frontier = [
        {'volatility': round(float(v), 6), 'return': round(float(r), 6)}
        for v, r in zip(frontier_vol, target_ret)
    ]

    # Tangency portfolio (matching optimiser_portfolio.py)
    w_tan = inv_cov @ (mu_bl - RISK_FREE_RATE * ones)
    w_tan /= ones @ w_tan
    ret_tan = w_tan @ mu_bl
    vol_tan = np.sqrt(w_tan @ cov_annual @ w_tan)

    # Current portfolio point (matching optimiser_portfolio.py)
    w_curr = current_weights.values
    ret_curr = w_curr @ mu_bl
    vol_curr = np.sqrt(w_curr @ cov_annual @ w_curr)

    # Equity curve data
    equity_curve = []
    sample_rate = max(1, len(equity) // 100)
    for i in range(0, len(equity), sample_rate):
        equity_curve.append({
            'date': equity.index[i].strftime('%Y-%m-%d'),
            'value': round(float(equity.iloc[i]), 4)
        })
    # Always include last point
    if len(equity) > 0 and (len(equity) - 1) % sample_rate != 0:
        equity_curve.append({
            'date': equity.index[-1].strftime('%Y-%m-%d'),
            'value': round(float(equity.iloc[-1]), 4)
        })

    # Rolling weights data (matching optimiser_portfolio.py)
    weights_plot = full_weights.copy()
    weights_plot[weights_plot.abs() < 1e-4] = 0
    weights_plot = weights_plot.div(weights_plot.sum(axis=1), axis=0)

    rolling_weights = []
    sample_rate_weights = max(1, len(weights_plot) // 100)
    for i in range(0, len(weights_plot), sample_rate_weights):
        row = weights_plot.iloc[i]
        entry = {'date': row.name.strftime('%Y-%m-%d')}
        for col in weights_plot.columns:
            symbol = col.replace(".NS", "")
            entry[symbol] = round(float(row[col]) * 100, 2)  # Convert to percentage
        rolling_weights.append(entry)
    # Always include last point
    if len(weights_plot) > 0 and (len(weights_plot) - 1) % sample_rate_weights != 0:
        row = weights_plot.iloc[-1]
        entry = {'date': row.name.strftime('%Y-%m-%d')}
        for col in weights_plot.columns:
            symbol = col.replace(".NS", "")
            entry[symbol] = round(float(row[col]) * 100, 2)
        rolling_weights.append(entry)

    # Get symbol list for rolling weights chart
    rolling_weight_symbols = [col.replace(".NS", "") for col in weights_plot.columns]

    result = {
        'weight_comparison': weight_comparison,
        'efficient_frontier': efficient_frontier,
        'equity_curve': equity_curve,
        'rolling_weights': rolling_weights,
        'rolling_weight_symbols': rolling_weight_symbols,
        'tangency_point': {
            'volatility': round(float(vol_tan), 6),
            'return': round(float(ret_tan), 6)
        },
        'current_point': {
            'volatility': round(float(vol_curr), 6),
            'return': round(float(ret_curr), 6)
        },
        'capital_market_line': {
            'start': {'volatility': 0, 'return': round(RISK_FREE_RATE, 6)},
            'end': {'volatility': round(float(vol_tan), 6), 'return': round(float(ret_tan), 6)}
        },
        'optimal_rebalance_frequency': best_freq,
        'risk_free_rate': RISK_FREE_RATE,
        'oos_start': OOS_START,  # For train/test split line on equity curve
        'computed_at': datetime.utcnow().isoformat() + 'Z'
    }

    logger.info("Optimization complete")

    # Convert numpy types to native Python for JSON serialization
    import json
    return json.loads(json.dumps(result, default=lambda o: float(o) if hasattr(o, 'item') else str(o)))
