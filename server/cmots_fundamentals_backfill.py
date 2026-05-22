"""CMOTS → ``stock_fundamentals`` backfill (§6).

Rebuilds the four yfinance-shape JSONB columns (``income_statement``,
``balance_sheet``, ``cash_flow``, ``quarterly_financials``) plus
``dividends_history`` and ~25 analytics scalar columns from the CMOTS
hot-path tables populated in §5. The result is a ``stock_fundamentals``
row whose shape matches the locked yfinance contract — so the existing
``useStockDetail`` hook, ``FinancialTable`` component, and
``stock_scorecard`` reader keep working without code changes.

Locked decisions (per plan §6, 2026-05-14):

- Outer-key format for ALL four JSONBs: ISO date strings (``"2025-03-31"``
  derived from period code ``202503`` via
  ``calendar.monthrange(year, month)[1]`` for last day of month).
- Inner-key labels: yfinance English Title Case (``"Total Revenue"``,
  ``"Net Income"``, ``"Operating Cash Flow"``).
- Value types: ``float | None`` (NaN/Inf → None).
- History depth: all 10 years from CMOTS, no truncation.
- Live-data columns (``current_price``, ``previous_close``, ``open_price``,
  ``day_high``, ``day_low``, ``volume``, ``avg_volume``,
  ``fifty_two_week_high``, ``fifty_two_week_low``) are NEVER touched —
  owned by the ``ltp_live`` / OHLC pipeline.

Critical disambiguations (probed RELIANCE 2026-05-14):

- ``Total Revenue`` = P&L RID8 (``Revenue From Operations - Net``, post
  excise/GST), NOT RID1 (gross) or RID10 (includes Other Income).
  Reconciled against CMOTS's own ``net_income_margin`` ratio.
- ``Operating Cash Flow`` = CF RID67 (``Net Cash Generated from (Used In)
  Operations``), NOT RID53 (sub-total before extraordinary items).
- ``Cash And Cash Equivalents`` = BS RID26 + RID27 (CMOTS has both rows;
  sum to get the canonical balance).
- ``Operating Profit`` = P&L RID51 (``Operating Profit after Depreciation``,
  EBIT-equivalent) — CMOTS provides directly, no derivation needed.
- RID=0 rows are CMOTS visual section dividers (e.g. ``Attributable to:``,
  ``EPS:``) — skipped same as in ``normalize_financial_line``.

Source preference for scalar columns:

- Group A (live-varying): ``Daily_Ratios_C`` first → ``cmots_ratio_yearly``
  fallback. Examples: market_cap, trailing_pe, dividend_yield.
- Group B (filing-derived): ``cmots_ratio_yearly`` first → ``Daily_Ratios_C``
  fallback. Examples: profit_margin, return_on_equity, debt_to_equity.
"""

from __future__ import annotations

import calendar
import logging
import math
from typing import Any

logger = logging.getLogger(__name__)


# ─── RID → yfinance-label maps (annual statements) ─────────────────────────


# Profit_and_Loss_C — RID8 ("Revenue From Operations - Net") is the canonical
# Total Revenue per CMOTS's own margin convention and yfinance semantic.
# RID1 (gross) and RID10 (incl. other income) pass through under CMOTS labels.
_PNL_RID_MAP: dict[int, str] = {
    1:  "Revenue From Operations",
    6:  "Other Operating Revenue",
    7:  "Less Excise Duty GST",
    8:  "Total Revenue",                       # ← canonical
    9:  "Other Income",
    10: "Total Revenue Including Other Income",
    11: "Change In Inventory",
    12: "Cost Of Revenue",
    14: "Purchases Of Stock In Trade",
    15: "Salaries And Wages",
    17: "Manufacturing And Operating Expenses",
    18: "Administrative And Selling Expenses",
    19: "Other Operating Expenses",
    20: "Interest Expense",
    21: "Reconciled Depreciation",
    22: "Total Operating Expenses",
    25: "Operating Income",
    30: "Pretax Income",
    31: "Tax Provision",
    37: "Net Income",
    47: "Net Income Common Stockholders",
    48: "Basic EPS",
    49: "Diluted EPS",
    50: "EBITDA",
    51: "EBIT",
    55: "Basic Average Shares",
    56: "Diluted Average Shares",
}

