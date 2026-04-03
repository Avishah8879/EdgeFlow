import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-config";

export interface IndexDetailData {
  symbol: string;
  basic_info: {
    id: number;
    symbol: string;
    name: string;
    exchange: string;
    suffix: string;
  };
  price_data: {
    current_value: number | null;
    previous_close: number | null;
    change: number;
    change_percent: number;
    open: number | null;
    day_high: number | null;
    day_low: number | null;
    volume: number | null;
    timestamp: string | null;
  };
  range_52w: {
    high: number | null;
    low: number | null;
    high_date: string | null;
    low_date: string | null;
  };
}

export function useIndexDetail(symbol: string | undefined) {
  return useQuery<IndexDetailData>({
    queryKey: ["index-detail", symbol],
    queryFn: async () => {
      if (!symbol) {
        throw new Error("Symbol is required");
      }

      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/indices/${encodeURIComponent(symbol)}`);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to fetch index detail: ${res.status} ${errorText}`);
      }

      const envelope = await res.json();
      return envelope.data ?? envelope;
    },
    enabled: !!symbol,
    staleTime: 1000 * 60 * 2, // 2 minutes
    placeholderData: (previousData) => {
      // Only keep previous data if it's for the same symbol
      return previousData?.symbol === symbol ? previousData : undefined;
    },
    retry: 2,
  });
}
