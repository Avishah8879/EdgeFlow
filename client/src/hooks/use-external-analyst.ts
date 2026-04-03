import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-config";

export interface ExternalAnalystData {
  external_analyst: {
    ticker: string;
    company_name: string | null;
    analyst_ratings: {
      recommendation: string | null;
      target_mean_price: number | null;
      target_high_price: number | null;
      target_low_price: number | null;
      number_of_analysts: number | null;
      current_price: number | null;
    };
    research_reports: Array<{
      date: string | null;
      firm: string | null;
      to_grade: string | null;
      from_grade: string | null;
      action: string | null;
    }>;
    earnings_calendar: Array<{
      label: string;
      value: string | number | null;
    }>;
    earnings_dates: Array<{
      date: string | null;
      eps_actual: number | null;
      eps_estimate: number | null;
      surprise_percent: number | null;
    }>;
    announcements: Array<{
      title: string | null;
      publisher: string | null;
      link: string | null;
      published_at: string | null;
      type: string | null;
    }>;
    curated_picks: Array<{
      ticker: string;
      name: string | null;
      recommendation: string | null;
      score: number | null;
      price: number | null;
      target_price: number | null;
      upside_percent: number | null;
    }>;
  } | null;
}

export interface UseExternalAnalystOptions {
  enabled?: boolean;
}

export function useExternalAnalyst(
  ticker: string | undefined,
  options?: UseExternalAnalystOptions
) {
  return useQuery<ExternalAnalystData>({
    queryKey: ["external-analyst", ticker],
    queryFn: async () => {
      if (!ticker) {
        throw new Error("Ticker is required");
      }

      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/stock-detail/${ticker}/analyst`);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to fetch external analyst data: ${res.status} ${errorText}`);
      }

      const envelope = await res.json();
      return envelope.data ?? envelope;
    },
    enabled: !!ticker && (options?.enabled !== false),
    staleTime: 1000 * 60 * 10, // 10 minutes (longer cache for external data)
    retry: 1, // Only retry once for slow external API
  });
}
