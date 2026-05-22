/**
 * CMOTS BSE/NSE announcements. ``withRatingsOnly=true`` filters to rows
 * where the §9.4 regex extracted an ``agency`` + ``rating``.
 */
import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-config";

export interface CmotsAnnouncement {
  source: "BSE" | "NSE";
  caption: string | null;
  memo: string | null;
  descriptor: string | null;
  type: string | null;
  announcement_date: string | null;
  file_url: string | null;
  agency: string | null;
  rating: string | null;
}

export function useCmotsAnnouncements(
  ticker: string | undefined,
  withRatingsOnly: boolean = false,
) {
  return useQuery<CmotsAnnouncement[]>({
    queryKey: ["cmots-announcements", ticker, withRatingsOnly],
    queryFn: async () => {
      if (!ticker) {
        throw new Error("Ticker is required");
      }
      const baseUrl = getApiBaseUrl();
      const url = new URL(
        `${baseUrl}/v1/api/tickers/${encodeURIComponent(ticker)}/announcements`,
      );
      if (withRatingsOnly) {
        url.searchParams.set("with_ratings_only", "true");
      }
      const res = await fetch(url.toString());
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to fetch announcements: ${res.status} ${errorText}`);
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
