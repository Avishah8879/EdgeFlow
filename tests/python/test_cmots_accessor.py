"""Tests for ``server/cmots_accessor.py`` (§7).

Covers:
  - Empty-shape contract for every accessor when the gate fails
  - Gate logic (has_cmots_data=FALSE, cmots_disabled=TRUE, co_code IS NULL,
    unknown symbol all → empty)
  - Integration: 3 covered tickers (RELIANCE, ITC, BAJAJHLDNG) + 3
    uncovered, shape + sample-value spot checks
  - WideTable shape conformance (periods/labels/data lengths align)
  - Sector medians in-memory cache hit/miss + invalidation
  - Pros/Cons rule engine produces the §9.3 ``{type, label, detail}`` shape
"""

from __future__ import annotations

import datetime
from typing import Any

import pytest

from conftest import TEST_CO_CODE_RANGE_START
from server import cmots_accessor as acc


# ─── Empty-shape factories ─────────────────────────────────────────────────


def test_empty_wide_table_shape():
    """WideTable has three keys with empty lists when no data."""
    assert acc._empty_wide_table() == {"periods": [], "labels": [], "data": []}


def test_empty_screener_bundle_has_all_sections():
    """ScreenerBundle has every §9.6 section populated with empty containers."""
    b = acc._empty_screener_bundle("FOO")
    # Identity
    assert b["ticker"]["symbol"] == "FOO"
    # Required WideTable sections
    for k in ("quarterly_results", "profit_loss", "balance_sheet", "cash_flow",
              "yearly_results", "ratios_yearly", "ratios_quarterly", "shareholding"):
        assert b[k] == {"periods": [], "labels": [], "data": []}, f"{k} not empty WideTable"
    # Required list sections
    for k in ("directors", "dividends", "bonus", "splits", "book_closure",
              "board_meetings", "peers", "pros_cons", "credit_ratings"):
        assert b[k] == [], f"{k} not empty list"
    # Required dict sections
    assert b["key_metrics"] == {}
    assert b["benchmarks"]  == {}
    assert b["documents"]   == {}


# ─── Gate logic with synthetic cursor ──────────────────────────────────────


class _CursorStub:
    """Mock cursor returning canned rows for a specific SQL substring."""
    def __init__(self, response: list[dict] | None = None):
        self.response = response or []
        self.last_sql: str | None = None
        self.last_params: tuple | None = None

    def execute(self, sql: str, params=()):
        self.last_sql = sql
        self.last_params = params

    def fetchone(self):
        return self.response[0] if self.response else None

    def fetchall(self):
        return list(self.response)


def test_resolve_co_code_returns_int_when_gate_passes():
    cur = _CursorStub([{"co_code": 476}])
    assert acc._resolve_co_code(cur, "RELIANCE") == 476


def test_resolve_co_code_returns_none_when_ticker_unknown():
    cur = _CursorStub([])  # SQL returned no rows
    assert acc._resolve_co_code(cur, "UNKNOWN_TICKER_XYZ") is None


def test_resolve_co_code_returns_none_when_empty_symbol():
    cur = _CursorStub([{"co_code": 1}])  # cursor wouldn't even be called
    assert acc._resolve_co_code(cur, "") is None
    assert acc._resolve_co_code(cur, "   ") is None
    assert acc._resolve_co_code(cur, None) is None  # type: ignore[arg-type]


def test_resolve_co_code_sql_filters_gate_conditions():
    """Verify the SQL explicitly checks has_cmots_data + cmots_disabled +
    co_code IS NOT NULL — these conditions are the gate."""
    cur = _CursorStub([{"co_code": 476}])
    acc._resolve_co_code(cur, "reliance")
    sql = cur.last_sql or ""
    assert "has_cmots_data = TRUE" in sql
    assert "cmots_disabled" in sql
    assert "co_code IS NOT NULL" in sql
    # Case-insensitive symbol match
    assert "UPPER(symbol)" in sql
    assert cur.last_params == ("RELIANCE",)


# ─── Mapping tables sanity ─────────────────────────────────────────────────


def test_report_key_map_covers_all_five_reports():
    assert set(acc._REPORT_KEY_MAP.keys()) == {
        "profit_loss", "balance_sheet", "cash_flow", "quarterly", "yearly"
    }


