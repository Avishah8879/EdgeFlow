import { useState, useEffect, useRef } from "react";
import { useExpertScreener } from "@/hooks/use-expert-screener";
import { useSaveScreenerResult } from "@/hooks/use-saved-results";
import { useTracking } from "@/contexts/TrackingContext";
import {
  getScreenerResultByKey,
  setScreenerResultWithKey,
  clearScreenerResultByKey,
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
import ExpressionBuilder from "@/components/expert-screener/ExpressionBuilder";
import SampleTemplates from "@/components/expert-screener/SampleTemplates";
import ProgressIndicator from "@/components/expert-screener/ProgressIndicator";
import ResultsTable from "@/components/expert-screener/ResultsTable";
import { ModeToggle, type ScreenerMode } from "@/components/screener/ModeToggle";
import { ConditionBuilder } from "@/components/screener/ConditionBuilder";
import { compile, isEmpty } from "@/lib/screener/compile";
import { parse } from "@/lib/screener/parse";
import type { BuilderTree } from "@/lib/screener/types";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
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
import { Bookmark, FolderOpen, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { CoinGateAlert } from "@/components/CoinGateAlert";
import { UsageLimitBadge } from "@/components/UsageLimitBadge";
import { useUsageLimits, getTimeUntilReset } from "@/hooks/use-usage-limits";
import { SEO } from "@/components/SEO";
import { PAGE_SEO } from "@/lib/seo-config";
import {
  generateFAQSchema,
  generateSoftwareApplicationSchema,
  generateHowToSchema,
  SCREENER_FAQS,
  SCREENER_HOWTO,
} from "@/lib/json-ld";

export default function Screener() {
  const [location] = useLocation();
  const [expression, setExpression] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  // Visual builder state
  const [mode, setMode] = useState<ScreenerMode>("builder");
  const [builderTree, setBuilderTree] = useState<BuilderTree>({ kind: "group", id: "root", children: [] });
  const [unparseableReason, setUnparseableReason] = useState<string | undefined>();
  // Tracks whether the current expression was last set by the builder (so we
  // don't re-parse our own output and cause a round-trip loop).
  const lastBuilderCompiledRef = useRef<string>("");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  // State persistence tracking
  const [hasRestoredFromStorage, setHasRestoredFromStorage] = useState(false);
  const [wasInterrupted, setWasInterrupted] = useState(false);
  const expressionRef = useRef(expression);
  expressionRef.current = expression;

  // Feature tracking
  const { trackFeature } = useTracking();
  const startTimeRef = useRef<number | null>(null);
  const trackedSummaryRef = useRef<string | null>(null);
  const autorunConsumedRef = useRef(false);

  // Save mutation
  const saveResultMutation = useSaveScreenerResult();

  // Usage limits for enforcement
  const { data: usageLimits } = useUsageLimits();

  const {
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
    getStateSnapshot,
    restoreFromStorage,
    reset,
  } = useExpertScreener();

  // URL state synchronization for expression
  const { syncToUrl } = useUrlState({
    param: "expr",
    value: expression,
    setValue: setExpression,
  });

  // Sync expression to URL when it changes (debounced)
  useEffect(() => {
    if (!expression.trim()) return;
    const timer = setTimeout(() => {
      syncToUrl(expression);
    }, 500);
    return () => clearTimeout(timer);
  }, [expression, syncToUrl]);

  // Hydrate builder from expression on mount (for URL-shared expressions)
  const builderHydratedRef = useRef(false);
  useEffect(() => {
    if (builderHydratedRef.current) return;
    const trimmed = expression.trim();
    if (!trimmed) return;
    builderHydratedRef.current = true;
    const r = parse(trimmed, "expert");
    if (r.ok) {
      setBuilderTree(r.tree);
      lastBuilderCompiledRef.current = compile(r.tree);
    } else {
      setUnparseableReason(r.reason);
    }
  }, [expression]);

  // History state key for screener results
  const HISTORY_KEY = "screenerResultKey";

  // Restore from sessionStorage on mount (only for back/forward navigation)
  useEffect(() => {
    if (hasRestoredFromStorage) return;
    setHasRestoredFromStorage(true);

    // Check if we should clear state (navbar click = fresh start)
    if (shouldClearState()) {
      clearHistoryStateKey(HISTORY_KEY);
      clearUrlParams();
      return;
    }

    // Check if this is a back/forward navigation or reload with state
    const isBackForward = shouldRestoreState();

    // Only restore on browser back/forward
    if (!isBackForward) {
      return;
    }

    // Get the result key from history state
    const resultKey = getHistoryStateKey(HISTORY_KEY);

    const stored = getScreenerResultByKey(resultKey);
    if (!stored) return;

    // Check if URL has a different expression - URL takes priority
    const params = new URLSearchParams(window.location.search);
    const urlExpr = params.get("expr");
    if (urlExpr && decodeURIComponent(urlExpr) !== stored.expression) {
      // URL expression takes priority - don't restore results
      setExpression(decodeURIComponent(urlExpr));
      clearScreenerResultByKey(resultKey);
      clearHistoryStateKey(HISTORY_KEY);
      return;
    }

    // Restore expression and results
    setExpression(stored.expression);
    if (stored.status === "interrupted") {
      setWasInterrupted(true);
    }
    restoreFromStorage(stored);
  }, [hasRestoredFromStorage, restoreFromStorage]);

  // Persist results when screener completes or errors
  useEffect(() => {
    if (status === "disconnected" && summary && results.length > 0) {
      const resultKey = setScreenerResultWithKey({
        expression: expressionRef.current,
        status: "completed",
        results,
        summary,
        error: null,
      });
      if (resultKey) {
        // Pass true to create new history entry if there's already a result
        // This allows navigating back through multiple screener runs
        setHistoryStateKey(HISTORY_KEY, resultKey, true);
      }
      setWasInterrupted(false);
    } else if (status === "error" && error) {
      const resultKey = setScreenerResultWithKey({
        expression: expressionRef.current,
        status: "error",
        results,
        summary,
        error,
      });
      if (resultKey) {
        setHistoryStateKey(HISTORY_KEY, resultKey);
      }
    }
  }, [status, summary, results, error]);

  // Mark as interrupted when component unmounts during running state
  useEffect(() => {
    return () => {
      if (isRunning) {
        const snapshot = getStateSnapshot();
        if (snapshot) {
          const resultKey = setScreenerResultWithKey({
            ...snapshot,
            expression: expressionRef.current,
            status: "interrupted",
          });
          if (resultKey) {
            setHistoryStateKey(HISTORY_KEY, resultKey);
          }
        }
      }
    };
  }, [isRunning, getStateSnapshot]);

  const handleTemplateSelect = (templateExpression: string) => {
    setExpression(templateExpression);
    setValidationError(null);
    // Also hydrate the builder so switching to Builder mode shows the template
    const r = parse(templateExpression, "expert");
    if (r.ok) {
      setBuilderTree(r.tree);
      lastBuilderCompiledRef.current = compile(r.tree);
      setUnparseableReason(undefined);
    } else {
      setUnparseableReason(r.reason);
    }
  };

  const handleExpressionChange = (newExpression: string) => {
    setExpression(newExpression);
    setValidationError(null);
  };

  const handleRun = () => {
    if (!expression.trim()) {
      setValidationError("Expression is required");
      return;
    }

    // Check usage limits before running
    if (usageLimits && usageLimits.remaining.screenerRuns <= 0) {
      toast.error("Screener Limit Reached", {
        description: `You've used all ${usageLimits.limits.screenerRunsPerHour} screener runs this hour. Resets in ${getTimeUntilReset(usageLimits.resetsAt)}.`,
      });
      return;
    }

    // Reset interrupted state (new key will be set when results complete)
    setWasInterrupted(false);

    // Record start time for tracking
    startTimeRef.current = Date.now();
    trackedSummaryRef.current = null;

    // Run the screener
    runScreener({
      expression: expression.trim(),
      period: "1y",
    });
  };

  useEffect(() => {
    if (autorunConsumedRef.current || isRunning) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("autorun") !== "1") return;

    const expr = params.get("expr");
    const decodedExpr = expr ? decodeURIComponent(expr).trim() : expression.trim();
    if (!decodedExpr) return;

    autorunConsumedRef.current = true;
    setExpression(decodedExpr);
    const parsed = parse(decodedExpr, "expert");
    if (parsed.ok) {
      setBuilderTree(parsed.tree);
      lastBuilderCompiledRef.current = compile(parsed.tree);
      setUnparseableReason(undefined);
    }
    startTimeRef.current = Date.now();
    trackedSummaryRef.current = null;
    runScreener({ expression: decodedExpr, period: "1y" });
  }, [expression, isRunning, runScreener]);

  // Track feature usage when screener completes
  useEffect(() => {
    if (summary && status === "disconnected" && !error) {
      // Only track once per unique run
      const summaryKey = `${summary.expression}-${summary.generated_at}`;
      if (trackedSummaryRef.current === summaryKey) return;
      trackedSummaryRef.current = summaryKey;

      const executionTime = startTimeRef.current
        ? Date.now() - startTimeRef.current
        : undefined;

      trackFeature(
        "screener",
        { expression: summary.expression },
        {
          summary: {
            matched: summary.matched,
            universe: summary.universe,
          },
          executionTimeMs: executionTime,
          success: true,
        }
      );
    }
  }, [summary, status, error, trackFeature]);

  const handleCancel = () => {
    cancelScreener();
  };

  const handleSave = async () => {
    if (!saveName.trim()) {
      toast.error("Please enter a name for the result");
      return;
    }

    if (!summary || results.length === 0) {
      toast.error("No results to save");
      return;
    }

    try {
      // Calculate execution time from tracked start time
      const executionTimeMs = startTimeRef.current
        ? Date.now() - startTimeRef.current
        : undefined;

      await saveResultMutation.mutateAsync({
        name: saveName.trim(),
        expression: expression.trim(),
        resultCount: summary.matched,
        matchingSymbols: results.map((r) => ({
          symbol: r.symbol,
          indicators: r.indicators,
        })),
        executionTimeMs,
      });
      toast.success("Results saved successfully");
      setSaveDialogOpen(false);
      setSaveName("");
    } catch (error: any) {
      toast.error(error.message || "Failed to save results");
    }
  };

  // Extract indicator names used in the expression
  // Matches patterns like: sma_50, ema_200, rsi_14, atr_14, macd_line, bb_upper, high_52_W, low_52_W, etc.
  const extractIndicatorsFromExpression = (expr: string): Set<string> => {
    const indicatorPattern = /\b(sma_\d+|ema_\d+|rsi_\d+|atr_\d+|macd_line|macd_signal|macd_histogram|bb_upper|bb_middle|bb_lower|supertrend(?:_\d+_[\d.]+)?|supertrend_direction(?:_\d+_[\d.]+)?|volume_sma_\d+|high_\d+_[A-Za-z]|low_\d+_[A-Za-z])\b/gi;
    const matches = expr.match(indicatorPattern) || [];
    // Normalize to backend format: most indicators lowercase, but high_XX_W/low_XX_W need uppercase freq suffix
    return new Set(matches.map(m => {
      const lower = m.toLowerCase();
      // Backend sends high_52_W and low_52_W with uppercase frequency suffix
      if (lower.match(/^(high|low)_\d+_[a-z]$/)) {
        return lower.slice(0, -1) + lower.slice(-1).toUpperCase(); // e.g., high_52_w -> high_52_W
      }
      return lower;
    }));
  };

  // Get indicators used in the expression
  const expressionIndicators = extractIndicatorsFromExpression(expression);

  // During processing: use extracted indicators from expression so columns show immediately
  // After completion: filter from summary's indicator_columns for accuracy
  const indicatorColumns = summary?.indicator_columns
    ? summary.indicator_columns.filter(col => expressionIndicators.has(col.toLowerCase()))
    : Array.from(expressionIndicators);  // Show columns immediately during processing

  return (
    <>
      {/* SEO Meta Tags */}
      <SEO
        title={PAGE_SEO.screener.title}
        description={PAGE_SEO.screener.description}
        canonical="/screener"
        jsonLd={[
          generateFAQSchema(SCREENER_FAQS),
          generateSoftwareApplicationSchema(
            'EquityPro Expert Screener - AI Stock Screening Tool',
            'Free AI-powered expert screener for Indian stocks. Screen NSE stocks using technical indicators like SMA, EMA, RSI, MACD with boolean expressions.',
            ['Technical Screener', 'Stock Filter', 'NSE Screener', 'AI Stock Analysis', 'Boolean Expression Screener']
          ),
          generateHowToSchema(
            'How to Use the Expert Screener',
            'Step-by-step guide to screen NSE stocks using technical indicators and boolean expressions',
            SCREENER_HOWTO
          ),
        ]}
      />

      <div className="min-h-screen bg-background text-foreground">
        {/* Page masthead */}
        <section className="border-b border-border bg-card">
          <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-10">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-2">
                <Eyebrow tone="gold" rule>
                  Expert screener
                </Eyebrow>
                <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
                  Find your edge.
                </h1>
                <p className="text-sm text-muted-foreground max-w-2xl">
                  Screen NSE stocks with boolean expressions over 24+ technical
                  indicators, or use the visual condition builder.
                </p>
              </div>
              <UsageLimitBadge feature="screener" showLabel />
            </div>
          </div>
        </section>

        <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-12">

        {/* Interrupted session banner */}
        {wasInterrupted && results.length > 0 && (
          <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/50 rounded-lg flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-yellow-600 dark:text-yellow-400">
                Results from previous session
              </p>
              <p className="text-muted-foreground mt-1">
                These results are from a screener run that was interrupted when you navigated away.
                Run the screener again to get fresh results.
              </p>
            </div>
          </div>
        )}

        {/* Sample Templates */}
        <div className="mb-12">
          <SampleTemplates
            onTemplateSelect={handleTemplateSelect}
            disabled={isRunning}
          />
        </div>

        {/* Mode toggle */}
        <div className="mb-3 flex items-center justify-between">
          <ModeToggle
            mode={mode}
            onChange={(next) => {
              if (next === mode) return;
              if (next === "builder") {
                // Expression → Builder: parse current expression
                const trimmed = expression.trim();
                if (!trimmed) {
                  setBuilderTree({ kind: "group", id: "root", children: [] });
                  setUnparseableReason(undefined);
                } else if (trimmed === lastBuilderCompiledRef.current) {
                  // Expression was set by builder — keep the tree
                  setUnparseableReason(undefined);
                } else {
                  const r = parse(trimmed, "expert");
                  if (r.ok) {
                    setBuilderTree(r.tree);
                    setUnparseableReason(undefined);
                  } else {
                    setBuilderTree({ kind: "group", id: "root", children: [] });
                    setUnparseableReason(r.reason);
                  }
                }
              }
              setMode(next);
            }}
          />
          <p className="text-xs text-muted-foreground">
            {mode === "builder" ? "Visual condition builder" : "Python-style free-text expression"}
          </p>
        </div>

        {/* Expression Builder */}
        <div className="mb-8">
          {mode === "builder" ? (
            <div className="rounded-lg border border-border bg-card p-4">
              <ConditionBuilder
                variant="expert"
                tree={builderTree}
                onTreeChange={(next) => {
                  setBuilderTree(next);
                  // Build → Expression sync: always keep expression state in sync
                  if (!isEmpty(next)) {
                    const compiled = compile(next);
                    lastBuilderCompiledRef.current = compiled;
                    handleExpressionChange(compiled);
                    setUnparseableReason(undefined);
                  } else {
                    lastBuilderCompiledRef.current = "";
                    handleExpressionChange("");
                  }
                }}
                unparseableReason={unparseableReason}
              />
              {/* Run/Cancel buttons (reuse existing handlers) */}
              <div className="mt-4 flex gap-3">
                {!isRunning ? (
                  <button
                    type="button"
                    className="run-button"
                    onClick={handleRun}
                    disabled={!expression.trim() || Boolean(validationError)}
                  >
                    <span className="run-button-content">
                      Run Expert Screener
                    </span>
                  </button>
                ) : (
                  <Button onClick={handleCancel} variant="destructive">
                    Cancel Screening
                  </Button>
                )}
              </div>
              {validationError && (
                <div className="mt-2 text-sm text-destructive">{validationError}</div>
              )}
            </div>
          ) : (
          <ExpressionBuilder
            expression={expression}
            onExpressionChange={handleExpressionChange}
            onRun={handleRun}
            onCancel={handleCancel}
            isRunning={isRunning}
            validationError={validationError || error || undefined}
          />
          )}
        </div>

        {/* Progress Indicator */}
        {isRunning && progress && (
          <div className="mb-8">
            <ProgressIndicator
              processed={progress.processed}
              total={progress.total}
              matches={progress.matches}
            />
          </div>
        )}

        {/* Status Messages */}
        {status === "connecting" && !loading && (
          <div className="mb-8 p-4 bg-muted/30 rounded-lg border border-border text-sm text-center">
            Connecting to screener...
          </div>
        )}

        {/* Loading Data Progress (Pre-fetch phase) */}
        {isRunning && loading && !progress && (
          <div className="mb-8 p-4 bg-muted/30 rounded-lg border border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Loading market data...</span>
              <span className="text-sm text-muted-foreground">
                {loading.loaded} / {loading.total} tickers
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${loading.total > 0 ? (loading.loaded / loading.total) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Pre-fetching OHLC data for screening (max 30s)
            </p>
          </div>
        )}

        {coinError && (
          <CoinGateAlert coinError={coinError} className="mb-8" />
        )}

        {status === "error" && error && (
          <div className="mb-8 p-4 bg-destructive/10 border border-destructive/50 rounded-lg text-sm text-destructive">
            Error: {error}
          </div>
        )}

        {/* Results Table */}
        {(results.length > 0 || summary) && (
          <div className="mt-8">
            <ResultsTable
              results={results}
              indicatorColumns={indicatorColumns}
            />
          </div>
        )}

        {/* Completion Message */}
        {status === "disconnected" && summary && !isRunning && (
          <div className="mt-4 p-4 bg-positive/10 border border-positive/50 rounded-lg">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <span className="text-sm text-positive">
                Screening complete! Found {summary.matched} {summary.matched === 1 ? "match" : "matches"} out of {summary.universe} stocks.
              </span>
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
                      <DialogTitle>Save Screener Results</DialogTitle>
                      <DialogDescription>
                        Give your results a name to save them for later reference.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="save-name">Name</Label>
                        <Input
                          id="save-name"
                          placeholder="e.g., Momentum stocks Nov 2024"
                          value={saveName}
                          onChange={(e) => setSaveName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSave();
                          }}
                        />
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <p>Expression: <code className="bg-muted px-1 rounded">{expression}</code></p>
                        <p>Results: {summary.matched} matches</p>
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
                        onClick={handleSave}
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
          </div>
        )}
      </div>
      </div>
    </>
  );
}
