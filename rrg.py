import base64
import io
import os
from typing import List, Dict, Any

import matplotlib

# Use non-GUI backend for server rendering
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np
import pandas as pd
import yfinance as yf
from matplotlib.patches import Rectangle


def _format_symbol(symbol: str) -> str:
    sym = symbol.strip().upper()
    if not sym:
        return sym
    # Keep benchmark/index identifiers as-is
    if sym.startswith("^"):
        return sym
    # Add NSE suffix if missing a suffix
    if not sym.endswith((".NS", ".BO")):
        return f"{sym}.NS"
    return sym


def _strip_suffix(symbol: str) -> str:
    return symbol.replace(".NS", "").replace(".BO", "")


def _wma(series: pd.Series, period: int) -> pd.Series:
    weights = np.arange(1, period + 1)

    def weighted_avg(x: np.ndarray) -> float:
        return float(np.dot(x, weights) / weights.sum())

    return series.rolling(period, min_periods=period).apply(weighted_avg, raw=True)


def generate_rrg(
    symbols: List[str],
    benchmark: str = "^NSEI",
    length: int = 50,
    trail_len: int = 30,
    res: int = 80,
    show_quadrants: bool = True,
    show_labels: bool = True,
) -> Dict[str, Any]:
    """
    Generate an RRG plot for the given symbols vs. benchmark and return a base64 PNG + legend data.
    """
    tickers = [_format_symbol(sym) for sym in symbols if sym and sym.strip()]
    tickers = list(dict.fromkeys(tickers))
    if len(tickers) < 2:
        raise ValueError("At least two symbols are required to compute RRG")

    bench_sym = _format_symbol(benchmark)
    bench_name = _strip_suffix(bench_sym) if bench_sym.startswith("^") else benchmark.upper()

    palette = [
        "#FF5252",
        "#FFC107",
        "#9CCC65",
        "#E91E63",
        "#26A69A",
        "#4285F4",
        "#FB8C00",
        "#00E676",
        "#FFD600",
        "#AB47BC",
        "#10B981",
        "#F472B6",
        "#64748B",
    ]

    fetch_list = tickers + [bench_sym]
    raw = yf.download(fetch_list, period="2y", progress=False)
    if raw is None or raw.empty:
        raise ValueError("No historical data returned from yfinance")

    close = raw["Close"] if "Close" in raw else raw
    if isinstance(close.columns, pd.MultiIndex):
        close = close.droplevel(0, axis=1)

    trails: Dict[str, pd.DataFrame] = {}
    currents: Dict[str, pd.Series] = {}
    max_dx = 0.0
    max_dy = 0.0
    result_trails = []

    for idx, sym in enumerate(tickers):
        if sym not in close or bench_sym not in close:
            continue

        src = close[sym].dropna()
        bench = close[bench_sym].dropna()
        df = pd.DataFrame({"src": src, "bench": bench}).dropna()
        if df.empty:
            continue

        rs = df["src"] / df["bench"]
        wma_rs = _wma(rs, length)
        norm_rs = rs / wma_rs
        rs_ratio = _wma(norm_rs, length) * 100
        wma_ratio = _wma(rs_ratio, length)
        rs_mom = (rs_ratio / wma_ratio) * 100
        df_calc = pd.DataFrame({"ratio": rs_ratio, "mom": rs_mom}).dropna()
        trail = df_calc.tail(trail_len)
        if trail.empty:
            continue

        trails[sym] = trail
        currents[sym] = trail.iloc[-1]

        dev_x = np.abs(trail["ratio"] - 100).max() * res
        dev_y = np.abs(trail["mom"] - 100).max()
        max_dx = max(max_dx, dev_x)
        max_dy = max(max_dy, dev_y)

    if not trails:
        raise ValueError("No RRG trails computed. Check symbols/benchmark.")

    max_dx = max(max_dx, 10)
    max_dy = max(max_dy, 1)

    pad = 1.2
    xlim_left = -max_dx * pad
    xlim_right = max_dx * pad
    ylim_bottom = -max_dy * pad
    ylim_top = max_dy * pad

    legend_data = []
    for sym, current in currents.items():
        legend_data.append(
            {
                "symbol": _strip_suffix(sym),
                "rsRatio": round(float(current["ratio"]), 2),
                "rsMom": round(float(current["mom"]), 2),
            }
        )

    # Plot
    plt.style.use("default")
    fig, ax = plt.subplots(figsize=(12, 10), facecolor="white")
    ax.set_xlim(xlim_left, xlim_right)
    ax.set_ylim(ylim_bottom, ylim_top)
    ax.set_facecolor("white")
    ax.axis("off")

    if show_quadrants:
        alpha_bg = 0.12
        ax.add_patch(Rectangle((xlim_left, 0), -xlim_left, ylim_top, color="#1E3A8A", alpha=alpha_bg))
        ax.add_patch(Rectangle((0, 0), xlim_right, ylim_top, color="#166534", alpha=alpha_bg))
        ax.add_patch(Rectangle((xlim_left, ylim_bottom), -xlim_left, -ylim_bottom, color="#7F1D1D", alpha=alpha_bg))
        ax.add_patch(Rectangle((0, ylim_bottom), xlim_right, -ylim_bottom, color="#78350F", alpha=alpha_bg))

        alpha_text = 0.6
        fs = 20
        ax.text(xlim_left / 2, ylim_top / 2, "Improving", color="#3B82F6", alpha=alpha_text, fontsize=fs, ha="center", va="center")
        ax.text(xlim_right / 2, ylim_top / 2, "Leading", color="#10B981", alpha=alpha_text, fontsize=fs, ha="center", va="center")
        ax.text(xlim_left / 2, ylim_bottom / 2, "Lagging", color="#EF4444", alpha=alpha_text, fontsize=fs, ha="center", va="center")
        ax.text(xlim_right / 2, ylim_bottom / 2, "Weakening", color="#F97316", alpha=alpha_text, fontsize=fs, ha="center", va="center")

    ax.axhline(0, color="gray", alpha=0.5, lw=2)
    ax.axvline(0, color="gray", alpha=0.5, lw=2)
    ax.text(0, 0, bench_name, bbox=dict(facecolor="white", alpha=0.3), color="black", fontsize=14, ha="center", va="center")

    for idx, sym in enumerate(tickers):
        if sym not in trails:
            continue
        trail = trails[sym]
        col = palette[idx % len(palette)]
        plot_x = (trail["ratio"] - 100) * res
        plot_y = trail["mom"] - 100

        trail_points = []
        for (date_idx, row), px, py in zip(trail.iterrows(), plot_x, plot_y):
            trail_points.append({
                "x": round(float(px), 4),
                "y": round(float(py), 4),
                "ratio": round(float(row["ratio"]), 4),
                "momentum": round(float(row["mom"]), 4),
                "date": date_idx.isoformat() if hasattr(date_idx, "isoformat") else str(date_idx),
            })

        result_trails.append({
            "symbol": sym,
            "label": _strip_suffix(sym),
            "color": col,
            "points": trail_points,
            "current": trail_points[-1] if trail_points else None,
        })

        ax.plot(plot_x, plot_y, color=col, lw=2)
        ax.scatter(plot_x.iloc[:-1], plot_y.iloc[:-1], color=col, s=20, marker="o")
        ax.scatter(plot_x.iloc[-1], plot_y.iloc[-1], color=col, s=100, marker="D")
        if show_labels:
            ax.text(plot_x.iloc[-1] + max_dx * 0.02, plot_y.iloc[-1], _strip_suffix(sym), color=col, fontsize=12, ha="left", va="center")

    buf = io.BytesIO()
    plt.savefig(buf, format="png", bbox_inches="tight", dpi=150)
    plt.close(fig)
    buf.seek(0)
    encoded = base64.b64encode(buf.read()).decode("utf-8")

    return {
        "image": encoded,
        "legend": legend_data,
        "benchmark": bench_name,
        "ranges": {"xMin": xlim_left, "xMax": xlim_right, "yMin": ylim_bottom, "yMax": ylim_top},
        "trails": result_trails,
    }


