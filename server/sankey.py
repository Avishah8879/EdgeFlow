"""
Sankey diagram data generation for financial statements using yfinance.
Returns Nivo-compatible nodes/links format with Redis caching (1-day TTL).

Financial data is updated quarterly, so caching for 24 hours is optimal.
"""
import yfinance as yf
import pandas as pd
import logging
from typing import Optional, Dict, Any, List

from redis_client import get_cached, set_cached

logger = logging.getLogger(__name__)

# ======================
# Cache Configuration
# ======================

TTL_SANKEY = 86400  # 24 hours - financial data is quarterly


def make_sankey_cache_key(ticker: str, statement_type: str, year: Optional[int] = None) -> str:
    """Generate cache key for Sankey data."""
    if year:
        return f"sankey:{ticker.upper()}:{statement_type}:{year}"
    return f"sankey:{ticker.upper()}:{statement_type}:latest"


def make_sankey_years_cache_key(ticker: str) -> str:
    """Generate cache key for available years."""
    return f"sankey:years:{ticker.upper()}"


# ======================
# Column Aliases
# ======================

CASHFLOW_ALIASES = {
    "OperatingCashFlow": (
        "Operating Cash Flow",
        "Total Cash From Operating Activities",
    ),
    "InvestingCashFlow": (
        "Investing Cash Flow",
        "Total Cashflows From Investing Activities",
        "Total Cash From Investing Activities",
    ),
    "FinancingCashFlow": (
        "Financing Cash Flow",
        "Total Cashflows From Financing Activities",
        "Total Cash From Financing Activities",
    ),
    "NetChangeInCash": (
        "Changes In Cash",
        "Net Change In Cash",
        "Net Change In Cash And Cash Equivalents",
    ),
    "CapitalExpenditures": (
        "Capital Expenditure",
        "Capital Expenditure Reported",
        "Capital Expenditures",
        "Purchase Of PPE",
    ),
    "IssuanceOfStock": (
        "Issuance Of Capital Stock",
        "Common Stock Issuance",
        "Net Common Stock Issuance",
        "Issuance Of Stock",
    ),
    "NetBorrowings": (
        "Net Issuance Payments Of Debt",
        "Net Borrowings",
        "Net Long Term Debt Issuance",
        "Net Short Term Debt Issuance",
    ),
    "DividendsPaid": (
        "Cash Dividends Paid",
        "Dividends Paid",
    ),
}

BALANCE_ALIASES = {
    "TotalAssets": ("Total Assets",),
    "CurrentAssets": ("Current Assets", "Total Current Assets"),
    "CashAndCashEquivalents": (
        "Cash And Cash Equivalents", "Cash", "Cash Financial", "Cash Equivalents",
    ),
    "ShortTermInvestments": ("Short Term Investments", "Other Short Term Investments"),
    "CashAndCashEquivalentsAndShortTermInvestments": (
        "Cash Cash Equivalents And Short Term Investments",
    ),
    "AccountsReceivable": ("Accounts Receivable", "Net Receivables", "Receivables"),
    "Inventory": ("Inventory",),
    "OtherCurrentAssets": ("Other Current Assets",),
    "NonCurrentAssets": ("Total Non Current Assets", "Non Current Assets"),
    "NetPPE": ("Net PPE",),
    "PropertyPlantEquipment": ("Property Plant Equipment", "Gross PPE", "Properties"),
    "Goodwill": ("Goodwill",),
    "IntangibleAssets": ("Intangible Assets", "Total Intangible Assets"),
    "LongTermInvestments": (
        "Long Term Investments", "Investments And Advances", "Other Investments",
    ),
    "OtherNonCurrentAssets": ("Other Non Current Assets",),
    "TotalLiabilities": (
        "Total Liabilities", "Total Liab", "Total Liabilities Net Minority Interest",
    ),
    "CurrentLiabilities": ("Total Current Liabilities", "Current Liabilities"),
    "AccountsPayable": ("Accounts Payable", "Payables", "Payables And Accrued Expenses"),
    "ShortTermDebt": (
        "Short Term Debt", "Current Debt", "Current Debt And Capital Lease Obligation",
        "Other Current Borrowings", "Commercial Paper",
    ),
    "AccruedLiabilities": (
        "Accrued Liabilities", "Current Accrued Expenses", "Current Deferred Liabilities",
        "Current Deferred Revenue", "Total Tax Payable", "Income Tax Payable",
    ),
    "OtherCurrentLiabilities": ("Other Current Liabilities",),
    "NonCurrentLiabilities": (
        "Total Non Current Liabilities", "Total Non Current Liabilities Net Minority Interest",
    ),
    "LongTermDebt": (
        "Long Term Debt", "Long Term Debt And Capital Lease Obligation",
        "Long Term Capital Lease Obligation",
    ),
    "DeferredTaxLiabilities": (
        "Deferred Tax Liabilities", "Non Current Deferred Taxes Liabilities",
    ),
    "OtherNonCurrentLiabilities": (
        "Other Non Current Liabilities", "Tradeand Other Payables Non Current",
    ),
    "TotalEquity": (
        "Total Stockholder Equity", "Stockholders Equity", "Common Stock Equity",
        "Total Equity Gross Minority Interest", "Total Equity",
    ),
    "CommonStock": ("Common Stock", "Capital Stock"),
    "AdditionalPaidInCapital": ("Additional Paid In Capital",),
    "RetainedEarnings": ("Retained Earnings",),
    "TreasuryStock": ("Treasury Stock",),
    "AccumulatedOtherComprehensiveIncome": (
        "Accumulated Other Comprehensive Income", "Gains Losses Not Affecting Retained Earnings",
    ),
    "MinorityInterests": ("Minority Interests", "Minority Interest"),
    "PreferredStock": ("Preferred Stock",),
    "OtherEquityAdjustments": ("Other Equity Adjustments",),
}

