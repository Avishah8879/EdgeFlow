/**
 * CMOTS narrative documents (Director's Report, Chairman, Auditor, MD&A,
 * Notes to Account). ``body_html`` is bleach-sanitized server-side per §5;
 * render directly without re-sanitization.
 */
import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-config";

export type CmotsDocType =
  | "director_report"
  | "chairman_report"
  | "auditor_report"
  | "notes_to_account"
  | "mda";

export interface CmotsNarrative {
  doc_type: string;
  year: number | null;
  body_html: string | null;
  body_text: string | null;
  fetched_at: string | null;
}

export function useCmotsNarratives(
  ticker: string | undefined,
  docType: CmotsDocType,
) {
  return useQuery<CmotsNarrative[]>({
    queryKey: ["cmots-narratives", ticker, docType],
    queryFn: async () => {
      if (!ticker) {
        throw new Error("Ticker is required");
      }
      const baseUrl = getApiBaseUrl();
      const res = await fetch(
        `${baseUrl}/v1/api/tickers/${encodeURIComponent(ticker)}/narratives/${docType}`,
      );
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to fetch narratives: ${res.status} ${errorText}`);
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
