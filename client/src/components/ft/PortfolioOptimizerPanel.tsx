import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ReferenceLine,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import {
  Loader2,
  AlertCircle,
  Bookmark,
  FolderOpen,
  Info,
  Plus,
  Trash2,
  TrendingUp,
  Search,
  Upload,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSymbolSearch } from "@/hooks/useSymbolSearch";
import { useSavePortfolioOptimizerResult } from "@/hooks/use-saved-results";
import {
  usePortfolioOptimizer,
  type PortfolioHolding,
  type OptimizationResult,
} from "@/hooks/usePortfolioOptimizer";
import { getCSSColor } from "@/lib/theme-utils";
import { RRGChart } from "@/components/ft/RRGChart";
import { RRGQuadrantTable } from "@/components/ft/RRGQuadrantTable";
import { Link } from "wouter";
import { toast } from "sonner";

const COLORS = {
  primary: "#00FF00",
  secondary: "#FF6B47",
  accent: "#FFD700",
  buy: "#00FF00",
  sell: "#FF4444",
  hold: "#888888",
  frontier: "#FF6B47",
  current: "#FFD700",
  tangency: "#00FF00",
  cml: "#FF6B35",
  equity: "#FF6B47",
};

// Colors for rolling weights stacked area chart
const ROLLING_WEIGHT_COLORS = [
  "#00FF00", // Matrix Green
  "#FF6B47", // Coral
  "#FFD700", // Gold
  "#FF6B35", // Orange
  "#E040FB", // Purple
  "#00E5FF", // Cyan
  "#FFEB3B", // Yellow
  "#FF5252", // Red
  "#69F0AE", // Light Green
  "#448AFF", // Light Blue
];