def test_ratio_yearly_cols_count():
    """22 yearly ratio columns per cmots_ratio_yearly migration 032."""
    assert len(acc._RATIO_YEARLY_COLS) == 22


def test_ratio_quarterly_cols_count():
    """15 quarterly ratio columns (subset of yearly per §6 fix)."""
    assert len(acc._RATIO_QUARTERLY_COLS) == 15
    assert set(acc._RATIO_QUARTERLY_COLS).issubset(set(acc._RATIO_YEARLY_COLS))


def test_sector_median_metrics_count():
    """9 metrics per schema §9.2."""
    assert len(acc._SECTOR_MEDIAN_METRICS) == 9
    labels = [lbl for lbl, _ in acc._SECTOR_MEDIAN_METRICS]
    assert labels == ["PE", "Price_BookValue", "EV_EBITDA", "DividendYield",
                      "ROE", "ROA", "PBIDTIM", "PATM", "EBITM"]


# ─── Sector medians in-memory cache ────────────────────────────────────────


def test_clear_sector_medians_cache_empties_dict():
    """Direct cache-poke test: insert then clear."""
    acc._SECTOR_MEDIANS_CACHE["TestSector"] = {"sector": "TestSector", "n_tickers": 0, "metrics": {}}
    assert "TestSector" in acc._SECTOR_MEDIANS_CACHE
    acc.clear_sector_medians_cache()
    assert "TestSector" not in acc._SECTOR_MEDIANS_CACHE


def test_get_sector_medians_empty_input():
    """Whitespace / empty / None sector → empty shape, no DB call."""
    acc.clear_sector_medians_cache()
    for bad in ("", "   ", None):
        out = acc.get_sector_medians(bad)  # type: ignore[arg-type]
        assert out["n_tickers"] == 0
        assert out["metrics"] == {}


# ─── Pros/Cons helper: _cagr_pct ───────────────────────────────────────────


class TestCagrPct:
    def test_normal_positive_cagr(self):
        # 1.10 ^ (1/5) - 1 ≈ 0.0192 → 1.92%
        assert acc._cagr_pct(110, 100, 5) == pytest.approx(1.9244, abs=0.01)

    def test_doubling_over_5_years(self):
        # 2.0 ^ (1/5) - 1 ≈ 14.87%
        assert acc._cagr_pct(200, 100, 5) == pytest.approx(14.87, abs=0.01)

    def test_oldest_zero_returns_none(self):
        assert acc._cagr_pct(100, 0, 5) is None

    def test_oldest_negative_returns_none(self):
        assert acc._cagr_pct(100, -50, 5) is None

    def test_latest_none_returns_none(self):
        assert acc._cagr_pct(None, 100, 5) is None

    def test_zero_years_returns_none(self):
        assert acc._cagr_pct(110, 100, 0) is None


# ─── Integration: dev DB roundtrip ─────────────────────────────────────────


# All integration tests use the dev DB read-only via the conftest db_cursor
# fixture. The accessors open their OWN connection via DB_* env, so we
# repoint DB_* to TEST_DB_* for the duration of each test.


@pytest.fixture
def _accessor_env(monkeypatch):
    """Repoint DB_* env to TEST_DB_* so accessors hit the dev DB."""
    import os
    for src, dst in (
        ("TEST_DB_HOST",     "DB_HOST"),
        ("TEST_DB_PORT",     "DB_PORT"),
        ("TEST_DB_NAME",     "DB_NAME"),
        ("TEST_DB_USER",     "DB_USER"),
        ("TEST_DB_PASSWORD", "DB_PASSWORD"),
    ):
        if src in os.environ:
            monkeypatch.setenv(dst, os.environ[src])
    # Clear in-memory cache between tests so sector-medians don't leak
    acc.clear_sector_medians_cache()
    yield
    acc.clear_sector_medians_cache()


# ─── has_cmots_data ────────────────────────────────────────────────────────


@pytest.mark.integration
def test_has_cmots_data_true_for_covered(_accessor_env):
    assert acc.has_cmots_data("RELIANCE") is True
    assert acc.has_cmots_data("ITC") is True
    assert acc.has_cmots_data("BAJAJHLDNG") is True


