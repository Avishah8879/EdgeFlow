import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-config";

export interface SentimentArticle {
  title: string;
  desc: string;
  date: string;
  link: string;
  source: string;
  sentiment: {
    label: string;
    score: number;
  };
}

export interface SentimentFundamentals {
  "Market Cap": string;
  "P/E": string;
  "P/B": string;
  "Price": string;
}

export interface PriceDataPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface SentimentAnalysisResponse {
  ticker: string;
  articles: SentimentArticle[];
  fundamentals: SentimentFundamentals;
  price_data: PriceDataPoint[];
  price_error: string | null;
}

export function useSentimentAnalysis(ticker: string | undefined) {
  const baseUrl = getApiBaseUrl();

  return useQuery<SentimentAnalysisResponse>({
    queryKey: ["sentiment-analysis", ticker],
    queryFn: async ({ signal }) => {
      if (!ticker) {
        throw new Error("Ticker is required");
      }

      const response = await fetch(`${baseUrl}/api/sentiment-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
        signal, // Pass abort signal to cancel request on ticker change
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch sentiment analysis: ${response.status}`);
      }

      const envelope = await response.json();
      return envelope.data ?? envelope;
    },
    enabled: !!ticker,
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
    gcTime: 30 * 60 * 1000,    // Keep in cache for 30 minutes
    placeholderData: (previousData) => {
      // Only keep previous data if it's for the same ticker
      return previousData?.ticker === ticker ? previousData : undefined;
    },
    retry: 1,
  });
}