INCOME_ALIASES = {
    "Revenue": ("Total Revenue", "TotalRevenue", "Revenue"),
    "OperatingRevenue": ("Operating Revenue", "OperatingRevenue"),
    "OtherRevenue": ("Other Revenue", "Total Other Revenue", "OtherRevenue"),
    "CostOfRevenue": (
        "Cost Of Revenue", "Cost of Revenue", "CostOfRevenue",
        "Reconciled Cost Of Revenue",
    ),
    "CostOfGoodsSold": ("Cost Of Goods Sold", "CostOfGoodsSold"),
    "OtherCostOfRevenue": ("Other Cost Of Revenue", "OtherCostOfRevenue"),
    "GrossProfit": ("Gross Profit", "GrossProfit"),
    "OperatingExpense": (
        "Operating Expense", "Operating Expenses", "OperatingExpense",
    ),
    "ResearchAndDevelopment": (
        "Research Development", "Research And Development", "ResearchDevelopment",
    ),
    "SellingGeneralAndAdministration": (
        "Selling General And Administration",
        "Selling General And Administrative",
        "SellingGeneralAndAdministration",
    ),
    "SellingAndMarketingExpense": (
        "Selling And Marketing Expense", "SellingAndMarketingExpense",
    ),
    "GeneralAndAdministrativeExpense": (
        "General And Administrative Expense", "GeneralAndAdministrativeExpense",
    ),
    "DepreciationAndAmortization": (
        "Depreciation And Amortization", "DepreciationAndAmortization",
        "Reconciled Depreciation", "Depreciation",
    ),
    "StockBasedCompensation": (
        "Stock Based Compensation", "StockBasedCompensation",
    ),
    "OtherOperatingExpenses": (
        "Other Operating Expenses", "OtherOperatingExpenses",
    ),
    "OperatingIncome": (
        "Operating Income", "OperatingIncome", "EBIT", "Operating Income or Loss",
    ),
    "InterestExpense": (
        "Interest Expense", "InterestExpense", "Interest Expense Non Operating",
    ),
    "InterestIncome": (
        "Interest Income", "InterestIncome", "Interest Income Non Operating",
    ),
    "OtherNonOperatingIncomeExpenses": (
        "Other Non Operating Income Expenses", "OtherNonOperatingIncomeExpenses",
    ),
    "IncomeBeforeTax": (
        "Pretax Income", "Income Before Tax", "Earnings Before Tax", "IncomeBeforeTax",
    ),
    "CurrentTax": ("Current Tax", "CurrentTax"),
    "DeferredTax": ("Deferred Tax", "DeferredTax", "Deferred Income Tax"),
    "TaxProvision": (
        "Tax Provision", "Income Tax Expense", "Income Tax", "TaxProvision",
    ),
    "NetIncome": (
        "Net Income", "NetIncome", "Net Income Applicable To Common Shares",
    ),
    "NetIncomeContinuousOperations": (
        "Net Income Continuous Operations",
        "Net Income From Continuing Operation Net Minority Interest",
        "Net Income From Continuing Operations",
    ),
    "MinorityInterests": ("Minority Interests", "MinorityInterests"),
    "PreferredStockDividends": (
        "Preferred Stock Dividends", "Otherunder Preferred Stock Dividend",
    ),
    "NetIncomeCommonStockholders": (
        "Net Income Common Stockholders",
        "Diluted NI Availto Com Stockholders",
    ),
}

