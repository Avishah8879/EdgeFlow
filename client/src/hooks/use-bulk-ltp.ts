import { useQuery } from "@tanstack/react-query";
import type { StockLTP } from "@/lib/types";
import { getApiBaseUrl } from "@/lib/api-config";

export type BulkLTPResponse = Record<string, StockLTP>;

export function useBulkLTP(tickers: string[] | undefined) {
  const baseUrl = getApiBaseUrl();

  return useQuery<BulkLTPResponse>({
    queryKey: ["bulk-ltp", ...(tickers || []).sort()], // Sort for consistent cache keys
    queryFn: async ({ signal }): Promise<BulkLTPResponse> => {
      if (!tickers || tickers.length === 0) {
        return {};
      }

      const response = await fetch(`${baseUrl}/api/stock-ltp/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: tickers }),
        signal, // Pass abort signal to cancel request on change
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch bulk LTP data (${response.status})`);
      }

      const envelope = await response.json();
      // Unwrap standardized { data } envelope
      return (envelope.data ?? envelope) as BulkLTPResponse;
    },
    enabled: !!tickers && tickers.length > 0, // Only run query if tickers exist
    refetchInterval: 120000, // Refetch every 2 minutes (optimized to reduce backend load)
    staleTime: 90 * 1000, // Cache for 90 seconds before considering stale
    retry: 2,
  });
}
