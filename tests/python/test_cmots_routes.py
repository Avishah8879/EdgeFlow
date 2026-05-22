"""Tests for §8 CMOTS route handlers in ``main.py``.

Uses FastAPI's ``TestClient`` so tests run without booting a live server.
Unit tests monkeypatch the accessor module to validate route-level logic
(parameter validation, header check, response shape, error handling).
Integration tests repoint DB_* → TEST_DB_* and hit the real accessors.
"""

from __future__ import annotations

import os
from typing import Any

import pytest


def _make_test_client():
    """Construct a TestClient over the fastapi_app from main.py.

    Skips if FastAPI / starlette is unavailable in the test environment.
    """
    try:
        from fastapi.testclient import TestClient
    except ImportError:
        pytest.skip("fastapi.testclient unavailable")
    # Importing main.py kicks off DB pool init etc. — keep it lazy and
    # wrap in try/except in case env is misconfigured.
    try:
        from main import fastapi_app
    except Exception as exc:
        pytest.skip(f"main.py import failed: {exc}")
    return TestClient(fastapi_app)


@pytest.fixture
def client():
    return _make_test_client()


@pytest.fixture
def admin_env(monkeypatch):
    """Set ADMIN_SECRET_KEY to a known test value for admin-header tests."""
    monkeypatch.setenv("ADMIN_SECRET_KEY", "test-admin-secret-1234")
    yield "test-admin-secret-1234"


@pytest.fixture
def accessor_env(monkeypatch):
    """Repoint DB_* env to TEST_DB_* so accessors hit the dev DB."""
    for src, dst in (
        ("TEST_DB_HOST",     "DB_HOST"),
        ("TEST_DB_PORT",     "DB_PORT"),
        ("TEST_DB_NAME",     "DB_NAME"),
        ("TEST_DB_USER",     "DB_USER"),
        ("TEST_DB_PASSWORD", "DB_PASSWORD"),
    ):
        if src in os.environ:
            monkeypatch.setenv(dst, os.environ[src])
    # Clear sector-medians in-memory cache between tests
    from server import cmots_accessor as acc
    acc.clear_sector_medians_cache()
    yield
    acc.clear_sector_medians_cache()


# ═══════════════════════════════════════════════════════════════════════════
# Parameter validation — unit, no DB
# ═══════════════════════════════════════════════════════════════════════════


class TestFinancialsParameterValidation:
    def test_invalid_statement_type_400(self, client):
        r = client.get("/api/tickers/RELIANCE/financials/BOGUS_TYPE/profit_loss")
        assert r.status_code == 400
        assert "statement_type" in r.json()["error"]["message"]

    def test_invalid_report_400(self, client):
        r = client.get("/api/tickers/RELIANCE/financials/consolidated/BOGUS_REPORT")
        assert r.status_code == 400
        assert "report" in r.json()["error"]["message"]

    def test_case_insensitive_statement_type_accepted(self, client, accessor_env):
        # Mixed case → normalized to lowercase, should succeed
        r = client.get("/api/tickers/INFY/financials/Consolidated/profit_loss")
        assert r.status_code == 200


class TestRatiosParameterValidation:
    def test_invalid_period_400(self, client):
        r = client.get("/api/tickers/RELIANCE/ratios/BOGUS_PERIOD")
        assert r.status_code == 400
        assert "period" in r.json()["error"]["message"]

    @pytest.mark.parametrize("period", ["yearly", "quarterly", "daily"])
    def test_valid_periods_accepted(self, client, accessor_env, period):
        r = client.get(f"/api/tickers/INFY/ratios/{period}")
        assert r.status_code == 200


class TestNarrativesParameterValidation:
    def test_invalid_doc_type_400(self, client):
        r = client.get("/api/tickers/RELIANCE/narratives/BOGUS_DOC")
        assert r.status_code == 400
        assert "doc_type" in r.json()["error"]["message"]


# ═══════════════════════════════════════════════════════════════════════════
# Admin header check — unit, no DB
# ═══════════════════════════════════════════════════════════════════════════


