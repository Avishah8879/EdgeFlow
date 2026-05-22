export type RowDef = {
  field: string;
  aliases?: string[];
  /** Legacy bold marker. Preserved for backwards compat. New code should
   *  prefer `kind` which carries semantic meaning + drives narrow-density
   *  row-bg treatment. Both can coexist; `kind` wins for styling decisions. */
  bold?: boolean;
  /** Row variant for narrow-density tables:
   *   "sub" — subtotal row (muted bg, bold)
   *   "hl"  — highlight row (faint navy bg + top border, bold)
   *  Drives the row-bg treatment in narrow mode. Ignored in default density. */
  kind?: "sub" | "hl";
  children?: string[];
};

// ── Profit & Loss / Quarterly Results ──
// Each canonical field carries `aliases` for the yfinance-style labels
// emitted by the CMOTS fundamentals backfill (see server/cmots_fundamentals_backfill.py).
// `resolveField()` picks canonical first, then aliases — so screener.in-style
// data still works if it appears, but yfinance-style does too.
export const incomeRows: RowDef[] = [
  {
    field: "Sales",
    aliases: ["Revenue", "Total Revenue", "Net Sales", "Total Income"],
    children: [
      "Revenue From Operations",
      "Revenue from Operations",
      "Other Operating Revenue",
      "Excise Duty",
      "Less Excise Duty GST",
    ],
  },
  {
    field: "Expenses",
    aliases: ["Total Operating Expenses", "Total Expenses"],
    children: [
      "Cost of Materials",
      "Cost Of Revenue",
      "Cost of Material Consumed",
      "Purchase of Stock-in-Trade",
      "Purchases Of Stock In Trade",
      "Changes in Inventories",
      "Change In Inventory",
      "Employee Benefits Expense",
      "Salaries And Wages",
      "Finance Costs",
      "Interest Expense",
      "Other Expenses",
      "Other Operating Expenses",
    ],
  },
  {
    field: "Operating Profit",
    aliases: ["Operating Income", "EBIT", "EBITDA"],
    bold: true,
    kind: "sub",
  },
  { field: "OPM %" },
  {
    field: "Other Income",
    children: ["Exceptional Items", "Exceptional Items Before Tax", "Other Income (Normal)"],
  },
  {
    field: "Interest",
    aliases: ["Interest Expense", "Finance Costs"],
  },
  {
    field: "Depreciation",
    aliases: ["Reconciled Depreciation", "Depreciation and Amortization"],
  },
  {
    field: "Profit before tax",
    aliases: ["Pretax Income", "Profit Before Tax", "Profit Before Extraordinary Items and Tax"],
    bold: true,
    kind: "sub",
  },
  { field: "Tax %" },
  {
    field: "Net Profit",
    aliases: ["Net Income", "Profit After Tax"],
    bold: true,
    kind: "hl",
    children: [
      "Net Profit from Continuing Ops",
      "Net Profit from Discontinued Ops",
      "Minority Interest",
      "Minority Interest After Net Profit",
      "Share of Associates",
      "Share of Profits / Loss of Associated Companies",
      "Net Profit attributable to Owners",
      "Net Income Common Stockholders",
      "Profit Attributable to Equity Shareholders",
    ],
  },
  {
    field: "EPS in Rs",
    aliases: ["Basic EPS", "Diluted EPS", "Earning Per Share - Basic"],
  },
  { field: "Dividend Payout %", aliases: ["Dividend Percentage"] },
];