# Balance_Sheet_C — RID26+RID27 are both labeled "Cash and Cash Equivalents"
# in CMOTS and must be summed (see _build_balance_sheet).
_BS_RID_MAP: dict[int, str] = {
    2:  "Net PPE",
    6:  "Construction In Progress",
    7:  "Long Term Investments",
    13: "Other Non Current Assets",
    22: "Total Non Current Assets",
    23: "Inventory",
    25: "Short Term Investments",
    28: "Other Short Term Investments",
    29: "Receivables",
    39: "Current Assets",
    40: "Total Assets",
    41: "Current Debt",
    43: "Payables",
    49: "Current Provisions",
    52: "Current Liabilities",
    54: "Long Term Debt",
    56: "Total Debt",
    66: "Deferred Tax Liabilities Non Current",
    67: "Total Non Current Liabilities Net Minority Interest",
    68: "Common Stock",
    73: "Retained Earnings",
    75: "Stockholders Equity",
    76: "Minority Interest",
    77: "Total Equity Gross Minority Interest",
    78: "Total Liabilities Net Minority Interest",
}

# Cash_Flow_C — RID67 (post-extraordinary) is the canonical Operating Cash
# Flow, NOT RID53. RID71 is the canonical Capex.
_CF_RID_MAP: dict[int, str] = {
    1:   "Net Income From Continuing Operations",
    11:  "Depreciation And Amortization",
    52:  "Change In Working Capital",
    67:  "Operating Cash Flow",                 # ← canonical, not RID53
    71:  "Capital Expenditure",
    91:  "Investing Cash Flow",
    118: "Interest Paid",
    119: "Cash Dividends Paid",
    124: "Financing Cash Flow",
    126: "Changes In Cash",
    129: "Beginning Cash Position",
    130: "End Cash Position",
}

# Quarterly_Results_C — different RID space from annual P&L (this is a
# different endpoint with its own COLUMNNAME conventions).
_QTR_RID_MAP: dict[int, str] = {
    5:  "Total Revenue",
    6:  "Total Operating Expenses",
    14: "Operating Income",
    15: "Other Income",
    17: "Interest Expense",
    21: "Special Income Charges",
    23: "Pretax Income",
    24: "Tax Provision",
    30: "Net Income",
    33: "Net Income Common Stockholders",
    47: "Basic EPS",
    48: "Diluted EPS",
    49: "Book Value Per Share",
}

# Live-data columns owned by ltp_live / OHLC pipeline. The backfill UPDATE
# enumerates writes explicitly so a future schema addition cannot accidentally
# leak into this territory.
_LIVE_DATA_COLUMNS: frozenset[str] = frozenset({
    "current_price", "previous_close", "open_price",
    "day_high", "day_low", "volume", "avg_volume",
    "fifty_two_week_high", "fifty_two_week_low",
})


# ─── Helpers ────────────────────────────────────────────────────────────────


def _period_to_iso_date(period: int) -> str | None:
    """Convert CMOTS YYYYMM period code to ISO date string of month-end.

    202503 → "2025-03-31", 202506 → "2025-06-30", etc. Uses
    ``calendar.monthrange`` so leap years are handled correctly (202402
    → "2024-02-29", 202302 → "2023-02-28").

    Returns ``None`` for malformed period codes.
    """
    if not isinstance(period, int) or period < 100000 or period > 999912:
        return None
    year, month = divmod(period, 100)
    if month < 1 or month > 12:
        return None
    last_day = calendar.monthrange(year, month)[1]
    return f"{year:04d}-{month:02d}-{last_day:02d}"


