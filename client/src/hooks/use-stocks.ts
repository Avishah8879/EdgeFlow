import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import type { StocksResponse, CapType } from "@/lib/types";
import { getApiBaseUrl } from "@/lib/api-config";

interface UseStocksParams {
  capType?: CapType;
  searchTerm?: string;
  page?: number;
  limit?: number;
}

export function useStocks({
  capType = "all",
  searchTerm = "",
  page = 1,
  limit = 30,
}: UseStocksParams = {}) {
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);

  // Debounce search term by 500ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const baseUrl = getApiBaseUrl();

  // Build query parameters
  const params = new URLSearchParams();
  if (capType && capType !== "all") params.append("cap_type", capType);
  if (debouncedSearch) params.append("search", debouncedSearch);
  params.append("page", page.toString());
  params.append("limit", limit.toString());

  const stocksUrl = `${baseUrl}/api/stocks?${params.toString()}`;

  return useQuery({
    queryKey: ["stocks", capType, debouncedSearch, page, limit],
    queryFn: async (): Promise<StocksResponse> => {
      const response = await fetch(stocksUrl);
      if (!response.ok) {
        throw new Error(`Failed to load stocks (${response.status})`);
      }

      const payload = await response.json();
      return payload as StocksResponse;
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    placeholderData: (previousData) => previousData, // Keep previous data during loading for smooth pagination
  });
}
