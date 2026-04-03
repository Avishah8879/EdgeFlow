import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface KeyMetricsCardProps {
  data: any;
}

function formatMarketCap(value: number | null): string {
  if (!value) return "N/A";
  const crores = value / 10000000;
  if (crores >= 100000) {
    return `₹${(crores / 100000).toFixed(2)}L Cr`;
  }
  return `₹${crores.toFixed(2)} Cr`;
}

function formatNumber(value: number | null, decimals: number = 2): string {
  if (value === null || value === undefined) return "N/A";
  return value.toFixed(decimals);
}

export default function KeyMetricsCard({ data }: KeyMetricsCardProps) {
  const metrics = [
    { label: "Market Cap", value: formatMarketCap(data.market_cap) },
    { label: "P/E Ratio", value: formatNumber(data.trailing_pe) },
    { label: "P/B Ratio", value: formatNumber(data.price_to_book) },
    {
      label: "52W Range",
      value:
        data.fifty_two_week_low && data.fifty_two_week_high
          ? `₹${data.fifty_two_week_low.toFixed(0)} - ₹${data.fifty_two_week_high.toFixed(0)}`
          : "N/A",
    },
    { label: "ROE", value: data.return_on_equity ? `${data.return_on_equity.toFixed(2)}%` : "N/A" },
    { label: "Debt/Equity", value: formatNumber(data.debt_to_equity) },
    { label: "Dividend Yield", value: data.dividend_yield ? `${data.dividend_yield.toFixed(2)}%` : "N/A" },
    {
      label: "Volume",
      value:
        data.volume && data.avg_volume
          ? `${(data.volume / 1000000).toFixed(2)}M / ${(data.avg_volume / 1000000).toFixed(2)}M`
          : "N/A",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Key Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {metrics.map((metric) => (
            <div key={metric.label}>
              <p className="text-xs text-muted-foreground mb-1">{metric.label}</p>
              <p className="text-sm font-semibold">{metric.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
