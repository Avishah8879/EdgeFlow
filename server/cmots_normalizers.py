"""CMOTS payload normalizers — raw API rows -> hot-path table rows.

Each ``normalize_*`` function takes the unwrapped ``data`` field from a
CMOTS envelope (already filtered for ``success=True`` by the caller) and
returns a list of dicts ready for UPSERT into the matching hot-path table.

Contract (applies to every normalizer in this module):

  - **Input**: ``rows: list[dict]`` — unwrapped envelope data.
  - **Output**: ``list[dict]`` whose keys match the target table's column
    names exactly (snake_case, matching migration 032).
  - **Empty input** → returns ``[]``, never raises.
  - **Bad data** → logs ``logger.warning("<name>: skipped row <idx> for
    co_code=<cc>: <reason>")``, skips that row, returns whatever succeeded.
    Never raises on a single bad row.
  - **All-skipped on non-empty input** → emits one additional
    ``logger.warning("<name>: all N input rows skipped — possible data
    loss")`` so silent ``[]`` returns can't hide data loss.
  - **Coercion**: every period field goes through ``coerce_period``; every
    co_code through ``coerce_co_code``; every numeric ratio through
    ``_to_decimal``. No exceptions, no silent type promotions.

Dispatch table at the bottom maps endpoint slugs to (normalizer, kwargs,
target_table). The sync orchestrator (§4's ``cmots_sync.py``) will read
this table when integration lands in a later step — for now the table
exists so the normalizers can be exercised together later without
re-discovery.
"""

from __future__ import annotations

import datetime
import logging
import math
import re
from typing import Any, Callable

from server.cmots_client import coerce_co_code, coerce_period

logger = logging.getLogger(__name__)


# ─── Shared numeric coercion ────────────────────────────────────────────────


def _to_decimal(value: Any) -> float | None:
    """Coerce a CMOTS numeric field to float-or-None.

    Returns ``None`` for any of:
      - ``None``
      - ``bool`` (rejected — ratios are not booleans, even though bool ⊂ int)
      - ``float('nan')`` / ``float('inf')`` / ``float('-inf')``
      - empty string (handled via ``not s``)
      - sentinel strings (after .strip().upper()):
          ``"N/A"``, ``"NA"``, ``"NULL"``, ``"-"``, ``"--"``
      - any string that won't parse to float
      - any non-int / non-float / non-string type

    Returns a ``float`` for any int, finite float, int-string, or
    float-string input (after stripping). Never raises.
    """
    if value is None:
        return None
    if isinstance(value, bool):
        # bool is a subclass of int — reject defensively (ratios are not bools).
        return None
    if isinstance(value, (int, float)):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return None
        return float(value)
    if isinstance(value, str):
        s = value.strip()
        if not s or s.upper() in ("N/A", "NA", "NULL", "-", "--"):
            return None
        try:
            return float(s)
        except ValueError:
            return None
    return None


# ─── normalize_ratios — Yearly_Ratio_{S,C}, Quarterly_Ratio_{S,C} ──────────


# CMOTS payload key -> our target column name. Sourced from the actual
# RELIANCE yearly_ratio_c fixture captured during §4's trial sync; verified
# against migrations 032 cmots_ratio_yearly column list.
#
# NB the rename pattern: CMOTS often uses run-together field names
# (divyield, currentratio, bookvalue, ...) while our SQL columns use
# snake_case. The map is the source of truth for the rename.
_RATIO_FIELD_MAP: dict[str, str] = {
    # numeric ratios — order matches migration 032's cmots_ratio_yearly columns.
    # The quarterly schema is a strict subset (15 of these 22) per migration
    # 032 — see ``_QUARTERLY_RATIO_COLUMNS`` below.
    "pe":                "pe",
    "pbv":               "pbv",
    "ev_ebitda":         "ev_ebitda",
    "divyield":          "div_yield",
    "roa":               "roa",
    "roe":               "roe",
    "roce":              "roce",
    "ebit":              "ebit",
    "ebitda":            "ebitda",
    "debt_equity":       "debt_equity",
    "currentratio":      "current_ratio",
    "mcap":              "mcap",
    "ev":                "ev",
    "eps":               "eps",
    "bookvalue":         "book_value",
    "dividendpayout":    "dividend_payout",
    "netincomemargin":   "net_income_margin",
    "grossincomemargin": "gross_income_margin",
    "assetturnover":     "asset_turnover",
    "fcf_margin":        "fcf_margin",
    "sales_totalasset":  "sales_totalasset",
    "netdebt_fcf":       "netdebt_fcf",
}

# ``cmots_ratio_quarterly`` has only 15 of the 22 ratio columns — the long-
# horizon metrics (div_yield, roce, dividend_payout, gross_income_margin,
# fcf_margin, sales_totalasset, netdebt_fcf) aren't meaningful quarter-over-
# quarter. The orchestrator routes Quarterly_Ratio_S/C calls here, so the
# normalizer must emit only the column set the table accepts — else psycopg2
# raises ``column "..." of relation "cmots_ratio_quarterly" does not exist``.
_QUARTERLY_RATIO_COLUMNS: frozenset[str] = frozenset({
    "pe", "pbv", "ev_ebitda", "roa", "roe", "ebit", "ebitda",
    "debt_equity", "current_ratio", "mcap", "ev", "eps", "book_value",
    "net_income_margin", "asset_turnover",
})


def normalize_ratios(
    rows: list[dict],
    *,
    statement: str,
    period_field: str,
) -> list[dict[str, Any]]:
    """Normalize CMOTS long-format ratio rows for the hot-path ratio tables.

    Supported endpoints (per the dispatch table at the bottom of this module):
      - ``Yearly_Ratio_S``    -> statement='S', period_field='yearend'
      - ``Yearly_Ratio_C``    -> statement='C', period_field='yearend'
      - ``Quarterly_Ratio_S`` -> statement='S', period_field='qtrend'
      - ``Quarterly_Ratio_C`` -> statement='C', period_field='qtrend'

    Each output row contains:
      - ``co_code``        : int   (via coerce_co_code)
      - ``statement``      : str   ('S' or 'C')
      - ``<period_field>`` : int   (via coerce_period; key name matches kwarg)
      - 22 typed ratio columns (float or None — see _RATIO_FIELD_MAP)
      - ``raw_json``       : dict  (the original input row, preserved)

    Rows missing co_code or the period field are skipped (logged). Extra
    columns in the input (e.g. bank-specific 'CASA' on financial-firm rows)
    are passed through to ``raw_json`` but ignored in the typed projection.
    """
    if statement not in ("S", "C"):
        raise ValueError(f"statement must be 'S' or 'C', got {statement!r}")
    if period_field not in ("yearend", "qtrend"):
        raise ValueError(
            f"period_field must be 'yearend' or 'qtrend', got {period_field!r}"
        )

    if not rows:
        return []

    out: list[dict[str, Any]] = []
    name = "normalize_ratios"

    for idx, raw in enumerate(rows):
        if not isinstance(raw, dict):
            logger.warning(
                "%s: skipped row %d for co_code=?: not a dict (got %s)",
                name, idx, type(raw).__name__,
            )
            continue

        cc = coerce_co_code(raw.get("co_code"))
        if cc is None:
            logger.warning(
                "%s: skipped row %d for co_code=None: missing/invalid co_code "
                "(raw value=%r)",
                name, idx, raw.get("co_code"),
            )
            continue

        period_val = coerce_period(raw.get(period_field))
        if period_val is None:
            logger.warning(
                "%s: skipped row %d for co_code=%d: missing/invalid %s "
                "(raw value=%r)",
                name, idx, cc, period_field, raw.get(period_field),
            )
            continue

        row: dict[str, Any] = {
            "co_code":     cc,
            "statement":   statement,
            period_field:  period_val,
            "raw_json":    raw,
        }
        # Quarterly schema is a subset — emit only the columns the table has.
        # Anything missing is still preserved in raw_json for completeness.
        emit_all_columns = period_field == "yearend"
        for cmots_key, col_name in _RATIO_FIELD_MAP.items():
            if emit_all_columns or col_name in _QUARTERLY_RATIO_COLUMNS:
                row[col_name] = _to_decimal(raw.get(cmots_key))
        out.append(row)

    if rows and not out:
        logger.warning(
            "%s: all %d input rows skipped — possible data loss "
            "(statement=%s, period_field=%s)",
            name, len(rows), statement, period_field,
        )

    return out


# ─── normalize_financial_line — wide-to-long melt ─────────────────────────


