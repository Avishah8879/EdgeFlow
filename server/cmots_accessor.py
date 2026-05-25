"""CMOTS read-side accessors (§7).

One function per frontend need. All accessors:

  - Resolve ``symbol → co_code`` via ``tickers``
  - Gate on ``has_cmots_data = TRUE AND cmots_disabled = FALSE AND
    co_code IS NOT NULL``
  - Return **empty-shaped responses** (empty WideTable, empty list, null
    scalars) when the gate fails
  - Never raise HTTPException-404, never return naked ``None`` where the
    frontend expects a structure

Empty-shape contract (uniform across accessors):

  ============================================ ===================================================
  Accessor                                     Empty return value
  ============================================ ===================================================
  ``has_cmots_data(symbol)``                   ``False``
  ``get_financial_statements`` / ``get_ratios``
    / ``get_shareholding``                     ``{"periods": [], "labels": [], "data": []}``
  ``get_ratios(symbol, 'daily')``              ``{}`` (flat dict — matches existing ``fundamentals`` shape)
  ``get_corporate_actions`` / ``get_narratives``
    / ``get_announcements`` / ``get_pros_cons``
    / ``get_credit_ratings``                   ``[]``
  ``get_sector_medians``                       ``{"sector": <input>, "n_tickers": 0, "metrics": {}}``
  ``get_screener_bundle``                      Full ScreenerBundle with empty WideTables, empty
                                               lists, null scalars
  ============================================ ===================================================

Caching:

  - All symbol-keyed accessors wrap with ``@cache_result("cmots:<name>",
    TTL_FUNDAMENTALS)`` (1h). Sync-end calls ``delete_pattern("cmots:*")``
    to flush.
  - ``get_sector_medians`` uses a **process-wide in-memory dict** (NOT
    Redis) because the computation aggregates across many tickers in one
    sector and re-runs per request would be wasteful even with Redis.
    Invalidated by ``clear_sector_medians_cache()`` at end of sync.

WideTable shape (per schema §9.6):

  - ``periods``: ``list[str]`` of ISO date strings (``"2025-03-31"``),
    sorted **newest-first**.
  - ``labels``: ``list[str]`` of row labels (e.g. ``"Revenue"``,
    ``"Total Expenses"``).
  - ``data``: ``list[list[float | None]]`` — ``data[label_idx][period_idx]``.

Date format is ISO (locked decision; matches §6 contract; sorts
deterministically across year boundaries). Frontend formats for display.

Pros/Cons output shape (per schema §9.3): ``{type, label, detail}``
where ``type ∈ {"pro", "con", "info"}``.
"""

from __future__ import annotations

import logging
import statistics
import threading
from typing import Any

from server.cmots_fundamentals_backfill import (
    _coerce_finite_float,
    _period_to_iso_date,
    safe_growth,
)
from server.redis_client import TTL_FUNDAMENTALS, cache_result, delete_pattern

logger = logging.getLogger(__name__)


# ─── Empty-shape factories ─────────────────────────────────────────────────


def _empty_wide_table() -> dict[str, Any]:
    return {"periods": [], "labels": [], "data": []}


def _empty_screener_bundle(symbol: str) -> dict[str, Any]:
    return {
        "ticker": {"symbol": symbol.upper(), "co_code": None, "name": None},
        "statement_type": "Consolidated",
        "key_metrics": {},
        "charts": {"yearly": [], "margins": [], "cash_flow": [], "roce": []},
        "benchmarks": {},
        "quarterly_results": _empty_wide_table(),
        "profit_loss":       _empty_wide_table(),
        "balance_sheet":     _empty_wide_table(),
        "cash_flow":         _empty_wide_table(),
        "yearly_results":    _empty_wide_table(),
        "ratios_yearly":     _empty_wide_table(),
        "ratios_quarterly":  _empty_wide_table(),
        "shareholding":      _empty_wide_table(),
        "directors":      [],
        "dividends":      [],
        "bonus":          [],
        "splits":         [],
        "book_closure":   [],
        "board_meetings": [],
        "documents":      {},
        "peers":          [],
        "pros_cons":      [],
        "credit_ratings": [],
    }


# ─── DB connection target + cache-key scoping ──────────────────────────────
#
# All three helpers below MUST stay coupled by function call (not docstring).
# Cache scope is bound to connection scope via ``_db_identifier()`` reading
# through ``_get_db_connection_target()``. If connection logic ever stops
# reading ``os.environ`` (config file, secrets manager, .pgpass, etc.),
# update only ``_get_db_connection_target()`` and the rest follows.


def _get_db_connection_target() -> dict:
    """Single source of truth for the DB connection target.

    Returns ``psycopg2.connect()`` kwargs that ``_open_cursor()`` will use
    AND that ``_db_identifier()`` will hash into the cache-key scope. Both
    callers MUST go through this helper — function-call coupling guarantees
    the cache scope can never drift from the connection scope (e.g. when
    swapping ``DB_NAME`` env between PROD and dev DB at runtime).
    """
    import os
    return {
        "host":            os.environ["DB_HOST"],
        "port":            os.environ.get("DB_PORT", "5432"),
        "database":        os.environ["DB_NAME"],
        "user":            os.environ["DB_USER"],
        "password":        os.environ["DB_PASSWORD"],
        "connect_timeout": int(os.environ.get("DB_CONNECT_TIMEOUT", "10")),
    }


def _open_cursor():
    """Open a RealDictCursor against the configured DB. Caller is responsible
    for closing the connection. Read-only by convention — accessors never
    write."""
    import psycopg2
    from psycopg2.extras import RealDictCursor
    conn = psycopg2.connect(**_get_db_connection_target())
    return conn, conn.cursor(cursor_factory=RealDictCursor)


def _db_identifier() -> str:
    """Unique identifier for the connection target — ``host::database``.

    Used by ``_cmots_cache_key`` so cache scope is bound to connection
    target. DO NOT read ``os.environ`` here; call
    ``_get_db_connection_target()`` instead.
    """
    cfg = _get_db_connection_target()
    return f"{cfg['host']}::{cfg['database']}"


