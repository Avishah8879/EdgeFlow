import { useState, useMemo, useRef, useEffect } from "react";
import { Loader2, PlayCircle, X, Info, Sparkles } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useFundamentalScreener } from "@/hooks/use-fundamental-screener";
import type { FundamentalResult } from "@/hooks/use-fundamental-screener";
import { ModeToggle, type ScreenerMode } from "@/components/screener/ModeToggle";
import { ConditionBuilder } from "@/components/screener/ConditionBuilder";
import { compile, isEmpty } from "@/lib/screener/compile";
import { parse } from "@/lib/screener/parse";
import type { BuilderTree } from "@/lib/screener/types";

const fundamentalPresets = [
  {
    label: "Value Pick",
    value: "trailing_pe < 15 and price_to_book < 2 and dividend_yield > 1",
  },
  {
    label: "Growth Monster",
    value: "earnings_growth > 20 and revenue_growth > 15 and return_on_equity > 15",
  },
  {
    label: "Low Debt Quality",
    value: "debt_to_equity < 0.5 and current_ratio > 1.5 and profit_margin > 10",
  },
  {
    label: "Large Cap Dividend",
    value: "market_cap > 50000000000 and dividend_yield > 2 and payout_ratio < 60",
  },
];

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
  const [expression, setExpression] = useState(fundamentalPresets[0].value);
  const [mode, setMode] = useState<ScreenerMode>("builder");
  const [builderTree, setBuilderTree] = useState<BuilderTree>({
    kind: "group",
    id: "root",
    children: [],
  });
  const [unparseableReason, setUnparseableReason] = useState<string | undefined>();
  const lastBuilderCompiledRef = useRef<string>("");

  // Hydrate builder from current expression on mount
  useEffect(() => {
    const result = parse(expression, "fundamental");
    if (result.ok) {
      setBuilderTree(result.tree);
      setUnparseableReason(undefined);
      lastBuilderCompiledRef.current = expression;
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
      setUnparseableReason(result.reason);
    }
  };

  const {
    progress,
    results,
    summary,
    error,
    isRunning,
    runScreener,
    cancelScreener,
  } = useFundamentalScreener();

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
    runScreener(expr);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Mode toggle (standalone row above card) */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Fundamental Screener</h2>
          <p className="text-xs text-[#9f9f9f]">
            Filter stocks by fundamental metrics like P/E, ROE, Market Cap, Debt/Equity, etc.
          </p>
        </div>
        <ModeToggle mode={mode} onChange={handleModeChange} />
      </div>

      {/* Expression input + presets */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-lg border border-[#1f1f1f] bg-black/40 p-4 shadow-lg shadow-black/30">
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
              className="min-h-[80px] bg-black/60 font-mono text-sm text-white border-[#2a2a2a]"
            />
          )}

          {/* Presets */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {fundamentalPresets.map((preset) => (
              <Button
                key={preset.label}
                variant="outline"
                size="sm"
                className="h-7 text-[10px]"
                onClick={() => loadPresetIntoBuilder(preset.value)}
              >
                <Sparkles className="w-3 h-3 mr-1" />
                {preset.label}
              </Button>
            ))}
          </div>

          {/* Run / Cancel */}
          <div className="mt-3 flex gap-2">
            {isRunning ? (
              <Button variant="destructive" size="sm" onClick={cancelScreener}>
                <X className="w-3.5 h-3.5 mr-1" />
                Cancel
              </Button>
            ) : (
              <Button size="sm" onClick={handleRun} disabled={!expression.trim()}>
                <PlayCircle className="w-3.5 h-3.5 mr-1" />
                Run Screener
              </Button>
            )}
          </div>
        </div>

        {/* Cheatsheet + stats */}
        <div className="rounded-lg border border-[#1f1f1f] bg-black/40 p-4 shadow-lg shadow-black/30">
          <Alert className="mb-3 bg-transparent border-[#2a2a2a]">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-[10px] font-mono text-[#9f9f9f]">
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
              <div className="rounded bg-black/40 p-2 border border-[#1f1f1f]">
                <p className="text-[#7f7f7f]">Matches</p>
                <p className="text-lg font-semibold text-primary">
                  {summary?.matched ?? progress?.matches ?? 0}
                </p>
              </div>
              <div className="rounded bg-black/40 p-2 border border-[#1f1f1f]">
                <p className="text-[#7f7f7f]">Universe</p>
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
        <div className="rounded-lg border border-[#1f1f1f] bg-black/40 p-3">
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

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Results table */}
      {sortedResults.length > 0 && (
        <div className="rounded-lg border border-[#1f1f1f] bg-black/40 shadow-lg shadow-black/30 overflow-hidden">
          <div className="px-4 py-2 border-b border-[#1f1f1f] flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-mono">
              {sortedResults.length} stocks matched
            </span>
          </div>
          <ScrollArea className="max-h-[500px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[#0a0a0a] border-b border-[#1f1f1f]">
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
                  <tr key={row.symbol} className="border-b border-[#1f1f1f]/50 hover:bg-[#1a1a1a]">
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

      {/* Empty state after run */}
      {!isRunning && summary && sortedResults.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No stocks matched the expression.
        </div>
      )}
    </div>
  );
}