def _coerce_finite_float(value: Any) -> float | None:
    """Convert a numeric / decimal / string value to float, or None.

    Defensive: NaN, ±Inf, None, empty string, and any unparseable input
    return None. Mirrors the convention used by ``_to_decimal`` in
    ``cmots_normalizers.py``.
    """
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return f


def safe_growth(latest: float | None, prior: float | None) -> float | None:
    """Return YoY growth as a fraction, or None for any unsafe case.

    Returns ``None`` when:
      - either input is None (missing history)
      - prior <= 0 (zero or negative denominator — growth % is meaningless
        when comparing across a sign change, e.g. loss → profit)

    Otherwise returns ``float(latest) / float(prior) - 1``.
    """
    if latest is None or prior is None:
        return None
    if prior <= 0:
        return None
    return float(latest) / float(prior) - 1


# ─── JSONB builders (annual + quarterly statements) ────────────────────────


def _build_statement_jsonb(
    cur,
    co_code: int,
    report: str,
    rid_map: dict[int, str],
    *,
    extra_per_period: dict[int, str] | None = None,
) -> dict[str, dict[str, float | None]]:
    """Generic builder for one statement-type JSONB.

    Reads ``cmots_financial_line`` rows for ``(co_code, statement='C',
    report)``, melts them into ``{iso_date: {label: value}}``. Rows
    matching ``rid_map`` use canonical yfinance labels; rows NOT in the
    map pass through under the original CMOTS ``column_name`` (per
    judgment-call decision — frontend filters at render time).

    RID=0 sentinel rows (visual section dividers) are skipped by upstream
    ``normalize_financial_line``, but this layer guards against them
    too for defensive depth.

    ``extra_per_period`` is for fields that are themselves SUMS of multiple
    RIDs (currently only Balance_Sheet ``Cash And Cash Equivalents`` =
    RID26 + RID27 — see ``_build_balance_sheet``).
    """
    cur.execute(
        """
        SELECT period, rid, column_name, value
          FROM cmots_financial_line
         WHERE co_code = %s AND statement = 'C' AND report = %s
           AND rid > 0
         ORDER BY period DESC, rid ASC
        """,
        (co_code, report),
    )

    out: dict[str, dict[str, float | None]] = {}
    for r in cur.fetchall():
        period_iso = _period_to_iso_date(r["period"])
        if period_iso is None:
            continue
        period_bucket = out.setdefault(period_iso, {})
        v = _coerce_finite_float(r["value"])
        label = rid_map.get(r["rid"])
        if label is None:
            # Judgment-call RID — pass through under original CMOTS label.
            # The frontend FinancialTable filters by RowDef, so unmapped
            # labels just don't render. Preserves data without polluting.
            label = (r["column_name"] or "").strip() or f"_rid_{r['rid']}"
        period_bucket[label] = v

    return out


def _build_income_statement(cur, co_code: int) -> dict:
    return _build_statement_jsonb(cur, co_code, "pnl", _PNL_RID_MAP)


def _build_balance_sheet(cur, co_code: int) -> dict:
    """Balance sheet with the RID26+RID27 → ``Cash And Cash Equivalents``
    summing rule applied per period."""
    out = _build_statement_jsonb(cur, co_code, "bs", _BS_RID_MAP)

    cur.execute(
        """
        SELECT period, rid, value
          FROM cmots_financial_line
         WHERE co_code = %s AND statement = 'C' AND report = 'bs'
           AND rid IN (26, 27)
         ORDER BY period DESC
        """,
        (co_code,),
    )
    cash_by_period: dict[str, list[float]] = {}
    for r in cur.fetchall():
        period_iso = _period_to_iso_date(r["period"])
        if period_iso is None:
            continue
        v = _coerce_finite_float(r["value"])
        if v is not None:
            cash_by_period.setdefault(period_iso, []).append(v)
    for period_iso, parts in cash_by_period.items():
        if period_iso in out and parts:
            out[period_iso]["Cash And Cash Equivalents"] = sum(parts)

    return out