def _cmots_cache_key(*args, **kwargs) -> str:
    """Cache-key builder used by every CMOTS ``@cache_result`` decorator.

    Scopes keys by ``_db_identifier()`` (host+database) so swapping the
    backend's DB target invalidates cache automatically — no manual
    Redis flush needed between PROD and dev DB swaps.

    ``md5`` here is used only for cache-key hashing (NOT security). The
    12-char truncation keeps Redis keys short; CMOTS keys aren't
    security-sensitive.
    """
    import hashlib
    payload = f"{_db_identifier()}:{args}:{sorted(kwargs.items())}"
    return hashlib.md5(payload.encode()).hexdigest()[:12]


# ─── Gate ───────────────────────────────────────────────────────────────────


def _resolve_co_code(cur, symbol: str) -> int | None:
    """Resolve ``symbol → co_code`` only if the ticker passes the CMOTS gate.

    Returns the int co_code when:
      - ticker exists in ``tickers``
      - ``has_cmots_data = TRUE``
      - ``cmots_disabled = FALSE``
      - ``co_code IS NOT NULL``

    Otherwise returns ``None``. Caller short-circuits to empty shape.
    """
    if not isinstance(symbol, str) or not symbol.strip():
        return None
    cur.execute(
        """
        SELECT co_code
          FROM tickers
         WHERE UPPER(symbol) = %s
           AND has_cmots_data = TRUE
           AND COALESCE(cmots_disabled, FALSE) = FALSE
           AND co_code IS NOT NULL
         LIMIT 1
        """,
        (symbol.strip().upper(),),
    )
    row = cur.fetchone()
    return row["co_code"] if row else None


# ─── has_cmots_data ────────────────────────────────────────────────────────


@cache_result("cmots:has_data", ttl_seconds=TTL_FUNDAMENTALS,
              key_builder=_cmots_cache_key, log_level=logging.INFO)
def has_cmots_data(symbol: str) -> bool:
    """``True`` iff the gate passes for ``symbol``. Never raises."""
    conn, cur = _open_cursor()
    try:
        return _resolve_co_code(cur, symbol) is not None
    finally:
        cur.close()
        conn.close()


# ─── Financial statements ───────────────────────────────────────────────────


_REPORT_KEY_MAP = {
    "profit_loss":   "pnl",
    "balance_sheet": "bs",
    "cash_flow":     "cf",
    "quarterly":     "quarter",
    "yearly":        "year",
}


@cache_result("cmots:financials", ttl_seconds=TTL_FUNDAMENTALS,
              key_builder=_cmots_cache_key, log_level=logging.INFO)
def get_financial_statements(
    symbol: str,
    statement_type: str,
    report: str,
) -> dict[str, Any]:
    """WideTable pivot of ``cmots_financial_line`` for one statement.

    Args:
      symbol: NSE symbol (e.g. ``"RELIANCE"``).
      statement_type: ``'standalone'`` or ``'consolidated'``.
      report: ``'profit_loss'`` | ``'balance_sheet'`` | ``'cash_flow'`` |
              ``'quarterly'`` | ``'yearly'``.

    Returns WideTable with periods newest-first, or empty WideTable when
    the gate fails OR the requested ``(statement_type, report)`` pair has
    no data for this ticker.
    """
    stmt = {"standalone": "S", "consolidated": "C"}.get(statement_type.lower())
    rpt = _REPORT_KEY_MAP.get(report.lower())
    if stmt is None or rpt is None:
        return _empty_wide_table()

    conn, cur = _open_cursor()
    try:
        cc = _resolve_co_code(cur, symbol)
        if cc is None:
            return _empty_wide_table()

        cur.execute(
            """
            SELECT period, rid, column_name, value
              FROM cmots_financial_line
             WHERE co_code = %s AND statement = %s AND report = %s
               AND rid > 0
             ORDER BY period DESC, rid ASC
            """,
            (cc, stmt, rpt),
        )
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    if not rows:
        return _empty_wide_table()

    # Build periods (newest-first ISO dates), labels (CMOTS column_name in
    # RID order from latest period), and the data matrix.
    period_order: list[int] = []
    period_seen: set[int] = set()
    label_order: list[str] = []
    label_seen: set[str] = set()
    cell: dict[tuple[int, str], float | None] = {}

    for r in rows:
        p = r["period"]
        if p not in period_seen:
            period_seen.add(p)
            period_order.append(p)
        lbl = (r["column_name"] or "").strip()
        if not lbl:
            continue
        if lbl not in label_seen:
            label_seen.add(lbl)
            label_order.append(lbl)
        cell[(p, lbl)] = _coerce_finite_float(r["value"])

    periods_iso = [_period_to_iso_date(p) or str(p) for p in period_order]
    data: list[list[float | None]] = []
    for lbl in label_order:
        data.append([cell.get((p, lbl)) for p in period_order])

    return {"periods": periods_iso, "labels": label_order, "data": data}


# ─── Ratios ─────────────────────────────────────────────────────────────────


# Yearly ratio columns from cmots_ratio_yearly schema (excluding PK + raw_json)
_RATIO_YEARLY_COLS = (
    "pe", "pbv", "ev_ebitda", "div_yield",
    "roa", "roe", "roce",
    "ebit", "ebitda", "debt_equity", "current_ratio",
    "mcap", "ev", "eps", "book_value",
    "dividend_payout", "net_income_margin", "gross_income_margin",
    "asset_turnover", "fcf_margin", "sales_totalasset", "netdebt_fcf",
)

_RATIO_QUARTERLY_COLS = (
    "pe", "pbv", "ev_ebitda",
    "roa", "roe",
    "ebit", "ebitda", "debt_equity", "current_ratio",
    "mcap", "ev", "eps", "book_value",
    "net_income_margin", "asset_turnover",
)


@cache_result("cmots:ratios", ttl_seconds=TTL_FUNDAMENTALS,
              key_builder=_cmots_cache_key, log_level=logging.INFO)
