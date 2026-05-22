/**
 * CMOTS corporate-action events. Optional ``actionType`` filter.
 */
import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-config";

export type CmotsActionType =
  | "dividend" | "agm" | "egm" | "board_meeting"
  | "bonus" | "split" | "rights" | "buyback"
  | "book_closure" | "merger_demerger"
  | "ofs" | "change_of_name" | "delisted" | "forthcoming";

export interface CmotsCorporateAction {
  action_type: string;                // canonical short label (see CmotsActionType union)
  action_date: string | null;         // ISO date string
  payload: Record<string, unknown>;   // original CMOTS row preserved verbatim
  source_slug: string;                // endpoint slug ('Dividend', 'AGM', etc.)
}

export function useCmotsCorporateActions(
  ticker: string | undefined,
  actionType?: CmotsActionType | null,
) {
  return useQuery<CmotsCorporateAction[]>({
    queryKey: ["cmots-corporate-actions", ticker, actionType ?? null],
    queryFn: async () => {
      if (!ticker) {
        throw new Error("Ticker is required");
      }
      const baseUrl = getApiBaseUrl();
      const url = new URL(
        `${baseUrl}/v1/api/tickers/${encodeURIComponent(ticker)}/corporate-actions`,
      );
      if (actionType) {
        url.searchParams.set("type", actionType);
      }
      const res = await fetch(url.toString());
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to fetch corporate actions: ${res.status} ${errorText}`);
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