# Color scheme
COLORS = {
    "revenue": "#1f77b4",      # Blue
    "profit": "#2ca02c",       # Green
    "expense": "#ff7f0e",      # Orange
    "tax": "#9467bd",          # Purple
    "dividend": "#8c564b",     # Brown
    "other": "#7f7f7f",        # Gray
}


# ======================
# Helper Functions
# ======================

def _normalize_column(label: str) -> str:
    """Normalize column name for matching."""
    return "".join(str(label).lower().split())


def _resolve_columns(df: pd.DataFrame, aliases: Dict) -> pd.DataFrame:
    """Resolve column names using alias mapping."""
    normalized = {_normalize_column(col): col for col in df.columns}
    rename_map = {}
    for target, alias_list in aliases.items():
        for alias in alias_list:
            actual = normalized.get(_normalize_column(alias))
            if actual is not None:
                rename_map[actual] = target
                break
    if rename_map:
        df = df.rename(columns=rename_map)
    ordered = [name for name in aliases if name in df.columns]
    return df[ordered] if ordered else df


def _safe_value(value) -> float:
    """Convert value to float, handling None/NaN."""
    if value is None or pd.isna(value):
        return 0.0
    return float(value)


def _get_color(label: str) -> str:
    """Get color for a node based on its label."""
    label_lower = label.lower()
    if "revenue" in label_lower:
        return COLORS["revenue"]
    elif "profit" in label_lower or "income" in label_lower or "retained" in label_lower:
        return COLORS["profit"]
    elif "tax" in label_lower:
        return COLORS["tax"]
    elif "dividend" in label_lower:
        return COLORS["dividend"]
    elif "cost" in label_lower or "expense" in label_lower:
        return COLORS["expense"]
    return COLORS["other"]


# ======================
# Data Fetching
# ======================

def get_income_statement(ticker: str) -> pd.DataFrame:
    """Fetch and normalize annual income statement from yfinance."""
    stock = yf.Ticker(ticker)
    statement = stock.financials
    if statement is None or statement.empty:
        raise ValueError(f"No income statement data found for {ticker}")

    statement = statement.transpose()
    statement.index = pd.to_datetime(statement.index).year
    statement = _resolve_columns(statement, INCOME_ALIASES)
    statement = statement.apply(pd.to_numeric, errors="coerce").fillna(0.0)
    return statement


def get_cashflow_statement(ticker: str) -> pd.DataFrame:
    """Fetch and normalize annual cash flow statement from yfinance."""
    stock = yf.Ticker(ticker)
    cf = stock.cashflow
    if cf is None or cf.empty:
        raise ValueError(f"No cash flow data found for {ticker}")

    cf = cf.transpose()
    cf.index = pd.to_datetime(cf.index).year
    cf = _resolve_columns(cf, CASHFLOW_ALIASES)
    cf = cf.apply(pd.to_numeric, errors="coerce").fillna(0.0)
    return cf


def get_balance_sheet(ticker: str) -> pd.DataFrame:
    """Fetch and normalize annual balance sheet from yfinance."""
    stock = yf.Ticker(ticker)
    bs = stock.balance_sheet
    if bs is None or bs.empty:
        raise ValueError(f"No balance sheet data found for {ticker}")

    bs = bs.transpose()
    bs.index = pd.to_datetime(bs.index).year
    bs = _resolve_columns(bs, BALANCE_ALIASES)
    bs = bs.apply(pd.to_numeric, errors="coerce").fillna(0.0)
    return bs


# ======================
# Sankey Generation
# ======================