@pytest.mark.integration
def test_has_cmots_data_false_for_uncovered(_accessor_env):
    """Uncovered tickers (exist in tickers but has_cmots_data=FALSE) and
    unknown tickers both return False — never raise."""
    assert acc.has_cmots_data("INFY") is False  # NSE-listed but not in trial sample
    assert acc.has_cmots_data("DOESNOTEXIST_XYZ") is False
    assert acc.has_cmots_data("") is False
    assert acc.has_cmots_data("   ") is False


@pytest.mark.integration
def test_has_cmots_data_case_insensitive(_accessor_env):
    assert acc.has_cmots_data("reliance") is True
    assert acc.has_cmots_data("Reliance") is True
    assert acc.has_cmots_data("RELIANCE") is True


# ─── get_financial_statements ──────────────────────────────────────────────


@pytest.mark.integration
def test_financial_statements_reliance_profit_loss(_accessor_env):
    wt = acc.get_financial_statements("RELIANCE", "consolidated", "profit_loss")
    assert isinstance(wt["periods"], list) and len(wt["periods"]) == 10
    # All periods ISO date, newest-first
    assert wt["periods"][0] == "2025-03-31"
    assert wt["periods"][-1] == "2016-03-31"
    # Labels non-empty
    assert len(wt["labels"]) > 0
    # Data rectangular
    assert len(wt["data"]) == len(wt["labels"])
    for row in wt["data"]:
        assert len(row) == len(wt["periods"])
    # Total Revenue label present (RID8 from §6 backfill)
    # Note: this is the raw CMOTS column_name, not the yfinance-mapped label
    label_set = set(wt["labels"])
    assert "Revenue From Operations - Net" in label_set


@pytest.mark.integration
def test_financial_statements_reliance_quarterly(_accessor_env):
    wt = acc.get_financial_statements("RELIANCE", "consolidated", "quarterly")
    assert len(wt["periods"]) == 40  # 10y × 4 quarters
    # Sort check
    assert wt["periods"] == sorted(wt["periods"], reverse=True)


@pytest.mark.integration
def test_financial_statements_uncovered_empty(_accessor_env):
    wt = acc.get_financial_statements("INFY", "consolidated", "profit_loss")
    assert wt == {"periods": [], "labels": [], "data": []}


@pytest.mark.integration
def test_financial_statements_invalid_args(_accessor_env):
    # Invalid statement_type → empty
    wt = acc.get_financial_statements("RELIANCE", "BOGUS", "profit_loss")
    assert wt == {"periods": [], "labels": [], "data": []}
    # Invalid report → empty
    wt = acc.get_financial_statements("RELIANCE", "consolidated", "BOGUS_REPORT")
    assert wt == {"periods": [], "labels": [], "data": []}


# ─── get_ratios ────────────────────────────────────────────────────────────


@pytest.mark.integration
def test_ratios_yearly_reliance_widetable(_accessor_env):
    wt = acc.get_ratios("RELIANCE", "yearly")
    assert isinstance(wt["periods"], list) and len(wt["periods"]) >= 1
    # All ISO dates, newest-first
    assert wt["periods"][0] == "2025-03-31"
    # 22 ratio labels per migration 032
    assert wt["labels"] == list(acc._RATIO_YEARLY_COLS)
    # pe row exists and FY25 PE is the locked 24.77 from §5 probe
    pe_idx = wt["labels"].index("pe")
    assert wt["data"][pe_idx][0] == pytest.approx(24.77, abs=0.01)


@pytest.mark.integration
def test_ratios_quarterly_reliance(_accessor_env):
    wt = acc.get_ratios("RELIANCE", "quarterly")
    assert len(wt["periods"]) >= 1
    assert wt["labels"] == list(acc._RATIO_QUARTERLY_COLS)


@pytest.mark.integration
def test_ratios_daily_flat_dict_shape(_accessor_env):
    """Daily ratios return flat dict (matches existing fundamentals pattern,
    NOT WideTable)."""
    d = acc.get_ratios("RELIANCE", "daily")
    assert isinstance(d, dict)
    # Not WideTable
    assert "periods" not in d
    assert "labels" not in d
    # co_code stripped from the payload
    assert "co_code" not in d
    # Key metrics present
    assert d.get("PE") == pytest.approx(19.21, abs=0.01)
    assert d.get("PBV") == pytest.approx(2.03, abs=0.01)
    assert d.get("SharesOutstanding") == 13_532_534_996.0