async def generate_rrg_from_db(
    pool,
    symbols: List[str],
    benchmark: str = "NIFTY 50",
    period: str = "2y",
    length: int = 50,
    trail_len: int = 30,
    res: int = 80,
) -> Dict[str, Any]:
    """
    Generate RRG data from database (no matplotlib image, recharts only).

    Args:
        pool: asyncpg connection pool
        symbols: List of stock symbols (DB format, e.g., 'RELIANCE')
        benchmark: Benchmark symbol (default: 'NIFTY 50')
        period: Historical period ('1y', '2y', '5y')
        length: WMA length for calculations
        trail_len: Number of trail points to return
        res: Resolution multiplier for x-axis

    Returns:
        Dict with legend, ranges, trails (no image)
    """
    tickers = [sym.strip().upper() for sym in symbols if sym and sym.strip()]
    tickers = list(dict.fromkeys(tickers))  # Remove duplicates
    if len(tickers) < 2:
        raise ValueError("At least two symbols are required to compute RRG")

    # Period to SQL interval mapping
    period_map = {
        "1y": "1 year",
        "2y": "2 years",
        "5y": "5 years",
    }
    sql_interval = period_map.get(period.lower(), "2 years")

    palette = [
        "#FF5252", "#FFC107", "#9CCC65", "#E91E63", "#26A69A",
        "#4285F4", "#FB8C00", "#00E676", "#FFD600", "#AB47BC",
        "#10B981", "#F472B6", "#64748B",
    ]

    async with pool.acquire() as conn:
        # Get benchmark ticker_id (case-insensitive search)
        bench_row = await conn.fetchrow(
            "SELECT id, symbol FROM tickers WHERE UPPER(symbol) = $1 OR symbol ILIKE $2",
            benchmark.upper(),
            benchmark
        )
        if not bench_row:
            # Try to find any NIFTY index as fallback
            bench_row = await conn.fetchrow(
                "SELECT id, symbol FROM tickers WHERE suffix = '-INDEX' AND symbol ILIKE '%nifty%50%' LIMIT 1"
            )
        if not bench_row:
            raise ValueError(f"Benchmark '{benchmark}' not found in database")

        bench_id = bench_row["id"]
        bench_name = bench_row["symbol"]

        # Get benchmark historical data
        bench_data = await conn.fetch("""
            SELECT day, close FROM ohlc_daily
            WHERE ticker_id = $1 AND day >= NOW() - INTERVAL '{}'
            ORDER BY day ASC
        """.format(sql_interval), bench_id)

        if not bench_data:
            raise ValueError(f"No historical data for benchmark '{benchmark}'")

        bench_df = pd.DataFrame(bench_data, columns=["day", "close"])
        bench_df.set_index("day", inplace=True)
        bench_series = bench_df["close"].astype(float)

        # Process each symbol
        trails: Dict[str, pd.DataFrame] = {}
        currents: Dict[str, pd.Series] = {}
        max_dx = 0.0
        max_dy = 0.0
        result_trails = []
        symbol_colors = {}

        for idx, sym in enumerate(tickers):
            # Get ticker_id
            ticker_row = await conn.fetchrow(
                "SELECT id FROM tickers WHERE symbol = $1",
                sym.upper()
            )
            if not ticker_row:
                continue

            ticker_id = ticker_row["id"]

            # Get historical data
            sym_data = await conn.fetch("""
                SELECT day, close FROM ohlc_daily
                WHERE ticker_id = $1 AND day >= NOW() - INTERVAL '{}'
                ORDER BY day ASC
            """.format(sql_interval), ticker_id)

            if not sym_data:
                continue

            sym_df = pd.DataFrame(sym_data, columns=["day", "close"])
            sym_df.set_index("day", inplace=True)
            src_series = sym_df["close"].astype(float)

            # Align data with benchmark
            df = pd.DataFrame({"src": src_series, "bench": bench_series}).dropna()
            if df.empty or len(df) < length * 2:
                continue

            # Calculate RS-Ratio and RS-Momentum (same logic as yfinance version)
            rs = df["src"] / df["bench"]
            wma_rs = _wma(rs, length)
            norm_rs = rs / wma_rs
            rs_ratio = _wma(norm_rs, length) * 100
            wma_ratio = _wma(rs_ratio, length)
            rs_mom = (rs_ratio / wma_ratio) * 100

            df_calc = pd.DataFrame({"ratio": rs_ratio, "mom": rs_mom}).dropna()
            trail = df_calc.tail(trail_len)
            if trail.empty:
                continue

            trails[sym] = trail
            currents[sym] = trail.iloc[-1]
            symbol_colors[sym] = palette[idx % len(palette)]

            dev_x = np.abs(trail["ratio"] - 100).max() * res
            dev_y = np.abs(trail["mom"] - 100).max()
            max_dx = max(max_dx, dev_x)
            max_dy = max(max_dy, dev_y)

    if not trails:
        raise ValueError("No RRG trails computed. Check symbols/benchmark.")

    max_dx = max(max_dx, 10)
    max_dy = max(max_dy, 1)

    pad = 1.2
    xlim_left = -max_dx * pad
    xlim_right = max_dx * pad
    ylim_bottom = -max_dy * pad
    ylim_top = max_dy * pad

    # Build legend data
    legend_data = []
    for sym, current in currents.items():
        legend_data.append({
            "symbol": sym,
            "rsRatio": round(float(current["ratio"]), 2),
            "rsMom": round(float(current["mom"]), 2),
        })

    # Build trails data for recharts
    for sym in tickers:
        if sym not in trails:
            continue
        trail = trails[sym]
        col = symbol_colors[sym]
        plot_x = (trail["ratio"] - 100) * res
        plot_y = trail["mom"] - 100

        trail_points = []
        for (date_idx, row), px, py in zip(trail.iterrows(), plot_x, plot_y):
            trail_points.append({
                "x": round(float(px), 4),
                "y": round(float(py), 4),
                "ratio": round(float(row["ratio"]), 4),
                "momentum": round(float(row["mom"]), 4),
                "date": date_idx.isoformat() if hasattr(date_idx, "isoformat") else str(date_idx),
            })

        result_trails.append({
            "symbol": sym,
            "label": sym,
            "color": col,
            "points": trail_points,
            "current": trail_points[-1] if trail_points else None,
        })

    return {
        "legend": legend_data,
        "benchmark": bench_name,
        "ranges": {"xMin": xlim_left, "xMax": xlim_right, "yMin": ylim_bottom, "yMax": ylim_top},
        "trails": result_trails,
    }


if __name__ == "__main__":
    # Quick manual test (yfinance version)
    out = generate_rrg(["RELIANCE", "HDFCBANK", "TCS", "INFY", "ICICIBANK", "SBIN"])
    print(f"Generated image bytes: {len(out['image'])}")
