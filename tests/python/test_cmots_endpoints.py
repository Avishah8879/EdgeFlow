"""Tests for ``server/cmots_endpoints.py``.

Static assertions on the ``ENDPOINTS`` registry, plus an integration test
for ``seed_endpoints()`` against a real ``cmots_endpoints`` table via the
``db_cursor`` fixture in ``conftest.py`` (rolls back at the end).

Counts note: the schema doc claims 191 endpoints. The notebook source of
truth has 188 distinct templates. We dropped Brand_Logo (returns non-JSON
image bytes, surfaced during the trial sync) and Sector_Wise_Company
(requires sector_code, not co_code) -> registry holds **186**.
Four sections short of the schema doc:
  - Master (11, not 12 — Sector_Wise_Company dropped intentionally)
  - Financial Ratios (31, not 33)
  - IPO DRHP (11, not 12)
  - Company Logos / Brand (2, not 3 — Brand_Logo dropped intentionally)
See ``server/cmots_endpoints.py`` module docstring for the full rationale.
"""

from __future__ import annotations

from collections import Counter

import pytest

from server.cmots_endpoints import ENDPOINTS, seed_endpoints

# Per-section counts as currently in the registry.
EXPECTED_SECTION_COUNTS = {
    "Master": 11,                     # schema doc says 12; Sector_Wise_Company dropped
    "Company Fundamentals": 28,
    "Company Logos / Brand": 2,       # schema doc says 3; Brand_Logo dropped (non-JSON)
    "Company Financial (5y)": 23,
    "Company Financial Ratios": 31,   # schema doc says 33; notebook has 31
    "Corporate Announcements": 22,
    "Initial Public Offering": 9,
    "More On IPOs": 11,
    "IPO DRHP": 11,                   # schema doc says 12; notebook has 11
    "Live News": 2,
    "Super Portfolio": 5,
    "Macro Economic Data": 1,
    "Technical": 30,
}
EXPECTED_TOTAL = 186


# ─── Pure static assertions ────────────────────────────────────────────────


def test_total_count_matches_notebook():
    assert sum(EXPECTED_SECTION_COUNTS.values()) == EXPECTED_TOTAL
    assert len(ENDPOINTS) == EXPECTED_TOTAL


def test_section_counts():
    section_counts = Counter(e["section"] for e in ENDPOINTS)
    for section, expected in EXPECTED_SECTION_COUNTS.items():
        assert section_counts[section] == expected, (
            f"section {section!r}: expected {expected}, got {section_counts[section]}"
        )
    # And no extra/typo'd sections leak in.
    assert set(section_counts) == set(EXPECTED_SECTION_COUNTS)


def test_thirteen_sections():
    sections = {e["section"] for e in ENDPOINTS}
    assert len(sections) == 13


def test_unique_section_slug_pairs():
    """Matches the UNIQUE(section, slug) constraint on cmots_endpoints."""
    seen: set[tuple[str, str]] = set()
    for e in ENDPOINTS:
        key = (e["section"], e["slug"])
        assert key not in seen, f"duplicate (section, slug): {key}"
        seen.add(key)


def test_required_fields_present_and_typed():
    for e in ENDPOINTS:
        for field in ("section", "slug", "report_name", "url_template",
                      "is_ticker_bound", "sort_order"):
            assert field in e, f"missing {field} in {e}"
        assert isinstance(e["is_ticker_bound"], bool)
        assert isinstance(e["sort_order"], int)
        assert e["url_template"].startswith("https://jwttoken.cmots.com/")


def test_ticker_bound_iff_co_code_placeholder():
    """Classifier rule pre-applied at registry build time."""
    for e in ENDPOINTS:
        has_placeholder = "{co_code}" in e["url_template"]
        assert e["is_ticker_bound"] == has_placeholder, (
            f"is_ticker_bound mismatch on {e['slug']}: "
            f"template={e['url_template']!r}"
        )


def test_company_search_is_static_per_schema():
    """CMOTS schema §3 footnote: CompanySearch/<name> is NOT ticker-bound."""
    cs = [e for e in ENDPOINTS if e["slug"] == "Company_Search"]
    assert len(cs) == 1
    assert cs[0]["is_ticker_bound"] is False, (
        "CompanySearch placeholder is a search string, not a cocode"
    )


def test_notes_to_account_year_baked_in():
    """Special-endpoint defaults per plan spec."""
    by_slug = {e["slug"]: e for e in ENDPOINTS}
    assert by_slug["Notes_toAccount"]["url_template"].endswith("/2024")


