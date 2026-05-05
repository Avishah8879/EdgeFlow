import { TrendingUp, TrendingDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-config";

interface MarqueeStock {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
}

export default function MarketTicker() {
  const { data: stocks = [], isLoading, isError, error } = useQuery({
    queryKey: ["marquee-stocks"],
    queryFn: async ({ signal }): Promise<MarqueeStock[]> => {
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/marquee-stocks?limit=15`, {
        signal, // Pass abort signal for cancellation
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch marquee stocks: ${response.status}`);
      }

      const envelope = await response.json();
      return envelope.data ?? envelope.stocks ?? [];
    },
    refetchInterval: 60000, // Refetch every 60 seconds (market data doesn't change that fast)
    staleTime: 120000, // Consider data fresh for 2 minutes (prevents refetch on re-mount)
    gcTime: 300000, // Keep in cache for 5 minutes
    retry: 2,
    refetchOnWindowFocus: false, // Don't refetch when tab regains focus
  });

  // Show error in console for debugging
  if (isError) {
    console.error("Marquee stocks error:", error);
  }

  // Show loading state or empty state
  if (isLoading) {
    return (
      <div className="relative z-10 border-b border-border bg-background">
        <div className="mx-auto w-full px-6">
          <div className="flex items-center justify-center py-3">
            <p className="text-xs text-muted-foreground">Loading market data...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show error state
  if (isError) {
    return (
      <div className="relative z-10 border-b border-border bg-background">
        <div className="mx-auto w-full px-6">
          <div className="flex items-center justify-center py-3">
            <p className="text-xs text-muted-foreground">Unable to load market data</p>
          </div>
        </div>
      </div>
    );
  }

  // Don't render if no stocks available
  if (stocks.length === 0) {
    return (
      <div className="relative z-10 border-b border-border bg-background">
        <div className="mx-auto w-full px-6">
          <div className="flex items-center justify-center py-3">
            <p className="text-xs text-muted-foreground">No market data available</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 border-b border-border bg-background">
      <div className="mx-auto w-full overflow-hidden">
        <div className="relative flex items-center py-3">
          {/* Scrolling marquee container */}
          <div className="flex animate-marquee gap-8 px-6 whitespace-nowrap">
            {/* First set of stocks */}
            {stocks.map((stock, idx) => {
              const isPositive = stock.changePercent >= 0;
              return (
                <div key={`${stock.symbol}-${idx}`} className="flex items-center gap-3 flex-shrink-0" data-testid={`ticker-${stock.symbol}`}>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{stock.symbol}</p>
                    <p className="font-mono font-semibold text-sm">
                      ₹{stock.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className={`flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-positive' : 'text-negative'}`}>
                    {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    <span className="text-xs">{isPositive ? '+' : ''}{stock.changePercent.toFixed(2)}%</span>
                  </div>
                </div>
              );
            })}
            {/* Duplicate set for seamless loop */}
            {stocks.map((stock, idx) => {
              const isPositive = stock.changePercent >= 0;
              return (
                <div key={`${stock.symbol}-duplicate-${idx}`} className="flex items-center gap-3 flex-shrink-0">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{stock.symbol}</p>
                    <p className="font-mono font-semibold text-sm">
                      ₹{stock.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className={`flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-positive' : 'text-negative'}`}>
                    {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    <span className="text-xs">{isPositive ? '+' : ''}{stock.changePercent.toFixed(2)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