def create_income_sankey_data(
    ticker: str,
    year: int,
    dividends_paid: float = 0.0
) -> Dict[str, Any]:
    """Generate income statement Sankey data in Nivo format."""
    statement = get_income_statement(ticker)

    if year not in statement.index:
        raise ValueError(f"Year {year} not available. Available: {list(statement.index)}")

    data = statement.loc[year]

    def val(key: str) -> float:
        return _safe_value(data.get(key, 0.0))

    # Extract values with fallback calculations
    total_revenue = val("Revenue")
    operating_revenue = val("OperatingRevenue")
    other_revenue = val("OtherRevenue")

    if total_revenue == 0.0:
        total_revenue = operating_revenue + other_revenue
    if operating_revenue == 0.0 and total_revenue:
        operating_revenue = total_revenue

    cost_of_revenue = val("CostOfRevenue")
    if cost_of_revenue == 0.0:
        cost_of_revenue = val("CostOfGoodsSold")

    gross_profit = val("GrossProfit")
    if total_revenue and cost_of_revenue and not gross_profit:
        gross_profit = total_revenue - cost_of_revenue
    if total_revenue and gross_profit and not cost_of_revenue:
        cost_of_revenue = max(total_revenue - gross_profit, 0.0)

    operating_expense = val("OperatingExpense")
    operating_income = val("OperatingIncome")

    if gross_profit and operating_income and not operating_expense:
        operating_expense = max(gross_profit - operating_income, 0.0)

    # OpEx breakdown
    rd = val("ResearchAndDevelopment")
    sga = val("SellingGeneralAndAdministration")
    dep_amort = val("DepreciationAndAmortization")
    other_opex = val("OtherOperatingExpenses")

    income_before_tax = val("IncomeBeforeTax")
    tax_provision = val("TaxProvision")
    net_income = val("NetIncome")

    # Build nodes and links
    nodes = []
    links = []
    node_ids = set()

    def add_node(id: str, color: str):
        if id not in node_ids:
            nodes.append({"id": id, "color": color})
            node_ids.add(id)

    def add_link(source: str, target: str, value: float):
        if value > 0:
            add_node(source, _get_color(source))
            add_node(target, _get_color(target))
            links.append({"source": source, "target": target, "value": abs(value)})

    # Build flow: Revenue → Costs → Gross Profit → OpEx → Operating Income → Tax → Net Income

    # Revenue breakdown (if other revenue exists)
    if other_revenue > 0 and operating_revenue > 0:
        add_link("Operating Revenue", "Total Revenue", operating_revenue)
        add_link("Other Revenue", "Total Revenue", other_revenue)
    elif total_revenue > 0:
        add_node("Total Revenue", COLORS["revenue"])

    # Revenue to Cost and Gross Profit
    if cost_of_revenue > 0:
        add_link("Total Revenue", "Cost of Revenue", cost_of_revenue)
    if gross_profit > 0:
        add_link("Total Revenue", "Gross Profit", gross_profit)

    # Gross Profit to OpEx and Operating Income
    if operating_expense > 0:
        add_link("Gross Profit", "Operating Expenses", operating_expense)

        # OpEx breakdown
        opex_breakdown_total = rd + sga + dep_amort + other_opex
        if opex_breakdown_total > 0:
            if rd > 0:
                add_link("Operating Expenses", "R&D", rd)
            if sga > 0:
                add_link("Operating Expenses", "SG&A", sga)
            if dep_amort > 0:
                add_link("Operating Expenses", "D&A", dep_amort)
            if other_opex > 0:
                add_link("Operating Expenses", "Other OpEx", other_opex)
            # Residual
            residual = operating_expense - opex_breakdown_total
            if residual > 0:
                add_link("Operating Expenses", "Other Costs", residual)

    if operating_income > 0:
        add_link("Gross Profit", "Operating Income", operating_income)

    # Operating Income to Tax and Net Income
    if tax_provision > 0:
        add_link("Operating Income", "Taxes", tax_provision)
    if net_income > 0:
        # Calculate pre-tax to net income flow
        pretax_to_net = operating_income - tax_provision if operating_income > 0 else net_income
        if pretax_to_net > 0:
            add_link("Operating Income", "Net Income", pretax_to_net)

    # Net Income to Dividends and Retained
    dividends = abs(_safe_value(dividends_paid))
    if dividends > 0 and net_income > 0:
        div_used = min(dividends, net_income)
        add_link("Net Income", "Dividends", div_used)
        retained = max(net_income - div_used, 0)
        if retained > 0:
            add_link("Net Income", "Retained Earnings", retained)
    elif net_income > 0:
        add_link("Net Income", "Retained Earnings", net_income)

    if not links:
        raise ValueError(f"Insufficient data to build Sankey diagram for {ticker} in {year}")

    return {
        "nodes": nodes,
        "links": links
    }


