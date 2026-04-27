import { useParams, Redirect, Link } from "wouter";
import { useState } from "react";
import { useIndexDetail } from "@/hooks/use-index-detail";
import { useStockLTP } from "@/hooks/use-stock-ltp";
import { SEO } from "@/components/SEO";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertCircle, Home, ChevronRight, ChevronDown } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { motion } from "framer-motion";
import { HeroNumber } from "@/components/HeroNumber";
import PriceChartSection from "@/components/stock-detail/PriceChartSection";
import TechnicalIndicatorsTable from "@/components/stock-detail/TechnicalIndicatorsTable";
import { formatFinancialValue } from "@/lib/theme-utils";
import { cn } from "@/lib/utils";
import { fadeInUp, easeOut } from "@/lib/motion";

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 shrink-0 snap-start min-w-[120px] rounded-2xl border border-border/50 bg-card px-4 py-3">
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">{label}</span>
      <span className="text-sm font-mono font-semibold text-foreground">{value}</span>
    </div>
  );
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
      <CollapsibleTrigger className="w-full flex items-center justify-between py-5 group">
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

function LoadingState() {
  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-12 space-y-8">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-24 w-2/3 rounded-xl" />
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
        <AlertDescription>Failed to load index details: {error.message}</AlertDescription>
      </Alert>
    </div>
  );
}

export default function IndexDetail() {
  const { symbol: rawSymbol } = useParams<{ symbol: string }>();
  const symbol = rawSymbol ? decodeURIComponent(rawSymbol) : undefined;

  if (!symbol) return <Redirect to="/indices" />;

  const { data, isLoading, error } = useIndexDetail(symbol);
  const { data: ltpData } = useStockLTP(symbol);

  if (error && !isLoading) return <ErrorState error={error as Error} />;
  if (isLoading || !data) return <LoadingState />;

  const currentValue = ltpData?.ltp ?? data.price_data.current_value;
  const changePercent = ltpData?.percent_change ?? data.price_data.change_percent;
  const change = ltpData?.ltp && data.price_data.previous_close
    ? ltpData.ltp - data.price_data.previous_close
    : data.price_data.change;
  const isPositive = change != null && change >= 0;

  const indexName = data.basic_info.name;

  const keyMetrics = [
    { label: "Open", value: data.price_data.open?.toLocaleString("en-IN", { maximumFractionDigits: 2 }) },
    { label: "Day High", value: data.price_data.day_high?.toLocaleString("en-IN", { maximumFractionDigits: 2 }) },
    { label: "Day Low", value: data.price_data.day_low?.toLocaleString("en-IN", { maximumFractionDigits: 2 }) },
    { label: "Prev Close", value: data.price_data.previous_close?.toLocaleString("en-IN", { maximumFractionDigits: 2 }) },
    { label: "52W High", value: data.range_52w.high?.toLocaleString("en-IN", { maximumFractionDigits: 2 }) },
    { label: "52W Low", value: data.range_52w.low?.toLocaleString("en-IN", { maximumFractionDigits: 2 }) },
    { label: "Volume", value: data.price_data.volume != null ? formatFinancialValue(data.price_data.volume, { compact: true }) : null },
  ].filter((m): m is { label: string; value: string } => m.value != null && m.value !== "—");

  return (
    <>
      <SEO
        title={`${symbol} - ${indexName} | Equity Pro`}
        description={`Track ${indexName} (${symbol}) index performance. Current value: ${currentValue?.toLocaleString("en-IN")}, 52-week range, technical indicators, and interactive price charts.`}
        canonical={`/index/${encodeURIComponent(symbol)}`}
      />

      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-12 space-y-12">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors flex items-center gap-1">
              <Home className="w-3 h-3" /> Home
            </Link>
            <ChevronRight className="w-3 h-3 opacity-40" />
            <Link href="/indices" className="hover:text-foreground transition-colors">Indices</Link>
            <ChevronRight className="w-3 h-3 opacity-40" />
            <span className="text-foreground font-medium">{symbol}</span>
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
                {symbol}
              </span>
              <span className="text-xs text-muted-foreground">{data.basic_info.exchange}</span>
              <Badge variant="secondary" className="text-[11px] h-5 rounded-full">Index</Badge>
            </div>
            <h1 className="text-xl md:text-2xl font-medium text-muted-foreground">{indexName}</h1>
            <div className="leading-none">
              <HeroNumber
                value={currentValue ?? 0}
                decimals={2}
                className="text-6xl md:text-8xl text-foreground"
              />
            </div>
            {change != null && changePercent != null && (
              <div className={cn(
                "text-xl md:text-2xl font-medium tabular-nums",
                isPositive ? "text-positive" : "text-negative",
              )}>
                {isPositive ? "+" : ""}{change.toFixed(2)} ({isPositive ? "+" : ""}{changePercent.toFixed(2)}%)
              </div>
            )}
          </motion.section>

          {/* KEY METRICS — horizontal scroll rail */}
          {keyMetrics.length > 0 && (
            <section>
              <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 md:mx-0 md:px-0">
                {keyMetrics.map((m) => <MetricPill key={m.label} label={m.label} value={m.value} />)}
              </div>
            </section>
          )}

          {/* Accordion sections */}
          <div>
            <AccordionSection title="Chart" defaultOpen>
              <PriceChartSection key={symbol} ticker={symbol} />
            </AccordionSection>

            <AccordionSection title="Technical Indicators">
              <TechnicalIndicatorsTable ticker={symbol} ltp={ltpData?.ltp ?? null} />
            </AccordionSection>
          </div>

        </div>
      </div>
    </>
  );
}
