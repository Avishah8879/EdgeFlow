import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-config";

// NIFTY OHLC data structure for candlestick chart
export interface NiftyOHLC {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

// Fear & Greed Index data structure
export interface MarketMoodData {
  status: "live" | "stale" | "default";
  current: {
    value: number;
    category: string;
    timestamp: string;
  };
  series: Array<{
    timestamp: string;
    value: number;
  }>;
  nifty_ohlc: NiftyOHLC[];
  error: string | null;
}

// Default fallback data (neutral state)
const DEFAULT_MARKET_MOOD: MarketMoodData = {
  status: "default",
  current: {
    value: 50.0,
    category: "Neutral",
    timestamp: new Date().toISOString(),
  },
  series: [],
  nifty_ohlc: [],
  error: null,
};

/**
 * Custom hook to fetch Fear & Greed Index data from the backend.
 *
 * Features:
 * - Fetches current Fear & Greed Index value and 5-day history
 * - Auto-updates every 15 minutes (matches backend recalculation interval)
 * - Graceful error handling with fallback to default neutral state
 * - Never causes blank screen - always returns valid data
 *
 * @returns TanStack Query result with market mood data
 */
export function useMarketMood() {
  const baseUrl = getApiBaseUrl();
  const marketMoodUrl = `${baseUrl}/api/market-mood`;

  return useQuery<MarketMoodData>({
    queryKey: ["market-mood"],
    queryFn: async (): Promise<MarketMoodData> => {
      try {
        const response = await fetch(marketMoodUrl, {
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });

        if (!response.ok) {
          console.warn(
            `[Market Mood] API returned ${response.status}, using fallback data`
          );
          return DEFAULT_MARKET_MOOD;
        }

        const envelope = await response.json();
        // Unwrap standardized { data } envelope
        return (envelope.data ?? envelope) as MarketMoodData;
      } catch (error) {
        console.error("[Market Mood] Fetch failed, using fallback data:", error);
        return DEFAULT_MARKET_MOOD;
      }
    },
    staleTime: 15 * 60 * 1000, // 15 minutes (matches backend recalculation interval)
    refetchOnWindowFocus: false, // Don't refetch on window focus
    retry: 2, // Retry failed requests 2 times
    retryDelay: 1000, // Wait 1 second between retries
    placeholderData: DEFAULT_MARKET_MOOD, // Show default data while loading
    // Always return valid data, never undefined
    select: (data) => data ?? DEFAULT_MARKET_MOOD,
  });
}
