import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EquityCurveChart } from "@/components/strategy-backtest/EquityCurveChart";
import { SEO } from "@/components/SEO";
import { PAGE_SEO } from "@/lib/seo-config";
import {
  generateFAQSchema,
  generateSoftwareApplicationSchema,
  generateHowToSchema,
  BACKTESTING_FAQS,
  BACKTESTING_HOWTO,
} from "@/lib/json-ld";
import {
  getBacktestResultByKey,
  setBacktestResultWithKey,
  clearBacktestResultByKey,
} from "@/lib/result-storage";
import {
  shouldRestoreState,
  shouldClearState,
  clearUrlParams,
  getHistoryStateKey,
  setHistoryStateKey,
  clearHistoryStateKey,
} from "@/lib/navigation-tracker";
import { useUrlState } from "@/hooks/use-url-state";
import {
  BacktestCandlestickChart,
  type BacktestCandlestickBar,
} from "@/components/strategy-backtest/BacktestCandlestickChart";
import { TickerCombobox } from "@/components/strategy-backtest/TickerCombobox";
import { BacktestProgress } from "@/components/strategy-backtest/BacktestProgress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Play,
  AlertCircle,
  AlertTriangle,
  BarChart3,
  FileUp,
  Code2,
  Sparkles,
  Copy,
  Check,
  Bookmark,
  FolderOpen,
  Loader2,
} from "lucide-react";
import { Link } from "wouter";
import { useHourlyTickerOptions } from "@/hooks/use-hourly-ticker-options";
import { useStrategyBacktest } from "@/hooks/use-strategy-backtest";
import { useSaveBacktestResult } from "@/hooks/use-saved-results";
import { useEffect, useRef, useState } from "react";
import { useSearch } from "wouter";
import { useTracking } from "@/contexts/TrackingContext";
import { useMutation } from "@tanstack/react-query";
import type { BacktestResult } from "../../../shared/schema";
import { toast } from "sonner";
import { UsageLimitBadge } from "@/components/UsageLimitBadge";
import { useUsageLimits, getTimeUntilReset } from "@/hooks/use-usage-limits";
import { getApiBaseUrl } from "@/lib/api-config";

type AdvancedOptimizationResult = {
  // Core data (same as BacktestResult)
  condition?: string;
  target_pct?: number | null;
  stop_pct?: number | null;
  metrics?: BacktestResult["metrics"];
  equity_curve?: Array<{ date: string; value: number }>;
  candlestick_data?: BacktestCandlestickBar[];
  train_end_date?: string;
  train_end_index?: number;
  max_drawdown_point?: { date: string; value: number | null };
  duration?: number;
};