class TestAdminHeaderCheck:
    def test_missing_header_returns_401(self, client, admin_env):
        r = client.get("/api/admin/cmots/sync-state")
        assert r.status_code == 401
        assert "X-Admin-Secret" in r.json()["error"]["message"]

    def test_empty_header_returns_401(self, client, admin_env):
        r = client.get(
            "/api/admin/cmots/sync-state",
            headers={"X-Admin-Secret": ""},
        )
        assert r.status_code == 401

    def test_wrong_secret_returns_401(self, client, admin_env):
        r = client.get(
            "/api/admin/cmots/sync-state",
            headers={"X-Admin-Secret": "wrong-secret-xyz"},
        )
        assert r.status_code == 401

    def test_correct_secret_admits(self, client, admin_env, accessor_env):
        r = client.get(
            "/api/admin/cmots/sync-state",
            headers={"X-Admin-Secret": admin_env},
        )
        # Either 200 (state row exists) or 500 if dev DB unreachable —
        # the header check itself passed (not 401)
        assert r.status_code != 401

    def test_unset_env_var_returns_503(self, client, monkeypatch):
        """When ADMIN_SECRET_KEY env var is unset, admin endpoints must NOT
        allow access — even with no header (defensive: prevents None==None
        accidental match)."""
        monkeypatch.delenv("ADMIN_SECRET_KEY", raising=False)
        r = client.get("/api/admin/cmots/sync-state")
        assert r.status_code == 503
        assert "ADMIN_SECRET_KEY" in r.json()["error"]["message"]

    def test_unset_env_var_returns_503_even_with_header(self, client, monkeypatch):
        """Defensive: providing a header when env var is unset must still
        be rejected (can't match an unset secret)."""
        monkeypatch.delenv("ADMIN_SECRET_KEY", raising=False)
        r = client.get(
            "/api/admin/cmots/sync-state",
            headers={"X-Admin-Secret": "anything"},
        )
        assert r.status_code == 503


# ═══════════════════════════════════════════════════════════════════════════
# Integration: covered + uncovered ticker round-trips
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.integration
class TestHasCmotsDataEndpoint:
    def test_covered_returns_true(self, client, accessor_env):
        r = client.get("/api/tickers/RELIANCE/has-cmots-data")
        assert r.status_code == 200
        body = r.json()
        assert body["data"]["has_cmots_data"] is True

    def test_uncovered_returns_false(self, client, accessor_env):
        r = client.get("/api/tickers/INFY/has-cmots-data")
        assert r.status_code == 200
        assert r.json()["data"]["has_cmots_data"] is False

    def test_case_insensitive(self, client, accessor_env):
        for sym in ("RELIANCE", "reliance", "Reliance"):
            r = client.get(f"/api/tickers/{sym}/has-cmots-data")
            assert r.status_code == 200
            assert r.json()["data"]["has_cmots_data"] is True


@pytest.mark.integration
class TestFinancialsEndpoint:
    def test_reliance_profit_loss_populated(self, client, accessor_env):
        r = client.get("/api/tickers/RELIANCE/financials/consolidated/profit_loss")
        assert r.status_code == 200
        wt = r.json()["data"]
        assert len(wt["periods"]) == 10
        assert wt["periods"][0] == "2025-03-31"

    def test_uncovered_returns_empty_widetable(self, client, accessor_env):
        r = client.get("/api/tickers/INFY/financials/consolidated/profit_loss")
        assert r.status_code == 200
        assert r.json()["data"] == {"periods": [], "labels": [], "data": []}


@pytest.mark.integration
class TestRatiosEndpoint:
    def test_reliance_daily_flat_dict(self, client, accessor_env):
        r = client.get("/api/tickers/RELIANCE/ratios/daily")
        assert r.status_code == 200
        d = r.json()["data"]
        # Flat dict shape — no WideTable keys
        assert "periods" not in d
        assert d.get("PE") == pytest.approx(19.21, abs=0.01)
        # co_code stripped
        assert "co_code" not in d

    def test_reliance_yearly_widetable(self, client, accessor_env):
        r = client.get("/api/tickers/RELIANCE/ratios/yearly")
        assert r.status_code == 200
        wt = r.json()["data"]
        assert "pe" in wt["labels"]
        assert wt["periods"][0] == "2025-03-31"

    def test_uncovered_daily_empty_dict(self, client, accessor_env):
        r = client.get("/api/tickers/INFY/ratios/daily")
        assert r.status_code == 200
        assert r.json()["data"] == {}

    def test_uncovered_yearly_empty_widetable(self, client, accessor_env):
        r = client.get("/api/tickers/INFY/ratios/yearly")
        assert r.status_code == 200
        assert r.json()["data"] == {"periods": [], "labels": [], "data": []}


