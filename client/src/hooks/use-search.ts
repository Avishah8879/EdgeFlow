import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getApiBaseUrl } from "@/lib/api-config";

export interface SearchResult {
  ticker_id: number;
  symbol: string;
  name: string;
  token: string | null;
  long_name: string | null;
  suffix: string | null;
  // Loaded async via prices endpoint:
  current_price?: number;
  change_percent?: number;
}

interface SearchResponse {
  results: SearchResult[];
  count: number;
  query: string;
}

interface PricesResponse {
  prices: Record<string, {
    current_price: number;
    change_percent: number | null;
  }>;
}

const DEBOUNCE_MS = 150;

/**
 * Hook for searching stocks with debouncing and async price loading
 */
export function useSearch(searchTerm: string, enabled: boolean = true) {
  const [debouncedTerm, setDebouncedTerm] = useState(searchTerm);
  const abortControllerRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();
  const baseUrl = getApiBaseUrl();

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Cancel previous request when search term changes
  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [debouncedTerm]);

  // Search query
  const searchQuery = useQuery({
    queryKey: ["search", debouncedTerm],
    queryFn: async (): Promise<SearchResponse> => {
      const response = await fetch(
        `${baseUrl}/api/search?q=${encodeURIComponent(debouncedTerm)}&limit=50`,
        { signal: abortControllerRef.current?.signal }
      );

      if (!response.ok) {
        throw new Error(`Search failed (${response.status})`);
      }

      const envelope = await response.json();
      // Unwrap standardized { data, meta } envelope
      const data = envelope.data ?? envelope.results ?? [];
      const meta = envelope.meta ?? {};
      return {
        results: Array.isArray(data) ? data : [],
        count: meta.count ?? (Array.isArray(data) ? data.length : 0),
        query: meta.query ?? debouncedTerm,
      };
    },
    enabled: enabled && debouncedTerm.length >= 1,
    staleTime: 30 * 1000, // Cache for 30 seconds
    gcTime: 60 * 1000, // Keep in cache for 1 minute
  });

  // Fetch prices for search results
  const tickerIds = searchQuery.data?.results.map(r => r.ticker_id) || [];

  const pricesQuery = useQuery({
    queryKey: ["search-prices", tickerIds],
    queryFn: async (): Promise<PricesResponse> => {
      const response = await fetch(`${baseUrl}/api/prices/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker_ids: tickerIds }),
      });

      if (!response.ok) {
        throw new Error(`Prices fetch failed (${response.status})`);
      }

      const envelope = await response.json();
      // Unwrap standardized { data } envelope, fallback to legacy .prices
      const prices = envelope.data ?? envelope.prices ?? {};
      return { prices };
    },
    enabled: tickerIds.length > 0,
    staleTime: 30 * 1000,
  });

  // Merge search results with prices (memoized to prevent new array reference on every render)
  const resultsWithPrices = useMemo<SearchResult[]>(() => {
    return (searchQuery.data?.results || []).map(result => {
      const priceData = pricesQuery.data?.prices[String(result.ticker_id)];
      return {
        ...result,
        current_price: priceData?.current_price,
        change_percent: priceData?.change_percent ?? undefined,
      };
    });
  }, [searchQuery.data?.results, pricesQuery.data?.prices]);

  // Function to cancel ongoing search
  const cancelSearch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return {
    results: resultsWithPrices,
    isLoading: searchQuery.isLoading,
    isPricesLoading: pricesQuery.isLoading,
    isError: searchQuery.isError,
    error: searchQuery.error,
    query: debouncedTerm,
    cancelSearch,
  };
}

/**
 * Hook for fetching trending stocks (top gainers)
 * @param limit Number of trending stocks to fetch
 * @param enabled Whether to enable the query (for lazy loading)
 */
export function useTrendingStocks(limit: number = 5, enabled: boolean = true) {
  const baseUrl = getApiBaseUrl();

  return useQuery({
    queryKey: ["trending-stocks", limit],
    queryFn: async () => {
      const response = await fetch(
        `${baseUrl}/api/market-movers?category=GAINER&limit=${limit}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch trending stocks (${response.status})`);
      }

      const data = await response.json();
      return data.data || [];
    },
    enabled, // Only fetch when enabled (e.g., when dropdown is open)
    staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache longer
    refetchOnWindowFocus: false, // Don't refetch when tab regains focus
  });
}