def get_ratios(symbol: str, period: str) -> dict[str, Any]:
    """Ratio snapshot for ``symbol``.

    Yearly / quarterly: WideTable with one period column per yearend/qtrend.
    Daily: flat dict ``{metric_name: value}`` from ``Daily_Ratios_C`` (matches
    the existing flat ``fundamentals`` pattern in the frontend — single-
    snapshot data is consumed as a flat dict by ``KeyMetricsCard``).
    """
    p = period.lower()
    if p not in ("yearly", "quarterly", "daily"):
        return {} if p == "daily" else _empty_wide_table()

    conn, cur = _open_cursor()
    try:
        cc = _resolve_co_code(cur, symbol)
        if cc is None:
            return {} if p == "daily" else _empty_wide_table()

        if p == "daily":
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
                (cc,),
            )
            row = cur.fetchone()
            if not row:
                return {}
            payload = dict(row["payload_json"] or {})
            # Strip the structural ``co_code`` field; coerce values to finite
            # floats (NaN/Inf → None).
            payload.pop("co_code", None)
            return {
                k: _coerce_finite_float(v)
                for k, v in payload.items()
            }

        # Yearly / quarterly: pivot cmots_ratio_{yearly,quarterly} to WideTable.
        table = "cmots_ratio_yearly" if p == "yearly" else "cmots_ratio_quarterly"
        period_col = "yearend" if p == "yearly" else "qtrend"
        cols = _RATIO_YEARLY_COLS if p == "yearly" else _RATIO_QUARTERLY_COLS

        cur.execute(
            f"""
            SELECT {period_col} AS period, {", ".join(cols)}
              FROM {table}
             WHERE co_code = %s AND statement = 'C'
             ORDER BY {period_col} DESC
            """,
            (cc,),
        )
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    if not rows:
        return _empty_wide_table()

    periods_iso = [_period_to_iso_date(r["period"]) or str(r["period"]) for r in rows]
    labels = list(cols)
    data: list[list[float | None]] = []
    for lbl in labels:
        data.append([_coerce_finite_float(r[lbl]) for r in rows])
    return {"periods": periods_iso, "labels": labels, "data": data}


# ─── Shareholding ──────────────────────────────────────────────────────────


_SHAREHOLDING_LABEL_COLS = (
    ("Promoter %",          "promoter_pct"),
    ("Promoter Pledge %",   "promoter_pledge_pct"),
    ("FII %",               "fii_pct"),
    ("DII %",               "dii_pct"),
    ("Govt %",              "govt_pct"),
    ("Public %",            "public_pct"),
    ("Custodian %",         "custodian_pct"),
    ("Total Shares",        "total_shares"),
    ("Promoter Shares",     "total_promoter_shares"),
    ("Pledged Shares",      "total_pledged_shares"),
    ("# Shareholders",      "n_shareholders"),
)


@cache_result("cmots:shareholding", ttl_seconds=TTL_FUNDAMENTALS,
              key_builder=_cmots_cache_key, log_level=logging.INFO)
def get_shareholding(symbol: str) -> dict[str, Any]:
    """Pivot ``cmots_shareholding`` to a WideTable.

    Periods: yrc (year-quarter code) → ISO date, newest-first.
    Labels: human-readable shareholding metric names (Promoter %, FII %, …).
    """
    conn, cur = _open_cursor()
    try:
        cc = _resolve_co_code(cur, symbol)
        if cc is None:
            return _empty_wide_table()

        cur.execute(
            f"""
            SELECT yrc, {", ".join(col for _, col in _SHAREHOLDING_LABEL_COLS)}
              FROM cmots_shareholding
             WHERE co_code = %s
             ORDER BY yrc DESC
            """,
            (cc,),
        )
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    if not rows:
        return _empty_wide_table()

    periods_iso = [_period_to_iso_date(r["yrc"]) or str(r["yrc"]) for r in rows]
    labels = [lbl for lbl, _ in _SHAREHOLDING_LABEL_COLS]
    data: list[list[float | None]] = []
    for _, col in _SHAREHOLDING_LABEL_COLS:
        data.append([_coerce_finite_float(r[col]) for r in rows])
    return {"periods": periods_iso, "labels": labels, "data": data}


# ─── Shareholding (scraper-shape translation for endpoint compatibility) ───


# Frontend's hard-coded CATEGORY_KEYS in ShareholdingPattern.tsx — must
# match exactly, else color/line mapping breaks.
_SCRAPER_CATEGORIES: tuple[tuple[str, str], ...] = (
    ("Promoters",  "promoter_pct"),
    ("FIIs",       "fii_pct"),
    ("DIIs",       "dii_pct"),
    ("Public",     "public_pct"),
    ("Government", "govt_pct"),
    # custodian_pct intentionally omitted — see TODO_CMOTS.md note.
)


def _yrc_to_pretty(yrc: int) -> str:
    """Convert CMOTS YRC code (e.g. 202503) → 'Mar 2025'.

    Matches the scraper's period-label format consumed by
    ``ShareholdingPattern.tsx``. Returns the raw int as string for
    malformed codes (defensive — should never happen).
    """
    import calendar
    if not isinstance(yrc, int) or yrc < 100000 or yrc > 999912:
        return str(yrc)
    year, month = divmod(yrc, 100)
    if month < 1 or month > 12:
        return str(yrc)
    return f"{calendar.month_abbr[month]} {year}"


