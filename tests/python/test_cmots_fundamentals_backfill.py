"""Tests for ``server/cmots_fundamentals_backfill.py`` (§6).

Covers:
  - ``_period_to_iso_date`` correctness across leap years, month-end dates,
    invalid inputs
  - ``safe_growth`` edge cases (None, zero, negative, sign-change)
  - ``_coerce_finite_float`` NaN/Inf/None handling
  - ``_pct_to_fraction`` / ``_crore_to_rupees`` unit conversions
  - JSONB builders: shape, RID=0 skipping, RID=26+27 summing, derived
    Free Cash Flow, judgment-call pass-through
  - End-to-end RELIANCE round-trip + idempotency (integration tier)
"""

from __future__ import annotations

import math
from datetime import date
from typing import Any
from unittest.mock import MagicMock

import pytest

from conftest import TEST_CO_CODE_RANGE_START
from server.cmots_fundamentals_backfill import (
    _build_balance_sheet,
    _build_cash_flow,
    _build_income_statement,
    _build_quarterly_financials,
    _coerce_finite_float,
    _crore_to_rupees,
    _pct_to_fraction,
    _period_to_iso_date,
    backfill_covered_tickers,
    backfill_one_ticker,
    build_jsonb_payloads,
    safe_growth,
)


# ─── _period_to_iso_date ─────────────────────────────────────────────────


class TestPeriodToIsoDate:
    def test_march_year_end(self):
        assert _period_to_iso_date(202503) == "2025-03-31"

    def test_june_q1(self):
        assert _period_to_iso_date(202506) == "2025-06-30"

    def test_september_q2(self):
        assert _period_to_iso_date(202509) == "2025-09-30"

    def test_december_q3(self):
        assert _period_to_iso_date(202512) == "2025-12-31"

    def test_leap_year_feb(self):
        """2024 is a leap year; Feb has 29 days."""
        assert _period_to_iso_date(202402) == "2024-02-29"

    def test_non_leap_year_feb(self):
        assert _period_to_iso_date(202302) == "2023-02-28"

    def test_invalid_month_zero(self):
        assert _period_to_iso_date(202500) is None

    def test_invalid_month_thirteen(self):
        assert _period_to_iso_date(202513) is None

    def test_too_short(self):
        assert _period_to_iso_date(2503) is None

    def test_too_long(self):
        assert _period_to_iso_date(20250313) is None

    def test_string_input_rejected(self):
        # Not an int — defensive return None
        assert _period_to_iso_date("202503") is None  # type: ignore[arg-type]

    def test_none_rejected(self):
        assert _period_to_iso_date(None) is None  # type: ignore[arg-type]


# ─── safe_growth ────────────────────────────────────────────────────────


class TestSafeGrowth:
    def test_normal_positive_growth(self):
        assert safe_growth(110, 100) == pytest.approx(0.10)

    def test_normal_negative_growth(self):
        assert safe_growth(90, 100) == pytest.approx(-0.10)

    def test_flat(self):
        assert safe_growth(100, 100) == 0.0

    def test_latest_none(self):
        assert safe_growth(None, 100) is None

    def test_prior_none(self):
        assert safe_growth(100, None) is None

    def test_both_none(self):
        assert safe_growth(None, None) is None

    def test_prior_zero(self):
        assert safe_growth(100, 0) is None

    def test_prior_negative(self):
        """Loss → profit: growth % is meaningless across sign change."""
        assert safe_growth(50, -50) is None

    def test_latest_negative_prior_positive(self):
        """Profit → loss: still computable, result is < -1.0."""
        assert safe_growth(-50, 100) == pytest.approx(-1.5)

    def test_int_and_float_mix(self):
        assert safe_growth(110, 100.0) == pytest.approx(0.10)
        assert safe_growth(110.0, 100) == pytest.approx(0.10)


# ─── _coerce_finite_float ────────────────────────────────────────────────


class TestCoerceFiniteFloat:
    def test_int(self):
        assert _coerce_finite_float(42) == 42.0

    def test_float(self):
        assert _coerce_finite_float(3.14) == 3.14

    def test_decimal_string(self):
        assert _coerce_finite_float("12.5") == 12.5

    def test_none(self):
        assert _coerce_finite_float(None) is None

    def test_nan(self):
        assert _coerce_finite_float(float("nan")) is None

    def test_pos_inf(self):
        assert _coerce_finite_float(float("inf")) is None

    def test_neg_inf(self):
        assert _coerce_finite_float(float("-inf")) is None

    def test_empty_string(self):
        assert _coerce_finite_float("") is None

    def test_bool_rejected(self):
        """bool ⊂ int but ratios aren't booleans; reject defensively."""
        assert _coerce_finite_float(True) is None
        assert _coerce_finite_float(False) is None

    def test_unparseable(self):
        assert _coerce_finite_float("abc") is None


