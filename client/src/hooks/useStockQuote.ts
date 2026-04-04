import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { StockQuote } from '@shared/schema';

interface QuoteOptions {
  refetchInterval?: number;
  staleTime?: number;
}

export function useStockQuote(
  symbol: string,
  enabled: boolean = true,
  options: QuoteOptions = {}
) {
  const {
    refetchInterval = 60000,
    staleTime = 30000,
  } = options;

  return useQuery<StockQuote>({
    queryKey: ['/api/quote', symbol],
    enabled: enabled && symbol.length > 0,
    refetchInterval,
    staleTime,
    // Keep previous data during refetch to prevent flicker/data disappearing
    placeholderData: keepPreviousData,
    // Retry once on failure with 2 second delay
    retry: 1,
    retryDelay: 2000,
    select: (raw: any): StockQuote => {
      // Python returns {success, data: {symbol, ohlc: {open,high,low,close,volume}, ltp, change, ...}}
      const d = raw?.data ?? raw;
      const ohlc = d?.ohlc ?? {};
      return {
        symbol: d?.symbol ?? symbol,
        price: Number(d?.ltp ?? d?.price ?? ohlc?.close ?? 0),
        change: Number(d?.change ?? 0),
        changePercent: Number(d?.change_percent ?? d?.changePercent ?? 0),
        open: Number(ohlc?.open ?? d?.open ?? 0),
        high: Number(ohlc?.high ?? d?.high ?? 0),
        low: Number(ohlc?.low ?? d?.low ?? 0),
        previousClose: Number(d?.prev_close ?? d?.previousClose ?? ohlc?.close ?? 0),
        volume: Number(ohlc?.volume ?? d?.volume ?? 0),
        timestamp: d?.timestamp ?? new Date().toISOString(),
      };
    },
  });
}
