import { useParams, Redirect, Link } from "wouter";
import { useState } from "react";
import { useIndexDetail } from "@/hooks/use-index-detail";
import { useStockLTP } from "@/hooks/use-stock-ltp";
import { SEO } from "@/components/SEO";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertCircle, Home, ChevronRight, ChevronDown } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { motion } from "framer-motion";
import PriceChartSection from "@/components/stock-detail/PriceChartSection";
import TechnicalIndicatorsTable from "@/components/stock-detail/TechnicalIndicatorsTable";
import { formatFinancialValue } from "@/lib/theme-utils";
import { cn } from "@/lib/utils";
import { fadeInUp, easeOut } from "@/lib/motion";
import { Eyebrow } from "@/components/ui/eyebrow";

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3 border-r last:border-r-0 border-border">
      <div className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-sm font-bold tabular-nums text-foreground mt-0.5">
        {value}
      </div>
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
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-xl border border-border bg-card overflow-hidden"
    >
      <CollapsibleTrigger className="w-full flex items-center justify-between px-5 py-4 group hover:bg-muted/30 transition-colors">
        <span className="font-display text-base md:text-lg font-bold text-[hsl(var(--brand-navy))] dark:text-foreground">
          {title}
        </span>
        <ChevronDown
          className={cn(
            "w-5 h-5 text-muted-foreground transition-transform duration-base",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        <div className="border-t border-border p-5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function LoadingState() {
  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-6">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-12 w-1/2" />
      <Skeleton className="h-20 w-2/3" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}

function ErrorState({ error }: { error: Error }) {
  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-16">
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
  const symbol = rawSymbol ? decodeURIComponent(rawSymbol) : undefined;

  if (!symbol) return <Redirect to="/indices" />;

  const { data, isLoading, error } = useIndexDetail(symbol);
  const { data: ltpData } = useStockLTP(symbol);

  if (error && !isLoading) return <ErrorState error={error as Error} />;
  if (isLoading || !data) return <LoadingState />;

  const currentValue = ltpData?.ltp ?? data.price_data.current_value;
  const changePercent =
    ltpData?.percent_change ?? data.price_data.change_percent;
  const change =
    ltpData?.ltp && data.price_data.previous_close
      ? ltpData.ltp - data.price_data.previous_close
      : data.price_data.change;
  const isPositive = change != null && change >= 0;

  const indexName = data.basic_info.name;

  const fmt = (v: number | null | undefined) =>
    v != null
      ? v.toLocaleString("en-IN", { maximumFractionDigits: 2 })
      : null;

  const stats: { label: string; value: string }[] = [
    { label: "Open", value: fmt(data.price_data.open) ?? "—" },
    { label: "Day High", value: fmt(data.price_data.day_high) ?? "—" },
    { label: "Day Low", value: fmt(data.price_data.day_low) ?? "—" },
    { label: "Prev close", value: fmt(data.price_data.previous_close) ?? "—" },
    { label: "52W High", value: fmt(data.range_52w.high) ?? "—" },
    { label: "52W Low", value: fmt(data.range_52w.low) ?? "—" },
    {
      label: "Volume",
      value:
        data.price_data.volume != null
          ? formatFinancialValue(data.price_data.volume, { compact: true })
          : "—",
    },
  ].filter((s) => s.value !== "—");

  return (
    <>
      <SEO
        title={`${symbol} - ${indexName} | Equity Pro`}
        description={`Track ${indexName} (${symbol}) index performance. Current value: ${currentValue?.toLocaleString("en-IN")}, 52-week range, technical indicators, and interactive price charts.`}
        canonical={`/index/${encodeURIComponent(symbol)}`}
      />

      <div className="min-h-screen bg-background">
        {/* Page masthead — gradient + breadcrumb + ticker mark + display name + value */}
        <section className="border-b border-border bg-gradient-to-b from-card to-background">
          <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-5">
              <Link
                href="/"
                className="hover:text-foreground transition-colors flex items-center gap-1"
              >
                <Home className="w-3 h-3" /> Home
              </Link>
              <ChevronRight className="w-3 h-3 opacity-40" />
              <Link
                href="/indices"
                className="hover:text-foreground transition-colors"
              >
                Indices
              </Link>
              <ChevronRight className="w-3 h-3 opacity-40" />
              <span className="text-foreground font-medium">{symbol}</span>
            </nav>

            <motion.div
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              transition={easeOut}
              className="space-y-3"
            >
              <Eyebrow tone="gold" rule>
                Index · {data.basic_info.exchange}
              </Eyebrow>

              <div className="flex items-end gap-5 flex-wrap">
                {/* Ticker mark */}
                <div className="bg-[hsl(var(--brand-navy))] text-white px-4 py-2 rounded-md">
                  <span className="font-mono text-base md:text-lg font-bold tracking-wide">
                    {symbol}
                  </span>
                </div>
                <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
                  {indexName}
                </h1>
              </div>

              {/* Value + change */}
              <div className="pt-2 flex items-end gap-4 flex-wrap">
                <div className="font-mono text-5xl md:text-6xl font-bold tabular-nums leading-none text-foreground">
                  {(currentValue ?? 0).toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                {change != null && changePercent != null && (
                  <div
                    className={cn(
                      "font-mono text-lg md:text-xl font-bold tabular-nums leading-none pb-1",
                      isPositive ? "text-positive" : "text-negative",
                    )}
                  >
                    {isPositive ? "+" : ""}
                    {change.toFixed(2)} ({isPositive ? "+" : ""}
                    {changePercent.toFixed(2)}%)
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </section>

        {/* 7-cell stat strip */}
        {stats.length > 0 && (
          <section className="border-b border-border bg-card">
            <div className="max-w-6xl mx-auto overflow-x-auto">
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(${stats.length}, minmax(140px, 1fr))`,
                }}
              >
                {stats.map((s) => (
                  <StatCell key={s.label} label={s.label} value={s.value} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Accordion sections */}
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-3">
          <AccordionSection title="Price chart" defaultOpen>
            <PriceChartSection key={symbol} ticker={symbol} />
          </AccordionSection>

          <AccordionSection title="Technical indicators">
            <TechnicalIndicatorsTable
              ticker={symbol}
              ltp={ltpData?.ltp ?? null}
            />
          </AccordionSection>
        </div>
      </div>
    </>
  );
}