def get_shareholding_cmots_in_scraper_shape(
    symbol: str,
    view: str = "quarterly",
) -> dict[str, Any]:
    """Translate ``cmots_shareholding`` rows into the existing scraper
    response shape so the modified ``/api/shareholding/{ticker}`` endpoint
    can serve CMOTS data without breaking the frontend contract.

    Args:
      symbol: NSE symbol (e.g. ``"RELIANCE"``).
      view: ``'quarterly'`` (all yrc) or ``'yearly'`` (DISTINCT ON calendar
        year — latest snapshot per year; handles non-March fiscal years
        like ITC's December year-end gracefully).

    Output shape (matches ``server.shareholding_scraper.fetch_shareholding``)::

        {
          "success": True/False,
          "symbol":  "RELIANCE",
          "view":    "quarterly"|"yearly",
          "quarters": ["Mar 2026", "Dec 2025", ...],      # newest-first
          "data": [
            {"category": "Promoters",  "values": [49.11, ...], "shareholders": []},
            {"category": "FIIs",       "values": [...],         "shareholders": []},
            {"category": "DIIs",       "values": [...],         "shareholders": []},
            {"category": "Public",     "values": [...],         "shareholders": []},
            {"category": "Government", "values": [...],         "shareholders": []}
          ],
          "chart_data": [                                  # oldest-first
            {"quarter": "Mar 2022", "Promoters": 50.31, "FIIs": 23.34, ...}
          ],
          "error": null
        }

    Returns the scraper's failure-shape (``success=False``, ``error=...``)
    when the CMOTS gate fails OR no rows found — caller (``/api/
    shareholding/{ticker}`` endpoint) can then fall through to the
    Selenium scraper. ``shareholders`` arrays are empty (CMOTS has no
    individual-holder names).
    """
    view = (view or "quarterly").lower()
    if view not in ("quarterly", "yearly"):
        view = "quarterly"

    error_base = {
        "success":   False,
        "symbol":    symbol,
        "view":      view,
        "quarters":  [],
        "data":      [],
        "chart_data": [],
    }

    conn, cur = _open_cursor()
    try:
        cc = _resolve_co_code(cur, symbol)
        if cc is None:
            return {**error_base, "error": f"No CMOTS coverage for {symbol}"}

        if view == "yearly":
            cur.execute(
                f"""
                SELECT DISTINCT ON (yrc / 100)
                       yrc, {", ".join(col for _, col in _SCRAPER_CATEGORIES)}
                  FROM cmots_shareholding
                 WHERE co_code = %s
                 ORDER BY yrc / 100 DESC, yrc DESC
                """,
                (cc,),
            )
        else:
            cur.execute(
                f"""
                SELECT yrc, {", ".join(col for _, col in _SCRAPER_CATEGORIES)}
                  FROM cmots_shareholding
                 WHERE co_code = %s
                 ORDER BY yrc DESC
                """,
                (cc,),
            )
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    if not rows:
        return {**error_base, "error": f"No shareholding data in CMOTS for {symbol}"}

    quarters_newest_first = [_yrc_to_pretty(r["yrc"]) for r in rows]
    quarters_oldest_first = list(reversed(quarters_newest_first))

    # data[]: newest-first values aligned with quarters[]
    data: list[dict[str, Any]] = []
    for category_name, sql_col in _SCRAPER_CATEGORIES:
        values = [_coerce_finite_float(r[sql_col]) for r in rows]
        data.append({
            "category":     category_name,
            "values":       values,
            "shareholders": [],  # CMOTS has no individual-holder names
        })

    # chart_data[]: oldest-first, one dict per period with category numeric keys
    chart_data: list[dict[str, Any]] = []
    rows_oldest_first = list(reversed(rows))
    for i, r in enumerate(rows_oldest_first):
        point: dict[str, Any] = {"quarter": quarters_oldest_first[i]}
        for category_name, sql_col in _SCRAPER_CATEGORIES:
            v = _coerce_finite_float(r[sql_col])
            if v is not None:
                point[category_name] = v
        chart_data.append(point)

    return {
        "success":    True,
        "symbol":     symbol,
        "view":       view,
        "quarters":   quarters_newest_first,
        "data":       data,
        "chart_data": chart_data,
        "error":      None,
    }


# ─── Corporate actions ─────────────────────────────────────────────────────


@cache_result("cmots:corp_actions", ttl_seconds=TTL_FUNDAMENTALS,
              key_builder=_cmots_cache_key, log_level=logging.INFO)
def get_corporate_actions(
    symbol: str,
    action_type: str | None = None,
) -> list[dict[str, Any]]:
    """Per-ticker corporate-action events from ``cmots_corporate_action``.

    Args:
      symbol: NSE symbol.
      action_type: optional filter (``'dividend'``, ``'agm'``, ``'bonus'``,
        ``'split'``, ``'rights'``, ``'board_meeting'``, ``'merger_demerger'``,
        ``'book_closure'``, ``'buyback'``, ``'egm'``, ``'ofs'``,
        ``'change_of_name'``, ``'delisted'``, ``'forthcoming'``). When
        ``None``, returns all action types.

    Returns: list of ``{action_type, action_date, payload, source_slug}``
    dicts, newest-first. Empty list if gate fails or no events.
    """
    conn, cur = _open_cursor()
    try:
        cc = _resolve_co_code(cur, symbol)
        if cc is None:
            return []

        if action_type:
            cur.execute(
                """
                SELECT action_type, action_date, payload, source_slug
                  FROM cmots_corporate_action
                 WHERE co_code = %s AND action_type = %s
                 ORDER BY action_date DESC NULLS LAST
                """,
                (cc, action_type.lower()),
            )
        else:
            cur.execute(
                """
                SELECT action_type, action_date, payload, source_slug
                  FROM cmots_corporate_action
                 WHERE co_code = %s
                 ORDER BY action_date DESC NULLS LAST
                """,
                (cc,),
            )
        return [
            {
                "action_type": r["action_type"],
                "action_date": r["action_date"].isoformat() if r["action_date"] else None,
                "payload":     r["payload"],
                "source_slug": r["source_slug"],
            }
            for r in cur.fetchall()
        ]
    finally:
        cur.close()
        conn.close()


# ─── Narratives ────────────────────────────────────────────────────────────


@cache_result("cmots:narratives", ttl_seconds=TTL_FUNDAMENTALS,
              key_builder=_cmots_cache_key, log_level=logging.INFO)