export default function StrategyBacktesting() {
  const [selectedTicker, setSelectedTicker] = useState<string>("");
  const [customRules, setCustomRules] = useState("");
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [pineScript, setPineScript] = useState<string | null>(null);
  const [advancedResult, setAdvancedResult] =
    useState<AdvancedOptimizationResult | null>(null);
  const [advancedPineScript, setAdvancedPineScript] = useState<string | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // State persistence tracking
  // Track which history key we've already processed (prevents re-processing same entry)
  const lastProcessedHistoryKeyRef = useRef<string | null>(null);
  const [wasInterrupted, setWasInterrupted] = useState(false);
  // Track which ticker the current result belongs to (prevents saving mismatched data)
  const [resultTicker, setResultTicker] = useState<string>("");
  const tickerRef = useRef(selectedTicker);
  const customRulesRef = useRef(customRules);
  tickerRef.current = selectedTicker;
  customRulesRef.current = customRules;
  // Track running state via ref for unmount detection (avoids stale closure issues)
  const isBacktestRunningRef = useRef(false);
  const backtestModeRef = useRef<"standard" | "advanced">("standard");

  // Feature usage tracking
  const { trackFeature } = useTracking();
  const backtestStartTimeRef = useRef<number | null>(null);
  const trackedResultKeyRef = useRef<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [copied, setCopied] = useState(false);
  const [advancedCopied, setAdvancedCopied] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [useAsyncMode, setUseAsyncMode] = useState(true); // Use Celery async mode for ticker-based backtests
  const tickersQuery = useHourlyTickerOptions();
  const tickerOptions = tickersQuery.data ?? [];
  const gradioBaseUrl = getApiBaseUrl();

  // Async backtest hook for Celery-based processing (ticker mode only)
  const asyncBacktest = useStrategyBacktest();

  // Save result mutation
  const saveResultMutation = useSaveBacktestResult();

  // Usage limits for enforcement
  const { data: usageLimits } = useUsageLimits();

  // Read ticker from URL query params (e.g., ?ticker=RELIANCE)
  const searchString = useSearch();

  // URL state synchronization for ticker
  const { syncToUrl: syncTickerToUrl } = useUrlState({
    param: "ticker",
    value: selectedTicker,
    setValue: setSelectedTicker,
  });

  // Sync ticker to URL when it changes
  useEffect(() => {
    if (selectedTicker) {
      syncTickerToUrl(selectedTicker);
    }
  }, [selectedTicker, syncTickerToUrl]);

  // Pre-select ticker from URL when component mounts or tickerOptions load
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const tickerFromUrl = params.get("ticker");

    if (tickerFromUrl && tickerOptions.length > 0 && !selectedTicker) {
      // Check if the ticker exists in available options
      const exists = tickerOptions.some(
        (opt) => opt.symbol.toUpperCase() === tickerFromUrl.toUpperCase()
      );
      if (exists) {
        setSelectedTicker(tickerFromUrl.toUpperCase());
      }
    }
  }, [searchString, tickerOptions, selectedTicker]);

  // Restore from sessionStorage on mount or browser back/forward
  // Uses history key tracking instead of boolean flag to handle repeated mounts correctly
  useEffect(() => {
    const HISTORY_KEY = "backtestResultKey";

    const attemptRestore = () => {
      // Get current history state key - this is unique per browser history entry
      const currentHistoryKey = getHistoryStateKey(HISTORY_KEY);

      // Check if we should clear state (navbar click = fresh start)
      if (shouldClearState()) {
        clearHistoryStateKey(HISTORY_KEY);
        clearUrlParams();
        lastProcessedHistoryKeyRef.current = null;
        return;
      }

      // Check if this is a back/forward navigation or reload with state
      const isBackForward = shouldRestoreState();

      if (!isBackForward) {
        return;
      }

      // If no history key, nothing to restore
      if (!currentHistoryKey) {
        return;
      }

      // If we've already processed this exact history key, skip
      // (This handles cases where the component remounts during transitions)
      if (lastProcessedHistoryKeyRef.current === currentHistoryKey) {
        return;
      }

      // Mark this history key as processed
      lastProcessedHistoryKeyRef.current = currentHistoryKey;

      const stored = getBacktestResultByKey(currentHistoryKey);
      if (!stored) return;

      // Check if URL has a different ticker - URL takes priority
      const params = new URLSearchParams(window.location.search);
      const urlTicker = params.get("ticker");
      if (urlTicker && urlTicker.toUpperCase() !== stored.ticker.toUpperCase()) {
        return;
      }

      // Restore ticker, customRules, and results
      setSelectedTicker(stored.ticker);
      setCustomRules(stored.customRules);
      // Track that this result belongs to the stored ticker
      setResultTicker(stored.ticker);
      if (stored.status === "interrupted") {
        setWasInterrupted(true);
      }

      // Restore results based on mode
      if (stored.mode === "advanced" && stored.advancedResult) {
        setAdvancedResult(stored.advancedResult as AdvancedOptimizationResult);
        setResult(null);
      } else if (stored.result) {
        setResult(stored.result as BacktestResult);
        setAdvancedResult(null);
      }
    };

    // Run on mount
    attemptRestore();

    // Also listen for popstate (browser back/forward while component is mounted)
    const handlePopState = () => {
      // Small delay to let navigation-tracker process the event first
      setTimeout(attemptRestore, 0);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Smooth scroll to results when they appear
  useEffect(() => {
    if ((result || advancedResult) && resultsRef.current) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    }
  }, [result, advancedResult]);

  // Handle async backtest results when they complete
  useEffect(() => {
    if (asyncBacktest.result && asyncBacktest.status === "disconnected") {
      // Convert async result to local format
      const asyncResult = asyncBacktest.result;

      // Determine if this was an advanced (TPSL) optimization based on target_pct/stop_pct presence
      const isAdvanced =
        asyncResult.target_pct !== undefined &&
        asyncResult.stop_pct !== undefined;

      // Build equity curve - support both formats
      // Backend now sends: equity_curve AND cumulative/cumulative_dates
      let equityCurve: Array<{ date: string; value: number }> = [];
      if (asyncResult.equity_curve && Array.isArray(asyncResult.equity_curve)) {
        equityCurve = asyncResult.equity_curve;
      } else if (asyncResult.cumulative_dates && asyncResult.cumulative) {
        const cumulativeValues = asyncResult.cumulative;
        equityCurve = asyncResult.cumulative_dates.map(
          (date: string, i: number) => ({
            date,
            value: cumulativeValues[i],
          })
        );
      }

      if (isAdvanced) {
        setAdvancedResult({
          condition: asyncResult.condition,
          target_pct: asyncResult.target_pct,
          stop_pct: asyncResult.stop_pct,
          metrics: asyncResult.metrics,
          equity_curve: equityCurve,
          candlestick_data: asyncResult.candlestick_data || [],
          train_end_date: asyncResult.train_end_date || "",
          train_end_index: asyncResult.train_end_index,
          max_drawdown_point: asyncResult.max_drawdown_point,
          duration: asyncBacktest.duration ?? undefined,
        });
        setResult(null);
        // Track which ticker this result belongs to
        setResultTicker(selectedTicker);
        toast.success("Advanced Optimization Complete", {
          description: `Completed in ${asyncBacktest.duration?.toFixed(1)}s`,
        });
      } else {
        // Standard result - map to BacktestResult format
        setResult({
          condition: asyncResult.condition,
          metrics: asyncResult.metrics,
          equity_curve: equityCurve,
          candlestick_data: asyncResult.candlestick_data || [],
          duration: asyncBacktest.duration ?? 0,
          train_end_date: asyncResult.train_end_date || "",
          train_end_index: asyncResult.train_end_index,
          max_drawdown_point: asyncResult.max_drawdown_point,
        } as BacktestResult);
        setAdvancedResult(null);
        // Track which ticker this result belongs to
        setResultTicker(selectedTicker);
        toast.success("Optimization Complete", {
          description: `Found strategy with ${
            asyncResult.metrics.num_trades
          } trades in ${asyncBacktest.duration?.toFixed(1)}s`,
        });
      }

      setPineScript(null);
      setAdvancedPineScript(null);
      asyncBacktest.reset();
    }
  }, [asyncBacktest.result, asyncBacktest.status, asyncBacktest.duration]);

  // Handle async backtest errors
  useEffect(() => {
    if (asyncBacktest.error && asyncBacktest.status === "error") {
      toast.error("Optimization Failed", {
        description: asyncBacktest.error,
      });
    }
  }, [asyncBacktest.error, asyncBacktest.status]);

  // Track feature usage when backtest completes successfully
  useEffect(() => {
    const currentResult = result || advancedResult;
    if (!currentResult || !selectedTicker) return;

    // Create unique key to prevent duplicate tracking
    const isAdvanced = advancedResult !== null;
    const resultKey = `${selectedTicker}-${isAdvanced ? 'advanced' : 'standard'}-${currentResult.metrics?.total_profit ?? 0}`;

    // Skip if already tracked this result
    if (trackedResultKeyRef.current === resultKey) return;
    trackedResultKeyRef.current = resultKey;

    const executionTime = backtestStartTimeRef.current
      ? Date.now() - backtestStartTimeRef.current
      : undefined;

    trackFeature(
      "backtest",
      {
        ticker: selectedTicker,
        mode: isAdvanced ? "advanced" : "standard",
        customRules: customRules || undefined,
      },
      {
        summary: currentResult.metrics ? { ...currentResult.metrics } : undefined,
        executionTimeMs: executionTime,
        success: true,
      }
    );
  }, [result, advancedResult, selectedTicker, customRules, trackFeature]);

  // Auto-detect input type based on what user has provided
  const getSelectedInputType = (): "ticker" | "csv" | "none" => {
    if (selectedFile) return "csv";
    if (selectedTicker) return "ticker";
    return "none";
  };

  const inputType = getSelectedInputType();
  const strategyApiUrl =
    inputType === "ticker"
      ? `${gradioBaseUrl}/api/strategy-backtest/ticker`
      : `${gradioBaseUrl}/api/strategy-backtest`;
  const advancedStrategyApiUrl =
    inputType === "ticker"
      ? `${gradioBaseUrl}/api/strategy-backtest/advanced/ticker`
      : `${gradioBaseUrl}/api/strategy-backtest/advanced`;

  const submitOptimizationRequest = async <T,>(
    endpoint: string,
    formData: FormData
  ): Promise<T> => {
    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });

    const rawText = await response.text();
    if (!response.ok) {
      let message = `Failed to run optimization (${response.status})`;
      if (rawText) {
        try {
          const errorPayload = JSON.parse(rawText);
          message =
            errorPayload?.detail ||
            errorPayload?.error ||
            errorPayload?.message ||
            message;
        } catch {
          message = rawText;
        }
      }
      throw new Error(message);
    }

    try {
      return JSON.parse(rawText) as T;
    } catch {
      throw new Error("Received invalid response from strategy service");
    }
  };

  const backtestMutation = useMutation({
    mutationFn: async (formData: FormData): Promise<BacktestResult> =>
      submitOptimizationRequest<BacktestResult>(strategyApiUrl, formData),
    onSuccess: (data) => {
      setResult(data);
      setPineScript(null);
      setAdvancedResult(null);
      setAdvancedPineScript(null);
      // Track which ticker this result belongs to
      setResultTicker(selectedTicker);
      toast.success("Optimization Complete", {
        description: `Found best strategy with ${
          data.metrics.num_trades
        } trades and ${
          data.metrics.total_profit != null
            ? data.metrics.total_profit.toFixed(2)
            : "0.00"
        }% PnL`,
      });
    },
    onError: (error: any) => {
      setResult(null);
      setPineScript(null);
      setAdvancedPineScript(null);
      toast.error("Optimization Failed", {
        description: error?.message || "Failed to run backtest",
      });
    },
  });
  const advancedBacktestMutation = useMutation({
    mutationFn: async (
      formData: FormData
    ): Promise<AdvancedOptimizationResult> =>
      submitOptimizationRequest<AdvancedOptimizationResult>(
        advancedStrategyApiUrl,
        formData
      ),
    onSuccess: (data) => {
      setAdvancedResult(data);
      setResult(null);
      setPineScript(null);
      setAdvancedPineScript(null);
      // Track which ticker this result belongs to
      setResultTicker(selectedTicker);
      toast.success("Advanced Optimization Complete", {
        description: "Results generated using TPSL optimizer.",
      });
    },
    onError: (error: any) => {
      setAdvancedResult(null);
      setPineScript(null);
      setAdvancedPineScript(null);
      toast.error("Advanced Optimization Failed", {
        description: error?.message || "Failed to run advanced backtest",
      });
    },
  });
  const isOptimizationRunning =
    backtestMutation.isPending ||
    advancedBacktestMutation.isPending ||
    asyncBacktest.isRunning;

  // Sync running state to ref for unmount detection (avoids stale closure issues)
  isBacktestRunningRef.current = isOptimizationRunning;
  backtestModeRef.current = advancedBacktestMutation.isPending ? "advanced" : "standard";

  // Persist results when backtest completes
  useEffect(() => {
    const currentResult = result || advancedResult;
    const HISTORY_KEY = "backtestResultKey";

    // Only persist when:
    // 1. We have a result
    // 2. The result belongs to the currently selected ticker (prevents saving mismatched data)
    // 3. We're not currently running an optimization
    if (currentResult && resultTicker && selectedTicker === resultTicker && !isOptimizationRunning) {
      const isAdvanced = advancedResult !== null;

      // Save with unique key and store key in history.state
      const resultKey = setBacktestResultWithKey({
        ticker: resultTicker,
        customRules,
        mode: isAdvanced ? "advanced" : "standard",
        status: "completed",
        result: result,
        advancedResult: advancedResult,
        error: null,
        duration: currentResult.duration ?? null,
      });

      if (resultKey) {
        // Pass true to create new history entry if there's already a result
        // This allows navigating back through multiple backtest runs
        setHistoryStateKey(HISTORY_KEY, resultKey, true);
      }
      setWasInterrupted(false);
    }
  }, [result, advancedResult, selectedTicker, resultTicker, customRules, isOptimizationRunning]);

  // Mark as interrupted when component ACTUALLY unmounts during running state
  // Uses refs to avoid stale closure issues - cleanup only runs on actual unmount
  useEffect(() => {
    const HISTORY_KEY = "backtestResultKey";

    return () => {
      // Check ref value at unmount time (not captured closure value)
      if (isBacktestRunningRef.current) {
        const resultKey = setBacktestResultWithKey({
          ticker: tickerRef.current,
          customRules: customRulesRef.current,
          mode: backtestModeRef.current,
          status: "interrupted",
          result: null,
          advancedResult: null,
          error: null,
          duration: null,
        });

        if (resultKey) {
          setHistoryStateKey(HISTORY_KEY, resultKey);
        }
      }
    };
  }, []); // Empty deps - cleanup ONLY runs on actual unmount, not on state changes

  // Check if we should use async mode (ticker-based, no CSV file)
  const shouldUseAsyncMode =
    useAsyncMode && inputType === "ticker" && !selectedFile;

  // Get advanced condition data directly from result (now at root level)
  const resolvedAdvancedCondition = advancedResult?.condition
    ? {
        condition: advancedResult.condition,
        target_pct: advancedResult.target_pct,
        stop_pct: advancedResult.stop_pct,
      }
    : null;

  const canGenerateAdvancedPineScript = Boolean(
    resolvedAdvancedCondition?.condition
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "text/csv") {
      setSelectedFile(file);
      toast.success("File Selected", {
        description: file.name,
      });
    } else {
      toast.error("Invalid File", {
        description: "Please select a CSV file",
      });
    }
  };

  const buildStrategyFormData = (): FormData | null => {
    const formData = new FormData();
    const currentInputType = getSelectedInputType();

    if (currentInputType === "none") {
      toast.error("No Input Provided", {
        description: "Please select a ticker or upload a CSV file",
      });
      return null;
    }

    if (currentInputType === "ticker") {
      formData.append("ticker", selectedTicker);
      formData.append("custom_rules", customRules);
    } else {
      // CSV mode
      formData.append("csv_file", selectedFile!);
      formData.append("custom_rules", customRules);
    }

    return formData;
  };

  const handleRunOptimization = () => {
    // Check usage limits before running
    if (usageLimits && usageLimits.remaining.backtestRuns <= 0) {
      toast.error("Backtest Limit Reached", {
        description: `You've used all ${usageLimits.limits.backtestRunsPerHour} backtest runs this hour. Resets in ${getTimeUntilReset(usageLimits.resetsAt)}.`,
      });
      return;
    }

    // Reset interrupted state (new key will be set when results complete)
    setWasInterrupted(false);

    // Clear previous results and reset history tracking
    setResult(null);
    setAdvancedResult(null);
    setPineScript(null);
    setAdvancedPineScript(null);
    lastProcessedHistoryKeyRef.current = null; // Reset so new results can be saved

    // Record start time for tracking
    backtestStartTimeRef.current = Date.now();
    trackedResultKeyRef.current = null;

    // Use async Celery mode for ticker-based backtests
    if (shouldUseAsyncMode && selectedTicker) {
      asyncBacktest.runBacktest({
        ticker: selectedTicker,
        custom_rules: customRules,
        mode: "standard",
      });
      return;
    }

    // Fall back to synchronous mode for CSV uploads
    const formData = buildStrategyFormData();
    if (!formData) return;
    backtestMutation.mutate(formData);
  };

  const handleRunAdvancedOptimization = () => {
    // Check usage limits before running
    if (usageLimits && usageLimits.remaining.backtestRuns <= 0) {
      toast.error("Backtest Limit Reached", {
        description: `You've used all ${usageLimits.limits.backtestRunsPerHour} backtest runs this hour. Resets in ${getTimeUntilReset(usageLimits.resetsAt)}.`,
      });
      return;
    }

    // Reset interrupted state (new key will be set when results complete)
    setWasInterrupted(false);

    // Clear previous results and reset history tracking
    setResult(null);
    setAdvancedResult(null);
    setPineScript(null);
    setAdvancedPineScript(null);
    lastProcessedHistoryKeyRef.current = null; // Reset so new results can be saved

    // Record start time for tracking
    backtestStartTimeRef.current = Date.now();
    trackedResultKeyRef.current = null;

    // Use async Celery mode for ticker-based backtests
    if (shouldUseAsyncMode && selectedTicker) {
      asyncBacktest.runBacktest({
        ticker: selectedTicker,
        custom_rules: customRules,
        mode: "advanced",
      });
      return;
    }

    // Fall back to synchronous mode for CSV uploads
    const formData = buildStrategyFormData();
    if (!formData) return;
    advancedBacktestMutation.mutate(formData);
  };

  const handleGeneratePineScript = () => {
    if (!result?.condition) {
      toast.error("No strategy available", {
        description: "Run the optimizer to generate a strategy first.",
      });
      return;
    }
    const script = generatePineScriptFromCondition(result.condition);
    setPineScript(script);
    toast.success("Pine Script generated", {
      description: "Scroll down to view or copy the code.",
    });
  };

  const handleGenerateAdvancedPineScript = () => {
    const conditionSource = resolvedAdvancedCondition;
    if (!conditionSource?.condition) {
      toast.error("No advanced strategy available", {
        description: "Run Advanced Optimization to generate a strategy first.",
      });
      return;
    }

    const takeProfitPct =
      typeof conditionSource.target_pct === "number"
        ? conditionSource.target_pct * 100
        : null;
    const stopLossPct =
      typeof conditionSource.stop_pct === "number"
        ? conditionSource.stop_pct * 100
        : null;

    const script = generatePineScriptFromCondition(conditionSource.condition, {
      takeProfitPct,
      stopLossPct,
    });
    setAdvancedPineScript(script);
    toast.success("Advanced Pine Script generated", {
      description: "Scroll down to view or copy the code.",
    });
  };

  const handleCopyPineScript = async (script: string, isAdvanced: boolean) => {
    await navigator.clipboard.writeText(script);
    if (isAdvanced) {
      setAdvancedCopied(true);
      setTimeout(() => setAdvancedCopied(false), 2000);
    } else {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    toast.success("Copied to clipboard", {
      description: "Pine Script copied successfully.",
    });
  };

  const handleSaveBacktest = async () => {
    if (!saveName.trim()) {
      toast.error("Please enter a name for the result");
      return;
    }

    const isAdvanced = advancedResult !== null;
    const currentResult = isAdvanced ? advancedResult : result;

    if (!currentResult || !selectedTicker) {
      toast.error("No results to save");
      return;
    }

    try {
      await saveResultMutation.mutateAsync({
        name: saveName.trim(),
        ticker: selectedTicker,
        mode: isAdvanced ? "advanced" : "standard",
        customRules: customRules || undefined,
        strategyCondition: isAdvanced
          ? advancedResult?.condition || ""
          : result?.condition || "",
        metrics: currentResult.metrics,
        equityCurve: currentResult.equity_curve,
        candlestickData: currentResult.candlestick_data,
        trainEndDate: currentResult.train_end_date,
        trainEndIndex: currentResult.train_end_index,
        maxDrawdownPoint: currentResult.max_drawdown_point,
        tpslValues: isAdvanced && advancedResult?.target_pct != null
          ? {
              target_pct: advancedResult.target_pct,
              stop_pct: advancedResult.stop_pct ?? 0,
            }
          : undefined,
        executionTimeMs: currentResult.duration
          ? Math.round(currentResult.duration * 1000)
          : undefined,
      });
      toast.success("Results saved successfully");
      setSaveDialogOpen(false);
      setSaveName("");
    } catch (error: any) {
      toast.error(error.message || "Failed to save results");
    }
  };

  return (
    <>
      {/* SEO Meta Tags */}
      <SEO
        title={PAGE_SEO.backtesting.title}
        description={PAGE_SEO.backtesting.description}
        canonical="/alpha-generation"
        jsonLd={[
          generateFAQSchema(BACKTESTING_FAQS),
          generateSoftwareApplicationSchema(
            'Equity Pro Alpha Generation - AI Strategy Backtesting',
            'Free AI-powered strategy backtesting for Indian stocks. Optimize trading strategies using genetic algorithms with technical indicators on NSE stocks.',
            ['Strategy Backtesting', 'Alpha Generation', 'Genetic Algorithm', 'Trading Strategy', 'NSE Backtest']
          ),
          generateHowToSchema(
            'How to Backtest Trading Strategies',
            'Step-by-step guide to optimize and backtest trading strategies using genetic algorithms on NSE stocks',
            BACKTESTING_HOWTO
          ),
        ]}
      />

      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-3">
                <BarChart3 className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Alpha Generation</h1>
              </div>
            </div>
          <div className="flex items-center gap-2">
            <UsageLimitBadge feature="backtest" showLabel />
          </div>
        </div>

        {/* Interrupted session banner */}
        {wasInterrupted && (result || advancedResult) && (
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/50 rounded-lg flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-yellow-600 dark:text-yellow-400">
                Results from previous session
              </p>
              <p className="text-muted-foreground mt-1">
                These results are from a backtest that was interrupted when you navigated away.
                Run the optimization again to get fresh results.
              </p>
            </div>
          </div>
        )}

        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">
                Data Input for Optimization
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                Select a ticker to use hourly data from database (up to 5
                years), or upload your own CSV file. The algorithm optimizes
                trading strategies using technical indicators (ATR, SMA, EMA)
                with 70/30 train-test split.
              </p>
            </div>

            <div className="space-y-4">
              {/* Side-by-side inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Ticker Dropdown */}
                <div>
                  <Label htmlFor="ticker-select">Select Ticker</Label>
                  <div className="mt-2">
                    <TickerCombobox
                      options={tickerOptions}
                      value={selectedTicker}
                      onValueChange={setSelectedTicker}
                      placeholder="Choose a ticker..."
                      isLoading={tickersQuery.isLoading}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Up to 5 years of hourly (1hour) data
                  </p>
                </div>

                {/* CSV Upload */}
                <div>
                  <div className="mt-8">
                    <Input
                      ref={fileInputRef}
                      id="csv-upload"
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      className="hidden"
                      data-testid="input-csv-upload"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="button-upload"
                    >
                      <FileUp className="h-4 w-4" />
                    </Button>
                  </div>
                  {selectedFile && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Selected: {selectedFile.name} (
                      {(selectedFile.size / 1024).toFixed(2)} KB)
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    CSV with columns: Datetime, Open, High, Low, Close
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="custom-rules">
                  Custom Trading Rules (optional)
                </Label>
                <Input
                  id="custom-rules"
                  placeholder="e.g., Close > ema_daily_50, sma_daily_10 > sma_daily_20"
                  value={customRules}
                  onChange={(e) => setCustomRules(e.target.value)}
                  className="mt-2"
                  data-testid="input-custom-rules"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Comma-separated conditions
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="run-button"
                  onClick={handleRunOptimization}
                  disabled={isOptimizationRunning}
                  data-testid="button-run-optimization"
                >
                  <span className="run-button-content">
                    {backtestMutation.isPending ? (
                      <>
                        <BarChart3 className="h-4 w-4 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        Standard
                      </>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  className="run-button"
                  onClick={handleRunAdvancedOptimization}
                  disabled={isOptimizationRunning}
                  data-testid="button-run-advanced-optimization"
                >
                  <span className="run-button-content">
                    {advancedBacktestMutation.isPending ? (
                      <>
                        <Sparkles className="h-4 w-4 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Advanced
                      </>
                    )}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </Card>

        {/* Progress indicator for async backtests */}
        {asyncBacktest.isRunning && (
          <BacktestProgress
            progress={asyncBacktest.progress}
            isRunning={asyncBacktest.isRunning}
            onCancel={asyncBacktest.cancelBacktest}
            error={asyncBacktest.error}
          />
        )}

        {result && (
          <>
            <Card ref={resultsRef} className="p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <h2 className="text-lg font-semibold">
                  Optimization Results
                </h2>
                <div className="flex items-center gap-2">
                  <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Bookmark className="h-4 w-4" />
                        Save Results
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Save Backtest Results</DialogTitle>
                        <DialogDescription>
                          Give your results a name to save them for later reference.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="save-name">Name</Label>
                          <Input
                            id="save-name"
                            placeholder="e.g., RELIANCE momentum strategy"
                            value={saveName}
                            onChange={(e) => setSaveName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveBacktest();
                            }}
                          />
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <p>Ticker: <span className="font-medium">{selectedTicker}</span></p>
                          <p>Mode: <span className="font-medium">Standard</span></p>
                          <p>PnL: <span className="font-medium">{result.metrics.total_profit?.toFixed(2)}%</span></p>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setSaveDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleSaveBacktest}
                          disabled={saveResultMutation.isPending}
                        >
                          {saveResultMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            "Save"
                          )}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Link href="/saved-results">
                    <Button variant="ghost" size="sm" className="gap-2">
                      <FolderOpen className="h-4 w-4" />
                      View Saved
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Best Strategy Condition:
                  </p>
                  <div className="space-y-2">
                    <div className="p-3 bg-muted rounded-lg font-mono text-sm">
                      {result.condition}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGeneratePineScript}
                      className="gap-2"
                    >
                      <Code2 className="h-4 w-4" />
                      Generate Pine Script
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Total PnL (Train)
                    </p>
                    <p
                      className={`text-xl font-bold ${
                        result.metrics.total_profit == null
                          ? "text-muted-foreground"
                          : result.metrics.total_profit >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {result.metrics.total_profit == null
                        ? "N/A"
                        : `${
                            result.metrics.total_profit >= 0 ? "+" : ""
                          }${result.metrics.total_profit.toFixed(2)}%`}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Number of Trades
                    </p>
                    <p className="text-xl font-bold">
                      {result.metrics.num_trades}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Calmar Ratio
                    </p>
                    <p className="text-xl font-bold">
                      {result.metrics.calmar_ratio == null
                        ? "N/A"
                        : result.metrics.calmar_ratio.toFixed(2)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Max Drawdown
                    </p>
                    <p className="text-xl font-bold text-red-600">
                      {result.metrics.max_dd == null
                        ? "N/A"
                        : `${result.metrics.max_dd.toFixed(2)}%`}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Win Rate</p>
                    <p className="text-xl font-bold">
                      {result.metrics.win_rate == null
                        ? "N/A"
                        : `${result.metrics.win_rate.toFixed(1)}%`}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Profit Factor
                    </p>
                    <p className="text-xl font-bold">
                      {result.metrics.profit_factor == null
                        ? "N/A"
                        : result.metrics.profit_factor.toFixed(2)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Avg Return</p>
                    <p className="text-xl font-bold">
                      {result.metrics.avg_p == null
                        ? "N/A"
                        : `${(result.metrics.avg_p * 100).toFixed(2)}%`}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="text-xl font-bold">
                      {result.duration.toFixed(2)}s
                    </p>
                  </div>
                </div>

                <div className="grid gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-base font-semibold">Equity Curve</h3>
                      {result.train_end_date && (
                        <Badge
                          variant="outline"
                          className="text-xs uppercase tracking-wide"
                        >
                          Train end: {result.train_end_date.split("T")[0]}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Combined train/test equity curve expressed as cumulative
                      percentage return.
                    </p>
                    {result.max_drawdown_point?.date && (
                      <p className="text-xs text-muted-foreground">
                        Max drawdown on{" "}
                        {result.max_drawdown_point.date.split("T")[0]}:{" "}
                        {result.max_drawdown_point.value == null
                          ? "N/A"
                          : `${result.max_drawdown_point.value.toFixed(2)}%`}
                      </p>
                    )}
                    <div className="relative rounded-md border border-border/60 bg-card/40 overflow-hidden p-3">
                      {result.equity_curve && result.equity_curve.length > 0 ? (
                        <EquityCurveChart
                          data={result.equity_curve}
                          trainEndDate={result.train_end_date || ""}
                          trainEndIndex={result.train_end_index}
                          maxDrawdownPoint={result.max_drawdown_point}
                          metrics={result.metrics}
                          condition={result.condition}
                          showBrush
                        />
                      ) : (
                        <div className="h-[360px] flex items-center justify-center text-sm text-muted-foreground">
                          Equity curve visualization unavailable.
                        </div>
                      )}
                      {backtestMutation.isPending && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-sm text-sm text-muted-foreground">
                          Optimizing strategy...
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Candlestick chart temporarily hidden
                  <div className="space-y-3">
                    <h3 className="text-base font-semibold">
                      Test Period Candles
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Last 4 months of the test period with recent trade entry
                      and exit signals highlighted.
                    </p>
                    <div className="relative rounded-md border border-border/60 bg-card/40 overflow-hidden p-3">
                      {backtestMutation.isPending ? (
                        <div className="h-[380px] flex items-center justify-center text-sm text-muted-foreground">
                          Optimizing strategy...
                        </div>
                      ) : (
                        <BacktestCandlestickChart
                          data={result.candlestick_data ?? []}
                          height={500}
                        />
                      )}
                    </div>
                  </div>
*/}
                </div>
              </div>
            </Card>

            {pineScript && (
              <Card className="p-6 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold">
                    Generated Pine Script
                  </h3>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1.5"
                      onClick={() => handleCopyPineScript(pineScript, false)}
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copied ? "Copied!" : "Copy"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => setPineScript(null)}
                    >
                      Hide
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Copy the following Pine Script v5 template into TradingView to
                  experiment with the optimized strategy.
                </p>
                <pre className="max-h-[460px] overflow-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs leading-relaxed font-mono whitespace-pre-wrap">
                  {pineScript}
                </pre>
              </Card>
            )}
          </>
        )}

        {advancedResult && (
          <>
            <Card ref={resultsRef} className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="text-lg font-semibold">
                      Advanced Optimization Output
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Generated via TPSL-enabled optimizer with Take Profit /
                      Stop Loss optimization.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={handleGenerateAdvancedPineScript}
                      disabled={!canGenerateAdvancedPineScript}
                    >
                      <Code2 className="h-4 w-4" />
                      Generate Pine Script
                    </Button>
                    <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2">
                          <Bookmark className="h-4 w-4" />
                          Save Results
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Save Backtest Results</DialogTitle>
                          <DialogDescription>
                            Give your results a name to save them for later reference.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid gap-2">
                            <Label htmlFor="save-name-advanced">Name</Label>
                            <Input
                              id="save-name-advanced"
                              placeholder="e.g., RELIANCE TPSL strategy"
                              value={saveName}
                              onChange={(e) => setSaveName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveBacktest();
                              }}
                            />
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p>Ticker: <span className="font-medium">{selectedTicker}</span></p>
                            <p>Mode: <span className="font-medium">Advanced (TPSL)</span></p>
                            <p>PnL: <span className="font-medium">{advancedResult.metrics?.total_profit?.toFixed(2)}%</span></p>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            variant="outline"
                            onClick={() => setSaveDialogOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleSaveBacktest}
                            disabled={saveResultMutation.isPending}
                          >
                            {saveResultMutation.isPending ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              "Save"
                            )}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <Link href="/saved-results">
                      <Button variant="ghost" size="sm" className="gap-2">
                        <FolderOpen className="h-4 w-4" />
                        View Saved
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* Condition Display */}
                <div className="rounded-lg border border-border/60 bg-accent/40 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <h3 className="text-sm font-semibold">
                      Best Strategy Condition
                    </h3>
                    <div className="flex gap-2">
                      <Badge
                        variant="outline"
                        className="text-positive border-positive/50"
                      >
                        TP:{" "}
                        {advancedResult.target_pct != null
                          ? `${(advancedResult.target_pct * 100).toFixed(1)}%`
                          : "N/A"}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-negative border-negative/50"
                      >
                        SL:{" "}
                        {advancedResult.stop_pct != null
                          ? `${(advancedResult.stop_pct * 100).toFixed(1)}%`
                          : "N/A"}
                      </Badge>
                    </div>
                  </div>
                  <code className="block text-sm font-mono break-words text-foreground/90 bg-muted/60 p-3 rounded-md">
                    {advancedResult.condition || "N/A"}
                  </code>
                </div>

                {/* 8 Metrics Grid */}
                {advancedResult.metrics && (
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <div className="rounded-lg border border-border/60 bg-card/60 p-3">
                      <p className="text-xs text-muted-foreground">
                        Total PnL (Train)
                      </p>
                      <p
                        className={`text-xl font-bold ${
                          (advancedResult.metrics.total_profit ?? 0) >= 0
                            ? "text-positive"
                            : "text-negative"
                        }`}
                      >
                        {advancedResult.metrics.total_profit != null
                          ? `${advancedResult.metrics.total_profit.toFixed(2)}%`
                          : "N/A"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-card/60 p-3">
                      <p className="text-xs text-muted-foreground">
                        Number of Trades
                      </p>
                      <p className="text-xl font-bold">
                        {advancedResult.metrics.num_trades ?? "N/A"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-card/60 p-3">
                      <p className="text-xs text-muted-foreground">
                        Calmar Ratio
                      </p>
                      <p className="text-xl font-bold">
                        {advancedResult.metrics.calmar_ratio != null
                          ? advancedResult.metrics.calmar_ratio.toFixed(2)
                          : "N/A"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-card/60 p-3">
                      <p className="text-xs text-muted-foreground">
                        Max Drawdown
                      </p>
                      <p className="text-xl font-bold text-negative">
                        {advancedResult.metrics.max_dd != null
                          ? `${advancedResult.metrics.max_dd.toFixed(2)}%`
                          : "N/A"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-card/60 p-3">
                      <p className="text-xs text-muted-foreground">Win Rate</p>
                      <p className="text-xl font-bold">
                        {advancedResult.metrics.win_rate != null
                          ? `${advancedResult.metrics.win_rate.toFixed(2)}%`
                          : "N/A"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-card/60 p-3">
                      <p className="text-xs text-muted-foreground">
                        Profit Factor
                      </p>
                      <p className="text-xl font-bold">
                        {advancedResult.metrics.profit_factor != null
                          ? advancedResult.metrics.profit_factor.toFixed(2)
                          : "N/A"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-card/60 p-3">
                      <p className="text-xs text-muted-foreground">
                        Avg Return
                      </p>
                      <p className="text-xl font-bold">
                        {advancedResult.metrics.avg_p != null
                          ? `${(advancedResult.metrics.avg_p * 100).toFixed(
                              4
                            )}%`
                          : "N/A"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-card/60 p-3">
                      <p className="text-xs text-muted-foreground">Duration</p>
                      <p className="text-xl font-bold">
                        {advancedResult.duration != null
                          ? `${advancedResult.duration.toFixed(2)}s`
                          : "N/A"}
                      </p>
                    </div>
                  </div>
                )}

                {/* Charts Grid */}
                <div className="grid gap-6">
                  {/* Equity Curve */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-base font-semibold">Equity Curve</h3>
                      {advancedResult.train_end_date && (
                        <Badge
                          variant="outline"
                          className="text-xs uppercase tracking-wide"
                        >
                          Train end:{" "}
                          {advancedResult.train_end_date.split("T")[0]}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Combined train/test equity curve expressed as cumulative
                      percentage return.
                    </p>
                    {advancedResult.max_drawdown_point?.date && (
                      <p className="text-xs text-muted-foreground">
                        Max drawdown on{" "}
                        {advancedResult.max_drawdown_point.date.split("T")[0]}:{" "}
                        {advancedResult.max_drawdown_point.value == null
                          ? "N/A"
                          : `${advancedResult.max_drawdown_point.value.toFixed(
                              2
                            )}%`}
                      </p>
                    )}
                    <div className="relative rounded-md border border-border/60 bg-card/40 overflow-hidden p-3">
                      {advancedResult.equity_curve &&
                      advancedResult.equity_curve.length > 0 ? (
                        <EquityCurveChart
                          data={advancedResult.equity_curve}
                          trainEndDate={advancedResult.train_end_date ?? ""}
                          trainEndIndex={advancedResult.train_end_index}
                          maxDrawdownPoint={advancedResult.max_drawdown_point}
                          metrics={advancedResult.metrics!}
                          condition={`${advancedResult.condition} (TP ${(
                            (advancedResult.target_pct ?? 0) * 100
                          ).toFixed(1)}% SL ${(
                            (advancedResult.stop_pct ?? 0) * 100
                          ).toFixed(1)}%)`}
                          showBrush
                        />
                      ) : (
                        <div className="h-[360px] flex items-center justify-center text-sm text-muted-foreground">
                          Equity curve visualization unavailable.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Candlestick chart temporarily hidden
                  <div className="space-y-3">
                    <h3 className="text-base font-semibold">
                      Test Period Candles
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Last 4 months of the test period with recent trade entry
                      and exit signals highlighted.
                    </p>
                    <div className="relative rounded-md border border-border/60 bg-card/40 overflow-hidden p-3">
                      <BacktestCandlestickChart
                        data={advancedResult.candlestick_data ?? []}
                        height={500}
                      />
                    </div>
                  </div>
*/}
                </div>
              </div>
            </Card>

            {advancedPineScript && (
              <Card className="p-6 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold">
                    Generated Pine Script (TPSL)
                  </h3>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1.5"
                      onClick={() =>
                        handleCopyPineScript(advancedPineScript, true)
                      }
                    >
                      {advancedCopied ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {advancedCopied ? "Copied!" : "Copy"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => setAdvancedPineScript(null)}
                    >
                      Hide
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Copy the following Pine Script v5 template into TradingView to
                  experiment with the optimized strategy. Includes Take Profit
                  and Stop Loss exit rules.
                </p>
                <pre className="max-h-[460px] overflow-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs leading-relaxed font-mono whitespace-pre-wrap">
                  {advancedPineScript}
                </pre>
              </Card>
            )}
          </>
        )}
      </div>
      </div>
    </>
  );
}

type IndicatorRule = {
  regex: RegExp;
  createLines: (length: string) => {
    inputLine: string;
    definitionLine: string;
    family: string;
  };
};

const indicatorRules: IndicatorRule[] = [
  {
    regex: /sma_daily_(\d+)/gi,
    createLines: (length) => ({
      inputLine: `sma_daily_${length}_len = input.int(${length}, "SMA ${length} Length", minval=1)`,
      definitionLine: `sma_daily_${length} = ta.sma(close, sma_daily_${length}_len)`,
      family: "sma",
    }),
  },
  {
    regex: /ema_daily_(\d+)/gi,
    createLines: (length) => ({
      inputLine: `ema_daily_${length}_len = input.int(${length}, "EMA ${length} Length", minval=1)`,
      definitionLine: `ema_daily_${length} = ta.ema(close, ema_daily_${length}_len)`,
      family: "ema",
    }),
  },
  {
    regex: /atr_(\d+)/gi,
    createLines: (length) => ({
      inputLine: `atr_${length}_len = input.int(${length}, "ATR ${length} Length", minval=1)`,
      definitionLine: `atr_${length} = ta.atr(atr_${length}_len)`,
      family: "atr",
    }),
  },
  {
    regex: /rsi_(\d+)/gi,
    createLines: (length) => ({
      inputLine: `rsi_${length}_len = input.int(${length}, "RSI ${length} Length", minval=1)`,
      definitionLine: `rsi_${length} = ta.rsi(close, rsi_${length}_len)`,
      family: "rsi",
    }),
  },
];

const plotStyles: Record<string, { color: string; title: string }> = {
  sma: { color: "color.new(color.blue, 0)", title: "SMA" },
  ema: { color: "color.new(color.orange, 0)", title: "EMA" },
  atr: { color: "color.new(color.teal, 0)", title: "ATR" },
  rsi: { color: "color.new(color.purple, 0)", title: "RSI" },
};

const priceFieldReplacements: Array<[RegExp, string]> = [
  [/\bClose\b/g, "close"],
  [/\bOpen\b/g, "open"],
  [/\bHigh\b/g, "high"],
  [/\bLow\b/g, "low"],
  [/\bVolume\b/g, "volume"],
  [/\bAND\b/gi, "and"],
  [/\bOR\b/gi, "or"],
  [/\bNOT\b/gi, "not"],
  [/\bTRUE\b/gi, "true"],
  [/\bFALSE\b/gi, "false"],
];

type PineScriptOptions = {
  takeProfitPct?: number | null;
  stopLossPct?: number | null;
};

function generatePineScriptFromCondition(
  condition: string,
  options?: PineScriptOptions
): string {
  const cleanedCondition = condition.trim();
  if (!cleanedCondition) {
    return "// Condition is empty. Run the optimizer to generate a rule.";
  }

  const indicatorDefinitions = new Map<
    string,
    {
      inputLine: string;
      definitionLine: string;
      family: string;
      length: string;
    }
  >();
  const indicatorInputs: string[] = [];
  const indicatorUsage: Array<{
    name: string;
    family: string;
    length: string;
  }> = [];
  const indicatorReplacements: Array<[RegExp, string]> = [];

  indicatorRules.forEach(({ regex, createLines }) => {
    const matches = Array.from(cleanedCondition.matchAll(regex));
    for (const match of matches) {
      const length = match[1];
      const identifier = match[0];
      const canonicalName = identifier.toLowerCase();
      const key = canonicalName;
      if (!indicatorDefinitions.has(key)) {
        const details = createLines(length);
        indicatorDefinitions.set(key, { ...details, length });
        indicatorInputs.push(details.inputLine);
        indicatorUsage.push({
          name: canonicalName,
          family: details.family,
          length,
        });
        indicatorReplacements.push([
          new RegExp(`\\b${escapeRegExp(identifier)}\\b`, "gi"),
          canonicalName,
        ]);
      }
    }
  });

  let pineExpression = cleanedCondition;
  priceFieldReplacements.forEach(([pattern, replacement]) => {
    pineExpression = pineExpression.replace(pattern, replacement);
  });
  indicatorReplacements.forEach(([pattern, replacement]) => {
    pineExpression = pineExpression.replace(pattern, replacement);
  });

  const indicatorInputLines =
    indicatorInputs.length > 0
      ? indicatorInputs
      : ["// No indicator-specific inputs"];

  const definitionLines =
    indicatorDefinitions.size > 0
      ? Array.from(indicatorDefinitions.values()).map(
          (entry) => entry.definitionLine
        )
      : ["// No additional indicators required"];

  const plotLines =
    indicatorUsage.length > 0
      ? indicatorUsage.map(({ name, family, length }) => {
          const style = plotStyles[family] ?? {
            color: "color.new(color.gray, 0)",
            title: family.toUpperCase(),
          };
          return `plot(${name}, color=${style.color}, title="${style.title} ${length}")`;
        })
      : ["// No indicator plots"];

  const tpPct =
    typeof options?.takeProfitPct === "number" &&
    !Number.isNaN(options.takeProfitPct)
      ? Number(options.takeProfitPct.toFixed(2))
      : 3.5;
  const slPct =
    typeof options?.stopLossPct === "number" &&
    !Number.isNaN(options.stopLossPct)
      ? Number(options.stopLossPct.toFixed(2))
      : 1.0;

  const lines = [
    "//@version=5",
    'strategy("Alpha TPSL Strategy", overlay=true, commission_type=strategy.commission.percent, commission_value=0.0)',
    "",
    "// === INPUTS ===",
    ...indicatorInputLines,
    'positionSize = input.float(1.0, "Position Size", step=0.1)',
    `takeProfitPerc = input.float(${tpPct}, "Take Profit (%)", step=0.1)`,
    `stopLossPerc = input.float(${slPct}, "Stop Loss (%)", step=0.1)`,
    "",
    "// === CALCULATIONS ===",
    ...definitionLines,
    "",
    "// === ENTRY CONDITION ===",
    `longCondition = ${pineExpression}`,
    "",
    "// === STRATEGY LOGIC ===",
    "if (longCondition)",
    '    strategy.entry("AlphaGen Long", strategy.long, positionSize)',
    "",
    "// === RISK MANAGEMENT ===",
    "takeProfitPrice = strategy.position_avg_price * (1 + takeProfitPerc / 100)",
    "stopLossPrice = strategy.position_avg_price * (1 - stopLossPerc / 100)",
    'strategy.exit("Exit AlphaGen Long", "AlphaGen Long", stop=stopLossPrice, limit=takeProfitPrice)',
    "",
    // "// === VISUALS ===",
    // ...plotLines,
    // 'plotshape(longCondition, title="Entry Signal", style=shape.triangleup, color=color.new(color.green, 0), size=size.small, location=location.belowbar)',
    // 'plotshape(not longCondition and strategy.position_size > 0, title="Exit Signal", style=shape.triangledown, color=color.new(color.red, 0), size=size.small, location=location.abovebar)',
  ];

  return lines.join("\n");
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