def _build_cash_flow(cur, co_code: int) -> dict:
    """Cash flow JSONB plus a derived ``Free Cash Flow`` per period
    (Operating CF − Capex) when both inputs are available."""
    out = _build_statement_jsonb(cur, co_code, "cf", _CF_RID_MAP)
    for period_iso, period_bucket in out.items():
        op_cf = period_bucket.get("Operating Cash Flow")
        capex = period_bucket.get("Capital Expenditure")
        if op_cf is not None and capex is not None:
            period_bucket["Free Cash Flow"] = op_cf - capex
    return out


def _build_quarterly_financials(cur, co_code: int) -> dict:
    return _build_statement_jsonb(cur, co_code, "quarter", _QTR_RID_MAP)


def _build_dividends_history(cur, co_code: int) -> dict[str, float]:
    """Flat ``{divdate_iso: divamount, ...}`` dict from cmots_corporate_action
    Dividend rows. Matches the locked yfinance shape contract."""
    cur.execute(
        """
        SELECT action_date, payload
          FROM cmots_corporate_action
         WHERE co_code = %s AND source_slug = 'Dividend'
         ORDER BY action_date DESC
        """,
        (co_code,),
    )
    out: dict[str, float] = {}
    for r in cur.fetchall():
        if r["action_date"] is None:
            continue
        iso = r["action_date"].isoformat()
        amt = _coerce_finite_float((r["payload"] or {}).get("divamount"))
        if amt is not None:
            out[iso] = amt
    return out


# ─── Scalar source loaders ─────────────────────────────────────────────────


def _load_daily_ratios(cur, co_code: int) -> dict | None:
    """Pull the Daily_Ratios_C payload for this ticker, or None."""
    cur.execute(
        """
        SELECT r.payload_json
          FROM cmots_api_rows r
          JOIN cmots_api_calls c ON c.id = r.api_call_id
          JOIN cmots_endpoints e ON e.id = c.endpoint_id
         WHERE e.slug = 'Daily_Ratios_C'
           AND c.co_code = %s
           AND c.success = TRUE
         ORDER BY r.row_index ASC
         LIMIT 1
        """,
        (co_code,),
    )
    row = cur.fetchone()
    return row["payload_json"] if row else None


def _load_latest_yearly_ratios(cur, co_code: int) -> dict | None:
    """Pull the latest cmots_ratio_yearly row (statement='C'), or None."""
    cur.execute(
        """
        SELECT *
          FROM cmots_ratio_yearly
         WHERE co_code = %s AND statement = 'C'
         ORDER BY yearend DESC
         LIMIT 1
        """,
        (co_code,),
    )
    row = cur.fetchone()
    return dict(row) if row else None


def _load_company_profile(cur, co_code: int) -> dict | None:
    cur.execute(
        """
        SELECT r.payload_json
          FROM cmots_api_rows r
          JOIN cmots_api_calls c ON c.id = r.api_call_id
          JOIN cmots_endpoints e ON e.id = c.endpoint_id
         WHERE e.slug = 'Company_Profile'
           AND c.co_code = %s
           AND c.success = TRUE
         ORDER BY r.row_index ASC
         LIMIT 1
        """,
        (co_code,),
    )
    row = cur.fetchone()
    return row["payload_json"] if row else None


def _load_latest_ex_dividend_date(cur, co_code: int):
    cur.execute(
        """
        SELECT MAX(action_date) AS d
          FROM cmots_corporate_action
         WHERE co_code = %s AND source_slug = 'Dividend'
        """,
        (co_code,),
    )
    row = cur.fetchone()
    return row["d"] if row else None


# ─── Latest-period helpers for total_cash / total_debt / growth ────────────


