"""Tests for ``server/cmots_normalizers.py``.

Unit tests (default tier) read JSON fixtures from
``tests/python/fixtures/cmots/`` and assert on normalizer output shape +
known scalars from the §(e) inspection. Integration tests
(``@pytest.mark.integration``) run a full fixture -> normalize -> UPSERT
into TEST DB -> readback round-trip with idempotency verification.

Test corpus tickers: RELIANCE (476, large-cap diversified), ITC (301,
FMCG), BAJAJHLDNG (50, finance-holding stand-in for the missing bank
fixture — see TODO_CMOTS.md).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import pytest

from conftest import TEST_CO_CODE_RANGE_START
from server.cmots_normalizers import (
    AGENCIES,
    NORMALIZER_DISPATCH,
    normalize_announcements,
    normalize_company_extended,
    normalize_corporate_actions,
    normalize_financial_line,
    normalize_narratives,
    normalize_ratios,
    normalize_shareholding,
    replace_normalized_rows,
    upsert_normalized_rows,
)

FIXTURES_ROOT = Path(__file__).parent / "fixtures" / "cmots"


def _load_fixture(rel_path: str) -> dict:
    with open(FIXTURES_ROOT / rel_path, encoding="utf-8") as f:
        return json.load(f)


# ─── Empty / data-not-available paths ──────────────────────────────────────


def test_ratios_empty_input():
    """Empty list returns [] silently (no warning)."""
    assert normalize_ratios([], statement="C", period_field="yearend") == []


def test_ratios_data_not_available(caplog):
    """The shared _shared/data_not_available.json's data field is None.

    Per the client contract, callers pass [] when data is None (this is
    what ``cmots_client.fetch._normalize_data`` does). Confirm [] -> [].
    """
    env = _load_fixture("_shared/data_not_available.json")
    assert env["success"] is False
    assert env["data"] is None  # null in the file
    rows = env["data"] or []     # client normalization

    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        result = normalize_ratios(rows, statement="C", period_field="yearend")
    assert result == []
    # Empty input must NOT log the "all rows skipped" warning.
    assert not [r for r in caplog.records if "input rows skipped" in r.message]


# ─── Real fixtures: 3 tickers, same normalizer, same assertion pattern ─────


def test_ratios_reliance_yearly_c():
    """RELIANCE Yearly_Ratio_C: roce=9.9 at the latest yearend=202503."""
    env = _load_fixture("reliance/yearly_ratio_c.json")
    out = normalize_ratios(env["data"], statement="C", period_field="yearend")

    assert len(out) == 5, "expected 5 yearly rows for RELIANCE"

    latest = next(r for r in out if r["yearend"] == 202503)
    assert latest["co_code"] == 476
    assert latest["statement"] == "C"
    assert latest["yearend"] == 202503  # int, not float — coerce_period applied
    assert latest["roce"] == 9.9
    assert latest["pe"] == 24.77
    assert latest["pbv"] == 2.05
    assert latest["roe"] == 9.87
    assert latest["div_yield"] == 0.43           # CMOTS 'divyield' -> our 'div_yield'
    assert latest["book_value"] == 623.12         # CMOTS 'bookvalue' -> our 'book_value'
    assert latest["current_ratio"] == 0.75        # CMOTS 'currentratio' -> our 'current_ratio'
    assert isinstance(latest["raw_json"], dict)
    assert latest["raw_json"]["co_code"] == 476.0  # raw preserves float


def test_ratios_itc_yearly_c():
    """ITC Yearly_Ratio_C: validates the normalizer doesn't have RELIANCE-
    specific assumptions baked in. Just structural assertions + a
    plausibility band for RELIANCE-or-not.
    """
    env = _load_fixture("itc/yearly_ratio_c.json")
    out = normalize_ratios(env["data"], statement="C", period_field="yearend")

    assert len(out) > 0
    for r in out:
        assert r["co_code"] == 301
        assert r["statement"] == "C"
        assert isinstance(r["yearend"], int)
        assert 199001 <= r["yearend"] <= 209912  # YYYYMM band
        # Either both ratios present (latest year) or both None (oldest year
        # often has incomplete data) — but type must be float|None.
        assert r["pe"] is None or isinstance(r["pe"], float)
        assert r["roe"] is None or isinstance(r["roe"], float)


def test_ratios_bajajhldng_yearly_c():
    """BAJAJHLDNG Yearly_Ratio_C: third ticker, structural validation only.

    BAJAJHLDNG is a holding company — extra columns may appear in raw_json
    that don't match the _RATIO_FIELD_MAP; they should be preserved in
    raw_json and absent from the typed projection.
    """
    env = _load_fixture("bajajhldng/yearly_ratio_c.json")
    out = normalize_ratios(env["data"], statement="C", period_field="yearend")

    assert len(out) > 0
    for r in out:
        assert r["co_code"] == 50
        assert r["statement"] == "C"
        assert isinstance(r["yearend"], int)
        # raw_json must round-trip the input — typed columns may also be
        # present in raw_json (we don't strip them).
        assert isinstance(r["raw_json"], dict)
        assert "co_code" in r["raw_json"]


# ─── Skip-path logging ─────────────────────────────────────────────────────


def test_ratios_all_bad_rows(caplog):
    """Every row missing required fields -> [] + per-row warnings + one
    'all N skipped' summary warning."""
    rows: list[dict[str, Any]] = [
        {"foo": 1},
        {"bar": 2},
        {"co_code": "not-a-number"},
    ]
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        result = normalize_ratios(rows, statement="C", period_field="yearend")

    assert result == []

    per_row = [r for r in caplog.records if "skipped row " in r.message]
    assert len(per_row) == 3, f"expected 3 per-row skip warnings, got {len(per_row)}"

    summary = [r for r in caplog.records if "all 3 input rows skipped" in r.message]
    assert len(summary) == 1
    assert "possible data loss" in summary[0].message
    assert "statement=C" in summary[0].message
    assert "period_field=yearend" in summary[0].message


def test_ratios_partial_bad_rows(caplog):
    """1 of 3 rows bad -> 2 output rows + one targeted per-row warning,
    NO summary warning (data wasn't fully lost)."""
    rows = [
        {"co_code": 476.0, "yearend": 202503.0, "pe": 10.0},
        {"co_code": 476.0, "yearend": "not-a-number", "pe": 11.0},  # bad period
        {"co_code": 476.0, "yearend": 202403.0, "pe": 12.0},
    ]
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        result = normalize_ratios(rows, statement="C", period_field="yearend")

    assert len(result) == 2

    # Exactly one per-row skip warning, for row index 1.
    skips = [r for r in caplog.records if "skipped row 1 for co_code=476" in r.message]
    assert len(skips) == 1
    assert "yearend" in skips[0].message
    assert "not-a-number" in skips[0].message

    # No "all N skipped" summary (we got partial data through).
    assert not [r for r in caplog.records if "input rows skipped" in r.message]


def test_ratios_period_coercion():
    """Float and string-float period values become int."""
    rows = [
        {"co_code": 476, "yearend": 202503.0,  "pe": 1.0},
        {"co_code": 476, "yearend": "202403.0", "pe": 2.0},
        {"co_code": 476, "yearend": "202303",   "pe": 3.0},
    ]
    out = normalize_ratios(rows, statement="C", period_field="yearend")
    assert [r["yearend"] for r in out] == [202503, 202403, 202303]
    assert all(isinstance(r["yearend"], int) for r in out)


# ─── Dispatch table sanity ─────────────────────────────────────────────────


def test_dispatch_table_has_four_ratio_entries():
    """Yearly_Ratio_{S,C} + Quarterly_Ratio_{S,C} → normalize_ratios."""
    expected = {"Yearly_Ratio_S", "Yearly_Ratio_C",
                "Quarterly_Ratio_S", "Quarterly_Ratio_C"}
    assert expected <= set(NORMALIZER_DISPATCH.keys())
    for slug in expected:
        fn, kwargs, table, conflict = NORMALIZER_DISPATCH[slug]
        assert fn is normalize_ratios
        assert kwargs["statement"] in ("S", "C")
        assert kwargs["period_field"] in ("yearend", "qtrend")
        assert table in ("cmots_ratio_yearly", "cmots_ratio_quarterly")
        assert conflict[0] == "co_code"
        assert conflict[1] == "statement"


# ─── Integration: fixture -> normalize -> UPSERT -> readback -> idempotent ─


@pytest.mark.integration
def test_ratios_integration_roundtrip_idempotent(db_cursor):
    """End-to-end: RELIANCE yearly_ratio_c.json -> normalize -> UPSERT into
    TEST DB cmots_ratio_yearly -> SELECT back -> re-UPSERT -> same row count.
    """
    env = _load_fixture("reliance/yearly_ratio_c.json")
    normalized = normalize_ratios(env["data"], statement="C", period_field="yearend")
    assert len(normalized) == 5

    # First UPSERT.
    upserted = upsert_normalized_rows(
        db_cursor, "cmots_ratio_yearly", normalized,
        conflict_keys=["co_code", "statement", "yearend"],
    )
    assert upserted == 5

    # Readback: row count, latest year's roce specifically (the known
    # step-(e) value of 9.9 is for yearend=202503; earlier years differ —
    # we don't max(roce) across all years here).
    db_cursor.execute(
        "SELECT count(*) AS n, max(yearend) AS max_yr "
        "FROM cmots_ratio_yearly WHERE co_code = 476 AND statement = 'C'"
    )
    row = db_cursor.fetchone()
    assert row["n"] == 5, "expected 5 rows for RELIANCE/C/yearly"
    assert row["max_yr"] == 202503

    db_cursor.execute(
        "SELECT roce FROM cmots_ratio_yearly "
        "WHERE co_code = 476 AND statement = 'C' AND yearend = 202503"
    )
    # max() on NUMERIC returns Decimal; coerce for comparison.
    assert float(db_cursor.fetchone()["roce"]) == 9.9

    # Re-UPSERT — should be idempotent (ON CONFLICT DO UPDATE).
    upsert_normalized_rows(
        db_cursor, "cmots_ratio_yearly", normalized,
        conflict_keys=["co_code", "statement", "yearend"],
    )
    db_cursor.execute(
        "SELECT count(*) AS n FROM cmots_ratio_yearly "
        "WHERE co_code = 476 AND statement = 'C'"
    )
    assert db_cursor.fetchone()["n"] == 5, "idempotent re-UPSERT must not duplicate"


# ═══════════════════════════════════════════════════════════════════════════
# normalize_financial_line — wide-to-long melt
# ═══════════════════════════════════════════════════════════════════════════


def test_fin_line_empty_input():
    assert normalize_financial_line([], co_code=476, statement="C", report="pnl") == []


def test_fin_line_data_not_available(caplog):
    env = _load_fixture("_shared/data_not_available.json")
    rows = env["data"] or []
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        result = normalize_financial_line(rows, co_code=476, statement="C", report="pnl")
    assert result == []
    assert not [r for r in caplog.records if "input rows produced zero" in r.message]


def test_fin_line_reliance_pnl_c():
    """RELIANCE P&L_C: 56 line items × 10 yearly periods = up to 560 cells.
    RID=1 'Revenue From Operations' at Y202503 should match the known value
    1,071,174 from step (e)."""
    env = _load_fixture("reliance/profit_and_loss_c.json")
    out = normalize_financial_line(
        env["data"], co_code=476, statement="C", report="pnl",
    )

    # Sparse data over old periods is expected; min sane bound is 56 line
    # items × at least 1 period present each = 56 cells.
    assert len(out) >= 56
    # Realistic upper bound: 56 × 10y periods + headroom.
    assert len(out) <= 56 * 20

    # Every cell has the expected fixed shape.
    sample = out[0]
    assert set(sample.keys()) == {
        "co_code", "statement", "report", "period", "rid",
        "column_name", "value",
    }
    assert sample["co_code"] == 476
    assert sample["statement"] == "C"
    assert sample["report"] == "pnl"
    assert isinstance(sample["period"], int)
    assert isinstance(sample["rid"], int)
    assert isinstance(sample["column_name"], str)
    assert isinstance(sample["value"], float)

    # Known value: Revenue From Operations (RID=1), latest year (202503).
    revenue_202503 = next(
        c for c in out if c["rid"] == 1 and c["period"] == 202503
    )
    assert revenue_202503["value"] == 1071174.0
    assert revenue_202503["column_name"] == "Revenue From Operations"  # NB: stripped


def test_fin_line_itc_yearly_c():
    """ITC Yearly_Results_C: structural assertions; no hard-coded RELIANCE values."""
    env = _load_fixture("itc/yearly_results_c.json")
    out = normalize_financial_line(
        env["data"], co_code=301, statement="C", report="year",
    )
    assert len(out) > 0
    for cell in out:
        assert cell["co_code"] == 301
        assert cell["statement"] == "C"
        assert cell["report"] == "year"
        assert isinstance(cell["period"], int)
        assert 199001 <= cell["period"] <= 209912
        assert isinstance(cell["rid"], int)
        assert cell["column_name"] == cell["column_name"].strip()  # always stripped
        assert isinstance(cell["value"], float)


def test_fin_line_bajajhldng_cash_flow_c():
    """BAJAJHLDNG Cash_Flow_C: third ticker, third statement type. Per quirk
    §11.8 cash-flow labels routinely carry leading whitespace — verify the
    real fixture has at least one such label and our output stripped it."""
    env = _load_fixture("bajajhldng/cash_flow_c.json")

    # Confirm the quirk is present in raw input (so the strip test is real).
    raw_rows_with_leading_ws = [
        r for r in env["data"]
        if isinstance(r.get("COLUMNNAME"), str)
        and r["COLUMNNAME"] != r["COLUMNNAME"].lstrip()
    ]
    if not raw_rows_with_leading_ws:
        pytest.skip("BAJAJHLDNG cash_flow fixture has no leading-whitespace labels")

    out = normalize_financial_line(
        env["data"], co_code=50, statement="C", report="cf",
    )
    assert len(out) > 0
    for cell in out:
        assert cell["co_code"] == 50
        assert cell["statement"] == "C"
        assert cell["report"] == "cf"
        # Every output column_name has been stripped.
        assert cell["column_name"] == cell["column_name"].strip()
        assert not cell["column_name"].startswith(" ")


def test_fin_line_all_bad_rows(caplog):
    """All rows missing required fields -> [] + per-row warnings + summary."""
    rows = [
        {"Y202503": 100.0},                                          # no RID, no COLUMNNAME
        {"RID": 5, "Y202503": 200.0},                                # no COLUMNNAME
        {"RID": "not-a-number", "COLUMNNAME": "X", "Y202503": 1.0},  # bad RID
    ]
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        result = normalize_financial_line(
            rows, co_code=476, statement="C", report="pnl",
        )

    assert result == []

    per_row = [r for r in caplog.records if "skipped row " in r.message]
    assert len(per_row) == 3

    summary = [r for r in caplog.records if "all 3 input rows produced zero output cells" in r.message]
    assert len(summary) == 1
    assert "possible data loss" in summary[0].message
    assert "co_code=476" in summary[0].message
    assert "statement=C" in summary[0].message
    assert "report=pnl" in summary[0].message


def test_fin_line_partial_bad_rows(caplog):
    """1 of 3 rows bad -> 2 rows × N period cells output, 1 per-row warning,
    NO summary warning (partial data made it through)."""
    rows = [
        {"RID": 1, "COLUMNNAME": "Revenue ", "Y202503": 100.0, "Y202403": 90.0},
        {"RID": None, "COLUMNNAME": "Bad",   "Y202503": 5.0},
        {"RID": 2, "COLUMNNAME": "EBITDA ", "Y202503": 50.0},
    ]
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        result = normalize_financial_line(
            rows, co_code=476, statement="C", report="pnl",
        )

    # Good rows: row 0 (2 period cells: Y202503, Y202403) + row 2 (1 cell: Y202503) = 3
    assert len(result) == 3
    column_names = {c["column_name"] for c in result}
    assert column_names == {"Revenue", "EBITDA"}  # both stripped

    skips = [r for r in caplog.records if "skipped row 1 for co_code=476" in r.message]
    assert len(skips) == 1
    assert "missing/invalid RID" in skips[0].message

    assert not [r for r in caplog.records if "produced zero output cells" in r.message]


def test_fin_line_period_key_parsing():
    """``Y\\d{6}`` keys match and parse to int. Malformed keys (Y20253,
    Y2025-03, Y20250301) are silently ignored — not treated as period
    cells, no error log."""
    rows = [{
        "RID": 1,
        "COLUMNNAME": "Test",
        "Y202503":     100.0,       # valid: 202503
        "Y201803":     200.0,       # valid: 201803
        "Y20253":      999.0,       # invalid: only 5 digits
        "Y2025-03":    888.0,       # invalid: contains '-'
        "Y20250301":   777.0,       # invalid: 8 digits
        "YABCDEF":     666.0,       # invalid: non-digits
        "rowno":       1,           # non-period column
    }]
    out = normalize_financial_line(rows, co_code=476, statement="C", report="pnl")
    periods = {c["period"] for c in out}
    assert periods == {202503, 201803}
    # Period values are int.
    for cell in out:
        assert isinstance(cell["period"], int)


def test_fin_line_null_value_skipping():
    """Cells where the value is null/None/unparseable are skipped (not
    stored as NULL rows)."""
    rows = [{
        "RID": 1,
        "COLUMNNAME": "Sparse Metric",
        "Y202503": 100.0,
        "Y202403": None,        # skip
        "Y202303": "N/A",       # skip (sentinel)
        "Y202203": "",          # skip (empty)
        "Y202103": "garbage",   # skip (unparseable)
        "Y202003": 50.0,        # keep
    }]
    out = normalize_financial_line(rows, co_code=476, statement="C", report="pnl")
    assert len(out) == 2
    assert {c["period"] for c in out} == {202503, 202003}
    assert all(c["value"] is not None for c in out)


def test_fin_line_whitespace_stripped_explicit():
    """Synthetic case with deliberately egregious whitespace to nail down
    quirk §11.8 — leading, trailing, multi-space all stripped from output."""
    rows = [{
        "RID": 1, "COLUMNNAME": "      Net Interest",        "Y202503": 100.0,
    }, {
        "RID": 2, "COLUMNNAME": "Total Equity\t",            "Y202503": 200.0,
    }, {
        "RID": 3, "COLUMNNAME": "  Mixed  Internal Spaces  ", "Y202503": 300.0,
    }]
    out = normalize_financial_line(rows, co_code=476, statement="C", report="cf")
    by_rid = {c["rid"]: c["column_name"] for c in out}
    assert by_rid[1] == "Net Interest"
    assert by_rid[2] == "Total Equity"
    # Internal spaces are preserved; only leading/trailing trimmed.
    assert by_rid[3] == "Mixed  Internal Spaces"


def test_fin_line_rid_zero_section_divider_skipped(caplog):
    """RID=0 is CMOTS's section-divider sentinel (visual subheading like
    'Attributable to:' or 'EPS:' in the rendered statement). These rows
    routinely repeat within a single response — 4 RID=0 rows were observed
    in RELIANCE Quarterly_Results_C (2026-05-14 dev-DB probe), each with
    a different rowno/COLUMNNAME label. Treating them as data would
    violate the PK (co_code, statement, report, period, rid) and break
    the orchestrator's UPSERT with a CardinalityViolation.

    They must be filtered silently (DEBUG, not WARNING — this is expected
    behaviour, not lossy bad data)."""
    rows = [
        {"RID": 1, "COLUMNNAME": "Revenue", "Y202503": "1000.0"},
        {"RID": 0, "COLUMNNAME": "Attributable to:", "Y202503": None, "rowno": 34},
        {"RID": 0, "COLUMNNAME": "EPS:", "Y202503": None, "rowno": 48},
        {"RID": 2, "COLUMNNAME": "EBITDA", "Y202503": "300.0"},
    ]
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        out = normalize_financial_line(
            rows, co_code=476, statement="C", report="quarter",
        )
    # RID=0 rows produce zero output rows; data rows produce one cell each.
    assert len(out) == 2
    assert {r["rid"] for r in out} == {1, 2}
    # No WARNING fired for the section dividers (expected behavior).
    assert not [r for r in caplog.records if "RID=0" in r.message]


def test_fin_line_invalid_kwargs():
    """Bad statement/report kwargs raise — these are programmer errors, not
    data errors, so they raise rather than skip-with-warning."""
    with pytest.raises(ValueError, match="statement must be"):
        normalize_financial_line([], co_code=476, statement="X", report="pnl")
    with pytest.raises(ValueError, match="report must be"):
        normalize_financial_line([], co_code=476, statement="C", report="income")
    with pytest.raises(TypeError, match="co_code must be int"):
        normalize_financial_line([], co_code="476", statement="C", report="pnl")
    with pytest.raises(TypeError, match="co_code must be int"):
        normalize_financial_line([], co_code=True, statement="C", report="pnl")


def test_dispatch_table_has_fourteen_financial_line_entries():
    """7 endpoint families × {S, C} = 14 dispatch entries for financial_line."""
    families = ["Profit_and_Loss", "Balance_Sheet", "Cash_Flow",
                "Quarterly_Results", "Yearly_Results",
                "Half_Yearly_Results", "Nine_Month_Result"]
    expected = {f"{fam}_{stmt}" for fam in families for stmt in ("S", "C")}
    assert expected <= set(NORMALIZER_DISPATCH.keys())

    seen_reports = set()
    for slug in expected:
        fn, kwargs, table, conflict = NORMALIZER_DISPATCH[slug]
        assert fn is normalize_financial_line
        assert kwargs["statement"] in ("S", "C")
        assert kwargs["report"] in {"pnl", "bs", "cf", "quarter", "year", "half", "nine"}
        assert table == "cmots_financial_line"
        assert conflict == ["co_code", "statement", "report", "period", "rid"]
        seen_reports.add(kwargs["report"])
    # All 7 report values are exercised by the 14 entries.
    assert seen_reports == {"pnl", "bs", "cf", "quarter", "year", "half", "nine"}


# ─── Integration: real fixture -> normalize -> UPSERT -> readback -> idempotent ─


@pytest.mark.integration
def test_fin_line_integration_roundtrip_idempotent(db_cursor):
    """End-to-end: RELIANCE Profit_and_Loss_C -> normalize -> UPSERT into
    TEST DB cmots_financial_line -> SELECT back -> re-UPSERT -> same row count.
    """
    env = _load_fixture("reliance/profit_and_loss_c.json")
    normalized = normalize_financial_line(
        env["data"], co_code=476, statement="C", report="pnl",
    )
    n = len(normalized)
    assert n >= 56  # at least 56 line items × ≥1 period

    upsert_normalized_rows(
        db_cursor, "cmots_financial_line", normalized,
        conflict_keys=["co_code", "statement", "report", "period", "rid"],
    )

    db_cursor.execute(
        "SELECT count(*) AS n FROM cmots_financial_line "
        "WHERE co_code = 476 AND statement = 'C' AND report = 'pnl'"
    )
    assert db_cursor.fetchone()["n"] == n

    # Known scalar: RID=1 (Revenue From Operations), period=202503, value 1,071,174.
    db_cursor.execute(
        "SELECT value, column_name FROM cmots_financial_line "
        "WHERE co_code = 476 AND statement = 'C' AND report = 'pnl' "
        "  AND rid = 1 AND period = 202503"
    )
    row = db_cursor.fetchone()
    assert row is not None
    assert float(row["value"]) == 1071174.0
    assert row["column_name"] == "Revenue From Operations"  # stripped

    # Re-UPSERT idempotency.
    upsert_normalized_rows(
        db_cursor, "cmots_financial_line", normalized,
        conflict_keys=["co_code", "statement", "report", "period", "rid"],
    )
    db_cursor.execute(
        "SELECT count(*) AS n FROM cmots_financial_line "
        "WHERE co_code = 476 AND statement = 'C' AND report = 'pnl'"
    )
    assert db_cursor.fetchone()["n"] == n, "idempotent re-UPSERT must not duplicate"


# ═══════════════════════════════════════════════════════════════════════════
# normalize_narratives — bleach sanitization + body_text extraction
# ═══════════════════════════════════════════════════════════════════════════


# Shared kwargs for each doc_type to keep test signatures tidy.
_NARRATIVE_KWARGS = {
    "director_report":  {"doc_type": "director_report",  "body_field": "DIRECTORREP", "year_field": "year"},
    "chairman_report":  {"doc_type": "chairman_report",  "body_field": "CHAIRREPORT", "year_field": "Yr"},
    "auditor_report":   {"doc_type": "auditor_report",   "body_field": "MEMO",        "year_field": "Yr"},
    "notes_to_account": {"doc_type": "notes_to_account", "body_field": "MEMO",        "year_field": "Yr"},
    "mda":              {"doc_type": "mda",              "body_field": "CMDA",        "year_field": "YEAR"},
}


# ─── Empty / data-not-available ────────────────────────────────────────────


def test_narr_empty_input():
    out = normalize_narratives([], co_code=476, **_NARRATIVE_KWARGS["director_report"])
    assert out == []


def test_narr_data_not_available(caplog):
    env = _load_fixture("_shared/data_not_available.json")
    rows = env["data"] or []
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        out = normalize_narratives(rows, co_code=476, **_NARRATIVE_KWARGS["director_report"])
    assert out == []
    assert not [r for r in caplog.records if "all" in r.message and "skipped" in r.message]


# ─── Real fixtures: 3 tickers × 3 different doc_types ──────────────────────


def test_narr_reliance_director_report():
    """RELIANCE Director_s_Report: float year 2025.0 -> int 2025; body_html
    sanitised to allowlist; body_text derived from sanitised HTML."""
    env = _load_fixture("reliance/director_s_report.json")
    out = normalize_narratives(env["data"], co_code=476, **_NARRATIVE_KWARGS["director_report"])
    assert len(out) == 1

    row = out[0]
    assert row["co_code"] == 476
    assert row["doc_type"] == "director_report"
    assert row["year"] == 2025  # coerced from 2025.0
    assert isinstance(row["year"], int)
    assert isinstance(row["body_html"], str)
    assert len(row["body_html"]) > 0
    assert isinstance(row["body_text"], str)
    assert len(row["body_text"]) > 0
    # Sanity: body_text shouldn't contain raw HTML tags.
    assert "<p>" not in row["body_text"]
    assert "<html" not in row["body_text"]


def test_narr_itc_management_discussion():
    """ITC Management_Discussion: doc_type='mda', body field CMDA, year YEAR."""
    env = _load_fixture("itc/management_discussion.json")
    out = normalize_narratives(env["data"], co_code=301, **_NARRATIVE_KWARGS["mda"])
    assert len(out) == 1
    row = out[0]
    assert row["co_code"] == 301
    assert row["doc_type"] == "mda"
    assert isinstance(row["year"], int) or row["year"] is None
    assert row["body_html"]
    assert row["body_text"]


def test_narr_bajajhldng_chairman_report():
    """BAJAJHLDNG Chairman_s_Report: doc_type='chairman_report', CHAIRREPORT, Yr."""
    env = _load_fixture("bajajhldng/chairman_s_report.json")
    out = normalize_narratives(env["data"], co_code=50, **_NARRATIVE_KWARGS["chairman_report"])
    assert len(out) == 1
    row = out[0]
    assert row["co_code"] == 50
    assert row["doc_type"] == "chairman_report"
    assert row["body_html"]
    assert row["body_text"]


# ─── Sanitization: synthetic malicious HTML ────────────────────────────────


_MALICIOUS_HTML = (
    "<script>alert(1)</script>"
    "<p>Real content</p>"
    "<iframe src=x></iframe>"
    "<div onclick=\"evil()\">More</div>"
    "<object data=\"x\"></object>"
)


def _normalize_one(body_html: str, doc_type: str = "director_report"):
    """Helper: pass synthetic HTML through the normalizer, return the
    single output row."""
    rows = [{"DIRECTORREP": body_html, "year": 2025.0, "co_code": 476.0}]
    kwargs = dict(_NARRATIVE_KWARGS[doc_type])
    if doc_type != "director_report":
        # Switch body_field to match the row we constructed.
        rows = [{kwargs["body_field"]: body_html, kwargs["year_field"]: 2025.0}]
    out = normalize_narratives(rows, co_code=476, **kwargs)
    return out[0] if out else None


def test_narr_sanitizer_strips_dangerous_tags():
    """Synthetic malicious HTML — allowed content preserved, dangerous
    elements removed (tags AND their inner content where applicable)."""
    row = _normalize_one(_MALICIOUS_HTML)
    assert row is not None

    html = row["body_html"]
    text = row["body_text"]

    # Preserved: <p>Real content</p> and <div>More</div>.
    assert "Real content" in html
    assert "More" in html
    assert "<p>" in html
    assert "<div>" in html

    # Removed: <script>, <iframe>, <object>, onclick=
    assert "<script" not in html.lower()
    assert "<iframe" not in html.lower()
    assert "<object" not in html.lower()
    assert "onclick" not in html.lower()
    # The KEY assertion the user called out: script body content does NOT
    # survive into body_text. Without the pre-pass this would fail —
    # bleach.clean(strip=True) on `<script>alert(1)</script>` returns
    # 'alert(1)' as plain text.
    assert "alert(1)" not in html
    assert "alert(1)" not in text
    assert "alert" not in text.lower()
    assert "evil()" not in html  # onclick body
    assert "evil" not in text.lower()


def test_narr_sanitizer_case_variation():
    """<SCRIPT>, <Script> handled the same as <script>."""
    for variant in ("<SCRIPT>alert(1)</SCRIPT>",
                    "<Script>alert(1)</Script>",
                    "<sCrIpT>alert(1)</ScRiPt>"):
        body = f"{variant}<p>kept</p>"
        row = _normalize_one(body)
        assert row is not None
        assert "kept" in row["body_html"]
        assert "alert" not in row["body_text"].lower()
        assert "<script" not in row["body_html"].lower()


def test_narr_sanitizer_nested_attack():
    """`<scr<script>...</script>ipt>` — bleach + the pre-pass should
    neutralise this. The malicious payload must not leak into body_text."""
    body = "<scr<script>alert('nested')</script>ipt><p>kept</p>"
    row = _normalize_one(body)
    assert row is not None
    assert "kept" in row["body_html"]
    assert "alert" not in row["body_text"].lower()
    assert "nested" not in row["body_text"].lower()
    assert "<script" not in row["body_html"].lower()


def test_narr_body_text_from_cleaned_html_not_raw():
    """The user-emphasised invariant: body_text is derived from CLEAN HTML.
    If derived from raw, alert(1) would survive into the searchable text.
    This test is the explicit verifier of that contract."""
    body = "<script>alert('not-in-search')</script><p>visible</p>"
    row = _normalize_one(body)
    assert "visible" in row["body_text"]
    assert "not-in-search" not in row["body_text"]
    assert "alert" not in row["body_text"]


# ─── Year coercion & missing-year ──────────────────────────────────────────


def test_narr_year_float_to_int():
    rows = [{"DIRECTORREP": "<p>x</p>", "year": 2025.0}]
    out = normalize_narratives(rows, co_code=476, **_NARRATIVE_KWARGS["director_report"])
    assert len(out) == 1
    assert out[0]["year"] == 2025
    assert isinstance(out[0]["year"], int)


def test_narr_year_missing_returns_none(caplog):
    """Notes_toAccount sometimes lacks the Yr field. The output row carries
    year=None and the normalizer does NOT log a warning."""
    rows = [{"MEMO": "<p>note</p>"}]  # no Yr field at all
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        out = normalize_narratives(rows, co_code=476, **_NARRATIVE_KWARGS["notes_to_account"])
    assert len(out) == 1
    assert out[0]["year"] is None
    # No skip warning, no summary warning.
    assert not [r for r in caplog.records if "skipped" in r.message]


def test_narr_year_unparseable_returns_none():
    """year='bogus' is also silent — year is optional metadata."""
    rows = [{"DIRECTORREP": "<p>x</p>", "year": "bogus"}]
    out = normalize_narratives(rows, co_code=476, **_NARRATIVE_KWARGS["director_report"])
    assert len(out) == 1
    assert out[0]["year"] is None


# ─── Empty / missing body ──────────────────────────────────────────────────


def test_narr_empty_body_skipped_with_warning(caplog):
    """Empty body field -> skip with per-row warning."""
    rows = [
        {"DIRECTORREP": "",  "year": 2025.0},
        {"DIRECTORREP": "  ", "year": 2025.0},
        {"year": 2025.0},  # missing entirely
        {"DIRECTORREP": None, "year": 2025.0},
    ]
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        out = normalize_narratives(rows, co_code=476, **_NARRATIVE_KWARGS["director_report"])

    assert out == []
    skips = [r for r in caplog.records if "empty body field" in r.message]
    assert len(skips) == 4
    summary = [r for r in caplog.records if "all 4 input rows skipped" in r.message]
    assert len(summary) == 1


def test_narr_partial_empty_body(caplog):
    """Mix of valid and empty bodies — valid rows emit, empty rows warn."""
    rows = [
        {"DIRECTORREP": "<p>real</p>", "year": 2025.0},
        {"DIRECTORREP": "",            "year": 2025.0},
        {"DIRECTORREP": "<p>also</p>", "year": 2024.0},
    ]
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        out = normalize_narratives(rows, co_code=476, **_NARRATIVE_KWARGS["director_report"])

    assert len(out) == 2
    assert out[0]["year"] == 2025
    assert out[1]["year"] == 2024
    # One skip warning for the empty row.
    skips = [r for r in caplog.records if "empty body field" in r.message]
    assert len(skips) == 1
    # No summary (partial data made it through).
    assert not [r for r in caplog.records if "all 3 input rows skipped" in r.message]


# ─── Invalid kwargs ────────────────────────────────────────────────────────


def test_narr_invalid_kwargs():
    """Bad kwargs raise (programmer errors)."""
    with pytest.raises(ValueError, match="doc_type must be"):
        normalize_narratives([], co_code=476, doc_type="invalid",
                             body_field="X", year_field="y")
    with pytest.raises(ValueError, match="body_field must be"):
        normalize_narratives([], co_code=476, doc_type="director_report",
                             body_field="", year_field="y")
    with pytest.raises(ValueError, match="year_field must be"):
        normalize_narratives([], co_code=476, doc_type="director_report",
                             body_field="X", year_field="")
    with pytest.raises(TypeError, match="co_code must be int"):
        normalize_narratives([], co_code="476", **_NARRATIVE_KWARGS["director_report"])


# ─── Dispatch table sanity ─────────────────────────────────────────────────


def test_dispatch_table_has_five_narrative_entries():
    expected = {"Director_s_Report", "Chairman_s_Report", "Auditor_s_Report",
                "Notes_toAccount", "Management_Discussion"}
    assert expected <= set(NORMALIZER_DISPATCH.keys())

    seen_doc_types: set[str] = set()
    seen_body_fields: set[str] = set()
    for slug in expected:
        fn, kwargs, table, conflict = NORMALIZER_DISPATCH[slug]
        assert fn is normalize_narratives
        assert kwargs["doc_type"] in _VALID_DOC_TYPES_FOR_TEST
        assert kwargs["body_field"] in {"DIRECTORREP", "CHAIRREPORT", "MEMO", "CMDA"}
        assert kwargs["year_field"] in {"year", "Yr", "YEAR"}
        assert table == "cmots_narrative"
        assert conflict == ["co_code", "doc_type"]
        seen_doc_types.add(kwargs["doc_type"])
        seen_body_fields.add(kwargs["body_field"])
    # All 5 doc_types present.
    assert seen_doc_types == {"director_report", "chairman_report",
                              "auditor_report", "notes_to_account", "mda"}


_VALID_DOC_TYPES_FOR_TEST = {"director_report", "chairman_report",
                             "auditor_report", "notes_to_account", "mda"}


# ─── Integration: replace_normalized_rows + idempotency ────────────────────


@pytest.mark.integration
def test_narr_integration_roundtrip_idempotent(db_cursor):
    """End-to-end: RELIANCE Director_s_Report -> normalize -> DELETE-then-
    INSERT into cmots_narrative -> SELECT back -> repeat -> same row count."""
    env = _load_fixture("reliance/director_s_report.json")
    normalized = normalize_narratives(
        env["data"], co_code=476, **_NARRATIVE_KWARGS["director_report"],
    )
    assert len(normalized) == 1

    # First write.
    inserted = replace_normalized_rows(
        db_cursor, "cmots_narrative", normalized,
        scope={"co_code": 476, "doc_type": "director_report"},
    )
    assert inserted == 1

    db_cursor.execute(
        "SELECT count(*) AS n, max(year) AS y FROM cmots_narrative "
        "WHERE co_code = 476 AND doc_type = 'director_report'"
    )
    row = db_cursor.fetchone()
    assert row["n"] == 1
    assert row["y"] == 2025

    # Read body_text back and verify it's NOT raw HTML.
    db_cursor.execute(
        "SELECT body_text, body_html FROM cmots_narrative "
        "WHERE co_code = 476 AND doc_type = 'director_report'"
    )
    r = db_cursor.fetchone()
    assert "<p>" not in r["body_text"]
    assert len(r["body_text"]) > 0
    # And body_html survived sanitisation (still has some allowed structure).
    assert len(r["body_html"]) > 0

    # Re-write — DELETE-then-INSERT idempotency.
    replace_normalized_rows(
        db_cursor, "cmots_narrative", normalized,
        scope={"co_code": 476, "doc_type": "director_report"},
    )
    db_cursor.execute(
        "SELECT count(*) AS n FROM cmots_narrative "
        "WHERE co_code = 476 AND doc_type = 'director_report'"
    )
    assert db_cursor.fetchone()["n"] == 1, "replace must not duplicate"


# ═══════════════════════════════════════════════════════════════════════════
# normalize_shareholding — §7 aggregate extraction (highest-risk normalizer)
# ═══════════════════════════════════════════════════════════════════════════


APPROX = pytest.approx  # shorthand for float assertions (default 1e-6 tol)


# ─── Empty / data-not-available ────────────────────────────────────────────


def test_sh_empty_input():
    assert normalize_shareholding([]) == []


def test_sh_data_not_available(caplog):
    env = _load_fixture("_shared/data_not_available.json")
    rows = env["data"] or []
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        out = normalize_shareholding(rows)
    assert out == []
    assert not [r for r in caplog.records if "input rows skipped" in r.message]


# ─── Real fixtures: 3 tickers with three structurally-distinct profiles ────


def test_sh_reliance_known_values():
    """RELIANCE (co_code=476, YRC=202603): the canonical ~49% promoter case.

    Hard-pins:
      promoter_pct = 49.1078    (TotalPromoter_PerShares, the ~49% figure)
      dii_pct      = 20.1813    (sum of 8 components: 9.6073+8.8694+0.0372
                                  +1.6674+0+0+0+0)
      fii_pct      = 18.2111
      govt_pct     = 0.0952
      custodian_pct= 3.566      (PCUST=1.783 + PGDR=1.783)
      n_shareholders = 4,421,289
    """
    env = _load_fixture("reliance/share_holding_pattern_detailed.json")
    out = normalize_shareholding(env["data"])
    assert len(out) == 40, "expected 40 quarters for RELIANCE"

    latest = next(r for r in out if r["yrc"] == 202603)
    assert latest["co_code"] == 476
    assert latest["promoter_pct"]        == APPROX(49.1078)
    assert latest["promoter_pledge_pct"] == APPROX(0.0)
    assert latest["fii_pct"]             == APPROX(18.2111)
    assert latest["dii_pct"]             == APPROX(20.1813)
    assert latest["govt_pct"]            == APPROX(0.0952)
    assert latest["custodian_pct"]       == APPROX(3.566)
    # public is the residual: 49.1092 − (18.2111 + 20.1813 + 0.0952 + 3.566)
    assert latest["public_pct"]          == APPROX(7.0556, abs=1e-3)
    assert latest["total_shares"]            == 13_291_184_806
    assert latest["total_promoter_shares"]   == 6_645_496_096
    assert latest["total_pledged_shares"]    == 0
    assert latest["n_shareholders"]          == 4_421_289


def test_sh_itc_known_values():
    """ITC (co_code=301): no single major promoter — promoter_pct=0.0 is
    correct, not a bug. Public + institutional ≈ 100%."""
    env = _load_fixture("itc/share_holding_pattern_detailed.json")
    out = normalize_shareholding(env["data"])
    assert len(out) == 40

    latest = next(r for r in out if r["yrc"] == 202603)
    assert latest["co_code"] == 301
    assert latest["promoter_pct"]   == APPROX(0.0)             # the headline ITC quirk
    assert latest["fii_pct"]        == APPROX(11.9189)
    assert latest["dii_pct"]        == APPROX(49.1382)         # 16.7587+20.3545+0.0555+11.9695
    assert latest["govt_pct"]       == APPROX(0.036)
    assert latest["custodian_pct"]  == APPROX(0.0248)          # PCUST=0.0248 + PGDR=0.0
    assert latest["n_shareholders"] == 4_041_653


def test_sh_bajajhldng_known_values_with_npfsubtot_quirk():
    """BAJAJHLDNG (co_code=50): ~51% promoter (Bajaj family holding co).
    Real-data §11.3 quirk test — this fixture has NPFSUBTOT=200 (a non-zero
    SHARE count). If the normalizer wrongly used NPFSUBTOT for any
    percentage field, an assertion below would catch it (51.4618 is the
    real promoter percent; 200 is a share count, not a percent).
    """
    env = _load_fixture("bajajhldng/share_holding_pattern_detailed.json")
    out = normalize_shareholding(env["data"])
    assert len(out) == 40

    latest = next(r for r in out if r["yrc"] == 202603)
    assert latest["co_code"] == 50
    assert latest["promoter_pct"]   == APPROX(51.4618)
    assert latest["fii_pct"]        == APPROX(9.6215)
    assert latest["dii_pct"]        == APPROX(8.0686)
    # NPFSUBTOT preserved in raw_json as 200 (a SHARE count); never used
    # as a percentage.
    assert latest["raw_json"]["NPFSUBTOT"] == 200.0
    # And our promoter_pct is the percent, not the share count.
    assert latest["promoter_pct"] < 100
    assert latest["n_shareholders"] == 83_963


# ─── §11.3 synthetic quirk test (explicit) ─────────────────────────────────


def test_sh_npfsubtot_ignored_for_promoter_pct():
    """Synthetic row with absurdly large NPFSUBTOT. The promoter_pct must
    come from TotalPromoter_PerShares (49.1078), NOT NPFSUBTOT (999999999).
    """
    rows = [{
        "co_code": 476,
        "YRC": 202603,
        "NPFSUBTOT": 999999999,                       # GIANT share count — must NOT be used
        "TotalPromoter_PerShares": 49.1078,           # the real percent
        "TotalPromoter_Shares": 6645496096,
        "TotalNonPromoter_PerShares": 49.1092,
        "Total_NoofShareholders": 4421289,
    }]
    out = normalize_shareholding(rows)
    assert len(out) == 1
    assert out[0]["promoter_pct"] == APPROX(49.1078)
    assert out[0]["promoter_pct"] != 999999999
    # And NPFSUBTOT is preserved verbatim in raw_json.
    assert out[0]["raw_json"]["NPFSUBTOT"] == 999999999


# ─── DII sum behaviour ─────────────────────────────────────────────────────


def test_sh_dii_sum_partial_missing():
    """Some of the 8 DII components present, others missing. dii_pct =
    sum of present components only."""
    rows = [{
        "co_code": 476,
        "YRC": 202603,
        "TotalPromoter_PerShares": 50.0,
        "PPIMF": 5.0,
        "PPIINS": 3.0,
        # PPIBK, PPIOTH, PPIFBK, PPIFCOB, PPIVEN, PPITRUS — all missing
    }]
    out = normalize_shareholding(rows)
    assert len(out) == 1
    assert out[0]["dii_pct"] == APPROX(8.0)


def test_sh_dii_all_missing_returns_none():
    """All 8 DII components missing -> dii_pct = None (not 0)."""
    rows = [{
        "co_code": 476,
        "YRC": 202603,
        "TotalPromoter_PerShares": 50.0,
        # no PPIMF/PPIINS/... fields at all
    }]
    out = normalize_shareholding(rows)
    assert len(out) == 1
    assert out[0]["dii_pct"] is None


def test_sh_dii_all_zero_is_zero_not_none():
    """All 8 present with zero values -> dii_pct = 0.0 (not None).
    Distinguishes 'no data' (None) from 'no institutional holding' (0)."""
    rows = [{
        "co_code": 476,
        "YRC": 202603,
        "TotalPromoter_PerShares": 50.0,
        "PPIMF": 0.0, "PPIINS": 0.0, "PPIBK": 0.0, "PPIOTH": 0.0,
        "PPIFBK": 0.0, "PPIFCOB": 0.0, "PPIVEN": 0.0, "PPITRUS": 0.0,
    }]
    out = normalize_shareholding(rows)
    assert len(out) == 1
    assert out[0]["dii_pct"] == 0.0
    assert out[0]["dii_pct"] is not None


# ─── public_pct edge cases ─────────────────────────────────────────────────


def test_sh_public_can_be_slightly_negative():
    """Synthetic where contributors sum > nonpromoter -> public_pct is the
    (small negative) residual. We don't clamp."""
    rows = [{
        "co_code": 476,
        "YRC": 202603,
        "TotalPromoter_PerShares": 49.0,
        "TotalNonPromoter_PerShares": 50.0,
        "PPIFII": 30.0,
        "PPIMF": 21.0,                                # nonpromoter (50) - fii (30) - dii (21) = -1
        # No PPIINS etc., no govt, no custodian — all zero/None.
        "PPIGOVT": 0.0,
        "PCUST": 0.0,
        "PGDR": 0.0,
    }]
    out = normalize_shareholding(rows)
    assert len(out) == 1
    assert out[0]["public_pct"] == APPROX(-1.0)


def test_sh_public_pct_none_when_contributors_missing():
    """If any contributor (fii / dii / govt / custodian) is None,
    public_pct is None — can't compute residual against unknowns."""
    rows = [{
        "co_code": 476,
        "YRC": 202603,
        "TotalPromoter_PerShares": 49.0,
        "TotalNonPromoter_PerShares": 50.0,
        "PPIFII": 18.0,
        # No DII fields at all -> dii_pct=None -> public_pct=None
        "PPIGOVT": 0.0,
        "PCUST": 0.0,
        "PGDR": 0.0,
    }]
    out = normalize_shareholding(rows)
    assert len(out) == 1
    assert out[0]["dii_pct"] is None
    assert out[0]["public_pct"] is None


# ─── Coercion + raw_json preservation ─────────────────────────────────────


def test_sh_period_coercion():
    """YRC arrives as float 202603.0 -> int 202603. Same defensive path
    as financial_line.period."""
    rows = [{
        "co_code": 476.0,
        "YRC": 202603.0,
        "TotalPromoter_PerShares": 49.0,
    }]
    out = normalize_shareholding(rows)
    assert len(out) == 1
    assert out[0]["yrc"] == 202603
    assert isinstance(out[0]["yrc"], int)
    assert out[0]["co_code"] == 476
    assert isinstance(out[0]["co_code"], int)


def test_sh_raw_json_preserves_all_columns():
    """raw_json round-trips the entire input row (~163 keys for real
    fixtures). Frontend ad-hoc queries can reach any column we didn't
    explicitly extract."""
    env = _load_fixture("reliance/share_holding_pattern_detailed.json")
    out = normalize_shareholding(env["data"][:1])
    assert len(out) == 1
    assert out[0]["raw_json"] == env["data"][0]
    # Concretely: NPFSUBTOT, all PPI* fields, all NPI* fields are present.
    raw = out[0]["raw_json"]
    assert "NPFSUBTOT" in raw
    for k in ("PPIMF", "PPIINS", "PPIBK", "PPIOTH",
              "PPIFBK", "PPIFCOB", "PPIVEN", "PPITRUS"):
        assert k in raw, f"{k} missing from raw_json"


# ─── Skip / warning path ───────────────────────────────────────────────────


def test_sh_partial_bad_rows(caplog):
    """1 of 3 rows missing required fields -> 2 outputs + 1 per-row warning,
    no summary."""
    rows = [
        {"co_code": 476, "YRC": 202603, "TotalPromoter_PerShares": 49.0},
        {"co_code": 476, "YRC": 202503},  # missing TotalPromoter_PerShares
        {"co_code": 476, "YRC": 202403, "TotalPromoter_PerShares": 48.0},
    ]
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        out = normalize_shareholding(rows)
    assert len(out) == 2

    skips = [r for r in caplog.records if "skipped row 1" in r.message]
    assert len(skips) == 1
    assert "TotalPromoter_PerShares" in skips[0].message

    assert not [r for r in caplog.records if "all 3 input rows skipped" in r.message]


def test_sh_all_bad_rows(caplog):
    """All rows missing required fields -> [] + 3 per-row + 1 summary."""
    rows = [
        {"YRC": 202603},                    # no co_code
        {"co_code": 476},                   # no YRC
        {"co_code": 476, "YRC": 202403},    # no TotalPromoter_PerShares
    ]
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        out = normalize_shareholding(rows)
    assert out == []

    per_row = [r for r in caplog.records if "skipped row " in r.message]
    assert len(per_row) == 3

    summary = [r for r in caplog.records if "all 3 input rows skipped" in r.message]
    assert len(summary) == 1


# ─── Dispatch ──────────────────────────────────────────────────────────────


def test_dispatch_table_has_one_shareholding_entry():
    assert "Share_Holding_Pattern_Detailed" in NORMALIZER_DISPATCH
    fn, kwargs, table, conflict = NORMALIZER_DISPATCH["Share_Holding_Pattern_Detailed"]
    assert fn is normalize_shareholding
    assert kwargs == {}
    assert table == "cmots_shareholding"
    assert conflict == ["co_code", "yrc"]


# ─── Integration: full round-trip + idempotency ────────────────────────────


@pytest.mark.integration
def test_sh_integration_roundtrip_idempotent(db_cursor):
    """RELIANCE share_holding_pattern_detailed -> normalize -> UPSERT into
    cmots_shareholding -> SELECT back -> re-UPSERT -> same row count."""
    env = _load_fixture("reliance/share_holding_pattern_detailed.json")
    normalized = normalize_shareholding(env["data"])
    n = len(normalized)
    assert n == 40

    upserted = upsert_normalized_rows(
        db_cursor, "cmots_shareholding", normalized,
        conflict_keys=["co_code", "yrc"],
    )
    assert upserted == 40

    db_cursor.execute(
        "SELECT count(*) AS n FROM cmots_shareholding WHERE co_code = 476"
    )
    assert db_cursor.fetchone()["n"] == 40

    db_cursor.execute(
        "SELECT promoter_pct, n_shareholders FROM cmots_shareholding "
        "WHERE co_code = 476 AND yrc = 202603"
    )
    row = db_cursor.fetchone()
    assert float(row["promoter_pct"]) == APPROX(49.1078)
    assert row["n_shareholders"] == 4_421_289

    # Re-UPSERT idempotency.
    upsert_normalized_rows(
        db_cursor, "cmots_shareholding", normalized,
        conflict_keys=["co_code", "yrc"],
    )
    db_cursor.execute(
        "SELECT count(*) AS n FROM cmots_shareholding WHERE co_code = 476"
    )
    assert db_cursor.fetchone()["n"] == 40, "idempotent re-UPSERT must not duplicate"


# ═══════════════════════════════════════════════════════════════════════════
# normalize_corporate_actions — many source endpoints → one target table
# ═══════════════════════════════════════════════════════════════════════════


import datetime as _dt  # noqa: E402 (after-import import is intentional, scoped to this section)


_DIVIDEND_KWARGS = {"source_slug": "Dividend",       "action_type": "dividend",      "date_field": "divdate"}
_AGM_KWARGS      = {"source_slug": "AGM",            "action_type": "agm",           "date_field": "gmdate"}
_BM_KWARGS       = {"source_slug": "Board_Meetings", "action_type": "board_meeting", "date_field": "bmdate"}


# ─── Empty / data-not-available ────────────────────────────────────────────


def test_corp_actions_empty():
    assert normalize_corporate_actions([], **_DIVIDEND_KWARGS) == []


def test_corp_actions_data_not_available(caplog):
    env = _load_fixture("_shared/data_not_available.json")
    rows = env["data"] or []
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        out = normalize_corporate_actions(rows, **_DIVIDEND_KWARGS)
    assert out == []
    assert not [r for r in caplog.records if "all" in r.message and "skipped" in r.message]


# ─── Real fixtures: Dividend / AGM / Board_Meetings across 3 tickers ───────


def test_corp_actions_reliance_dividend():
    """RELIANCE Dividend: pin the Aug 2025 ₹5.50 final dividend (per step (e))."""
    env = _load_fixture("reliance/dividend.json")
    out = normalize_corporate_actions(env["data"], **_DIVIDEND_KWARGS)
    assert len(out) == 1

    row = out[0]
    assert row["co_code"]     == 476
    assert row["action_type"] == "dividend"
    assert row["source_slug"] == "Dividend"
    assert row["action_date"] == _dt.date(2025, 8, 14)
    # Payload preserves the entire input row, including divamount, divper, remark, etc.
    assert row["payload"]["divamount"] == 5.5
    assert row["payload"]["divper"]    == 55.0
    assert row["payload"]["remark"]    == "Final"
    assert row["payload"]["co_code"]   == 476.0  # raw float preserved


def test_corp_actions_itc_dividend():
    """ITC Dividend: same shape, two rows."""
    env = _load_fixture("itc/dividend.json")
    out = normalize_corporate_actions(env["data"], **_DIVIDEND_KWARGS)
    assert len(out) == 2
    for row in out:
        assert row["co_code"]     == 301
        assert row["action_type"] == "dividend"
        assert isinstance(row["action_date"], _dt.date)
        assert isinstance(row["payload"], dict)
        assert row["payload"]["co_code"] == 301.0


def test_corp_actions_reliance_agm():
    """RELIANCE AGM: action_type='agm', date_field='gmdate'."""
    env = _load_fixture("reliance/agm.json")
    out = normalize_corporate_actions(env["data"], **_AGM_KWARGS)
    assert len(out) == 1
    row = out[0]
    assert row["co_code"]     == 476
    assert row["action_type"] == "agm"
    assert row["source_slug"] == "AGM"
    assert isinstance(row["action_date"], _dt.date)
    # AGM payload carries book-closure embedded dates (bcloserstartdate/end);
    # the canonical action_date is gmdate, which is what we extracted.
    assert "bcloserstartdate" in row["payload"]
    assert "purpose" in row["payload"]


def test_corp_actions_bajajhldng_board_meetings():
    """BAJAJHLDNG Board_Meetings: 6 rows, third doc_type validated."""
    env = _load_fixture("bajajhldng/board_meetings.json")
    out = normalize_corporate_actions(env["data"], **_BM_KWARGS)
    assert len(out) == 6
    for row in out:
        assert row["co_code"]     == 50
        assert row["action_type"] == "board_meeting"
        assert row["source_slug"] == "Board_Meetings"
        assert isinstance(row["action_date"], _dt.date)


# ─── Date-handling edge cases ──────────────────────────────────────────────


def test_corp_actions_null_date_skipped(caplog):
    """Row with null date_field -> skip with per-row warning."""
    rows = [
        {"co_code": 476, "divdate": None,                 "divamount": 5.0},
        {"co_code": 476, "divdate": "",                   "divamount": 6.0},
        {"co_code": 476, "divdate": "2025-08-14T00:00:00","divamount": 5.5},  # valid
    ]
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        out = normalize_corporate_actions(rows, **_DIVIDEND_KWARGS)
    assert len(out) == 1
    assert out[0]["action_date"] == _dt.date(2025, 8, 14)

    skips = [r for r in caplog.records if "skipped row " in r.message]
    assert len(skips) == 2
    # No summary — partial data made it through.
    assert not [r for r in caplog.records if "all 3 input rows skipped" in r.message]


def test_corp_actions_sentinel_date_skipped(caplog):
    """Sentinel dates (pre-1980 placeholders like '1900-01-01') -> skip."""
    rows = [
        {"co_code": 476, "divdate": "1900-01-01T00:00:00", "divamount": 5.0},  # sentinel
        {"co_code": 476, "divdate": "0001-01-01T00:00:00", "divamount": 6.0},  # sentinel
        {"co_code": 476, "divdate": "1979-12-31T00:00:00", "divamount": 6.5},  # just below cutoff
        {"co_code": 476, "divdate": "1980-01-01T00:00:00", "divamount": 7.0},  # at cutoff — kept
    ]
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        out = normalize_corporate_actions(rows, **_DIVIDEND_KWARGS)
    assert len(out) == 1
    assert out[0]["action_date"].year == 1980

    skips = [r for r in caplog.records if "skipped row " in r.message]
    assert len(skips) == 3


def test_corp_actions_invalid_date_format_skipped(caplog):
    """Unparseable date strings -> skip."""
    rows = [
        {"co_code": 476, "divdate": "not-a-date",      "divamount": 5.0},
        {"co_code": 476, "divdate": "2025/08/14",      "divamount": 6.0},  # slashes not ISO
        {"co_code": 476, "divdate": "14-Aug-2025",     "divamount": 7.0},  # month-name
        {"co_code": 476, "divdate": "2025-08-14",      "divamount": 8.0},  # ISO date — kept
    ]
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        out = normalize_corporate_actions(rows, **_DIVIDEND_KWARGS)
    assert len(out) == 1
    assert out[0]["action_date"] == _dt.date(2025, 8, 14)
    assert len([r for r in caplog.records if "skipped row " in r.message]) == 3


# ─── Payload preservation + date_field kwarg ───────────────────────────────


def test_corp_actions_payload_preserves_all_input_fields():
    """payload contains the entire input row, including action-type-specific
    fields the schema doesn't break out into typed columns."""
    raw = {
        "co_code":          476,
        "divdate":          "2025-08-14T00:00:00",
        "divamount":        5.5,
        "divper":           55.0,
        "remark":           "Final",
        "isin":             "INE002A01018",
        "symbol":           "RELIANCE",
        "co_name":          "Reliance Industries Ltd",
        "description":      "Custom note",
        "announcementdate": "2025-04-25T00:00:00",
        "recorddate":       "2025-08-14T00:00:00",
        # Some action-type-specific oddity that no specialized accessor covers:
        "custom_metadata":  {"foo": "bar"},
    }
    out = normalize_corporate_actions([raw], **_DIVIDEND_KWARGS)
    assert len(out) == 1
    # payload IS the original row (same dict reference).
    assert out[0]["payload"] == raw
    # Including the type-specific field.
    assert out[0]["payload"]["custom_metadata"] == {"foo": "bar"}


def test_corp_actions_date_field_kwarg_respected():
    """date_field kwarg controls which field is read. Switching the kwarg
    extracts a different date from the same input row."""
    raw = {
        "co_code":   476,
        "divdate":   "2025-08-14T00:00:00",
        "recorddate": "2025-09-15T00:00:00",
    }
    # date_field='divdate'
    out_a = normalize_corporate_actions([raw], **_DIVIDEND_KWARGS)
    assert out_a[0]["action_date"] == _dt.date(2025, 8, 14)

    # date_field='recorddate' (the kwarg pattern used for Bonus / Buy_Back —
    # Rights actually uses 'RightDate' against real CMOTS payloads).
    out_b = normalize_corporate_actions(
        [raw],
        source_slug="Bonus",
        action_type="bonus",
        date_field="recorddate",
    )
    assert out_b[0]["action_date"] == _dt.date(2025, 9, 15)


def test_corp_actions_invalid_kwargs():
    with pytest.raises(ValueError, match="source_slug"):
        normalize_corporate_actions([], source_slug="", action_type="dividend", date_field="divdate")
    with pytest.raises(ValueError, match="action_type"):
        normalize_corporate_actions([], source_slug="Dividend", action_type="", date_field="divdate")
    with pytest.raises(ValueError, match="date_field"):
        normalize_corporate_actions([], source_slug="Dividend", action_type="dividend", date_field="")


def test_corp_actions_covered_co_codes_filter_drops_unknown_tickers():
    """Universe-wide corp-action feeds (OFS, Change_Of_Name, DeListed,
    Forthcoming_Corporate_Actions) return rows for the entire NSE/BSE
    universe. Inserting them violates the FK ``cmots_corporate_action.
    co_code → tickers(co_code)``. The kwarg, when provided, filters to
    the covered set silently (NO per-row warning — high-volume by design).
    """
    rows = [
        {"co_code": 476, "exDate": "2026-06-12T00:00:00", "eventtype": "Dividend"},
        {"co_code": 301, "exDate": "2026-06-15T00:00:00", "eventtype": "Bonus"},
        {"co_code": 99999, "exDate": "2026-06-20T00:00:00", "eventtype": "Split"},  # not covered
        {"co_code": 88888, "exDate": "2026-06-25T00:00:00", "eventtype": "Dividend"},  # not covered
    ]
    out = normalize_corporate_actions(
        rows,
        source_slug="Forthcoming_Corporate_Actions",
        action_type="forthcoming",
        date_field="exDate",
        covered_co_codes=frozenset({476, 301}),
    )
    assert {r["co_code"] for r in out} == {476, 301}


def test_corp_actions_covered_co_codes_none_means_no_filter():
    """Per-ticker dispatch entries leave covered_co_codes=None — their
    co_code is by definition a covered ticker (orchestrator only invokes
    them inside the per-ticker loop). The filter must be a no-op when
    None is passed."""
    rows = [
        {"co_code": 476, "divdate": "2025-08-14T00:00:00", "divamount": 5.5},
        {"co_code": 99999, "divdate": "2025-08-14T00:00:00", "divamount": 1.0},
    ]
    out = normalize_corporate_actions(
        rows,
        source_slug="Dividend",
        action_type="dividend",
        date_field="divdate",
        covered_co_codes=None,
    )
    assert {r["co_code"] for r in out} == {476, 99999}


def test_corp_actions_covered_co_codes_filter_silent_no_warning(caplog):
    """Filtered-out rows produce NO warning (high-volume universe-wide feed
    behavior). Distinct from bad-data skips which DO warn."""
    rows = [{"co_code": cc, "exDate": "2026-06-20T00:00:00"} for cc in range(100, 200)]
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        out = normalize_corporate_actions(
            rows,
            source_slug="Forthcoming_Corporate_Actions",
            action_type="forthcoming",
            date_field="exDate",
            covered_co_codes=frozenset({476}),
        )
    assert out == []
    assert not [r for r in caplog.records if "skipped row " in r.message]
    # Also no all-rows-skipped data-loss warning: those rows were filtered,
    # not bad data.
    assert not [r for r in caplog.records if "bad data" in r.message]


# ─── Dispatch table sanity ─────────────────────────────────────────────────


def test_dispatch_table_has_fourteen_corp_action_entries():
    """14 corp-action dispatch entries:
      - 10 per-ticker slugs (PK scope ['co_code', 'source_slug']):
          8 verified date_fields against real dev-DB payloads
          (Dividend, AGM, Board_Meetings, Rights, Split_of_Face_Value, EGM,
           Book_Closure, Merger_Demergers) + 2 unverified (Bonus, Buy_Back)
          flagged for post-PROD-cutover audit.
      - 4 universe-wide slugs (DELETE scope ['source_slug']):
          OFS, Change_Of_Name, DeListed, Forthcoming_Corporate_Actions —
          one call returns rows for many tickers, so the whole feed is
          wiped per sync.

    The 4 truly-aggregate endpoints (Month_Year_Wise_Count,
    Eventdatewisedetails, corp_action_WKMonth_details, Eventdatewisecount)
    are intentionally NOT in dispatch — they summarize the same events the
    per-ticker / universe-wide feeds already carry.
    """
    per_ticker = {"Dividend", "AGM", "Board_Meetings",
                  "Bonus", "Rights", "Split_of_Face_Value",
                  "EGM", "Buy_Back", "Book_Closure", "Merger_Demergers"}
    universe_wide = {"OFS", "Change_Of_Name", "DeListed",
                     "Forthcoming_Corporate_Actions"}
    expected = per_ticker | universe_wide
    assert expected <= set(NORMALIZER_DISPATCH.keys())
    assert len(expected) == 14

    # The intentionally-skipped aggregates must NOT be mapped to corp-action
    # normalization.
    for skipped in (
        "Month_Year_Wise_Count",
        "Eventdatewisedetails",
        "corp_action_WKMonth_details",
        "Eventdatewisecount",
    ):
        if skipped in NORMALIZER_DISPATCH:
            fn, *_ = NORMALIZER_DISPATCH[skipped]
            assert fn is not normalize_corporate_actions, (
                f"{skipped} should not route to normalize_corporate_actions; "
                "see TODO_CMOTS.md on skipped aggregates"
            )

    seen_action_types: set[str] = set()
    for slug in expected:
        fn, kwargs, table, conflict = NORMALIZER_DISPATCH[slug]
        assert fn is normalize_corporate_actions
        assert kwargs["source_slug"] == slug
        assert isinstance(kwargs["action_type"], str)
        assert isinstance(kwargs["date_field"], str)
        assert table == "cmots_corporate_action"
        if slug in universe_wide:
            assert conflict == ["source_slug"], (
                f"{slug} is a universe-wide feed; conflict scope must be "
                "['source_slug'] so DELETE wipes the entire feed per sync"
            )
        else:
            assert conflict == ["co_code", "source_slug"]
        seen_action_types.add(kwargs["action_type"])

    assert seen_action_types == {
        "dividend", "agm", "board_meeting",
        "bonus", "rights", "split",
        "egm", "buyback", "book_closure", "merger_demerger",
        "ofs", "change_of_name", "delisted", "forthcoming",
    }


# ═══════════════════════════════════════════════════════════════════════════
# Announcements (BSE / NSE) — credit-rating extraction (plan §9.4)
# ═══════════════════════════════════════════════════════════════════════════


# Sample rows shaped after the dev-DB probe (2026-05-14):
#   BSE keys = caption, co_code, date, descriptor, fileurl, lname, memo,
#              sc_code, symbol, typeofannouncement
#   NSE keys = caption, co_code, date, fileurl, lname, memo, subject, symbol
# (BSE delivers co_code as float per quirk §11.9; NSE also as float.)
def _bse_row(**overrides: Any) -> dict:
    base = {
        "date": "2026-05-14T00:57:24",
        "memo": "General Update",
        "lname": "Metropolis Healthcare Ltd",
        "symbol": "METROPOLIS",
        "caption": "General Update",
        "co_code": 65221.0,
        "fileurl": "https://www.bseindia.com/stockinfo/AnnPdfOpen.aspx?Pname=test.pdf",
        "sc_code": "542650",
        "descriptor": "General",
        "typeofannouncement": "General_Announcements",
    }
    base.update(overrides)
    return base


def _nse_row(**overrides: Any) -> dict:
    base = {
        "date": "2026-05-13T00:00:00",
        "memo": "3P Land Holdings Limited has informed the Exchange about Copy of Newspaper Publication",
        "lname": "3P Land Holdings Limited",
        "symbol": "3PLAND",
        "caption": "3P Land Holdings Limited - Copy of Newspaper Publication",
        "co_code": 4141.0,
        "fileurl": "https://nsearchives.nseindia.com/corporate/3PLAND_test.pdf",
        "subject": "Copy of Newspaper Publication",
    }
    base.update(overrides)
    return base


# ─── Empty / invalid-kwarg paths ───────────────────────────────────────────


def test_announcements_empty_input():
    """Empty list returns [] silently."""
    assert normalize_announcements([], source="BSE") == []
    assert normalize_announcements([], source="NSE") == []


def test_announcements_invalid_source():
    with pytest.raises(ValueError, match="source"):
        normalize_announcements([], source="")
    with pytest.raises(ValueError, match="source"):
        normalize_announcements([], source="bse")  # lowercase rejected
    with pytest.raises(ValueError, match="source"):
        normalize_announcements([], source="BOTH")
    with pytest.raises(ValueError, match="source"):
        normalize_announcements([], source=None)  # type: ignore[arg-type]


# ─── BSE / NSE schema mapping ──────────────────────────────────────────────


def test_announcements_bse_basic_schema():
    """BSE row -> all 10 output columns populated correctly."""
    out = normalize_announcements([_bse_row()], source="BSE")
    assert len(out) == 1
    row = out[0]
    assert row["co_code"]    == 65221  # float coerced to int
    assert row["source"]     == "BSE"
    assert row["caption"]    == "General Update"
    assert row["memo"]       == "General Update"
    assert row["descriptor"] == "General"
    assert row["type"]       == "General_Announcements"
    assert row["file_url"]   == (
        "https://www.bseindia.com/stockinfo/AnnPdfOpen.aspx?Pname=test.pdf"
    )
    assert isinstance(row["announcement_date"], _dt.datetime)
    assert row["announcement_date"] == _dt.datetime(2026, 5, 14, 0, 57, 24)
    # No agency/rating in plain "General Update" text.
    assert row["agency"] is None
    assert row["rating"] is None


def test_announcements_nse_basic_schema():
    """NSE row -> descriptor/type are None (NSE payload has neither field)."""
    out = normalize_announcements([_nse_row()], source="NSE")
    assert len(out) == 1
    row = out[0]
    assert row["co_code"]    == 4141
    assert row["source"]     == "NSE"
    assert row["descriptor"] is None
    assert row["type"]       is None
    assert row["announcement_date"] == _dt.datetime(2026, 5, 13, 0, 0, 0)


def test_announcements_co_code_float_coerced():
    """BSE/NSE deliver co_code as float (quirk §11.9); normalizer coerces to int."""
    out = normalize_announcements([_bse_row(co_code=476.0)], source="BSE")
    assert out[0]["co_code"] == 476
    assert isinstance(out[0]["co_code"], int)


def test_announcements_co_code_missing_skipped(caplog):
    """Rows with null/invalid co_code are skipped with a per-row warning."""
    rows = [
        _bse_row(co_code=None),
        _bse_row(co_code=""),
        _bse_row(co_code="not-a-number"),
        _bse_row(co_code=476.0),  # valid — kept
    ]
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        out = normalize_announcements(rows, source="BSE")
    assert len(out) == 1
    assert out[0]["co_code"] == 476
    skips = [r for r in caplog.records if "skipped row " in r.message]
    assert len(skips) == 3


# ─── covered_co_codes filter (plan §5) ─────────────────────────────────────


def test_announcements_covered_co_codes_filter_keeps_matched():
    """Only rows whose co_code is in covered_co_codes survive."""
    rows = [
        _bse_row(co_code=476.0,   caption="A"),
        _bse_row(co_code=301.0,   caption="B"),
        _bse_row(co_code=99999.0, caption="C"),  # not covered
    ]
    covered = frozenset({476, 301})
    out = normalize_announcements(rows, source="BSE", covered_co_codes=covered)
    assert {r["co_code"] for r in out} == {476, 301}
    assert {r["caption"] for r in out} == {"A", "B"}


def test_announcements_covered_co_codes_filter_silent(caplog):
    """Filtered-out rows produce NO warning (high-volume by design)."""
    rows = [_bse_row(co_code=99999.0) for _ in range(50)]
    covered = frozenset({476})
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        out = normalize_announcements(rows, source="BSE", covered_co_codes=covered)
    assert out == []
    assert not [r for r in caplog.records if "skipped row " in r.message]
    # Also no all-rows-skipped data-loss warning: those rows were filtered,
    # not bad data.
    assert not [r for r in caplog.records if "all" in r.message and "input rows" in r.message]


def test_announcements_covered_co_codes_none_means_no_filter():
    """covered_co_codes=None preserves every row with a valid co_code."""
    rows = [_bse_row(co_code=cc) for cc in (476.0, 301.0, 99999.0)]
    out = normalize_announcements(rows, source="BSE")
    assert {r["co_code"] for r in out} == {476, 301, 99999}


# ─── announcement_date handling ────────────────────────────────────────────


def test_announcements_date_iso_datetime_preserved():
    """TIMESTAMPTZ column; preserve time-of-day, not just date."""
    out = normalize_announcements(
        [_bse_row(date="2026-05-14T13:42:07")], source="BSE",
    )
    assert out[0]["announcement_date"] == _dt.datetime(2026, 5, 14, 13, 42, 7)


def test_announcements_date_null_kept_with_none():
    """Null date does NOT drop the row — caption/memo are still useful."""
    out = normalize_announcements([_bse_row(date=None)], source="BSE")
    assert len(out) == 1
    assert out[0]["announcement_date"] is None
    assert out[0]["caption"] == "General Update"


def test_announcements_date_empty_string_returns_none():
    out = normalize_announcements([_bse_row(date="")], source="BSE")
    assert len(out) == 1
    assert out[0]["announcement_date"] is None


def test_announcements_date_unparseable_returns_none():
    """Bad date format -> None, row preserved (no skip)."""
    out = normalize_announcements(
        [_bse_row(date="14-May-2026")],  # not ISO
        source="BSE",
    )
    assert len(out) == 1
    assert out[0]["announcement_date"] is None


def test_announcements_date_already_datetime():
    """If CMOTS returns a parsed datetime, pass it through unchanged."""
    dt = _dt.datetime(2026, 5, 14, 9, 30, 0)
    out = normalize_announcements([_bse_row(date=dt)], source="BSE")
    assert out[0]["announcement_date"] == dt


# ─── Credit-rating extraction (plan §9.4) ──────────────────────────────────


def test_announcements_rating_crisil_aa_plus_close():
    """Standard rating phrase -> agency + rating extracted."""
    out = normalize_announcements(
        [_bse_row(
            caption="Credit Rating Update",
            memo="CRISIL has reaffirmed the long-term rating at AA+ Stable",
        )],
        source="BSE",
    )
    assert out[0]["agency"] == "CRISIL"
    assert out[0]["rating"] == "AA+"


def test_announcements_rating_icra_aa_minus():
    """Different agency, different rating modifier (-)."""
    out = normalize_announcements(
        [_bse_row(
            caption="ICRA rating revised to AA-",
            memo="Outlook stable.",
        )],
        source="BSE",
    )
    assert out[0]["agency"] == "ICRA"
    assert out[0]["rating"] == "AA-"


def test_announcements_rating_care_bbb():
    out = normalize_announcements(
        [_bse_row(caption="CARE Ratings has assigned BBB rating", memo="")],
        source="BSE",
    )
    assert out[0]["agency"] == "CARE"
    assert out[0]["rating"] == "BBB"


def test_announcements_rating_india_ratings_multi_word_agency():
    """Multi-word agency name ('India Ratings') matched verbatim."""
    out = normalize_announcements(
        [_bse_row(caption="India Ratings affirms AAA", memo="")],
        source="BSE",
    )
    assert out[0]["agency"] == "India Ratings"
    assert out[0]["rating"] == "AAA"


def test_announcements_rating_sp_with_ampersand():
    """'S&P' agency name with ampersand."""
    out = normalize_announcements(
        [_bse_row(caption="S&P Global assigned A+ rating", memo="")],
        source="BSE",
    )
    assert out[0]["agency"] == "S&P"
    assert out[0]["rating"] == "A+"


def test_announcements_rating_far_apart_not_matched():
    """Agency and rating > 200 chars apart -> no match."""
    # 250 chars of filler between CRISIL and AA+
    filler = " " + ("x " * 125)  # ~252 chars
    text = "CRISIL spokesperson commented at the press event." + filler + "Our internal target is AA+ over five years."
    out = normalize_announcements(
        [_bse_row(caption="Industry Commentary", memo=text)],
        source="BSE",
    )
    assert out[0]["agency"] is None
    assert out[0]["rating"] is None


def test_announcements_rating_no_agency_no_match():
    """Rating token present but no agency mention -> (None, None)."""
    out = normalize_announcements(
        [_bse_row(caption="Internal Target", memo="Target rating: AA+")],
        source="BSE",
    )
    assert out[0]["agency"] is None
    assert out[0]["rating"] is None


def test_announcements_rating_no_rating_no_match():
    """Agency present but no rating token -> (None, None)."""
    out = normalize_announcements(
        [_bse_row(caption="CRISIL Workshop", memo="Investor meet")],
        source="BSE",
    )
    assert out[0]["agency"] is None
    assert out[0]["rating"] is None


def test_announcements_rating_picks_closest_pair():
    """Multiple agency-rating combos; closest pair wins."""
    text = (
        "CRISIL noted in 2020. ICRA reaffirmed AA+ today. "  # ICRA-AA+ pair, ~30 chars
        "A separate CRISIL report from 2019 mentioned AAA."  # CRISIL-AAA pair, ~50 chars
    )
    out = normalize_announcements(
        [_bse_row(caption="Rating Roundup", memo=text)],
        source="BSE",
    )
    # ICRA-AA+ should win on proximity.
    assert out[0]["agency"] == "ICRA"
    assert out[0]["rating"] == "AA+"


def test_announcements_rating_word_boundary_avoids_agm():
    """'AGM' contains 'A' but is not a rating; must not false-match."""
    out = normalize_announcements(
        [_bse_row(caption="CRISIL attended the AGM", memo="Routine matters discussed.")],
        source="BSE",
    )
    # No rating token present -> no extraction.
    assert out[0]["rating"] is None


def test_announcements_rating_word_boundary_avoids_word_starts():
    """'CRISIL Annual review' must not capture the 'A' in 'Annual' as a rating."""
    out = normalize_announcements(
        [_bse_row(caption="CRISIL Annual review", memo="Standard procedural item.")],
        source="BSE",
    )
    assert out[0]["rating"] is None


def test_announcements_rating_lowercase_aaa_not_matched():
    """Ratings are uppercase by convention; lowercase 'aaa' must NOT match."""
    out = normalize_announcements(
        [_bse_row(caption="CRISIL update", memo="aaa quality of service is our goal.")],
        source="BSE",
    )
    # Agency matches but no uppercase rating token -> both None.
    assert out[0]["agency"] is None
    assert out[0]["rating"] is None


def test_announcements_rating_agency_case_insensitive_returns_canonical():
    """Lowercase 'crisil' matches but is returned as canonical 'CRISIL'."""
    out = normalize_announcements(
        [_bse_row(caption="crisil reaffirmed AA+", memo="")],
        source="BSE",
    )
    assert out[0]["agency"] == "CRISIL"
    assert out[0]["rating"] == "AA+"


def test_announcements_rating_d_grade():
    """The 'D' default-grade rating is matched."""
    out = normalize_announcements(
        [_bse_row(caption="CRISIL downgrades to D", memo="Default observed.")],
        source="BSE",
    )
    assert out[0]["agency"] == "CRISIL"
    assert out[0]["rating"] == "D"


def test_announcements_rating_bare_a_b_c_excluded_from_regex():
    """Bare single-letter 'A' / 'B' / 'C' must NOT match (too FP-prone in
    English prose). 'A+' / 'A-' / 'B+' / 'B-' still match — the modifier
    is what disambiguates a rating from a stray article/list label."""
    # Bare A right next to CRISIL — would absolutely match if 'A' alone
    # were a valid token. The regex is tightened to reject this.
    out = normalize_announcements(
        [_bse_row(caption="CRISIL: A separate matter", memo="")],
        source="BSE",
    )
    assert out[0]["rating"] is None

    # Same shape but with a modifier — must match.
    out = normalize_announcements(
        [_bse_row(caption="CRISIL: A+ rating reaffirmed", memo="")],
        source="BSE",
    )
    assert out[0]["rating"] == "A+"


def test_announcements_rating_split_across_caption_memo():
    """Agency in caption, rating in memo — proximity check uses joined text."""
    out = normalize_announcements(
        [_bse_row(caption="CRISIL Update", memo="Rating: AA+ Stable")],
        source="BSE",
    )
    assert out[0]["agency"] == "CRISIL"
    assert out[0]["rating"] == "AA+"


def test_announcements_rating_empty_caption_and_memo():
    """Both blank -> (None, None) without error."""
    out = normalize_announcements(
        [_bse_row(caption="", memo="")],
        source="BSE",
    )
    assert out[0]["agency"] is None
    assert out[0]["rating"] is None


# ─── Bulk / partial / all-bad rows ─────────────────────────────────────────


def test_announcements_partial_bad_rows(caplog):
    """Mix of valid + invalid rows; only valid ones returned, warnings logged."""
    rows = [
        _bse_row(co_code=476.0),
        _bse_row(co_code=None),       # bad
        _bse_row(co_code=301.0),
        "not a dict",                  # bad
        _bse_row(co_code="abc"),      # bad
    ]
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        out = normalize_announcements(rows, source="BSE")
    assert {r["co_code"] for r in out} == {476, 301}
    skips = [r for r in caplog.records if "skipped row " in r.message]
    assert len(skips) == 3
    # Partial success — no all-skipped data-loss warning.
    assert not [r for r in caplog.records if "all" in r.message and "bad data" in r.message]


def test_announcements_all_bad_rows_warning(caplog):
    """All bad-data rows -> the data-loss summary warning fires."""
    rows = [
        _bse_row(co_code=None),
        _bse_row(co_code="abc"),
        "not a dict",
    ]
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        out = normalize_announcements(rows, source="BSE")
    assert out == []
    summaries = [r for r in caplog.records if "all 3 input rows skipped" in r.message]
    assert len(summaries) == 1


def test_announcements_all_filtered_no_warning(caplog):
    """All rows filtered out by covered_co_codes -> NO data-loss warning
    (rows weren't bad data; they just don't belong to covered tickers)."""
    rows = [_bse_row(co_code=99999.0) for _ in range(5)]
    covered = frozenset({476})
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        out = normalize_announcements(rows, source="BSE", covered_co_codes=covered)
    assert out == []
    assert not [r for r in caplog.records if "bad data" in r.message]


# ─── Dispatch table sanity ─────────────────────────────────────────────────


def test_dispatch_table_has_two_announcement_entries():
    """2 universe-wide announcement endpoints; DELETE scope = ['source']."""
    expected = {"BSE_Announcement", "NSE_Announcement"}
    assert expected <= set(NORMALIZER_DISPATCH.keys())

    sources_seen: set[str] = set()
    for slug in expected:
        fn, kwargs, table, conflict = NORMALIZER_DISPATCH[slug]
        assert fn is normalize_announcements
        assert kwargs["source"] in ("BSE", "NSE")
        assert table == "cmots_announcement"
        assert conflict == ["source"], (
            f"{slug} is a universe-wide feed; conflict scope must be "
            "['source'] so DELETE wipes the entire feed per sync"
        )
        sources_seen.add(kwargs["source"])
    assert sources_seen == {"BSE", "NSE"}


def test_dispatch_table_total_entries():
    """Final dispatch total: 4 ratios + 14 financial_line + 5 narratives +
    1 shareholding + 14 corp_actions + 2 announcements = 40 entries."""
    expected_total = 4 + 14 + 5 + 1 + 14 + 2
    assert len(NORMALIZER_DISPATCH) == expected_total, (
        f"Expected {expected_total} dispatch entries, got "
        f"{len(NORMALIZER_DISPATCH)}: {sorted(NORMALIZER_DISPATCH.keys())}"
    )


# ─── Integration: replace_normalized_rows + idempotency ────────────────────


@pytest.mark.integration
def test_corp_actions_integration_roundtrip_idempotent(db_cursor):
    """RELIANCE Board_Meetings -> normalize -> DELETE-then-INSERT into
    cmots_corporate_action -> SELECT back (5 rows) -> repeat -> still 5."""
    env = _load_fixture("reliance/board_meetings.json")
    normalized = normalize_corporate_actions(env["data"], **_BM_KWARGS)
    assert len(normalized) == 5

    inserted = replace_normalized_rows(
        db_cursor, "cmots_corporate_action", normalized,
        scope={"co_code": 476, "source_slug": "Board_Meetings"},
    )
    assert inserted == 5

    db_cursor.execute(
        "SELECT count(*) AS n, max(action_date) AS latest "
        "FROM cmots_corporate_action "
        "WHERE co_code = 476 AND source_slug = 'Board_Meetings'"
    )
    row = db_cursor.fetchone()
    assert row["n"] == 5
    assert isinstance(row["latest"], _dt.date)

    # Re-write — DELETE-then-INSERT idempotency.
    replace_normalized_rows(
        db_cursor, "cmots_corporate_action", normalized,
        scope={"co_code": 476, "source_slug": "Board_Meetings"},
    )
    db_cursor.execute(
        "SELECT count(*) AS n FROM cmots_corporate_action "
        "WHERE co_code = 476 AND source_slug = 'Board_Meetings'"
    )
    assert db_cursor.fetchone()["n"] == 5, "replace must not duplicate"


@pytest.mark.integration
def test_announcements_integration_roundtrip_idempotent(db_cursor):
    """Synthetic BSE announcement rows for a reserved-range test co_code ->
    normalize -> DELETE-then-INSERT into cmots_announcement -> SELECT back
    -> repeat -> still the same count.

    Uses TEST_CO_CODE_RANGE_START + 10 to avoid colliding with anything
    real CMOTS would ever return (real co_codes are at most ~6 digits;
    TEST_CO_CODE_RANGE_START = 999000). cmots_announcement has an FK on
    co_code → tickers(co_code), so a placeholder ticker is inserted first
    inside the rolled-back transaction.
    """
    test_cc = TEST_CO_CODE_RANGE_START + 10
    # FK target — placeholder ticker (rolled back with the rest at teardown).
    db_cursor.execute(
        "INSERT INTO tickers (symbol, co_code) VALUES (%s, %s) "
        "ON CONFLICT (co_code) DO NOTHING",
        (f"_TEST_ANN_{test_cc}", test_cc),
    )
    rows = [
        _bse_row(
            co_code=float(test_cc),
            caption="CRISIL Rating Update",
            memo="CRISIL has reaffirmed long-term rating at AA+ Stable.",
            date="2026-05-10T09:30:00",
        ),
        _bse_row(
            co_code=float(test_cc),
            caption="General Update",
            memo="Routine disclosure.",
            date="2026-05-11T11:00:00",
        ),
        _bse_row(
            co_code=float(test_cc),
            caption="ICRA review",
            memo="ICRA revised the outlook on long-term rating AA- to Positive.",
            date="2026-05-12T14:15:00",
        ),
    ]
    normalized = normalize_announcements(rows, source="BSE")
    assert len(normalized) == 3
    # Sanity-check rating extraction inside the normalized set.
    by_caption = {r["caption"]: r for r in normalized}
    assert by_caption["CRISIL Rating Update"]["agency"] == "CRISIL"
    assert by_caption["CRISIL Rating Update"]["rating"] == "AA+"
    assert by_caption["ICRA review"]["agency"]          == "ICRA"
    assert by_caption["ICRA review"]["rating"]          == "AA-"
    assert by_caption["General Update"]["agency"]       is None

    inserted = replace_normalized_rows(
        db_cursor, "cmots_announcement", normalized,
        scope={"source": "BSE", "co_code": test_cc},
    )
    assert inserted == 3

    db_cursor.execute(
        "SELECT count(*) AS n, count(rating) AS n_rated "
        "FROM cmots_announcement "
        "WHERE source = 'BSE' AND co_code = %s",
        (test_cc,),
    )
    row = db_cursor.fetchone()
    assert row["n"] == 3
    assert row["n_rated"] == 2  # CRISIL + ICRA

    # Idempotent re-write: DELETE-then-INSERT same set -> still 3 rows.
    replace_normalized_rows(
        db_cursor, "cmots_announcement", normalized,
        scope={"source": "BSE", "co_code": test_cc},
    )
    db_cursor.execute(
        "SELECT count(*) AS n FROM cmots_announcement "
        "WHERE source = 'BSE' AND co_code = %s",
        (test_cc,),
    )
    assert db_cursor.fetchone()["n"] == 3, "replace must not duplicate"


# ═══════════════════════════════════════════════════════════════════════════
# Company Extended (FAN-IN: 5 endpoints → 1 row per ticker)
# ═══════════════════════════════════════════════════════════════════════════
#
# Unlike every other normalizer in this module, this one takes a dict mapping
# {slug → rows} rather than a single endpoint's rows. The orchestrator handles
# this fan-in inline (no NORMALIZER_DISPATCH entry — option (a) per plan
# discussion 2026-05-14). All assertions below check the real fixture values
# captured by the step-(e) probe against the dev DB.


def _load_company_extended_fanin(ticker_dir: str) -> dict[str, list[dict]]:
    """Build the rows_by_slug dict from the 5 per-ticker fixture files."""
    return {
        "Company_Profile":                  _load_fixture(f"{ticker_dir}/company_profile.json")["data"],
        "Board_Of_Directors":               _load_fixture(f"{ticker_dir}/board_of_directors.json")["data"],
        "Bankers":                          _load_fixture(f"{ticker_dir}/bankers.json")["data"],
        "Subsidiaries_JVs_Collaborations":  _load_fixture(f"{ticker_dir}/subsidiaries_jvs_collaborations.json")["data"],
        "Locations":                        _load_fixture(f"{ticker_dir}/locations.json")["data"],
    }


# ─── Empty / missing-source paths ─────────────────────────────────────────


def test_company_ext_empty_dict_returns_none(caplog):
    """Empty rows_by_slug -> None + warning."""
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        result = normalize_company_extended({})
    assert result is None
    assert any("Company_Profile missing" in r.message for r in caplog.records)


def test_company_ext_company_profile_missing(caplog):
    """rows_by_slug present but Company_Profile absent -> None + warning."""
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        result = normalize_company_extended({
            "Board_Of_Directors": [{"slno": 1, "dir_name": "X"}],
            "Bankers": [{"BNK_NAME": "Y"}],
        })
    assert result is None
    assert any("Company_Profile missing" in r.message for r in caplog.records)


def test_company_ext_company_profile_empty_list(caplog):
    """Company_Profile = [] -> None + warning."""
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        result = normalize_company_extended({"Company_Profile": []})
    assert result is None
    assert any("Company_Profile missing" in r.message for r in caplog.records)


def test_company_ext_invalid_co_code(caplog):
    """Company_Profile present but CO_CODE missing/unparseable -> None + warning."""
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        result = normalize_company_extended({
            "Company_Profile": [{"CO_CODE": None, "CHAIRMAN": "X"}],
        })
    assert result is None
    assert any("CO_CODE missing/unparseable" in r.message for r in caplog.records)

    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        result = normalize_company_extended({
            "Company_Profile": [{"CO_CODE": "not-a-number", "CHAIRMAN": "X"}],
        })
    assert result is None


def test_company_ext_company_profile_non_dict_row(caplog):
    """Company_Profile first row is not a dict -> None + warning."""
    with caplog.at_level(logging.WARNING, logger="server.cmots_normalizers"):
        result = normalize_company_extended({"Company_Profile": ["a string"]})
    assert result is None
    assert any("not a dict" in r.message for r in caplog.records)


# ─── Three-ticker fixture round-trip ──────────────────────────────────────


def test_company_ext_reliance_full_fanin():
    """RELIANCE: all 5 sources populated; assert canonical scalars +
    JSONB row counts against fixture values."""
    result = normalize_company_extended(_load_company_extended_fanin("reliance"))
    assert result is not None
    assert result["co_code"]            == 476
    assert result["chairman"]           == "Mukesh D Ambani"
    assert result["auditor"]            == "Deloitte Haskins & Sells LLP/Chaturvedi & Shah LLP"
    assert result["company_secretary"]  == "Savithri Parekh"
    assert result["registrar"]          == "KFin Techologies Ltd"
    assert result["website"]            == "http://www.ril.com"
    assert result["incorporation_year"] == 1973
    # RELIANCE has REGADD1/REGADD2 populated, ho_add* and co_add* are null.
    assert result["registered_office"]  == "3rd Floor Maker Chambers IV, 222 Nariman Point"
    assert result["head_office"]        is None
    assert result["corporate_office"]   is None
    # Per-ticker fan-in row counts (locked against the trial-sync fixture).
    assert len(result["directors_json"])    == 15
    assert len(result["bankers_json"])      == 10
    assert len(result["subsidiaries_json"]) == 9
    assert len(result["locations_json"])    == 10
    # JSONB columns must be lists (not None) — frontend always gets an iterable.
    assert isinstance(result["directors_json"],    list)
    assert isinstance(result["bankers_json"],      list)
    assert isinstance(result["subsidiaries_json"], list)
    assert isinstance(result["locations_json"],    list)


def test_company_ext_itc_full_fanin():
    """ITC: different field values; subsidiaries=2 (smaller than RELIANCE)."""
    result = normalize_company_extended(_load_company_extended_fanin("itc"))
    assert result is not None
    assert result["co_code"]            == 301
    assert result["chairman"]           == "Sanjiv Puri"
    assert result["company_secretary"]  == "Rajendra Kumar Singhi"
    assert result["website"]            == "http://www.itcportal.com"
    assert result["incorporation_year"] == 1910
    assert result["registered_office"]  == "Virginia House, 37 Jawaharlal Nehru Road"
    assert len(result["directors_json"])    == 18
    assert len(result["bankers_json"])      == 1
    assert len(result["subsidiaries_json"]) == 2
    assert len(result["locations_json"])    == 10


def test_company_ext_bajajhldng_full_fanin():
    """BAJAJHLDNG: has ho_add1 populated; subsidiaries_json empty list."""
    result = normalize_company_extended(_load_company_extended_fanin("bajajhldng"))
    assert result is not None
    assert result["co_code"]            == 50
    assert result["chairman"]           == "Shekhar Bajaj"
    assert result["registrar"]          == "KFin Techologies Ltd"
    assert result["website"]            == "http://www.bhil.in"
    assert result["incorporation_year"] == 1945
    # BAJAJHLDNG is the only fixture with head_office populated.
    assert result["head_office"]        == "Viman Nagar, Pune - 411 014."
    # Empty subsidiaries -> empty list (NOT None) — frontend always iterates.
    assert result["subsidiaries_json"]  == []
    assert len(result["directors_json"]) == 12
    assert len(result["bankers_json"])   == 2
    assert len(result["locations_json"]) == 1


# ─── Director order preservation (slno gaps are real) ─────────────────────


def test_company_ext_directors_preserve_api_delivery_order():
    """The 'preserve API order' contract: if a future refactor sorts the
    list by slno, this test fails immediately. CMOTS already orders rows
    canonically — the normalizer must NOT re-sort by slno (because slno
    has gaps, e.g. ITC starts at 2).
    """
    rows_by_slug = {
        "Company_Profile": [{
            "CO_CODE": 999100, "CHAIRMAN": "x", "AUDITOR": "x",
        }],
        # API delivery order: 3, 1, 2 (intentionally out-of-order slno).
        "Board_Of_Directors": [
            {"slno": 3, "dir_name": "Third",  "dir_desg": "X"},
            {"slno": 1, "dir_name": "First",  "dir_desg": "X"},
            {"slno": 2, "dir_name": "Second", "dir_desg": "X"},
        ],
    }
    result = normalize_company_extended(rows_by_slug)
    assert result is not None
    names = [d["dir_name"] for d in result["directors_json"]]
    # Delivery order preserved (NOT sorted by slno -> 1, 2, 3).
    assert names == ["Third", "First", "Second"], (
        "directors_json must preserve CMOTS API delivery order — do NOT sort by slno"
    )


def test_company_ext_directors_real_fixture_order():
    """Real-fixture spot-check: RELIANCE first 3 directors are Mukesh,
    Nikhil, Hital in that order — verifying we read fixture verbatim."""
    result = normalize_company_extended(_load_company_extended_fanin("reliance"))
    names_first_3 = [d["dir_name"] for d in result["directors_json"][:3]]
    assert names_first_3 == ["Mukesh D Ambani", "Nikhil Meswani", "Hital R Meswani"]


# ─── Address concatenation ────────────────────────────────────────────────


def test_company_ext_concat_address_basic():
    """Two non-blank parts: ', ' joined."""
    result = normalize_company_extended({
        "Company_Profile": [{
            "CO_CODE": 999101,
            "REGADD1": "A House",
            "REGADD2": "Main Street",
        }],
    })
    assert result["registered_office"] == "A House, Main Street"


def test_company_ext_concat_address_drops_blanks_and_whitespace():
    """Blanks, whitespace-only, and None lines are dropped before joining."""
    result = normalize_company_extended({
        "Company_Profile": [{
            "CO_CODE": 999102,
            "REGADD1": "  Line One  ",  # trimmed
            "REGADD2": "",               # dropped
            "ho_add1": "   ",            # whitespace-only -> dropped
            "ho_add2": None,             # None -> dropped
            "ho_add3": "Line Three",
        }],
    })
    assert result["registered_office"] == "Line One"
    assert result["head_office"]       == "Line Three"


def test_company_ext_concat_address_all_blank_returns_none():
    """If every line is blank/None, the column is None (not empty string)."""
    result = normalize_company_extended({
        "Company_Profile": [{
            "CO_CODE": 999103,
            "ho_add1": None, "ho_add2": "", "ho_add3": "   ",
            "co_add1": None, "co_add2": None, "co_add3": None,
        }],
    })
    assert result["head_office"]      is None
    assert result["corporate_office"] is None
    assert result["registered_office"] is None


def test_company_ext_head_office_three_lines_joined():
    """All three ho_add lines populated -> all joined."""
    result = normalize_company_extended({
        "Company_Profile": [{
            "CO_CODE": 999104,
            "ho_add1": "Wing A", "ho_add2": "Tower 2", "ho_add3": "Mumbai",
        }],
    })
    assert result["head_office"] == "Wing A, Tower 2, Mumbai"


def test_company_ext_corporate_office_distinct_from_co_code():
    """co_add* (corporate-office address) must NOT be confused with CO_CODE
    (company code). The normalizer reads only co_add1..3; CO_CODE drives PK."""
    result = normalize_company_extended({
        "Company_Profile": [{
            "CO_CODE": 999105,            # company code → PK
            "co_add1": "Corp HQ",         # corporate office address → text col
            "co_add2": "Bengaluru",
        }],
    })
    assert result["co_code"]          == 999105
    assert result["corporate_office"] == "Corp HQ, Bengaluru"


# ─── Incorporation year coercion ──────────────────────────────────────────


def test_company_ext_incorporation_year_string_coerced():
    """CMOTS delivers INC_DT as string '1973' (per real fixture)."""
    result = normalize_company_extended({
        "Company_Profile": [{"CO_CODE": 999106, "INC_DT": "1973"}],
    })
    assert result["incorporation_year"] == 1973
    assert isinstance(result["incorporation_year"], int)


def test_company_ext_incorporation_year_int_passes_through():
    """Defensively also accepts int input."""
    result = normalize_company_extended({
        "Company_Profile": [{"CO_CODE": 999107, "INC_DT": 1985}],
    })
    assert result["incorporation_year"] == 1985


def test_company_ext_incorporation_year_missing_returns_none():
    result = normalize_company_extended({
        "Company_Profile": [{"CO_CODE": 999108, "INC_DT": None}],
    })
    assert result["incorporation_year"] is None


def test_company_ext_incorporation_year_unparseable_returns_none():
    for bad in ("abc", "", "  ", "19xy"):
        result = normalize_company_extended({
            "Company_Profile": [{"CO_CODE": 999109, "INC_DT": bad}],
        })
        assert result["incorporation_year"] is None, f"failed for {bad!r}"


def test_company_ext_incorporation_year_sentinel_filtered():
    """CMOTS sentinel placeholders (1900 / 0001) for 'unknown' must NOT
    leak into the column — they'd produce 'founded 2126 years ago' UI bugs."""
    for bad_year in ("0001", "1799", "1", "0"):
        result = normalize_company_extended({
            "Company_Profile": [{"CO_CODE": 999110, "INC_DT": bad_year}],
        })
        assert result["incorporation_year"] is None, f"sentinel {bad_year!r} leaked"


def test_company_ext_incorporation_year_future_filtered():
    """Implausibly-future years rejected (year > 2100)."""
    result = normalize_company_extended({
        "Company_Profile": [{"CO_CODE": 999111, "INC_DT": "2200"}],
    })
    assert result["incorporation_year"] is None


# ─── Partial sources / missing JSONB inputs ───────────────────────────────


def test_company_ext_partial_sources_jsonb_default_to_empty_list():
    """Only Company_Profile present (no Board/Bankers/Subs/Locations):
    JSONB columns get [] (NOT None). Frontend always sees an iterable."""
    result = normalize_company_extended({
        "Company_Profile": [{"CO_CODE": 999112, "CHAIRMAN": "Solo Founder"}],
    })
    assert result["chairman"]           == "Solo Founder"
    assert result["directors_json"]     == []
    assert result["bankers_json"]       == []
    assert result["subsidiaries_json"]  == []
    assert result["locations_json"]     == []


def test_company_ext_scalar_fields_none_when_missing():
    """If a scalar source field is absent from Company_Profile, the output
    column is None — every column is nullable per the schema."""
    result = normalize_company_extended({
        "Company_Profile": [{"CO_CODE": 999113}],  # only CO_CODE
    })
    assert result["chairman"]          is None
    assert result["auditor"]           is None
    assert result["company_secretary"] is None
    assert result["registrar"]         is None
    assert result["website"]           is None


def test_company_ext_jsonb_input_with_none_lists():
    """Defensively accept None for any of the 4 child slugs (rows_by_slug.get
    returns None) -> empty list, not crash."""
    result = normalize_company_extended({
        "Company_Profile":                 [{"CO_CODE": 999114}],
        "Board_Of_Directors":              None,  # type: ignore[dict-item]
        "Bankers":                         None,  # type: ignore[dict-item]
        "Subsidiaries_JVs_Collaborations": None,  # type: ignore[dict-item]
        "Locations":                       None,  # type: ignore[dict-item]
    })
    assert result["directors_json"]    == []
    assert result["bankers_json"]      == []
    assert result["subsidiaries_json"] == []
    assert result["locations_json"]    == []


# ─── Co_code coercion (quirk §11.9) ───────────────────────────────────────


def test_company_ext_co_code_float_coerced():
    """CMOTS delivers CO_CODE as float (476.0); coerce to int."""
    result = normalize_company_extended({
        "Company_Profile": [{"CO_CODE": 476.0, "CHAIRMAN": "x"}],
    })
    assert result["co_code"] == 476
    assert isinstance(result["co_code"], int)


# ─── Dispatch table — assert NO entry was added (option-(a) decision) ──────


def test_company_ext_not_in_dispatch_table():
    """Plan-confirmed decision (2026-05-14): the fan-in normalizer is
    orchestrator-special-cased, NOT routed through NORMALIZER_DISPATCH.
    Adding it later would require a different tuple shape (multi-input
    sources list) — promote to abstraction only when a second consumer
    appears.
    """
    # No slug for the fan-in (it's a derived 'concept', not a CMOTS slug).
    # Verify the 5 SOURCE endpoints are also NOT in dispatch — they're
    # collected raw by the orchestrator and handed to the fan-in.
    for slug in ("Company_Profile", "Board_Of_Directors", "Bankers",
                 "Subsidiaries_JVs_Collaborations", "Locations"):
        assert slug not in NORMALIZER_DISPATCH, (
            f"{slug} should not be in NORMALIZER_DISPATCH — orchestrator "
            "passes it to normalize_company_extended directly"
        )
    # Dispatch total unchanged (still 40 — checked by
    # test_dispatch_table_total_entries earlier).


# ─── Integration: full fan-in -> UPSERT -> readback -> idempotent ────────


@pytest.mark.integration
def test_company_ext_integration_roundtrip_idempotent(db_cursor):
    """RELIANCE full fan-in -> upsert_normalized_rows -> readback chairman,
    website, JSONB list lengths -> re-UPSERT -> idempotent."""
    result = normalize_company_extended(_load_company_extended_fanin("reliance"))
    assert result is not None

    inserted = upsert_normalized_rows(
        db_cursor, "cmots_company_extended", [result],
        conflict_keys=["co_code"],
    )
    assert inserted == 1

    db_cursor.execute(
        "SELECT chairman, website, incorporation_year, "
        "jsonb_array_length(directors_json) AS n_dirs, "
        "jsonb_array_length(bankers_json) AS n_banks, "
        "jsonb_array_length(subsidiaries_json) AS n_subs, "
        "jsonb_array_length(locations_json) AS n_locs "
        "FROM cmots_company_extended WHERE co_code = 476"
    )
    row = db_cursor.fetchone()
    assert row["chairman"]            == "Mukesh D Ambani"
    assert row["website"]             == "http://www.ril.com"
    assert row["incorporation_year"]  == 1973
    assert row["n_dirs"]              == 15
    assert row["n_banks"]             == 10
    assert row["n_subs"]              == 9
    assert row["n_locs"]              == 10

    # Idempotent re-write: UPSERT same data -> still exactly 1 row.
    upsert_normalized_rows(
        db_cursor, "cmots_company_extended", [result],
        conflict_keys=["co_code"],
    )
    db_cursor.execute(
        "SELECT count(*) AS n FROM cmots_company_extended WHERE co_code = 476"
    )
    assert db_cursor.fetchone()["n"] == 1, "upsert must not duplicate"


@pytest.mark.integration
def test_company_ext_integration_directors_jsonb_addressable(db_cursor):
    """Verify JSONB list shape on round-trip: directors_json -> 0 [name]
    returns the first director's name (Mukesh D Ambani for RELIANCE).
    Catches any subtle Json-wrap bug that would store the list as a string."""
    result = normalize_company_extended(_load_company_extended_fanin("reliance"))
    upsert_normalized_rows(
        db_cursor, "cmots_company_extended", [result],
        conflict_keys=["co_code"],
    )
    db_cursor.execute(
        "SELECT directors_json -> 0 ->> 'dir_name' AS first_director "
        "FROM cmots_company_extended WHERE co_code = 476"
    )
    assert db_cursor.fetchone()["first_director"] == "Mukesh D Ambani"