@pytest.mark.integration
class TestCorporateActionsEndpoint:
    def test_reliance_all(self, client, accessor_env):
        r = client.get("/api/tickers/RELIANCE/corporate-actions")
        assert r.status_code == 200
        rows = r.json()["data"]
        assert isinstance(rows, list)
        assert len(rows) > 0

    def test_reliance_dividend_filter(self, client, accessor_env):
        r = client.get("/api/tickers/RELIANCE/corporate-actions?type=dividend")
        assert r.status_code == 200
        rows = r.json()["data"]
        for row in rows:
            assert row["action_type"] == "dividend"

    def test_uncovered_empty_list(self, client, accessor_env):
        r = client.get("/api/tickers/INFY/corporate-actions")
        assert r.status_code == 200
        assert r.json()["data"] == []


@pytest.mark.integration
class TestAnnouncementsEndpoint:
    def test_reliance(self, client, accessor_env):
        r = client.get("/api/tickers/RELIANCE/announcements")
        assert r.status_code == 200
        assert isinstance(r.json()["data"], list)

    def test_with_ratings_only_filter(self, client, accessor_env):
        r = client.get("/api/tickers/RELIANCE/announcements?with_ratings_only=true")
        assert r.status_code == 200
        for row in r.json()["data"]:
            assert row["rating"] is not None

    def test_uncovered_empty(self, client, accessor_env):
        r = client.get("/api/tickers/INFY/announcements")
        assert r.status_code == 200
        assert r.json()["data"] == []


@pytest.mark.integration
class TestProsConsEndpoint:
    def test_reliance_shape(self, client, accessor_env):
        r = client.get("/api/tickers/RELIANCE/pros-cons")
        assert r.status_code == 200
        rows = r.json()["data"]
        for entry in rows:
            assert set(entry.keys()) == {"type", "label", "detail"}
            assert entry["type"] in ("pro", "con", "info")

    def test_uncovered_empty(self, client, accessor_env):
        r = client.get("/api/tickers/INFY/pros-cons")
        assert r.status_code == 200
        assert r.json()["data"] == []


@pytest.mark.integration
class TestCreditRatingsEndpoint:
    def test_uncovered_empty(self, client, accessor_env):
        r = client.get("/api/tickers/INFY/credit-ratings")
        assert r.status_code == 200
        assert r.json()["data"] == []


@pytest.mark.integration
class TestShareholdingCmotsEndpoint:
    """The CMOTS-native shareholding endpoint (WideTable)."""
    def test_reliance_widetable(self, client, accessor_env):
        r = client.get("/api/tickers/RELIANCE/shareholding")
        assert r.status_code == 200
        wt = r.json()["data"]
        assert "Promoter %" in wt["labels"]
        assert len(wt["periods"]) > 0


@pytest.mark.integration
class TestNarrativesEndpoint:
    def test_uncovered_empty(self, client, accessor_env):
        r = client.get("/api/tickers/INFY/narratives/director_report")
        assert r.status_code == 200
        assert r.json()["data"] == []


@pytest.mark.integration
class TestSectorMediansEndpoint:
    def test_unknown_sector_empty_shape(self, client, accessor_env):
        r = client.get("/api/sectors/Nonexistent%20Sector/medians")
        assert r.status_code == 200
        body = r.json()["data"]
        assert body["n_tickers"] == 0
        assert body["metrics"] == {}


@pytest.mark.integration
class TestScreenerBundleEndpoint:
    def test_reliance_populated(self, client, accessor_env):
        r = client.get("/api/tickers/RELIANCE/screener")
        assert r.status_code == 200
        b = r.json()["data"]
        assert b["ticker"]["symbol"] == "RELIANCE"
        assert b["ticker"]["co_code"] == 476
        assert len(b["profit_loss"]["periods"]) == 10

    def test_uncovered_empty_bundle(self, client, accessor_env):
        r = client.get("/api/tickers/INFY/screener")
        assert r.status_code == 200
        b = r.json()["data"]
        assert b["ticker"]["symbol"] == "INFY"
        assert b["profit_loss"] == {"periods": [], "labels": [], "data": []}
        assert b["pros_cons"] == []


