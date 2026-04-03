import { useQuery } from "@tanstack/react-query";
import type { PriceChartData } from "@/lib/types";
import { getApiBaseUrl } from "@/lib/api-config";

interface UsePriceChartOptions {
  ticker: string;
  timeframe: string;
  months: number;
  enabled?: boolean; // Optional: control when query runs
}

export function usePriceChart({ ticker, timeframe, months, enabled = true }: UsePriceChartOptions) {
  return useQuery<PriceChartData>({
    queryKey: ["price-chart", ticker, timeframe, months],
    queryFn: async ({ signal }) => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(
        `${baseUrl}/api/price-chart/${encodeURIComponent(ticker)}?timeframe=${timeframe}&months=${months}`,
        { signal }
      );

      if (!res.ok) {
        throw new Error(`Failed to fetch price data (${res.status})`);
      }

      const envelope = await res.json();
      // Unwrap standardized { data } envelope
      const data = (envelope.data ?? envelope) as PriceChartData;

      if (data.error) {
        throw new Error(data.error);
      }

      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    enabled: !!ticker && enabled, // Run only if ticker exists and enabled is true
    placeholderData: (previousData) => previousData, // Keep old data visible during timeframe switches
  });
}
