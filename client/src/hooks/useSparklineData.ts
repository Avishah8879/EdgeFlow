import { useQuery } from '@tanstack/react-query';

interface SparklinePoint {
  value: number;
}

/**
 * Fetches real intraday data for sparkline visualization
 * Uses the last 20 1-minute candles from the intraday endpoint
 */
export function useSparklineData(symbol: string, enabled: boolean = true) {
  return useQuery<SparklinePoint[]>({
    queryKey: ['/api/chart/sparkline', symbol],
    queryFn: async () => {
      const url = `/api/chart/intraday/${symbol}?interval=1m`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) return [];

      const json = await response.json();
      const data = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];

      // Take last 20 points, map to {value: close} for Recharts
      return data.slice(-20).map((d: { close: number }) => ({ value: d.close }));
    },
    enabled: enabled && symbol.length > 0,
    staleTime: 60000,
    refetchInterval: 60000,
    retry: 1,
    // Keep previous sparkline during refetch to prevent flicker
    placeholderData: (previousData) => previousData,
  });
}