def test_bonus_rights_topn_baked_in():
    by_slug = {e["slug"]: e for e in ENDPOINTS}
    assert by_slug["Bonus"]["url_template"].endswith("/10")
    assert by_slug["Rights"]["url_template"].endswith("/10")


def test_pivot_freq_variants_present():
    by_slug = {e["slug"]: e for e in ENDPOINTS}
    for freq in ("daily", "weekly", "monthly"):
        assert by_slug[f"PivotClassic_{freq}"]["url_template"].endswith(f"/{freq}")
        assert by_slug[f"PivotFibonacci_{freq}"]["url_template"].endswith(f"/{freq}")


def test_technical_indicator_ratios_uses_nse():
    by_slug = {e["slug"]: e for e in ENDPOINTS}
    assert "/NSE/" in by_slug["TechnicalIndicatorRatios"]["url_template"]
    assert "/NSE/" in by_slug["TechnicalIndicatorRatiosCompanyWise"]["url_template"]


def test_segment_endpoints_have_s_param():
    by_slug = {e["slug"]: e for e in ENDPOINTS}
    assert by_slug["SegmentGeographyWiseNew"]["url_template"].endswith("/s")
    assert by_slug["SegmentProductWiseNew"]["url_template"].endswith("/s")


def test_sc_pairs_in_financial_5y():
    """Each statement-typed financial endpoint has both S and C variants."""
    financial_5y = [e for e in ENDPOINTS if e["section"] == "Company Financial (5y)"]
    slugs = {e["slug"] for e in financial_5y}
    sc_families = [
        "Quarterly_Results", "Profit_and_Loss", "Balance_Sheet", "Cash_Flow",
        "Half_Yearly_Results", "Nine_Month_Result", "Yearly_Results",
        "QuarterlyResults_BalanceSheet", "Results_BalanceSheet_Half_Yearly",
        "Results_BalanceSheet_Yearly",
    ]
    for family in sc_families:
        assert f"{family}_S" in slugs, f"missing {family}_S"
        assert f"{family}_C" in slugs, f"missing {family}_C"


def test_ticker_bound_count_reasonable():
    """Per CMOTS schema §3: roughly ~126/191 are ticker-bound."""
    bound = sum(1 for e in ENDPOINTS if e["is_ticker_bound"])
    # We have 188 total; ~126 bound is the schema's expectation; tolerate a band.
    assert 100 <= bound <= 140, (
        f"ticker-bound count {bound} outside reasonable band [100, 140]"
    )


# ─── Integration: seed_endpoints against a real (rolled-back) DB ───────────


@pytest.mark.integration
def test_seed_endpoints_inserts_correct_count(db_cursor):
    db_cursor.execute("TRUNCATE cmots_endpoints RESTART IDENTITY CASCADE")
    affected = seed_endpoints(db_cursor)
    assert affected == EXPECTED_TOTAL

    db_cursor.execute("SELECT count(*) AS n FROM cmots_endpoints")
    row = db_cursor.fetchone()
    assert row["n"] == EXPECTED_TOTAL


@pytest.mark.integration
def test_seed_endpoints_is_idempotent(db_cursor):
    db_cursor.execute("TRUNCATE cmots_endpoints RESTART IDENTITY CASCADE")
    seed_endpoints(db_cursor)
    seed_endpoints(db_cursor)  # second pass: ON CONFLICT UPDATE
    db_cursor.execute("SELECT count(*) AS n FROM cmots_endpoints")
    assert db_cursor.fetchone()["n"] == EXPECTED_TOTAL


@pytest.mark.integration
def test_seed_endpoints_updates_in_place(db_cursor):
    """Mutate report_name in DB, re-seed, confirm it's restored to canonical."""
    db_cursor.execute("TRUNCATE cmots_endpoints RESTART IDENTITY CASCADE")
    seed_endpoints(db_cursor)
    db_cursor.execute(
        "UPDATE cmots_endpoints SET report_name = 'mutated' "
        "WHERE section = 'Master' AND slug = 'Company_Master'"
    )
    seed_endpoints(db_cursor)
    db_cursor.execute(
        "SELECT report_name FROM cmots_endpoints "
        "WHERE section = 'Master' AND slug = 'Company_Master'"
    )
    assert db_cursor.fetchone()["report_name"] == "Company Master"
