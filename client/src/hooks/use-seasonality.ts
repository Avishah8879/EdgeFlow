import { useQuery } from "@tanstack/react-query";

export interface WeeklyStat {
  week: number;
  avg_return: number;
  median_return: number;
  win_rate: number;
  std_dev: number;
  min_return: number;
  max_return: number;
  count: number;
}

export interface MonthlyStat {
  month: number;
  month_name: string;
  avg_return: number;
  median_return: number;
  win_rate: number;
  std_dev: number;
  count: number;
}

export interface YearlyHeatmapEntry {
  year: number;
  weeks: Record<number, number>;
}

export interface SeasonalitySummary {
  ticker: string;
  company_name: string;
  data_range: { start: string; end: string };
  total_weeks: number;
  years_covered: number;
  overall_avg_weekly_return: number;
  best_week: number | null;
  worst_week: number | null;
  best_month: number | null;
  worst_month: number | null;
}

export interface SeasonalityData {
  weekly_stats: WeeklyStat[];
  monthly_stats: MonthlyStat[];
  yearly_heatmap: YearlyHeatmapEntry[];
  summary: SeasonalitySummary;
}

export function useSeasonality(ticker: string | undefined) {
  return useQuery<SeasonalityData>({
    queryKey: ["seasonality", ticker],
    queryFn: async () => {
      if (!ticker) throw new Error("Ticker required");
      const res = await fetch(
        `/api/seasonality/${encodeURIComponent(ticker)}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`${res.status}: ${text}`);
      }
      const envelope = await res.json();
      return envelope.data ?? envelope;
    },
    enabled: !!ticker,
    staleTime: 1000 * 60 * 30,
    retry: 2,
  });
}