def create_cashflow_sankey_data(ticker: str, year: int) -> Dict[str, Any]:
    """Generate cash flow Sankey data in Nivo format."""
    cf = get_cashflow_statement(ticker)

    if year not in cf.index:
        raise ValueError(f"Year {year} not available. Available: {list(cf.index)}")

    data = cf.loc[year]

    operating_cf = _safe_value(data.get("OperatingCashFlow", 0.0))
    investing_cf = _safe_value(data.get("InvestingCashFlow", 0.0))
    financing_cf = _safe_value(data.get("FinancingCashFlow", 0.0))
    net_change = _safe_value(data.get("NetChangeInCash", 0.0))
    capex = _safe_value(data.get("CapitalExpenditures", 0.0))
    dividends = _safe_value(data.get("DividendsPaid", 0.0))
    net_borrowings = _safe_value(data.get("NetBorrowings", 0.0))
    stock_issuance = _safe_value(data.get("IssuanceOfStock", 0.0))

    nodes = []
    links = []
    node_ids = set()

    def add_node(id: str, color: str):
        if id not in node_ids:
            nodes.append({"id": id, "color": color})
            node_ids.add(id)

    def add_link(source: str, target: str, value: float, source_color: str, target_color: str):
        if value != 0:
            add_node(source, source_color)
            add_node(target, target_color)
            links.append({"source": source, "target": target, "value": abs(value)})

    # Operating Cash Flow flows
    if operating_cf > 0:
        add_link("Operating CF", "Net Cash Change", operating_cf, COLORS["profit"], COLORS["other"])
        if capex < 0:  # Capex is typically negative (outflow)
            add_link("Operating CF", "Capital Expenditure", abs(capex), COLORS["profit"], COLORS["expense"])

    # Investing Cash Flow
    if investing_cf != 0:
        if investing_cf < 0:
            add_link("Investing CF (Outflow)", "Net Cash Change", abs(investing_cf), COLORS["expense"], COLORS["other"])
        else:
            add_link("Investing CF", "Net Cash Change", investing_cf, COLORS["profit"], COLORS["other"])

    # Financing Cash Flow
    if financing_cf != 0:
        if financing_cf < 0:
            add_link("Financing CF (Outflow)", "Net Cash Change", abs(financing_cf), COLORS["expense"], COLORS["other"])
        else:
            add_link("Financing CF", "Net Cash Change", financing_cf, COLORS["profit"], COLORS["other"])

    # Financing breakdown
    if dividends < 0:  # Dividends paid is negative
        add_link("Financing CF (Outflow)", "Dividends Paid", abs(dividends), COLORS["expense"], COLORS["dividend"])
    if net_borrowings != 0:
        if net_borrowings > 0:
            add_link("Net Borrowings", "Financing CF", net_borrowings, COLORS["other"], COLORS["profit"])
        else:
            add_link("Financing CF (Outflow)", "Debt Repayment", abs(net_borrowings), COLORS["expense"], COLORS["expense"])

    if not links:
        raise ValueError(f"Insufficient cash flow data for {ticker} in {year}")

    return {
        "nodes": nodes,
        "links": links
    }


