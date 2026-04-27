import { useRef, useState, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-config";
import { parseCoinError, type CoinError } from "@/lib/coin-error";

export interface BacktestProgress {
  phase: "fetching_data" | "computing_indicators" | "merging_indicators" | "optimizing";
  generation: number;
  total: number;
  best_fitness: number;
  elapsed: number;
}

export interface BacktestMetrics {
  total_profit: number | null;
  num_trades: number;
  calmar_ratio: number | null;
  max_dd: number | null;
  win_rate: number | null;
  profit_factor: number | null;
  avg_p: number | null;
  Worst_10: number | null;
}

export interface BacktestResult {
  condition: string;
  target_pct?: number;
  stop_pct?: number;
  metrics: BacktestMetrics;
  // Support both formats from backend
  cumulative?: number[];
  cumulative_dates?: string[];
  equity_curve?: Array<{ date: string; value: number }>;
  // Additional data
  candlestick_data?: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    entry?: boolean;
    entry_price?: number;
    exit?: boolean;
    exit_price?: number;
  }>;
  train_end_date?: string;
  train_end_index?: number;
  max_dd_idx?: string;
  max_drawdown_point?: { date: string; value: number | null };
  hybrid_mode?: boolean;
  compute_backend?: string;
  duration?: number;
}

export interface BacktestRequest {
  ticker: string;
  custom_rules?: string;
  mode: "standard" | "advanced";
  // For hybrid mode
  indicators_json?: string;
  compute_backend?: string;
}

type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

export function useStrategyBacktest() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [progress, setProgress] = useState<BacktestProgress | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coinError, setCoinError] = useState<CoinError | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const taskIdRef = useRef<string | null>(null);
  const abortedRef = useRef(false);
  const baseUrl = getApiBaseUrl();

  const runBacktest = useCallback(
    async (request: BacktestRequest) => {
      // Reset state
      setStatus("connecting");
      setProgress(null);
      setResult(null);
      setError(null);
      setIsRunning(true);
      setDuration(null);
      abortedRef.current = false;

      try {
        // Determine endpoint based on whether we have pre-computed indicators
        const isHybrid = request.indicators_json && request.compute_backend;
        const endpoint = isHybrid
          ? `${baseUrl}/api/strategy-backtest/hybrid/start`
          : `${baseUrl}/api/strategy-backtest/start`;

        // Build FormData (backend expects multipart/form-data)
        const formData = new FormData();
        formData.append("ticker", request.ticker);
        formData.append("custom_rules", request.custom_rules || "");
        formData.append("mode", request.mode);

        if (isHybrid) {
          formData.append("indicators_json", request.indicators_json!);
          formData.append("compute_backend", request.compute_backend!);
        }

        // Step 1: Start the backtest task
        const startResponse = await fetch(endpoint, {
          method: "POST",
          body: formData,
        });

        if (!startResponse.ok) {
          const errorData = await startResponse.json().catch(() => ({ detail: "Unknown error" }));
          const coinErr = parseCoinError(startResponse.status, errorData);
          if (coinErr) {
            setCoinError(coinErr);
            setIsRunning(false);
            return;
          }
          throw new Error(errorData.detail || `Failed to start backtest: ${startResponse.status}`);
        }

        const responseData = await startResponse.json();
        const task_id = responseData.data?.task_id ?? responseData.task_id;
        taskIdRef.current = task_id;

        // Step 2: Connect to SSE stream
        const eventSource = new EventSource(`${baseUrl}/api/strategy-backtest/stream/${task_id}`);
        eventSourceRef.current = eventSource;

        setStatus("connected");

        eventSource.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);

            switch (message.type) {
              case "connected":
                console.log("Backtest SSE connected:", message.task_id);
                break;

              case "progress":
                setProgress(message.data);
                break;

              case "complete":
                // Backtest complete
                setResult(message.data.result);
                setDuration(message.data.duration);
                setStatus("disconnected");
                setIsRunning(false);
                queryClient.invalidateQueries({ queryKey: ['usage-limits'] });
                eventSource.close();
                eventSourceRef.current = null;
                break;

              case "error":
                setError(message.error || "Unknown error occurred");
                setDuration(message.duration || null);
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
          console.error("Backtest SSE connection error");
          if (!abortedRef.current) {
            setError("Connection lost");
            setStatus("error");
          }
          setIsRunning(false);
          eventSource.close();
          eventSourceRef.current = null;
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start backtest");
        setStatus("error");
        setIsRunning(false);
      }
    },
    [baseUrl]
  );

  const cancelBacktest = useCallback(async () => {
    abortedRef.current = true;

    // Cancel the backend task
    if (taskIdRef.current) {
      try {
        await fetch(`${baseUrl}/api/strategy-backtest/cancel/${taskIdRef.current}`, {
          method: "POST",
        });
      } catch (err) {
        console.error("Failed to cancel backtest:", err);
      }
      taskIdRef.current = null;
    }

    // Close SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setStatus("disconnected");
    setIsRunning(false);
  }, [baseUrl]);

  // Reset state for a new run
  const reset = useCallback(() => {
    setStatus("idle");
    setProgress(null);
    setResult(null);
    setError(null);
    setIsRunning(false);
    setDuration(null);
  }, []);

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
  const getStateSnapshot = useCallback(() => {
    // Only return state if we have meaningful data
    if (!result && !error) return null;

    return {
      status: error ? "error" : isRunning ? "interrupted" : "completed",
      result,
      error,
      duration,
    };
  }, [result, error, isRunning, duration]);

  // Restore state from persistence (accepts generic stored state)
  const restoreFromStorage = useCallback(
    (state: {
      result?: BacktestResult | null;
      error?: string | null;
      duration?: number | null;
      status?: string;
    }) => {
      if (state.result) setResult(state.result);
      setError(state.error ?? null);
      setDuration(state.duration ?? null);
      setStatus(
        state.status === "completed"
          ? "disconnected"
          : state.status === "error"
            ? "error"
            : "idle"
      );
      setIsRunning(false);
      setProgress(null);
    },
    []
  );

  return {
    status,
    progress,
    result,
    error,
    coinError,
    isRunning,
    duration,
    runBacktest,
    cancelBacktest,
    reset,
    // Persistence methods
    getStateSnapshot,
    restoreFromStorage,
  };
}
