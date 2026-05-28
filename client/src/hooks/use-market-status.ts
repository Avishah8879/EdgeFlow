import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-config";

interface MarketStatus {
  is_open: boolean;
  status: "OPEN" | "PRE_MARKET" | "AFTER_HOURS" | "HOLIDAY" | "WEEKEND" | "CLOSED" | "PRE-MARKET" | "POST-MARKET";
  reason?: "OPEN" | "PRE_MARKET" | "AFTER_HOURS" | "HOLIDAY" | "WEEKEND" | "CLOSED" | string;
  message: string;
  current_time: string;
  next_open?: string;
}

export function useMarketStatus() {
  const baseUrl = getApiBaseUrl();

  return useQuery<MarketStatus>({
    queryKey: ["market-status"],
    queryFn: async ({ signal }): Promise<MarketStatus> => {
      const response = await fetch(`${baseUrl}/api/market-status`, { signal });

      if (!response.ok) {
        throw new Error(`Market status fetch failed: ${response.statusText}`);
      }

      const envelope = await response.json();
      // Unwrap standardized { data } envelope
      return (envelope.data ?? envelope) as MarketStatus;
    },
    refetchInterval: 60000, // Refetch every 60 seconds
    staleTime: 120000, // Consider data fresh for 2 minutes (prevents refetch on re-mount)
    gcTime: 300000, // Keep in cache for 5 minutes
    retry: 2,
    retryDelay: 1000,
    refetchOnWindowFocus: false, // Don't refetch when tab regains focus
  });
}
