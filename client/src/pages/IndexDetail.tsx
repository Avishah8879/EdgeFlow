import { useParams, Redirect, Link } from "wouter";
import { useState } from "react";
import { useIndexDetail, IndexDetailData } from "@/hooks/use-index-detail";
import { useStockLTP } from "@/hooks/use-stock-ltp";
import { SEO } from "@/components/SEO";
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
import { AlertCircle, TrendingUp, TrendingDown, ChevronUp, ChevronDown, Home, BarChart3 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AnimatePresence, motion } from "framer-motion";
import PriceChartSection from "@/components/stock-detail/PriceChartSection";
import TechnicalIndicatorsTable from "@/components/stock-detail/TechnicalIndicatorsTable";
import ActionCardsWidget from "@/components/stock-detail/ActionCardsWidget";
import { getValueColorClass, formatFinancialValue } from "@/lib/theme-utils";

// Index Header with breadcrumbs and price display
function IndexHeader({ data, ltpData }: { data: IndexDetailData; ltpData?: any }) {
  // Use LTP data if available, otherwise fallback to API data
  const currentValue = ltpData?.ltp ?? data.price_data.current_value;
  const changePercent = ltpData?.changePercent ?? data.price_data.change_percent;
  const change = ltpData?.ltp && data.price_data.previous_close
    ? ltpData.ltp - data.price_data.previous_close
    : data.price_data.change;

  const isPositive = change >= 0;

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
              <Link href="/indices">Indices</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{data.basic_info.symbol}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Index Info & Value - Row layout on desktop, stacked on mobile */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        {/* Left: Index Name & Meta */}
        <div className="flex-1">
          <h1 className="text-3xl font-semibold mb-2">
            {data.basic_info.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{data.basic_info.symbol}</Badge>
            <span>•</span>
            <span>{data.basic_info.exchange}</span>
            <span>•</span>
            <Badge className="text-xs bg-purple-500/20 text-purple-400">
              <BarChart3 className="w-3 h-3 mr-1" />
              Index
            </Badge>
          </div>
        </div>

        {/* Right: Value Display (stacked - value on top, change below) */}
        <div className="flex flex-col items-start lg:items-end">
          <div className="text-3xl sm:text-4xl font-semibold font-mono">
            {currentValue?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || "N/A"}
          </div>
          {change !== null && changePercent !== null && (
            <div className={`flex items-center gap-1.5 text-base font-semibold ${getValueColorClass(change)}`}>
              {isPositive ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span>
                {isPositive ? "+" : ""}
                {change.toFixed(2)} ({isPositive ? "+" : ""}
                {changePercent.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Horizontal Key Metrics Bar for Index (day range, 52W range, volume)
function IndexKeyMetricsBar({ data }: { data: IndexDetailData }) {
  const metrics = [
    { label: "Open", value: data.price_data.open, display: data.price_data.open?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) },
    { label: "Day High", value: data.price_data.day_high, display: data.price_data.day_high?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) },
    { label: "Day Low", value: data.price_data.day_low, display: data.price_data.day_low?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) },
    { label: "Prev Close", value: data.price_data.previous_close, display: data.price_data.previous_close?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) },
    { label: "52W High", value: data.range_52w.high, display: data.range_52w.high?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) },
    { label: "52W Low", value: data.range_52w.low, display: data.range_52w.low?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) },
    { label: "Volume", value: data.price_data.volume, display: formatFinancialValue(data.price_data.volume, { compact: true }) },
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
      <Skeleton className="h-[500px] w-full" />

      {/* Technical indicators skeleton */}
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function ErrorState({ error }: { error: Error }) {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-16">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load index details: {error.message}
        </AlertDescription>
      </Alert>
    </div>
  );
}

export default function IndexDetail() {
  const { symbol: rawSymbol } = useParams<{ symbol: string }>();
  // Decode URL-encoded characters
  const symbol = rawSymbol ? decodeURIComponent(rawSymbol) : undefined;
  const [showTechnicals, setShowTechnicals] = useState(false);

  // Redirect if no symbol provided
  if (!symbol) {
    return <Redirect to="/indices" />;
  }

  // API calls in parallel
  const { data, isLoading, error } = useIndexDetail(symbol);
  const { data: ltpData } = useStockLTP(symbol); // Works for indices too

  // Show error state only for critical failures
  if (error && !isLoading) {
    return <ErrorState error={error as Error} />;
  }

  // Single loading state at page level
  if (isLoading || !data) {
    return <LoadingState />;
  }

  // Extract SEO data
  const indexName = data.basic_info.name;
  const currentValue = ltpData?.ltp ?? data.price_data.current_value;

  return (
    <>
      {/* Dynamic SEO for Index Detail */}
      <SEO
        title={`${symbol} - ${indexName} | Equity Pro`}
        description={`Track ${indexName} (${symbol}) index performance. Current value: ${currentValue?.toLocaleString('en-IN')}, 52-week range, technical indicators, and interactive price charts.`}
        canonical={`/index/${encodeURIComponent(symbol)}`}
      />

      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 space-y-8">
        {/* Header with Breadcrumbs - Progressive rendering with animation */}
        <AnimatePresence mode="wait">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <IndexHeader data={data} ltpData={ltpData} />
          </motion.div>
        </AnimatePresence>

        {/* Horizontal Key Metrics Bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <IndexKeyMetricsBar data={data} />
        </motion.div>

        {/* Action Cards + Price Chart - Grid layout */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
        >
          {/* Left column: Action Cards */}
          <div className="lg:col-span-3 flex flex-col gap-4 min-h-[500px]">
            <ActionCardsWidget ticker={symbol} />
          </div>
          {/* Right column: Price Chart */}
          <div className="lg:col-span-9">
            <PriceChartSection key={symbol} ticker={symbol} />
          </div>
        </motion.div>

        {/* Technical Indicators - Collapsible */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.3 }}
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
                <CardContent className="pt-0">
                  <TechnicalIndicatorsTable ticker={symbol} ltp={ltpData?.ltp ?? null} />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </motion.div>
      </div>
    </>
  );
}
