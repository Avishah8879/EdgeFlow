import { useState, useMemo, useRef, useEffect } from "react";
import { Bookmark, FolderOpen, Loader2, PlayCircle, X, Info } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
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
import { cn } from "@/lib/utils";
import { useFundamentalScreener } from "@/hooks/use-fundamental-screener";
import { useSaveFundamentalScreenerResult } from "@/hooks/use-saved-results";
import { CoinGateAlert } from "@/components/CoinGateAlert";
import type { FundamentalResult } from "@/hooks/use-fundamental-screener";
import { ModeToggle, type ScreenerMode } from "@/components/screener/ModeToggle";
import { ConditionBuilder } from "@/components/screener/ConditionBuilder";
import { compile, isEmpty } from "@/lib/screener/compile";
import { parse } from "@/lib/screener/parse";
import type { BuilderTree } from "@/lib/screener/types";
import { Link } from "wouter";
import { toast } from "sonner";
import SampleTemplates from "@/components/expert-screener/SampleTemplates";
import MyTemplates from "@/components/expert-screener/MyTemplates";
import SaveTemplateDialog from "@/components/expert-screener/SaveTemplateDialog";
import { FUNDAMENTAL_SAMPLE_TEMPLATES } from "@/lib/screener/fundamental-sample-templates";
import { useExpressionValidation } from "@/hooks/use-expression-validation";
import type { UserScreenerTemplate } from "@/hooks/use-user-templates";

// The legacy hard-coded `fundamentalPresets` chip array was replaced in PR 3
// by FUNDAMENTAL_SAMPLE_TEMPLATES (5 card-style templates, rendered via the
// shared <SampleTemplates>). Audit trail of the swap is in
// client/src/lib/screener/fundamental-sample-templates.ts.

const variableCheatsheet = [
  { cat: "Valuation", vars: "market_cap, trailing_pe, forward_pe, price_to_book, price_to_sales, peg_ratio, enterprise_value" },
  { cat: "Profitability", vars: "profit_margin, operating_margin, return_on_equity, return_on_assets" },
  { cat: "Growth", vars: "earnings_growth, revenue_growth" },
  { cat: "Dividends", vars: "dividend_yield, dividend_rate, payout_ratio" },
  { cat: "Debt & Liquidity", vars: "debt_to_equity, current_ratio, quick_ratio, total_cash, total_debt" },
  { cat: "Other", vars: "avg_volume, shares_outstanding" },
];

const compactFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 2,
});

function formatFundamental(key: string, value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (key === "market_cap" || key === "enterprise_value" || key === "total_cash" || key === "total_debt") {
    return compactFormatter.format(value);
  }
  if (Math.abs(value) >= 1000) return compactFormatter.format(value);
  return value.toFixed(2);
}

const DISPLAY_COLUMNS = [
  "market_cap", "trailing_pe", "price_to_book", "return_on_equity",
  "debt_to_equity", "dividend_yield", "profit_margin", "earnings_growth",
  "revenue_growth", "current_ratio",
];

function friendlyName(key: string): string {
  const names: Record<string, string> = {
    market_cap: "Mkt Cap",
    trailing_pe: "P/E",
    forward_pe: "Fwd P/E",
    price_to_book: "P/B",
    price_to_sales: "P/S",
    peg_ratio: "PEG",
    enterprise_value: "EV",
    dividend_yield: "Div Yield",
    dividend_rate: "Div Rate",
    payout_ratio: "Payout %",
    profit_margin: "Profit %",
    operating_margin: "Op Margin %",
    return_on_equity: "ROE",
    return_on_assets: "ROA",
    earnings_growth: "EPS Growth",
    revenue_growth: "Rev Growth",
    total_cash: "Cash",
    total_debt: "Debt",
    debt_to_equity: "D/E",
    current_ratio: "Curr Ratio",
    quick_ratio: "Quick Ratio",
    avg_volume: "Avg Vol",
    shares_outstanding: "Shares Out",
  };
  return names[key] || key;
}

