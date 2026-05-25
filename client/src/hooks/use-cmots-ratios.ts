/**
 * CMOTS ratios. Yearly/quarterly return WideTable; daily returns a flat dict
 * (matches existing fundamentals/KeyMetricsCard pattern — single-snapshot
 * data is consumed as a flat dict by the frontend).
 */
import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-config";
import type { WideTable } from "./use-cmots-financials";

export type RatioPeriod = "yearly" | "quarterly" | "daily";

// Daily-ratios flat dict — keys match Daily_Ratios_C payload field names
// (PE, PBV, EV_EBITDA_TTM, ROE_TTM, ROA_TTM, NetIncomeMargin_TTM,
//  Debt_Equity_TTM, etc.). Values are float | null.
export type DailyRatios = Record<string, number | null>;

export function useCmotsRatios(
  ticker: string | undefined,
  period: RatioPeriod,
) {
  return useQuery<WideTable | DailyRatios>({
    queryKey: ["cmots-ratios", ticker, period],
    queryFn: async () => {
      if (!ticker) {
        throw new Error("Ticker is required");
      }
      const baseUrl = getApiBaseUrl();
      const res = await fetch(
        `${baseUrl}/v1/api/tickers/${encodeURIComponent(ticker)}/ratios/${period}`,
      );
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to fetch ratios: ${res.status} ${errorText}`);
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