def _latest_fin_line_values(
    cur,
    co_code: int,
    report: str,
    rids: tuple[int, ...],
) -> dict[int, float | None]:
    """Return ``{rid: value}`` for the latest period in this report.

    Used for ``total_cash`` (RID26+27), ``total_debt`` (RID56) which need
    only the latest snapshot.
    """
    cur.execute(
        """
        SELECT rid, value
          FROM cmots_financial_line
         WHERE co_code = %s AND statement = 'C' AND report = %s
           AND rid = ANY(%s)
           AND period = (
             SELECT MAX(period) FROM cmots_financial_line
              WHERE co_code = %s AND statement = 'C' AND report = %s
           )
        """,
        (co_code, report, list(rids), co_code, report),
    )
    out: dict[int, float | None] = {}
    for r in cur.fetchall():
        out[r["rid"]] = _coerce_finite_float(r["value"])
    return out


def _yoy_series(cur, co_code: int, report: str, rid: int) -> tuple[float | None, float | None]:
    """Return ``(latest, prior)`` values for one RID across two most recent periods."""
    cur.execute(
        """
        SELECT period, value
          FROM cmots_financial_line
         WHERE co_code = %s AND statement = 'C' AND report = %s
           AND rid = %s
         ORDER BY period DESC
         LIMIT 2
        """,
        (co_code, report, rid),
    )
    rows = cur.fetchall()
    if len(rows) < 2:
        return None, None
    return _coerce_finite_float(rows[0]["value"]), _coerce_finite_float(rows[1]["value"])


# ─── Scalar builder ────────────────────────────────────────────────────────


def _pct_to_fraction(value: float | None) -> float | None:
    """Convert a percentage (7.54) to a fraction (0.0754). Defensive on None."""
    return value / 100.0 if value is not None else None


def _crore_to_rupees(value: float | None) -> int | None:
    """Convert CMOTS ₹-crore values to integer rupees (multiply by 1e7)."""
    if value is None:
        return None
    return int(round(value * 1e7))


