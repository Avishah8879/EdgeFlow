import { useParams, Redirect, Link } from "wouter";
import { useStockDetail } from "@/hooks/use-stock-detail";
import { useStockLTP } from "@/hooks/use-stock-ltp";
import { useShareholding } from "@/hooks/use-shareholding";
import { SEO } from "@/components/SEO";
import { PAGE_SEO } from "@/lib/seo-config";
import { generateStockBreadcrumbSchema, generateFinancialProductSchema } from "@/lib/json-ld";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Globe, ExternalLink } from "lucide-react";
import PriceChartSection from "@/components/stock-detail/PriceChartSection";
import SentimentGauge from "@/components/stock-detail/SentimentGauge";
import SentimentMetrics from "@/components/stock-detail/SentimentMetrics";
import SentimentNewsSection from "@/components/stock-detail/SentimentNewsSection";
import { SentimentProvider } from "@/contexts/SentimentContext";
import { cn } from "@/lib/utils";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatCrore(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const cr = value / 1e7;
  if (Math.abs(cr) >= 100000) return `${(cr / 100000).toFixed(2).replace(/\.00$/, "")} L Cr`;
  return `${cr.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`;
}

function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatPct(value: number | null | undefined, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(decimals)}%`;
}

function formatRupees(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

// Format JSONB cell values per the field's intent:
//   "OPM %", "Tax %", "Dividend Payout %"  → integer percent
//   "EPS in Rs", anything containing "EPS" → 2 decimals
//   Anything else                          → integer with thousand separators
//   Very large numbers (>=1e9)             → assumed raw rupees, divided to crores
function formatTableCell(value: any, field: string): string {
  if (value == null) return "—";
  const num = typeof value === "number" ? value : parseFloat(value);
  if (!Number.isFinite(num)) return typeof value === "string" ? value : "—";

  if (field.trim().endsWith("%")) {
    return `${Math.round(num)}%`;
  }
  if (/eps/i.test(field)) {
    return num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // If the value is huge (>= 1B), assume the JSONB stores raw rupees → convert to crores
  const display = Math.abs(num) >= 1e9 ? num / 1e7 : num;
  return display.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// ─── small UI primitives ────────────────────────────────────────────────────

function MetricRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border/50 last:border-b-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-mono font-semibold tabular-nums", accent && "text-primary")}>{value}</span>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/50 bg-card p-5 md:p-6">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// ─── financial table — used by Quarterly Results, P&L, Balance Sheet, Cash Flows, Ratios ──

function FinancialTable({
  data,
  fieldOrder,
  boldRows = [],
  emptyMessage,
}: {
  data: Record<string, any> | null | undefined;
  fieldOrder?: string[];
  boldRows?: string[];
  emptyMessage: string;
}) {
  if (!data || Object.keys(data).length === 0) {
    return <div className="text-sm text-muted-foreground py-6 text-center">{emptyMessage}</div>;
  }

  const periods = Object.keys(data).sort();
  const allFields = new Set<string>();
  periods.forEach((p) => {
    const row = data[p];
    if (row && typeof row === "object") Object.keys(row).forEach((f) => allFields.add(f));
  });

  // Order fields: explicit fieldOrder first, then alphabetical
  let fields: string[];
  if (fieldOrder && fieldOrder.length > 0) {
    const explicit = fieldOrder.filter((f) => allFields.has(f));
    const remaining = Array.from(allFields).filter((f) => !explicit.includes(f)).sort();
    fields = [...explicit, ...remaining];
  } else {
    fields = Array.from(allFields).sort();
  }

  const boldSet = new Set(boldRows);

  return (
    <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border/70">
            <th className="text-left py-2.5 pr-3 font-medium text-muted-foreground sticky left-0 bg-card whitespace-nowrap" />
            {periods.map((p) => (
              <th key={p} className="text-right py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fields.map((field, idx) => {
            const bold = boldSet.has(field);
            return (
              <tr
                key={field}
                className={cn(
                  "border-b border-border/30 last:border-b-0 transition-colors",
                  idx % 2 === 1 && "bg-muted/20",
                  "hover:bg-muted/40",
                )}
              >
                <td
                  className={cn(
                    "py-2 pr-3 sticky left-0 whitespace-nowrap text-foreground",
                    idx % 2 === 1 ? "bg-muted/20" : "bg-card",
                    bold && "font-semibold",
                  )}
                >
                  {field}
                </td>
                {periods.map((p) => (
                  <td
                    key={p}
                    className={cn(
                      "text-right py-2 px-3 font-mono tabular-nums whitespace-nowrap",
                      bold && "font-semibold",
                    )}
                  >
                    {formatTableCell(data[p]?.[field], field)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── compounded growth grid card ────────────────────────────────────────────

function GrowthCard({ title, periods }: { title: string; periods: { label: string; value: string }[] }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3>
      <div className="space-y-1.5">
        {periods.map((p) => (
          <div key={p.label} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{p.label}:</span>
            <span className="font-mono font-semibold text-foreground tabular-nums">{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Compute compounded annual growth from a year-keyed data object
function computeCagr(data: Record<string, any> | null | undefined, fieldCandidates: string[], yearsBack: number): number | null {
  if (!data) return null;
  const periods = Object.keys(data).sort();
  if (periods.length < 2) return null;

  const firstField = (period: string): number | null => {
    const row = data[period];
    if (!row) return null;
    for (const f of fieldCandidates) {
      if (typeof row[f] === "number" && Number.isFinite(row[f])) return row[f];
    }
    return null;
  };

  const latest = firstField(periods[periods.length - 1]);
  const earliestIdx = Math.max(0, periods.length - 1 - yearsBack);
  if (earliestIdx === periods.length - 1) return null;
  const earliest = firstField(periods[earliestIdx]);
  if (latest == null || earliest == null || earliest <= 0) return null;
  const years = periods.length - 1 - earliestIdx;
  return (Math.pow(latest / earliest, 1 / years) - 1) * 100;
}

// ─── pros / cons derived from fundamentals ──────────────────────────────────

function derivePros(f: any): string[] {
  const pros: string[] = [];
  if (f.return_on_equity != null && f.return_on_equity * 100 >= 15) {
    pros.push(`Company has a healthy return on equity of ${(f.return_on_equity * 100).toFixed(2)}%.`);
  }
  if (f.profit_margin != null && f.profit_margin * 100 >= 15) {
    pros.push(`Company has good profit margins of ${(f.profit_margin * 100).toFixed(2)}%.`);
  }
  if (f.dividend_yield != null && f.dividend_yield * 100 >= 2) {
    pros.push(`Stock pays a healthy dividend yield of ${(f.dividend_yield * 100).toFixed(2)}%.`);
  }
  if (f.debt_to_equity != null && f.debt_to_equity < 0.3) {
    pros.push(`Company is almost debt free.`);
  }
  if (f.revenue_growth != null && f.revenue_growth * 100 >= 15) {
    pros.push(`Company has delivered good revenue growth of ${(f.revenue_growth * 100).toFixed(2)}%.`);
  }
  if (f.earnings_growth != null && f.earnings_growth * 100 >= 15) {
    pros.push(`Company has delivered good earnings growth of ${(f.earnings_growth * 100).toFixed(2)}%.`);
  }
  if (f.current_ratio != null && f.current_ratio >= 1.5) {
    pros.push(`Company has a strong liquidity position with current ratio of ${f.current_ratio.toFixed(2)}.`);
  }
  return pros;
}

function deriveCons(f: any): string[] {
  const cons: string[] = [];
  if (f.return_on_equity != null && f.return_on_equity * 100 < 10) {
    cons.push(`Company has a low return on equity of ${(f.return_on_equity * 100).toFixed(2)}%.`);
  }
  if (f.profit_margin != null && f.profit_margin * 100 < 5) {
    cons.push(`Company has low profit margins of ${(f.profit_margin * 100).toFixed(2)}%.`);
  }
  if (f.payout_ratio != null && f.payout_ratio * 100 < 10 && f.dividend_yield != null && f.dividend_yield > 0) {
    cons.push(`Dividend payout has been low at ${(f.payout_ratio * 100).toFixed(2)}% of profits.`);
  }
  if (f.debt_to_equity != null && f.debt_to_equity > 1) {
    cons.push(`Company has a high debt to equity ratio of ${f.debt_to_equity.toFixed(2)}.`);
  }
  if (f.trailing_pe != null && f.trailing_pe > 50) {
    cons.push(`Stock is trading at a high P/E of ${f.trailing_pe.toFixed(2)}.`);
  }
  if (f.price_to_book != null && f.price_to_book > 5) {
    cons.push(`Stock is trading at ${f.price_to_book.toFixed(2)} times its book value.`);
  }
  return cons;
}

// ─── main page ──────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 py-8 space-y-6">
      <Skeleton className="h-12 w-2/3" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-96 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function ErrorState({ error }: { error: Error }) {
  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 py-16">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load stock details: {error.message}</AlertDescription>
      </Alert>
    </div>
  );
}

export default function StockDetail() {
  const { ticker: rawTicker } = useParams<{ ticker: string }>();
  const ticker = rawTicker ? decodeURIComponent(rawTicker) : undefined;

  if (!ticker) return <Redirect to="/stocks" />;

  const { data, isLoading, error } = useStockDetail(ticker);
  const { data: ltpData } = useStockLTP(ticker);
  const { data: shareholding } = useShareholding(ticker, "quarterly");

  if (error && !isLoading) return <ErrorState error={error as Error} />;
  if (isLoading || !data) return <LoadingState />;

  const f = data.fundamentals;
  const basic = data.basic_info;

  const currentPrice = ltpData?.ltp ?? f.current_price;
  const priceChangePercent = ltpData?.percent_change ?? f.price_change_percent;
  const isPositive = priceChangePercent != null && priceChangePercent >= 0;

  const companyName = (() => {
    const longName = basic.long_name;
    const isValid = longName && !longName.includes(",") && !longName.match(/^\w+\.\w{2},/) && longName !== basic.symbol;
    return isValid ? longName : basic.name;
  })();

  // Compounded growth — try common revenue/profit field names
  const revenueFields = ["Sales", "Revenue", "Total Revenue", "Net Sales", "Total Income"];
  const profitFields = ["Net Profit", "Net Income", "Profit", "Profit After Tax", "PAT"];

  const salesGrowth = {
    "10 Years": computeCagr(data.financials.income_statement, revenueFields, 10),
    "5 Years": computeCagr(data.financials.income_statement, revenueFields, 5),
    "3 Years": computeCagr(data.financials.income_statement, revenueFields, 3),
    "TTM": null as number | null,
  };
  const profitGrowth = {
    "10 Years": computeCagr(data.financials.income_statement, profitFields, 10),
    "5 Years": computeCagr(data.financials.income_statement, profitFields, 5),
    "3 Years": computeCagr(data.financials.income_statement, profitFields, 3),
    "TTM": null as number | null,
  };

  const fmtGrowth = (v: number | null) => (v == null ? "—" : `${v.toFixed(0)}%`);

  const pros = derivePros(f);
  const cons = deriveCons(f);

  // Field ordering for tables (most important rows first)
  const incomeOrder = ["Sales", "Revenue", "Total Revenue", "Expenses", "Operating Profit", "OPM %", "Other Income", "Interest", "Depreciation", "Profit before tax", "Tax %", "Net Profit", "EPS in Rs"];
  const balanceOrder = ["Equity Capital", "Reserves", "Borrowings", "Other Liabilities", "Total Liabilities", "Fixed Assets", "CWIP", "Investments", "Other Assets", "Total Assets"];
  const cashflowOrder = ["Cash from Operating Activity", "Cash from Investing Activity", "Cash from Financing Activity", "Net Cash Flow"];
  const ratiosOrder = ["Debtor Days", "Inventory Days", "Days Payable", "Cash Conversion Cycle", "Working Capital Days", "ROCE %"];

  const announcements = data.external_analyst?.announcements ?? [];

  return (
    <>
      <SEO
        title={PAGE_SEO.stockDetail.title(ticker)}
        description={PAGE_SEO.stockDetail.description(companyName, ticker, currentPrice ?? undefined)}
        canonical={`/stocks/${ticker}`}
        jsonLd={[
          generateStockBreadcrumbSchema(ticker, companyName),
          generateFinancialProductSchema(ticker, companyName, `Stock analysis for ${companyName} including fundamentals, financial statements, and shareholding pattern.`),
        ]}
      />

      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8 space-y-8">

          {/* HEADER */}
          <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 pb-2 border-b border-border/60">
            <div className="space-y-1.5 min-w-0">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">{companyName}</h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {basic.website && (
                  <a
                    href={basic.website.startsWith("http") ? basic.website : `https://${basic.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                  >
                    <Globe className="w-3 h-3" />
                    {basic.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </a>
                )}
                <span className="font-mono">{basic.exchange}: {basic.symbol}</span>
                {basic.sector && <span>· {basic.sector}</span>}
                {basic.industry && <span>· {basic.industry}</span>}
              </div>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl md:text-3xl font-semibold font-mono tabular-nums text-foreground">
                  {formatRupees(currentPrice)}
                </span>
                {priceChangePercent != null && (
                  <span className={cn("text-sm font-semibold tabular-nums", isPositive ? "text-positive" : "text-negative")}>
                    {isPositive ? "▲" : "▼"} {Math.abs(priceChangePercent).toFixed(2)}%
                  </span>
                )}
              </div>
              {f.last_updated && (
                <span className="text-[11px] text-muted-foreground mt-1">
                  Updated {new Date(f.last_updated).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              )}
            </div>
          </header>

          {/* KEY METRICS + ABOUT */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: 3x3 metric grid */}
            <div className="rounded-xl border border-border/50 bg-card p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6">
                <MetricRow label="Market Cap" value={formatCrore(f.market_cap)} />
                <MetricRow label="Current Price" value={formatRupees(currentPrice)} />
                <MetricRow
                  label="High / Low"
                  value={
                    f.fifty_two_week_high && f.fifty_two_week_low
                      ? `${formatRupees(f.fifty_two_week_high).replace("₹", "₹")} / ${formatRupees(f.fifty_two_week_low).replace("₹", "")}`
                      : "—"
                  }
                />
                <MetricRow label="Stock P/E" value={f.trailing_pe != null ? f.trailing_pe.toFixed(2) : "—"} />
                <MetricRow label="Book Value" value={f.price_to_book && currentPrice ? formatRupees(currentPrice / f.price_to_book) : "—"} />
                <MetricRow label="Dividend Yield" value={f.dividend_yield != null ? formatPct(f.dividend_yield * 100) : "—"} />
                <MetricRow label="ROCE" value={f.return_on_assets != null ? formatPct(f.return_on_assets * 100) : "—"} />
                <MetricRow label="ROE" value={f.return_on_equity != null ? formatPct(f.return_on_equity * 100) : "—"} />
                <MetricRow label="Face Value" value="—" />
              </div>
            </div>

            {/* Right: About + Key Points */}
            <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
              <div>
                <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">About</h3>
                {basic.description ? (
                  <p className="text-sm text-foreground leading-relaxed">{basic.description}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No description available.</p>
                )}
              </div>
              <div>
                <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Key Points</h3>
                <p className="text-sm text-muted-foreground">
                  {basic.industry ? `Operates in ${basic.industry}.` : "—"}
                  {basic.sector ? ` Part of the ${basic.sector} sector.` : ""}
                </p>
              </div>
            </div>
          </section>

          {/* CHART */}
          <section>
            <PriceChartSection key={ticker} ticker={ticker} />
          </section>

          {/* PROS / CONS */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-positive/30 bg-positive/5 p-5">
              <h3 className="text-xs uppercase tracking-wide text-positive font-semibold mb-3">Pros</h3>
              {pros.length > 0 ? (
                <ul className="space-y-2">
                  {pros.map((p, i) => (
                    <li key={i} className="text-sm text-foreground flex gap-2">
                      <span className="text-positive shrink-0">•</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No standout pros identified from current data.</p>
              )}
            </div>
            <div className="rounded-xl border border-negative/30 bg-negative/5 p-5">
              <h3 className="text-xs uppercase tracking-wide text-negative font-semibold mb-3">Cons</h3>
              {cons.length > 0 ? (
                <ul className="space-y-2">
                  {cons.map((c, i) => (
                    <li key={i} className="text-sm text-foreground flex gap-2">
                      <span className="text-negative shrink-0">•</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No major concerns flagged from current data.</p>
              )}
            </div>
          </section>
          <p className="text-xs text-muted-foreground -mt-4">* Pros and cons are derived from current fundamentals.</p>

          {/* QUARTERLY RESULTS */}
          <SectionCard title="Quarterly Results" subtitle="Consolidated figures in Rs. Crores">
            <FinancialTable
              data={data.financials.quarterly_financials}
              fieldOrder={incomeOrder}
              boldRows={["Operating Profit", "Profit before tax", "Net Profit"]}
              emptyMessage="Quarterly results not available."
            />
          </SectionCard>

          {/* PROFIT & LOSS */}
          <SectionCard title="Profit & Loss" subtitle="Consolidated figures in Rs. Crores">
            <FinancialTable
              data={data.financials.income_statement}
              fieldOrder={incomeOrder}
              boldRows={["Operating Profit", "Profit before tax", "Net Profit"]}
              emptyMessage="Profit & loss data not available."
            />
            {/* Compounded growth */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
              <GrowthCard
                title="Compounded Sales Growth"
                periods={[
                  { label: "10 Years", value: fmtGrowth(salesGrowth["10 Years"]) },
                  { label: "5 Years", value: fmtGrowth(salesGrowth["5 Years"]) },
                  { label: "3 Years", value: fmtGrowth(salesGrowth["3 Years"]) },
                  { label: "TTM", value: f.revenue_growth != null ? `${(f.revenue_growth * 100).toFixed(0)}%` : "—" },
                ]}
              />
              <GrowthCard
                title="Compounded Profit Growth"
                periods={[
                  { label: "10 Years", value: fmtGrowth(profitGrowth["10 Years"]) },
                  { label: "5 Years", value: fmtGrowth(profitGrowth["5 Years"]) },
                  { label: "3 Years", value: fmtGrowth(profitGrowth["3 Years"]) },
                  { label: "TTM", value: f.earnings_growth != null ? `${(f.earnings_growth * 100).toFixed(0)}%` : "—" },
                ]}
              />
              <GrowthCard
                title="Stock Price CAGR"
                periods={[
                  { label: "10 Years", value: "—" },
                  { label: "5 Years", value: "—" },
                  { label: "3 Years", value: "—" },
                  { label: "1 Year", value: priceChangePercent != null ? `${priceChangePercent.toFixed(0)}%` : "—" },
                ]}
              />
              <GrowthCard
                title="Return on Equity"
                periods={[
                  { label: "10 Years", value: "—" },
                  { label: "5 Years", value: "—" },
                  { label: "3 Years", value: "—" },
                  { label: "Last Year", value: f.return_on_equity != null ? `${(f.return_on_equity * 100).toFixed(0)}%` : "—" },
                ]}
              />
            </div>
          </SectionCard>

          {/* BALANCE SHEET */}
          <SectionCard title="Balance Sheet" subtitle="Consolidated figures in Rs. Crores">
            <FinancialTable
              data={data.financials.balance_sheet}
              fieldOrder={balanceOrder}
              boldRows={["Total Liabilities", "Total Assets"]}
              emptyMessage="Balance sheet data not available."
            />
          </SectionCard>

          {/* CASH FLOWS */}
          <SectionCard title="Cash Flows" subtitle="Consolidated figures in Rs. Crores">
            <FinancialTable
              data={data.financials.cash_flow}
              fieldOrder={cashflowOrder}
              boldRows={["Net Cash Flow"]}
              emptyMessage="Cash flow data not available."
            />
          </SectionCard>

          {/* RATIOS */}
          <SectionCard title="Ratios" subtitle="Consolidated figures">
            <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border/70">
                    <th className="text-left py-2.5 pr-3 font-medium text-muted-foreground sticky left-0 bg-card whitespace-nowrap" />
                    <th className="text-right py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Latest</th>
                  </tr>
                </thead>
                <tbody>
                  {ratiosOrder.map((label, idx) => {
                    let value = "—";
                    if (label === "ROCE %" && f.return_on_assets != null) value = `${Math.round(f.return_on_assets * 100)}%`;
                    const bold = label === "Cash Conversion Cycle" || label === "ROCE %" || label === "Days Payable";
                    return (
                      <tr
                        key={label}
                        className={cn(
                          "border-b border-border/30 last:border-b-0 transition-colors",
                          idx % 2 === 1 && "bg-muted/20",
                          "hover:bg-muted/40",
                        )}
                      >
                        <td className={cn(
                          "py-2 pr-3 sticky left-0 whitespace-nowrap text-foreground",
                          idx % 2 === 1 ? "bg-muted/20" : "bg-card",
                          bold && "font-semibold",
                        )}>
                          {label}
                        </td>
                        <td className={cn("text-right py-2 px-3 font-mono tabular-nums", bold && "font-semibold")}>{value}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* SHAREHOLDING PATTERN */}
          <SectionCard
            title="Shareholding Pattern"
            subtitle="Numbers in percentages"
          >
            {!shareholding ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Loading shareholding…</div>
            ) : shareholding.data.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Shareholding data not available.</div>
            ) : (
              <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border/70">
                      <th className="text-left py-2.5 pr-3 font-medium text-muted-foreground sticky left-0 bg-card whitespace-nowrap" />
                      {shareholding.quarters.map((q) => (
                        <th key={q} className="text-right py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">
                          {q}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shareholding.data.map((row, idx) => (
                      <tr
                        key={row.category}
                        className={cn(
                          "border-b border-border/30 last:border-b-0 transition-colors",
                          idx % 2 === 1 && "bg-muted/20",
                          "hover:bg-muted/40",
                        )}
                      >
                        <td className={cn(
                          "py-2 pr-3 sticky left-0 whitespace-nowrap text-foreground",
                          idx % 2 === 1 ? "bg-muted/20" : "bg-card",
                        )}>
                          {row.category}
                        </td>
                        {row.values.map((v, i) => (
                          <td key={i} className="text-right py-2 px-3 font-mono tabular-nums">
                            {v == null ? "—" : `${v.toFixed(2)}%`}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-muted-foreground mt-3">
                  * Classifications may have changed across quarters.
                </p>
              </div>
            )}
          </SectionCard>

          {/* DOCUMENTS / ANNOUNCEMENTS */}
          {announcements.length > 0 && (
            <SectionCard title="Documents">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {announcements.slice(0, 8).map((a, i) => (
                  <a
                    key={i}
                    href={a.link ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 p-3 rounded-lg border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                        {a.title ?? "Announcement"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {a.publisher ?? a.type ?? ""} {a.published_at ? `· ${new Date(a.published_at).toLocaleDateString("en-IN")}` : ""}
                      </p>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
                  </a>
                ))}
              </div>
            </SectionCard>
          )}

          {/* SENTIMENT + NEWS (re-added per user request) */}
          <SentimentProvider ticker={ticker}>
            <SectionCard title="AI Sentiment">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <SentimentGauge />
                <SentimentMetrics />
              </div>
            </SectionCard>

            <SectionCard title="News">
              <SentimentNewsSection />
            </SectionCard>
          </SentimentProvider>

          {/* Footer link back */}
          <div className="pt-2 pb-8">
            <Link href="/stocks" className="text-xs text-muted-foreground hover:text-primary transition-colors">
              ← Back to all stocks
            </Link>
          </div>

        </div>
      </div>
    </>
  );
}