// ── Balance Sheet ──
export const balanceRows: RowDef[] = [
  {
    field: "Equity Capital",
    aliases: ["Common Stock", "Share Capital"],
    children: ["Share Capital", "Reserves & Surplus", "Minority Interest"],
  },
  {
    field: "Reserves",
    aliases: ["Retained Earnings", "Reserves and Surplus", "Other Equity"],
  },
  {
    field: "Borrowings",
    aliases: ["Total Debt", "Borrowings"],
    children: [
      "Long-term Borrowings",
      "Long Term Debt",
      "Long term Borrowings",
      "Short-term Borrowings",
      "Current Debt",
      "Short term Borrowings",
      "Lease Liabilities",
    ],
  },
  { field: "Other Liabilities", aliases: ["Other Long term Liabilities", "Other Current Liabilities"] },
  {
    field: "Total Liabilities",
    aliases: ["Total Liabilities Net Minority Interest", "TOTAL EQUITY AND LIABILITIES"],
    bold: true,
    kind: "hl",
  },
  {
    field: "Fixed Assets",
    aliases: ["Net PPE"],
    children: ["Property Plant & Equipment", "Property, Plant and Equipments", "Intangibles", "Intangible Assets", "Goodwill"],
  },
  { field: "CWIP", aliases: ["Construction In Progress", "Capital Work in Progress"] },
  {
    field: "Investments",
    aliases: ["Long Term Investments", "Non-current Investments"],
    children: ["Long-term Investments", "Long Term Investments", "Short-term Investments", "Short Term Investments", "Current Investments"],
  },
  {
    field: "Other Assets",
    aliases: ["Current Assets"],
    children: [
      "Inventories",
      "Inventory",
      "Trade Receivables",
      "Receivables",
      "Cash & Cash Equivalents",
      "Cash And Cash Equivalents",
      "Short-term Loans & Advances",
      "Other Current Assets",
      "Other Short Term Investments",
    ],
  },
  { field: "Total Assets", aliases: ["TOTAL ASSETS"], bold: true, kind: "hl" },
];

// ── Cash Flows ──
export const cashflowRows: RowDef[] = [
  {
    field: "Cash from Operating Activity",
    aliases: ["Operating Cash Flow", "Net Cash Generated from (Used In) Operations"],
    children: [
      "Profit Before Tax",
      "Net Income From Continuing Operations",
      "Depreciation",
      "Depreciation And Amortization",
      "Finance Costs",
      "Working Capital Changes",
      "Change In Working Capital",
      "Taxes Paid",
      "Income Taxes Paid",
    ],
  },
  {
    field: "Cash from Investing Activity",
    aliases: ["Investing Cash Flow", "Net Cash Provided by (Used in) Investing Activities"],
    children: [
      "Capex",
      "Capital Expenditure",
      "Sale of Fixed Assets",
      "Proceeds from Sale of Fixed Assets",
      "Investments Made",
      "Purchase of Investments",
      "Investments Sold",
      "Proceeds from Sale of Investments",
      "Interest Received",
      "Interest Received(Investing)",
    ],
  },
  {
    field: "Cash from Financing Activity",
    aliases: ["Financing Cash Flow", "Cash Provided by (Used In) Financing Activities"],
    children: [
      "Borrowings Raised",
      "Proceeds from Borrowings(including Long-term and Short-term debt)",
      "Borrowings Repaid",
      "Payments of Borrowings(including Long-term and Short-term debt)",
      "Dividends Paid",
      "Cash Dividends Paid",
      "Dividend Paid",
      "Interest Paid",
      "Share Issuance",
      "Proceeds from Subscription of Capital Stock(including Share Premium)",
      "Share Buyback",
      "Repurchase of Shares of Stock",
    ],
  },
  {
    field: "Net Cash Flow",
    aliases: ["Changes In Cash", "NET INCREASE (DECREASE) IN CASH AND CASH EQUIVALENT"],
    bold: true,
    kind: "hl",
  },
];

// ── Ratios ──
export const ratiosRows: RowDef[] = [
  { field: "Debtor Days" },
  { field: "Inventory Days" },
  { field: "Days Payable", bold: true, kind: "sub" },
  { field: "Cash Conversion Cycle", bold: true, kind: "hl" },
  { field: "Working Capital Days", kind: "hl" },
  {
    field: "ROCE %",
    bold: true,
    kind: "hl",
    children: ["Net Profit Margin", "Asset Turnover", "Leverage"],
  },
  {
    field: "Debt to Equity",
    children: ["Total Debt", "Total Equity"],
  },
];

// Resolve which key (field or alias) is actually present in the data row.
// Returns the first match, or null if none present.
export function resolveField(
  rowData: Record<string, any> | null | undefined,
  def: RowDef,
): string | null {
  if (!rowData) return null;
  if (def.field in rowData) return def.field;
  if (def.aliases) {
    for (const a of def.aliases) {
      if (a in rowData) return a;
    }
  }
  return null;
}
