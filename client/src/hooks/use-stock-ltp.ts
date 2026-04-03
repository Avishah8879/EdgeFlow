import { useQuery } from "@tanstack/react-query";
import type { StockLTP } from "@/lib/types";
import { getApiBaseUrl } from "@/lib/api-config";

export function useStockLTP(ticker: string | undefined) {
  const baseUrl = getApiBaseUrl();

  return useQuery<StockLTP>({
    queryKey: ["stock-ltp", ticker],
    queryFn: async ({ signal }): Promise<StockLTP> => {
      if (!ticker) {
        throw new Error("Ticker is required");
      }

      const response = await fetch(`${baseUrl}/api/stock-ltp/${encodeURIComponent(ticker)}`, {
        signal, // Pass abort signal to cancel request on ticker change
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch LTP data (${response.status})`);
      }

      const envelope = await response.json();
      // Unwrap standardized { data } envelope
      return (envelope.data ?? envelope) as StockLTP;
    },
    enabled: !!ticker, // Only run query if ticker exists
    refetchInterval: 30000, // Refetch every 30 seconds for live price updates
    refetchIntervalInBackground: false, // Don't refetch when tab is not visible
    staleTime: 60 * 1000, // Cache for 1 minute before considering stale
    retry: 2,
  });
}