# ─── Unit conversions ────────────────────────────────────────────────────


class TestUnitConversions:
    def test_pct_to_fraction_normal(self):
        assert _pct_to_fraction(7.54) == pytest.approx(0.0754)

    def test_pct_to_fraction_none(self):
        assert _pct_to_fraction(None) is None

    def test_pct_to_fraction_zero(self):
        assert _pct_to_fraction(0.0) == 0.0

    def test_crore_to_rupees_normal(self):
        # 1,000 crore → 10,000,000,000 rupees
        assert _crore_to_rupees(1000.0) == 10_000_000_000

    def test_crore_to_rupees_none(self):
        assert _crore_to_rupees(None) is None

    def test_crore_to_rupees_rounds_to_int(self):
        assert _crore_to_rupees(1.5) == 15_000_000


# ─── JSONB builders — synthetic cursor stub ──────────────────────────────


class _StubCursor:
    """Mock cursor that returns canned rows for sequential .execute() calls.

    Each ``execute()`` matches against a list of (sql_substring, rows)
    tuples in order. First match wins; non-matching SQL gets an empty
    result. This lets each test seed exactly the queries it cares about
    without a real DB connection.
    """

    def __init__(self, responses: list[tuple[str, list[dict]]]):
        self._responses = list(responses)
        self._current_rows: list[dict] = []

    def execute(self, sql: str, params=()):
        for needle, rows in self._responses:
            if needle in sql:
                self._current_rows = rows
                return
        self._current_rows = []

    def fetchall(self):
        return list(self._current_rows)

    def fetchone(self):
        return self._current_rows[0] if self._current_rows else None


# ─── _build_income_statement ─────────────────────────────────────────────


def test_income_statement_skips_rid_zero_sentinels():
    """RID=0 visual-divider rows (filtered already by §5 query's
    ``rid > 0``) must not appear in the output even if present."""
    cur = _StubCursor([
        ("FROM cmots_financial_line", [
            # The orchestrator query filters rid > 0 in SQL, but the
            # builder must still skip them defensively if they slip through.
            # Use rid > 0 rows here; the SQL filter is the primary defense.
            {"period": 202503, "rid": 1,  "column_name": "Revenue From Operations", "value": 1071174.0},
            {"period": 202503, "rid": 8,  "column_name": "Revenue From Operations - Net", "value": 964693.0},
            {"period": 202503, "rid": 37, "column_name": "Profit After Tax", "value": 73000.0},
            {"period": 202403, "rid": 8,  "column_name": "Revenue From Operations - Net", "value": 901064.0},
        ]),
    ])
    out = _build_income_statement(cur, 476)
    assert set(out.keys()) == {"2025-03-31", "2024-03-31"}
    assert out["2025-03-31"]["Total Revenue"] == 964693.0
    assert out["2025-03-31"]["Net Income"] == 73000.0
    # RID1 is pass-through under its CMOTS label
    assert out["2025-03-31"]["Revenue From Operations"] == 1071174.0


def test_income_statement_judgment_call_rids_pass_through_under_cmots_label():
    """RIDs not in the canonical map (e.g. RID 33 ``MAT Credit Entitlement``)
    must be preserved using the original CMOTS column_name."""
    cur = _StubCursor([
        ("FROM cmots_financial_line", [
            {"period": 202503, "rid": 33, "column_name": "MAT Credit Entitlement", "value": 500.0},
        ]),
    ])
    out = _build_income_statement(cur, 476)
    assert out["2025-03-31"]["MAT Credit Entitlement"] == 500.0