def create_balance_sheet_sankey_data(ticker: str, year: int) -> Dict[str, Any]:
    """Generate balance sheet Sankey data in Nivo format."""
    bs = get_balance_sheet(ticker)

    if year not in bs.index:
        raise ValueError(f"Year {year} not available. Available: {list(bs.index)}")

    data = bs.loc[year]

    def val(key: str) -> float:
        return _safe_value(data.get(key, 0.0))

    # Color scheme for balance sheet
    ASSET_COLOR = "#1f77b4"      # Blue
    LIABILITY_COLOR = "#ff7f0e"   # Orange
    EQUITY_COLOR = "#2ca02c"      # Green

    # =====================
    # Extract Asset Values
    # =====================
    total_assets = val("TotalAssets")
    current_assets = val("CurrentAssets")
    noncurrent_assets = val("NonCurrentAssets")

    # Current asset components
    cash = val("CashAndCashEquivalents")
    short_term_investments = val("ShortTermInvestments")
    cash_and_short_term = val("CashAndCashEquivalentsAndShortTermInvestments")
    receivables = val("AccountsReceivable")
    inventory = val("Inventory")
    other_current = val("OtherCurrentAssets")

    current_components = []
    if cash_and_short_term and not cash and not short_term_investments:
        if cash_and_short_term > 0:
            current_components.append(("Cash & Investments", cash_and_short_term))
    else:
        if cash > 0:
            current_components.append(("Cash", cash))
        if short_term_investments > 0:
            current_components.append(("Short-Term Investments", short_term_investments))
    if receivables > 0:
        current_components.append(("Receivables", receivables))
    if inventory > 0:
        current_components.append(("Inventory", inventory))
    if other_current > 0:
        current_components.append(("Other Current Assets", other_current))

    # Non-current asset components
    net_ppe = val("NetPPE")
    ppe = val("PropertyPlantEquipment")
    goodwill = val("Goodwill")
    intangibles = val("IntangibleAssets")
    long_term_investments = val("LongTermInvestments")
    other_noncurrent = val("OtherNonCurrentAssets")

    noncurrent_components = []
    if net_ppe > 0:
        noncurrent_components.append(("Net PPE", net_ppe))
    elif ppe > 0:
        noncurrent_components.append(("PPE", ppe))
    if goodwill > 0:
        noncurrent_components.append(("Goodwill", goodwill))
    if intangibles > 0:
        noncurrent_components.append(("Intangibles", intangibles))
    if long_term_investments > 0:
        noncurrent_components.append(("Long-Term Investments", long_term_investments))
    if other_noncurrent > 0:
        noncurrent_components.append(("Other Non-Current", other_noncurrent))

    # Calculate totals if missing
    if current_assets == 0.0 and current_components:
        current_assets = sum(v for _, v in current_components)
    if noncurrent_assets == 0.0 and noncurrent_components:
        noncurrent_assets = sum(v for _, v in noncurrent_components)
    if total_assets == 0.0 and (current_assets or noncurrent_assets):
        total_assets = current_assets + noncurrent_assets

    # ========================
    # Extract Liability Values
    # ========================
    total_liabilities = val("TotalLiabilities")
    current_liabilities = val("CurrentLiabilities")
    noncurrent_liabilities = val("NonCurrentLiabilities")

    # Current liability components
    accounts_payable = val("AccountsPayable")
    short_term_debt = val("ShortTermDebt")
    accrued = val("AccruedLiabilities")
    other_current_liab = val("OtherCurrentLiabilities")

    current_liab_components = []
    if accounts_payable > 0:
        current_liab_components.append(("Accounts Payable", accounts_payable))
    if short_term_debt > 0:
        current_liab_components.append(("Short-Term Debt", short_term_debt))
    if accrued > 0:
        current_liab_components.append(("Accrued Liabilities", accrued))
    if other_current_liab > 0:
        current_liab_components.append(("Other Current Liab", other_current_liab))

    # Non-current liability components
    long_term_debt = val("LongTermDebt")
    deferred_tax_liab = val("DeferredTaxLiabilities")
    other_noncurrent_liab = val("OtherNonCurrentLiabilities")

    noncurrent_liab_components = []
    if long_term_debt > 0:
        noncurrent_liab_components.append(("Long-Term Debt", long_term_debt))
    if deferred_tax_liab > 0:
        noncurrent_liab_components.append(("Deferred Tax Liab", deferred_tax_liab))
    if other_noncurrent_liab > 0:
        noncurrent_liab_components.append(("Other Long-Term Liab", other_noncurrent_liab))

    # Calculate totals if missing
    if current_liabilities == 0.0 and current_liab_components:
        current_liabilities = sum(v for _, v in current_liab_components)
    if noncurrent_liabilities == 0.0 and noncurrent_liab_components:
        noncurrent_liabilities = sum(v for _, v in noncurrent_liab_components)
    if total_liabilities == 0.0 and (current_liabilities or noncurrent_liabilities):
        total_liabilities = current_liabilities + noncurrent_liabilities

    # ====================
    # Extract Equity Values
    # ====================
    total_equity = val("TotalEquity")
    common_stock = val("CommonStock")
    additional_paid_in = val("AdditionalPaidInCapital")
    retained_earnings = val("RetainedEarnings")
    treasury_stock = val("TreasuryStock")
    aoci = val("AccumulatedOtherComprehensiveIncome")
    minority_interests = val("MinorityInterests")
    preferred_stock = val("PreferredStock")
    other_equity = val("OtherEquityAdjustments")

    equity_components = []
    if common_stock > 0:
        equity_components.append(("Common Stock", common_stock))
    if additional_paid_in > 0:
        equity_components.append(("Paid-In Capital", additional_paid_in))
    if retained_earnings != 0:  # Can be negative
        equity_components.append(("Retained Earnings", abs(retained_earnings)))
    if treasury_stock != 0:  # Usually negative (contra equity)
        equity_components.append(("Treasury Stock", abs(treasury_stock)))
    if aoci != 0:
        equity_components.append(("AOCI", abs(aoci)))
    if minority_interests > 0:
        equity_components.append(("Minority Interest", minority_interests))
    if preferred_stock > 0:
        equity_components.append(("Preferred Stock", preferred_stock))
    if other_equity != 0:
        equity_components.append(("Other Equity", abs(other_equity)))

    # Calculate totals if missing
    if total_equity == 0.0 and equity_components:
        total_equity = sum(v for _, v in equity_components)
    if total_equity == 0.0 and total_assets and total_liabilities:
        total_equity = total_assets - total_liabilities
    if total_liabilities == 0.0 and total_assets and total_equity:
        total_liabilities = total_assets - total_equity
    if total_assets == 0.0 and (total_liabilities or total_equity):
        total_assets = total_liabilities + total_equity

    # ====================
    # Build Sankey Data
    # ====================
    nodes = []
    links = []
    node_ids = set()

    def add_node(id: str, color: str):
        if id not in node_ids:
            nodes.append({"id": id, "color": color})
            node_ids.add(id)

    def add_link(source: str, target: str, value: float, source_color: str, target_color: str):
        if value > 0:
            add_node(source, source_color)
            add_node(target, target_color)
            links.append({"source": source, "target": target, "value": abs(value)})

    # Asset side: Components → Current/Non-Current → Total Assets
    if current_components:
        add_node("Current Assets", ASSET_COLOR)
        for label, value in current_components:
            add_link(label, "Current Assets", value, ASSET_COLOR, ASSET_COLOR)
    elif current_assets > 0:
        add_node("Current Assets", ASSET_COLOR)

    if noncurrent_components:
        add_node("Non-Current Assets", ASSET_COLOR)
        for label, value in noncurrent_components:
            add_link(label, "Non-Current Assets", value, ASSET_COLOR, ASSET_COLOR)
    elif noncurrent_assets > 0:
        add_node("Non-Current Assets", ASSET_COLOR)

    # Current/Non-Current → Total Assets
    add_node("Total Assets", ASSET_COLOR)
    if current_assets > 0:
        add_link("Current Assets", "Total Assets", current_assets, ASSET_COLOR, ASSET_COLOR)
    if noncurrent_assets > 0:
        add_link("Non-Current Assets", "Total Assets", noncurrent_assets, ASSET_COLOR, ASSET_COLOR)

    # Total Assets → Liabilities + Equity (the accounting equation)
    if total_liabilities > 0:
        add_link("Total Assets", "Total Liabilities", total_liabilities, ASSET_COLOR, LIABILITY_COLOR)
    if total_equity > 0:
        add_link("Total Assets", "Total Equity", total_equity, ASSET_COLOR, EQUITY_COLOR)

    # Liabilities breakdown
    if total_liabilities > 0:
        if current_liabilities > 0:
            add_node("Current Liabilities", LIABILITY_COLOR)
            add_link("Total Liabilities", "Current Liabilities", current_liabilities, LIABILITY_COLOR, LIABILITY_COLOR)
            # Current liability components
            for label, value in current_liab_components:
                add_link("Current Liabilities", label, value, LIABILITY_COLOR, LIABILITY_COLOR)

        if noncurrent_liabilities > 0:
            add_node("Long-Term Liabilities", LIABILITY_COLOR)
            add_link("Total Liabilities", "Long-Term Liabilities", noncurrent_liabilities, LIABILITY_COLOR, LIABILITY_COLOR)
            # Non-current liability components
            for label, value in noncurrent_liab_components:
                add_link("Long-Term Liabilities", label, value, LIABILITY_COLOR, LIABILITY_COLOR)

    # Equity breakdown
    if total_equity > 0 and equity_components:
        for label, value in equity_components:
            add_link("Total Equity", label, value, EQUITY_COLOR, EQUITY_COLOR)

    if not links:
        raise ValueError(f"Insufficient balance sheet data for {ticker} in {year}")

    return {
        "nodes": nodes,
        "links": links
    }


