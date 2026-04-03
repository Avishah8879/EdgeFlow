import { useQuery } from '@tanstack/react-query';

export interface TopStock {
  symbol: string;
  name: string;
  marketCap: number;
}

export function useTopStocks(limit: number = 20) {
  return useQuery<TopStock[]>({
    queryKey: ['/api/top-stocks', limit],
    queryFn: async () => {
      const res = await fetch(`/api/top-stocks?limit=${limit}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch top stocks: ${res.status}`);
      }
      const json = await res.json();
      return json?.data || [];
    },
    staleTime: 300000, // 5 minutes - market cap doesn't change frequently
    gcTime: 600000, // 10 minutes
  });
}
