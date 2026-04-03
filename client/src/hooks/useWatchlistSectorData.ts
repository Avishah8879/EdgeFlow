import { useQuery } from '@tanstack/react-query';

interface SectorData {
  symbol: string;
  sector: string;
  industry: string;
}

type SectorMap = Record<string, { sector: string; industry: string }>;

export function useWatchlistSectorData(symbols: string[]) {
  const symbolsKey = symbols.sort().join(',');

  const query = useQuery<SectorMap>({
    queryKey: ['/api/sectors/batch', symbolsKey],
    queryFn: async () => {
      if (symbols.length === 0) {
        return {};
      }

      const response = await fetch(`/api/sectors/batch?symbols=${encodeURIComponent(symbols.join(','))}`);
      const json = await response.json();

      // Convert array to map for easy lookup
      const data: SectorData[] = json?.data || json || [];
      const map: SectorMap = {};

      for (const item of data) {
        map[item.symbol] = {
          sector: item.sector || 'Other',
          industry: item.industry || '',
        };
      }

      return map;
    },
    enabled: symbols.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes - sector data doesn't change often
  });

  return {
    sectorMap: query.data || {},
    isLoading: query.isLoading,
    getSector: (symbol: string) => query.data?.[symbol]?.sector || 'Other',
    getIndustry: (symbol: string) => query.data?.[symbol]?.industry || '',
  };
}
