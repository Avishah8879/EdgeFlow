import { useState } from "react";
import { useParams, Redirect, Link } from "wouter";
import { useStockDetail } from "@/hooks/use-stock-detail";
import { useStockLTP } from "@/hooks/use-stock-ltp";
import { useMarketStatus } from "@/hooks/use-market-status";
import { SEO } from "@/components/SEO";
import { PAGE_SEO } from "@/lib/seo-config";
import { generateStockBreadcrumbSchema, generateFinancialProductSchema } from "@/lib/json-ld";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ExternalLink, Sparkles } from "lucide-react";
import PriceChartSection from "@/components/stock-detail/PriceChartSection";
import SentimentGauge from "@/components/stock-detail/SentimentGauge";
import SentimentMetrics from "@/components/stock-detail/SentimentMetrics";
import SentimentNewsSection from "@/components/stock-detail/SentimentNewsSection";
import { SentimentProvider } from "@/contexts/SentimentContext";
import { CollapsibleSection } from "@/components/stock-detail/CollapsibleSection";
import type { NavSection } from "@/components/stock-detail/StockDetailNav";
import { TocSidebar } from "@/components/stock-detail/TocSidebar";
import GenerateAlphaCard from "@/components/stock-detail/GenerateAlphaCard";
import { HeroStrip } from "@/components/stock-detail/HeroStrip";
import type { StatStripCell } from "@/components/stock-detail/StatStrip";
import { GrowthGrid } from "@/components/stock-detail/GrowthGrid";
import { FinancialSankey } from "@/components/stock-detail/FinancialSankey";
import { getEquityProAiUrl, EXTERNAL_LINK_PROPS } from "@/lib/external-links";
import { Button } from "@/components/ui/button";
import { FinancialTable } from "@/components/stock-detail/FinancialTable";
import { useCmotsCoverage } from "@/hooks/use-cmots-coverage";
import { CreditRatingsPanel } from "@/components/stock-detail/CreditRatingsPanel";
import { ProsConsPanel } from "@/components/stock-detail/ProsConsPanel";
import { CorporateActionsTimeline } from "@/components/stock-detail/CorporateActionsTimeline";
import { NarrativesPanel } from "@/components/stock-detail/NarrativesPanel";
import { RatiosPanel } from "@/components/stock-detail/RatiosPanel";
import { FinancialStatementsPanel } from "@/components/stock-detail/FinancialStatementsPanel";
import { Eyebrow } from "@/components/ui/eyebrow";
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

/**
 * Derive a market-cap tier label from the raw market_cap (rupees).
 * Uses SEBI's standard NSE/BSE classification thresholds:
 *   ≥ ₹20,000 Cr  → Large Cap
 *   ₹5,000 – 20,000 Cr → Mid Cap
 *   < ₹5,000 Cr  → Small Cap
 * Falls back to the explicit `tickers.mcap_type` when present (CMOTS-set);
 * derives from `market_cap` otherwise. Returns null if neither is available.
 */