@pytest.mark.integration
def test_ratios_daily_uncovered_empty_dict(_accessor_env):
    """Daily empty shape is flat empty dict, not WideTable."""
    assert acc.get_ratios("INFY", "daily") == {}


@pytest.mark.integration
def test_ratios_yearly_uncovered_empty_widetable(_accessor_env):
    """Yearly/quarterly empty shape is empty WideTable."""
    assert acc.get_ratios("INFY", "yearly") == {"periods": [], "labels": [], "data": []}


# ─── get_shareholding ──────────────────────────────────────────────────────


@pytest.mark.integration
def test_shareholding_reliance_widetable(_accessor_env):
    wt = acc.get_shareholding("RELIANCE")
    assert len(wt["periods"]) >= 1
    assert "Promoter %" in wt["labels"]
    assert "FII %" in wt["labels"]
    promoter_idx = wt["labels"].index("Promoter %")
    # Latest period promoter % should be present (a number)
    assert wt["data"][promoter_idx][0] is not None
    assert wt["data"][promoter_idx][0] > 0


@pytest.mark.integration
def test_shareholding_uncovered_empty(_accessor_env):
    assert acc.get_shareholding("INFY") == {"periods": [], "labels": [], "data": []}


# ─── get_corporate_actions ─────────────────────────────────────────────────


@pytest.mark.integration
def test_corp_actions_reliance_all(_accessor_env):
    out = acc.get_corporate_actions("RELIANCE")
    assert isinstance(out, list)
    assert len(out) > 0
    # Shape check
    for r in out:
        assert set(r.keys()) >= {"action_type", "action_date", "payload", "source_slug"}


@pytest.mark.integration
def test_corp_actions_reliance_dividend_filter(_accessor_env):
    out = acc.get_corporate_actions("RELIANCE", action_type="dividend")
    assert len(out) >= 1
    for r in out:
        assert r["action_type"] == "dividend"


@pytest.mark.integration
def test_corp_actions_uncovered_empty(_accessor_env):
    assert acc.get_corporate_actions("INFY") == []
    assert acc.get_corporate_actions("INFY", action_type="dividend") == []


# ─── get_narratives ────────────────────────────────────────────────────────


@pytest.mark.integration
def test_narratives_reliance(_accessor_env):
    out = acc.get_narratives("RELIANCE")
    assert isinstance(out, list)
    if out:  # may be empty for some tickers
        for r in out:
            assert set(r.keys()) >= {"doc_type", "year", "body_html", "body_text", "fetched_at"}


@pytest.mark.integration
def test_narratives_uncovered_empty(_accessor_env):
    assert acc.get_narratives("INFY") == []


# ─── get_announcements ─────────────────────────────────────────────────────


@pytest.mark.integration
def test_announcements_uncovered_empty(_accessor_env):
    assert acc.get_announcements("INFY") == []
    assert acc.get_announcements("INFY", with_ratings_only=True) == []


@pytest.mark.integration
def test_announcements_with_ratings_only_subset(_accessor_env):
    """with_ratings_only=True must be a subset of with_ratings_only=False."""
    full = acc.get_announcements("RELIANCE")
    rated = acc.get_announcements("RELIANCE", with_ratings_only=True)
    assert len(rated) <= len(full)
    for r in rated:
        assert r["rating"] is not None
        assert r["agency"] is not None


# ─── get_credit_ratings ────────────────────────────────────────────────────


@pytest.mark.integration
def test_credit_ratings_uncovered_empty(_accessor_env):
    assert acc.get_credit_ratings("INFY") == []


@pytest.mark.integration
def test_credit_ratings_same_rowset_as_with_ratings_only(_accessor_env):
    """get_credit_ratings(symbol) and get_announcements(symbol, with_ratings_only=True)
    return the same row count (different output shape)."""
    rated = acc.get_announcements("RELIANCE", with_ratings_only=True)
    ratings = acc.get_credit_ratings("RELIANCE")
    assert len(rated) == len(ratings)


# ─── get_pros_cons ─────────────────────────────────────────────────────────


@pytest.mark.integration
def test_pros_cons_reliance_shape(_accessor_env):
    out = acc.get_pros_cons("RELIANCE")
    assert isinstance(out, list)
    for entry in out:
        assert set(entry.keys()) == {"type", "label", "detail"}
        assert entry["type"] in ("pro", "con", "info")
        assert isinstance(entry["label"], str) and entry["label"]
        assert isinstance(entry["detail"], str) and entry["detail"]


