"""CMOTS endpoint registry + ``seed_endpoints`` UPSERTer.

``ENDPOINTS`` is the canonical list of CMOTS API URL templates that the sync
orchestrator iterates. Each entry has:

  - ``section``         human-readable section name (matches CMOTS schema §3)
  - ``slug``            unique-within-section identifier
  - ``report_name``     human-readable report label (used in admin UIs)
  - ``url_template``    full CMOTS URL; ``{co_code}`` placeholder where applicable
  - ``is_ticker_bound`` ``True`` iff the URL takes a per-ticker co_code
  - ``sort_order``      stable sort key (matches notebook order within section)

Classifier rule (CMOTS schema §3): a row is **ticker-bound** if its URL
contains ``{co_code}``. The classifier is **pre-applied at registry build
time**, not at runtime. The schema doc also calls out that
``CompanySearch/<name>`` is NOT ticker-bound (the placeholder is a search
string), which is captured here as static.

Special endpoints with extra path params have sensible defaults baked into
the template (matching the notebook):

  - ``NotesToAccount/{co_code}/2024`` — year=2024
  - ``BonusCocodewise/{co_code}/10`` — topN=10
  - ``RightsCocodewise/{co_code}/10`` — topN=10
  - ``PivotClassic/bse/{co_code}/{freq}`` — exch=bse (lowercase, as in
    notebook); freq variants: daily, weekly, monthly are separate entries
  - ``PivotFibonacci/bse/{co_code}/{freq}`` — same
  - ``TechnicalIndicatorRatios/NSE/{co_code}`` — exch=NSE
  - ``SegmentGeographyWiseNew/{co_code}/s`` — segment-period='s'
  - ``SegmentProductWiseNew/{co_code}/s`` — segment-period='s'

Notes on count discrepancy vs schema doc:
The schema doc claims 191 endpoints total. The notebook source-of-truth
contains 188 distinct templates after de-duplication; this registry holds
**186** after two drops surfaced by the trial-token sync (Brand_Logo,
Sector_Wise_Company — both documented below). The 5 gaps:

  - ``Master``: 11 in registry, 12 in schema doc. **Sector_Wise_Company
    dropped 2026-05-14** — it requires sector_code (8-digit zero-padded),
    not co_code, so the original ticker-bound classification produced 130
    deterministic "data is not available" failures during the trial sync.
    Sector membership is already available via CompanyMaster's
    SectorCode / SectorName fields. If sector constituents become a needed
    feature, re-add as a separate ``Sector_Wise_Company_By_Sector`` entry
    with sector-code fan-out.
  - ``Company Financial Ratios``: 31 in notebook, 33 in schema doc. The
    notebook has S+C pairs for 15 ratio endpoints + Allbasicratio (S only)
    = 31. Two more variants are alluded to in the schema doc (likely
    Allbasicratio_C and a second unnamed pair) but not present in the
    notebook.
  - ``IPO DRHP``: 11 in notebook, 12 in schema doc. One endpoint is
    unaccounted for.
  - ``Company Logos / Brand``: was 3 (Company_Logo per ticker,
    Company_Logo_List full list, Brand_Logo). **Brand_Logo dropped
    intentionally on 2026-05-14**: the endpoint returns raw image bytes
    (JPEG/PNG), not a JSON envelope, so every call surfaces as
    ``CMOTSError('Invalid JSON ...')`` in our pipeline. The logo URL is
    instead served by ``Company_Logo`` (which IS still in the registry):
    it returns ``{"co_code": ..., "Filepath": "https://complogosapi.cmots
    .com/.../<file>.png", "CompanyName": ...}`` — i.e., a JSON envelope
    pointing at the same image asset. Section count now: 2. If/when we
    need to fetch the binary directly, build a separate non-JSON path; do
    not re-add Brand_Logo to this registry.

If/when CMOTS clarifies the other 3 gaps, append entries to the relevant
section list below and bump the per-section count in
``test_cmots_endpoints.py``.
"""

from __future__ import annotations

from typing import Any

try:
    from psycopg2.extras import execute_values  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - exercised in tests without psycopg2
    execute_values = None  # type: ignore[assignment]


_BASE = "https://jwttoken.cmots.com/RGXResearch/api"


def _bound(url_template: str) -> bool:
    """Classifier: ticker-bound iff the template contains ``{co_code}``."""
    return "{co_code}" in url_template


def _e(section: str, slug: str, report_name: str, url: str, sort_order: int) -> dict[str, Any]:
    return {
        "section": section,
        "slug": slug,
        "report_name": report_name,
        "url_template": url,
        "is_ticker_bound": _bound(url),
        "sort_order": sort_order,
    }


# ─── Master (12) ────────────────────────────────────────────────────────────

# Sector_Wise_Company dropped 2026-05-14: the endpoint requires a sector_code
# (8-digit zero-padded, e.g. 00000001 for Agro Chemicals), not a co_code.
# Mis-classified as ticker-bound in the original registry, which produced 130
# deterministic "data is not available" failures during the trial sync. The
# sector data it returns is largely redundant with CompanyMaster's
# SectorCode / SectorName fields. If we need sector constituents as a feature
# later, re-add as a separate Sector_Wise_Company_By_Sector endpoint with
# sector-code fan-out.

