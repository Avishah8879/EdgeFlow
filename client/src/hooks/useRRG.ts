import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export type RRGPeriod = '1y' | '2y' | '5y';

export type RRGResponse = {
  image?: string | null;
  legend: { symbol: string; rsRatio: number; rsMom: number }[];
  benchmark?: string;
  ranges?: { xMin: number; xMax: number; yMin: number; yMax: number };
  trails?: {
    symbol: string;
    label?: string;
    color?: string;
    points: {
      x: number;
      y: number;
      ratio: number;
      momentum: number;
      date?: string;
    }[];
    current?: {
      x: number;
      y: number;
      ratio: number;
      momentum: number;
      date?: string;
    };
  }[];
};

/**
 * Shared hook for RRG data. Both RRGChart and RRGQuadrantTable call this with
 * identical args so React Query deduplicates them into a single network request.
 *
 * Debouncing is NOT applied here — it is a view concern. RRGChart handles its
 * own debouncing before passing args to this hook, which ensures the queryKey
 * is identical between callers once the debounce settles.
 */
export function useRRG(symbols: string[], period: RRGPeriod = '2y') {
  const symbolsKey = symbols.join(',');

  return useQuery<RRGResponse>({
    queryKey: ['/api/rrg-image', symbolsKey, period],
    queryFn: async () => {
      const params = new URLSearchParams({ symbols: symbolsKey, period });
      const response = await apiRequest('GET', `/api/rrg-image?${params.toString()}`);
      const json = await response.json();
      return (json?.data || json) as RRGResponse;
    },
    enabled: symbols.length >= 2,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });
}