def get_narratives(
    symbol: str,
    doc_type: str | None = None,
) -> list[dict[str, Any]]:
    """Per-ticker narrative documents from ``cmots_narrative``.

    Args:
      symbol: NSE symbol.
      doc_type: optional filter (``'director_report'``, ``'chairman_report'``,
        ``'auditor_report'``, ``'notes_to_account'``, ``'mda'``). ``None`` =
        all doc types.

    Returns list of ``{doc_type, year, body_html, body_text, fetched_at}``,
    newest year first.
    """
    conn, cur = _open_cursor()
    try:
        cc = _resolve_co_code(cur, symbol)
        if cc is None:
            return []

        if doc_type:
            cur.execute(
                """
                SELECT doc_type, year, body_html, body_text, fetched_at
                  FROM cmots_narrative
                 WHERE co_code = %s AND doc_type = %s
                 ORDER BY year DESC NULLS LAST
                """,
                (cc, doc_type.lower()),
            )
        else:
            cur.execute(
                """
                SELECT doc_type, year, body_html, body_text, fetched_at
                  FROM cmots_narrative
                 WHERE co_code = %s
                 ORDER BY year DESC NULLS LAST, doc_type ASC
                """,
                (cc,),
            )
        return [
            {
                "doc_type":   r["doc_type"],
                "year":       r["year"],
                "body_html":  r["body_html"],
                "body_text":  r["body_text"],
                "fetched_at": r["fetched_at"].isoformat() if r["fetched_at"] else None,
            }
            for r in cur.fetchall()
        ]
    finally:
        cur.close()
        conn.close()


# ─── Announcements ─────────────────────────────────────────────────────────


@cache_result("cmots:announcements", ttl_seconds=TTL_FUNDAMENTALS,
              key_builder=_cmots_cache_key, log_level=logging.INFO)
def get_announcements(
    symbol: str,
    with_ratings_only: bool = False,
) -> list[dict[str, Any]]:
    """Per-ticker BSE/NSE announcements from ``cmots_announcement``.

    Args:
      symbol: NSE symbol.
      with_ratings_only: when True, filter to rows where the §9.4 regex
        extracted an ``agency`` (i.e. credit-rating events).

    Returns list of full announcement dicts, newest first.
    """
    conn, cur = _open_cursor()
    try:
        cc = _resolve_co_code(cur, symbol)
        if cc is None:
            return []

        where_extra = " AND rating IS NOT NULL" if with_ratings_only else ""
        cur.execute(
            f"""
            SELECT source, caption, memo, descriptor, type,
                   announcement_date, file_url, agency, rating
              FROM cmots_announcement
             WHERE co_code = %s {where_extra}
             ORDER BY announcement_date DESC NULLS LAST
            """,
            (cc,),
        )
        return [
            {
                "source":            r["source"],
                "caption":           r["caption"],
                "memo":              r["memo"],
                "descriptor":        r["descriptor"],
                "type":              r["type"],
                "announcement_date": r["announcement_date"].isoformat() if r["announcement_date"] else None,
                "file_url":          r["file_url"],
                "agency":            r["agency"],
                "rating":            r["rating"],
            }
            for r in cur.fetchall()
        ]
    finally:
        cur.close()
        conn.close()


# ─── Credit ratings (announcements where rating IS NOT NULL) ───────────────


@cache_result("cmots:credit_ratings", ttl_seconds=TTL_FUNDAMENTALS,
              key_builder=_cmots_cache_key, log_level=logging.INFO)
def get_credit_ratings(symbol: str) -> list[dict[str, Any]]:
    """Per-ticker credit-rating events extracted from announcements
    (§9.4 shape: ``{date, agency, rating, source, caption, memo, file_url}``).

    Same row set as ``get_announcements(symbol, with_ratings_only=True)``,
    different output shape (rating-centric, with ``date`` instead of
    ``announcement_date``).
    """
    conn, cur = _open_cursor()
    try:
        cc = _resolve_co_code(cur, symbol)
        if cc is None:
            return []

        cur.execute(
            """
            SELECT announcement_date, agency, rating, source, caption, memo, file_url
              FROM cmots_announcement
             WHERE co_code = %s AND rating IS NOT NULL
             ORDER BY announcement_date DESC NULLS LAST
            """,
            (cc,),
        )
        return [
            {
                "date":     r["announcement_date"].isoformat() if r["announcement_date"] else None,
                "agency":   r["agency"],
                "rating":   r["rating"],
                "source":   r["source"],
                "caption":  r["caption"],
                "memo":     r["memo"],
                "file_url": r["file_url"],
            }
            for r in cur.fetchall()
        ]
    finally:
        cur.close()
        conn.close()


# ─── Sector medians (process-wide in-memory cache) ─────────────────────────


_SECTOR_MEDIANS_CACHE: dict[str, dict[str, Any]] = {}
_SECTOR_MEDIANS_LOCK = threading.Lock()

# Schema §9.2 — 9 metric names. Map each to the cmots_ratio_yearly column
# the median is computed against (PE → pe, etc.). PBIDTIM = profit-before-
# interest-depreciation-tax margin ~ EBITDA margin proxy; PATM = PAT margin
# = net_income_margin; EBITM = EBIT margin (we derive from yearly).
_SECTOR_MEDIAN_METRICS = (
    ("PE",              "pe"),
    ("Price_BookValue", "pbv"),
    ("EV_EBITDA",       "ev_ebitda"),
    ("DividendYield",   "div_yield"),
    ("ROE",             "roe"),
    ("ROA",             "roa"),
    ("PBIDTIM",         "ebitda"),   # gross EBITDA value; consumers may
                                     # divide by revenue if desired. We
                                     # surface the raw aggregate per schema.
    ("PATM",            "net_income_margin"),
    ("EBITM",           "ebit"),
)


def clear_sector_medians_cache() -> None:
    """Drop the process-wide sector-medians cache. Call at end of
    ``run_full_sync`` so the next read recomputes against fresh data."""
    with _SECTOR_MEDIANS_LOCK:
        _SECTOR_MEDIANS_CACHE.clear()


