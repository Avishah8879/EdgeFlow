import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-config";

// =============================================================================
// Types
// =============================================================================

export interface IndividualShareholder {
  name: string;
  values: (number | null)[];
}

export interface ShareholdingCategory {
  category: string;
  values: (number | null)[];
  shareholders: IndividualShareholder[];
}

export interface ShareholdingChartPoint {
  quarter: string;
  [key: string]: string | number | undefined;
}

export interface ShareholdingData {
  success: boolean;
  symbol: string;
  view: "quarterly" | "yearly";
  quarters: string[];
  data: ShareholdingCategory[];
  chart_data: ShareholdingChartPoint[];
  error: string | null;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Fetch shareholding pattern data for a stock.
 *
 * Scrapes screener.in (server-side) and caches for 6 hours.
 * Returns chart-friendly data and table data.
 */
export function useShareholding(
  ticker: string | undefined,
  view: "quarterly" | "yearly" = "quarterly"
) {
  const baseUrl = getApiBaseUrl();

  return useQuery<ShareholdingData>({
    queryKey: ["shareholding", ticker, view],
    queryFn: async () => {
      if (!ticker) {
        throw new Error("Ticker is required");
      }

      const res = await fetch(
        `${baseUrl}/api/shareholding/${encodeURIComponent(ticker)}?view=${view}`
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({
          detail: "Failed to fetch shareholding data",
        }));
        throw new Error(
          errorData.detail || "Failed to fetch shareholding data"
        );
      }

      const data: ShareholdingData = await res.json();

      if (!data.success) {
        throw new Error(data.error || "No shareholding data available");
      }

      return data;
    },
    enabled: !!ticker,
    staleTime: 1000 * 60 * 30, // 30 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
    retry: 1,
  });
}
