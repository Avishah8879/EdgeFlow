import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthBaseUrl } from '@/lib/api-config';

const AUTH_BASE_URL = getAuthBaseUrl();

export interface SavedPairWatchlistEntry {
  id: string;
  name: string;
  symbol1: string;
  symbol2: string;
  method: string;
  lookback_days: number;
  correlation: number | null;
  beta: number | null;
  delta: number | null;
  pvalue: number | null;
  is_shared: boolean;
  share_token?: string;
  created_at: string;
  updated_at: string;
}

interface PairWatchlistResponse {
  results: SavedPairWatchlistEntry[];
  total: number;
  limit: number;
  offset: number;
}

interface SavePairInput {
  name: string;
  symbol1: string;
  symbol2: string;
  method: string;
  lookbackDays: number;
  correlation?: number | null;
  beta?: number | null;
  delta?: number | null;
  pvalue?: number | null;
}

async function fetchPairWatchlist(limit = 50, offset = 0): Promise<PairWatchlistResponse> {
  const response = await fetch(
    `${AUTH_BASE_URL}/api/saved/pair-watchlist?limit=${limit}&offset=${offset}`,
  );
  if (!response.ok) throw new Error('Failed to fetch pair watchlist');
  return response.json();
}

async function savePairWatchlistEntry(data: SavePairInput): Promise<SavedPairWatchlistEntry> {
  const response = await fetch(`${AUTH_BASE_URL}/api/saved/pair-watchlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to save' }));
    throw new Error(error.message || 'Failed to save pair');
  }
  return response.json();
}

async function deletePairWatchlistEntry(id: string): Promise<void> {
  const response = await fetch(`${AUTH_BASE_URL}/api/saved/pair-watchlist/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to delete' }));
    throw new Error(error.message || 'Failed to delete pair');
  }
}

export function usePairWatchlist(limit = 50, offset = 0) {
  return useQuery({
    queryKey: ['saved-pair-watchlist', limit, offset],
    queryFn: () => fetchPairWatchlist(limit, offset),
    staleTime: 60 * 1000,
  });
}

export function useSavePairWatchlistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: savePairWatchlistEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-pair-watchlist'] });
    },
  });
}

export function useDeletePairWatchlistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deletePairWatchlistEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-pair-watchlist'] });
    },
  });
}