def get_sector_medians(sector: str) -> dict[str, Any]:
    """Median of each tracked metric across all CMOTS-covered tickers in
    ``sector``. Process-wide in-memory cache; invalidate via
    ``clear_sector_medians_cache()`` at end of sync."""
    if not isinstance(sector, str) or not sector.strip():
        return {"sector": sector or "", "n_tickers": 0, "metrics": {}}

    key = sector.strip()
    with _SECTOR_MEDIANS_LOCK:
        if key in _SECTOR_MEDIANS_CACHE:
            return _SECTOR_MEDIANS_CACHE[key]

    conn, cur = _open_cursor()
    try:
        # Pull the latest cmots_ratio_yearly row per covered ticker in this sector.
        cur.execute(
            f"""
            WITH latest AS (
              SELECT DISTINCT ON (cr.co_code)
                     cr.co_code, {", ".join(f"cr.{c}" for _, c in _SECTOR_MEDIAN_METRICS)}
                FROM cmots_ratio_yearly cr
                JOIN tickers t ON t.co_code = cr.co_code
               WHERE t.sector = %s
                 AND t.has_cmots_data = TRUE
                 AND COALESCE(t.cmots_disabled, FALSE) = FALSE
                 AND cr.statement = 'C'
               ORDER BY cr.co_code, cr.yearend DESC
            )
            SELECT * FROM latest
            """,
            (key,),
        )
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    metrics: dict[str, dict[str, Any]] = {}
    for label, col in _SECTOR_MEDIAN_METRICS:
        vals = []
        for r in rows:
            v = _coerce_finite_float(r[col])
            if v is not None:
                vals.append(v)
        if vals:
            metrics[label] = {"value": statistics.median(vals), "n": len(vals)}

    result = {
        "sector":    key,
        "n_tickers": len(rows),
        "metrics":   metrics,
    }
    with _SECTOR_MEDIANS_LOCK:
        _SECTOR_MEDIANS_CACHE[key] = result
    return result


# ─── Pros / Cons rule engine (schema §9.3) ─────────────────────────────────


def _pros_cons_collect_inputs(cur, co_code: int) -> dict[str, Any]:
    """Gather all inputs needed by the rule engine in a single roundtrip-
    friendly batch."""
    inputs: dict[str, Any] = {}

    # Borrowings YoY (BS RID56) — most recent two periods
    cur.execute(
        """
        SELECT period, value FROM cmots_financial_line
         WHERE co_code = %s AND statement = 'C' AND report = 'bs' AND rid = 56
         ORDER BY period DESC LIMIT 2
        """,
        (co_code,),
    )
    debt_rows = cur.fetchall()
    inputs["debt_latest"]  = _coerce_finite_float(debt_rows[0]["value"]) if len(debt_rows) > 0 else None
    inputs["debt_prior"]   = _coerce_finite_float(debt_rows[1]["value"]) if len(debt_rows) > 1 else None

    # ROE — latest from cmots_ratio_yearly
    cur.execute(
        """
        SELECT roe FROM cmots_ratio_yearly
         WHERE co_code = %s AND statement = 'C'
         ORDER BY yearend DESC LIMIT 1
        """,
        (co_code,),
    )
    r = cur.fetchone()
    inputs["roe"] = _coerce_finite_float(r["roe"]) if r else None

    # Sales CAGR (5y, RID8) — pull all years and compute
    cur.execute(
        """
        SELECT period, value FROM cmots_financial_line
         WHERE co_code = %s AND statement = 'C' AND report = 'pnl' AND rid = 8
         ORDER BY period DESC
        """,
        (co_code,),
    )
    rev_rows = cur.fetchall()
    inputs["revenue_series"] = [
        (r["period"], _coerce_finite_float(r["value"])) for r in rev_rows
    ]

    # PAT growth YoY (RID37) and PAT series for CFO/PAT
    cur.execute(
        """
        SELECT period, value FROM cmots_financial_line
         WHERE co_code = %s AND statement = 'C' AND report = 'pnl' AND rid = 37
         ORDER BY period DESC
        """,
        (co_code,),
    )
    pat_rows = cur.fetchall()
    inputs["pat_series"] = [
        (r["period"], _coerce_finite_float(r["value"])) for r in pat_rows
    ]

    # CFO series (CF RID67)
    cur.execute(
        """
        SELECT period, value FROM cmots_financial_line
         WHERE co_code = %s AND statement = 'C' AND report = 'cf' AND rid = 67
         ORDER BY period DESC
        """,
        (co_code,),
    )
    cfo_rows = cur.fetchall()
    inputs["cfo_series"] = [
        (r["period"], _coerce_finite_float(r["value"])) for r in cfo_rows
    ]

    # Dividend track record + Promoter holding + pledge + sector
    cur.execute(
        """
        SELECT COUNT(*) AS n
          FROM cmots_corporate_action
         WHERE co_code = %s AND source_slug = 'Dividend'
        """,
        (co_code,),
    )
    inputs["n_dividends"] = cur.fetchone()["n"]

    cur.execute(
        """
        SELECT promoter_pct, promoter_pledge_pct
          FROM cmots_shareholding
         WHERE co_code = %s
         ORDER BY yrc DESC LIMIT 1
        """,
        (co_code,),
    )
    sh = cur.fetchone()
    inputs["promoter_pct"]   = _coerce_finite_float(sh["promoter_pct"]) if sh else None
    inputs["promoter_pledge_pct"] = _coerce_finite_float(sh["promoter_pledge_pct"]) if sh else None

    # Daily PE for sector comparison + sector name
    cur.execute(
        """
        SELECT r.payload_json
          FROM cmots_api_rows r
          JOIN cmots_api_calls c ON c.id = r.api_call_id
          JOIN cmots_endpoints e ON e.id = c.endpoint_id
         WHERE e.slug = 'Daily_Ratios_C' AND c.co_code = %s AND c.success = TRUE
         ORDER BY r.row_index ASC LIMIT 1
        """,
        (co_code,),
    )
    dr = cur.fetchone()
    inputs["pe_now"] = _coerce_finite_float((dr["payload_json"] or {}).get("PE")) if dr else None

    cur.execute(
        "SELECT sector FROM tickers WHERE co_code = %s LIMIT 1", (co_code,)
    )
    sec_row = cur.fetchone()
    inputs["sector"] = (sec_row["sector"] or "").strip() if sec_row else None

    return inputs


