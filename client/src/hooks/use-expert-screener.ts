import { useRef, useState, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { PersistedScreenerState } from "@/lib/result-storage";
import { getApiBaseUrl } from "@/lib/api-config";
import { parseCoinError, type CoinError } from "@/lib/coin-error";

export interface ExpertScreenerResult {
  symbol: string;
  close: number;
  volume: number;
  liquidity: number;
  as_of: string;
  indicators: Record<string, number | null>;
}

export interface ExpertScreenerProgress {
  processed: number;
  total: number;
  matches: number;
}

export interface ExpertScreenerLoading {
  loaded: number;
  total: number;
}

export interface ExpertScreenerSummary {
  expression: string;
  generated_at: string;
  matched: number;
  universe: number;
  missing_symbols: string[];
  results: ExpertScreenerResult[];
  indicator_columns: string[];
}

export interface ExpertScreenerRequest {
  expression: string;
  symbols?: string[];
  period?: string;
}

type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

// Known base fields that should NOT be treated as indicators
const BASE_FIELDS = new Set(["symbol", "close", "volume", "liquidity", "as_of", "open", "high", "low", "indicators"]);

/**
 * Transform backend result to structured frontend format.
 *
 * Backend sends TWO different formats depending on the code path:
 * 1. OHLC path (nested): { symbol, close, volume, liquidity, indicators: { sma_50: 123, rsi_14: 55, ... } }
 * 2. Cache-first path (flat): { symbol, close, volume, liquidity, sma_50: 123, rsi_14: 55, ... }
 *
 * Frontend expects: { symbol, close, volume, liquidity, indicators: { sma_50: 123, rsi_14: 55, ... } }
 */
function transformResult(raw: Record<string, any>): ExpertScreenerResult {
  let indicators: Record<string, number | null> = {};

  // Check if indicators are already nested (OHLC path format)
  if (raw.indicators && typeof raw.indicators === "object" && !Array.isArray(raw.indicators)) {
    // Use the nested indicators object directly
    indicators = { ...raw.indicators };
  } else {
    // Extract all non-base fields as indicators (cache-first path format)
    for (const [key, value] of Object.entries(raw)) {
      if (!BASE_FIELDS.has(key) && typeof value === "number") {
        indicators[key] = value;
      }
    }
  }

  return {
    symbol: raw.symbol || "",
    close: raw.close ?? 0,
    volume: raw.volume ?? 0,
    liquidity: raw.liquidity ?? 0,
    as_of: raw.as_of || new Date().toISOString(),
    indicators,
  };
}

export function useExpertScreener() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [loading, setLoading] = useState<ExpertScreenerLoading | null>(null);
  const [progress, setProgress] = useState<ExpertScreenerProgress | null>(null);
  const [results, setResults] = useState<ExpertScreenerResult[]>([]);
  const [summary, setSummary] = useState<ExpertScreenerSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coinError, setCoinError] = useState<CoinError | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const abortedRef = useRef(false);
  const baseUrl = getApiBaseUrl();

  const runScreener = useCallback(
    async (request: ExpertScreenerRequest) => {
      // Reset state
      setStatus("connecting");
      setLoading(null);
      setProgress(null);
      setResults([]);
      setSummary(null);
      setError(null);
      setIsRunning(true);
      abortedRef.current = false;

      try {
        // Step 1: Start the screening task
        const startResponse = await fetch(`${baseUrl}/api/expert-screener/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });

        if (!startResponse.ok) {
          const errorData = await startResponse.json().catch(() => ({ detail: "Unknown error" }));
          const coinErr = parseCoinError(startResponse.status, errorData);
          if (coinErr) {
            setCoinError(coinErr);
            setStatus("idle");
            setIsRunning(false);
            return;
          }
          throw new Error(errorData.detail || `Failed to start screener: ${startResponse.status}`);
        }

        const responseData = await startResponse.json();
        const job_id = responseData.data?.job_id ?? responseData.job_id;
        jobIdRef.current = job_id;

        // Step 2: Connect to SSE stream
        const eventSource = new EventSource(`${baseUrl}/api/expert-screener/stream/${job_id}`);
        eventSourceRef.current = eventSource;

        setStatus("connected");

        eventSource.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);

            switch (message.type) {
              case "connected":
                console.log("SSE connected:", message.job_id);
                break;

              case "loading":
                // Data loading phase (pre-fetch)
                setLoading(message.data);
                break;

              case "progress":
                // Clear loading state when processing starts
                setLoading(null);
                setProgress(message.data);
                break;

              case "result":
                // Add result to list (transform flat backend format to structured format)
                setResults((prev) => [...prev, transformResult(message.data)]);
                break;

              case "complete":
                // Screening complete
                setSummary(message.data);
                setStatus("disconnected");
                setIsRunning(false);
                queryClient.invalidateQueries({ queryKey: ['usage-limits'] });
                eventSource.close();
                eventSourceRef.current = null;
                break;

              case "error":
                setError(message.error || "Unknown error occurred");
                setStatus("error");
                setIsRunning(false);
                eventSource.close();
                eventSourceRef.current = null;
                break;
            }
          } catch (err) {
            console.error("Failed to parse SSE message:", err);
          }
        };

        eventSource.onerror = () => {
          console.error("SSE connection error");
          if (!abortedRef.current) {
            setError("Connection lost");
            setStatus("error");
          }
          setIsRunning(false);
          eventSource.close();
          eventSourceRef.current = null;
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start screener");
        setStatus("error");
        setIsRunning(false);
      }
    },
    [baseUrl]
  );

  const cancelScreener = useCallback(async () => {
    abortedRef.current = true;

    // Cancel the backend task
    if (jobIdRef.current) {
      try {
        await fetch(`${baseUrl}/api/expert-screener/cancel/${jobIdRef.current}`, {
          method: "POST",
        });
      } catch (err) {
        console.error("Failed to cancel screener:", err);
      }
      jobIdRef.current = null;
    }

    // Close SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setStatus("disconnected");
    setIsRunning(false);
  }, [baseUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  // Get current state for persistence (called by page component)
  const getStateSnapshot = useCallback((): Omit<
    PersistedScreenerState,
    "version" | "timestamp" | "expression"
  > | null => {
    // Only return state if we have meaningful data
    if (results.length === 0 && !error) return null;

    return {
      status: error ? "error" : isRunning ? "interrupted" : "completed",
      results,
      summary,
      error,
    };
  }, [results, summary, error, isRunning]);

  // Restore state from persistence
  const restoreFromStorage = useCallback(
    (state: PersistedScreenerState) => {
      setResults(state.results);
      setSummary(state.summary);
      setError(state.error);
      setStatus(
        state.status === "completed"
          ? "disconnected"
          : state.status === "error"
            ? "error"
            : "idle"
      );
      setIsRunning(false);
      setLoading(null);
      setProgress(null);
    },
    []
  );

  // Reset state (for starting fresh)
  const reset = useCallback(() => {
    setStatus("idle");
    setLoading(null);
    setProgress(null);
    setResults([]);
    setSummary(null);
    setError(null);
    setCoinError(null);
    setIsRunning(false);
  }, []);

  return {
    status,
    loading,
    progress,
    results,
    summary,
    error,
    coinError,
    isRunning,
    runScreener,
    cancelScreener,
    // Persistence methods
    getStateSnapshot,
    restoreFromStorage,
    reset,
  };
}
