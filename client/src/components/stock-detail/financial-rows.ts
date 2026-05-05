export type RowDef = {
  field: string;
  aliases?: string[];
  bold?: boolean;
  children?: string[];
};

// ── Profit & Loss / Quarterly Results ──
export const incomeRows: RowDef[] = [
  {
    field: "Sales",
    aliases: ["Revenue", "Total Revenue", "Net Sales", "Total Income"],
    children: ["Revenue from Operations", "Other Operating Revenue", "Excise Duty"],
  },
  {
    field: "Expenses",
    children: [
      "Cost of Materials",
      "Purchase of Stock-in-Trade",
      "Changes in Inventories",
      "Employee Benefits Expense",
      "Finance Costs",
      "Other Expenses",
    ],
  },
  { field: "Operating Profit", bold: true },
  { field: "OPM %" },
  {
    field: "Other Income",
    children: ["Exceptional Items", "Other Income (Normal)"],
  },
  { field: "Interest" },
  { field: "Depreciation" },
  { field: "Profit before tax", bold: true },
  { field: "Tax %" },
  {
    field: "Net Profit",
    bold: true,
    children: [
      "Net Profit from Continuing Ops",
      "Net Profit from Discontinued Ops",
      "Minority Interest",
      "Share of Associates",
      "Net Profit attributable to Owners",
    ],
  },
  { field: "EPS in Rs" },
  { field: "Dividend Payout %" },
];

// ── Balance Sheet ──
export const balanceRows: RowDef[] = [
  {
    field: "Equity Capital",
    children: ["Share Capital", "Reserves & Surplus", "Minority Interest"],
  },
  { field: "Reserves" },
  {
    field: "Borrowings",
    children: ["Long-term Borrowings", "Short-term Borrowings", "Lease Liabilities"],
  },
  { field: "Other Liabilities" },
  { field: "Total Liabilities", bold: true },
  {
    field: "Fixed Assets",
    children: ["Property Plant & Equipment", "Intangibles", "Goodwill"],
  },
  { field: "CWIP" },
  {
    field: "Investments",
    children: ["Long-term Investments", "Short-term Investments"],
  },
  {
    field: "Other Assets",
    children: [
      "Inventories",
      "Trade Receivables",
      "Cash & Cash Equivalents",
      "Short-term Loans & Advances",
      "Other Current Assets",
    ],
  },
  { field: "Total Assets", bold: true },
];

// ── Cash Flows ──
export const cashflowRows: RowDef[] = [
  {
    field: "Cash from Operating Activity",
    children: [
      "Profit Before Tax",
      "Depreciation",
      "Finance Costs",
      "Working Capital Changes",
      "Taxes Paid",
    ],
  },
  {
    field: "Cash from Investing Activity",
    children: [
      "Capex",
      "Sale of Fixed Assets",
      "Investments Made",
      "Investments Sold",
      "Interest Received",
    ],
  },
  {
    field: "Cash from Financing Activity",
    children: [
      "Borrowings Raised",
      "Borrowings Repaid",
      "Dividends Paid",
      "Interest Paid",
      "Share Issuance",
      "Share Buyback",
    ],
  },
  { field: "Net Cash Flow", bold: true },
];

// ── Ratios ──
export const ratiosRows: RowDef[] = [
  { field: "Debtor Days" },
  { field: "Inventory Days" },
  { field: "Days Payable", bold: true },
  { field: "Cash Conversion Cycle", bold: true },
  { field: "Working Capital Days" },
  {
    field: "ROCE %",
    bold: true,
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