export function FundamentalScreenerTab() {
  // Seed with the first sample template's expression — same data, new module.
  const [expression, setExpression] = useState(FUNDAMENTAL_SAMPLE_TEMPLATES[0].expression);
  const [mode, setMode] = useState<ScreenerMode>("builder");
  const [builderTree, setBuilderTree] = useState<BuilderTree>({
    kind: "group",
    id: "root",
    children: [],
  });
  const [unparseableReason, setUnparseableReason] = useState<string | undefined>();
  const lastBuilderCompiledRef = useRef<string>("");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  // Save-as-Template dialog (PR 3) — distinct from the Save-Results dialog above.
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<UserScreenerTemplate | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const autorunConsumedRef = useRef(false);
  const saveResultMutation = useSaveFundamentalScreenerResult();

  // Hydrate builder from current expression on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlExpression = params.get("expr");
    const initialExpression = urlExpression ? decodeURIComponent(urlExpression) : expression;
    if (urlExpression) {
      setExpression(initialExpression);
    }

    const result = parse(initialExpression, "fundamental");
    if (result.ok) {
      setBuilderTree(result.tree);
      setUnparseableReason(undefined);
      lastBuilderCompiledRef.current = initialExpression;
    } else {
      setUnparseableReason(result.reason);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When builder tree changes, recompile and update expression
  const handleBuilderChange = (tree: BuilderTree) => {
    setBuilderTree(tree);
    if (isEmpty(tree)) {
      setExpression("");
      lastBuilderCompiledRef.current = "";
      return;
    }
    const compiled = compile(tree);
    setExpression(compiled);
    lastBuilderCompiledRef.current = compiled;
  };

  // On mode switch to builder, attempt to parse the current expression
  const handleModeChange = (next: ScreenerMode) => {
    if (next === "builder" && expression !== lastBuilderCompiledRef.current) {
      const result = parse(expression, "fundamental");
      if (result.ok) {
        setBuilderTree(result.tree);
        setUnparseableReason(undefined);
        lastBuilderCompiledRef.current = expression;
      } else {
        setUnparseableReason(result.reason);
      }
    }
    setMode(next);
  };

  const loadPresetIntoBuilder = (exprStr: string) => {
    setExpression(exprStr);
    const result = parse(exprStr, "fundamental");
    if (result.ok) {
      setBuilderTree(result.tree);
      setUnparseableReason(undefined);
      lastBuilderCompiledRef.current = exprStr;
    } else {
      // Mirror Expert's PR 1 behaviour: flip to Expression mode so the user
      // sees their expression rather than an empty builder + note.
      setUnparseableReason(result.reason);
      setMode("expression");
    }
  };

  const {
    progress,
    results,
    summary,
    error,
    coinError,
    isRunning,
    runScreener,
    cancelScreener,
  } = useFundamentalScreener();

  // Real-time expression validation (PR 1.5 hook, fundamental variant).
  const validation = useExpressionValidation(expression, !isRunning, "fundamental");
  const runDisabled =
    !expression.trim() || validation.isValidating || !validation.isValid;

  const [sortKey, setSortKey] = useState<string>("market_cap");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      const av = a.fundamentals[sortKey] ?? -Infinity;
      const bv = b.fundamentals[sortKey] ?? -Infinity;
      return sortDir === "desc" ? (bv as number) - (av as number) : (av as number) - (bv as number);
    });
  }, [results, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const visibleCols = useMemo(() => {
    if (summary?.fundamental_columns && summary.fundamental_columns.length > 0) {
      return summary.fundamental_columns.filter((c) => DISPLAY_COLUMNS.includes(c));
    }
    return DISPLAY_COLUMNS;
  }, [summary]);

  const handleRun = () => {
    const expr = expression.trim();
    if (!expr) return;
    startTimeRef.current = Date.now();
    runScreener(expr);
  };

  useEffect(() => {
    if (autorunConsumedRef.current || isRunning) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("autorun") !== "1") return;

    const exprParam = params.get("expr");
    const expr = exprParam ? decodeURIComponent(exprParam).trim() : expression.trim();
    if (!expr) return;

    autorunConsumedRef.current = true;
    setExpression(expr);
    const parsed = parse(expr, "fundamental");
    if (parsed.ok) {
      setBuilderTree(parsed.tree);
      setUnparseableReason(undefined);
      lastBuilderCompiledRef.current = expr;
    }
    startTimeRef.current = Date.now();
    runScreener(expr);
  }, [expression, isRunning, runScreener]);

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
      await saveResultMutation.mutateAsync({
        name: saveName.trim(),
        expression: expression.trim(),
        resultCount: summary.matched,
        matchingSymbols: results.map((row) => ({
          symbol: row.symbol,
          companyName: row.companyName,
          sector: row.sector,
          industry: row.industry,
          fundamentals: row.fundamentals,
        })),
        executionTimeMs: startTimeRef.current ? Date.now() - startTimeRef.current : undefined,
      });
      toast.success("Results saved successfully");
      setSaveDialogOpen(false);
      setSaveName("");
    } catch (error: any) {
      toast.error(error.message || "Failed to save results");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Sample Templates — replaces the legacy fundamentalPresets chips.
          Layout mirrors Expert's /expert-screener pattern. */}
      <SampleTemplates
        templates={FUNDAMENTAL_SAMPLE_TEMPLATES}
        onTemplateSelect={loadPresetIntoBuilder}
        disabled={isRunning}
      />

      {/* My Templates (user-saved Fundamental templates) */}
      <MyTemplates
        screenerType="fundamental"
        onLoad={loadPresetIntoBuilder}
        onRename={(t) => {
          setEditingTemplate(t);
          setSaveTemplateOpen(true);
        }}
        disabled={isRunning}
      />

      {/* Mode toggle row */}
      <div className="flex items-center justify-between">
        <ModeToggle mode={mode} onChange={handleModeChange} />
        <p className="text-xs text-muted-foreground">
          {mode === "builder" ? "Visual condition builder" : "Python-style free-text expression"}
        </p>
      </div>

      {/* Expression input + presets */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          {mode === "builder" ? (
            <ConditionBuilder
              variant="fundamental"
              tree={builderTree}
              onTreeChange={handleBuilderChange}
              unparseableReason={unparseableReason}
            />
          ) : (
            <Textarea
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              placeholder="trailing_pe < 20 and return_on_equity > 15 and debt_to_equity < 1"
              className="min-h-[80px] font-mono text-sm"
            />
          )}

          {/* Run / Cancel / Save-as-Template — chips removed in PR 3 (replaced by <SampleTemplates>) */}
          <div className="mt-3 flex flex-wrap gap-2">
            {isRunning ? (
              <Button variant="destructive" size="sm" onClick={cancelScreener}>
                <X className="w-3.5 h-3.5 mr-1" />
                Cancel
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleRun}
                disabled={runDisabled}
                aria-busy={validation.isValidating}
              >
                <PlayCircle className="w-3.5 h-3.5 mr-1" />
                Run Screener
              </Button>
            )}
            {!isRunning && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingTemplate(null);
                  setSaveTemplateOpen(true);
                }}
                disabled={runDisabled}
                className="gap-1.5"
              >
                <Bookmark className="h-3.5 w-3.5" />
                Save as Template
              </Button>
            )}
          </div>

          {/* Inline validation error / offline note */}
          {validation.error && (
            <div className="mt-2 text-xs text-destructive">{validation.error}</div>
          )}
          {validation.isOffline && !validation.error && (
            <div className="mt-2 text-[11px] text-muted-foreground">
              Validation offline — Run will still try.
            </div>
          )}
        </div>

        {/* Cheatsheet + stats */}
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <Alert className="mb-3 bg-muted/30 border-border">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-[10px] font-mono text-muted-foreground">
              {variableCheatsheet.map((group) => (
                <div key={group.cat} className="mb-1">
                  <span className="text-primary font-semibold">{group.cat}:</span>{" "}
                  {group.vars}
                </div>
              ))}
              <div className="mt-1 text-[9px]">
                Operators: {">"} {"<"} {">="} {"<="} {"=="} {"!="} and or not + - * /
              </div>
            </AlertDescription>
          </Alert>

          {/* Stats */}
          {(summary || progress) && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded bg-muted/30 p-2 border border-border">
                <p className="text-muted-foreground">Matches</p>
                <p className="text-lg font-semibold text-primary">
                  {summary?.matched ?? progress?.matches ?? 0}
                </p>
              </div>
              <div className="rounded bg-muted/30 p-2 border border-border">
                <p className="text-muted-foreground">Universe</p>
                <p className="text-lg font-semibold">
                  {summary?.universe ?? progress?.total ?? 0}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Progress */}
      {isRunning && progress && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <div className="flex-1">
              <Progress value={(progress.processed / Math.max(progress.total, 1)) * 100} className="h-2" />
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              {progress.processed}/{progress.total} | {progress.matches} matches
            </span>
          </div>
        </div>
      )}

      {/* Coin gate (insufficient coins / tier blocked) */}
      {coinError && <CoinGateAlert coinError={coinError} />}

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Results table */}
      {sortedResults.length > 0 && (
        <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-2 border-b border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-mono">
              {sortedResults.length} stocks matched
            </span>
          </div>
          <ScrollArea className="max-h-[500px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card border-b border-border">
                <tr>
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium">#</th>
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium">Symbol</th>
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium">Sector</th>
                  {visibleCols.map((col) => (
                    <th
                      key={col}
                      className="text-right px-3 py-2 text-muted-foreground font-medium cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort(col)}
                    >
                      {friendlyName(col)} {sortKey === col ? (sortDir === "desc" ? "↓" : "↑") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((row, i) => (
                  <tr key={row.symbol} className="border-b border-border/50 hover:bg-accent/50">
                    <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-1.5">
                      <div>
                        <span className="font-mono font-medium text-foreground">{row.symbol}</span>
                        <div className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                          {row.companyName}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <Badge variant="outline" className="text-[9px] font-normal">
                        {row.sector}
                      </Badge>
                    </td>
                    {visibleCols.map((col) => (
                      <td key={col} className="text-right px-3 py-1.5 font-mono">
                        {formatFundamental(col, row.fundamentals[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </div>
      )}

      {!isRunning && summary && results.length > 0 && (
        <div className="rounded-lg border border-positive/40 bg-positive/10 p-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm text-positive">
              Scan complete. Found {summary.matched} {summary.matched === 1 ? "match" : "matches"} out of {summary.universe} stocks.
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
                    <DialogTitle>Save Fundamental Scanner Results</DialogTitle>
                    <DialogDescription>
                      Give this scanner run a name to save it in your library.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="fundamental-save-name">Name</Label>
                      <Input
                        id="fundamental-save-name"
                        placeholder="e.g., Low debt quality stocks"
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
                    <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={saveResultMutation.isPending}>
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

      {/* Empty state after run */}
      {!isRunning && summary && sortedResults.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No stocks matched the expression.
        </div>
      )}

      {/* Save as Template dialog (PR 3) — single instance, used for both create and rename. */}
      <SaveTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={(next) => {
          setSaveTemplateOpen(next);
          if (!next) setEditingTemplate(null);
        }}
        expression={expression.trim()}
        screenerType="fundamental"
        validation={validation}
        initial={
          editingTemplate
            ? {
                id: editingTemplate.id,
                name: editingTemplate.name,
                description: editingTemplate.description,
              }
            : undefined
        }
      />
    </div>
  );
}