@pytest.mark.integration
def test_pros_cons_uncovered_empty(_accessor_env):
    assert acc.get_pros_cons("INFY") == []


# ─── get_sector_medians ────────────────────────────────────────────────────


@pytest.mark.integration
def test_sector_medians_unknown_sector_empty(_accessor_env):
    out = acc.get_sector_medians("Nonexistent Sector ZZZ")
    assert out["n_tickers"] == 0
    assert out["metrics"] == {}
    assert out["sector"] == "Nonexistent Sector ZZZ"


@pytest.mark.integration
def test_sector_medians_caches_in_memory(_accessor_env):
    """Second call hits the in-memory cache (no DB round-trip)."""
    # First call — populates cache
    first = acc.get_sector_medians("Nonexistent Sector ABC")
    assert "Nonexistent Sector ABC" in acc._SECTOR_MEDIANS_CACHE

    # Mutate the cached entry to detect cache hit
    cached_obj = acc._SECTOR_MEDIANS_CACHE["Nonexistent Sector ABC"]
    cached_obj["_test_marker"] = "cache_hit"

    # Second call should return the same object (cache hit)
    second = acc.get_sector_medians("Nonexistent Sector ABC")
    assert second.get("_test_marker") == "cache_hit", "second call did not hit in-memory cache"


@pytest.mark.integration
def test_sector_medians_invalidation_drops_cache(_accessor_env):
    acc.get_sector_medians("Some Sector For Invalidate Test")
    assert "Some Sector For Invalidate Test" in acc._SECTOR_MEDIANS_CACHE
    acc.clear_sector_medians_cache()
    assert "Some Sector For Invalidate Test" not in acc._SECTOR_MEDIANS_CACHE


# ─── get_screener_bundle ───────────────────────────────────────────────────


@pytest.mark.integration
def test_screener_bundle_reliance_populated(_accessor_env):
    b = acc.get_screener_bundle("RELIANCE")
    assert b["ticker"]["symbol"] == "RELIANCE"
    assert b["ticker"]["co_code"] == 476
    assert b["ticker"]["name"] is not None
    # WideTables populated
    assert len(b["profit_loss"]["periods"]) == 10
    assert len(b["balance_sheet"]["periods"]) == 10
    assert len(b["cash_flow"]["periods"]) == 10
    assert len(b["shareholding"]["periods"]) >= 1
    assert len(b["ratios_yearly"]["periods"]) >= 1
    # Lists populated (RELIANCE has dividends)
    assert isinstance(b["dividends"], list)
    # key_metrics populated from daily ratios
    assert "PE" in b["key_metrics"]
    assert b["key_metrics"]["PE"] == pytest.approx(19.21, abs=0.01)


@pytest.mark.integration
def test_screener_bundle_uncovered_empty(_accessor_env):
    """Uncovered ticker returns the full empty-shape bundle structure."""
    b = acc.get_screener_bundle("INFY")
    assert b["ticker"]["symbol"] == "INFY"
    assert b["profit_loss"] == {"periods": [], "labels": [], "data": []}
    assert b["shareholding"] == {"periods": [], "labels": [], "data": []}
    assert b["dividends"] == []
    assert b["pros_cons"] == []
    assert b["key_metrics"] == {}
    assert b["benchmarks"] == {}


# ─── Three-ticker integration sweep (RELIANCE / ITC / BAJAJHLDNG) ──────────


@pytest.mark.integration
@pytest.mark.parametrize("symbol", ["RELIANCE", "ITC", "BAJAJHLDNG"])
def test_three_covered_tickers_all_accessors_return_populated_shapes(_accessor_env, symbol):
    """Smoke: every accessor returns a non-empty shape for each of the 3
    canonical covered tickers (where data is expected to exist)."""
    assert acc.has_cmots_data(symbol) is True

    pl = acc.get_financial_statements(symbol, "consolidated", "profit_loss")
    assert len(pl["periods"]) > 0, f"{symbol} profit_loss empty"

    ry = acc.get_ratios(symbol, "yearly")
    assert len(ry["periods"]) > 0, f"{symbol} yearly ratios empty"

    rd = acc.get_ratios(symbol, "daily")
    assert isinstance(rd, dict) and len(rd) > 0, f"{symbol} daily ratios empty"

    sh = acc.get_shareholding(symbol)
    assert len(sh["periods"]) > 0, f"{symbol} shareholding empty"

    # Corporate actions: at least Board_Meetings should be present for all 3
    ca_all = acc.get_corporate_actions(symbol)
    assert len(ca_all) > 0, f"{symbol} corporate_actions empty"