_MASTER = [
    _e("Master", "Company_Master",           "Company Master",                          f"{_BASE}/CompanyMaster",                                       1),
    _e("Master", "Group_Index_Codes",        "Group / Index Codes",                     f"{_BASE}/GroupMaster/NSE",                                     2),
    _e("Master", "Index_Wise_Company",       "Index Wise Company",                      f"{_BASE}/IndexWiseComp/26753",                                 3),
    _e("Master", "Index_List",               "Index List",                              f"{_BASE}/IndexList",                                           4),
    _e("Master", "Sector_List",              "Sector List",                             f"{_BASE}/SectorList",                                          5),
    _e("Master", "Company_Listing_Exchange_Information", "Company Listing / Exchange Information", f"{_BASE}/Company-Listing-Exchange-Information/{{co_code}}", 6),
    _e("Master", "Registrar_Details",        "Registrar Details",                       f"{_BASE}/Registrar-Details/{{co_code}}",                       7),
    _e("Master", "Exchange_Holidays",        "Exchange Holidays",                       f"{_BASE}/ExchangeHolidays/BSE",                                8),
    _e("Master", "Result_Data_Declarations", "Result Data Declarations",                f"{_BASE}/ResultDataDeclarations/2026-04-21",                   9),
    _e("Master", "Annual_Report_Data_Declaration_List", "Annual Report Data Declaration List", f"{_BASE}/AnnualDataDeclarations/2026-05-04",            10),
    _e("Master", "Today_Results",            "Today Results",                           f"{_BASE}/Today-Results",                                       11),
]


# ─── Company Fundamentals (28) ──────────────────────────────────────────────

_FUNDAMENTALS = [
    _e("Company Fundamentals", "Company_Profile",                   "Company Profile",            f"{_BASE}/CompanyProfile/{{co_code}}",                  1),
    _e("Company Fundamentals", "CompBackground",                    "Company Background",         f"{_BASE}/CompBackground/{{co_code}}",                  2),
    _e("Company Fundamentals", "Board_Of_Directors",                "Board of Directors",         f"{_BASE}/BoardOfDirectors/{{co_code}}",                3),
    _e("Company Fundamentals", "Director_s_Report",                 "Director's Report",          f"{_BASE}/DirectorsReports/{{co_code}}",                4),
    _e("Company Fundamentals", "Chairman_s_Report",                 "Chairman's Report",          f"{_BASE}/ChairmansReport/{{co_code}}",                 5),
    _e("Company Fundamentals", "Bankers",                           "Bankers",                    f"{_BASE}/Bankers/{{co_code}}",                         6),
    _e("Company Fundamentals", "Biodata",                           "Management Biodata",         f"{_BASE}/Biodata/{{co_code}}",                         7),
    _e("Company Fundamentals", "Auditor_s_Report",                  "Auditor's Report",           f"{_BASE}/AuditorsReports/{{co_code}}",                 8),
    _e("Company Fundamentals", "Notes_toAccount",                   "Notes to Account",           f"{_BASE}/NotesToAccount/{{co_code}}/2024",             9),
    _e("Company Fundamentals", "Finished_Products",                 "Finished Products",          f"{_BASE}/FinishedProducts/{{co_code}}",                10),
    _e("Company Fundamentals", "Raw_Materials",                     "Raw Materials",              f"{_BASE}/RawMaterials/{{co_code}}",                    11),
    _e("Company Fundamentals", "Related_Party_Transaction",         "Related Party Transactions", f"{_BASE}/Related_Party_Transaction/{{co_code}}",       12),
    _e("Company Fundamentals", "Subsidiaries_JVs_Collaborations",   "Subsidiaries / JVs / Collaborations", f"{_BASE}/Subsidiaries_JVs_Collaborations/{{co_code}}", 13),
    _e("Company Fundamentals", "Deferred_Tax",                      "Deferred Tax",               f"{_BASE}/Deferred_Tax/{{co_code}}",                    14),
    _e("Company Fundamentals", "R_and_D",                           "R&D",                        f"{_BASE}/R_and_D/{{co_code}}",                         15),
    _e("Company Fundamentals", "Chronological_History",             "Chronological History",      f"{_BASE}/ChronologicalHistory/{{co_code}}",            16),
    _e("Company Fundamentals", "Company_History",                   "Company History",            f"{_BASE}/CompanyHistory/{{co_code}}",                  17),
    _e("Company Fundamentals", "Locations",                         "Locations",                  f"{_BASE}/locations/{{co_code}}",                       18),
    _e("Company Fundamentals", "Employee_Count",                    "Employee Count",             f"{_BASE}/EmployeeCount/{{co_code}}",                   19),
    _e("Company Fundamentals", "Corporate_Governance",              "Corporate Governance",       f"{_BASE}/CorporateGovernance/{{co_code}}",             20),
    _e("Company Fundamentals", "Capital_structure",                 "Capital Structure",          f"{_BASE}/capital-structure/{{co_code}}",               21),
    _e("Company Fundamentals", "Pledge_Shares_Details",             "Pledge Shares Details",      f"{_BASE}/Pledgesharesdetails/{{co_code}}",             22),
    _e("Company Fundamentals", "Company_Search",                    "Company Search",             f"{_BASE}/CompanySearch/State%20Bank%20of%20India",     23),
    _e("Company Fundamentals", "Substantial_Acquisition",           "Substantial Acquisition (SAST)", f"{_BASE}/SubstantialAcquisition/{{co_code}}",      24),
    _e("Company Fundamentals", "SegmentGeographyWiseNew",           "Segment — Geography",        f"{_BASE}/SegmentGeographyWiseNew/{{co_code}}/s",       25),
    _e("Company Fundamentals", "SegmentProductWiseNew",             "Segment — Product",          f"{_BASE}/SegmentProductWiseNew/{{co_code}}/s",         26),
    _e("Company Fundamentals", "Management_Discussion",             "Management Discussion (MD&A)", f"{_BASE}/ManagementDiscussion/{{co_code}}",          27),
    _e("Company Fundamentals", "Notes_toAccount_All_Years",         "Notes to Account — all years", f"{_BASE}/NotesToAccount/{{co_code}}/-",              28),
]


