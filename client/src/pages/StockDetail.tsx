import { useState } from "react";
import { useParams, Redirect, Link } from "wouter";
import { useStockDetail } from "@/hooks/use-stock-detail";
import { useStockLTP } from "@/hooks/use-stock-ltp";
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
import { CollapsibleSection } from "@/components/stock-detail/CollapsibleSection";
import { StockDetailNav, type NavSection } from "@/components/stock-detail/StockDetailNav";
import { FinancialTable } from "@/components/stock-detail/FinancialTable";
import { Eyebrow } from "@/components/ui/eyebrow";
import { DeltaBadge } from "@/components/ui/delta-badge";
import {
  incomeRows,
  balanceRows,
  cashflowRows,
  ratiosRows,
} from "@/components/stock-detail/financial-rows";
import ShareholdingPattern, {
  ShareholdingViewToggle,
} from "@/components/stock-detail/ShareholdingPattern";
import { cn } from "@/lib/utils";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatCrore(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const cr = value / 1e7;
  if (Math.abs(cr) >= 100000) return `${(cr / 100000).toFixed(2).replace(/\.00$/, "")} L Cr`;
  return `${cr.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`;
}

function formatPct(value: number | null | undefined, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(decimals)}%`;
}

function formatRupees(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
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

/**
 * StatCell — single cell in the 7-up stat strip below the hero.
 * Mirrors the design's `.stat-cell` pattern (eyebrow + mono value).
 */
function StatCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-3.5 md:p-4 border-r last:border-r-0 border-b sm:[&:nth-child(-n+4)]:border-b lg:border-b-0 border-border">
      <div className="text-[10px] font-bold uppercase tracking-uppercase text-muted-foreground">{label}</div>
      <div className="font-mono text-base font-bold tabular-nums text-foreground mt-1.5 leading-none">
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
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
  const [shareholdingView, setShareholdingView] = useState<"quarterly" | "yearly">("quarterly");

  if (error && !isLoading) return <ErrorState error={error as Error} />;
  if (isLoading || !data) return <LoadingState />;

  const f = data.fundamentals;
  const basic = data.basic_info;

  const currentPrice = ltpData?.ltp ?? f.current_price;
  const priceChangePercent = ltpData?.percent_change ?? f.price_change_percent;
  const isPositive = priceChangePercent != null && priceChangePercent >= 0;
  const lastUpdatedAt = ltpData?.timestamp ?? f.last_updated;

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

  const announcements = data.external_analyst?.announcements ?? [];

  // Build nav section list. CollapsibleSection handles empty states internally.
  const navSections: NavSection[] = [
    { id: "price-action", label: "Price" },
    { id: "quarterly", label: "Quarterly" },
    { id: "pnl", label: "P&L" },
    { id: "balance-sheet", label: "Balance Sheet" },
    { id: "cash-flows", label: "Cash Flows" },
    { id: "ratios", label: "Ratios" },
    { id: "shareholding", label: "Shareholding" },
    { id: "sentiment", label: "Sentiment" },
    { id: "news", label: "News" },
  ];
  if (announcements.length > 0) navSections.push({ id: "documents", label: "Documents" });

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
        <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8 space-y-6">

          {/* HERO — gradient bg with breadcrumbs + ticker mark + display H1 + price block */}
          <section
            className="relative overflow-hidden rounded-xl border border-border bg-card -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 pt-5 pb-6"
            style={{
              background:
                "radial-gradient(800px 200px at 90% -50%, hsl(var(--brand-gold) / 0.10), transparent 70%), linear-gradient(180deg, hsl(var(--card)), hsl(var(--background)))",
            }}
          >
            {/* Breadcrumbs */}
            <nav className="text-xs text-muted-foreground flex items-center gap-1.5 mb-3" aria-label="Breadcrumb">
              <Link href="/home" className="hover:text-[hsl(var(--brand-gold))] transition-colors">Markets</Link>
              <span className="opacity-40">/</span>
              <Link href="/stocks" className="hover:text-[hsl(var(--brand-gold))] transition-colors">Stocks</Link>
              <span className="opacity-40">/</span>
              <span className="text-foreground/80">{basic.symbol}</span>
            </nav>

            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5">
              <div className="flex items-start gap-4 min-w-0">
                {/* Ticker mark — gradient navy badge with the first 2 letters of the symbol */}
                <div
                  aria-hidden
                  className="hidden sm:flex shrink-0 h-14 w-14 items-center justify-center rounded-xl border border-[hsl(var(--brand-gold)/0.4)] text-white font-display font-extrabold text-lg tabular-nums shadow-card"
                  style={{
                    background:
                      "linear-gradient(135deg, hsl(var(--brand-navy)) 0%, hsl(var(--brand-navy-deep)) 100%)",
                  }}
                >
                  {basic.symbol.slice(0, 2).toUpperCase()}
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Eyebrow tone="gold">
                    Stock · {basic.exchange} · {basic.symbol}
                  </Eyebrow>
                  <h1 className="font-display text-2xl md:text-3xl font-bold leading-tight tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
                    {companyName}
                  </h1>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {basic.website && (
                      <a
                        href={basic.website.startsWith("http") ? basic.website : `https://${basic.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:text-[hsl(var(--brand-gold))] transition-colors"
                      >
                        <Globe className="w-3 h-3" />
                        {basic.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                      </a>
                    )}
                    {basic.sector && <span>· {basic.sector}</span>}
                    {basic.industry && <span>· {basic.industry}</span>}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-start md:items-end shrink-0">
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl md:text-4xl font-semibold font-mono tabular-nums text-foreground leading-none">
                    {formatRupees(currentPrice)}
                  </span>
                  {priceChangePercent != null && (
                    <DeltaBadge
                      value={priceChangePercent}
                      suffix="%"
                      direction={isPositive ? "up" : "down"}
                    />
                  )}
                </div>
                {lastUpdatedAt && (
                  <span className="text-[10.5px] text-muted-foreground mt-1.5 font-bold uppercase tracking-uppercase">
                    Updated {new Date(lastUpdatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* 7-cell stat strip */}
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
              <StatCell label="Market Cap" value={formatCrore(f.market_cap)} />
              <StatCell
                label="P / E"
                value={f.trailing_pe != null ? f.trailing_pe.toFixed(2) : "—"}
              />
              <StatCell
                label="P / B"
                value={f.price_to_book != null ? f.price_to_book.toFixed(2) : "—"}
              />
              <StatCell
                label="Div Yield"
                value={f.dividend_yield != null ? formatPct(f.dividend_yield * 100) : "—"}
              />
              <StatCell
                label="52W Range"
                value={
                  f.fifty_two_week_high && f.fifty_two_week_low
                    ? `${formatRupees(f.fifty_two_week_low).replace("₹", "")}–${formatRupees(f.fifty_two_week_high).replace("₹", "")}`
                    : "—"
                }
              />
              <StatCell
                label="ROCE"
                value={f.return_on_assets != null ? formatPct(f.return_on_assets * 100) : "—"}
              />
              <StatCell
                label="ROE"
                value={f.return_on_equity != null ? formatPct(f.return_on_equity * 100) : "—"}
              />
            </div>
          </section>

          {/* About + Key Points (combined card) */}
          <section className="rounded-xl border border-border bg-card p-5 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <Eyebrow className="mb-2 block">About</Eyebrow>
              {basic.description ? (
                <p className="text-sm text-foreground leading-relaxed">{basic.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No description available.</p>
              )}
            </div>
            <div>
              <Eyebrow className="mb-2 block">Key Points</Eyebrow>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {basic.industry ? `Operates in ${basic.industry}.` : "—"}
                {basic.sector ? ` Part of the ${basic.sector} sector.` : ""}
              </p>
            </div>
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

          {/* IN-PAGE NAV (sticky) */}
          <StockDetailNav sections={navSections} />

          {/* PRICE ACTION */}
          <CollapsibleSection id="price-action" title="Price Action" defaultOpen>
            <PriceChartSection key={ticker} ticker={ticker} />
          </CollapsibleSection>

          {/* QUARTERLY RESULTS */}
          <CollapsibleSection id="quarterly" title="Quarterly Results" subtitle="Consolidated figures in Rs. Crores" defaultOpen>
            <FinancialTable
              data={data.financials.quarterly_financials}
              rows={incomeRows}
              emptyMessage="Quarterly results not available."
            />
          </CollapsibleSection>

          {/* PROFIT & LOSS */}
          <CollapsibleSection id="pnl" title="Profit & Loss" subtitle="Consolidated figures in Rs. Crores" defaultOpen>
            <FinancialTable
              data={data.financials.income_statement}
              rows={incomeRows}
              emptyMessage="Profit & loss data not available."
            />
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
          </CollapsibleSection>

          {/* BALANCE SHEET */}
          <CollapsibleSection id="balance-sheet" title="Balance Sheet" subtitle="Consolidated figures in Rs. Crores" defaultOpen>
            <FinancialTable
              data={data.financials.balance_sheet}
              rows={balanceRows}
              emptyMessage="Balance sheet data not available."
            />
          </CollapsibleSection>

          {/* CASH FLOWS */}
          <CollapsibleSection id="cash-flows" title="Cash Flows" subtitle="Consolidated figures in Rs. Crores" defaultOpen={false}>
            <FinancialTable
              data={data.financials.cash_flow}
              rows={cashflowRows}
              emptyMessage="Cash flow data not available."
            />
          </CollapsibleSection>

          {/* RATIOS */}
          <CollapsibleSection id="ratios" title="Ratios" subtitle="Consolidated figures" defaultOpen={false}>
            <FinancialTable
              data={
                f.return_on_assets != null
                  ? { Latest: { "ROCE %": Math.round(f.return_on_assets * 100) } }
                  : null
              }
              rows={ratiosRows}
              emptyMessage="Ratio data not available."
            />
          </CollapsibleSection>

          {/* SHAREHOLDING PATTERN */}
          <CollapsibleSection
            id="shareholding"
            title="Shareholding Pattern"
            subtitle="Numbers in percentages"
            defaultOpen={false}
            action={
              <ShareholdingViewToggle view={shareholdingView} onViewChange={setShareholdingView} />
            }
          >
            <ShareholdingPattern ticker={ticker} view={shareholdingView} />
          </CollapsibleSection>

          {/* SENTIMENT + NEWS */}
          <SentimentProvider ticker={ticker}>
            <CollapsibleSection id="sentiment" title="AI Sentiment" defaultOpen={false}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <SentimentGauge />
                <SentimentMetrics />
              </div>
            </CollapsibleSection>

            <CollapsibleSection id="news" title="News" defaultOpen={false}>
              <SentimentNewsSection />
            </CollapsibleSection>
          </SentimentProvider>

          {/* DOCUMENTS / ANNOUNCEMENTS */}
          {announcements.length > 0 && (
            <CollapsibleSection id="documents" title="Documents" defaultOpen={false}>
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
            </CollapsibleSection>
          )}

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