def test_income_statement_canonical_label_for_rid_8():
    """Critical disambiguation: RID8 (Revenue From Operations - Net) is the
    canonical Total Revenue, NOT RID1 (gross) or RID10 (incl. other income)."""
    cur = _StubCursor([
        ("FROM cmots_financial_line", [
            {"period": 202503, "rid": 1,  "column_name": "Revenue From Operations", "value": 1071174.0},
            {"period": 202503, "rid": 8,  "column_name": "Revenue From Operations - Net", "value": 964693.0},
            {"period": 202503, "rid": 10, "column_name": "Total Revenue", "value": 982671.0},
        ]),
    ])
    out = _build_income_statement(cur, 476)
    assert out["2025-03-31"]["Total Revenue"] == 964693.0  # RID8 wins
    assert out["2025-03-31"]["Revenue From Operations"] == 1071174.0  # RID1 pass-through
    assert out["2025-03-31"]["Total Revenue Including Other Income"] == 982671.0  # RID10 pass-through


# ─── _build_balance_sheet ────────────────────────────────────────────────


def test_balance_sheet_sums_cash_rid_26_and_27():
    """RID26 + RID27 both labeled "Cash and Cash Equivalents" in CMOTS;
    they must be summed into a single canonical field."""
    cur = _StubCursor([
        ("FROM cmots_financial_line", [
            # First query: rid > 0 main set
            {"period": 202503, "rid": 26, "column_name": "Cash and Cash Equivalents", "value": 100.0},
            {"period": 202503, "rid": 27, "column_name": "Cash and Cash Equivalents", "value": 50.0},
            {"period": 202503, "rid": 40, "column_name": "TOTAL ASSETS", "value": 9999.0},
        ]),
        # Cash-summing follow-up query is matched by the same SQL fragment
        # below; the stub returns it on the second .execute() because the
        # main-set rows have been consumed.
    ])
    # Override to return cash rows on the second execute (rid IN (26, 27)).
    cur._responses = [
        ("AND rid > 0", [
            {"period": 202503, "rid": 26, "column_name": "Cash and Cash Equivalents", "value": 100.0},
            {"period": 202503, "rid": 27, "column_name": "Cash and Cash Equivalents", "value": 50.0},
            {"period": 202503, "rid": 40, "column_name": "TOTAL ASSETS", "value": 9999.0},
        ]),
        ("AND rid IN (26, 27)", [
            {"period": 202503, "rid": 26, "value": 100.0},
            {"period": 202503, "rid": 27, "value": 50.0},
        ]),
    ]
    out = _build_balance_sheet(cur, 476)
    assert out["2025-03-31"]["Cash And Cash Equivalents"] == 150.0  # 100 + 50
    assert out["2025-03-31"]["Total Assets"] == 9999.0


def test_balance_sheet_single_cash_rid_no_sum():
    """If only one of RID26/27 has data, the sum is just that one value."""
    cur = _StubCursor([])
    cur._responses = [
        ("AND rid > 0", [
            {"period": 202503, "rid": 26, "column_name": "Cash and Cash Equivalents", "value": 100.0},
            {"period": 202503, "rid": 40, "column_name": "TOTAL ASSETS", "value": 9999.0},
        ]),
        ("AND rid IN (26, 27)", [
            {"period": 202503, "rid": 26, "value": 100.0},
        ]),
    ]
    out = _build_balance_sheet(cur, 476)
    assert out["2025-03-31"]["Cash And Cash Equivalents"] == 100.0


# ─── _build_cash_flow with derived Free Cash Flow ────────────────────────


def test_cash_flow_derives_free_cash_flow():
    """Free Cash Flow = Operating CF (RID67) − Capex (RID71) when both present."""
    cur = _StubCursor([
        ("FROM cmots_financial_line", [
            {"period": 202503, "rid": 67, "column_name": "Net Cash Generated from Operations", "value": 1000.0},
            {"period": 202503, "rid": 71, "column_name": "Capital Expenditure", "value": 300.0},
        ]),
    ])
    out = _build_cash_flow(cur, 476)
    assert out["2025-03-31"]["Operating Cash Flow"] == 1000.0
    assert out["2025-03-31"]["Capital Expenditure"] == 300.0
    assert out["2025-03-31"]["Free Cash Flow"] == 700.0


def test_cash_flow_no_fcf_when_capex_missing():
    """FCF should NOT be derived if either input is missing."""
    cur = _StubCursor([
        ("FROM cmots_financial_line", [
            {"period": 202503, "rid": 67, "column_name": "Net Cash Generated from Operations", "value": 1000.0},
        ]),
    ])
    out = _build_cash_flow(cur, 476)
    assert out["2025-03-31"]["Operating Cash Flow"] == 1000.0
    assert "Free Cash Flow" not in out["2025-03-31"]


