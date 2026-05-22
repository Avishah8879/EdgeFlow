/**
 * CMOTS pros/cons rule-engine output (§9.3): list of {type, label, detail}.
 * ``type ∈ {"pro","con","info"}``.
 *
 * For uncovered tickers the accessor returns []; the consuming component
 * (ProsConsPanel) falls back to the existing client-side derivation
 * (derivePros/deriveCons in StockDetail.tsx) — adapter pattern, no
 * backend changes per plan §9 design note.
 */
import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-config";

export type ProConType = "pro" | "con" | "info";

export interface CmotsProConEntry {
  type: ProConType;
  label: string;
  detail: string;
}

export function useCmotsProsCons(ticker: string | undefined) {
  return useQuery<CmotsProConEntry[]>({
    queryKey: ["cmots-pros-cons", ticker],
    queryFn: async () => {
      if (!ticker) {
        throw new Error("Ticker is required");
      }
      const baseUrl = getApiBaseUrl();
      const res = await fetch(
        `${baseUrl}/v1/api/tickers/${encodeURIComponent(ticker)}/pros-cons`,
      );
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to fetch pros-cons: ${res.status} ${errorText}`);
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
