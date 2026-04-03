import { useQuery } from '@tanstack/react-query';
import type { SymbolSearchResult } from '@shared/schema';

export function useSymbolSearch(query: string) {
  return useQuery<SymbolSearchResult[]>({
    queryKey: ['/api/search', query],
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) {
        throw new Error(`Search failed: ${res.status}`);
      }
      const json = await res.json();
      return json?.data || [];
    },
    enabled: query.length >= 2,
    staleTime: 60000, // 1 minute - search results should be fresh
    gcTime: 300000, // 5 minutes garbage collection
  });
}
