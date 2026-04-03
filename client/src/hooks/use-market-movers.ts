import { useQuery } from "@tanstack/react-query";
import type { MarketMoversResponse, CategoryType } from "@/lib/types";
import { getApiBaseUrl } from "@/lib/api-config";

interface UseMarketMoversParams {
  category?: CategoryType;
  limit?: number;
}

export function useMarketMovers({
  category,
  limit = 10,
}: UseMarketMoversParams = {}) {
  const baseUrl = getApiBaseUrl();

  // Build query parameters
  const params = new URLSearchParams();
  if (category) params.append("category", category);
  params.append("limit", limit.toString());

  const marketMoversUrl = `${baseUrl}/api/market-movers?${params.toString()}`;

  return useQuery({
    queryKey: ["market-movers", category, limit],
    queryFn: async (): Promise<MarketMoversResponse> => {
      const response = await fetch(marketMoversUrl);
      if (!response.ok) {
        throw new Error(`Failed to load market movers (${response.status})`);
      }

      const payload = await response.json();
      return payload as MarketMoversResponse;
    },
    staleTime: 1000 * 60 * 5, // Consider data fresh for 5 minutes
    gcTime: 1000 * 60 * 10, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false, // Don't refetch when tab regains focus
  });
}
