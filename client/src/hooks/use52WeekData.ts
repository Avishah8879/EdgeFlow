import { useQuery } from '@tanstack/react-query';

interface Week52Data {
  symbol: string;
  high52Week: number;
  low52Week: number;
  ltp: number;
  changeFromHigh: number;
  changeFromLow: number;
}

export function use52WeekData(symbol: string) {
  return useQuery<Week52Data>({
    queryKey: [`/api/52week/${symbol}`],
    enabled: !!symbol,
    staleTime: 3600000, // 1 hour
    retry: 1,
  });
}
