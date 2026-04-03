import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Loader2,
  PlayCircle,
  Download,
  Save,
  Sparkles,
  Info,
  AlertTriangle,
  X,
  Search,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { StockChart } from "@/components/ft/StockChart";

interface ScreenerRow {
  symbol: string;
  close: number;
  volume: number;
  liquidity: number;
  asOf: string;
  indicators: Record<string, number | null>;
}

interface ScreenerSummary {
  expression: string;
  generatedAt: string;
  matched: number;
  universe: number;
  missingSymbols: string[];
  results: ScreenerRow[];
  indicatorColumns: string[];
}

interface ExpressionPreset {
  name: string;
  value: string;
}

interface RunPayload {
  expression: string;
  symbols?: string[];
}

const defaultExpression =
  "(close > ema_50) and (ema_50 > ema_150) and (ema_150 > ema_200) and " +
  "(atr_14 < atr_14_shift_10) and (atr_14 / close < 0.08) and " +
  "(close > 0.75 * high_52_W) and (close > 10) and (liquidity > 1000000)";

const presetExpressions = [
  {
    label: "Trend Stack",
    value: defaultExpression,
  },
  {
    label: "Low Volatility",
    value:
      "(close > ema_100) and (atr_14 / close < 0.04) and (volume > 500000) and (liquidity > 2000000)",
  },
  {
    label: "Pullback",
    value:
      "(close > ema_200) and (close < ema_50) and (sma_20_shift_3 > sma_20) and (rsi_14 < 50)",
  },
  {
    label: "Breakout Scout",
    value:
      "(close > 0.98 * high_52_W) and (close > ema_50) and (sma_20 > sma_50) and (liquidity > 2000000)",
  },
];

const presetStorageKey = "finterminal-screener-presets";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});
const compactFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const normalizeScreenerResponse = (payload: any): ScreenerSummary => ({
  expression: payload?.expression ?? "",
  generatedAt: payload?.generated_at ?? "",
  matched: payload?.matched ?? 0,
  universe: payload?.universe ?? 0,
  missingSymbols: Array.isArray(payload?.missing_symbols)
    ? payload.missing_symbols
    : [],
  results: Array.isArray(payload?.results)
    ? payload.results.map((row: any) => ({
        symbol: row?.symbol ?? "",
        close: Number(row?.close ?? 0),
        volume: Number(row?.volume ?? 0),
        liquidity: Number(row?.liquidity ?? 0),
        asOf: row?.as_of ?? "",
        indicators: row?.indicators ?? {},
      }))
    : [],
  indicatorColumns: Array.isArray(payload?.indicator_columns)
    ? payload.indicator_columns
    : [],
});

const normalizeSymbols = (input: string): string[] => {
  const tokens = input.split(/[,\s]+/).map((token) => token.trim().toUpperCase());
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const token of tokens) {
    if (!token) continue;
    const symbol = token.includes(".") ? token : `${token}.NS`;
    if (!seen.has(symbol)) {
      seen.add(symbol);
      normalized.push(symbol);
    }
  }

  return normalized;
};

const formatMetricValue = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  const absValue = Math.abs(value);
  if (absValue >= 1000) {
    return currencyFormatter.format(value);
  }
  if (absValue >= 1) {
    return value.toFixed(2);
  }
  return value.toFixed(4);
};

