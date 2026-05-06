import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Eyebrow } from "@/components/ui/eyebrow";
import { ChipFilter } from "@/components/ui/chip-filter";

const CAP_TABS: { id: CapType | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "large", label: "Large cap" },
  { id: "mid", label: "Mid cap" },
  { id: "small", label: "Small cap" },
];

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
        {/* Page masthead */}
        <section className="border-b border-border bg-card">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-10">
            <motion.div
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              transition={easeOut}
              className="space-y-2"
            >
              <Eyebrow tone="gold" rule>
                Universe
              </Eyebrow>
              <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
                Stocks
              </h1>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Browse{" "}
                {data?.meta?.total
                  ? `${data.meta.total.toLocaleString("en-IN")} NSE listings`
                  : "Indian equities"}{" "}
                with live prices, technicals, and fundamentals.
              </p>
            </motion.div>
          </div>
        </section>

        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-10 space-y-6">
          {/* Search + filters toolbar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                type="search"
                placeholder="Search by symbol or company name…"
                className="pl-10 h-10 rounded-full bg-card text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search-stocks"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-1">
              {CAP_TABS.map((tab) => (
                <ChipFilter
                  key={tab.id}
                  active={activeCapType === tab.id}
                  onClick={() => setActiveCapType(tab.id)}
                  data-testid={`tab-cap-${tab.id}`}
                >
                  {tab.label}
                </ChipFilter>
              ))}
            </div>
          </div>

          {/* Result count strip */}
          {data?.meta?.total != null && (
            <div className="flex items-center justify-between text-sm">
              <p className="text-muted-foreground">
                <span className="font-mono font-bold tabular-nums text-[hsl(var(--brand-gold))]">
                  {data.meta.total.toLocaleString("en-IN")}
                </span>{" "}
                stocks · sorted by market cap
              </p>
              {totalPages > 1 && (
                <p className="text-xs text-muted-foreground font-mono tabular-nums">
                  Page {currentPage} / {totalPages}
                </p>
              )}
            </div>
          )}

          {/* Table */}
          {showSkeleton ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-[60px] w-full rounded-md" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-12 text-center">
              <p className="text-destructive font-medium mb-1">Failed to load stocks</p>
              <p className="text-sm text-destructive/70">{error.message}</p>
            </div>
          ) : data && data.data.length === 0 ? (
            <div className="rounded-xl border border-border bg-card px-4 py-12 text-center">
              <p className="text-muted-foreground font-medium mb-1">No stocks found</p>
              <p className="text-sm text-muted-foreground">
                {searchTerm
                  ? "Try a different search term."
                  : "No stocks in this category."}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="bg-muted/40 text-[10.5px] uppercase tracking-uppercase font-bold text-muted-foreground">
                      <th className="text-left py-3 px-4 border-b border-border">Symbol</th>
                      <th className="text-left py-3 px-4 border-b border-border">Sector</th>
                      <th className="text-left py-3 px-4 border-b border-border">Company</th>
                      <th className="text-right py-3 px-4 border-b border-border">Price</th>
                      <th className="text-right py-3 px-4 border-b border-border">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stocksWithLTP.map((stock) => {
                      const isPositive =
                        stock.price_change_percent != null &&
                        stock.price_change_percent >= 0;
                      const display = stock.long_name || stock.name || stock.symbol;
                      return (
                        <tr
                          key={stock.id}
                          className="border-t border-border/60 hover:bg-muted/30 cursor-pointer transition-colors duration-fast"
                          onClick={() => navigate(`/stocks/${stock.symbol}`)}
                          data-testid={`row-stock-${stock.symbol}`}
                        >
                          <td className="py-3 px-4">
                            <span className="font-mono font-bold text-foreground">
                              {stock.symbol}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-muted-foreground text-[11.5px]">
                              {stock.sector || "—"}
                            </span>
                          </td>
                          <td className="py-3 px-4 max-w-[280px]">
                            <p className="truncate text-foreground">{display}</p>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-foreground">
                            {stock.current_price != null
                              ? `₹${stock.current_price.toFixed(2)}`
                              : "—"}
                          </td>
                          <td
                            className={cn(
                              "py-3 px-4 text-right font-mono tabular-nums font-bold",
                              stock.price_change_percent == null
                                ? "text-muted-foreground"
                                : isPositive
                                  ? "text-positive"
                                  : "text-negative",
                            )}
                          >
                            {stock.price_change_percent != null
                              ? `${isPositive ? "+" : ""}${stock.price_change_percent.toFixed(2)}%`
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination */}
          {!isLoading && !error && data && data.data.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-end pt-2 gap-2">
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
          )}
        </div>
      </div>
    </>
  );
}
