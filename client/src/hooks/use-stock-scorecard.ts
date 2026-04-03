import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-config";

/**
 * Single score dimension with label, explanation, and supporting metrics.
 */
export interface ScoreDimension {
  label: string;
  explanation: string;
  metrics: Record<string, number | null>;
  confidence?: number;
}

/**
 * Full scorecard response from the API.
 */
export interface StockScorecardData {
  ticker: string;
  sector: string | null;
  current_price: number | null;
  scores: {
    valuation: ScoreDimension;
    profitability: ScoreDimension;
    growth: ScoreDimension;
    financial_health: ScoreDimension;
    business_quality: ScoreDimension;
    momentum: ScoreDimension;
    entry_rating: ScoreDimension;
  } | null;
  data_availability: {
    fundamentals: boolean;
    sector_medians: boolean;
    price_history: number;
    income_statement: boolean;
  };
  calculated_at?: string;
  error?: string;
}

/**
 * Hook to fetch the 7-dimension stock scorecard.
 *
 * Fetches scorecard data including:
 * - Valuation (vs sector medians)
 * - Profitability (ROE, ROA, NPM)
 * - Growth (2Y Revenue & Net Income CAGR)
 * - Financial Health (D/E, Interest Coverage)
 * - Business Quality (ROE + Margin combo)
 * - Momentum (1-year return)
 * - Entry Rating (Price vs MA200, RSI, 52W high)
 *
 * @param ticker - Stock symbol (e.g., "RELIANCE.NS")
 * @returns Query result with scorecard data
 */
export function useStockScorecard(ticker: string | undefined) {
  return useQuery<StockScorecardData>({
    queryKey: ["stock-scorecard", ticker],
    queryFn: async () => {
      if (!ticker) {
        throw new Error("Ticker is required");
      }

      const baseUrl = getApiBaseUrl();
      const res = await fetch(
        `${baseUrl}/api/stock-scorecard/${encodeURIComponent(ticker)}`
      );

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `Failed to fetch stock scorecard: ${res.status} ${errorText}`
        );
      }

      const envelope = await res.json();
      return envelope.data ?? envelope;
    },
    enabled: !!ticker,
    staleTime: 1000 * 60 * 30, // 30 minutes (data is cached on server too)
    gcTime: 1000 * 60 * 60, // 1 hour garbage collection
    retry: 2,
  });
}

/**
 * Helper function to get color class based on score label.
 * Maps scorecard labels to theme-aware Tailwind classes.
 */
export function getScorecardLabelColor(label: string): string {
  const labelLower = label.toLowerCase();

  // Positive labels
  if (
    labelLower === "undervalued" ||
    labelLower === "high" ||
    labelLower === "strong" ||
    labelLower === "excellent" ||
    labelLower === "good"
  ) {
    return "bg-positive/20 text-positive border-positive/30";
  }

  // Negative labels
  if (
    labelLower === "overvalued" ||
    labelLower === "low" ||
    labelLower === "weak" ||
    labelLower === "bad"
  ) {
    return "bg-negative/20 text-negative border-negative/30";
  }

  // Neutral labels (Fair, Average, Neutral, Unknown)
  return "bg-neutral/20 text-neutral border-neutral/30";
}

/**
 * Helper function to format dimension key to display label.
 */
export function formatDimensionLabel(key: string): string {
  const labels: Record<string, string> = {
    valuation: "Valuation",
    profitability: "Profitability",
    growth: "Growth",
    financial_health: "Financial Health",
    business_quality: "Business Quality",
    momentum: "Momentum",
    entry_rating: "Entry Rating",
  };
  return labels[key] || key;
}