def _build_scalars(
    cur,
    co_code: int,
    daily: dict | None,
    yearly: dict | None,
    profile: dict | None,
) -> dict[str, Any]:
    """Assemble the full scalar column set for stock_fundamentals.

    Group A (live-varying): Daily_Ratios_C first, yearly fallback.
    Group B (filing-derived): yearly first, Daily_Ratios_C fallback.
    """
    daily = daily or {}
    yearly = yearly or {}
    profile = profile or {}

    def da(key: str) -> float | None:
        return _coerce_finite_float(daily.get(key))

    def ye(key: str) -> float | None:
        return _coerce_finite_float(yearly.get(key))

    def first(*candidates: float | None) -> float | None:
        for c in candidates:
            if c is not None:
                return c
        return None

    # Group A — live-varying
    market_cap_cr        = first(da("MCAP"), ye("mcap"))
    enterprise_value_cr  = first(da("EV"),   ye("ev"))
    trailing_pe          = first(da("PE"),   ye("pe"))
    price_to_book        = first(da("PBV"),  ye("pbv"))
    peg_ratio            = da("PEGRatio_TTM")
    price_to_sales       = da("EV_Sales_TTM")
    dividend_yield_pct   = first(da("DIVYIELD"), ye("div_yield"))
    dividend_rate        = da("AnnualDividend")
    # DividendPayout_TTM in Daily_Ratios_C is already a fraction; cmots_ratio_yearly.dividend_payout is %.
    payout_ratio         = first(da("DividendPayout_TTM"), _pct_to_fraction(ye("dividend_payout")))
    shares_outstanding   = da("SharesOutstanding")

    # Group B — filing-derived
    profit_margin_pct    = first(ye("net_income_margin"), da("NetIncomeMargin_TTM"))
    return_on_equity_pct = first(ye("roe"), da("ROE_TTM"))
    return_on_assets_pct = first(ye("roa"), da("ROA_TTM"))
    debt_to_equity       = first(ye("debt_equity"), da("Debt_Equity_TTM"))
    current_ratio        = first(ye("current_ratio"), da("CurrentRatio_TTM"))

    # operating_margin: derive from latest annual P&L RID51 (EBIT) / RID8
    # (Total Revenue net). Fall back to Daily_Ratios_C.EBITDA_Margin_TTM.
    fin_pnl = _latest_fin_line_values(cur, co_code, "pnl", (8, 51))
    op_margin_pct: float | None = None
    if fin_pnl.get(8) and fin_pnl[8] > 0 and fin_pnl.get(51) is not None:
        op_margin_pct = fin_pnl[51] / fin_pnl[8] * 100.0
    operating_margin_pct = first(op_margin_pct, da("EBITDA_Margin_TTM"))

    # total_cash from BS RID26+RID27 latest period.
    fin_bs_cash = _latest_fin_line_values(cur, co_code, "bs", (26, 27))
    cash_parts = [v for v in fin_bs_cash.values() if v is not None]
    total_cash_cr = sum(cash_parts) if cash_parts else None

    # total_debt from BS RID56 latest period; fall back to Daily LT+ST.
    fin_bs_debt = _latest_fin_line_values(cur, co_code, "bs", (56,))
    total_debt_cr: float | None = fin_bs_debt.get(56)
    if total_debt_cr is None:
        lt = da("LongtermDebt_TTM")
        st = da("ShorttermDebt_TTM")
        if lt is not None or st is not None:
            total_debt_cr = (lt or 0.0) + (st or 0.0)

    # YoY growth (derived).
    rev_latest, rev_prior = _yoy_series(cur, co_code, "pnl", 8)
    eps_latest, eps_prior = _yoy_series(cur, co_code, "pnl", 37)
    revenue_growth  = safe_growth(rev_latest, rev_prior)
    earnings_growth = safe_growth(eps_latest, eps_prior)

    return {
        # text / identity
        "long_name":         (profile.get("LNAME") or "").strip() or None,
        "description":       None,
        "website":           (profile.get("INTERNET") or "").strip() or None,

        # Group A — live snapshot
        "market_cap":        _crore_to_rupees(market_cap_cr),
        "enterprise_value":  _crore_to_rupees(enterprise_value_cr),
        "trailing_pe":       trailing_pe,
        "forward_pe":        None,
        "price_to_book":     price_to_book,
        "peg_ratio":         peg_ratio,
        "price_to_sales":    price_to_sales,
        "dividend_yield":    _pct_to_fraction(dividend_yield_pct),
        "dividend_rate":     dividend_rate,
        "payout_ratio":      payout_ratio,
        "shares_outstanding": int(shares_outstanding) if shares_outstanding is not None else None,

        # Group B — filing-derived (stored as fractions, yfinance convention)
        "profit_margin":     _pct_to_fraction(profit_margin_pct),
        "operating_margin":  _pct_to_fraction(operating_margin_pct),
        "return_on_equity":  _pct_to_fraction(return_on_equity_pct),
        "return_on_assets":  _pct_to_fraction(return_on_assets_pct),
        "debt_to_equity":    debt_to_equity,
        "current_ratio":     current_ratio,
        "quick_ratio":       None,
        "total_cash":        _crore_to_rupees(total_cash_cr),
        "total_debt":        _crore_to_rupees(total_debt_cr),

        # Derived YoY
        "revenue_growth":    revenue_growth,
        "earnings_growth":   earnings_growth,

        # Dividend
        "ex_dividend_date":  _load_latest_ex_dividend_date(cur, co_code),

        # Float / not in CMOTS
        "float_shares":      None,
    }


# ─── Public API: per-ticker backfill ────────────────────────────────────────


def build_jsonb_payloads(cur, co_code: int) -> dict[str, Any]:
    """Build the four JSONB payloads + dividends_history for one ticker.

    Returns the dict that the orchestrator will pass to the UPSERT. Pure
    function — no DB writes here. Caller supplies the cursor; this lets
    tests run against a rolled-back transaction.
    """
    return {
        "income_statement":     _build_income_statement(cur, co_code),
        "balance_sheet":        _build_balance_sheet(cur, co_code),
        "cash_flow":            _build_cash_flow(cur, co_code),
        "quarterly_financials": _build_quarterly_financials(cur, co_code),
        "dividends_history":    _build_dividends_history(cur, co_code),
    }


