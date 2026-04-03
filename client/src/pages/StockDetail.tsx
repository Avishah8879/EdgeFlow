import { useParams, Redirect, Link } from "wouter";
import { useState } from "react";
import { useStockDetail } from "@/hooks/use-stock-detail";
import { useStockLTP } from "@/hooks/use-stock-ltp";
import { SEO } from "@/components/SEO";
import { PAGE_SEO } from "@/lib/seo-config";
import { generateStockBreadcrumbSchema, generateFinancialProductSchema } from "@/lib/json-ld";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertCircle, TrendingUp, TrendingDown, ChevronUp, ChevronDown, Home, ChevronRight, BarChart2, Activity, FileText, Brain } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AnimatePresence, motion } from "framer-motion";
import StockScorecard from "@/components/stock-detail/StockScorecard";
import ActionCardsWidget from "@/components/stock-detail/ActionCardsWidget";
import AnalystRecommendationCard from "@/components/stock-detail/AnalystRecommendationCard";
import PriceChartSection from "@/components/stock-detail/PriceChartSection";
import KeyMetricsCard from "@/components/stock-detail/KeyMetricsCard";
import SentimentGauge from "@/components/stock-detail/SentimentGauge";
import SentimentMetrics from "@/components/stock-detail/SentimentMetrics";
import FundamentalsTable from "@/components/stock-detail/FundamentalsTable";
import ShareholdingPattern from "@/components/stock-detail/ShareholdingPattern";
import TechnicalIndicatorsTable from "@/components/stock-detail/TechnicalIndicatorsTable";
import ReverseDCFCard from "@/components/stock-detail/ReverseDCFCard";
import FinancialStatementsSection from "@/components/stock-detail/FinancialStatementsSection";
import SentimentNewsSection from "@/components/stock-detail/SentimentNewsSection";
import { SentimentProvider } from "@/contexts/SentimentContext";
import { getValueColorClass, formatFinancialValue } from "@/lib/theme-utils";

function getSuffixConfig(suffix: string | null): { label: string; variant: "default" | "secondary" | "outline" } | null {
  if (!suffix || suffix === "-EQ") return null;
  const config: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
    "-SM":    { label: "SME",            variant: "outline" },
    "-BE":    { label: "T2T",            variant: "outline" },
    "-ST":    { label: "Surveillance",   variant: "outline" },
    "-INDEX": { label: "Index",          variant: "secondary" },
    "-NAV":   { label: "NAV",            variant: "secondary" },
  };
  return config[suffix] || null;
}