export function PortfolioOptimizerPanel() {
  // Holdings state
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [lastSubmittedHoldings, setLastSubmittedHoldings] = useState<PortfolioHolding[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const autorunConsumedRef = useRef(false);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const saveResultMutation = useSavePortfolioOptimizerResult();

  // Search hook
  const { data: searchResults, isLoading: isSearching } =
    useSymbolSearch(searchQuery);

  // Optimizer hook
  const {
    submit,
    reset,
    isLoading,
    isSubmitting,
    isPolling,
    jobStatus,
    result,
    error,
  } = usePortfolioOptimizer();

  // Add holding from search
  const addHolding = useCallback(
    (symbol: string, name?: string) => {
      if (holdings.some((h) => h.symbol === symbol)) {
        return; // Already exists
      }
      setHoldings([...holdings, { symbol, name, quantity: 0 }]);
      setSearchQuery("");
      setShowDropdown(false);
    },
    [holdings]
  );

  // Update holding quantity
  const updateQuantity = useCallback(
    (symbol: string, quantity: number) => {
      setHoldings(
        holdings.map((h) => (h.symbol === symbol ? { ...h, quantity } : h))
      );
    },
    [holdings]
  );

  // Remove holding
  const removeHolding = useCallback(
    (symbol: string) => {
      setHoldings(holdings.filter((h) => h.symbol !== symbol));
    },
    [holdings]
  );

  // Submit optimization with default parameters
  const handleSubmit = useCallback(() => {
    const validHoldings = holdings.filter((h) => h.quantity > 0);
    if (validHoldings.length < 2) {
      return;
    }

    startedAtRef.current = Date.now();
    setLastSubmittedHoldings(validHoldings);
    submit({
      holdings: validHoldings,
    });
  }, [holdings, submit]);

  useEffect(() => {
    if (autorunConsumedRef.current || isLoading) return;
    const params = new URLSearchParams(window.location.search);
    const holdingsParam = params.get("holdings");
    if (!holdingsParam) return;

    let parsedHoldings: PortfolioHolding[];
    try {
      const raw = JSON.parse(decodeURIComponent(holdingsParam));
      if (!Array.isArray(raw)) return;
      parsedHoldings = raw
        .map((item: any) => ({
          symbol: String(item.symbol || "").replace(/\.(NS|BO)$/i, "").toUpperCase(),
          name: item.name ? String(item.name) : undefined,
          quantity: Number(item.quantity),
        }))
        .filter((item) => item.symbol && Number.isFinite(item.quantity) && item.quantity > 0);
    } catch {
      toast.error("Could not load saved portfolio configuration");
      return;
    }

    if (parsedHoldings.length < 2) return;

    autorunConsumedRef.current = true;
    setHoldings(parsedHoldings);
    setLastSubmittedHoldings(parsedHoldings);

    if (params.get("autorun") === "1") {
      startedAtRef.current = Date.now();
      submit({ holdings: parsedHoldings });
    }
  }, [isLoading, submit]);

  const handleSave = useCallback(async () => {
    if (!saveName.trim()) {
      toast.error("Please enter a name for the result");
      return;
    }

    if (!result) {
      toast.error("No result to save");
      return;
    }

    try {
      await saveResultMutation.mutateAsync({
        name: saveName.trim(),
        holdings: lastSubmittedHoldings.length > 0 ? lastSubmittedHoldings : holdings.filter((h) => h.quantity > 0),
        params: {
          risk_free_rate: result.risk_free_rate,
          rebalance_frequency: result.optimal_rebalance_frequency,
        },
        result,
        executionTimeMs: startedAtRef.current ? Date.now() - startedAtRef.current : undefined,
      });
      toast.success("Portfolio result saved successfully");
      setSaveDialogOpen(false);
      setSaveName("");
    } catch (error: any) {
      toast.error(error.message || "Failed to save result");
    }
  }, [holdings, lastSubmittedHoldings, result, saveName, saveResultMutation]);

  const parsePortfolioCsv = useCallback((text: string): PortfolioHolding[] => {
    const rows = text
      .split(/\r?\n/)
      .map((row) => row.trim())
      .filter(Boolean)
      .map((row) => row.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")));

    if (rows.length < 2) {
      throw new Error("CSV must include a header row and at least two holdings");
    }

    const headers = rows[0].map((header) => header.toLowerCase());
    const symbolIndex = headers.indexOf("symbol");
    const weightIndex = headers.findIndex((header) => ["weight", "weight%", "quantity", "allocation"].includes(header));
    const nameIndex = headers.indexOf("name");

    if (symbolIndex === -1 || weightIndex === -1) {
      throw new Error("CSV must have symbol and weight columns");
    }

    const parsed = rows.slice(1).map((row) => {
      const symbol = (row[symbolIndex] || "").replace(/\.(NS|BO)$/i, "").toUpperCase();
      const quantity = Number.parseFloat((row[weightIndex] || "").replace("%", ""));
      const name = nameIndex >= 0 ? row[nameIndex] : undefined;

      if (!/^[A-Z0-9&-]+$/.test(symbol) || !Number.isFinite(quantity) || quantity <= 0) {
        throw new Error("Each row needs a valid symbol and positive weight");
      }

      return { symbol, name, quantity };
    });

    const bySymbol = new Map<string, PortfolioHolding>();
    for (const holding of parsed) {
      bySymbol.set(holding.symbol, holding);
    }

    if (bySymbol.size < 2) {
      throw new Error("Portfolio must include at least two unique holdings");
    }

    return Array.from(bySymbol.values());
  }, []);

  const handleCsvUpload = useCallback(
    (file: File | null) => {
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = parsePortfolioCsv(String(reader.result || ""));
          const total = parsed.reduce((sum, holding) => sum + holding.quantity, 0);
          setHoldings(parsed);
          reset();
          toast.success(`Loaded ${parsed.length} holdings from CSV`, {
            description: Math.abs(total - 100) > 1 ? `Weights total ${total.toFixed(1)}%.` : undefined,
          });
        } catch (error: any) {
          toast.error(error.message || "Invalid portfolio CSV");
        } finally {
          if (csvInputRef.current) csvInputRef.current.value = "";
        }
      };
      reader.onerror = () => {
        toast.error("Could not read CSV file");
        if (csvInputRef.current) csvInputRef.current.value = "";
      };
      reader.readAsText(file);
    },
    [parsePortfolioCsv, reset]
  );

  const validHoldingsCount = holdings.filter((h) => h.quantity > 0).length;
  const canSubmit = validHoldingsCount >= 2 && !isLoading;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Portfolio Optimizer
            </span>
          </div>
          {result && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px]"
              onClick={reset}
            >
              Reset
            </Button>
          )}
        </div>

        {/* CSV Upload */}
        <div className="mb-2 flex items-center gap-2">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => handleCsvUpload(event.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-2"
            onClick={() => csvInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            Upload CSV
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="CSV format"
                >
                  <Info className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" align="start" className="max-w-xs text-xs">
                <div className="space-y-2">
                  <p className="font-semibold">CSV format</p>
                  <pre className="rounded bg-muted px-2 py-1 font-mono text-[11px] leading-relaxed">
{`symbol,weight
RELIANCE,40
TCS,30
INFY,30`}
                  </pre>
                  <p className="text-muted-foreground">
                    Header required. You can use weight, weight%, quantity, or allocation.
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Stock Search */}
        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value.toUpperCase());
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search stock (e.g., RELIANCE)"
                className="h-8 pl-7 bg-muted/30 border-border text-foreground font-mono text-sm"
              />
            </div>
          </div>

          {/* Search Dropdown */}
          {showDropdown && searchQuery.length >= 2 && (
            <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded max-h-48 overflow-y-auto shadow-md">
              {isSearching ? (
                <div className="p-2 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : searchResults && searchResults.length > 0 ? (
                searchResults.map((item) => (
                  <div
                    key={item.symbol}
                    className="px-3 py-2 hover:bg-accent cursor-pointer flex items-center justify-between"
                    onClick={() => addHolding(item.symbol, item.name)}
                  >
                    <div>
                      <span className="text-sm text-primary font-mono">
                        {item.symbol}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {item.name}
                      </span>
                    </div>
                    <Plus className="w-3 h-3 text-muted-foreground" />
                  </div>
                ))
              ) : (
                <div className="p-2 text-xs text-muted-foreground text-center">
                  No results found
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Holdings Table */}
      {holdings.length > 0 && (
        <div className="border-b border-border">
          <div className="px-3 py-2">
            <div className="flex justify-between items-center mb-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Current Holdings ({holdings.length})
              </div>
              <div className={`text-[10px] font-mono ${
                Math.abs(holdings.reduce((sum, h) => sum + (h.quantity || 0), 0) - 100) < 1
                  ? "text-positive"
                  : "text-primary"
              }`}>
                Total: {holdings.reduce((sum, h) => sum + (h.quantity || 0), 0).toFixed(1)}%
              </div>
            </div>
            <div className="grid grid-cols-[1fr_80px_32px] gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              <div>Symbol</div>
              <div className="text-right">Weight %</div>
              <div></div>
            </div>
            <div className="max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
              {holdings.map((holding) => (
                <div
                  key={holding.symbol}
                  className="grid grid-cols-[1fr_80px_32px] gap-2 py-1 items-center"
                >
                  <div>
                    <span className="text-sm text-primary font-mono">
                      {holding.symbol}
                    </span>
                    {holding.name && (
                      <span className="text-[10px] text-muted-foreground ml-2 truncate">
                        {holding.name}
                      </span>
                    )}
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={holding.quantity || ""}
                    onChange={(e) =>
                      updateQuantity(
                        holding.symbol,
                        parseFloat(e.target.value) || 0
                      )
                    }
                    placeholder="33.3"
                    className="h-6 text-right bg-muted/30 border-border text-foreground font-mono text-sm"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => removeHolding(holding.symbol)}
                  >
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <div className="p-3 border-b border-border">
        <Button
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Submitting...
            </>
          ) : isPolling ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Optimizing... ({jobStatus})
            </>
          ) : (
            "Optimize Portfolio"
          )}
        </Button>
        {!canSubmit && holdings.length > 0 && validHoldingsCount < 2 && (
          <p className="text-[10px] text-destructive mt-1 text-center">
            Enter quantities for at least 2 stocks
          </p>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-3 border-b border-border bg-destructive/10">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Results */}
      {result && <OptimizationResults result={result} />}

      {result && (
        <div className="p-3 border-t border-border bg-positive/10">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm text-positive">Optimization complete.</span>
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
                    <DialogTitle>Save Portfolio Optimizer Result</DialogTitle>
                    <DialogDescription>
                      Name this optimizer run so you can revisit the allocation later.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="portfolio-save-name">Name</Label>
                      <Input
                        id="portfolio-save-name"
                        placeholder="e.g., Long-term core allocation"
                        value={saveName}
                        onChange={(e) => setSaveName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSave();
                        }}
                      />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Holdings: {(lastSubmittedHoldings.length > 0 ? lastSubmittedHoldings : holdings).filter((h) => h.quantity > 0).length}
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

      {/* Empty State */}
      {!result && !isLoading && holdings.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6">
          <TrendingUp className="w-12 h-12 mb-4 opacity-50" />
          <p className="text-sm text-center">
            Add stocks to your portfolio and enter the number of shares you own
          </p>
          <p className="text-xs mt-2 text-center">
            The optimizer will suggest optimal allocation using Black-Litterman
            model
          </p>
        </div>
      )}
    </div>
  );
}

// Results Component
export function OptimizationResults({ result }: { result: OptimizationResult }) {
  // Theme-aware chart chrome — re-resolve when light/dark theme changes
  const { resolvedTheme } = useTheme();
  const chartColors = useMemo(
    () => ({
      grid: getCSSColor("--border"),
      axis: getCSSColor("--muted-foreground"),
      tooltipBg: getCSSColor("--card"),
      tooltipBorder: getCSSColor("--border"),
      accent: getCSSColor("--primary"),
    }),
    // resolvedTheme intentional: triggers re-read on theme switch
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedTheme]
  );

  // Find the closest date in equity curve data to OOS start for reference line
  const oosLineDate = (() => {
    if (!result.oos_start || !result.equity_curve?.length) return null;
    const oosDate = new Date(result.oos_start).getTime();
    let closestDate = result.equity_curve[0].date;
    let minDiff = Math.abs(new Date(closestDate).getTime() - oosDate);

    for (const point of result.equity_curve) {
      const diff = Math.abs(new Date(point.date).getTime() - oosDate);
      if (diff < minDiff) {
        minDiff = diff;
        closestDate = point.date;
      }
    }
    return closestDate;
  })();

  return (
    <ScrollArea className="flex-1">
      <div className="p-3 space-y-4">
        {/* Weight Comparison */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Weight Comparison
          </div>
          <div className="border border-border rounded">
            <div className="grid grid-cols-4 gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30">
              <div>Symbol</div>
              <div className="text-right">Current</div>
              <div className="text-right">Optimal</div>
              <div className="text-right">Change</div>
            </div>
            {result.weight_comparison.map((item) => (
              <div
                key={item.symbol}
                className="grid grid-cols-4 gap-2 px-3 py-2 border-b border-border last:border-0"
              >
                <div className="text-sm text-foreground font-mono">
                  {item.symbol}
                </div>
                <div className="text-right font-mono text-sm text-muted-foreground">
                  {item.current_weight.toFixed(2)}%
                </div>
                <div className="text-right font-mono text-sm text-primary">
                  {item.optimal_weight.toFixed(2)}%
                </div>
                <div
                  className={`text-right font-mono text-sm ${
                    item.change > 0
                      ? "text-positive"
                      : item.change < 0
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  {item.change > 0 ? "+" : ""}
                  {item.change.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Equity Curve Chart */}
        {result.equity_curve && result.equity_curve.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Equity Curve (IS + OOS)
            </div>
            <div className="h-[200px] border border-border rounded p-2 bg-muted/30">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={result.equity_curve}
                  margin={{ top: 10, right: 30, bottom: 20, left: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                  <XAxis
                    dataKey="date"
                    stroke={chartColors.axis}
                    style={{ fontSize: "9px", fontFamily: "monospace" }}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return `${date.getFullYear()}`;
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke={chartColors.axis}
                    style={{ fontSize: "9px", fontFamily: "monospace" }}
                    tickFormatter={(v) => v.toFixed(1)}
                    domain={["auto", "auto"]}
                  />
                  <ChartTooltip
                    contentStyle={{
                      backgroundColor: chartColors.tooltipBg,
                      border: `1px solid ${chartColors.tooltipBorder}`,
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontFamily: "monospace",
                    }}
                    labelFormatter={(value) => {
                      const date = new Date(value);
                      return date.toLocaleDateString("en-IN", {
                        month: "short",
                        year: "numeric",
                      });
                    }}
                    formatter={(value: number) => [
                      value.toFixed(4),
                      "Portfolio Value",
                    ]}
                  />
                  {/* Train/Test Split Line (OOS Start) */}
                  {oosLineDate && (
                    <ReferenceLine
                      x={oosLineDate}
                      stroke={chartColors.accent}
                      strokeDasharray="5 5"
                      strokeWidth={2}
                      label={{
                        value: "OOS",
                        position: "insideTopRight",
                        fill: chartColors.accent,
                        fontSize: 10,
                        fontFamily: "monospace",
                      }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="value"
                    name="Equity"
                    stroke={COLORS.equity}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Efficient Frontier Chart */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Efficient Frontier with Capital Market Line
          </div>
          <div className="h-[250px] border border-border rounded p-2 bg-muted/30">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart
                margin={{ top: 10, right: 30, bottom: 30, left: 50 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis
                  type="number"
                  dataKey="volatility"
                  name="Volatility"
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
                  stroke={chartColors.axis}
                  style={{ fontSize: "10px", fontFamily: "monospace" }}
                  label={{
                    value: "Volatility",
                    position: "bottom",
                    offset: 10,
                    style: {
                      fontSize: "10px",
                      fill: chartColors.axis,
                      fontFamily: "monospace",
                    },
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="return"
                  name="Return"
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
                  stroke={chartColors.axis}
                  style={{ fontSize: "10px", fontFamily: "monospace" }}
                  label={{
                    value: "Expected Return",
                    angle: -90,
                    position: "insideLeft",
                    style: {
                      fontSize: "10px",
                      fill: chartColors.axis,
                      fontFamily: "monospace",
                    },
                  }}
                />
                <ChartTooltip
                  contentStyle={{
                    backgroundColor: chartColors.tooltipBg,
                    border: `1px solid ${chartColors.tooltipBorder}`,
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontFamily: "monospace",
                  }}
                  formatter={(value: number, name: string) => [
                    `${(value * 100).toFixed(2)}%`,
                    name === "volatility" ? "Volatility" : "Return",
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: "10px", fontFamily: "monospace" }}
                />

                {/* Efficient Frontier Line */}
                <Scatter
                  name="Efficient Frontier"
                  data={result.efficient_frontier}
                  fill={COLORS.frontier}
                  line={{ stroke: COLORS.frontier, strokeWidth: 3 }}
                  shape={() => <></>}
                  legendType="line"
                />

                {/* Capital Market Line */}
                {result.capital_market_line && (
                  <Scatter
                    name="Capital Market Line"
                    data={[
                      result.capital_market_line.start,
                      result.capital_market_line.end,
                    ]}
                    fill="none"
                    line={{ stroke: COLORS.cml, strokeWidth: 2, strokeDasharray: "5 5" }}
                    shape={() => <></>}
                    legendType="line"
                  />
                )}

                {/* Current Portfolio Point */}
                <Scatter
                  name="Current Portfolio"
                  data={[result.current_point]}
                  fill={COLORS.current}
                  shape="diamond"
                  legendType="diamond"
                >
                  {/* Larger marker */}
                </Scatter>

                {/* Tangency (Optimal) Point */}
                <Scatter
                  name="Tangency Portfolio"
                  data={[result.tangency_point]}
                  fill={COLORS.tangency}
                  shape="star"
                  legendType="star"
                >
                  {/* Larger marker */}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Rolling Portfolio Weights Chart */}
        {result.rolling_weights && result.rolling_weights.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Rolling Portfolio Weights
            </div>
            <div className="h-[200px] border border-border rounded p-2 bg-muted/30">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={result.rolling_weights}
                  margin={{ top: 10, right: 30, bottom: 20, left: 40 }}
                  stackOffset="expand"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                  <XAxis
                    dataKey="date"
                    stroke={chartColors.axis}
                    style={{ fontSize: "9px", fontFamily: "monospace" }}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return `${date.getFullYear()}`;
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke={chartColors.axis}
                    style={{ fontSize: "9px", fontFamily: "monospace" }}
                    tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                    domain={[0, 1]}
                  />
                  <ChartTooltip
                    contentStyle={{
                      backgroundColor: chartColors.tooltipBg,
                      border: `1px solid ${chartColors.tooltipBorder}`,
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontFamily: "monospace",
                    }}
                    labelFormatter={(value) => {
                      const date = new Date(value);
                      return date.toLocaleDateString("en-IN", {
                        month: "short",
                        year: "numeric",
                      });
                    }}
                    formatter={(value: number) => [`${value.toFixed(1)}%`, ""]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "9px", fontFamily: "monospace" }}
                  />
                  {result.rolling_weight_symbols.map((symbol, index) => (
                    <Area
                      key={symbol}
                      type="monotone"
                      dataKey={symbol}
                      stackId="1"
                      stroke={ROLLING_WEIGHT_COLORS[index % ROLLING_WEIGHT_COLORS.length]}
                      fill={ROLLING_WEIGHT_COLORS[index % ROLLING_WEIGHT_COLORS.length]}
                      fillOpacity={0.8}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Relative Rotation Graph (RRG) — same symbols as the portfolio */}
        {result.weight_comparison && result.weight_comparison.length >= 2 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Relative Rotation Graph
            </div>
            <RRGChart
              symbols={result.weight_comparison.map((w) => w.symbol)}
              period="2y"
              height={420}
            />
            <div className="mt-3">
              <RRGQuadrantTable
                symbols={result.weight_comparison.map((w) => w.symbol)}
                period="2y"
              />
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="text-[10px] text-muted-foreground flex justify-between">
          <span>
            Risk-Free Rate: {(result.risk_free_rate * 100).toFixed(1)}%
          </span>
          <span>
            Rebalance: {result.optimal_rebalance_frequency === "M" ? "Monthly" : result.optimal_rebalance_frequency === "W" ? "Weekly" : "Bi-Weekly"}
          </span>
          <span>
            Computed:{" "}
            {new Date(result.computed_at).toLocaleString("en-IN", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </span>
        </div>
      </div>
    </ScrollArea>
  );
}