@pytest.mark.integration
@pytest.mark.parametrize("symbol", ["INFY", "TCS", "SBIN"])
def test_three_uncovered_tickers_all_accessors_return_empty(_accessor_env, symbol):
    """Every accessor returns the canonical empty shape for these
    NSE-listed-but-not-covered-by-trial-token tickers."""
    assert acc.has_cmots_data(symbol) is False
    assert acc.get_financial_statements(symbol, "consolidated", "profit_loss") == {"periods": [], "labels": [], "data": []}
    assert acc.get_ratios(symbol, "yearly") == {"periods": [], "labels": [], "data": []}
    assert acc.get_ratios(symbol, "daily") == {}
    assert acc.get_shareholding(symbol) == {"periods": [], "labels": [], "data": []}
    assert acc.get_corporate_actions(symbol) == []
    assert acc.get_narratives(symbol) == []
    assert acc.get_announcements(symbol) == []
    assert acc.get_credit_ratings(symbol) == []
    assert acc.get_pros_cons(symbol) == []


# ─── Cache invalidation: invalidate_all_caches ─────────────────────────────


def test_invalidate_all_caches_clears_in_memory_cache(monkeypatch):
    """invalidate_all_caches() must drop the sector-medians dict and also
    call delete_pattern('cmots:*'). Patch delete_pattern to confirm it's
    invoked with the expected pattern."""
    # Seed the in-memory cache
    acc._SECTOR_MEDIANS_CACHE["TestSector_Invalidate"] = {
        "sector": "TestSector_Invalidate", "n_tickers": 1, "metrics": {}
    }
    assert "TestSector_Invalidate" in acc._SECTOR_MEDIANS_CACHE

    # Patch delete_pattern to record the pattern + return a mock count
    called_with: dict[str, Any] = {}
    def fake_delete_pattern(pattern: str) -> int:
        called_with["pattern"] = pattern
        return 42
    monkeypatch.setattr(acc, "delete_pattern", fake_delete_pattern)

    n = acc.invalidate_all_caches()

    assert called_with["pattern"] == "cmots:*"
    assert n == 42
    assert "TestSector_Invalidate" not in acc._SECTOR_MEDIANS_CACHE


def test_invalidate_all_caches_works_when_redis_unavailable(monkeypatch):
    """invalidate_all_caches() must still drop the in-memory cache even
    when Redis is unavailable (delete_pattern returns 0)."""
    acc._SECTOR_MEDIANS_CACHE["TestSector_RedisDown"] = {
        "sector": "TestSector_RedisDown", "n_tickers": 1, "metrics": {}
    }
    monkeypatch.setattr(acc, "delete_pattern", lambda pattern: 0)
    n = acc.invalidate_all_caches()
    assert n == 0
    assert "TestSector_RedisDown" not in acc._SECTOR_MEDIANS_CACHE


# ─── Redis @cache_result decorator wraps every accessor ────────────────────


def test_every_symbol_accessor_is_redis_cached():
    """Smoke: each symbol-keyed accessor must carry the @cache_result
    decorator (so sync-end delete_pattern('cmots:*') actually invalidates
    it). Detected via the function's __wrapped__ attribute presence."""
    cached_fns = (
        acc.has_cmots_data,
        acc.get_financial_statements,
        acc.get_ratios,
        acc.get_shareholding,
        acc.get_corporate_actions,
        acc.get_narratives,
        acc.get_announcements,
        acc.get_credit_ratings,
        acc.get_pros_cons,
        acc.get_screener_bundle,
    )
    for fn in cached_fns:
        # @cache_result wraps with @wraps(func), so __wrapped__ is set
        assert hasattr(fn, "__wrapped__"), f"{fn.__name__} is not @cache_result-wrapped"


def test_get_sector_medians_is_NOT_redis_cached():
    """get_sector_medians uses a separate process-wide in-memory cache
    (NOT Redis) per plan — it should not carry @cache_result."""
    assert not hasattr(acc.get_sector_medians, "__wrapped__")