// Completely redesigned stock header
function StockHeader({ data, ltpData }: { data: any; ltpData?: any }) {
  const currentPrice = ltpData?.ltp ?? data.fundamentals.current_price;
  const priceChangePercent = ltpData?.changePercent ?? data.fundamentals.price_change_percent;
  const priceChange = currentPrice && priceChangePercent !== null
    ? (currentPrice * priceChangePercent) / 100
    : data.fundamentals.price_change;
  const isPositive = priceChange != null && priceChange >= 0;

  const companyName = (() => {
    const longName = data.basic_info.long_name;
    const isValid = longName &&
      !longName.includes(",") &&
      !longName.match(/^\w+\.\w{2},/) &&
      longName !== data.basic_info.symbol;
    return isValid ? longName : data.basic_info.name;
  })();

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      {/* Top accent bar */}
      <div className="h-0.5 bg-gradient-to-r from-primary via-primary/60 to-transparent" />

      <div className="px-5 py-4">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
          <Link href="/" className="hover:text-foreground transition-colors flex items-center gap-1">
            <Home className="w-3 h-3" /> Home
          </Link>
          <ChevronRight className="w-3 h-3 opacity-40" />
          <Link href="/stocks" className="hover:text-foreground transition-colors">Stocks</Link>
          <ChevronRight className="w-3 h-3 opacity-40" />
          <span className="text-foreground font-medium">{data.basic_info.symbol}</span>
        </nav>

        {/* Main header row */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Left: name + badges */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight leading-tight">{companyName}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary">
                {data.basic_info.symbol}
              </span>
              <span className="text-xs text-muted-foreground">{data.basic_info.exchange}</span>
              {data.basic_info.sector && (
                <Badge variant="secondary" className="text-[11px] h-5">{data.basic_info.sector}</Badge>
              )}
              {(() => {
                const s = getSuffixConfig(data.basic_info.suffix);
                return s ? <Badge variant={s.variant} className="text-[11px] h-5">{s.label}</Badge> : null;
              })()}
            </div>
          </div>

          {/* Right: price */}
          <div className="flex flex-col items-start lg:items-end gap-1">
            <div className="font-mono text-4xl font-bold tracking-tight">
              {currentPrice != null ? `₹${currentPrice.toFixed(2)}` : "—"}
            </div>
            {priceChange != null && priceChangePercent != null && (
              <div className={`flex items-center gap-1.5 text-sm font-semibold ${getValueColorClass(priceChange)}`}>
                {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span>
                  {isPositive ? "+" : ""}{priceChange.toFixed(2)}&nbsp;
                  ({isPositive ? "+" : ""}{priceChangePercent.toFixed(2)}%)
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Redesigned metrics strip
function KeyMetricsBar({ data }: { data: any }) {
  const metrics = [
    { label: "Mkt Cap",  display: formatFinancialValue(data.market_cap, { compact: true }) },
    { label: "P/E",      display: data.trailing_pe?.toFixed(2) },
    { label: "Volume",   display: formatFinancialValue(data.volume, { compact: true }) },
    { label: "52W High", display: data.fifty_two_week_high ? `₹${data.fifty_two_week_high.toFixed(2)}` : null },
    { label: "52W Low",  display: data.fifty_two_week_low  ? `₹${data.fifty_two_week_low.toFixed(2)}`  : null },
    { label: "Div Yield",display: data.dividend_yield ? `${data.dividend_yield.toFixed(2)}%` : null },
    { label: "Beta",     display: data.beta?.toFixed(2) },
  ].filter(m => m.display != null && m.display !== "—");

  return (
    <div className="rounded-lg border border-border/40 bg-card/50 px-4 py-3">
      <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide">
        {metrics.map((m, i) => (
          <div key={i} className="flex flex-col gap-0.5 shrink-0">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{m.label}</span>
            <span className="text-sm font-semibold font-mono">{m.display}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionDivider({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2.5 py-1">
      <div className="flex items-center justify-center w-6 h-6 rounded bg-primary/10 border border-primary/20">
        <Icon className="w-3 h-3 text-primary" />
      </div>
      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/80">{title}</span>
      <div className="flex-1 h-px bg-border/40" />
    </div>
  );
}

function DescriptionCard({ description }: { description: string | null }) {
  if (!description) return null;
  return (
    <Card className="border-border/40">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">About</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4 hover:line-clamp-none transition-all">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 space-y-6">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-12 w-full" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Skeleton className="lg:col-span-3 h-96" />
        <Skeleton className="lg:col-span-9 h-96" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
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
  const [showTechnicals, setShowTechnicals] = useState(false);

  if (!ticker) return <Redirect to="/stocks" />;

  const { data, isLoading, error } = useStockDetail(ticker);
  const { data: ltpData } = useStockLTP(ticker);

  if (error && !isLoading) return <ErrorState error={error as Error} />;
  if (isLoading || !data) return <LoadingState />;

  const companyName = data.basic_info.long_name || data.basic_info.name || ticker;
  const currentPrice = ltpData?.ltp ?? data.fundamentals.current_price;

  return (
    <>
      <SEO
        title={PAGE_SEO.stockDetail.title(ticker)}
        description={PAGE_SEO.stockDetail.description(companyName, ticker, currentPrice ?? undefined)}
        canonical={`/stocks/${ticker}`}
        jsonLd={[
          generateStockBreadcrumbSchema(ticker, companyName),
          generateFinancialProductSchema(ticker, companyName, `AI-powered stock analysis for ${companyName} including sentiment, technical indicators, and fundamentals.`),
        ]}
      />

      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 space-y-5">

        {/* Header */}
        <AnimatePresence mode="wait">
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <StockHeader data={data} ltpData={ltpData} />
          </motion.div>
        </AnimatePresence>

        {/* Key Metrics Strip */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: 0.05 }}>
          <KeyMetricsBar data={data.fundamentals} />
        </motion.div>

        {/* Description */}
        {data.basic_info.description && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: 0.08 }}>
            <DescriptionCard description={data.basic_info.description} />
          </motion.div>
        )}

        {/* Section: Chart & Scorecard */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: 0.12 }} className="space-y-3">
          <SectionDivider icon={BarChart2} title="Price Analysis" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            <div className="lg:col-span-3 flex flex-col gap-4 min-h-[580px]">
              <StockScorecard ticker={ticker} />
              <ActionCardsWidget ticker={ticker} />
            </div>
            <div className="lg:col-span-9">
              <PriceChartSection key={ticker} ticker={ticker} />
            </div>
          </div>
        </motion.div>

        {/* Section: Sentiment */}
        <SentimentProvider ticker={ticker}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: 0.18 }} className="space-y-3">
            <SectionDivider icon={Brain} title="Sentiment & AI Analysis" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <SentimentGauge />
              <SentimentMetrics />
            </div>
          </motion.div>

          {/* Section: Fundamentals & Analyst */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: 0.22 }} className="space-y-3">
            <SectionDivider icon={FileText} title="Fundamentals & Research" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <FundamentalsTable data={data.fundamentals} />
              <AnalystRecommendationCard data={data} ticker={ticker} />
            </div>
          </motion.div>

          {/* Shareholding */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: 0.26 }}>
            <ShareholdingPattern ticker={ticker} />
          </motion.div>

          {/* Technical Indicators - collapsible */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: 0.3 }} className="space-y-3">
            <SectionDivider icon={Activity} title="Technical Indicators" />
            <Collapsible open={showTechnicals} onOpenChange={setShowTechnicals}>
              <Card className="border-border/40">
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Indicator Values</CardTitle>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                        {showTechnicals ? <><ChevronUp className="w-3.5 h-3.5" />Hide</> : <><ChevronDown className="w-3.5 h-3.5" />Show</>}
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="px-4 pb-4">
                    <TechnicalIndicatorsTable
                      ticker={ticker}
                      ltp={ltpData?.ltp ?? data?.fundamentals?.current_price ?? null}
                    />
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </motion.div>

          {/* Reverse DCF */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: 0.34 }}>
            <ReverseDCFCard
              ticker={ticker}
              currentPrice={ltpData?.ltp ?? data?.fundamentals?.current_price ?? null}
            />
          </motion.div>

          {/* Financial Statements */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: 0.38 }} className="space-y-3">
            <SectionDivider icon={FileText} title="Financial Statements" />
            <FinancialStatementsSection ticker={ticker} exchange={data.basic_info.exchange} financials={data.financials} />
          </motion.div>

          {/* Sentiment News */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: 0.42 }}>
            <SentimentNewsSection />
          </motion.div>
        </SentimentProvider>
      </div>
    </>
  );
}
