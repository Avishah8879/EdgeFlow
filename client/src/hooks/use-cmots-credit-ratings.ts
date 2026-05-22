/**
 * CMOTS credit-rating events (§9.4 shape). Same row set as
 * ``useCmotsAnnouncements(symbol, true)`` but in a rating-centric shape
 * (``date`` instead of ``announcement_date``).
 */
import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-config";

export interface CmotsCreditRating {
  date: string | null;
  agency: string;
  rating: string;
  source: "BSE" | "NSE";
  caption: string | null;
  memo: string | null;
  file_url: string | null;
}

export function useCmotsCreditRatings(ticker: string | undefined) {
  return useQuery<CmotsCreditRating[]>({
    queryKey: ["cmots-credit-ratings", ticker],
    queryFn: async () => {
      if (!ticker) {
        throw new Error("Ticker is required");
      }
      const baseUrl = getApiBaseUrl();
      const res = await fetch(
        `${baseUrl}/v1/api/tickers/${encodeURIComponent(ticker)}/credit-ratings`,
      );
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to fetch credit ratings: ${res.status} ${errorText}`);
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