def backfill_one_ticker(conn, co_code: int) -> dict[str, Any]:
    """Build all payloads and UPSERT one ticker's ``stock_fundamentals`` row.

    Idempotent on ``ticker_id`` (UNIQUE constraint). Re-runs produce
    identical values. Live-data columns (current_price, OHLC, volume,
    52-week range) are NOT touched — owned by ``ltp_live`` / OHLC pipeline.

    Returns a summary dict with timing + size info, useful for benchmark
    and end-to-end reporting.
    """
    import time
    from psycopg2.extras import Json, RealDictCursor

    started = time.monotonic()

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        # Resolve the ticker_id (PK target on stock_fundamentals via
        # FK + UNIQUE). co_code is the CMOTS-side anchor.
        cur.execute("SELECT id FROM tickers WHERE co_code = %s", (co_code,))
        row = cur.fetchone()
        if not row:
            return {
                "co_code": co_code,
                "ticker_id": None,
                "status": "skipped",
                "reason": "no tickers row for co_code",
                "elapsed_ms": int((time.monotonic() - started) * 1000),
            }
        ticker_id = row["id"]

        jsonbs   = build_jsonb_payloads(cur, co_code)
        daily    = _load_daily_ratios(cur, co_code)
        yearly   = _load_latest_yearly_ratios(cur, co_code)
        profile  = _load_company_profile(cur, co_code)
        scalars  = _build_scalars(cur, co_code, daily, yearly, profile)

        # Idempotent UPSERT. ON CONFLICT (ticker_id) updates the same row.
        # Columns are enumerated explicitly to keep live-data columns off
        # the list (defense against future schema additions accidentally
        # leaking into ltp_live / OHLC territory).
        cur.execute(
            """
            INSERT INTO stock_fundamentals (
                ticker_id,
                long_name, description, website,
                market_cap, enterprise_value,
                trailing_pe, forward_pe, price_to_book, price_to_sales, peg_ratio,
                profit_margin, operating_margin,
                return_on_equity, return_on_assets,
                revenue_growth, earnings_growth,
                debt_to_equity, current_ratio, quick_ratio,
                total_cash, total_debt,
                shares_outstanding, float_shares,
                dividend_yield, dividend_rate, payout_ratio, ex_dividend_date,
                income_statement, balance_sheet, cash_flow, quarterly_financials,
                dividends_history,
                data_source, cmots_synced_at, last_updated, fetch_error
            ) VALUES (
                %(ticker_id)s,
                %(long_name)s, %(description)s, %(website)s,
                %(market_cap)s, %(enterprise_value)s,
                %(trailing_pe)s, %(forward_pe)s, %(price_to_book)s, %(price_to_sales)s, %(peg_ratio)s,
                %(profit_margin)s, %(operating_margin)s,
                %(return_on_equity)s, %(return_on_assets)s,
                %(revenue_growth)s, %(earnings_growth)s,
                %(debt_to_equity)s, %(current_ratio)s, %(quick_ratio)s,
                %(total_cash)s, %(total_debt)s,
                %(shares_outstanding)s, %(float_shares)s,
                %(dividend_yield)s, %(dividend_rate)s, %(payout_ratio)s, %(ex_dividend_date)s,
                %(income_statement)s, %(balance_sheet)s, %(cash_flow)s, %(quarterly_financials)s,
                %(dividends_history)s,
                'cmots', NOW(), NOW(), NULL
            )
            ON CONFLICT (ticker_id) DO UPDATE SET
                long_name=EXCLUDED.long_name,
                description=EXCLUDED.description,
                website=EXCLUDED.website,
                market_cap=EXCLUDED.market_cap,
                enterprise_value=EXCLUDED.enterprise_value,
                trailing_pe=EXCLUDED.trailing_pe,
                forward_pe=EXCLUDED.forward_pe,
                price_to_book=EXCLUDED.price_to_book,
                price_to_sales=EXCLUDED.price_to_sales,
                peg_ratio=EXCLUDED.peg_ratio,
                profit_margin=EXCLUDED.profit_margin,
                operating_margin=EXCLUDED.operating_margin,
                return_on_equity=EXCLUDED.return_on_equity,
                return_on_assets=EXCLUDED.return_on_assets,
                revenue_growth=EXCLUDED.revenue_growth,
                earnings_growth=EXCLUDED.earnings_growth,
                debt_to_equity=EXCLUDED.debt_to_equity,
                current_ratio=EXCLUDED.current_ratio,
                quick_ratio=EXCLUDED.quick_ratio,
                total_cash=EXCLUDED.total_cash,
                total_debt=EXCLUDED.total_debt,
                shares_outstanding=EXCLUDED.shares_outstanding,
                float_shares=EXCLUDED.float_shares,
                dividend_yield=EXCLUDED.dividend_yield,
                dividend_rate=EXCLUDED.dividend_rate,
                payout_ratio=EXCLUDED.payout_ratio,
                ex_dividend_date=EXCLUDED.ex_dividend_date,
                income_statement=EXCLUDED.income_statement,
                balance_sheet=EXCLUDED.balance_sheet,
                cash_flow=EXCLUDED.cash_flow,
                quarterly_financials=EXCLUDED.quarterly_financials,
                dividends_history=EXCLUDED.dividends_history,
                data_source='cmots',
                cmots_synced_at=NOW(),
                last_updated=NOW(),
                fetch_error=NULL
            """,
            {
                "ticker_id":       ticker_id,
                "income_statement":     Json(jsonbs["income_statement"]),
                "balance_sheet":        Json(jsonbs["balance_sheet"]),
                "cash_flow":            Json(jsonbs["cash_flow"]),
                "quarterly_financials": Json(jsonbs["quarterly_financials"]),
                "dividends_history":    Json(jsonbs["dividends_history"]),
                **scalars,
            },
        )

    elapsed_ms = int((time.monotonic() - started) * 1000)
    return {
        "co_code": co_code,
        "ticker_id": ticker_id,
        "status": "ok",
        "elapsed_ms": elapsed_ms,
        "income_periods":     len(jsonbs["income_statement"]),
        "balance_periods":    len(jsonbs["balance_sheet"]),
        "cash_periods":       len(jsonbs["cash_flow"]),
        "quarterly_periods":  len(jsonbs["quarterly_financials"]),
        "dividend_events":    len(jsonbs["dividends_history"]),
    }