# ─── Company Logos / Brand (2) ──────────────────────────────────────────────
# Brand_Logo was dropped 2026-05-14 after the trial sync — it returns raw
# image bytes (non-JSON) and Company_Profile carries the logo URL anyway.

_LOGOS = [
    _e("Company Logos / Brand", "Company_Logo",      "Company Logo (per ticker)", f"{_BASE}/CompanyLogo/{{co_code}}", 1),
    _e("Company Logos / Brand", "Company_Logo_List", "Company Logo (full list)",  f"{_BASE}/CompanyLogo/-",           2),
]


# ─── Company Financial (5 years historical) — 23 ───────────────────────────

_FINANCIAL = [
    _e("Company Financial (5y)", "Quarterly_Results_S",                     "Quarterly Results (Standalone)",   f"{_BASE}/QuarterlyResults/{{co_code}}/S",                       1),
    _e("Company Financial (5y)", "Quarterly_Results_C",                     "Quarterly Results (Consolidated)", f"{_BASE}/QuarterlyResults/{{co_code}}/C",                       2),
    _e("Company Financial (5y)", "Profit_and_Loss_S",                       "Profit & Loss (Standalone)",       f"{_BASE}/ProftandLoss/{{co_code}}/S",                           3),
    _e("Company Financial (5y)", "Profit_and_Loss_C",                       "Profit & Loss (Consolidated)",     f"{_BASE}/ProftandLoss/{{co_code}}/C",                           4),
    _e("Company Financial (5y)", "Balance_Sheet_S",                         "Balance Sheet (Standalone)",       f"{_BASE}/BalanceSheet/{{co_code}}/S",                           5),
    _e("Company Financial (5y)", "Balance_Sheet_C",                         "Balance Sheet (Consolidated)",     f"{_BASE}/BalanceSheet/{{co_code}}/C",                           6),
    _e("Company Financial (5y)", "Cash_Flow_S",                             "Cash Flow (Standalone)",           f"{_BASE}/CashFlow/{{co_code}}/S",                               7),
    _e("Company Financial (5y)", "Cash_Flow_C",                             "Cash Flow (Consolidated)",         f"{_BASE}/CashFlow/{{co_code}}/C",                               8),
    _e("Company Financial (5y)", "Half_Yearly_Results_S",                   "Half-Yearly Results (Standalone)", f"{_BASE}/Half-Yearly-Results/{{co_code}}/S",                    9),
    _e("Company Financial (5y)", "Half_Yearly_Results_C",                   "Half-Yearly Results (Consolidated)", f"{_BASE}/Half-Yearly-Results/{{co_code}}/C",                 10),
    _e("Company Financial (5y)", "Nine_Month_Result_S",                     "Nine-Month Results (Standalone)",  f"{_BASE}/Nine-Month-Result/{{co_code}}/S",                      11),
    _e("Company Financial (5y)", "Nine_Month_Result_C",                     "Nine-Month Results (Consolidated)", f"{_BASE}/Nine-Month-Result/{{co_code}}/C",                    12),
    _e("Company Financial (5y)", "Share_Holding_Pattern_Detailed",          "Shareholding Pattern (detailed)",  f"{_BASE}/ShareHoldingPatternDetailed/{{co_code}}",              13),
    _e("Company Financial (5y)", "Aggregate_Share_Holding",                 "Shareholding (aggregate)",         f"{_BASE}/Aggregate-Share-Holding/{{co_code}}",                  14),
    _e("Company Financial (5y)", "Shareholding_more_than_1_percent",        "Shareholding >1%",                 f"{_BASE}/ShareholdingMorethanOnePercent/{{co_code}}",           15),
    _e("Company Financial (5y)", "Yearly_Results_S",                        "Yearly Results (Standalone)",      f"{_BASE}/Yearly-Results/{{co_code}}/S",                         16),
    _e("Company Financial (5y)", "Yearly_Results_C",                        "Yearly Results (Consolidated)",    f"{_BASE}/Yearly-Results/{{co_code}}/C",                         17),
    _e("Company Financial (5y)", "QuarterlyResults_BalanceSheet_S",         "Quarterly Results — Balance Sheet (Standalone)",   f"{_BASE}/QuarterlyResults-BalanceSheet/{{co_code}}/S",  18),
    _e("Company Financial (5y)", "QuarterlyResults_BalanceSheet_C",         "Quarterly Results — Balance Sheet (Consolidated)", f"{_BASE}/QuarterlyResults-BalanceSheet/{{co_code}}/C",  19),
    _e("Company Financial (5y)", "Results_BalanceSheet_Half_Yearly_S",      "Half-Yearly Balance Sheet (Standalone)",   f"{_BASE}/Results-BalanceSheet-Half-yearly/{{co_code}}/S",       20),
    _e("Company Financial (5y)", "Results_BalanceSheet_Half_Yearly_C",      "Half-Yearly Balance Sheet (Consolidated)", f"{_BASE}/Results-BalanceSheet-Half-yearly/{{co_code}}/C",       21),
    _e("Company Financial (5y)", "Results_BalanceSheet_Yearly_S",           "Yearly Balance Sheet (Standalone)",        f"{_BASE}/Results-BalanceSheet-Yearly/{{co_code}}/S",            22),
    _e("Company Financial (5y)", "Results_BalanceSheet_Yearly_C",           "Yearly Balance Sheet (Consolidated)",      f"{_BASE}/Results-BalanceSheet-Yearly/{{co_code}}/C",            23),
]


