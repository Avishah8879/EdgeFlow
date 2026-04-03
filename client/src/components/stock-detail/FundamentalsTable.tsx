import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface FundamentalsTableProps {
  data: any;
}

function formatValue(value: number | null | undefined, suffix: string = "", prefix: string = ""): string {
  if (value === null || value === undefined) return "N/A";
  return `${prefix}${value.toFixed(2)}${suffix}`;
}

function formatCurrency(value: number | null | undefined): string {
  if (!value) return "N/A";
  const crores = value / 10000000;
  return `₹${crores.toFixed(2)} Cr`;
}

export default function FundamentalsTable({ data }: FundamentalsTableProps) {
  const sections = [
    {
      title: "Valuation Ratios",
      metrics: [
        { label: "P/E Ratio (Trailing)", value: formatValue(data.trailing_pe) },
        { label: "P/E Ratio (Forward)", value: formatValue(data.forward_pe) },
        { label: "Price to Book", value: formatValue(data.price_to_book) },
        { label: "Price to Sales", value: formatValue(data.price_to_sales) },
        { label: "PEG Ratio", value: formatValue(data.peg_ratio) },
        { label: "Enterprise Value", value: formatCurrency(data.enterprise_value) },
      ],
    },
    {
      title: "Financial Performance",
      metrics: [
        { label: "Profit Margin", value: formatValue(data.profit_margin, "%") },
        { label: "Operating Margin", value: formatValue(data.operating_margin, "%") },
        { label: "Return on Assets (ROA)", value: formatValue(data.return_on_assets, "%") },
        { label: "Return on Equity (ROE)", value: formatValue(data.return_on_equity, "%") },
        { label: "Revenue Growth", value: formatValue(data.revenue_growth, "%") },
        { label: "Earnings Growth", value: formatValue(data.earnings_growth, "%") },
      ],
    },
    {
      title: "Balance Sheet",
      metrics: [
        { label: "Total Cash", value: formatCurrency(data.total_cash) },
        { label: "Total Debt", value: formatCurrency(data.total_debt) },
        { label: "Debt to Equity", value: formatValue(data.debt_to_equity) },
        { label: "Current Ratio", value: formatValue(data.current_ratio) },
        { label: "Quick Ratio", value: formatValue(data.quick_ratio) },
      ],
    },
    {
      title: "Dividends",
      metrics: [
        { label: "Dividend Rate", value: formatValue(data.dividend_rate, "", "₹") },
        { label: "Dividend Yield", value: formatValue(data.dividend_yield, "%") },
        { label: "Payout Ratio", value: formatValue(data.payout_ratio, "%") },
        {
          label: "Ex-Dividend Date",
          value: data.ex_dividend_date
            ? new Date(data.ex_dividend_date).toLocaleDateString()
            : "N/A",
        },
      ],
    },
  ];

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Fundamentals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {sections.map((section) => (
          <div key={section.title}>
            <h3 className="text-base font-semibold mb-3">{section.title}</h3>
            <div className="space-y-2">
              {section.metrics.map((metric) => (
                <div key={metric.label} className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{metric.label}</span>
                  <span className="text-sm font-medium">{metric.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
