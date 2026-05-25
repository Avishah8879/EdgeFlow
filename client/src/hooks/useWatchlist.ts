import { useQuery, useMutation, keepPreviousData } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { WatchlistItem } from '@shared/schema';

/**
 * The default queryFn (in queryClient.ts) hands back the raw JSON body of
 * the /api/ft/watchlist response. The server wraps it in
 * `{ success, data, message }` — so we unwrap with `select` and tolerate
 * either the wrapped or the raw-array shape.
 */
type WatchlistEnvelope =
  | WatchlistItem[]
  | { success?: boolean; data?: WatchlistItem[]; message?: string };

function unwrap(raw: WatchlistEnvelope | undefined | null): WatchlistItem[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object' && Array.isArray((raw as any).data)) {
    return (raw as any).data;
  }
  return [];
}

export function useWatchlist() {
  const query = useQuery<WatchlistEnvelope, Error, WatchlistItem[]>({
    queryKey: ['/api/ft/watchlist'],
    placeholderData: keepPreviousData,
    retry: 1,
    retryDelay: 2000,
    select: unwrap,
  });

  const addMutation = useMutation({
    mutationFn: (symbol: string) => apiRequest('POST', '/api/ft/watchlist', { symbol }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ft/watchlist'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (symbol: string) => apiRequest('DELETE', `/api/ft/watchlist/${symbol}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ft/watchlist'] });
    },
  });

  return {
    watchlist: query.data ?? [],
    isLoading: query.isLoading,
    addSymbol: addMutation.mutate,
    removeSymbol: removeMutation.mutate,
    isAdding: addMutation.isPending,
    isRemoving: removeMutation.isPending,
  };
}