# ─── Company Financial Ratios (31; schema says 33) ──────────────────────────

_RATIOS = [
    _e("Company Financial Ratios", "Key_Financial_Ratio_S",      "Key Financial Ratios (Standalone)",   f"{_BASE}/KeyFinancialRatios/{{co_code}}/S", 1),
    _e("Company Financial Ratios", "Key_Financial_Ratio_C",      "Key Financial Ratios (Consolidated)", f"{_BASE}/KeyFinancialRatios/{{co_code}}/C", 2),
    _e("Company Financial Ratios", "Margin_Ratio_S",             "Margin Ratios (Standalone)",          f"{_BASE}/MarginRatios/{{co_code}}/S",       3),
    _e("Company Financial Ratios", "Margin_Ratio_C",             "Margin Ratios (Consolidated)",        f"{_BASE}/MarginRatios/{{co_code}}/C",       4),
    _e("Company Financial Ratios", "Performance_Ratios_S",       "Performance Ratios (Standalone)",     f"{_BASE}/PerformanceRatios/{{co_code}}/S",  5),
    _e("Company Financial Ratios", "Performance_Ratios_C",       "Performance Ratios (Consolidated)",   f"{_BASE}/PerformanceRatios/{{co_code}}/C",  6),
    _e("Company Financial Ratios", "Efficiency_Ratios_S",        "Efficiency Ratios (Standalone)",      f"{_BASE}/EfficiencyRatios/{{co_code}}/S",   7),
    _e("Company Financial Ratios", "Efficiency_Ratios_C",        "Efficiency Ratios (Consolidated)",    f"{_BASE}/EfficiencyRatios/{{co_code}}/C",   8),
    _e("Company Financial Ratios", "Financial_Stability_Ratios_S", "Financial Stability Ratios (Standalone)",   f"{_BASE}/FinancialStabilityRatios/{{co_code}}/S", 9),
    _e("Company Financial Ratios", "Financial_Stability_Ratios_C", "Financial Stability Ratios (Consolidated)", f"{_BASE}/FinancialStabilityRatios/{{co_code}}/C", 10),
    _e("Company Financial Ratios", "Valuation_Ratios_S",         "Valuation Ratios (Standalone)",       f"{_BASE}/ValuationRatios/{{co_code}}/S",    11),
    _e("Company Financial Ratios", "Valuation_Ratios_C",         "Valuation Ratios (Consolidated)",     f"{_BASE}/ValuationRatios/{{co_code}}/C",    12),
    _e("Company Financial Ratios", "CashFlow_Ratios_S",          "Cash-Flow Ratios (Standalone)",       f"{_BASE}/CashFlowRatios/{{co_code}}/S",     13),
    _e("Company Financial Ratios", "CashFlow_Ratios_C",          "Cash-Flow Ratios (Consolidated)",     f"{_BASE}/CashFlowRatios/{{co_code}}/C",     14),
    _e("Company Financial Ratios", "Growth_Ratio_S",             "Growth Ratios (Standalone)",          f"{_BASE}/GrowthRatio/{{co_code}}/S",        15),
    _e("Company Financial Ratios", "Growth_Ratio_C",             "Growth Ratios (Consolidated)",        f"{_BASE}/GrowthRatio/{{co_code}}/C",        16),
    _e("Company Financial Ratios", "Liquidity_Ratios_S",         "Liquidity Ratios (Standalone)",       f"{_BASE}/LiquidityRatios/{{co_code}}/S",    17),
    _e("Company Financial Ratios", "Liquidity_Ratios_C",         "Liquidity Ratios (Consolidated)",     f"{_BASE}/LiquidityRatios/{{co_code}}/C",    18),
    _e("Company Financial Ratios", "Daily_Ratios_S",             "Daily/TTM Ratios (Standalone)",       f"{_BASE}/DailyRatios/{{co_code}}/S",        19),
    _e("Company Financial Ratios", "Daily_Ratios_C",             "Daily/TTM Ratios (Consolidated)",     f"{_BASE}/DailyRatios/{{co_code}}/C",        20),
    _e("Company Financial Ratios", "Quarterly_Ratio_S",          "Quarterly Ratios (Standalone)",       f"{_BASE}/QuarterlyRatio/{{co_code}}/S",     21),
    _e("Company Financial Ratios", "Quarterly_Ratio_C",          "Quarterly Ratios (Consolidated)",     f"{_BASE}/QuarterlyRatio/{{co_code}}/C",     22),
    _e("Company Financial Ratios", "Yearly_Ratio_S",             "Yearly Ratios (Standalone)",          f"{_BASE}/YearlyRatio/{{co_code}}/S",        23),
    _e("Company Financial Ratios", "Yearly_Ratio_C",             "Yearly Ratios (Consolidated)",        f"{_BASE}/YearlyRatio/{{co_code}}/C",        24),
    _e("Company Financial Ratios", "Yearly_Result_Based_Ratios_S", "Yearly Result-Based Ratios (Standalone)",   f"{_BASE}/YearlyResultBasedRatios/{{co_code}}/S", 25),
    _e("Company Financial Ratios", "Yearly_Result_Based_Ratios_C", "Yearly Result-Based Ratios (Consolidated)", f"{_BASE}/YearlyResultBasedRatios/{{co_code}}/C", 26),
    _e("Company Financial Ratios", "RatiosReturn_S",             "Return Ratios (Standalone)",          f"{_BASE}/RatiosReturn/{{co_code}}/S",       27),
    _e("Company Financial Ratios", "RatiosReturn_C",             "Return Ratios (Consolidated / Bank)", f"{_BASE}/RatiosReturn/{{co_code}}/C",       28),
    _e("Company Financial Ratios", "RatiosSolvency_S",           "Solvency Ratios (Standalone)",        f"{_BASE}/RatiosSolvency/{{co_code}}/S",     29),
    _e("Company Financial Ratios", "RatiosSolvency_C",           "Solvency Ratios (Consolidated)",      f"{_BASE}/RatiosSolvency/{{co_code}}/C",     30),
    _e("Company Financial Ratios", "Allbasicratio_S",            "All Basic Ratios (Standalone)",       f"{_BASE}/Allbasicratio/{{co_code}}/S",      31),
]