def _cagr_pct(latest: float | None, oldest: float | None, years: int) -> float | None:
    """CAGR over N years as a percentage. None on any unsafe case."""
    if latest is None or oldest is None or oldest <= 0 or years <= 0:
        return None
    try:
        return ((latest / oldest) ** (1 / years) - 1) * 100
    except (ValueError, ZeroDivisionError):
        return None


@cache_result("cmots:pros_cons", ttl_seconds=TTL_FUNDAMENTALS,
              key_builder=_cmots_cache_key, log_level=logging.INFO)
def get_pros_cons(symbol: str) -> list[dict[str, Any]]:
    """Compute the §9.3 pros/cons rules against this ticker's hot-path data.

    Returns a list of ``{type, label, detail}`` where ``type`` is ``'pro'``,
    ``'con'``, or ``'info'``. Rules whose inputs aren't available are
    silently skipped (no error, no info-entry).
    """
    conn, cur = _open_cursor()
    try:
        cc = _resolve_co_code(cur, symbol)
        if cc is None:
            return []

        i = _pros_cons_collect_inputs(cur, cc)
        sector_medians = (
            get_sector_medians(i["sector"]) if i["sector"] else None
        )
    finally:
        cur.close()
        conn.close()

    out: list[dict[str, Any]] = []

    # Rule 1: Debt trend
    if i["debt_latest"] is not None and i["debt_prior"] is not None and i["debt_prior"] > 0:
        change = i["debt_latest"] / i["debt_prior"] - 1
        pct = change * 100
        if change < -0.10:
            out.append({"type": "pro", "label": "Reducing debt",
                        "detail": f"Total borrowings down {abs(pct):.0f}% YoY"})
        elif change > 0.25:
            out.append({"type": "con", "label": "Rising debt",
                        "detail": f"Total borrowings up {pct:.0f}% YoY"})

    # Rule 2: Strong ROE
    if i["roe"] is not None:
        if i["roe"] >= 18:
            out.append({"type": "pro", "label": "Strong ROE",
                        "detail": f"ROE of {i['roe']:.1f}% (≥18% threshold)"})
        elif i["roe"] < 5:
            out.append({"type": "con", "label": "Weak ROE",
                        "detail": f"ROE of {i['roe']:.1f}% (<5% threshold)"})

    # Rule 3: Sales CAGR over the last 5 years (or whatever's available, min 3)
    rev = i["revenue_series"]
    if len(rev) >= 3 and rev[0][1] is not None:
        # Use up to 5 years span
        n = min(len(rev) - 1, 4)  # latest is index 0, oldest is index n
        oldest_val = rev[n][1]
        years = n  # number of full periods between latest and oldest
        cagr = _cagr_pct(rev[0][1], oldest_val, years)
        if cagr is not None:
            if cagr >= 15:
                out.append({"type": "pro", "label": "Strong sales growth",
                            "detail": f"Sales CAGR of {cagr:.1f}% over {years} years"})
            elif cagr < -5:
                out.append({"type": "con", "label": "Declining sales",
                            "detail": f"Sales CAGR of {cagr:.1f}% over {years} years"})

    # Rule 4: PAT growth (YoY)
    pat = i["pat_series"]
    if len(pat) >= 2:
        g = safe_growth(pat[0][1], pat[1][1])
        if g is not None:
            g_pct = g * 100
            if g_pct >= 20:
                out.append({"type": "pro", "label": "Strong profit growth",
                            "detail": f"PAT up {g_pct:.0f}% YoY"})
            elif g_pct <= -20:
                out.append({"type": "con", "label": "Profit decline",
                            "detail": f"PAT down {abs(g_pct):.0f}% YoY"})

    # Rule 5: Promoter pledge (substituted via cmots_shareholding.promoter_pledge_pct)
    if i["promoter_pledge_pct"] is not None:
        if i["promoter_pledge_pct"] == 0:
            out.append({"type": "pro", "label": "No promoter pledge",
                        "detail": "Promoter holding is unencumbered"})
        elif i["promoter_pledge_pct"] > 0:
            out.append({"type": "con", "label": "Promoter pledge",
                        "detail": f"{i['promoter_pledge_pct']:.1f}% of promoter holding pledged"})

    # Rule 6: Dividend track record
    if i["n_dividends"] >= 5:
        out.append({"type": "pro", "label": "Consistent dividends",
                    "detail": f"{i['n_dividends']} dividend events on record"})

    # Rule 7: CFO / PAT (cash quality) — mean over last 3 years
    cfo_map = {p: v for p, v in i["cfo_series"] if v is not None}
    pat_map = {p: v for p, v in i["pat_series"] if v is not None and v > 0}
    common_periods = sorted(set(cfo_map.keys()) & set(pat_map.keys()), reverse=True)[:3]
    if len(common_periods) >= 3:
        ratios = [cfo_map[p] / pat_map[p] for p in common_periods]
        mean_ratio = statistics.mean(ratios)
        if mean_ratio >= 0.8:
            out.append({"type": "pro", "label": "Strong cash conversion",
                        "detail": f"3yr mean CFO/PAT = {mean_ratio:.2f}"})
        elif mean_ratio < 0.3:
            out.append({"type": "con", "label": "Weak cash conversion",
                        "detail": f"3yr mean CFO/PAT = {mean_ratio:.2f}"})

    # Rule 8: Promoter holding
    if i["promoter_pct"] is not None:
        if i["promoter_pct"] >= 50:
            out.append({"type": "pro", "label": "High promoter stake",
                        "detail": f"Promoters hold {i['promoter_pct']:.1f}%"})
        elif i["promoter_pct"] < 25:
            out.append({"type": "info", "label": "Low promoter stake",
                        "detail": f"Promoters hold {i['promoter_pct']:.1f}%"})

    # Rule 9: Valuation vs sector PE
    if (i["pe_now"] is not None and sector_medians
            and "PE" in sector_medians["metrics"]
            and sector_medians["metrics"]["PE"]["n"] >= 2):
        sector_pe = sector_medians["metrics"]["PE"]["value"]
        if sector_pe and sector_pe > 0:
            ratio = i["pe_now"] / sector_pe
            if ratio > 1.5:
                out.append({"type": "con", "label": "Premium to sector",
                            "detail": f"PE {i['pe_now']:.1f} vs sector median {sector_pe:.1f}"})
            elif ratio < 0.6:
                out.append({"type": "pro", "label": "Discount to sector",
                            "detail": f"PE {i['pe_now']:.1f} vs sector median {sector_pe:.1f}"})

    return out


