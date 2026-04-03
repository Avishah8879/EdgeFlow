import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import TabsSection from "@/components/TabsSection";
import { DataTable } from "@/components/ui/data-table";
import { useStocks } from "@/hooks/use-stocks";
import { useBulkLTP } from "@/hooks/use-bulk-ltp";
import type { CapType } from "@/lib/types";
import { useSmartLoader } from "@/hooks/use-smart-loader";
import { AnimatePresence, motion } from "framer-motion";
import { formatFinancialValue, getValueColorClass } from "@/lib/theme-utils";
import { Skeleton } from "@/components/ui/skeleton";
import { SEO } from "@/components/SEO";
import { PAGE_SEO } from "@/lib/seo-config";

interface StockRow {
  id: number;
  symbol: string;
  name: string;
  long_name: string | null;
  current_price: number | null;
  price_change: number | null;
  price_change_percent: number | null;
  market_cap: number | null;
  trailing_pe: number | null;
  forward_pe: number | null;
  price_to_book: number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
}

export default function Stocks() {
  const [, navigate] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCapType, setActiveCapType] = useState<CapType>("large");
  const [currentPage, setCurrentPage] = useState(1);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const capTabs = [
    { id: 'all', label: 'All Stocks' },
    { id: 'large', label: 'Large Cap' },
    { id: 'mid', label: 'Mid Cap' },
    { id: 'small', label: 'Small Cap' },
  ];

  // Reset page to 1 when filters or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeCapType, searchTerm]);

  // Fetch stocks with current filters
  const { data, isLoading, error } = useStocks({
    capType: activeCapType,
    searchTerm,
    page: currentPage,
    limit: 30,
  });

  // Extract symbols for bulk LTP fetch
  const symbols = useMemo(() => {
    return data?.data.map(stock => stock.symbol) ?? [];
  }, [data]);

  // Fetch bulk LTP data for all stocks on current page
  const { data: ltpData } = useBulkLTP(symbols.length > 0 ? symbols : undefined);

  // Merge LTP data with fundamentals
  const stocksWithLTP = useMemo(() => {
    if (!data?.data) return [];

    return data.data.map(stock => {
      const ltp = ltpData?.[stock.symbol];
      return {
        ...stock,
        // Override with LTP data if available
        current_price: ltp?.ltp ?? stock.current_price,
        price_change_percent: ltp?.percent_change ?? stock.price_change_percent,
        price_change: ltp?.ltp && ltp?.percent_change !== null
          ? (ltp.ltp * ltp.percent_change) / 100
          : stock.price_change,
      };
    });
  }, [data, ltpData]);

  // Column definitions
  const columns: ColumnDef<StockRow>[] = useMemo(() => [
    {
      accessorKey: "symbol",
      header: "Symbol",
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <div className="font-semibold font-mono">{row.original.symbol}</div>
          {/* Show truncated company name on mobile only */}
          {isMobile && (
            <div className="text-xs text-muted-foreground truncate max-w-[120px]">
              {row.original.long_name || row.original.name || "-"}
            </div>
          )}
        </div>
      ),
    },
    ...(!isMobile ? [{
      accessorKey: "long_name",
      header: "Company Name",
      cell: ({ row }: { row: any }) => (
        <div className="text-sm text-muted-foreground truncate max-w-[200px]">
          {row.original.long_name || row.original.name || "-"}
        </div>
      ),
    }] : []),
    {
      accessorKey: "current_price",
      header: "Price",
      cell: ({ row }) => (
        <div className="font-mono font-semibold">
          {row.original.current_price
            ? `₹${row.original.current_price.toFixed(2)}`
            : "-"}
        </div>
      ),
    },
    {
      accessorKey: "price_change_percent",
      header: "Change",
      cell: ({ row }) => {
        const change = row.original.price_change;
        const changePercent = row.original.price_change_percent;
        if (change === null || changePercent === null) {
          return <span className="text-muted-foreground">-</span>;
        }
        const isPositive = change >= 0;
        return (
          <div className={`font-mono font-semibold ${getValueColorClass(change)}`}>
            <div>{isPositive ? "+" : ""}{changePercent.toFixed(2)}%</div>
            <div className="text-xs">
              {isPositive ? "+" : ""}{change.toFixed(2)}
            </div>
          </div>
        );
      },
    },
    ...(!isMobile ? [{
      accessorKey: "sector",
      header: "Sector / Industry",
      cell: ({ row }: { row: any }) => {
        const sector = row.original.sector;
        const industry = row.original.industry;
        if (!sector && !industry) {
          return <span className="text-muted-foreground">-</span>;
        }
        return (
          <div className="space-y-0.5 max-w-[180px]">
            {sector && (
              <Badge variant="secondary" className="text-xs">
                {sector}
              </Badge>
            )}
            {industry && (
              <div className="text-xs text-muted-foreground truncate">
                {industry}
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "market_cap",
      header: "Market Cap",
      cell: ({ row }: { row: any }) => (
        <div className="font-mono text-sm">
          {row.original.market_cap
            ? formatFinancialValue(row.original.market_cap, { compact: true })
            : "-"}
        </div>
      ),
    },
    {
      accessorKey: "trailing_pe",
      header: "P/E",
      cell: ({ row }: { row: any }) => (
        <div className="font-mono text-sm">
          {row.original.trailing_pe?.toFixed(2) ?? "-"}
        </div>
      ),
    },
    {
      accessorKey: "price_to_book",
      header: "P/B",
      cell: ({ row }: { row: any }) => (
        <div className="font-mono text-sm">
          {row.original.price_to_book?.toFixed(2) ?? "-"}
        </div>
      ),
    }] : []),
  ], [isMobile]);

  const totalPages = data?.meta?.total ? Math.ceil(data.meta.total / 30) : 0;

  // Smart loader: show skeleton only if loading takes > 300ms
  const { showSkeleton } = useSmartLoader(isLoading);

  return (
    <>
      {/* SEO Meta Tags */}
      <SEO
        title={PAGE_SEO.stocks.title}
        description={PAGE_SEO.stocks.description}
        canonical="/stocks"
      />

      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 space-y-8">
          <SectionHeader
            title="Stocks"
            description="Explore and analyze Indian stocks with real-time data"
            size="lg"
          />

        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search stocks by symbol or name..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="input-search-stocks"
            />
          </div>
        </div>

        <TabsSection
          tabs={capTabs}
          defaultTab="large"
          onTabChange={(tabId) => setActiveCapType(tabId as CapType)}
        >
          {() => (
            <div className="space-y-4 mt-4">
              <AnimatePresence mode="wait">
                {showSkeleton ? (
                  <div className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    {[...Array(10)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4">
                    <p className="text-destructive font-medium mb-2">Failed to load stocks</p>
                    <p className="text-sm text-muted-foreground">{error.message}</p>
                  </div>
                ) : data && data.data.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4">
                    <p className="text-muted-foreground font-medium mb-2">No stocks found</p>
                    <p className="text-sm text-muted-foreground">
                      {searchTerm
                        ? "Try adjusting your search term"
                        : "No stocks available for this category"}
                    </p>
                  </div>
                ) : stocksWithLTP.length > 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <DataTable
                      columns={columns}
                      data={stocksWithLTP}
                      pageSize={30}
                      onRowClick={(row) => navigate(`/stocks/${row.symbol}`)}
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {/* Server-side pagination controls */}
              {!isLoading && !error && data && data.data.length > 0 && totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages} ({data.meta?.total ?? 0} total stocks)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsSection>
        </div>
      </div>
    </>
  );
}
