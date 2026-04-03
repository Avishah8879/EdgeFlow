import { useState, useCallback, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

// Types for portfolio optimization
export interface PortfolioHolding {
  symbol: string;
  name?: string;
  quantity: number;
}

export interface OptimizationParams {
  holdings: PortfolioHolding[];
  risk_free_rate?: number;
  max_weight?: number;
  rebalance_frequency?: "D" | "W" | "M";
  lookback_period?: "1y" | "2y" | "5y";
}

export interface PortfolioMetrics {
  holdings: Array<{
    symbol: string;
    name: string;
    quantity: number;
    weight: number;
  }>;
  expected_return: number;
  volatility: number;
  sharpe_ratio: number;
}

export interface RebalancingItem {
  symbol: string;
  name: string;
  action: "BUY" | "SELL" | "HOLD";
  change_shares: number;
}

export interface WeightComparison {
  symbol: string;
  current_weight: number;
  optimal_weight: number;
  change: number;
}

export interface EfficientFrontierPoint {
  volatility: number;
  return: number;
}

export interface EquityCurvePoint {
  date: string;
  value: number;
}

export interface RollingWeightPoint {
  date: string;
  [symbol: string]: string | number; // Dynamic keys for each symbol
}

export interface OptimizationResult {
  weight_comparison: WeightComparison[];
  efficient_frontier: EfficientFrontierPoint[];
  equity_curve: EquityCurvePoint[];
  rolling_weights: RollingWeightPoint[];
  rolling_weight_symbols: string[];
  tangency_point: { volatility: number; return: number };
  current_point: { volatility: number; return: number };
  capital_market_line: {
    start: { volatility: number; return: number };
    end: { volatility: number; return: number };
  };
  risk_free_rate: number;
  optimal_rebalance_frequency: string;
  oos_start: string; // OOS start date for train/test split line
  computed_at: string;
  job_id?: string;
  status?: string;
}

interface JobStatus {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed";
  ready: boolean;
  result?: OptimizationResult;
  error?: string;
}

interface SubmitResponse {
  job_id: string;
  status: string;
  holdings_count: number;
  submitted_at: string;
}

async function submitOptimization(
  params: OptimizationParams
): Promise<SubmitResponse> {
  const response = await fetch("/api/portfolio/optimize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      holdings: params.holdings.map((h) => ({
        symbol: h.symbol,
        quantity: h.quantity,
      })),
      risk_free_rate: params.risk_free_rate ?? 0.068,
      max_weight: params.max_weight ?? 0.3,
      rebalance_frequency: params.rebalance_frequency ?? "M",
      lookback_period: params.lookback_period ?? "2y",
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to submit optimization job");
  }

  const json = await response.json();
  return json.data || json;
}

async function fetchJobStatus(jobId: string): Promise<JobStatus> {
  const response = await fetch(`/api/jobs/${jobId}`);
  if (!response.ok) {
    throw new Error("Failed to fetch job status");
  }
  const json = await response.json();
  return json.data || json;
}

export function usePortfolioOptimizer() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: submitOptimization,
    onSuccess: (data) => {
      setJobId(data.job_id);
      setIsPolling(true);
      setResult(null);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Submission failed");
      setIsPolling(false);
    },
  });

  // Job status query (only enabled when polling)
  const jobStatusQuery = useQuery<JobStatus>({
    queryKey: ["job-status", jobId],
    queryFn: () => fetchJobStatus(jobId!),
    enabled: !!jobId && isPolling,
    refetchInterval: isPolling ? 2000 : false, // Poll every 2 seconds
    staleTime: 0,
  });

  // Handle job completion
  useEffect(() => {
    if (jobStatusQuery.data) {
      const status = jobStatusQuery.data;

      if (status.status === "completed" && status.result) {
        setResult(status.result);
        setIsPolling(false);
        setError(null);
      } else if (status.status === "failed") {
        setError(status.error || "Optimization failed");
        setIsPolling(false);
        setResult(null);
      }
    }
  }, [jobStatusQuery.data]);

  // Handle query error
  useEffect(() => {
    if (jobStatusQuery.error) {
      setError(
        jobStatusQuery.error instanceof Error
          ? jobStatusQuery.error.message
          : "Failed to check job status"
      );
      setIsPolling(false);
    }
  }, [jobStatusQuery.error]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const submit = useCallback(
    (params: OptimizationParams) => {
      setError(null);
      setResult(null);
      submitMutation.mutate(params);
    },
    [submitMutation]
  );

  const reset = useCallback(() => {
    setJobId(null);
    setIsPolling(false);
    setResult(null);
    setError(null);
    submitMutation.reset();
  }, [submitMutation]);

  return {
    submit,
    reset,
    isSubmitting: submitMutation.isPending,
    isPolling,
    jobId,
    jobStatus: jobStatusQuery.data?.status ?? null,
    result,
    error,
    // Computed states
    isLoading: submitMutation.isPending || isPolling,
    isSuccess: !!result,
    isError: !!error,
  };
}