# ======================
# API Functions
# ======================

def get_available_years(ticker: str) -> Dict[str, List[int]]:
    """
    Get available years for all statements.
    Cached for 24 hours.
    """
    cache_key = make_sankey_years_cache_key(ticker)

    # Check cache first
    cached = get_cached(cache_key)
    if cached is not None:
        # Validate cache has all expected keys (handles stale cache from before balance sheet support)
        expected_keys = {"income_years", "cashflow_years", "balance_years"}
        if expected_keys.issubset(set(cached.keys())):
            logger.debug(f"Sankey years cache HIT: {ticker}")
            return cached
        else:
            logger.debug(f"Sankey years cache STALE (missing keys): {ticker}")

    logger.debug(f"Sankey years cache MISS: {ticker}")

    result = {"income_years": [], "cashflow_years": [], "balance_years": []}

    try:
        income = get_income_statement(ticker)
        result["income_years"] = sorted([int(y) for y in income.index.tolist()], reverse=True)
    except Exception as e:
        logger.warning(f"Failed to fetch income statement for {ticker}: {e}")

    try:
        cf = get_cashflow_statement(ticker)
        result["cashflow_years"] = sorted([int(y) for y in cf.index.tolist()], reverse=True)
    except Exception as e:
        logger.warning(f"Failed to fetch cash flow for {ticker}: {e}")

    try:
        bs = get_balance_sheet(ticker)
        result["balance_years"] = sorted([int(y) for y in bs.index.tolist()], reverse=True)
    except Exception as e:
        logger.warning(f"Failed to fetch balance sheet for {ticker}: {e}")

    # Cache the result
    set_cached(cache_key, result, TTL_SANKEY)

    return result


