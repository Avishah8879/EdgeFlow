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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { AlertCircle, TrendingUp, TrendingDown, ChevronUp, ChevronDown, Home } from "lucide-react";
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

// Helper to get suffix display config (label + colors)
function getSuffixConfig(suffix: string | null): { label: string; className: string } | null {
  if (!suffix || suffix === '-EQ') return null; // Skip regular equity
  const config: Record<string, { label: string; className: string }> = {
    '-SM': { label: 'SME', className: 'bg-blue-500/20 text-blue-400' },
    '-BE': { label: 'Trade-to-Trade', className: 'bg-amber-500/20 text-amber-400' },
    '-ST': { label: 'Surveillance', className: 'bg-orange-500/20 text-orange-400' },
    '-INDEX': { label: 'Index', className: 'bg-purple-500/20 text-purple-400' },
    '-NAV': { label: 'NAV', className: 'bg-teal-500/20 text-teal-400' },
  };
  return config[suffix] || null;
}

function StockHeader({ data, ltpData }: { data: any; ltpData?: any }) {
  // Use LTP data if available, otherwise fallback to fundamentals
  const currentPrice = ltpData?.ltp ?? data.fundamentals.current_price;
  const priceChangePercent = ltpData?.changePercent ?? data.fundamentals.price_change_percent;

  // Calculate price change from percent
  const priceChange = currentPrice && priceChangePercent !== null
    ? (currentPrice * priceChangePercent) / 100
    : data.fundamentals.price_change;

  const isPositive = priceChange && priceChange >= 0;

  return (
    <div className="space-y-4">
      {/* Breadcrumbs */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">
                <Home className="w-4 h-4" />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/stocks">Stocks</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{data.basic_info.symbol}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Stock Info & Price - Row layout on desktop, stacked on mobile */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        {/* Left: Stock Name & Meta */}
        <div className="flex-1">
          <h1 className="text-3xl font-semibold mb-2">
            {(() => {
              // Validate long_name - skip if it looks like corrupted data
              const longName = data.basic_info.long_name;
              const isValidLongName = longName &&
                !longName.includes(',') && // No commas (concatenated data)
                !longName.match(/^\w+\.\w{2},/) && // Not "SYMBOL.NS,..."
                longName !== data.basic_info.symbol; // Not same as symbol
              return isValidLongName ? longName : data.basic_info.name;
            })()}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{data.basic_info.symbol}</Badge>
            <span>•</span>
            <span>{data.basic_info.exchange}</span>
            {data.basic_info.sector && (
              <>
                <span>•</span>
                <Badge variant="secondary" className="text-xs">{data.basic_info.sector}</Badge>
              </>
            )}
            {(() => {
              const suffixConfig = getSuffixConfig(data.basic_info.suffix);
              return suffixConfig ? (
                <>
                  <span>•</span>
                  <Badge className={`text-xs ${suffixConfig.className}`}>
                    {suffixConfig.label}
                  </Badge>
                </>
              ) : null;
            })()}
          </div>
        </div>

        {/* Right: Price Display (stacked - price on top, change below) */}
        <div className="flex flex-col items-start lg:items-end">
          <div className="text-3xl sm:text-4xl font-semibold font-mono">
            ₹{currentPrice?.toFixed(2) || "N/A"}
          </div>
          {priceChange !== null && priceChangePercent !== null && (
            <div className={`flex items-center gap-1.5 text-base font-semibold ${getValueColorClass(priceChange)}`}>
              {isPositive ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span>
                {isPositive ? "+" : ""}
                {priceChange.toFixed(2)} ({isPositive ? "+" : ""}
                {priceChangePercent.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Horizontal Key Metrics Bar (Tickertape-inspired)
function KeyMetricsBar({ data }: { data: any }) {
  const metrics = [
    { label: "Market Cap", value: data.market_cap, display: formatFinancialValue(data.market_cap, { compact: true }) },
    { label: "P/E Ratio", value: data.trailing_pe, display: data.trailing_pe?.toFixed(2) },
    { label: "Volume", value: data.volume, display: formatFinancialValue(data.volume, { compact: true }) },
    { label: "52W High", value: data.fifty_two_week_high, display: data.fifty_two_week_high ? `₹${data.fifty_two_week_high.toFixed(2)}` : null },
    { label: "52W Low", value: data.fifty_two_week_low, display: data.fifty_two_week_low ? `₹${data.fifty_two_week_low.toFixed(2)}` : null },
    { label: "Dividend Yield", value: data.dividend_yield, display: data.dividend_yield ? `${data.dividend_yield.toFixed(2)}%` : null },
    { label: "Beta", value: data.beta, display: data.beta?.toFixed(2) },
  ];

  // Filter out metrics with null/undefined values
  const validMetrics = metrics.filter(m => m.value != null && m.display != null && m.display !== "—");

  return (
    <Card>
      <CardContent className="p-4">
        <div className="overflow-x-auto">
          <div className="flex gap-6 min-w-max">
            {validMetrics.map((metric, idx) => (
              <div key={idx} className="flex flex-col space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                  {metric.label}
                </span>
                <span className="text-sm font-semibold font-mono">
                  {metric.display}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Description Card - only renders when description exists
// Shows 3 lines by default, expands smoothly on hover
function DescriptionCard({ description }: { description: string | null }) {
  if (!description) return null;

  return (
    <Card className="description-card group">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Description</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="description-text-wrapper">
          <p className="text-sm text-muted-foreground leading-relaxed description-text">
            {description}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 space-y-8">
      {/* Breadcrumb skeleton */}
      <Skeleton className="h-4 w-48" />

      {/* Header skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-12 w-64" />
      </div>

      {/* Key Metrics Bar skeleton */}
      <Skeleton className="h-20 w-full" />

      {/* Chart section skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Skeleton className="lg:col-span-3 h-96" />
        <Skeleton className="lg:col-span-9 h-96" />
      </div>

      {/* Sentiment cards skeleton */}
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
        <AlertDescription>
          Failed to load stock details: {error.message}
        </AlertDescription>
      </Alert>
    </div>
  );
}

export default function StockDetail() {
  const { ticker: rawTicker } = useParams<{ ticker: string }>();
  // Decode URL-encoded characters (e.g., M%26M → M&M)
  const ticker = rawTicker ? decodeURIComponent(rawTicker) : undefined;
  const [showTechnicals, setShowTechnicals] = useState(false);

  // Redirect if no ticker provided
  if (!ticker) {
    return <Redirect to="/stocks" />;
  }

  // *** PERFORMANCE FIX: All API calls at top level in PARALLEL ***
  const { data, isLoading, error } = useStockDetail(ticker);
  const { data: ltpData } = useStockLTP(ticker); // Now parallel, not blocked by data loading

  // Show error state only for critical failures
  if (error && !isLoading) {
    return <ErrorState error={error as Error} />;
  }

  // Single loading state at page level
  if (isLoading || !data) {
    return <LoadingState />;
  }

  // Extract SEO data
  const companyName = data.basic_info.long_name || data.basic_info.name || ticker;
  const currentPrice = ltpData?.ltp ?? data.fundamentals.current_price;

  return (
    <>
      {/* Dynamic SEO for Stock Detail */}
      <SEO
        title={PAGE_SEO.stockDetail.title(ticker)}
        description={PAGE_SEO.stockDetail.description(companyName, ticker, currentPrice ?? undefined)}
        canonical={`/stocks/${ticker}`}
        jsonLd={[
          generateStockBreadcrumbSchema(ticker, companyName),
          generateFinancialProductSchema(ticker, companyName, `AI-powered stock analysis for ${companyName} including sentiment, technical indicators, and fundamentals.`),
        ]}
      />

      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 space-y-8">
        {/* Header with Breadcrumbs - Progressive rendering with animation */}
        <AnimatePresence mode="wait">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <StockHeader data={data} ltpData={ltpData} />
          </motion.div>
        </AnimatePresence>

        {/* Description Card - only renders if description exists */}
        {data.basic_info.description && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
          >
            <DescriptionCard description={data.basic_info.description} />
          </motion.div>
        )}

      {/* Horizontal Key Metrics Bar (Tickertape-inspired) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <KeyMetricsBar data={data.fundamentals} />
      </motion.div>

      {/* Section 1: Stock Scorecard + Generate Alpha (3 cols) + Price Chart (9 cols) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
      >
        {/* Left column: stretches to match chart height via grid */}
        <div className="lg:col-span-3 flex flex-col gap-4 min-h-[580px]">
          <StockScorecard ticker={ticker} />
          <ActionCardsWidget ticker={ticker} />
        </div>
        <div className="lg:col-span-9">
          <PriceChartSection key={ticker} ticker={ticker} />
        </div>
      </motion.div>

      {/* Section 2: Sentiment Gauge + Sentiment Metrics (2 columns, removed KeyMetricsCard since we have KeyMetricsBar) */}
      <SentimentProvider ticker={ticker}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          <SentimentGauge />
          <SentimentMetrics />
        </motion.div>

        {/* Section 3: Fundamentals + Full Analyst Recommendation (2 columns) */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.4 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        >
          <FundamentalsTable data={data.fundamentals} />
          <AnalystRecommendationCard data={data} ticker={ticker} />
        </motion.div>

        {/* Section 3.5: Shareholding Pattern */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.45 }}
        >
          <ShareholdingPattern ticker={ticker} />
        </motion.div>

        {/* Section 4: Technical Indicators - Using Collapsible (data loads immediately, no click delay) */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.5 }}
        >
          <Collapsible open={showTechnicals} onOpenChange={setShowTechnicals}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Technical Indicators</CardTitle>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm">
                      {showTechnicals ? (
                        <>
                          <ChevronUp className="w-4 h-4 mr-2" />
                          Hide
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4 mr-2" />
                          Show
                        </>
                      )}
                    </Button>
                  </CollapsibleTrigger>
                </div>
              </CardHeader>
              <CollapsibleContent>
                <CardContent>
                  {/* Data loads immediately when component mounts, not when user clicks */}
                  <TechnicalIndicatorsTable
                    ticker={ticker}
                    ltp={ltpData?.ltp ?? data?.fundamentals?.current_price ?? null}
                  />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </motion.div>

        {/* Section 3.6: Reverse DCF Valuation */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.55 }}
        >
          <ReverseDCFCard
            ticker={ticker}
            currentPrice={ltpData?.ltp ?? data?.fundamentals?.current_price ?? null}
          />
        </motion.div>

        {/* Section 4: Financial Statements (Tabbed) */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.65 }}
        >
          <FinancialStatementsSection ticker={ticker} exchange={data.basic_info.exchange} financials={data.financials} />
        </motion.div>

        {/* Section 5: Sentiment News Feed - loads independently */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.75 }}
        >
          <SentimentNewsSection />
        </motion.div>
      </SentimentProvider>
      </div>
    </>
  );
}
