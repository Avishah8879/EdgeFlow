import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { useStocks } from "@/hooks/use-stocks";
import { useBulkLTP } from "@/hooks/use-bulk-ltp";
import type { CapType } from "@/lib/types";
import { useSmartLoader } from "@/hooks/use-smart-loader";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { SEO } from "@/components/SEO";
import { PAGE_SEO } from "@/lib/seo-config";
import { cn } from "@/lib/utils";
import { fadeInUp, easeOut } from "@/lib/motion";

const CAP_TABS: { id: CapType | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "large", label: "Large Cap" },
  { id: "mid", label: "Mid Cap" },
  { id: "small", label: "Small Cap" },
];

function tickerInitials(symbol: string) {
  const cleaned = symbol.replace(/[^A-Z0-9]/gi, "");
  return cleaned.slice(0, 2).toUpperCase();
}

function StockListItem({
  symbol,
  name,
  longName,
  price,
  changePercent,
  sector,
  onClick,
}: {
  symbol: string;
  name: string;
  longName: string | null;
  price: number | null;
  changePercent: number | null;
  sector: string | null;
  onClick: () => void;
}) {
  const isPositive = changePercent != null && changePercent >= 0;
  const display = longName || name || symbol;
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-4 md:px-5 py-4 rounded-2xl bg-card border border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-colors text-left group"
      data-testid={`row-stock-${symbol}`}
    >
      {/* Avatar */}
      <div className="shrink-0 w-11 h-11 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-mono text-xs font-semibold text-primary">
        {tickerInitials(symbol)}
      </div>

      {/* Symbol + name */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-semibold text-foreground">{symbol}</span>
          {sector && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 rounded-full">
              {sector}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{display}</p>
      </div>

      {/* Price + change */}
      <div className="shrink-0 text-right">
        <div className="font-mono text-sm font-semibold text-foreground tabular-nums">
          {price != null ? `₹${price.toFixed(2)}` : "—"}
        </div>
        {changePercent != null && (
          <div
            className={cn(
              "text-xs font-medium tabular-nums",
              isPositive ? "text-positive" : "text-negative",
            )}
          >
            {isPositive ? "+" : ""}{changePercent.toFixed(2)}%
          </div>
        )}
      </div>
    </button>
  );
}

export default function Stocks() {
  const [, navigate] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCapType, setActiveCapType] = useState<CapType | "all">("large");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeCapType, searchTerm]);

  const { data, isLoading, error } = useStocks({
    capType: activeCapType as CapType,
    searchTerm,
    page: currentPage,
    limit: 30,
  });

  const symbols = useMemo(() => data?.data.map((s) => s.symbol) ?? [], [data]);
  const { data: ltpData } = useBulkLTP(symbols.length > 0 ? symbols : undefined);

  const stocksWithLTP = useMemo(() => {
    if (!data?.data) return [];
    return data.data.map((stock) => {
      const ltp = ltpData?.[stock.symbol];
      return {
        ...stock,
        current_price: ltp?.ltp ?? stock.current_price,
        price_change_percent: ltp?.percent_change ?? stock.price_change_percent,
      };
    });
  }, [data, ltpData]);

  const totalPages = data?.meta?.total ? Math.ceil(data.meta.total / 30) : 0;
  const { showSkeleton } = useSmartLoader(isLoading);

  return (
    <>
      <SEO
        title={PAGE_SEO.stocks.title}
        description={PAGE_SEO.stocks.description}
        canonical="/stocks"
      />

      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-12 space-y-8">

          {/* Hero label + heading */}
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            transition={easeOut}
            className="space-y-2"
          >
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium">Stocks</p>
            <h1 className="text-3xl md:text-5xl font-serif italic font-light tracking-tight text-foreground">
              Browse the market
            </h1>
            <p className="text-sm text-muted-foreground max-w-md">
              {data?.meta?.total ? `${data.meta.total.toLocaleString("en-IN")} stocks` : "Explore Indian equities"} with real-time prices, fundamentals, and AI insights.
            </p>
          </motion.div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Search by symbol or company name…"
              className="pl-11 h-12 rounded-full bg-card border-border/50 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="input-search-stocks"
            />
          </div>

          {/* Cap-type pill chips */}
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-1">
            {CAP_TABS.map((tab) => {
              const active = activeCapType === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveCapType(tab.id)}
                  className={cn(
                    "shrink-0 px-4 py-1.5 rounded-full text-xs font-medium transition-colors border",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border/50 hover:border-primary/40 hover:text-foreground",
                  )}
                  data-testid={`tab-cap-${tab.id}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* List */}
          <div className="space-y-2">
            {showSkeleton ? (
              [...Array(8)].map((_, i) => <Skeleton key={i} className="h-[76px] w-full rounded-2xl" />)
            ) : error ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-12 text-center">
                <p className="text-destructive font-medium mb-1">Failed to load stocks</p>
                <p className="text-sm text-destructive/70">{error.message}</p>
              </div>
            ) : data && data.data.length === 0 ? (
              <div className="rounded-2xl border border-border/50 bg-card px-4 py-12 text-center">
                <p className="text-muted-foreground font-medium mb-1">No stocks found</p>
                <p className="text-sm text-muted-foreground">
                  {searchTerm ? "Try a different search term." : "No stocks in this category."}
                </p>
              </div>
            ) : (
              stocksWithLTP.map((stock) => (
                <StockListItem
                  key={stock.id}
                  symbol={stock.symbol}
                  name={stock.name}
                  longName={stock.long_name}
                  price={stock.current_price}
                  changePercent={stock.price_change_percent}
                  sector={stock.sector}
                  onClick={() => navigate(`/stocks/${stock.symbol}`)}
                />
              ))
            )}
          </div>

          {/* Pagination */}
          {!isLoading && !error && data && data.data.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded-full"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-full"
                >
                  Next
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