def test_cash_flow_uses_rid_67_not_rid_53():
    """Operating Cash Flow canonical is RID67 (post-extraordinary),
    NOT RID53 (sub-total before extraordinary items)."""
    cur = _StubCursor([
        ("FROM cmots_financial_line", [
            {"period": 202503, "rid": 53, "column_name": "Net Cash Used in Operating Activities", "value": 800.0},
            {"period": 202503, "rid": 67, "column_name": "Net Cash Generated from Operations", "value": 1000.0},
        ]),
    ])
    out = _build_cash_flow(cur, 476)
    assert out["2025-03-31"]["Operating Cash Flow"] == 1000.0  # RID67
    # RID53 is not in the canonical map; passes through under CMOTS label
    assert out["2025-03-31"]["Net Cash Used in Operating Activities"] == 800.0


# ─── _build_quarterly_financials ─────────────────────────────────────────


def test_quarterly_financials_iso_date_outer_key():
    """Quarterly outer keys are ISO dates per locked plan decision."""
    cur = _StubCursor([
        ("FROM cmots_financial_line", [
            {"period": 202506, "rid": 5,  "column_name": "Total Income", "value": 250000.0},
            {"period": 202506, "rid": 30, "column_name": "Net Profit", "value": 20000.0},
            {"period": 202503, "rid": 5,  "column_name": "Total Income", "value": 240000.0},
        ]),
    ])
    out = _build_quarterly_financials(cur, 476)
    assert set(out.keys()) == {"2025-06-30", "2025-03-31"}
    assert out["2025-06-30"]["Total Revenue"] == 250000.0
    assert out["2025-06-30"]["Net Income"] == 20000.0


# ─── Null value handling ─────────────────────────────────────────────────


def test_null_cell_value_preserved_as_none():
    """Null cells (returned as None from DB) are stored as None, not skipped."""
    cur = _StubCursor([
        ("FROM cmots_financial_line", [
            {"period": 202503, "rid": 8,  "column_name": "Revenue From Operations - Net", "value": 1000.0},
            {"period": 202503, "rid": 37, "column_name": "Profit After Tax", "value": None},
        ]),
    ])
    out = _build_income_statement(cur, 476)
    assert out["2025-03-31"]["Total Revenue"] == 1000.0
    assert out["2025-03-31"]["Net Income"] is None


def test_nan_value_coerced_to_none():
    """NaN values from the DB are converted to None via _coerce_finite_float."""
    cur = _StubCursor([
        ("FROM cmots_financial_line", [
            {"period": 202503, "rid": 37, "column_name": "Profit After Tax", "value": float("nan")},
        ]),
    ])
    out = _build_income_statement(cur, 476)
    assert out["2025-03-31"]["Net Income"] is None


# ─── Integration: real DB roundtrip ──────────────────────────────────────


