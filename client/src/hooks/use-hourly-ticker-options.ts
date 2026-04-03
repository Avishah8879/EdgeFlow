import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-config";

export type HourlyTickerOption = {
  symbol: string;
  name: string | null;
  long_name: string | null;
};

export function useHourlyTickerOptions() {
  const baseUrl = getApiBaseUrl();
  const tickersApiUrl = `${baseUrl}/api/tickers/with-hourly-data`;

  return useQuery({
    queryKey: ["hourly-ticker-options"],
    queryFn: async (): Promise<HourlyTickerOption[]> => {
      const response = await fetch(tickersApiUrl);
      if (!response.ok) {
        throw new Error(`Failed to load tickers with hourly data (${response.status})`);
      }
      const envelope = await response.json();
      const payload = envelope.data ?? envelope;
      return Array.isArray(payload?.tickers) ? payload.tickers : Array.isArray(payload) ? payload : [];
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}
