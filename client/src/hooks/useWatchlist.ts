import { useQuery, useMutation, keepPreviousData } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { WatchlistItem } from '@shared/schema';

export function useWatchlist() {
  const query = useQuery<WatchlistItem[]>({
    queryKey: ['/api/ft/watchlist'],
    // Keep previous data during refetch to prevent UI flickering
    placeholderData: keepPreviousData,
    // Retry once on failure
    retry: 1,
    retryDelay: 2000,
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
    watchlist: query.data || [],
    isLoading: query.isLoading,
    addSymbol: addMutation.mutate,
    removeSymbol: removeMutation.mutate,
    isAdding: addMutation.isPending,
    isRemoving: removeMutation.isPending,
  };
}