function deriveMcapTier(
  mcapType: string | null | undefined,
  marketCap: number | null | undefined,
): "Large Cap" | "Mid Cap" | "Small Cap" | null {
  if (mcapType === "Large Cap" || mcapType === "Mid Cap" || mcapType === "Small Cap") {
    return mcapType;
  }
  if (marketCap == null || !Number.isFinite(marketCap)) return null;
  const cr = marketCap / 1e7;
  if (cr >= 20000) return "Large Cap";
  if (cr >= 5000) return "Mid Cap";
  return "Small Cap";
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

// ─── main page ──────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 space-y-6">
      <Skeleton className="h-12 w-2/3" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-96 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function ErrorState({ error }: { error: Error }) {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-16">
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
  const { data: marketStatus } = useMarketStatus();
  const { data: cmotsCoverage } = useCmotsCoverage(ticker);
  const hasCmotsData = !!cmotsCoverage?.has_cmots_data;
  const [shareholdingView, setShareholdingView] = useState<"quarterly" | "yearly">("quarterly");
  // Sankey inline expand inside P&L section. Defaults closed; lazy mount on first toggle.
  // State resets on ticker change because Wouter unmounts/remounts StockDetail on route change.
  const [sankeyOpen, setSankeyOpen] = useState(false);

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

  const announcements = data.external_analyst?.announcements ?? [];

  // Build nav section list. CMOTS sections appear only when the ticker is
  // covered; Pros/Cons is always present (it has a yfinance fallback adapter).
  const navSections: NavSection[] = [
    { id: "price-action",   label: "Price" },
    { id: "pros-cons",      label: "Pros/Cons" },
    { id: "quarterly",      label: "Quarterly" },
    { id: "pnl",            label: "P&L" },
    { id: "balance-sheet",  label: "Balance Sheet" },
    { id: "cash-flows",     label: "Cash Flows" },
    { id: "ratios",         label: "Ratios" },
    ...(hasCmotsData ? [
      { id: "cmots-financials", label: "Statements" },
      { id: "cmots-ratios",     label: "Key Ratios" },
    ] : []),
    { id: "shareholding",   label: "Shareholding" },
    ...(hasCmotsData ? [
      { id: "cmots-corporate-actions", label: "Corp Actions" },
      { id: "cmots-narratives",        label: "Reports" },
      { id: "cmots-credit-ratings",    label: "Ratings" },
    ] : []),
    { id: "sentiment",      label: "Sentiment" },
    { id: "news",           label: "News" },
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
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8 space-y-6">

          {/* HERO — Phase B: extracted to HeroStrip composing TickerMark + StatStrip.
              Stat strip content unchanged from current page (7 cells: Mkt Cap | P/E | P/B
              | Div Yield | 52W Range | ROCE | ROE). Subtexts deferred to Phase D. */}
          {(() => {
            const heroStats: StatStripCell[] = [
              { label: "Market Cap", value: formatCrore(f.market_cap) },
              { label: "P / E", value: f.trailing_pe != null ? f.trailing_pe.toFixed(2) : "—" },
              { label: "P / B", value: f.price_to_book != null ? f.price_to_book.toFixed(2) : "—" },
              {
                label: "Div Yield",
                value: f.dividend_yield != null ? formatPct(f.dividend_yield * 100) : "—",
              },
              {
                label: "52W Range",
                value:
                  f.fifty_two_week_high && f.fifty_two_week_low
                    ? `${formatRupees(f.fifty_two_week_low).replace("₹", "")}–${formatRupees(
                        f.fifty_two_week_high,
                      ).replace("₹", "")}`
                    : "—",
              },
              {
                // API returns return_on_assets as percentage already (×100 applied server-side).
                // Do NOT multiply by 100 again. Same applies to ROE and ProsConsPanel adapter
                // fields. dividend_yield is the lone exception (returned as fraction).
                //
                // Label: "ROA" (not "ROCE") — return_on_assets is Return on Assets, which
                // diverges from Return on Capital Employed for capital-intensive sectors
                // (e.g. RELIANCE ROA ~4%, ROCE ~10-12%). Phase D swaps the data source to
                // `cmots_ratio_yearly.roce` and renames this label back to "ROCE".
                label: "ROA",
                value: f.return_on_assets != null ? formatPct(f.return_on_assets) : "—",
              },
              {
                label: "ROE",
                value: f.return_on_equity != null ? formatPct(f.return_on_equity) : "—",
              },
            ];
            const mcapTier = deriveMcapTier(
              (basic as { mcap_type?: string | null }).mcap_type ?? null,
              f.market_cap,
            );
            // Absolute change in rupees, derived from CMP − previous close.
            // Falls back to null when either is missing.
            const priceChangeAbsolute =
              currentPrice != null && f.previous_close != null
                ? currentPrice - f.previous_close
                : null;
            const priceChangeAbsoluteFormatted =
              priceChangeAbsolute != null && Number.isFinite(priceChangeAbsolute)
                ? `${priceChangeAbsolute >= 0 ? "+" : "−"}${Math.abs(priceChangeAbsolute).toFixed(2)}`
                : null;
            // Status line: "LIVE · NSE · 14:32 IST" or "CLOSED · NSE" variants.
            const statusLabel = (() => {
              if (!marketStatus) return null;
              if (marketStatus.is_open) return "LIVE";
              const map: Record<string, string> = {
                PRE_MARKET: "PRE-MARKET",
                "PRE-MARKET": "PRE-MARKET",
                AFTER_HOURS: "CLOSED",
                "POST-MARKET": "CLOSED",
                HOLIDAY: "CLOSED",
                WEEKEND: "CLOSED",
                CLOSED: "CLOSED",
              };
              return map[marketStatus.status] ?? "CLOSED";
            })();
            const quoteTime = ltpData?.timestamp
              ? new Date(ltpData.timestamp).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                  timeZone: "Asia/Kolkata",
                })
              : null;
            const statusLine = [statusLabel, basic.exchange ?? "NSE", quoteTime ? `${quoteTime} IST` : null]
              .filter(Boolean)
              .join(" · ") || null;
            // Quick actions: Watchlist + Compare hidden per Phase 0 §7 q14 lock
            // (Watchlist is hidden in app per CLAUDE.md Known Issues; Compare has no route).
            // Generate Pinescript → external EquityPro AI URL.
            const quickActions = (
              <Button
                asChild
                size="sm"
                className="bg-[hsl(var(--brand-gold))] hover:bg-[hsl(var(--brand-gold-bright))] text-[hsl(var(--brand-navy))] font-semibold"
              >
                <a href={`${getEquityProAiUrl()}?ticker=${encodeURIComponent(basic.symbol)}`} {...EXTERNAL_LINK_PROPS}>
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Generate Pinescript
                  <ExternalLink className="h-3 w-3 ml-1.5" />
                </a>
              </Button>
            );
            return (
              <HeroStrip
                companyName={companyName}
                basic={basic}
                priceFormatted={formatRupees(currentPrice)}
                priceChangeAbsoluteFormatted={priceChangeAbsoluteFormatted}
                priceChangePercent={priceChangePercent}
                statusLine={statusLine}
                stats={heroStats}
                mcapTier={mcapTier}
                quickActions={quickActions}
              />
            );
          })()}

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

          {/* TWO-COLUMN LAYOUT: left = sections, right = TOC + sidebar cards (Phase A) */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6">

            {/* LEFT COLUMN — sections */}
            <div className="space-y-6 min-w-0">

          {/* PRICE ACTION */}
          <CollapsibleSection id="price-action" title="Price Action" collapsible={false}>
            <PriceChartSection key={ticker} ticker={ticker} />
          </CollapsibleSection>

          {/* PROS & CONS — CMOTS rule engine on covered tickers, yfinance fallback on uncovered */}
          <CollapsibleSection id="pros-cons" title="Pros & Cons" collapsible={false}>
            <ProsConsPanel ticker={basic.symbol} fundamentalsFallback={f} />
          </CollapsibleSection>

          {/* QUARTERLY RESULTS */}
          <CollapsibleSection id="quarterly" title="Quarterly Results" subtitle="Consolidated figures in Rs. Crores" collapsible={false}>
            <FinancialTable
              data={data.financials.quarterly_financials}
              rows={incomeRows}
              emptyMessage="Quarterly results not available."
              density="narrow"
            />
          </CollapsibleSection>

          {/* PROFIT & LOSS */}
          <CollapsibleSection
            id="pnl"
            title="Profit & Loss"
            subtitle="Consolidated figures in Rs. Crores"
            collapsible={false}
            action={
              <button
                type="button"
                onClick={() => setSankeyOpen((v) => !v)}
                className="text-xs font-medium text-muted-foreground hover:text-[hsl(var(--brand-gold))] transition-colors inline-flex items-center gap-1"
                aria-expanded={sankeyOpen}
                aria-controls="pnl-sankey"
              >
                {sankeyOpen ? "Hide Revenue Flow" : "View Revenue Flow"}
                <span aria-hidden>{sankeyOpen ? "↑" : "→"}</span>
              </button>
            }
          >
            <FinancialTable
              data={data.financials.income_statement}
              rows={incomeRows}
              emptyMessage="Profit & loss data not available."
              density="narrow"
            />
            {/* Lazy mount: <FinancialSankey> only renders when toggled open.
                Verifiable via DevTools Network — no /api/sankey/ requests fire
                until first click. State resets on ticker change (Wouter
                unmounts/remounts StockDetail on route change). */}
            {sankeyOpen && (
              <div id="pnl-sankey" className="mt-6 pt-6 border-t border-border/40">
                <h3 className="text-[11px] font-semibold uppercase tracking-uppercase text-muted-foreground mb-3">
                  Revenue Flow · Sankey
                </h3>
                <FinancialSankey ticker={basic.symbol} statementType="income" />
              </div>
            )}
            <GrowthGrid
              cards={[
                {
                  title: "Compounded Sales Growth",
                  periods: [
                    { label: "10 Years", value: fmtGrowth(salesGrowth["10 Years"]) },
                    { label: "5 Years", value: fmtGrowth(salesGrowth["5 Years"]) },
                    { label: "3 Years", value: fmtGrowth(salesGrowth["3 Years"]) },
                    { label: "TTM", value: f.revenue_growth != null ? `${f.revenue_growth.toFixed(0)}%` : "—" },
                  ],
                },
                {
                  title: "Compounded Profit Growth",
                  periods: [
                    { label: "10 Years", value: fmtGrowth(profitGrowth["10 Years"]) },
                    { label: "5 Years", value: fmtGrowth(profitGrowth["5 Years"]) },
                    { label: "3 Years", value: fmtGrowth(profitGrowth["3 Years"]) },
                    { label: "TTM", value: f.earnings_growth != null ? `${f.earnings_growth.toFixed(0)}%` : "—" },
                  ],
                },
                {
                  title: "Stock Price CAGR",
                  // 10Y/5Y/3Y placeholders pending Phase D usePriceChart over multi-year windows.
                  periods: [
                    { label: "10 Years", value: "—" },
                    { label: "5 Years", value: "—" },
                    { label: "3 Years", value: "—" },
                    { label: "1 Year", value: priceChangePercent != null ? `${priceChangePercent.toFixed(0)}%` : "—" },
                  ],
                },
                {
                  title: "Return on Equity",
                  // 10Y/5Y/3Y placeholders pending Phase D wiring to cmots_ratio_yearly.roe history.
                  periods: [
                    { label: "10 Years", value: "—" },
                    { label: "5 Years", value: "—" },
                    { label: "3 Years", value: "—" },
                    { label: "Last Year", value: f.return_on_equity != null ? `${f.return_on_equity.toFixed(0)}%` : "—" },
                  ],
                },
              ]}
            />
          </CollapsibleSection>

          {/* BALANCE SHEET */}
          <CollapsibleSection id="balance-sheet" title="Balance Sheet" subtitle="Consolidated figures in Rs. Crores" collapsible={false}>
            <FinancialTable
              data={data.financials.balance_sheet}
              rows={balanceRows}
              emptyMessage="Balance sheet data not available."
              density="narrow"
            />
          </CollapsibleSection>

          {/* CASH FLOWS */}
          <CollapsibleSection id="cash-flows" title="Cash Flows" subtitle="Consolidated figures in Rs. Crores" collapsible={false}>
            <FinancialTable
              data={data.financials.cash_flow}
              rows={cashflowRows}
              emptyMessage="Cash flow data not available."
              density="narrow"
            />
          </CollapsibleSection>

          {/* RATIOS */}
          <CollapsibleSection id="ratios" title="Ratios" subtitle="Consolidated figures" collapsible={false}>
            <FinancialTable
              data={
                f.return_on_assets != null
                  ? { Latest: { "ROCE %": Math.round(f.return_on_assets) } }
                  : null
              }
              rows={ratiosRows}
              emptyMessage="Ratio data not available."
              density="narrow"
            />
          </CollapsibleSection>

          {/* CMOTS STATEMENTS + KEY RATIOS — covered tickers only */}
          {hasCmotsData && (
            <>
              <CollapsibleSection id="cmots-financials" title="Statements" subtitle="CMOTS detailed financial statements" collapsible={false}>
                <FinancialStatementsPanel ticker={basic.symbol} />
              </CollapsibleSection>
              <CollapsibleSection id="cmots-ratios" title="Key Ratios" subtitle="CMOTS yearly / quarterly / daily" collapsible={false}>
                <RatiosPanel ticker={basic.symbol} />
              </CollapsibleSection>
            </>
          )}

          {/* SHAREHOLDING PATTERN */}
          <CollapsibleSection
            id="shareholding"
            title="Shareholding Pattern"
            subtitle="Numbers in percentages"
            collapsible={false}
            action={
              <ShareholdingViewToggle view={shareholdingView} onViewChange={setShareholdingView} />
            }
          >
            <ShareholdingPattern ticker={ticker} view={shareholdingView} />
          </CollapsibleSection>

          {/* CMOTS CORPORATE ACTIONS + REPORTS + CREDIT RATINGS — covered tickers only */}
          {hasCmotsData && (
            <>
              <CollapsibleSection id="cmots-corporate-actions" title="Corporate Actions" subtitle="Dividends, bonuses, board meetings" collapsible={false}>
                <CorporateActionsTimeline ticker={basic.symbol} />
              </CollapsibleSection>
              <CollapsibleSection id="cmots-narratives" title="Reports" subtitle="Director's Report, Auditor's Report, MD&A" collapsible={false}>
                <NarrativesPanel ticker={basic.symbol} />
              </CollapsibleSection>
              <CollapsibleSection id="cmots-credit-ratings" title="Credit Ratings" subtitle="Agency-reported credit ratings" collapsible={false}>
                <CreditRatingsPanel ticker={basic.symbol} />
              </CollapsibleSection>
            </>
          )}

          {/* SENTIMENT + NEWS */}
          <SentimentProvider ticker={ticker}>
            <CollapsibleSection id="sentiment" title="AI Sentiment" collapsible={false}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <SentimentGauge />
                <SentimentMetrics />
              </div>
            </CollapsibleSection>

            <CollapsibleSection id="news" title="News" collapsible={false}>
              <SentimentNewsSection />
            </CollapsibleSection>
          </SentimentProvider>

          {/* DOCUMENTS / ANNOUNCEMENTS */}
          {announcements.length > 0 && (
            <CollapsibleSection id="documents" title="Documents" collapsible={false}>
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

              {/* Footer link back (within left column) */}
              <div className="pt-2 pb-2">
                <Link href="/stocks" className="text-xs text-muted-foreground hover:text-primary transition-colors">
                  ← Back to all stocks
                </Link>
              </div>

            </div>
            {/* END left column */}

            {/* RIGHT COLUMN — sticky sidebar with vertical TOC + (Phase A) GenerateAlphaCard. Phase B will add AnalystRecommendationCard + ReverseDCFCard. */}
            <aside className="hidden lg:flex lg:flex-col gap-5 lg:sticky lg:top-20 lg:self-start lg:h-[calc(100vh-6rem)] lg:overflow-y-auto">
              <TocSidebar sections={navSections} />
              <GenerateAlphaCard ticker={basic.symbol} />
            </aside>

          </div>
          {/* END two-column layout */}

        </div>
      </div>
    </>
  );
}
