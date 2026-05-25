/**
 * CMOTS coverage probe — returns true when this ticker has been synced by
 * the CMOTS pipeline. Used to gate CMOTS-specific panels in StockDetail.tsx.
 *
 * Pattern matches use-stock-detail.ts: 2-tuple queryKey, envelope unwrap,
 * 5-minute staleTime, same-ticker placeholderData guard.
 */
import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-config";

export interface CmotsCoverage {
  has_cmots_data: boolean;
}

export function useCmotsCoverage(ticker: string | undefined) {
  return useQuery<CmotsCoverage>({
    queryKey: ["cmots-coverage", ticker],
    queryFn: async () => {
      if (!ticker) {
        throw new Error("Ticker is required");
      }
      const baseUrl = getApiBaseUrl();
      const res = await fetch(
        `${baseUrl}/v1/api/tickers/${encodeURIComponent(ticker)}/has-cmots-data`,
      );
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to fetch CMOTS coverage: ${res.status} ${errorText}`);
      }
      const envelope = await res.json();
      return envelope.data ?? envelope;
    },
    enabled: !!ticker,
    staleTime: 1000 * 60 * 5,
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey?.[1] === ticker ? previousData : undefined,
    retry: 2,
  });
}