# ─── Corporate Announcements (22) ───────────────────────────────────────────

_ANNOUNCEMENTS = [
    _e("Corporate Announcements", "BSE_Announcement",             "BSE Announcement (feed)",         f"{_BASE}/BSEAnnouncement",                                          1),
    _e("Corporate Announcements", "NSE_Announcement",             "NSE Announcement (feed)",         f"{_BASE}/NSEAnnouncement",                                          2),
    _e("Corporate Announcements", "Book_Closure",                 "Book Closure",                    f"{_BASE}/BookCloser/{{co_code}}",                                   3),
    _e("Corporate Announcements", "Board_Meetings",               "Board Meetings",                  f"{_BASE}/BoardMeetings/{{co_code}}",                                4),
    _e("Corporate Announcements", "Bonus",                        "Bonus (per ticker, top 10)",      f"{_BASE}/BonusCocodewise/{{co_code}}/10",                           5),
    _e("Corporate Announcements", "Rights",                       "Rights (per ticker, top 10)",     f"{_BASE}/RightsCocodewise/{{co_code}}/10",                          6),
    _e("Corporate Announcements", "Rights_All",                   "Rights (universe-wide, top 10)",  f"{_BASE}/RightsCocodewise/-/10",                                    7),
    _e("Corporate Announcements", "Dividend",                     "Dividend",                        f"{_BASE}/DividendCocodewise/{{co_code}}",                           8),
    _e("Corporate Announcements", "DeListed",                     "Delisted",                        f"{_BASE}/DeListed",                                                 9),
    _e("Corporate Announcements", "AGM",                          "AGM",                             f"{_BASE}/AGM/{{co_code}}",                                          10),
    _e("Corporate Announcements", "EGM",                          "EGM",                             f"{_BASE}/EGM/{{co_code}}",                                          11),
    _e("Corporate Announcements", "Change_Of_Name",               "Change of Name",                  f"{_BASE}/ChangeOfName",                                             12),
    _e("Corporate Announcements", "Split_of_Face_Value",          "Split of Face Value (per ticker)", f"{_BASE}/SplitsCocodewise/{{co_code}}",                            13),
    _e("Corporate Announcements", "Split_of_Face_Value_All",      "Split of Face Value (universe)",  f"{_BASE}/SplitsCocodewise/-",                                       14),
    _e("Corporate Announcements", "Merger_Demergers",             "Merger / Demergers",              f"{_BASE}/MergerDemergers/{{co_code}}",                              15),
    _e("Corporate Announcements", "Buy_Back",                     "Buy-Back",                        f"{_BASE}/BuyBack/{{co_code}}",                                      16),
    _e("Corporate Announcements", "OFS",                          "Offer For Sale",                  f"{_BASE}/OFS/close/10",                                             17),
    _e("Corporate Announcements", "Month_Year_Wise_Count",        "Month-Year wise event count",     f"{_BASE}/Month-Year-Wise-Count/oct-2025",                           18),
    _e("Corporate Announcements", "Eventdatewisedetails",         "Event date wise details",         f"{_BASE}/Eventdatewisedetails/25-oct-2025/Bookcloser/10",           19),
    _e("Corporate Announcements", "corp_action_WKMonth_details",  "Corp Action — Week/Month details", f"{_BASE}/corp-action-WKMonth-details/mon/Bookcloser/10",           20),
    _e("Corporate Announcements", "Eventdatewisecount",           "Event date wise count",           f"{_BASE}/Eventdatewisecount/25-oct-2025",                           21),
    _e("Corporate Announcements", "Forthcoming_Corporate_Actions","Forthcoming Corporate Actions",   f"{_BASE}/ForthcomingCorporateAction",                               22),
]


# ─── Initial Public Offering (9) ────────────────────────────────────────────

