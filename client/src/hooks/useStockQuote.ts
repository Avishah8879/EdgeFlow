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
  });
}
