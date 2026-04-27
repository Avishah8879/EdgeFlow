import { useParams, Redirect, Link } from "wouter";
import { useState } from "react";
import { useStockDetail } from "@/hooks/use-stock-detail";
import { useStockLTP } from "@/hooks/use-stock-ltp";
import { SEO } from "@/components/SEO";
import { PAGE_SEO } from "@/lib/seo-config";
import { generateStockBreadcrumbSchema, generateFinancialProductSchema } from "@/lib/json-ld";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertCircle, Home, ChevronRight, ChevronDown, Bookmark, Brain, GitCompare, Zap } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { motion } from "framer-motion";
import { HeroNumber } from "@/components/HeroNumber";
import StockScorecard from "@/components/stock-detail/StockScorecard";
import AnalystRecommendationCard from "@/components/stock-detail/AnalystRecommendationCard";
import PriceChartSection from "@/components/stock-detail/PriceChartSection";
import SentimentGauge from "@/components/stock-detail/SentimentGauge";
import SentimentMetrics from "@/components/stock-detail/SentimentMetrics";
import FundamentalsTable from "@/components/stock-detail/FundamentalsTable";
import ShareholdingPattern from "@/components/stock-detail/ShareholdingPattern";
import TechnicalIndicatorsTable from "@/components/stock-detail/TechnicalIndicatorsTable";
import ReverseDCFCard from "@/components/stock-detail/ReverseDCFCard";
import FinancialStatementsSection from "@/components/stock-detail/FinancialStatementsSection";
import SentimentNewsSection from "@/components/stock-detail/SentimentNewsSection";
import { SentimentProvider } from "@/contexts/SentimentContext";
import { formatFinancialValue } from "@/lib/theme-utils";
import { cn } from "@/lib/utils";
import { fadeInUp, easeOut } from "@/lib/motion";

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

function AccordionSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b border-border/50">
      <CollapsibleTrigger className="w-full flex items-center justify-between py-5 group" data-testid={`accordion-${title.toLowerCase().replace(/\s+/g, "-")}`}>
        <span className="text-base md:text-lg font-medium text-foreground group-hover:text-primary transition-colors">
          {title}
        </span>
        <ChevronDown
          className={cn(
            "w-5 h-5 text-muted-foreground transition-transform duration-300",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        <div className="pb-8 pt-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 shrink-0 snap-start min-w-[120px] rounded-2xl border border-border/50 bg-card px-4 py-3">
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">{label}</span>
      <span className="text-sm font-mono font-semibold text-foreground">{value}</span>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-12 space-y-8">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-24 w-2/3 rounded-xl" />
      <Skeleton className="h-12 w-full rounded-full" />
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-96 w-full rounded-2xl" />
    </div>
  );
}