_IPO = [
    _e("Initial Public Offering", "ipomaster",          "IPO Master",                                f"{_BASE}/ipomaster",                       1),
    _e("Initial Public Offering", "forthcomingipo",     "Forthcoming IPOs (NSE SME)",                f"{_BASE}/forthcomingipo/NSE/SME/10",       2),
    _e("Initial Public Offering", "OpenIssues_BSE_IPO", "Open Issues (BSE IPO)",                     f"{_BASE}/OpenIssues/BSE/Ipo/10",           3),
    _e("Initial Public Offering", "OpenIssues_BSE_SME", "Open Issues (BSE SME)",                     f"{_BASE}/OpenIssues/BSE/SME/10",           4),
    _e("Initial Public Offering", "ClosedIssues",       "Closed Issues (NSE IPO)",                   f"{_BASE}/ClosedIssues/NSE/IPO/10",         5),
    _e("Initial Public Offering", "IPO_Synopsis",       "IPO Synopsis",                              f"{_BASE}/IPOSynopsis/{{co_code}}",         6),
    _e("Initial Public Offering", "Newlisting_BSE",     "New Listings (BSE)",                        f"{_BASE}/Newlisting/BSE/10",               7),
    _e("Initial Public Offering", "Newlisting_NSE",     "New Listings (NSE)",                        f"{_BASE}/Newlisting/NSE/10",               8),
    _e("Initial Public Offering", "BestPerformerIpo",   "Best-Performer IPOs (BSE)",                 f"{_BASE}/BestPerformerIpo/BSE/10",         9),
]


# ─── More On IPOs (11) ──────────────────────────────────────────────────────

_MORE_IPO = [
    _e("More On IPOs", "IPO_Timeline",                "IPO Timeline",                  f"{_BASE}/IPOTimeline/{{co_code}}",                 1),
    _e("More On IPOs", "IPO_Promoter_Details",        "IPO Promoter Details",          f"{_BASE}/IPOPromoterDetails/{{co_code}}",          2),
    _e("More On IPOs", "IPO_Listing_Info",            "IPO Listing Info",              f"{_BASE}/IPOListingInfo/{{co_code}}",              3),
    _e("More On IPOs", "IPO_Registrar",               "IPO Registrar",                 f"{_BASE}/IPORegistrar/{{co_code}}",                4),
    _e("More On IPOs", "Subscription_Status",         "Subscription Status",           f"{_BASE}/SubscriptionStatus/{{co_code}}",          5),
    _e("More On IPOs", "Objects_of_the_Issue",        "Objects of the Issue",          f"{_BASE}/ObjectsoftheIssue/{{co_code}}",           6),
    _e("More On IPOs", "Anchor_Investor_Details",     "Anchor Investor Details",       f"{_BASE}/AnchorInvestorDetails/-",                 7),
    _e("More On IPOs", "forthcomingDRH_Filing",       "Forthcoming DRHP Filings",      f"{_BASE}/forthcomingDRHFiling/NSE/IPO/10",         8),
    _e("More On IPOs", "IPO_Lead_Manager",            "IPO Lead Manager",              f"{_BASE}/IPOLeadmanager/{{co_code}}",              9),
    _e("More On IPOs", "IPO_Prospectus",              "IPO Prospectus (SEBI)",         f"{_BASE}/IPOProspectus/sebi",                      10),
    _e("More On IPOs", "IPO_Details",                 "IPO Details",                   f"{_BASE}/IPODetails/{{co_code}}",                  11),
]


# ─── IPO DRHP (11; schema says 12) ──────────────────────────────────────────

_IPO_DRHP = [
    _e("IPO DRHP", "IPO_Allocation_Details",          "IPO Allocation Details",                       f"{_BASE}/IPOAllocationDetails/{{co_code}}",          1),
    _e("IPO DRHP", "IPO_Selling_Shareholder_Details", "IPO Selling Shareholder Details",              f"{_BASE}/IPOSellingShareholderDetails/{{co_code}}",  2),
    _e("IPO DRHP", "IPO_Industry_Peer_Details",       "IPO Industry Peer Details",                    f"{_BASE}/IPOIndustryPeerDetails/{{co_code}}",        3),
    _e("IPO DRHP", "IPO_Risk_Details",                "IPO Risk Details",                             f"{_BASE}/IPORiskDetails/{{co_code}}",                4),
    _e("IPO DRHP", "IPO_Strategy_Details",            "IPO Strategy Details",                         f"{_BASE}/IPOStrategyDetails/{{co_code}}",            5),
    _e("IPO DRHP", "IPO_Strength_Details",            "IPO Strength Details",                         f"{_BASE}/IPOStrengthDetails/{{co_code}}",            6),
    _e("IPO DRHP", "IPO_Product_Services_Details",    "IPO Product & Services Details",               f"{_BASE}/IPOProductServicesDetails/{{co_code}}",     7),
    _e("IPO DRHP", "IPO_Customer_Details",            "IPO Customer Details",                         f"{_BASE}/IPOCustomerDetails/{{co_code}}",            8),
    _e("IPO DRHP", "IPO_Financials",                  "IPO Financials (Standalone)",                  f"{_BASE}/IPOFInancials/{{co_code}}/S",               9),
    _e("IPO DRHP", "IPO_Company_Logo",                "IPO Company Logo",                             f"{_BASE}/IPOCompanyLogo",                            10),
    _e("IPO DRHP", "Basis_Of_Allotment",              "Basis of Allotment",                           f"{_BASE}/BasisOfAllotment/10",                       11),
]


# ─── Live News (2) ──────────────────────────────────────────────────────────

_LIVE_NEWS = [
    _e("Live News", "Capital_Market_Live_News_Corporate",         "Live News — corporate",          f"{_BASE}/CapitalMarketLiveNews/corporate-news/10",    1),
    _e("Live News", "Capital_Market_Live_News_Corporate_Results", "Live News — corporate results",  f"{_BASE}/CapitalMarketLiveNews/corporate-results/10", 2),
]


