/**
 * CMOTS financial statements (WideTable shape per schema §9.6).
 * Outer-key format: ISO date strings (newest-first).
 */
import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-config";

export type StatementType = "standalone" | "consolidated";
export type FinancialReport =
  | "profit_loss"
  | "balance_sheet"
  | "cash_flow"
  | "quarterly"
  | "yearly";

export interface WideTable {
  periods: string[];                  // ISO date strings, newest-first
  labels: string[];                   // line-item labels
  data: (number | null)[][];          // data[label_idx][period_idx]
}

export function useCmotsFinancials(
  ticker: string | undefined,
  statementType: StatementType,
  report: FinancialReport,
) {
  return useQuery<WideTable>({
    queryKey: ["cmots-financials", ticker, statementType, report],
    queryFn: async () => {
      if (!ticker) {
        throw new Error("Ticker is required");
      }
      const baseUrl = getApiBaseUrl();
      const res = await fetch(
        `${baseUrl}/v1/api/tickers/${encodeURIComponent(ticker)}/financials/${statementType}/${report}`,
      );
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to fetch financials: ${res.status} ${errorText}`);
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