function ErrorState({ error }: { error: Error }) {
  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-16">
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

  if (error && !isLoading) return <ErrorState error={error as Error} />;
  if (isLoading || !data) return <LoadingState />;

  const fundamentals = data.fundamentals;
  const basic = data.basic_info;

  const currentPrice = ltpData?.ltp ?? fundamentals.current_price;
  const priceChangePercent = ltpData?.percent_change ?? fundamentals.price_change_percent;
  const priceChange = currentPrice && priceChangePercent != null
    ? (currentPrice * priceChangePercent) / 100
    : fundamentals.price_change;
  const isPositive = priceChange != null && priceChange >= 0;

  const companyName = (() => {
    const longName = basic.long_name;
    const isValid = longName && !longName.includes(",") && !longName.match(/^\w+\.\w{2},/) && longName !== basic.symbol;
    return isValid ? longName : basic.name;
  })();

  const suffixConfig = getSuffixConfig(basic.suffix);

  const keyMetrics = [
    { label: "Mkt Cap", value: formatFinancialValue(fundamentals.market_cap, { compact: true }) },
    { label: "P/E", value: fundamentals.trailing_pe?.toFixed(2) ?? "—" },
    { label: "Volume", value: formatFinancialValue(fundamentals.volume, { compact: true }) },
    { label: "52W High", value: fundamentals.fifty_two_week_high ? `₹${fundamentals.fifty_two_week_high.toFixed(2)}` : "—" },
    { label: "52W Low", value: fundamentals.fifty_two_week_low ? `₹${fundamentals.fifty_two_week_low.toFixed(2)}` : "—" },
    { label: "Div Yield", value: fundamentals.dividend_yield ? `${fundamentals.dividend_yield.toFixed(2)}%` : "—" },
  ].filter((m) => m.value !== "—");

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

      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-12 space-y-12">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors flex items-center gap-1">
              <Home className="w-3 h-3" /> Home
            </Link>
            <ChevronRight className="w-3 h-3 opacity-40" />
            <Link href="/stocks" className="hover:text-foreground transition-colors">Stocks</Link>
            <ChevronRight className="w-3 h-3 opacity-40" />
            <span className="text-foreground font-medium">{basic.symbol}</span>
          </nav>

          {/* HERO */}
          <motion.section
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            transition={easeOut}
            className="space-y-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary">
                {basic.symbol}
              </span>
              <span className="text-xs text-muted-foreground">{basic.exchange}</span>
              {basic.sector && <Badge variant="secondary" className="text-[11px] h-5 rounded-full">{basic.sector}</Badge>}
              {suffixConfig && <Badge variant={suffixConfig.variant} className="text-[11px] h-5 rounded-full">{suffixConfig.label}</Badge>}
            </div>
            <h1 className="text-xl md:text-2xl font-medium text-muted-foreground">{companyName}</h1>
            <div className="leading-none">
              <HeroNumber
                value={currentPrice ?? 0}
                decimals={2}
                prefix="₹"
                className="text-6xl md:text-8xl text-foreground"
              />
            </div>
            {priceChange != null && priceChangePercent != null && (
              <div className={cn(
                "text-xl md:text-2xl font-medium tabular-nums",
                isPositive ? "text-positive" : "text-negative",
              )}>
                {isPositive ? "+" : ""}{priceChange.toFixed(2)} ({isPositive ? "+" : ""}{priceChangePercent.toFixed(2)}%)
              </div>
            )}
          </motion.section>

          {/* STICKY ACTION BAR */}
          <div className="sticky top-16 z-20 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 py-3 bg-background/85 backdrop-blur-md border-y border-border/50">
            <div className="flex gap-2">
              <Button variant="default" size="sm" className="flex-1 rounded-full gap-1.5">
                <Bookmark className="w-3.5 h-3.5" /> Watchlist
              </Button>
              <Button asChild variant="outline" size="sm" className="flex-1 rounded-full gap-1.5">
                <Link href={`/tip-tease?context=${encodeURIComponent(ticker)}`}>
                  <Brain className="w-3.5 h-3.5" /> Ask Equity Pro
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="flex-1 rounded-full gap-1.5 hidden sm:inline-flex">
                <Link href={`/compare?symbols=${ticker}`}>
                  <GitCompare className="w-3.5 h-3.5" /> Compare
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="flex-1 rounded-full gap-1.5 hidden md:inline-flex">
                <Link href={`/alpha-generation?ticker=${ticker}`}>
                  <Zap className="w-3.5 h-3.5" /> Alpha
                </Link>
              </Button>
            </div>
          </div>

          {/* KEY METRICS — horizontal scroll rail */}
          {keyMetrics.length > 0 && (
            <section>
              <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 md:mx-0 md:px-0">
                {keyMetrics.map((m) => (
                  <MetricPill key={m.label} label={m.label} value={m.value} />
                ))}
              </div>
            </section>
          )}

          {/* Accordion sections */}
          <div>
            <AccordionSection title="Chart" defaultOpen>
              <PriceChartSection key={ticker} ticker={ticker} />
            </AccordionSection>

            <AccordionSection title="Scorecard">
              <StockScorecard ticker={ticker} />
            </AccordionSection>

            <SentimentProvider ticker={ticker}>
              <AccordionSection title="AI Sentiment">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <SentimentGauge />
                  <SentimentMetrics />
                </div>
              </AccordionSection>

              <AccordionSection title="Fundamentals">
                <FundamentalsTable data={fundamentals} />
              </AccordionSection>

              <AccordionSection title="Analyst Coverage">
                <AnalystRecommendationCard data={data} ticker={ticker} />
              </AccordionSection>

              <AccordionSection title="Shareholding">
                <ShareholdingPattern ticker={ticker} />
              </AccordionSection>

              <AccordionSection title="Technical Indicators">
                <TechnicalIndicatorsTable
                  ticker={ticker}
                  ltp={ltpData?.ltp ?? fundamentals.current_price ?? null}
                />
              </AccordionSection>

              <AccordionSection title="Reverse DCF">
                <ReverseDCFCard
                  ticker={ticker}
                  currentPrice={ltpData?.ltp ?? fundamentals.current_price ?? null}
                />
              </AccordionSection>

              <AccordionSection title="Financial Statements">
                <FinancialStatementsSection ticker={ticker} exchange={basic.exchange} financials={data.financials} />
              </AccordionSection>

              <AccordionSection title="News">
                <SentimentNewsSection />
              </AccordionSection>
            </SentimentProvider>
          </div>

          {/* About */}
          {basic.description && (
            <section>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-3">About</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{basic.description}</p>
            </section>
          )}

        </div>
      </div>
    </>
  );
}