def get_sankey_data(
    ticker: str,
    statement_type: str,
    year: Optional[int] = None
) -> Dict[str, Any]:
    """
    Main entry point - returns Nivo-compatible Sankey data.
    Cached for 24 hours since financial data is quarterly.

    Args:
        ticker: Stock ticker (e.g., "RELIANCE.NS")
        statement_type: "income", "cashflow", or "balance"
        year: Fiscal year (defaults to most recent)

    Returns:
        Dict with ticker, year, type, available_years, and data (nodes/links)
    """
    # Get available years (also cached)
    years_info = get_available_years(ticker)

    if statement_type == "income":
        available_years = years_info.get("income_years", [])
        if not available_years:
            raise ValueError(f"No income statement data available for {ticker}")

        if year is None:
            year = available_years[0]
        elif year not in available_years:
            raise ValueError(f"Year {year} not available. Available: {available_years}")

    elif statement_type == "cashflow":
        available_years = years_info.get("cashflow_years", [])
        if not available_years:
            raise ValueError(f"No cash flow data available for {ticker}")

        if year is None:
            year = available_years[0]
        elif year not in available_years:
            raise ValueError(f"Year {year} not available. Available: {available_years}")

    elif statement_type == "balance":
        available_years = years_info.get("balance_years", [])
        if not available_years:
            raise ValueError(f"No balance sheet data available for {ticker}")

        if year is None:
            year = available_years[0]
        elif year not in available_years:
            raise ValueError(f"Year {year} not available. Available: {available_years}")

    else:
        raise ValueError(f"Invalid statement_type: {statement_type}. Use 'income', 'cashflow', or 'balance'")

    # Check cache for Sankey data
    cache_key = make_sankey_cache_key(ticker, statement_type, year)
    cached = get_cached(cache_key)
    if cached is not None:
        logger.debug(f"Sankey data cache HIT: {ticker}/{statement_type}/{year}")
        return cached

    logger.debug(f"Sankey data cache MISS: {ticker}/{statement_type}/{year}")

    # Generate Sankey data
    if statement_type == "income":
        # Get dividends from cashflow for retained earnings calculation
        dividends_paid = 0.0
        try:
            cf = get_cashflow_statement(ticker)
            if year in cf.index:
                dividends_paid = _safe_value(cf.loc[year].get("DividendsPaid", 0.0))
        except Exception:
            pass

        sankey_data = create_income_sankey_data(ticker, year, dividends_paid)
    elif statement_type == "cashflow":
        sankey_data = create_cashflow_sankey_data(ticker, year)
    else:  # balance
        sankey_data = create_balance_sheet_sankey_data(ticker, year)

    result = {
        "ticker": ticker,
        "year": year,
        "type": statement_type,
        "available_years": available_years,
        "data": sankey_data
    }

    # Cache the result
    set_cached(cache_key, result, TTL_SANKEY)

    return result


# ======================
# Testing
# ======================

if __name__ == "__main__":
    # Test with an Indian stock
    ticker = "RELIANCE.NS"
    print(f"\nTesting Sankey for {ticker}...")

    years = get_available_years(ticker)
    print(f"Available years: {years}")

    if years["income_years"]:
        income_data = get_sankey_data(ticker, "income")
        print(f"\nIncome Statement Sankey ({income_data['year']}):")
        print(f"  Nodes: {len(income_data['data']['nodes'])}")
        print(f"  Links: {len(income_data['data']['links'])}")

    if years["cashflow_years"]:
        cf_data = get_sankey_data(ticker, "cashflow")
        print(f"\nCash Flow Sankey ({cf_data['year']}):")
        print(f"  Nodes: {len(cf_data['data']['nodes'])}")
        print(f"  Links: {len(cf_data['data']['links'])}")
