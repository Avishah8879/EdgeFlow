import { useQuery } from '@tanstack/react-query';

interface UserStats {
  watchlistCount: number;
  layoutsCount: number;
  messagesCount: number;
  topSymbols: string[];
}

export function useUserStats() {
  return useQuery<UserStats>({
    queryKey: ['/api/user/stats'],
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: false,
  });
}