# Period column key per quirk §11.5: fixed-width ``Y`` + exactly 6 digits.
# Malformed keys (``Y20253``, ``Y2025-03``, ``Y20250301``) silently won't
# match and are skipped as non-period columns (alongside ``RID``, ``rowno``,
# ``COLUMNNAME``).
_PERIOD_KEY_RE = re.compile(r"^Y\d{6}$")

_VALID_REPORTS = frozenset({"pnl", "bs", "cf", "quarter", "year", "half", "nine"})


def _coerce_rid(value: Any) -> int | None:
    """Coerce ``RID`` to int. Same defensive shape as ``coerce_co_code`` but
    kept separate so future RID-specific validation can diverge."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return int(value)
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        try:
            return int(s)
        except ValueError:
            try:
                f = float(s)
                if math.isnan(f) or math.isinf(f):
                    return None
                return int(f)
            except ValueError:
                return None
    return None


def normalize_financial_line(
    rows: list[dict],
    *,
    co_code: int,
    statement: str,
    report: str,
) -> list[dict[str, Any]]:
    """Melt CMOTS wide-layout financial rows into long form.

    Input row shape (one row per line item)::

        {
          "RID": int,
          "rowno": int (optional, ignored),
          "COLUMNNAME": str (may carry leading whitespace — quirk §11.8),
          "Y201603": float|None, "Y201703": float|None, ...,
          "Y202503": float|None,
        }

    Output row shape (one row per (period, rid) cell with a non-null value)::

        {
          "co_code":     int,
          "statement":   str,  # 'S' or 'C'
          "report":      str,  # one of 'pnl' | 'bs' | 'cf' | 'quarter' |
                               #        'year' | 'half' | 'nine'
          "period":      int,  # YYYYMM
          "rid":         int,
          "column_name": str,  # whitespace-stripped per quirk §11.8
          "value":       float,
        }

    The output keys match ``cmots_financial_line`` columns exactly (no
    ``raw_json`` column on this table; the wide-row provenance is implicit
    in (rid, column_name)).

    Behaviour:

      - ``co_code`` is NOT in the source rows (the API call URL carries it).
        Callers pass it via kwarg.
      - ``RID`` missing/invalid -> skip the row (logged at WARNING).
      - ``COLUMNNAME`` missing/empty after strip -> skip the row (logged).
      - Period key not matching ``^Y\\d{6}$`` -> ignore that column (not
        logged — it's just a non-period column like ``rowno``).
      - Per-cell ``value`` IS NULL or unparseable -> skip that cell (per
        user spec: don't store NULL-value rows). NOT logged per-cell; the
        whole-row "no cells emitted" case is also not logged (sparse data
        is normal for older periods that didn't exist for new line items).
      - Empty input -> ``[]``.
      - Non-empty input but zero output cells -> one summary WARNING.

    Quirks honoured:
      §11.5  period key is fixed-width string; ``coerce_period`` on the
             matched digits returns int.
      §11.8  cash-flow ``COLUMNNAME`` carries leading whitespace; we
             ``.strip()`` before storing.
    """
    if statement not in ("S", "C"):
        raise ValueError(f"statement must be 'S' or 'C', got {statement!r}")
    if report not in _VALID_REPORTS:
        raise ValueError(
            f"report must be one of {sorted(_VALID_REPORTS)}, got {report!r}"
        )
    if not isinstance(co_code, int) or isinstance(co_code, bool):
        raise TypeError(
            f"co_code must be int, got {type(co_code).__name__}={co_code!r}"
        )

    if not rows:
        return []

    out: list[dict[str, Any]] = []
    name = "normalize_financial_line"

    for idx, raw in enumerate(rows):
        if not isinstance(raw, dict):
            logger.warning(
                "%s: skipped row %d for co_code=%d: not a dict (got %s)",
                name, idx, co_code, type(raw).__name__,
            )
            continue

        rid = _coerce_rid(raw.get("RID"))
        if rid is None:
            logger.warning(
                "%s: skipped row %d for co_code=%d: missing/invalid RID "
                "(raw value=%r)",
                name, idx, co_code, raw.get("RID"),
            )
            continue
        # RID=0 is CMOTS's section-divider sentinel — rows like
        # ' Attributable to:', 'EPS:' that visually subhead the statement
        # in the rendered report. They are not data and routinely repeat
        # within a single response (4 RID=0 rows seen in Quarterly_Results_C
        # for RELIANCE alone). Including them would violate the PK
        # (co_code, statement, report, period, rid) and crash the UPSERT.
        # They're skipped silently (DEBUG, not WARNING — this is expected).
        if rid == 0:
            logger.debug(
                "%s: skipped row %d for co_code=%d: RID=0 section-divider "
                "sentinel (label=%r)",
                name, idx, co_code, raw.get("COLUMNNAME"),
            )
            continue

        column_name_raw = raw.get("COLUMNNAME")
        if not isinstance(column_name_raw, str):
            logger.warning(
                "%s: skipped row %d for co_code=%d rid=%d: COLUMNNAME not a "
                "string (got %s)",
                name, idx, co_code, rid, type(column_name_raw).__name__,
            )
            continue
        column_name = column_name_raw.strip()
        if not column_name:
            logger.warning(
                "%s: skipped row %d for co_code=%d rid=%d: empty COLUMNNAME",
                name, idx, co_code, rid,
            )
            continue

        # Period cells.
        for key, value in raw.items():
            if not _PERIOD_KEY_RE.match(key):
                continue  # ignore non-period columns (RID, rowno, COLUMNNAME...)

            period = coerce_period(key[1:])  # 'Y202503' -> 202503
            if period is None:
                continue  # unreachable given regex match, defensive

            val = _to_decimal(value)
            if val is None:
                continue  # skip null/unparseable cells per spec

            out.append({
                "co_code":     co_code,
                "statement":   statement,
                "report":      report,
                "period":      period,
                "rid":         rid,
                "column_name": column_name,
                "value":       val,
            })

    if rows and not out:
        logger.warning(
            "%s: all %d input rows produced zero output cells — possible "
            "data loss (co_code=%d, statement=%s, report=%s)",
            name, len(rows), co_code, statement, report,
        )

    return out


# ─── normalize_narratives — HTML sanitization + body_text extraction ──────


_VALID_DOC_TYPES = frozenset({
    "director_report", "chairman_report", "auditor_report",
    "notes_to_account", "mda",
})

# Pre-pass for sanitization: strip the *content* of these tags entirely
# (not just the opening/closing tags). Bleach's strip=True keeps text
# content of disallowed tags, which means raw `<script>alert(1)</script>`
# becomes text "alert(1)" in body_html, leaks into body_text via the
# tag-strip regex, and ends up in the GIN tsvector index. The pre-pass
# blanks them out before bleach sees them.
_DANGEROUS_TAG_BLOCK_RE = re.compile(
    r"<(script|style|iframe|object|embed|noscript)\b[^>]*>.*?</\1\s*>",
    re.DOTALL | re.IGNORECASE,
)
_DANGEROUS_TAG_SELF_RE = re.compile(
    r"<(script|style|iframe|object|embed|noscript)\b[^>]*/?>",
    re.IGNORECASE,
)

# Per plan §2 — allowlist for body_html bleach.clean. CMOTS narratives use
# a small set of structural tags (<p>, <b>, <table>, <tr>, <td>, ...);
# anything outside this list gets stripped (the tag removed but its inner
# text content preserved by bleach).
_BLEACH_TAGS: list[str] = [
    "p", "b", "i", "u", "br", "div", "span", "font",
    "table", "tr", "td", "th", "thead", "tbody",
    "ul", "ol", "li", "h1", "h2", "h3", "h4",
    "strong", "em",
]
_BLEACH_ATTRS: dict[str, list[str]] = {
    "*": ["style", "colspan", "rowspan", "align"],
}
# CSS allowlist for the `style` attribute (bleach 6 requires explicit
# CSSSanitizer if `style` is in the attribute list; otherwise it warns
# and passes the attribute through unchanged — allowing dangerous CSS).
_CSS_PROPERTIES: list[str] = [
    "color", "background-color",
    "font-weight", "font-style", "font-size", "font-family",
    "text-align", "text-decoration",
    "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
    "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "border", "border-color", "border-style", "border-width",
    "border-top", "border-right", "border-bottom", "border-left",
    "width", "height",
    "vertical-align",
]


def _sanitize_html(raw_html: str) -> str:
    """Two-pass HTML sanitization.

    1. Pre-pass: strip `<script>...</script>` and similar block-tag bodies
       entirely (tag *and* content). Handles case variations and nested
       attacks (`<scr<script>...`).
    2. Bleach: enforce the tag / attribute / CSS-property allowlist;
       strip disallowed tags but keep their (now sanitised) text content.

    Returns the cleaned HTML string. Empty input returns empty string.
    """
    if not raw_html:
        return ""

    import bleach
    from bleach.css_sanitizer import CSSSanitizer

    css_sanitizer = CSSSanitizer(allowed_css_properties=_CSS_PROPERTIES)

    # Pass 1: strip dangerous-tag bodies.
    cleaned = _DANGEROUS_TAG_BLOCK_RE.sub("", raw_html)
    cleaned = _DANGEROUS_TAG_SELF_RE.sub("", cleaned)

    # Pass 2: bleach.
    return bleach.clean(
        cleaned,
        tags=_BLEACH_TAGS,
        attributes=_BLEACH_ATTRS,
        strip=True,
        css_sanitizer=css_sanitizer,
    )


_TAG_STRIP_RE = re.compile(r"<[^>]+>")


def _html_to_text(body_html: str) -> str:
    """Plain text for full-text search.

    Per plan §2, ``body_text`` is produced from the CLEANED HTML, not from
    raw HTML, so any disallowed-tag content already removed in
    ``_sanitize_html`` cannot resurface into the searchable text.
    """
    if not body_html:
        return ""
    return _TAG_STRIP_RE.sub(" ", body_html)


def normalize_narratives(
    rows: list[dict],
    *,
    co_code: int,
    doc_type: str,
    body_field: str,
    year_field: str,
) -> list[dict[str, Any]]:
    """Sanitize narrative HTML rows and extract a plain-text projection.

    Input rows come from the 5 narrative endpoints:
      Director_s_Report / Chairman_s_Report / Auditor_s_Report /
      Notes_toAccount / Management_Discussion

    Each row carries:
      - ``<body_field>``: HTML string (per quirk §8, often 30–80 kB)
      - ``<year_field>``: float year (per quirk §8, coerce to int);
                          may be missing for Notes_toAccount.

    Output row shape (matches ``cmots_narrative`` columns; ``id`` and
    ``fetched_at`` are DB-side defaults, not produced here)::

        {
          "co_code":   int,
          "doc_type":  str,
          "year":      int | None,
          "body_html": str,    # bleach-sanitised (pre-pass + bleach.clean)
          "body_text": str,    # tag-stripped from body_html (NOT raw)
        }

    Idempotency for this table is delete-by-(co_code, doc_type)-then-insert
    (not ON CONFLICT — there's no natural unique constraint per the schema).
    The orchestrator handles that; this normalizer just produces rows.

    Skip-with-warning cases (per-row WARNING log):
      - body_field missing / None
      - body_field present but stripped to empty string

    Silent cases (no warning):
      - year_field missing or unparseable → year=None in output

    Empty input → ``[]``; non-empty input but all skipped → one summary
    WARNING following the same format as the other normalizers.
    """
    if doc_type not in _VALID_DOC_TYPES:
        raise ValueError(
            f"doc_type must be one of {sorted(_VALID_DOC_TYPES)}, got {doc_type!r}"
        )
    if not isinstance(body_field, str) or not body_field:
        raise ValueError(f"body_field must be a non-empty string, got {body_field!r}")
    if not isinstance(year_field, str) or not year_field:
        raise ValueError(f"year_field must be a non-empty string, got {year_field!r}")
    if not isinstance(co_code, int) or isinstance(co_code, bool):
        raise TypeError(
            f"co_code must be int, got {type(co_code).__name__}={co_code!r}"
        )

    if not rows:
        return []

    out: list[dict[str, Any]] = []
    name = "normalize_narratives"

    for idx, raw in enumerate(rows):
        if not isinstance(raw, dict):
            logger.warning(
                "%s: skipped row %d for co_code=%d: not a dict (got %s)",
                name, idx, co_code, type(raw).__name__,
            )
            continue

        body_raw = raw.get(body_field)
        if body_raw is None or not isinstance(body_raw, str) or not body_raw.strip():
            logger.warning(
                "%s: skipped row %d for co_code=%d (%s): empty body field %r",
                name, idx, co_code, doc_type, body_field,
            )
            continue

        # Year is optional metadata — missing / unparseable is silent.
        year_raw = raw.get(year_field)
        year = coerce_period(year_raw) if year_raw is not None else None

        body_html = _sanitize_html(body_raw)
        body_text = _html_to_text(body_html)

        out.append({
            "co_code":   co_code,
            "doc_type":  doc_type,
            "year":      year,
            "body_html": body_html,
            "body_text": body_text,
        })

    if rows and not out:
        logger.warning(
            "%s: all %d input rows skipped — possible data loss "
            "(co_code=%d, doc_type=%s, body_field=%s)",
            name, len(rows), co_code, doc_type, body_field,
        )

    return out


# ─── normalize_shareholding — §7 aggregate extraction ─────────────────────


# Per CMOTS schema §7. Each of the 8 keys may be missing or null on a given
# row; the sum-or-none helper distinguishes "all missing" (-> None,
# preserves the "no data" semantic) from "all present but zero" (-> 0.0,
# preserves the "no institutional holding" semantic).
_DII_FIELDS = (
    "PPIMF", "PPIINS", "PPIBK", "PPIOTH",
    "PPIFBK", "PPIFCOB", "PPIVEN", "PPITRUS",
)
# Custodian/DR per user spec: PCUST + PGDR. (Note: in some CMOTS payloads
# PCUST and PGDR carry identical values — semantically the GDR holdings
# are held BY the custodian, so summing is the user's documented choice.
# We follow the spec; if a future scope-creep change wants single-counted,
# revise here and bump tests.)
_CUSTODIAN_FIELDS = ("PCUST", "PGDR")


def _sum_present_or_none(raw: dict, keys: tuple[str, ...]) -> float | None:
    """Sum values for ``keys`` that are present and parseable in ``raw``.

    Returns ``None`` if **all** keys are missing/null/unparseable
    (distinguishing "no data" from "all zero"). Returns ``0.0`` if all
    keys are present-and-zero.
    """
    contributions: list[float] = []
    for k in keys:
        v = _to_decimal(raw.get(k))
        if v is not None:
            contributions.append(v)
    return float(sum(contributions)) if contributions else None


def _residual_or_none(
    nonpromoter: float | None,
    *contributors: float | None,
) -> float | None:
    """Compute ``nonpromoter - sum(contributors)``.

    If ``nonpromoter`` is None OR any contributor is None, returns None —
    a residual computed against an unknown summand is unreliable. Public
    pct can otherwise be slightly negative or slightly above 100; we
    don't clamp.
    """
    if nonpromoter is None:
        return None
    if any(c is None for c in contributors):
        return None
    return float(nonpromoter - sum(contributors))


def normalize_shareholding(rows: list[dict]) -> list[dict[str, Any]]:
    """Extract per-quarter shareholding aggregates per CMOTS schema §7.

    Input rows come from ``Share_Holding_Pattern_Detailed``. Each row has
    ~163 columns and represents one quarter (``YRC`` is the period code,
    YYYYMM integer).

    Output row shape (matches ``cmots_shareholding`` columns)::

        {
          "co_code":                int,
          "yrc":                    int,
          "promoter_pct":           float,
          "promoter_pledge_pct":    float | None,
          "fii_pct":                float | None,
          "dii_pct":                float | None,
          "govt_pct":               float | None,
          "custodian_pct":          float | None,
          "public_pct":             float | None,   # nonpromoter − (fii+dii+govt+custodian)
          "total_shares":           int | None,
          "total_promoter_shares":  int | None,
          "total_pledged_shares":   int | None,
          "n_shareholders":         int | None,
          "raw_json":               dict,
        }

    Aggregate formulas (exact, per §7 / user spec):
      - ``promoter_pct``           = ``TotalPromoter_PerShares``
      - ``promoter_pledge_pct``    = ``TotalPromoter_PerPledgeShares``
      - ``fii_pct``                = ``PPIFII``
      - ``dii_pct``                = sum(``PPIMF, PPIINS, PPIBK, PPIOTH,
                                          PPIFBK, PPIFCOB, PPIVEN, PPITRUS``)
                                     — None iff all 8 missing
      - ``govt_pct``               = ``PPIGOVT``
      - ``custodian_pct``          = ``PCUST + PGDR``
      - ``public_pct``             = ``TotalNonPromoter_PerShares`` −
                                     (``fii_pct + dii_pct + govt_pct + custodian_pct``)
      - ``total_shares``           = ``Total_Promoter_NonPromoter_Shares``
                                     (fallback: ``TotalPromoter_Shares + TotalNonPromoter_Shares``)
      - ``total_promoter_shares``  = ``TotalPromoter_Shares``
      - ``total_pledged_shares``   = ``TotalPromoter_PledgeShares``
      - ``n_shareholders``         = ``Total_NoofShareholders``

    Quirks honoured:
      §11.3  ``NPFSUBTOT`` is a SHARES count, not a percent. The promoter
             percentage is ``TotalPromoter_PerShares``. NPFSUBTOT flows
             through to ``raw_json`` untouched but never participates in
             any percent aggregate.
      §11.10 ``YRC`` may be float (e.g. ``202603.0``). ``coerce_period``
             handles the int coercion.

    Skip-with-warning cases (per-row WARNING log):
      - ``co_code`` missing or unparseable
      - ``YRC`` missing or unparseable
      - ``TotalPromoter_PerShares`` missing or unparseable (the one
        non-optional aggregate — every shareholding row must have it)
    """
    if not rows:
        return []

    out: list[dict[str, Any]] = []
    name = "normalize_shareholding"

    for idx, raw in enumerate(rows):
        if not isinstance(raw, dict):
            logger.warning(
                "%s: skipped row %d for co_code=?: not a dict (got %s)",
                name, idx, type(raw).__name__,
            )
            continue

        cc = coerce_co_code(raw.get("co_code"))
        if cc is None:
            logger.warning(
                "%s: skipped row %d for co_code=None: missing/invalid co_code "
                "(raw value=%r)",
                name, idx, raw.get("co_code"),
            )
            continue

        yrc = coerce_period(raw.get("YRC"))
        if yrc is None:
            logger.warning(
                "%s: skipped row %d for co_code=%d: missing/invalid YRC "
                "(raw value=%r)",
                name, idx, cc, raw.get("YRC"),
            )
            continue

        promoter_pct = _to_decimal(raw.get("TotalPromoter_PerShares"))
        if promoter_pct is None:
            logger.warning(
                "%s: skipped row %d for co_code=%d yrc=%d: missing "
                "TotalPromoter_PerShares (the required aggregate)",
                name, idx, cc, yrc,
            )
            continue

        # Optional aggregates.
        promoter_pledge_pct = _to_decimal(raw.get("TotalPromoter_PerPledgeShares"))
        nonpromoter_pct     = _to_decimal(raw.get("TotalNonPromoter_PerShares"))
        fii_pct             = _to_decimal(raw.get("PPIFII"))
        dii_pct             = _sum_present_or_none(raw, _DII_FIELDS)
        govt_pct            = _to_decimal(raw.get("PPIGOVT"))
        custodian_pct       = _sum_present_or_none(raw, _CUSTODIAN_FIELDS)
        public_pct          = _residual_or_none(
            nonpromoter_pct, fii_pct, dii_pct, govt_pct, custodian_pct,
        )

        # Share-count fields. Prefer direct grand total, fall back to sum
        # of promoter + non-promoter shares.
        total_shares = _to_decimal(raw.get("Total_Promoter_NonPromoter_Shares"))
        if total_shares is None:
            promoter_shares    = _to_decimal(raw.get("TotalPromoter_Shares"))
            nonpromoter_shares = _to_decimal(raw.get("TotalNonPromoter_Shares"))
            if promoter_shares is not None and nonpromoter_shares is not None:
                total_shares = promoter_shares + nonpromoter_shares

        total_promoter_shares = _to_decimal(raw.get("TotalPromoter_Shares"))
        total_pledged_shares  = _to_decimal(raw.get("TotalPromoter_PledgeShares"))
        n_shareholders        = _to_decimal(raw.get("Total_NoofShareholders"))

        # Share-count columns are BIGINT in the schema; coerce float -> int
        # at the boundary (data preserved, type just stored cleanly).
        def _to_int(v):
            return int(v) if v is not None else None

        out.append({
            "co_code":                cc,
            "yrc":                    yrc,
            "promoter_pct":           promoter_pct,
            "promoter_pledge_pct":    promoter_pledge_pct,
            "fii_pct":                fii_pct,
            "dii_pct":                dii_pct,
            "govt_pct":               govt_pct,
            "custodian_pct":          custodian_pct,
            "public_pct":             public_pct,
            "total_shares":           _to_int(total_shares),
            "total_promoter_shares":  _to_int(total_promoter_shares),
            "total_pledged_shares":   _to_int(total_pledged_shares),
            "n_shareholders":         _to_int(n_shareholders),
            "raw_json":               raw,
        })

    if rows and not out:
        logger.warning(
            "%s: all %d input rows skipped — possible data loss",
            name, len(rows),
        )

    return out


# ─── normalize_corporate_actions — N source endpoints → 1 target table ──


# Sentinel lower bound: corp actions before 1980 are placeholder values
# (1900-01-01, 0001-01-01 etc.) that CMOTS uses for "no real date."
_CORP_ACTION_MIN_YEAR = 1980


def _parse_action_date(value: Any) -> datetime.date | None:
    """Parse an action_date field to ``datetime.date`` or ``None``.

    Inputs observed in the wild (per step (e) inspection):
      - ``"2025-08-14T00:00:00"`` (ISO datetime, no timezone) — standard
      - ``"2025-08-14"`` (ISO date)
      - ``None`` / missing
      - sentinel placeholders ("1900-01-01T00:00:00", "0001-01-01T00:00:00")

    Returns ``None`` for anything that won't parse cleanly, or for dates
    strictly before ``_CORP_ACTION_MIN_YEAR`` (1980) — those are CMOTS
    placeholders for "no real date." The caller skips the row.
    """
    if value is None:
        return None
    if isinstance(value, datetime.datetime):
        d = value.date()
    elif isinstance(value, datetime.date):
        d = value
    elif isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        try:
            # fromisoformat in Python 3.11+ handles "YYYY-MM-DDTHH:MM:SS"
            # and "YYYY-MM-DD" both.
            dt = datetime.datetime.fromisoformat(s)
            d = dt.date()
        except ValueError:
            return None
    else:
        return None

    if d.year < _CORP_ACTION_MIN_YEAR:
        return None
    return d


def normalize_corporate_actions(
    rows: list[dict],
    *,
    source_slug: str,
    action_type: str,
    date_field: str,
    covered_co_codes: frozenset[int] | None = None,
) -> list[dict[str, Any]]:
    """Normalize per-ticker corporate-action rows for ``cmots_corporate_action``.

    14 corp-action endpoints map to this one normalizer:
      - 10 per-ticker slugs (PK scope ['co_code', 'source_slug']):
        Dividend, AGM, Board_Meetings, Rights, Split_of_Face_Value, EGM,
        Book_Closure, Merger_Demergers, Bonus, Buy_Back.
      - 4 universe-wide slugs (DELETE scope ['source_slug'] — one call
        returns rows for many tickers):
        OFS, Change_Of_Name, DeListed, Forthcoming_Corporate_Actions.

    4 truly-aggregate endpoints (Month_Year_Wise_Count, Eventdatewisedetails,
    corp_action_WKMonth_details, Eventdatewisecount) remain skipped — they
    summarize events the per-ticker / universe-wide feeds already carry.
    See TODO_CMOTS.md.

    Output row shape (matches ``cmots_corporate_action`` non-default columns;
    ``id`` is BIGSERIAL default)::

        {
          "co_code":     int,
          "action_type": str,             # 'dividend', 'agm', 'board_meeting', ...
          "action_date": datetime.date | None,
          "payload":     dict,            # the full original input row
          "source_slug": str,             # 'Dividend', 'AGM', ...
        }

    Idempotency for this table is delete-by-(co_code, source_slug)-then-
    insert via ``replace_normalized_rows`` — there's no natural PK to
    UPSERT on. The orchestrator handles that; this normalizer just
    produces rows.

    Skip-with-warning cases (per-row WARNING log):
      - ``co_code`` missing / unparseable
      - ``action_date`` missing, malformed, or sentinel (pre-1980 dates
        like the "1900-01-01" placeholder are treated as missing)

    The entire input row is preserved verbatim in ``payload``, so the
    frontend can show action-type-specific fields (divamount, gmdate,
    venue, etc.) without us writing 14 specialized accessors.

    Args:
        rows: list of dicts from the unwrapped 'data' field
        source_slug: the registry slug for this endpoint ('Dividend',
            'AGM', etc.) — stored as-is in the output and used by the
            orchestrator for DELETE-then-INSERT scope.
        action_type: canonical short label ('dividend', 'agm', 'bonus', etc.)
        date_field: the payload key carrying the action's canonical date
            (e.g. 'divdate' for Dividend, 'gmdate' for AGM, 'bmdate' for
            Board_Meetings).
        covered_co_codes: optional set of co_codes for which we have a
            ``tickers`` row. Universe-wide feeds (OFS, Change_Of_Name,
            DeListed, Forthcoming_Corporate_Actions) return rows for the
            entire NSE/BSE universe — many of which are tickers we don't
            sync. Inserting them violates the FK on
            ``cmots_corporate_action.co_code → tickers(co_code)``. When
            this kwarg is provided, rows whose ``co_code`` is NOT in the
            set are dropped silently (NO warning — high-volume by design).
            Per-ticker dispatch entries leave this ``None``, since their
            co_code is by definition a covered ticker.
    """
    if not isinstance(source_slug, str) or not source_slug:
        raise ValueError(f"source_slug must be a non-empty string, got {source_slug!r}")
    if not isinstance(action_type, str) or not action_type:
        raise ValueError(f"action_type must be a non-empty string, got {action_type!r}")
    if not isinstance(date_field, str) or not date_field:
        raise ValueError(f"date_field must be a non-empty string, got {date_field!r}")

    if not rows:
        return []

    out: list[dict[str, Any]] = []
    name = "normalize_corporate_actions"
    n_skipped_bad_data = 0
    n_filtered_out = 0

    for idx, raw in enumerate(rows):
        if not isinstance(raw, dict):
            logger.warning(
                "%s: skipped row %d for co_code=? (%s): not a dict (got %s)",
                name, idx, source_slug, type(raw).__name__,
            )
            n_skipped_bad_data += 1
            continue

        # CMOTS casing is inconsistent across endpoints — some use lower
        # 'co_code' (Dividend, AGM, ...), others upper 'CO_CODE' (DeListed).
        # Try lower first (common), fall back to upper.
        cc_raw = raw.get("co_code")
        if cc_raw is None:
            cc_raw = raw.get("CO_CODE")
        cc = coerce_co_code(cc_raw)
        if cc is None:
            logger.warning(
                "%s: skipped row %d for co_code=None (%s): missing/invalid co_code "
                "(raw value=%r)",
                name, idx, source_slug, cc_raw,
            )
            n_skipped_bad_data += 1
            continue

        if covered_co_codes is not None and cc not in covered_co_codes:
            # Universe-wide feed; ticker outside our covered set. Silent drop
            # (NO warning — this is high-volume expected behavior, e.g.
            # Forthcoming_Corporate_Actions returns 1,142 rows for ~1,121
            # tickers across the whole universe).
            n_filtered_out += 1
            continue

        action_date = _parse_action_date(raw.get(date_field))
        if action_date is None:
            logger.warning(
                "%s: skipped row %d for co_code=%d (%s): missing/invalid/sentinel "
                "%s (raw value=%r)",
                name, idx, cc, source_slug, date_field, raw.get(date_field),
            )
            n_skipped_bad_data += 1
            continue

        out.append({
            "co_code":     cc,
            "action_type": action_type,
            "action_date": action_date,
            "payload":     raw,
            "source_slug": source_slug,
        })

    # Data-loss warning fires only when bad-data skips left output empty.
    # If we got input rows and ALL were filter-drops, that's expected
    # behavior for universe-wide feeds — don't warn.
    if n_skipped_bad_data > 0 and not out:
        logger.warning(
            "%s: all %d input rows skipped due to bad data — possible data "
            "loss (source_slug=%s, action_type=%s, date_field=%s, filtered_out=%d)",
            name, n_skipped_bad_data, source_slug, action_type, date_field,
            n_filtered_out,
        )

    return out


# ─── BSE / NSE corporate announcements ──────────────────────────────────────


# Plan §9.4 agency list. Order matters for canonical casing — first match
# wins on collision (no overlap in practice; names are distinctive).
AGENCIES: tuple[str, ...] = (
    "CRISIL", "ICRA", "CARE", "India Ratings", "Brickwork",
    "Acuite", "SMERA", "Fitch", "Moody", "S&P",
)
_AGENCY_RE = re.compile(
    r"\b(?:" + "|".join(re.escape(a) for a in AGENCIES) + r")\b",
    re.IGNORECASE,
)
# Indian long-term credit-rating scale (AAA..D, with +/- modifiers).
#
# Boundary checks: NOT preceded by an alphanumeric (rejects 'GAAA') and
# NOT followed by a letter/digit (rejects 'A Limited', 'DDoS', 'B2C'). The
# trailing class includes lowercase so 'AaA' is not mistaken for a rating.
# Case-sensitive on purpose — Indian rating notation is always uppercase;
# lowercase letters are part of ordinary prose.
#
# Bare single-letter A / B / C are intentionally excluded — those tokens
# appear constantly in English prose (the article "A", list labels, etc.)
# and the proximity check alone cannot distinguish "A separate report"
# from a rating of "A". Bare D is kept because it rarely occurs as a
# standalone word in announcements. A+ / A- / B+ / B- still match — the
# modifier disambiguates. If a bare "A"-rated downgrade legitimately
# appears without a +/- modifier (rare in practice), the agency name and
# the word "rating" / "downgrade" / etc. will still be present, but
# extraction will under-report rather than producing false positives.
_RATING_RE = re.compile(
    r"(?<![A-Z0-9])"
    r"(AAA|AA[+-]?|A[+-]|BBB[+-]?|BB[+-]?|B[+-]|CCC|CC|D)"
    r"(?![A-Za-z0-9])"
)
# Plan §9.4: agency and rating must occur within this many chars in the
# joined caption+memo text. Larger windows produce false positives where
# a rating reference at the bottom of a press release matches an agency
# mentioned at the top.
_AGENCY_RATING_MAX_DISTANCE = 200


def _canonical_agency(matched: str) -> str:
    """Return the AGENCIES-tuple casing for an arbitrary-case match."""
    up = matched.upper()
    for a in AGENCIES:
        if a.upper() == up:
            return a
    return matched  # unreachable in practice


def _extract_agency_rating(
    caption: str | None,
    memo: str | None,
) -> tuple[str | None, str | None]:
    """Find (agency, rating) when both appear within 200 chars in caption+memo.

    Joins ``caption`` and ``memo`` with a single space (so a rating at the
    end of caption can still pair with an agency at the start of memo).
    Runs two regex passes (agency names, rating tokens) and picks the
    closest agency-rating pair by absolute start-position distance, as
    long as it's within ``_AGENCY_RATING_MAX_DISTANCE``.

    Returns ``(None, None)`` when no in-range pair exists. Agency casing
    is normalized to the canonical form from ``AGENCIES``; rating casing
    is whatever the (case-sensitive) regex matched.
    """
    text = ((caption or "") + " " + (memo or "")).strip()
    if not text:
        return None, None

    agency_hits = [(m.start(), m.group()) for m in _AGENCY_RE.finditer(text)]
    if not agency_hits:
        return None, None

    rating_hits = [(m.start(), m.group(1)) for m in _RATING_RE.finditer(text)]
    if not rating_hits:
        return None, None

    best_distance: int | None = None
    best_agency: str | None = None
    best_rating: str | None = None

    for a_pos, a_match in agency_hits:
        for r_pos, r_token in rating_hits:
            d = abs(a_pos - r_pos)
            if d > _AGENCY_RATING_MAX_DISTANCE:
                continue
            if best_distance is None or d < best_distance:
                best_distance = d
                best_agency = _canonical_agency(a_match)
                best_rating = r_token

    return best_agency, best_rating


def _parse_announcement_datetime(value: Any) -> datetime.datetime | None:
    """Parse announcement_date to ``datetime.datetime`` (TIMESTAMPTZ-bound)
    or ``None``.

    Unlike ``_parse_action_date`` this preserves time-of-day and has NO
    sentinel filter — announcements are recent by nature, and the
    timeline UI wants minute-level ordering. Null/unparseable input
    returns ``None`` and the row is still preserved (caption/memo carry
    the searchable content).
    """
    if value is None:
        return None
    if isinstance(value, datetime.datetime):
        return value
    if isinstance(value, datetime.date):
        return datetime.datetime(value.year, value.month, value.day)
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        try:
            return datetime.datetime.fromisoformat(s)
        except ValueError:
            return None
    return None


def normalize_announcements(
    rows: list[dict],
    *,
    source: str,
    covered_co_codes: frozenset[int] | None = None,
) -> list[dict[str, Any]]:
    """Normalize BSE/NSE corporate announcements for ``cmots_announcement``.

    Two endpoints (BSE_Announcement, NSE_Announcement) map here. Both are
    universe-wide — one call returns rows for many tickers. Idempotency
    scope is ``["source"]`` (the orchestrator wipes-and-replaces the
    entire BSE or NSE feed each sync).

    Per-row processing:
      - ``co_code`` coerced via ``coerce_co_code`` (BSE delivers it as
        ``float``, per quirk §11.9; row dropped + WARNING if missing).
      - If ``covered_co_codes`` is provided, rows whose co_code is NOT
        in the set are dropped silently (NO warning). This filter is
        plan §5 — we only attach announcements to tickers we sync data
        for. Silent drop is correct because universe-wide feeds carry
        thousands of rows for tickers we don't cover; warning on each
        would flood logs and would not be data loss.
      - ``announcement_date`` parsed to ``datetime.datetime`` (TIMESTAMPTZ).
        Null/unparseable → ``None``; the row is preserved so caption/memo
        still appear in the timeline (without an ordering anchor).
      - Credit-rating extraction: ``agency``/``rating`` are filled when
        an AGENCIES name and a rating token occur within 200 chars of
        each other in ``caption + memo`` (plan §9.4). Otherwise both
        are ``None``.

    Schema differences across sources:
      - BSE rows carry ``descriptor`` and ``typeofannouncement`` (map to
        the ``descriptor`` and ``type`` columns respectively).
      - NSE rows carry ``subject`` but no descriptor/typeofannouncement —
        ``descriptor`` / ``type`` are set to ``None`` for NSE. The
        ``subject`` value is preserved inside the raw cache row, not
        copied to a dedicated column (the orchestrator keeps raw rows).

    Output row shape (matches ``cmots_announcement`` non-default columns;
    ``id`` is BIGSERIAL default)::

        {
          "co_code":           int,
          "source":            str,                       # 'BSE' or 'NSE'
          "caption":           str | None,
          "memo":              str | None,
          "descriptor":        str | None,                # BSE-only
          "type":              str | None,                # BSE-only
          "announcement_date": datetime.datetime | None,  # TIMESTAMPTZ
          "file_url":          str | None,
          "agency":            str | None,                # extracted
          "rating":            str | None,                # extracted
        }

    Args:
        rows: list of dicts from the unwrapped 'data' field.
        source: 'BSE' or 'NSE' — stored verbatim in ``source`` column and
            used by the orchestrator for DELETE-then-INSERT scope.
        covered_co_codes: optional set of co_codes we sync data for.
            ``None`` (default) = no filtering (every row with a valid
            co_code is kept). The sync orchestrator passes the actual
            covered set at call time.
    """
    if not isinstance(source, str) or source not in ("BSE", "NSE"):
        raise ValueError(f"source must be 'BSE' or 'NSE', got {source!r}")

    if not rows:
        return []

    name = "normalize_announcements"
    out: list[dict[str, Any]] = []
    n_skipped_bad_data = 0
    n_filtered_out = 0

    for idx, raw in enumerate(rows):
        if not isinstance(raw, dict):
            logger.warning(
                "%s: skipped row %d for co_code=? (%s): not a dict (got %s)",
                name, idx, source, type(raw).__name__,
            )
            n_skipped_bad_data += 1
            continue

        cc_raw = raw.get("co_code")
        if cc_raw is None:
            cc_raw = raw.get("CO_CODE")
        cc = coerce_co_code(cc_raw)
        if cc is None:
            logger.warning(
                "%s: skipped row %d for co_code=None (%s): missing/invalid "
                "co_code (raw value=%r)",
                name, idx, source, cc_raw,
            )
            n_skipped_bad_data += 1
            continue

        if covered_co_codes is not None and cc not in covered_co_codes:
            # Plan §5: silent drop — uncovered tickers don't appear in the
            # hot-path table. NO warning (this is high-volume by design).
            n_filtered_out += 1
            continue

        caption = raw.get("caption")
        memo = raw.get("memo")
        agency, rating = _extract_agency_rating(caption, memo)

        out.append({
            "co_code":           cc,
            "source":            source,
            "caption":           caption,
            "memo":              memo,
            "descriptor":        raw.get("descriptor"),         # BSE-only
            "type":              raw.get("typeofannouncement"), # BSE-only
            "announcement_date": _parse_announcement_datetime(raw.get("date")),
            "file_url":          raw.get("fileurl"),
            "agency":            agency,
            "rating":            rating,
        })

    # Data-loss warning fires only when bad-data skips left us empty.
    # If we got input rows and ALL were filter-drops, that's expected
    # behavior, not data loss — don't warn.
    if n_skipped_bad_data > 0 and not out:
        logger.warning(
            "%s: all %d input rows skipped due to bad data — possible data "
            "loss (source=%s, filtered_out=%d)",
            name, n_skipped_bad_data, source, n_filtered_out,
        )

    return out


# ─── Company extended (fan-in: 5 endpoints → 1 row) ────────────────────────


def _coerce_year(value: Any) -> int | None:
    """Coerce INC_DT-style year to int, or None.

    CMOTS delivers incorporation year as a string ('1973') in Company_Profile,
    but defensively we also accept int / int-string forms. Sentinel placeholder
    years (0001..1799) are rejected because CMOTS stores '1900' / '0001' for
    "unknown" — those would mislead UI elements like "company founded N years
    ago" badges.
    """
    if value is None:
        return None
    try:
        if isinstance(value, bool):
            return None
        if isinstance(value, str):
            s = value.strip()
            if not s:
                return None
            year = int(s)
        elif isinstance(value, int):
            year = value
        elif isinstance(value, float):
            if math.isnan(value) or math.isinf(value):
                return None
            year = int(value)
        else:
            return None
    except (ValueError, TypeError):
        return None
    # Sentinel filter — same spirit as _CORP_ACTION_MIN_YEAR but stricter
    # since incorporation years should be modern era.
    if year < 1800 or year > 2100:
        return None
    return year


def _join_address(*parts: Any) -> str | None:
    """Join address lines with ', ', dropping blanks and whitespace-only.

    Per design call: comma + space (HTML/JSON friendly). Returns ``None``
    when every line is blank/missing, so the column is NULL in PG rather
    than an empty string.
    """
    cleaned: list[str] = []
    for p in parts:
        if isinstance(p, str):
            s = p.strip()
            if s:
                cleaned.append(s)
    return ", ".join(cleaned) if cleaned else None


def normalize_company_extended(
    rows_by_slug: dict[str, list[dict]],
) -> dict[str, Any] | None:
    """Fan-in: merge 5 source endpoints into one ``cmots_company_extended`` row.

    Unlike the other normalizers (one-endpoint, list-out), this takes a
    dict mapping endpoint slug → its row list and emits a single merged
    dict (or ``None`` if Company_Profile is missing / its co_code is
    unparseable). The orchestrator invokes this inline, not via
    ``NORMALIZER_DISPATCH`` — there's exactly one fan-in case in the
    project, so abstracting a parallel dispatch table would be premature.

    Sources:
      - ``Company_Profile`` — 1 row per ticker. Source of all scalar
        columns and the canonical ``co_code``.
      - ``Board_Of_Directors`` — N rows. Stored as-is into
        ``directors_json``; **API delivery order is preserved**
        (do NOT re-sort by ``slno`` — CMOTS already orders, and gaps
        in slno are real, e.g. ITC starts at slno=2).
      - ``Bankers`` — N rows → ``bankers_json``.
      - ``Subsidiaries_JVs_Collaborations`` — N rows → ``subsidiaries_json``.
      - ``Locations`` — N rows → ``locations_json``.

    Field name evidence (probed against dev-DB Company_Profile rows
    2026-05-14):
      - ``REGADD1`` / ``REGADD2`` (no underscore) — company REGISTERED
        office address. Distinct from ``REG_ADD1..4`` which is the
        REGISTRAR's address (paired with REG_NAME, REG_TEL, etc.).
      - ``ho_add1`` / ``ho_add2`` / ``ho_add3`` (lowercase + underscore) —
        head office. 3 lines.
      - ``co_add1`` / ``co_add2`` / ``co_add3`` (lowercase + underscore) —
        corporate office. Note ``co_add`` is corporate-office address, NOT
        related to ``CO_CODE`` (company code).
      - ``INC_DT`` is a string ('1973'), not an int.

    Column mapping (matches migration 032 ``cmots_company_extended``)::

        chairman              ← CHAIRMAN
        auditor               ← AUDITOR
        company_secretary     ← CO_SEC
        registrar             ← REG_NAME
        registered_office     ← REGADD1 + REGADD2          (', '-joined)
        head_office           ← ho_add1+ho_add2+ho_add3    (', '-joined)
        corporate_office      ← co_add1+co_add2+co_add3    (', '-joined)
        website               ← INTERNET
        incorporation_year    ← INC_DT (str → int, sentinel-filtered)
        directors_json        ← Board_Of_Directors rows  (JSONB list)
        bankers_json          ← Bankers rows             (JSONB list)
        subsidiaries_json     ← Subsidiaries_JVs_Collaborations rows
        locations_json        ← Locations rows           (JSONB list)

    Returns:
        dict ready for ``upsert_normalized_rows(... conflict_keys=['co_code'])``,
        OR ``None`` when Company_Profile is missing / empty / has an
        unparseable CO_CODE. Empty list-of-rows for any of the 4 child
        endpoints maps to an empty JSONB list ``[]``, never NULL — so the
        frontend always sees an iterable.
    """
    name = "normalize_company_extended"

    profile_rows = rows_by_slug.get("Company_Profile") or []
    if not profile_rows:
        logger.warning("%s: Company_Profile missing/empty — skipping fan-in", name)
        return None

    profile = profile_rows[0]
    if not isinstance(profile, dict):
        logger.warning(
            "%s: Company_Profile first row is %s, not a dict — skipping fan-in",
            name, type(profile).__name__,
        )
        return None

    cc = coerce_co_code(profile.get("CO_CODE"))
    if cc is None:
        logger.warning(
            "%s: Company_Profile.CO_CODE missing/unparseable (raw=%r) — "
            "skipping fan-in", name, profile.get("CO_CODE"),
        )
        return None

    return {
        "co_code":            cc,
        "chairman":           profile.get("CHAIRMAN"),
        "auditor":            profile.get("AUDITOR"),
        "company_secretary":  profile.get("CO_SEC"),
        "registrar":          profile.get("REG_NAME"),
        "registered_office":  _join_address(
            profile.get("REGADD1"), profile.get("REGADD2"),
        ),
        "head_office":        _join_address(
            profile.get("ho_add1"), profile.get("ho_add2"), profile.get("ho_add3"),
        ),
        "corporate_office":   _join_address(
            profile.get("co_add1"), profile.get("co_add2"), profile.get("co_add3"),
        ),
        "website":            profile.get("INTERNET"),
        "incorporation_year": _coerce_year(profile.get("INC_DT")),
        # Preserve API delivery order — slno can have gaps (e.g. ITC starts
        # at slno=2), and CMOTS already returns rows in canonical order.
        # An empty list is the right default — the frontend always gets an
        # iterable to render.
        "directors_json":     list(rows_by_slug.get("Board_Of_Directors") or []),
        "bankers_json":       list(rows_by_slug.get("Bankers") or []),
        "subsidiaries_json":  list(rows_by_slug.get("Subsidiaries_JVs_Collaborations") or []),
        "locations_json":     list(rows_by_slug.get("Locations") or []),
    }


# ─── UPSERT helper ──────────────────────────────────────────────────────────


def replace_normalized_rows(
    cur,
    table_name: str,
    rows: list[dict],
    *,
    scope: dict[str, Any],
) -> int:
    """DELETE-then-INSERT idempotency helper for id-keyed tables.

    Used for ``cmots_narrative``, ``cmots_corporate_action``, and
    ``cmots_announcement`` (and similar) — tables whose natural identity
    is implicit (no UNIQUE constraint on a co_code+something pair), so
    ``ON CONFLICT`` doesn't apply. Instead we delete every existing row
    matching ``scope`` (typically ``{"co_code": ..., "doc_type": ...}``
    for narratives) and then bulk-INSERT the new set.

    Args:
        cur: psycopg2 cursor.
        table_name: target table.
        rows: list of dicts to insert (may be empty; the DELETE still runs).
        scope: dict of column-name -> value selecting which existing rows
               to replace. All scope columns are AND'd together.

    Returns the number of rows inserted (deletion count not reported —
    caller can SELECT it before/after if needed).
    """
    if not scope:
        raise ValueError("scope must be non-empty; refusing to truncate table")

    from psycopg2.extras import Json, execute_values

    where_clauses = " AND ".join(f"{col} = %s" for col in scope.keys())
    cur.execute(
        f"DELETE FROM {table_name} WHERE {where_clauses}",
        list(scope.values()),
    )

    if not rows:
        return 0

    columns = list(rows[0].keys())

    def serialise(v: Any) -> Any:
        # JSONB columns: psycopg2 needs Json() for both dict and list shapes
        # (a Python list of dicts maps to a JSONB array). Bare lists at
        # column level are only used by the fan-in normalizer
        # (``normalize_company_extended``); no other current normalizer
        # passes a list as a column value.
        if isinstance(v, (dict, list)):
            return Json(v)
        return v

    values = [tuple(serialise(r[c]) for c in columns) for r in rows]
    sql = f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES %s"
    execute_values(cur, sql, values, page_size=max(len(rows) + 1, 256))
    return len(rows)


def upsert_normalized_rows(
    cur,
    table_name: str,
    rows: list[dict],
    *,
    conflict_keys: list[str],
) -> int:
    """UPSERT a batch of normalized rows into ``table_name``.

    Columns are auto-derived from the first row's keys (every row must
    share the same key set). Page size is set just above the row count so
    cursor rowcount reflects the total INSERT.

    Returns the input row count (not the DB rowcount — DB rowcount counts
    UPDATE + INSERT, which equals input size for a clean batch).
    """
    if not rows:
        return 0

    from psycopg2.extras import Json, execute_values

    columns = list(rows[0].keys())
    update_cols = [c for c in columns if c not in conflict_keys]

    def serialise(v: Any) -> Any:
        # JSONB columns: dict OR list shape (the fan-in normalizer emits
        # lists for directors_json / bankers_json / etc.).
        if isinstance(v, (dict, list)):
            return Json(v)
        return v

    values = [tuple(serialise(r[c]) for c in columns) for r in rows]

    set_clause = ", ".join(f"{c}=EXCLUDED.{c}" for c in update_cols)
    sql = (
        f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES %s "
        f"ON CONFLICT ({', '.join(conflict_keys)}) DO UPDATE SET {set_clause}"
    )
    execute_values(cur, sql, values, page_size=max(len(rows) + 1, 256))
    return len(rows)


# ─── Dispatch table ─────────────────────────────────────────────────────────


# (normalizer_fn, kwargs to pass, target_table, conflict_keys)
# As each normalizer is written, add its entries here. Sync orchestrator
# integration (a later step) reads this table to route fetched rows to
# the right normalizer + UPSERT path.
NORMALIZER_DISPATCH: dict[str, tuple[Callable, dict, str, list[str]]] = {
    "Yearly_Ratio_S": (
        normalize_ratios,
        {"statement": "S", "period_field": "yearend"},
        "cmots_ratio_yearly",
        ["co_code", "statement", "yearend"],
    ),
    "Yearly_Ratio_C": (
        normalize_ratios,
        {"statement": "C", "period_field": "yearend"},
        "cmots_ratio_yearly",
        ["co_code", "statement", "yearend"],
    ),
    "Quarterly_Ratio_S": (
        normalize_ratios,
        {"statement": "S", "period_field": "qtrend"},
        "cmots_ratio_quarterly",
        ["co_code", "statement", "qtrend"],
    ),
    "Quarterly_Ratio_C": (
        normalize_ratios,
        {"statement": "C", "period_field": "qtrend"},
        "cmots_ratio_quarterly",
        ["co_code", "statement", "qtrend"],
    ),
    # ── Financial-line endpoints (14) ───────────────────────────────────────
    # NB: ``co_code`` is NOT in the kwargs here — it's provided per-call by
    # the orchestrator (the URL parameter at fetch time). The orchestrator's
    # call site is: ``fn(rows, co_code=cc, **dispatch_kwargs)``.
    "Profit_and_Loss_S": (
        normalize_financial_line,
        {"statement": "S", "report": "pnl"},
        "cmots_financial_line",
        ["co_code", "statement", "report", "period", "rid"],
    ),
    "Profit_and_Loss_C": (
        normalize_financial_line,
        {"statement": "C", "report": "pnl"},
        "cmots_financial_line",
        ["co_code", "statement", "report", "period", "rid"],
    ),
    "Balance_Sheet_S": (
        normalize_financial_line,
        {"statement": "S", "report": "bs"},
        "cmots_financial_line",
        ["co_code", "statement", "report", "period", "rid"],
    ),
    "Balance_Sheet_C": (
        normalize_financial_line,
        {"statement": "C", "report": "bs"},
        "cmots_financial_line",
        ["co_code", "statement", "report", "period", "rid"],
    ),
    "Cash_Flow_S": (
        normalize_financial_line,
        {"statement": "S", "report": "cf"},
        "cmots_financial_line",
        ["co_code", "statement", "report", "period", "rid"],
    ),
    "Cash_Flow_C": (
        normalize_financial_line,
        {"statement": "C", "report": "cf"},
        "cmots_financial_line",
        ["co_code", "statement", "report", "period", "rid"],
    ),
    "Quarterly_Results_S": (
        normalize_financial_line,
        {"statement": "S", "report": "quarter"},
        "cmots_financial_line",
        ["co_code", "statement", "report", "period", "rid"],
    ),
    "Quarterly_Results_C": (
        normalize_financial_line,
        {"statement": "C", "report": "quarter"},
        "cmots_financial_line",
        ["co_code", "statement", "report", "period", "rid"],
    ),
    "Yearly_Results_S": (
        normalize_financial_line,
        {"statement": "S", "report": "year"},
        "cmots_financial_line",
        ["co_code", "statement", "report", "period", "rid"],
    ),
    "Yearly_Results_C": (
        normalize_financial_line,
        {"statement": "C", "report": "year"},
        "cmots_financial_line",
        ["co_code", "statement", "report", "period", "rid"],
    ),
    "Half_Yearly_Results_S": (
        normalize_financial_line,
        {"statement": "S", "report": "half"},
        "cmots_financial_line",
        ["co_code", "statement", "report", "period", "rid"],
    ),
    "Half_Yearly_Results_C": (
        normalize_financial_line,
        {"statement": "C", "report": "half"},
        "cmots_financial_line",
        ["co_code", "statement", "report", "period", "rid"],
    ),
    "Nine_Month_Result_S": (
        normalize_financial_line,
        {"statement": "S", "report": "nine"},
        "cmots_financial_line",
        ["co_code", "statement", "report", "period", "rid"],
    ),
    "Nine_Month_Result_C": (
        normalize_financial_line,
        {"statement": "C", "report": "nine"},
        "cmots_financial_line",
        ["co_code", "statement", "report", "period", "rid"],
    ),
    # ── Narrative endpoints (5) ────────────────────────────────────────────
    # ``co_code`` is NOT in kwargs (passed per-call by the orchestrator).
    # These use DELETE-by-(co_code, doc_type)-then-INSERT idempotency
    # (replace_normalized_rows), not ON CONFLICT — the conflict_keys
    # field here is therefore the "scope" for the delete-then-insert
    # pattern, not a unique constraint on the table.
    "Director_s_Report": (
        normalize_narratives,
        {"doc_type": "director_report",  "body_field": "DIRECTORREP", "year_field": "year"},
        "cmots_narrative",
        ["co_code", "doc_type"],
    ),
    "Chairman_s_Report": (
        normalize_narratives,
        {"doc_type": "chairman_report",  "body_field": "CHAIRREPORT", "year_field": "Yr"},
        "cmots_narrative",
        ["co_code", "doc_type"],
    ),
    "Auditor_s_Report": (
        normalize_narratives,
        {"doc_type": "auditor_report",   "body_field": "MEMO",        "year_field": "Yr"},
        "cmots_narrative",
        ["co_code", "doc_type"],
    ),
    "Notes_toAccount": (
        normalize_narratives,
        {"doc_type": "notes_to_account", "body_field": "MEMO",        "year_field": "Yr"},
        "cmots_narrative",
        ["co_code", "doc_type"],
    ),
    "Management_Discussion": (
        normalize_narratives,
        {"doc_type": "mda",              "body_field": "CMDA",        "year_field": "YEAR"},
        "cmots_narrative",
        ["co_code", "doc_type"],
    ),
    # ── Shareholding (1) ──────────────────────────────────────────────────
    # co_code comes from the row (same pattern as ratios); no kwargs needed.
    # UPSERT pattern (ON CONFLICT on PK (co_code, yrc)).
    "Share_Holding_Pattern_Detailed": (
        normalize_shareholding,
        {},
        "cmots_shareholding",
        ["co_code", "yrc"],
    ),
    # ── Corporate actions (10 entries; 4 static aggregate endpoints
    #    intentionally skipped — see TODO_CMOTS.md). All use the
    #    replace_normalized_rows pattern (scope: (co_code, source_slug)),
    #    so the conflict_keys slot holds the DELETE scope, not a PK.
    #
    # Tested with real RELIANCE/ITC/BAJAJHLDNG fixtures:
    "Dividend": (
        normalize_corporate_actions,
        {"source_slug": "Dividend",          "action_type": "dividend",        "date_field": "divdate"},
        "cmots_corporate_action",
        ["co_code", "source_slug"],
    ),
    "AGM": (
        normalize_corporate_actions,
        {"source_slug": "AGM",               "action_type": "agm",             "date_field": "gmdate"},
        "cmots_corporate_action",
        ["co_code", "source_slug"],
    ),
    "Board_Meetings": (
        normalize_corporate_actions,
        {"source_slug": "Board_Meetings",    "action_type": "board_meeting",   "date_field": "bmdate"},
        "cmots_corporate_action",
        ["co_code", "source_slug"],
    ),
    # Verified against real dev-DB payloads (probe 2026-05-14):
    "Rights": (
        normalize_corporate_actions,
        {"source_slug": "Rights",             "action_type": "rights",          "date_field": "RightDate"},
        "cmots_corporate_action",
        ["co_code", "source_slug"],
    ),
    "Split_of_Face_Value": (
        normalize_corporate_actions,
        {"source_slug": "Split_of_Face_Value","action_type": "split",           "date_field": "splitdate"},
        "cmots_corporate_action",
        ["co_code", "source_slug"],
    ),
    "EGM": (
        normalize_corporate_actions,
        {"source_slug": "EGM",                "action_type": "egm",             "date_field": "gmdate"},
        "cmots_corporate_action",
        ["co_code", "source_slug"],
    ),
    "Book_Closure": (
        normalize_corporate_actions,
        {"source_slug": "Book_Closure",       "action_type": "book_closure",    "date_field": "bcfromdate"},
        "cmots_corporate_action",
        ["co_code", "source_slug"],
    ),
    "Merger_Demergers": (
        normalize_corporate_actions,
        {"source_slug": "Merger_Demergers",   "action_type": "merger_demerger", "date_field": "merger_demerger_date"},
        "cmots_corporate_action",
        ["co_code", "source_slug"],
    ),
    # UNVERIFIED — date_field chosen by inference, not against real
    # CMOTS data (trial-token sample had 0 successful Bonus / Buy_Back
    # rows across 115 covered tickers). Post-PROD-cutover audit query
    # captured in TODO_CMOTS.md must run after the first PROD sync.
    "Bonus": (
        normalize_corporate_actions,
        {"source_slug": "Bonus",              "action_type": "bonus",           "date_field": "recorddate"},
        "cmots_corporate_action",
        ["co_code", "source_slug"],
    ),
    "Buy_Back": (
        normalize_corporate_actions,
        {"source_slug": "Buy_Back",           "action_type": "buyback",         "date_field": "recorddate"},
        "cmots_corporate_action",
        ["co_code", "source_slug"],
    ),
    # Universe-wide (static) corp-action endpoints. Each call returns
    # rows for MANY tickers. The DELETE scope is just ['source_slug'] —
    # we wipe and replace the whole feed each sync.
    "OFS": (
        normalize_corporate_actions,
        {"source_slug": "OFS",                "action_type": "ofs",             "date_field": "offerstartdate"},
        "cmots_corporate_action",
        ["source_slug"],
    ),
    "Change_Of_Name": (
        normalize_corporate_actions,
        {"source_slug": "Change_Of_Name",     "action_type": "change_of_name",  "date_field": "srdt"},
        "cmots_corporate_action",
        ["source_slug"],
    ),
    "DeListed": (
        normalize_corporate_actions,
        {"source_slug": "DeListed",           "action_type": "delisted",        "date_field": "FromDate"},
        "cmots_corporate_action",
        ["source_slug"],
    ),
    # Universe-wide forward calendar. URL has no {co_code} placeholder, but
    # each row carries its own co_code — 1,121 unique tickers across 1,142
    # rows in the dev-DB sample. Date choice: exDate (present in 98.2% of
    # rows) over recorddate (null in 95% of rows — mostly BoardMeetings).
    # The 1980 sentinel filter does not reject future dates.
    "Forthcoming_Corporate_Actions": (
        normalize_corporate_actions,
        {"source_slug": "Forthcoming_Corporate_Actions",
         "action_type": "forthcoming",
         "date_field": "exDate"},
        "cmots_corporate_action",
        ["source_slug"],
    ),
    # ─── Announcements (BSE / NSE) ──────────────────────────────────────
    # Universe-wide announcement feeds; each row carries its own co_code.
    # Orchestrator passes covered_co_codes at call time to filter to the
    # tickers.has_cmots_data=TRUE set (plan §5). Credit-rating extraction
    # (plan §9.4) happens inside the normalizer.
    "BSE_Announcement": (
        normalize_announcements,
        {"source": "BSE"},
        "cmots_announcement",
        ["source"],
    ),
    "NSE_Announcement": (
        normalize_announcements,
        {"source": "NSE"},
        "cmots_announcement",
        ["source"],
    ),
}