# ═══════════════════════════════════════════════════════════════════════════
# Modified /api/shareholding/{ticker} — CMOTS branch for covered, scraper
# fallback for uncovered
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.integration
class TestShareholdingLegacyEndpointBranching:
    """The legacy endpoint must:
      - Return scraper-shape with CMOTS data for covered tickers
      - Fall through to the Selenium scraper for uncovered tickers
        (we only verify the response shape — scraper may or may not
         succeed against a live screener.in fetch).
    """

    def test_covered_ticker_returns_scraper_shape_from_cmots(self, client, accessor_env):
        r = client.get("/api/shareholding/RELIANCE?view=quarterly")
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert body["symbol"] == "RELIANCE"
        assert body["view"] == "quarterly"
        # Category set matches the locked CATEGORY_KEYS
        categories = {row["category"] for row in body["data"]}
        assert categories == {"Promoters", "FIIs", "DIIs", "Public", "Government"}
        # Custodian must NOT appear (filed in TODO_CMOTS.md)
        assert "Custodian" not in categories
        # Pretty period labels
        assert all(
            len(q.split()) == 2 and q.split()[0] in
            ("Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec")
            for q in body["quarters"]
        )
        # chart_data oldest-first, dict per period
        if len(body["chart_data"]) >= 2:
            # Verify it really is oldest-first by checking year order
            years = []
            for point in body["chart_data"]:
                year = int(point["quarter"].split()[1])
                years.append(year)
            assert years == sorted(years), "chart_data must be oldest-first"
        # Individual-holder lists empty for CMOTS branch
        assert all(row["shareholders"] == [] for row in body["data"])

    def test_covered_ticker_yearly_view_distinct_on_year(self, client, accessor_env):
        r = client.get("/api/shareholding/RELIANCE?view=yearly")
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        # Yearly view should have ≤ ~11 rows (one per calendar year of data)
        assert 1 <= len(body["quarters"]) <= 12
        # Each year appears at most once in the quarters list
        years_seen = [q.split()[1] for q in body["quarters"]]
        assert len(years_seen) == len(set(years_seen)), "DISTINCT ON failed — duplicate calendar years"

    def test_itc_yearly_view_handles_december_year_end(self, client, accessor_env):
        """ITC has December calendar-year snapshots, not March. The DISTINCT
        ON (yrc/100) approach must surface them rather than producing 0 rows."""
        r = client.get("/api/shareholding/ITC?view=yearly")
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert len(body["quarters"]) >= 5, "ITC yearly view must have multiple years"
        # At least some labels should be "Dec YYYY" rather than all-empty
        dec_labels = [q for q in body["quarters"] if q.startswith("Dec ")]
        assert len(dec_labels) >= 1, "ITC yearly missing Dec rows"


# ═══════════════════════════════════════════════════════════════════════════
# Admin coverage + sync-state endpoints — integration
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.integration
class TestAdminCoverageEndpoint:
    def test_returns_covered_ticker_list(self, client, admin_env, accessor_env):
        r = client.get(
            "/api/admin/cmots/coverage",
            headers={"X-Admin-Secret": admin_env},
        )
        assert r.status_code == 200
        body = r.json()["data"]
        # Dev DB has 115 covered tickers per §6 end-state
        assert body["total"] == 115
        assert len(body["tickers"]) <= body["limit"]
        # Shape check on first row
        if body["tickers"]:
            row = body["tickers"][0]
            assert set(row.keys()) >= {"co_code", "symbol", "name", "last_synced_at", "cmots_disabled"}

    def test_pagination_offset(self, client, admin_env, accessor_env):
        r = client.get(
            "/api/admin/cmots/coverage?limit=5&offset=10",
            headers={"X-Admin-Secret": admin_env},
        )
        assert r.status_code == 200
        body = r.json()["data"]
        assert len(body["tickers"]) <= 5
        assert body["offset"] == 10

    def test_admin_endpoints_require_header(self, client, admin_env):
        r = client.get("/api/admin/cmots/coverage")
        assert r.status_code == 401


@pytest.mark.integration
class TestAdminSyncStateEndpoint:
    def test_returns_state_row(self, client, admin_env, accessor_env):
        r = client.get(
            "/api/admin/cmots/sync-state",
            headers={"X-Admin-Secret": admin_env},
        )
        assert r.status_code == 200
        body = r.json()["data"]
        # Either a populated row or the never_run sentinel
        assert "status" in body