const csvEscape = (value: unknown) => {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export function EquityScreener() {
  const [expression, setExpression] = useState(defaultExpression);
  const [customSymbolsInput, setCustomSymbolsInput] = useState("");
  const [visibleMetrics, setVisibleMetrics] = useState<string[]>([]);
  const [selectedRow, setSelectedRow] = useState<ScreenerRow | null>(null);
  const [presetName, setPresetName] = useState("");
  const [savedPresets, setSavedPresets] = useState<ExpressionPreset[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = window.localStorage.getItem(presetStorageKey);
      return stored ? (JSON.parse(stored) as ExpressionPreset[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(presetStorageKey, JSON.stringify(savedPresets));
  }, [savedPresets]);

  const parsedSymbols = useMemo(
    () => normalizeSymbols(customSymbolsInput),
    [customSymbolsInput],
  );

  const {
    mutate: triggerScreener,
    data: screenerData,
    isPending: isRunning,
    error: mutationErrorRaw,
  } = useMutation<ScreenerSummary, Error, RunPayload>({
    mutationFn: async (payload) => {
      const res = await apiRequest("POST", "/api/equity-screener", payload);
      const json = await res.json();
      return normalizeScreenerResponse(json?.data ?? json);
    },
    onSuccess: (data) => {
      setVisibleMetrics((prev) => {
        const sanitized = prev.filter((metric) =>
          data.indicatorColumns.includes(metric),
        );
        if (sanitized.length > 0) {
          return sanitized;
        }
        return data.indicatorColumns.slice(0, 4);
      });
    },
  });

  const results = screenerData?.results ?? [];
  const indicatorColumns = screenerData?.indicatorColumns ?? [];
  const missingSymbols = screenerData?.missingSymbols ?? [];
  const mutationError = mutationErrorRaw?.message;

  const handleRun = (overrideExpression?: string) => {
    const expr = (overrideExpression ?? expression).trim();
    if (!expr) return;

    const payload: RunPayload = { expression: expr };
    if (parsedSymbols.length > 0) {
      payload.symbols = parsedSymbols;
    }

    setSelectedRow(null);
    triggerScreener(payload);
  };

  const handleExport = () => {
    if (!results.length) return;
    const headers = [
      "symbol",
      "close",
      "volume",
      "liquidity",
      "as_of",
      ...indicatorColumns,
    ];

    const lines = [
      headers.map(csvEscape).join(","),
      ...results.map((row) =>
        headers
          .map((header) => {
            if (header === "symbol") return csvEscape(row.symbol);
            if (header === "close") return csvEscape(row.close);
            if (header === "volume") return csvEscape(row.volume);
            if (header === "liquidity") return csvEscape(row.liquidity);
            if (header === "as_of") return csvEscape(row.asOf);
            return csvEscape(row.indicators?.[header]);
          })
          .join(","),
      ),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `equity_screener_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePresetSave = () => {
    if (!presetName.trim() || !expression.trim()) return;
    const nextPreset: ExpressionPreset = {
      name: presetName.trim(),
      value: expression.trim(),
    };
    setSavedPresets((prev) => {
      const filtered = prev.filter(
        (preset) => preset.name.toLowerCase() !== nextPreset.name.toLowerCase(),
      );
      return [nextPreset, ...filtered].slice(0, 15);
    });
    setPresetName("");
  };

  const selectedStats = useMemo(() => {
    if (!selectedRow) return [];
    return Object.entries(selectedRow.indicators || {}).sort(([a], [b]) =>
      a.localeCompare(b),
    );
  }, [selectedRow]);

  const lastRunDisplay = screenerData?.generatedAt
    ? new Date(screenerData.generatedAt).toLocaleString()
    : "—";

  const visibleMetricSet = new Set(visibleMetrics);
  const maxMetrics = 6;

  const toggleMetric = (metric: string) => {
    setVisibleMetrics((prev) => {
      if (prev.includes(metric)) {
        return prev.filter((item) => item !== metric);
      }
      const next = [...prev, metric];
      if (next.length > maxMetrics) {
        next.shift();
      }
      return next;
    });
  };

  return (
    <ScrollArea className="h-full">
      <div className="flex min-h-full flex-col gap-4 pr-4">
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-lg border border-[#1f1f1f] bg-black/40 p-4 shadow-lg shadow-black/30">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Equity Screener
              </h2>
              <p className="text-xs text-[#9f9f9f]">
                Write expressions to filter the stocks from the NSE universe
              </p>
            </div>
            <Badge className="bg-[#0f172a] text-[#7dd3fc]">
              <Sparkles className="h-3 w-3" /> Live
            </Badge>
          </div>

          <Textarea
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
            className="min-h-[120px] border border-[#1f1f1f] bg-black/60 text-sm"
            placeholder="(close > ema_50) and (volume > 1000000)"
            data-testid="expression-input"
          />

          <div className="mt-2 flex flex-wrap gap-2">
            {presetExpressions.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                size="sm"
                variant="outline"
                className="text-[11px]"
                onClick={() => {
                  setExpression(preset.value);
                  handleRun(preset.value);
                }}
              >
                <Sparkles className="h-3 w-3" />
                {preset.label}
              </Button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-[#8f8f8f]">
                Limit to symbols (optional)
              </Label>
              <Input
                value={customSymbolsInput}
                onChange={(event) => setCustomSymbolsInput(event.target.value)}
                placeholder="RELIANCE, TCS, ICICIBANK"
                className="mt-1 h-9 border-[#1f1f1f] bg-black/60 text-xs"
              />
              <p className="mt-1 text-[10px] text-[#6f6f6f]">
                Separate tickers with commas or spaces. .NS/.BO suffixes are automatically stripped.
              </p>
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-[#8f8f8f]">
                Save current expression
              </Label>
              <div className="mt-1 flex gap-2">
                <Input
                  value={presetName}
                  onChange={(event) => setPresetName(event.target.value)}
                  placeholder="Name"
                  className="h-9 border-[#1f1f1f] bg-black/60 text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handlePresetSave}
                  disabled={!presetName.trim() || !expression.trim()}
                >
                  <Save className="h-3 w-3" />
                  Save
                </Button>
              </div>
            </div>
          </div>

          {savedPresets.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {savedPresets.map((preset) => (
                <Badge
                  key={preset.name}
                  variant="secondary"
                  className="cursor-pointer bg-[#1f2937] text-xs"
                  onClick={() => {
                    setExpression(preset.value);
                    handleRun(preset.value);
                  }}
                >
                  {preset.name}
                  <button
                    type="button"
                    className="ml-1 text-[10px] text-[#9f9f9f]"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSavedPresets((prev) =>
                        prev.filter((item) => item.name !== preset.name),
                      );
                    }}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => handleRun()}
              disabled={!expression.trim() || isRunning}
              data-testid="run-screener"
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
              Run Screener
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleExport}
              disabled={!results.length}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setExpression(defaultExpression);
                setCustomSymbolsInput("");
              }}
            >
              Reset
            </Button>
          </div>

          {mutationError && (
            <Alert variant="destructive" className="mt-3 border-red-900">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Unable to evaluate expression</AlertTitle>
              <AlertDescription>{mutationError}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="rounded-lg border border-[#1f1f1f] bg-black/30 p-4">
          <Alert className="border-[#1f1f1f] bg-black/50 text-xs text-[#cfcfcf]">
            <Info className="h-4 w-4" />
            <AlertTitle>Syntax cheatsheet</AlertTitle>
            <AlertDescription>
              Supported variables: close, volume, liquidity, atr_#, ema_#, sma_#, rsi_#, bb_upper/middle/lower_PER_STD,
              supertrend_PERIOD_MULT, high_PERIOD_FREQ, and &_shift_N variants. Operators: +, -, *, /, **, and/or/not.
            </AlertDescription>
          </Alert>

          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-[#9f9f9f]">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[#6f6f6f]">
                Matches
              </p>
              <p className="text-lg text-white">
                {screenerData?.matched ?? "–"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[#6f6f6f]">
                Universe Covered
              </p>
              <p className="text-lg text-white">
                {screenerData?.universe ?? "–"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[#6f6f6f]">
                Last Run
              </p>
              <p className="text-sm text-white">{lastRunDisplay}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[#6f6f6f]">
                Symbol Scope
              </p>
              <p className="text-sm text-white">
                {parsedSymbols.length > 0
                  ? `${parsedSymbols.length} custom`
                  : "All NSE"}
              </p>
            </div>
          </div>

          {indicatorColumns.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-wide text-[#6f6f6f]">
                Key metrics in table (max {maxMetrics})
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {indicatorColumns.map((metric) => (
                  <Button
                    key={metric}
                    type="button"
                    size="sm"
                    variant={visibleMetricSet.has(metric) ? "secondary" : "ghost"}
                    className={cn(
                      "text-[10px]",
                      visibleMetricSet.has(metric)
                        ? "border-[#1f9fff] text-[#1f9fff]"
                        : "text-[#9f9f9f]",
                    )}
                    onClick={() => toggleMetric(metric)}
                  >
                    {metric}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {missingSymbols.length > 0 && (
            <Alert variant="destructive" className="mt-4 border-red-900 text-xs">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Partial data</AlertTitle>
              <AlertDescription>
                {missingSymbols.length} symbols could not be downloaded:{" "}
                {missingSymbols.slice(0, 5).join(", ")}
                {missingSymbols.length > 5 && "…"}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      <div className="flex-1 rounded-lg border border-[#1f1f1f] bg-black/30 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">Screening Results</h3>
            <p className="text-xs text-[#8f8f8f]">
              Click Inspect to view the complete ticker snapshot.
            </p>
          </div>
          {selectedRow && (
            <Badge className="bg-[#172554] text-[#bfdbfe]">
              Selected: {selectedRow.symbol}
            </Badge>
          )}
        </div>

        <div className="h-[260px] overflow-hidden rounded border border-[#1f1f1f] bg-black/40">
          <ScrollArea className="h-full">
            <table className="min-w-full text-sm">
              <thead className="bg-black/60 text-[11px] uppercase text-[#7f7f7f]">
                <tr>
                  <th className="px-3 py-2 text-left">Symbol</th>
                  <th className="px-3 py-2 text-right">Close</th>
                  <th className="px-3 py-2 text-right">Volume</th>
                  <th className="px-3 py-2 text-right">Liquidity</th>
                  {visibleMetrics.length > 0 && (
                    <th className="px-3 py-2 text-left">Key Metrics</th>
                  )}
                  <th className="px-3 py-2 text-left">Updated</th>
                  <th className="px-3 py-2 text-left">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f1f1f]">
                {isRunning && (
                  <tr>
                    <td
                      colSpan={visibleMetrics.length > 0 ? 7 : 6}
                      className="px-3 py-6 text-center text-xs text-[#7f7f7f]"
                    >
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                      Running screener…
                    </td>
                  </tr>
                )}
                {!isRunning && results.length === 0 && (
                  <tr>
                    <td
                      colSpan={visibleMetrics.length > 0 ? 7 : 6}
                      className="px-3 py-6 text-center text-xs text-[#7f7f7f]"
                    >
                      No matches yet. Run the screener with a condition to see results.
                    </td>
                  </tr>
                )}
                {results.map((row) => (
                  <tr
                    key={row.symbol}
                    className={cn(
                      "text-sm transition hover:bg-white/5",
                      selectedRow?.symbol === row.symbol && "bg-white/5",
                    )}
                  >
                    <td className="px-3 py-2 font-semibold text-white">
                      {row.symbol}
                    </td>
                    <td className="px-3 py-2 text-right text-[#d1fae5]">
                      {currencyFormatter.format(row.close)}
                    </td>
                    <td className="px-3 py-2 text-right text-[#facc15]">
                      {compactFormatter.format(row.volume)}
                    </td>
                    <td className="px-3 py-2 text-right text-[#c084fc]">
                      {currencyFormatter.format(row.liquidity)}
                    </td>
                    {visibleMetrics.length > 0 && (
                      <td className="px-3 py-2">
                        <div className="grid grid-cols-2 gap-1 text-[10px]">
                          {visibleMetrics.map((metric) => (
                            <div key={`${row.symbol}-${metric}`}>
                              <p className="text-[#7f7f7f]">{metric}</p>
                              <p className="text-white">
                                {formatMetricValue(row.indicators?.[metric])}
                              </p>
                            </div>
                          ))}
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-2 text-xs text-[#9f9f9f]">
                      {row.asOf ? new Date(row.asOf).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-[11px]"
                        onClick={() => setSelectedRow(row)}
                      >
                        <Search className="h-3 w-3" />
                        Inspect
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </div>
      </div>

      {selectedRow && (
        <div className="rounded-lg border border-[#1f1f1f] bg-black/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[#9f9f9f]">Snapshot</p>
              <h4 className="text-lg font-semibold text-white">{selectedRow.symbol}</h4>
              <p className="text-xs text-[#7f7f7f]">
                Latest Close: {currencyFormatter.format(selectedRow.close)} • Updated{" "}
                {selectedRow.asOf ? new Date(selectedRow.asOf).toLocaleString() : "—"}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelectedRow(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-[#7f7f7f]">
                Daily Price Action
              </p>
              <div className="h-[420px] rounded border border-[#1f1f1f] bg-black/40 p-2">
                <StockChart
                  key={`inspect-chart-${selectedRow.symbol}`}
                  symbol={selectedRow.symbol}
                  initialTimeframe="1D"
                  hideToolbar
                />
              </div>
            </div>

            <ScrollArea className="h-64 rounded border border-[#1f1f1f] bg-black/40 p-3">
              <div className="grid grid-cols-2 gap-2 text-xs text-white">
                {selectedStats.map(([metric, value]) => (
                  <div
                    key={`${selectedRow.symbol}-${metric}`}
                    className="rounded border border-[#1f1f1f] bg-black/60 p-2"
                  >
                    <p className="text-[10px] uppercase tracking-wide text-[#7f7f7f]">
                      {metric}
                    </p>
                    <p className="text-sm">{formatMetricValue(value)}</p>
                  </div>
                ))}
                {selectedStats.length === 0 && (
                  <p className="text-[#7f7f7f]">No indicator data available.</p>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
      </div>
    </ScrollArea>
  );
}
