import { useQuery } from "@tanstack/react-query";

export interface GranularBucket {
  avg_return: number;
  win_pct: number;
  count: number;
}

export interface GranularSeasonalityData {
  monthly: Record<string, GranularBucket>;
  weekly: Record<string, GranularBucket>;
  daily: Record<string, GranularBucket>;
}

export function useGranularSeasonality(
  ticker: string | undefined,
  years: number,
) {
  return useQuery<GranularSeasonalityData>({
    queryKey: ["seasonality-granular", ticker, years],
    queryFn: async () => {
      if (!ticker) throw new Error("Ticker required");
      const res = await fetch(
        `/api/seasonality/granular/${encodeURIComponent(ticker)}?years=${years}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`${res.status}: ${text}`);
      }
      const envelope = await res.json();
      return envelope.data ?? envelope;
    },
    enabled: !!ticker,
    staleTime: 1000 * 60 * 30,
    retry: 2,
  });
}