# ─── Screener bundle (composite §9.6) ───────────────────────────────────────


@cache_result("cmots:screener", ttl_seconds=TTL_FUNDAMENTALS,
              key_builder=_cmots_cache_key, log_level=logging.INFO)
def get_screener_bundle(symbol: str) -> dict[str, Any]:
    """Composite §9.6 response — aggregates every accessor's output for one
    ticker. Single call from the frontend's screener-style dashboard view.

    Returns the full ScreenerBundle (with empty WideTables/lists for any
    section that has no data) when the gate passes, OR an entirely
    empty-shaped bundle when the gate fails.
    """
    symbol_upper = symbol.strip().upper() if isinstance(symbol, str) else ""
    conn, cur = _open_cursor()
    try:
        cc = _resolve_co_code(cur, symbol_upper)
        if cc is None:
            return _empty_screener_bundle(symbol_upper)

        # Ticker profile + company_extended for name + sector
        cur.execute(
            """
            SELECT t.symbol, t.co_code, t.name, t.sector, t.industry, t.mcap_type,
                   ce.chairman, ce.auditor, ce.website,
                   ce.directors_json, ce.bankers_json,
                   ce.subsidiaries_json, ce.locations_json
              FROM tickers t
              LEFT JOIN cmots_company_extended ce ON ce.co_code = t.co_code
             WHERE t.co_code = %s
             LIMIT 1
            """,
            (cc,),
        )
        prof = cur.fetchone()
    finally:
        cur.close()
        conn.close()

    bundle = _empty_screener_bundle(symbol_upper)
    if prof:
        bundle["ticker"] = {
            "symbol":    prof["symbol"],
            "co_code":   prof["co_code"],
            "name":      prof["name"],
            "sector":    prof["sector"],
            "industry":  prof["industry"],
            "mcap_type": prof["mcap_type"],
            "chairman":  prof["chairman"],
            "auditor":   prof["auditor"],
            "website":   prof["website"],
        }
        bundle["directors"] = prof["directors_json"] or []

    # Fan in all the per-ticker accessors. Each is independently Redis-cached
    # via @cache_result.
    bundle["statement_type"]    = "Consolidated"
    bundle["profit_loss"]       = get_financial_statements(symbol_upper, "consolidated", "profit_loss")
    bundle["balance_sheet"]     = get_financial_statements(symbol_upper, "consolidated", "balance_sheet")
    bundle["cash_flow"]         = get_financial_statements(symbol_upper, "consolidated", "cash_flow")
    bundle["yearly_results"]    = get_financial_statements(symbol_upper, "consolidated", "yearly")
    bundle["quarterly_results"] = get_financial_statements(symbol_upper, "consolidated", "quarterly")
    bundle["ratios_yearly"]     = get_ratios(symbol_upper, "yearly")
    bundle["ratios_quarterly"]  = get_ratios(symbol_upper, "quarterly")
    bundle["shareholding"]      = get_shareholding(symbol_upper)
    bundle["dividends"]         = get_corporate_actions(symbol_upper, "dividend")
    bundle["bonus"]             = get_corporate_actions(symbol_upper, "bonus")
    bundle["splits"]            = get_corporate_actions(symbol_upper, "split")
    bundle["book_closure"]      = get_corporate_actions(symbol_upper, "book_closure")
    bundle["board_meetings"]    = get_corporate_actions(symbol_upper, "board_meeting")
    bundle["pros_cons"]         = get_pros_cons(symbol_upper)
    bundle["credit_ratings"]    = get_credit_ratings(symbol_upper)

    # key_metrics from daily ratios (flat dict)
    daily = get_ratios(symbol_upper, "daily")
    if daily:
        for k in ("PE", "PBV", "EV_EBITDA_TTM", "ROE_TTM", "ROA_TTM",
                  "ROCE_TTM", "NetIncomeMargin_TTM", "EBITDA_Margin_TTM",
                  "Debt_Equity_TTM", "CurrentRatio_TTM", "MCAP", "EV",
                  "PEGRatio_TTM", "DIVYIELD"):
            if k in daily:
                bundle["key_metrics"][k] = daily[k]

    # Sector benchmarks alongside (one extra accessor call)
    if prof and prof.get("sector"):
        medians = get_sector_medians(prof["sector"])
        bundle["benchmarks"] = medians.get("metrics", {})

    # Narratives as a doc_type → row map for the documents section
    docs: dict[str, list[dict]] = {}
    for n in get_narratives(symbol_upper):
        docs.setdefault(n["doc_type"], []).append(n)
    bundle["documents"] = docs

    return bundle


# ─── Sync-end cache invalidation ────────────────────────────────────────────


def invalidate_all_caches() -> int:
    """Drop the in-memory sector-medians cache AND every ``cmots:*`` key in
    Redis. Called at the end of ``run_full_sync``.

    Returns the number of Redis keys deleted (0 if Redis unavailable).
    """
    clear_sector_medians_cache()
    return delete_pattern("cmots:*")