# ─── Super Portfolio (5) ────────────────────────────────────────────────────

_SUPER_PORTFOLIO = [
    _e("Super Portfolio", "ACE_Portfolio_Investors_Summary",        "ACE — Investors Summary",                  f"{_BASE}/ACEPortfolioSummaryCard/individual/10",            1),
    _e("Super Portfolio", "ACE_Portfolio_Investor_Networth",        "ACE — Investor Networth (per investor)",   f"{_BASE}/ACEPortfolioInvestorSummary/{{co_code}}/10",       2),
    _e("Super Portfolio", "ACE_Portfolio_Investor_Detail_202203",   "ACE — Investor Detail (Mar-2022)",         f"{_BASE}/ACEPortfolioInvestorDetail/{{co_code}}/202203/10", 3),
    _e("Super Portfolio", "ACE_Portfolio_Investor_Detail_202206",   "ACE — Investor Detail (Jun-2022)",         f"{_BASE}/ACEPortfolioInvestorDetail/{{co_code}}/202206/10", 4),
    _e("Super Portfolio", "ACE_Portfolio_Investor_Detail_202209",   "ACE — Investor Detail (Sep-2022)",         f"{_BASE}/ACEPortfolioInvestorDetail/{{co_code}}/202209/10", 5),
]


# ─── Macro Economic Data (1) ────────────────────────────────────────────────

_MACRO = [
    _e("Macro Economic Data", "Macro_Economic_Data", "Macro Economic Data (EOD)", f"{_BASE}/MacroEconomicData", 1),
]


# ─── Technical (30) ─────────────────────────────────────────────────────────

_TECHNICAL = [
    _e("Technical", "TechnicalIndicatorRatios",              "Technical Indicator Ratios (NSE)",            f"{_BASE}/TechnicalIndicatorRatios/NSE/{{co_code}}",                                 1),
    _e("Technical", "Stock_SMA_EMA",                         "Stock SMA / EMA (NSE)",                       f"{_BASE}/Stock-SMA-EMA/NSE/{{co_code}}",                                            2),
    _e("Technical", "PivotClassic_daily",                    "Pivot Classic — daily",                       f"{_BASE}/PivotClassic/bse/{{co_code}}/daily",                                       3),
    _e("Technical", "PivotClassic_weekly",                   "Pivot Classic — weekly",                      f"{_BASE}/PivotClassic/bse/{{co_code}}/weekly",                                      4),
    _e("Technical", "PivotClassic_monthly",                  "Pivot Classic — monthly",                     f"{_BASE}/PivotClassic/bse/{{co_code}}/monthly",                                     5),
    _e("Technical", "PivotFibonacci_daily",                  "Pivot Fibonacci — daily",                     f"{_BASE}/PivotFibonacci/bse/{{co_code}}/daily",                                     6),
    _e("Technical", "PivotFibonacci_weekly",                 "Pivot Fibonacci — weekly",                    f"{_BASE}/PivotFibonacci/bse/{{co_code}}/weekly",                                    7),
    _e("Technical", "PivotFibonacci_monthly",                "Pivot Fibonacci — monthly",                   f"{_BASE}/PivotFibonacci/bse/{{co_code}}/monthly",                                   8),
    _e("Technical", "TechnicalIndicatorRatiosCompanyWise",   "Technical Indicator Ratios — Company-Wise (NSE)", f"{_BASE}/TechnicalIndicatorRatiosCompanyWise/NSE/{{co_code}}",                  9),
    _e("Technical", "Scripwise_SMA10_GTE_EMA30",             "Scripwise — 10D SMA above 30D EMA",           f"{_BASE}/TechnicalRatios-Scripwise/BSE/S10GTE30/SMA10 asc/10",                      10),
    _e("Technical", "Scripwise_SMA10_LTE_EMA30",             "Scripwise — 10D SMA below 30D EMA",           f"{_BASE}/TechnicalRatios-Scripwise/BSE/S10LTE30/EMA30 asc/10",                      11),
    _e("Technical", "Scripwise_RSI_GT70",                    "Scripwise — RSI > 70",                        f"{_BASE}/TechnicalRatios-Scripwise/BSE/RSIGT70/RSI asc/10",                         12),
    _e("Technical", "Scripwise_RSI_LT30",                    "Scripwise — RSI < 30",                        f"{_BASE}/TechnicalRatios-Scripwise/BSE/RSILT30/RSI asc/10",                         13),
    _e("Technical", "Scripwise_MACD_LT_EMA9",                "Scripwise — MACD below EMA9",                 f"{_BASE}/TechnicalRatios-Scripwise/BSE/MACDLTEMA9/MACD asc/10",                     14),
    _e("Technical", "Scripwise_ADX_GT30",                    "Scripwise — ADX > 30",                        f"{_BASE}/TechnicalRatios-Scripwise/BSE/ADXGT30/ADX asc/10",                         15),
    _e("Technical", "Scripwise_ADX_LT20_asc",                "Scripwise — ADX < 20 (asc)",                  f"{_BASE}/TechnicalRatios-Scripwise/BSE/ADXLT20/ADX asc/10",                         16),
    _e("Technical", "Scripwise_ADX_LT20_desc",               "Scripwise — ADX < 20 (desc)",                 f"{_BASE}/TechnicalRatios-Scripwise/BSE/ADXLT20/ADX desc/10",                        17),
    _e("Technical", "Scripwise_WR_M100_to_M80",              "Scripwise — Williams %R between -100 and -80", f"{_BASE}/TechnicalRatios-Scripwise/BSE/WRM100TOM80/WR asc/10",                     18),
    _e("Technical", "Scripwise_WR_0_to_M20",                 "Scripwise — Williams %R between -20 and 0",   f"{_BASE}/TechnicalRatios-Scripwise/BSE/WR0TOM20/WR asc/10",                         19),
    _e("Technical", "Scripwise_CCI_GT100",                   "Scripwise — CCI > +100",                      f"{_BASE}/TechnicalRatios-Scripwise/BSE/CCIGT100/CCI asc/10",                        20),
    _e("Technical", "Scripwise_CCI_LT_M100",                 "Scripwise — CCI < -100",                      f"{_BASE}/TechnicalRatios-Scripwise/BSE/CCILTM100/CCI asc/10",                       21),
    _e("Technical", "Scripwise_BB_Upper_2S_EMA20",           "Scripwise — Bollinger Upper 2σ EMA20",        f"{_BASE}/TechnicalRatios-Scripwise/BSE/BBU2SEMA20/BB_UB_20EMA asc/10",              22),
    _e("Technical", "Scripwise_BB_Lower_2S_EMA20",           "Scripwise — Bollinger Lower 2σ EMA20",        f"{_BASE}/TechnicalRatios-Scripwise/BSE/BBL2SEMA20/BB_LB_20EMA asc/10",              23),
    _e("Technical", "Scripwise_SO_SlowK_F20",                "Scripwise — Stoch %K Slow falls below 20",    f"{_BASE}/TechnicalRatios-Scripwise/BSE/SOSlowKF20R20/SKFD asc/10",                  24),
    _e("Technical", "Scripwise_SO_FastK_R80",                "Scripwise — Stoch %K Fast above 80",          f"{_BASE}/TechnicalRatios-Scripwise/BSE/SOFastKR80F80/FK14 asc/10",                  25),
    _e("Technical", "Scripwise_SO_SlowD_F20",                "Scripwise — Stoch %D Slow falls below 20",    f"{_BASE}/TechnicalRatios-Scripwise/BSE/SOSlowDF20R20/SD3K asc/10",                  26),
    _e("Technical", "Scripwise_SO_FastD_R80",                "Scripwise — Stoch %D Fast above 80",          f"{_BASE}/TechnicalRatios-Scripwise/BSE/SOFastDR80F80/FD3K asc/10",                  27),
    _e("Technical", "Scripwise_SO_FastK_R_FastD",            "Scripwise — %K Fast rises above %D Fast",     f"{_BASE}/TechnicalRatios-Scripwise/BSE/SOFastKRFastD/FK14 asc/10",                  28),
    _e("Technical", "Scripwise_SO_SlowK_R_SlowD",            "Scripwise — %K Slow rises above %D Fast",     f"{_BASE}/TechnicalRatios-Scripwise/BSE/SOSlowKRSlowD/SKFD/10",                      29),
    _e("Technical", "Scripwise_SO_SlowK_F_SlowD",            "Scripwise — %K Slow falls below %D Slow",     f"{_BASE}/TechnicalRatios-Scripwise/BSE/SOSlowKFSlowD/SKFD/10",                      30),
]


