import { useRef, useState, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-config";

export interface FundamentalResult {
  symbol: string;
  companyName: string;
  sector: string;
  industry: string;
  fundamentals: Record<string, number | null>;
}

export interface FundamentalProgress {
  processed: number;
  total: number;
  matches: number;
}

export interface FundamentalSummary {
  expression: string;
  matched: number;
  universe: number;
  results: FundamentalResult[];
  fundamental_columns: string[];
}

type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

export function useFundamentalScreener() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [progress, setProgress] = useState<FundamentalProgress | null>(null);
  const [results, setResults] = useState<FundamentalResult[]>([]);
  const [summary, setSummary] = useState<FundamentalSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const abortedRef = useRef(false);
  const baseUrl = getApiBaseUrl();

  const runScreener = useCallback(
    async (expression: string) => {
      setStatus("connecting");
      setProgress(null);
      setResults([]);
      setSummary(null);
      setError(null);
      setIsRunning(true);
      abortedRef.current = false;

      try {
        const startResponse = await fetch(`${baseUrl}/api/fundamental-screener/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expression }),
        });

        if (!startResponse.ok) {
          const errorData = await startResponse.json().catch(() => ({ detail: "Unknown error" }));
          throw new Error(errorData.detail || `Failed to start screener: ${startResponse.status}`);
        }

        const responseData = await startResponse.json();
        const job_id = responseData.data?.job_id ?? responseData.job_id;
        jobIdRef.current = job_id;

        // SSE stream goes directly to Python backend (same as expert screener)
        const eventSource = new EventSource(`${baseUrl}/api/fundamental-screener/stream/${job_id}`);
        eventSourceRef.current = eventSource;

        setStatus("connected");

        eventSource.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);

            switch (message.type) {
              case "connected":
                break;

              case "loading":
                break;

              case "progress":
                setProgress(message.data);
                break;

              case "result":
                setResults((prev) => [...prev, message.data as FundamentalResult]);
                break;

              case "complete":
                setSummary(message.data);
                setStatus("disconnected");
                setIsRunning(false);
                queryClient.invalidateQueries({ queryKey: ["usage-limits"] });
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
    [baseUrl, queryClient],
  );

  const cancelScreener = useCallback(async () => {
    abortedRef.current = true;

    if (jobIdRef.current) {
      try {
        await fetch(`${baseUrl}/api/fundamental-screener/cancel/${jobIdRef.current}`, {
          method: "POST",
        });
      } catch (err) {
        console.error("Failed to cancel screener:", err);
      }
      jobIdRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setStatus("disconnected");
    setIsRunning(false);
  }, [baseUrl]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  return {
    status,
    progress,
    results,
    summary,
    error,
    isRunning,
    runScreener,
    cancelScreener,
  };
}