@pytest.mark.integration
def test_backfill_one_ticker_reliance_roundtrip_idempotent(db_cursor):
    """Drive backfill_one_ticker against dev DB (RELIANCE co_code=476).
    Assert: data_source='cmots', JSONB keys are ISO dates, scalars
    populated, derived growth fields finite or None (never NaN/Inf),
    idempotent re-run produces identical row count.

    Uses the test fixture's connection so writes roll back at teardown.
    Wraps the connection's .commit() so backfill_one_ticker can call it
    without leaking past the fixture's rollback.
    """
    class _NoCommitProxy:
        def __init__(self, conn):
            self._conn = conn

        def __getattr__(self, name):
            return getattr(self._conn, name)

        def commit(self):
            pass  # rely on fixture rollback at teardown

    work_conn = _NoCommitProxy(db_cursor.connection)
    result = backfill_one_ticker(work_conn, 476)
    assert result["status"] == "ok"
    assert result["ticker_id"] is not None

    # Readback
    db_cursor.execute(
        """
        SELECT data_source, cmots_synced_at,
               long_name, website,
               market_cap, trailing_pe, price_to_book,
               return_on_equity, return_on_assets,
               revenue_growth, earnings_growth,
               income_statement, balance_sheet, cash_flow, quarterly_financials,
               dividends_history
          FROM stock_fundamentals
         WHERE ticker_id = %s
        """,
        (result["ticker_id"],),
    )
    row = db_cursor.fetchone()
    assert row is not None
    assert row["data_source"] == "cmots"
    assert row["cmots_synced_at"] is not None
    assert row["long_name"] == "Reliance Industries Ltd"
    assert row["website"] == "http://www.ril.com"

    # Scalars populated (not None) for RELIANCE
    assert row["market_cap"] is not None and row["market_cap"] > 0
    assert row["trailing_pe"] is not None and row["trailing_pe"] > 0
    assert row["price_to_book"] is not None
    assert row["return_on_equity"] is not None

    # YoY growth: finite or None (never NaN/Inf — _coerce_finite_float + safe_growth)
    if row["revenue_growth"] is not None:
        rg = float(row["revenue_growth"])
        assert math.isfinite(rg)
    if row["earnings_growth"] is not None:
        eg = float(row["earnings_growth"])
        assert math.isfinite(eg)

    # JSONB shape — outer keys are ISO date strings
    iso = row["income_statement"]
    assert isinstance(iso, dict)
    assert len(iso) == 10  # 10 years
    for k in iso.keys():
        assert len(k) == 10 and k[4] == "-" and k[7] == "-", f"bad ISO key: {k!r}"
    # Total Revenue (= RID8) populated for FY25
    assert "Total Revenue" in iso["2025-03-31"]
    assert iso["2025-03-31"]["Total Revenue"] is not None
    assert iso["2025-03-31"]["Total Revenue"] > 800_000  # ~₹9.6 lakh cr

    # Net Income (RID37) populated
    assert "Net Income" in iso["2025-03-31"]
    assert iso["2025-03-31"]["Net Income"] is not None

    # Balance sheet — Cash And Cash Equivalents derived from RID26+27
    bs = row["balance_sheet"]
    assert "Cash And Cash Equivalents" in bs["2025-03-31"]
    assert bs["2025-03-31"]["Total Assets"] is not None

    # Cash flow — Operating Cash Flow + derived Free Cash Flow
    cf = row["cash_flow"]
    assert "Operating Cash Flow" in cf["2025-03-31"]
    assert cf["2025-03-31"]["Operating Cash Flow"] is not None
    # FCF should be derived (OCF + Capex both present)
    assert "Free Cash Flow" in cf["2025-03-31"]

    # Quarterly financials — 40 quarters of data for RELIANCE
    qf = row["quarterly_financials"]
    assert len(qf) == 40

    # Dividends history — at least 1 dividend event (RELIANCE pays annually)
    dh = row["dividends_history"]
    assert isinstance(dh, dict)
    assert len(dh) >= 1

    # Idempotent re-run: same row, no duplicates (UNIQUE on ticker_id).
    result2 = backfill_one_ticker(work_conn, 476)
    assert result2["status"] == "ok"
    assert result2["ticker_id"] == result["ticker_id"]
    db_cursor.execute(
        "SELECT count(*) AS n FROM stock_fundamentals WHERE ticker_id = %s",
        (result["ticker_id"],),
    )
    assert db_cursor.fetchone()["n"] == 1


@pytest.mark.integration
def test_backfill_one_ticker_handles_uncovered_co_code(db_cursor):
    """Backfill against a co_code that has no tickers row returns
    status='skipped' rather than raising."""
    class _NoCommitProxy:
        def __init__(self, conn):
            self._conn = conn

        def __getattr__(self, name):
            return getattr(self._conn, name)

        def commit(self):
            pass

    work_conn = _NoCommitProxy(db_cursor.connection)
    # 999000 + 999 = reserved test range, guaranteed to have no tickers row
    result = backfill_one_ticker(work_conn, TEST_CO_CODE_RANGE_START + 999)
    assert result["status"] == "skipped"
    assert result["ticker_id"] is None
    assert "no tickers row" in result["reason"].lower()


@pytest.mark.integration
def test_build_jsonb_payloads_reliance_shape(db_cursor):
    """build_jsonb_payloads (pure function, no writes) returns the
    expected dict shape for RELIANCE: 4 JSONBs + dividends_history."""
    out = build_jsonb_payloads(db_cursor, 476)
    assert set(out.keys()) == {
        "income_statement", "balance_sheet", "cash_flow",
        "quarterly_financials", "dividends_history",
    }
    assert len(out["income_statement"]) == 10
    assert len(out["balance_sheet"]) == 10
    assert len(out["cash_flow"]) == 10
    assert len(out["quarterly_financials"]) == 40
    assert isinstance(out["dividends_history"], dict)