# ─── Combined registry ──────────────────────────────────────────────────────

ENDPOINTS: list[dict[str, Any]] = (
    _MASTER
    + _FUNDAMENTALS
    + _LOGOS
    + _FINANCIAL
    + _RATIOS
    + _ANNOUNCEMENTS
    + _IPO
    + _MORE_IPO
    + _IPO_DRHP
    + _LIVE_NEWS
    + _SUPER_PORTFOLIO
    + _MACRO
    + _TECHNICAL
)


# ─── Seed UPSERT ────────────────────────────────────────────────────────────


_UPSERT_SQL = """
INSERT INTO cmots_endpoints
       (section, slug, report_name, url_template, is_ticker_bound, sort_order)
VALUES %s
ON CONFLICT (section, slug) DO UPDATE SET
    report_name     = EXCLUDED.report_name,
    url_template    = EXCLUDED.url_template,
    is_ticker_bound = EXCLUDED.is_ticker_bound,
    sort_order      = EXCLUDED.sort_order
"""


def seed_endpoints(cur) -> int:
    """UPSERT the entire ``ENDPOINTS`` registry into ``cmots_endpoints``.

    Idempotent on ``(section, slug)``: re-running updates the other columns
    in place. Returns the number of rows affected (typically equals
    ``len(ENDPOINTS)`` on a fresh seed; INSERT and UPDATE both count).

    Pass a psycopg2 cursor — this function does **not** open or commit a
    connection. The sync orchestrator owns the transaction lifecycle.

    Synchronous; not async. The sync orchestrator calls this once at startup
    via ``get_db_cursor()`` in the project's main.py pattern.
    """
    if execute_values is None:
        raise RuntimeError(
            "psycopg2 is required for seed_endpoints; import failed at module load"
        )
    rows = [
        (e["section"], e["slug"], e["report_name"], e["url_template"],
         e["is_ticker_bound"], e["sort_order"])
        for e in ENDPOINTS
    ]
    # page_size must exceed len(rows) so the UPSERT lands in a single INSERT
    # statement — otherwise cur.rowcount reflects only the final batch.
    execute_values(cur, _UPSERT_SQL, rows, page_size=max(len(rows) + 1, 256))
    return cur.rowcount
