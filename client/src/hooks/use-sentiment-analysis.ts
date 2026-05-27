import { useQuery } from "@tanstack/react-query";
import { getAuthBaseUrl } from "@/lib/api-config";

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
  error?: "no_articles_found" | string;
}

export class SentimentAnalysisError extends Error {
  status?: number;
  code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "SentimentAnalysisError";
    this.status = status;
    this.code = code;
  }
}

function unwrapEnvelope(payload: any) {
  return payload?.data ?? payload;
}

function normalizeSentimentResponse(payload: any): SentimentAnalysisResponse {
  const data = unwrapEnvelope(payload);
  return {
    ticker: data?.ticker ?? "",
    articles: Array.isArray(data?.articles) ? data.articles : [],
    fundamentals: data?.fundamentals ?? {},
    price_data: data?.price_data ?? data?.priceData ?? [],
    price_error: data?.price_error ?? data?.priceError ?? null,
    error: data?.error,
  };
}

async function throwSentimentError(response: Response): Promise<never> {
  const payload = await response.json().catch(() => null);
  const message =
    payload?.message ||
    payload?.error ||
    payload?.detail ||
    `Failed to fetch sentiment analysis: ${response.status}`;
  throw new SentimentAnalysisError(message, response.status, payload?.code);
}

function streamSentimentResult(baseUrl: string, taskId: string, signal?: AbortSignal): Promise<SentimentAnalysisResponse> {
  return new Promise((resolve, reject) => {
    const streamUrl = `${baseUrl}/api/sentiment-analysis/stream/${encodeURIComponent(taskId)}`;
    const source = new EventSource(streamUrl);

    const cleanup = () => {
      source.close();
      signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(new DOMException("Sentiment analysis cancelled", "AbortError"));
    };

    signal?.addEventListener("abort", onAbort);

    source.onmessage = (event) => {
      let payload: any;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (payload?.type === "complete") {
        cleanup();
        const taskPayload = payload.data;
        if (taskPayload?.status === "error") {
          reject(new SentimentAnalysisError(taskPayload.error || "Sentiment analysis failed", 500));
          return;
        }
        resolve(normalizeSentimentResponse(taskPayload?.result ?? taskPayload));
      } else if (payload?.type === "error") {
        cleanup();
        reject(new SentimentAnalysisError(payload.error || "Sentiment analysis failed", 500));
      } else if (payload?.type === "cancelled") {
        cleanup();
        reject(new SentimentAnalysisError("Sentiment analysis was cancelled", 499));
      }
    };

    source.onerror = () => {
      cleanup();
      reject(new SentimentAnalysisError("Unable to load news right now. Try again.", 503));
    };
  });
}

export function useSentimentAnalysis(ticker: string | undefined) {
  const baseUrl = getAuthBaseUrl();

  return useQuery<SentimentAnalysisResponse>({
    queryKey: ["sentiment-analysis", ticker],
    queryFn: async ({ signal }) => {
      if (!ticker) {
        throw new Error("Ticker is required");
      }

      const response = await fetch(`${baseUrl}/api/sentiment-analysis/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
        signal, // Pass abort signal to cancel request on ticker change
      });

      if (!response.ok) {
        await throwSentimentError(response);
      }

      const startPayload = unwrapEnvelope(await response.json());
      if (startPayload?.status === "CACHED") {
        return normalizeSentimentResponse(startPayload.result);
      }

      if (!startPayload?.task_id) {
        return normalizeSentimentResponse(startPayload?.result ?? startPayload);
      }

      return streamSentimentResult(baseUrl, startPayload.task_id, signal);
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