def backfill_covered_tickers(conn) -> dict[str, Any]:
    """Backfill every ticker with ``has_cmots_data=TRUE``.

    Iterates serially (no concurrency — the per-ticker work is dominated
    by SQL reads that already share a connection pool downstream). Caller
    is responsible for committing.

    Returns a summary dict with per-ticker results, success/failure counts,
    and total wall-clock.
    """
    import time
    from psycopg2.extras import RealDictCursor

    started = time.monotonic()

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "SELECT co_code FROM tickers "
            "WHERE has_cmots_data = TRUE AND co_code IS NOT NULL "
            "ORDER BY co_code"
        )
        co_codes = [r["co_code"] for r in cur.fetchall()]

    per_ticker: list[dict[str, Any]] = []
    n_ok = 0
    n_skipped = 0
    n_failed = 0
    failed: list[tuple[int, str]] = []

    for cc in co_codes:
        try:
            res = backfill_one_ticker(conn, cc)
            per_ticker.append(res)
            if res["status"] == "ok":
                n_ok += 1
            else:
                n_skipped += 1
        except Exception as exc:  # noqa: BLE001
            logger.exception("backfill failed for co_code=%d: %s", cc, exc)
            n_failed += 1
            failed.append((cc, f"{type(exc).__name__}: {exc}"))

    return {
        "total":         len(co_codes),
        "ok":            n_ok,
        "skipped":       n_skipped,
        "failed":        n_failed,
        "failures":      failed,
        "per_ticker":    per_ticker,
        "elapsed_sec":   round(time.monotonic() - started, 1),
    }
