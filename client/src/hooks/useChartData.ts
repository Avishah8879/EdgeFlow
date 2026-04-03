import { useQuery, useQueries } from '@tanstack/react-query';

export interface PriceDataPoint {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type BatchChartData = Record<string, PriceDataPoint[]>;

const intradayTimeframes = new Set(['1m']);

export function useChartData(symbol: string, timeframe: string = '1m') {
  // Determine endpoint and parameters
  const isIntraday = intradayTimeframes.has(timeframe);
  const endpoint = isIntraday ? 'intraday' : 'daily';

  // Build query parameters
  const params = new URLSearchParams();

  if (isIntraday) {
    params.append('interval', timeframe);
    // Always request last known trading session via query flag
    params.append('fallback', 'last');
  } else {
    // Daily/Weekly/Monthly: map timeframe to period and pass timeframe
    const periodMap: Record<string, string> = {
      '1D': '1y',
      '1W': '2y',
      '1M': '5y',
    };
    params.append('period', periodMap[timeframe] || '1y');
    params.append('timeframe', timeframe);
  }

  return useQuery<PriceDataPoint[]>({
    queryKey: ['/api/chart', endpoint, symbol, timeframe],
    queryFn: async () => {
      const url = `/api/chart/${endpoint}/${symbol}?${params.toString()}`;
      const response = await fetch(url, { credentials: 'include' });

      if (!response.ok) {
        const text = (await response.text()) || response.statusText;
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      const json = await response.json();
      const payload = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];

      return payload as PriceDataPoint[];
    },
    enabled: symbol.length > 0,
    staleTime: isIntraday ? 60000 : 300000, // 1min for intraday, 5min for daily
    refetchInterval: isIntraday ? 60000 : false, // Auto-refresh intraday every 1min
    retry: 2,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Batch fetch chart data for multiple symbols in a single request.
 * 5-10x faster than individual fetches for comparison charts.
 *
 * @param symbols - Array of stock symbols to fetch
 * @param timeframe - Chart timeframe (1D, 1W, 1M)
 * @param enabled - Whether to enable the query
 */
export function useBatchChartData(
  symbols: string[],
  timeframe: string = '1D',
  enabled: boolean = true
) {
  // Build query parameters
  const periodMap: Record<string, string> = {
    '1D': '1y',
    '1W': '2y',
    '1M': '5y',
  };
  const period = periodMap[timeframe] || '1y';

  // Create stable query key from sorted symbols
  const symbolsKey = [...symbols].sort().join(',');

  return useQuery<BatchChartData>({
    queryKey: ['/api/charts/batch', symbolsKey, timeframe, period],
    queryFn: async () => {
      if (symbols.length === 0) return {};

      const params = new URLSearchParams({
        symbols: symbols.join(','),
        period,
        timeframe,
      });

      const response = await fetch(`/api/charts/batch?${params.toString()}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        const text = (await response.text()) || response.statusText;
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      const json = await response.json();
      // Handle wrapped response {success, data} or raw data
      const data = json?.data ?? json ?? {};

      return data as BatchChartData;
    },
    enabled: enabled && symbols.length > 0,
    staleTime: 300000, // 5 minutes
    retry: 2,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Fetch intraday chart data for multiple comparison symbols.
 * Uses parallel individual fetches since batch endpoint doesn't support intraday.
 *
 * @param symbols - Array of stock symbols to fetch
 * @param enabled - Whether to enable the query
 * @returns Object mapping symbols to their intraday data
 */
export function useIntradayCompareData(
  symbols: string[],
  enabled: boolean = true
): { data: BatchChartData | undefined; isLoading: boolean } {
  const results = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ['/api/chart', 'intraday', symbol, '1m'],
      queryFn: async () => {
        const params = new URLSearchParams({
          interval: '1m',
          fallback: 'last',
        });
        const url = `/api/chart/intraday/${symbol}?${params.toString()}`;
        const response = await fetch(url, { credentials: 'include' });

        if (!response.ok) {
          const text = (await response.text()) || response.statusText;
          throw new Error(`HTTP ${response.status}: ${text}`);
        }

        const json = await response.json();
        const payload = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
        return { symbol: symbol.toUpperCase(), data: payload as PriceDataPoint[] };
      },
      enabled: enabled && symbol.length > 0,
      staleTime: 60000, // 1 minute
      refetchInterval: 60000, // Auto-refresh every 1 min
      retry: 2,
    })),
  });

  const isLoading = results.some((r) => r.isLoading);
  const hasData = results.some((r) => r.data);

  // Combine results into BatchChartData format
  const data: BatchChartData | undefined = hasData
    ? results.reduce<BatchChartData>((acc, result) => {
        if (result.data) {
          acc[result.data.symbol] = result.data.data;
        }
        return acc;
      }, {})
    : undefined;

  return { data, isLoading };
}
