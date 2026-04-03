import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-config";

export type TickerOption = {
  symbol: string;
  name?: string | null;
};

function normalizeTickerSymbol(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  const normalized = String(value).toUpperCase().trim();
  return normalized ? normalized : null;
}

export function useTickerOptions() {
  const baseUrl = getApiBaseUrl();
  const tickersApiUrl = `${baseUrl}/api/tickers`;

  return useQuery({
    queryKey: ["ticker-options"],
    queryFn: async (): Promise<TickerOption[]> => {
      const response = await fetch(tickersApiUrl);
      if (!response.ok) {
        throw new Error(`Failed to load tickers (${response.status})`);
      }

      const payload = await response.json();
      // Unwrap standardized { data } envelope, fallback to legacy .tickers
      const items = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload?.tickers) ? payload.tickers : []);
      const seen = new Set<string>();

      return items
        .map((item: any) => {
          const symbol =
            normalizeTickerSymbol(
              item?.symbol ??
                item?.ticker ??
                item?.code ??
                item?.Symbol ??
                item?.TICKER,
            ) ?? null;

          if (!symbol) {
            return null;
          }

          if (seen.has(symbol)) {
            return null;
          }

          seen.add(symbol);

          const rawName =
            item?.name ??
            item?.company_name ??
            item?.CompanyName ??
            item?.NAME ??
            null;

          return {
            symbol,
            name: rawName != null ? String(rawName).trim() || null : null,
          } satisfies TickerOption;
        })
        .filter((option: TickerOption | null): option is TickerOption => option !== null);
    },
    staleTime: 1000 * 60 * 10,
  });
}

