import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, RefreshCw, Trash2, Search } from "lucide-react";
import { DataUnavailable } from "@/components/ft/DataUnavailable";
import { useSymbolSearch } from "@/hooks/useSymbolSearch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip as ChartTooltip,
  ReferenceLine,
  ReferenceArea,
} from "recharts";

// Debounce hook to prevent rapid API calls
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Sanitize error messages for user display
function sanitizeErrorMessage(error: Error | unknown): string {
  if (!(error instanceof Error)) {
    return "An unexpected error occurred";
  }
  const msg = error.message;

  // Strip HTML tags from nginx/server error pages
  if (msg.includes("<html>") || msg.includes("<!DOCTYPE") || msg.includes("<head>")) {
    return "Server temporarily unavailable. Please try again.";
  }

  // Parse JSON error responses
  if (msg.includes('"message"') || msg.includes('"success"')) {
    try {
      const jsonMatch = msg.match(/\{[^}]*"message"[^}]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.message) {
          return parsed.message;
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Handle rate limit messages
  if (msg.toLowerCase().includes("rate limit")) {
    return "Rate limit exceeded. Please wait a moment before retrying.";
  }

  // Handle timeout/connection errors
  if (msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("network")) {
    return "Connection timeout. Please check your network and try again.";
  }

  // Return original message if it's reasonably clean
  if (msg.length < 200 && !msg.includes("<")) {
    return msg;
  }

  return "Could not load rotation data. Please try again.";
}

type RRGResponse = {
  image?: string | null;
  legend: { symbol: string; rsRatio: number; rsMom: number }[];
  benchmark?: string;
  ranges?: { xMin: number; xMax: number; yMin: number; yMax: number };
  trails?: {
    symbol: string;
    label?: string;
    color?: string;
    points: {
      x: number;
      y: number;
      ratio: number;
      momentum: number;
      date?: string;
    }[];
    current?: {
      x: number;
      y: number;
      ratio: number;
      momentum: number;
      date?: string;
    };
  }[];
};

const defaultSymbols = [
  "RELIANCE",
  "HDFCBANK",
  "TCS",
  "INFY",
  "ICICIBANK",
  "SBIN",
];
const periods = ["1y", "2y", "5y"] as const;
type Period = (typeof periods)[number];

export function SystematicPatternsPanel() {
  const [symbols, setSymbols] = useState<string[]>(defaultSymbols);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("2y");

  // Symbol search state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const { data: searchResults = [], isLoading: isSearchLoading } =
    useSymbolSearch(searchQuery);

  // Debounce symbols and period to prevent rapid API calls during user interactions
  const debouncedSymbols = useDebouncedValue(symbols, 500);
  const debouncedPeriod = useDebouncedValue(selectedPeriod, 300);

  const queryKey = useMemo(
    () => ["/api/rrg-image", debouncedSymbols.join(","), debouncedPeriod],
    [debouncedSymbols, debouncedPeriod]
  );

  const { data, isLoading, isError, refetch, isFetching, error } =
    useQuery<RRGResponse>({
      queryKey,
      queryFn: async () => {
        const params = new URLSearchParams({
          symbols: debouncedSymbols.join(","),
          period: debouncedPeriod,
        });
        const response = await apiRequest(
          "GET",
          `/api/rrg-image?${params.toString()}`
        );
        const json = await response.json();
        return (json?.data || json) as RRGResponse;
      },
      enabled: debouncedSymbols.length >= 2,
      staleTime: 5 * 60 * 1000,      // Data considered fresh for 5 minutes
      gcTime: 30 * 60 * 1000,        // Keep in cache for 30 minutes
      refetchOnWindowFocus: false,   // Don't refetch on tab focus
      retry: 2,                       // Retry twice on failure
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    });
  const trails = useMemo(() => data?.trails || [], [data?.trails]);
  const chartRanges = data?.ranges || {
    xMin: -120,
    xMax: 120,
    yMin: -40,
    yMax: 40,
  };

  const plottedTrails = useMemo(() => {
    return trails.map((trail) => {
      const pts = trail.points || [];
      const last = pts[pts.length - 1] || null;
      const history = pts.slice(0, -1);
      const seriesLabel = trail.label || trail.symbol;
      return {
        ...trail,
        points: pts,
        historyPoints: history,
        latestPoint: last ? { ...last, seriesLabel } : null,
        color: trail.color || "#10b981",
        seriesLabel,
      };
    });
  }, [trails]);

  const handleAddSymbol = (symbol: string) => {
    const cleaned = symbol.trim().toUpperCase();
    if (!cleaned) return;
    if (symbols.includes(cleaned)) return;
    setSymbols((prev) => [...prev, cleaned]);
  };

  const handleRemove = (ticker: string) => {
    setSymbols((prev) => prev.filter((sym) => sym !== ticker));
  };

  const handleSelectSearchResult = (symbol: string) => {
    handleAddSymbol(symbol);
    setSearchQuery("");
    setIsSearchOpen(false);
    setHighlightedIndex(0);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setIsSearchOpen(false);
      setSearchQuery("");
      setHighlightedIndex(0);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        Math.min(prev + 1, searchResults.length - 1)
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (searchResults.length > 0 && highlightedIndex < searchResults.length) {
        handleSelectSearchResult(searchResults[highlightedIndex].symbol);
      } else if (searchQuery.trim()) {
        // Allow manual entry
        handleAddSymbol(searchQuery.trim().toUpperCase());
        setSearchQuery("");
        setIsSearchOpen(false);
      }
    }
  };

  // Click outside to close search dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    };
    if (isSearchOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isSearchOpen]);

  // Reset highlighted index when search results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchResults]);

  return (
    <div className="h-full flex flex-col gap-3 bg-card overflow-auto p-3">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Symbol Search Combo-Box */}
        <div ref={searchContainerRef} className="relative">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search symbol..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              onKeyDown={handleSearchKeyDown}
              className="pl-8 w-[200px] h-8"
            />
          </div>

          {/* Dropdown Results */}
          {isSearchOpen && searchQuery.length >= 2 && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-card border border-border rounded-md shadow-xl z-50 max-h-60 overflow-y-auto">
              {isSearchLoading ? (
                <div className="px-3 py-4 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                </div>
              ) : searchResults.length > 0 ? (
                searchResults.map((result, idx) => (
                  <button
                    key={result.symbol}
                    className={cn(
                      "w-full px-3 py-2 text-left border-b border-border/50 last:border-b-0 transition-colors",
                      idx === highlightedIndex
                        ? "bg-primary/20"
                        : "hover:bg-primary/10"
                    )}
                    onClick={() => handleSelectSearchResult(result.symbol)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                  >
                    <div className="text-sm font-bold font-mono text-secondary">
                      {result.symbol}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {result.name}
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No results found. Press Enter to add "
                  {searchQuery.toUpperCase()}" manually.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Period Selector */}
        <Select
          value={selectedPeriod}
          onValueChange={(v) => setSelectedPeriod(v as Period)}
        >
          <SelectTrigger className="w-20 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1y">1Y</SelectItem>
            <SelectItem value="2y">2Y</SelectItem>
            <SelectItem value="5y">5Y</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-[11px] text-muted-foreground">
          Select 2+ symbols to compute RRG.
        </span>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => refetch()}
          disabled={isFetching}
          className="ml-auto"
        >
          {isFetching ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-1" />
          )}
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {symbols.map((sym) => (
          <Badge
            key={sym}
            variant="outline"
            className="cursor-pointer flex items-center gap-1"
          >
            {sym}
            <Trash2
              className="w-3 h-3 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(sym);
              }}
            />
          </Badge>
        ))}
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        <Card className="flex-1 bg-card/60 border-primary/20 p-2 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-1 flex-shrink-0">
            <div className="text-xs text-muted-foreground">
              <span className="uppercase tracking-wide font-medium">RRG</span>
              <span className="mx-2">•</span>
              <span>Benchmark: {data?.benchmark || "NIFTY 50"}</span>
              <span className="mx-2">•</span>
              <span className="opacity-70">
                Trails show relative momentum vs benchmark over time
              </span>
            </div>
            {isLoading && (
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            )}
            {isError && (
              <span className="text-xs text-destructive truncate max-w-xs" title={sanitizeErrorMessage(error)}>
                {sanitizeErrorMessage(error)}
              </span>
            )}
          </div>
          <div className="flex-1 min-h-0 relative">
            {/* Quadrant labels - positioned at corners inside each quadrant */}
            {trails.length > 0 && (
              <>
                {/* IMPROVING: top-left corner of blue quadrant */}
                <div
                  className="absolute pointer-events-none z-10 text-sky-400 text-[10px] font-bold opacity-80"
                  style={{ left: 115, top: 25 }}
                >
                  IMPROVING
                </div>
                {/* LEADING: top-right corner of green quadrant */}
                <div
                  className="absolute pointer-events-none z-10 text-emerald-400 text-[10px] font-bold opacity-80"
                  style={{ right: 25, top: 25 }}
                >
                  LEADING
                </div>
                {/* LAGGING: bottom-left corner of red quadrant */}
                <div
                  className="absolute pointer-events-none z-10 text-rose-400 text-[10px] font-bold opacity-80"
                  style={{ left: 115, bottom: 75 }}
                >
                  LAGGING
                </div>
                {/* WEAKENING: bottom-right corner of amber quadrant */}
                <div
                  className="absolute pointer-events-none z-10 text-amber-400 text-[10px] font-bold opacity-80"
                  style={{ right: 25, bottom: 75 }}
                >
                  WEAKENING
                </div>
              </>
            )}
            {symbols.length < 2 ? (
              <DataUnavailable
                title="Add more symbols"
                message="Select at least two symbols to view a relative rotation graph."
              />
            ) : isError ? (
              <DataUnavailable
                title="RRG unavailable"
                message={sanitizeErrorMessage(error)}
                onRetry={() => refetch()}
                showRetryButton
              />
            ) : trails.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 20, right: 20, bottom: 40, left: 50 }}
                >
                  <ReferenceArea
                    x1={chartRanges.xMin}
                    x2={0}
                    y1={0}
                    y2={chartRanges.yMax}
                    fill="#1E3A8A"
                    fillOpacity={0.08}
                  />
                  <ReferenceArea
                    x1={0}
                    x2={chartRanges.xMax}
                    y1={0}
                    y2={chartRanges.yMax}
                    fill="#166534"
                    fillOpacity={0.08}
                  />
                  <ReferenceArea
                    x1={chartRanges.xMin}
                    x2={0}
                    y1={chartRanges.yMin}
                    y2={0}
                    fill="#7F1D1D"
                    fillOpacity={0.08}
                  />
                  <ReferenceArea
                    x1={0}
                    x2={chartRanges.xMax}
                    y1={chartRanges.yMin}
                    y2={0}
                    fill="#78350F"
                    fillOpacity={0.08}
                  />
                  <ReferenceLine x={0} stroke="#6b7280" strokeDasharray="6 4" />
                  <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="6 4" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={[chartRanges.xMin, chartRanges.xMax]}
                    tickFormatter={(value) => value.toFixed(0)}
                    label={{
                      value: "RS-Ratio (vs benchmark)",
                      position: "insideBottom",
                      offset: -18,
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    domain={[chartRanges.yMin, chartRanges.yMax]}
                    tickFormatter={(value) => value.toFixed(0)}
                    label={{
                      value: "RS-Momentum",
                      angle: -90,
                      position: "insideLeft",
                    }}
                  />
                  <ChartTooltip
                    formatter={(value: any, name: string, props: any) => {
                      const point = props.payload as {
                        ratio?: number;
                        momentum?: number;
                        date?: string;
                      };
                      const label = name === "y" ? "RS-Momentum" : "RS-Ratio";
                      return [
                        `${
                          typeof value === "number" ? value.toFixed(2) : value
                        }`,
                        label,
                        point?.date ? `Date: ${point.date}` : undefined,
                      ].filter(Boolean);
                    }}
                  />
                  {plottedTrails.map((trail) => (
                    <React.Fragment key={trail.symbol}>
                      <Scatter
                        name={trail.seriesLabel}
                        data={trail.points}
                        line
                        stroke={trail.color}
                        shape={() => <></>}
                      />
                      <Scatter
                        name={trail.seriesLabel}
                        data={trail.historyPoints}
                        fill={trail.color}
                        stroke={trail.color}
                        fillOpacity={0.5}
                        r={4}
                      />
                      {trail.latestPoint && (
                        <Scatter
                          name={trail.seriesLabel}
                          data={[trail.latestPoint]}
                          fill={trail.color}
                          stroke={trail.color}
                          fillOpacity={1}
                          r={6}
                          label={(props: any) => {
                            const { x, y } = props;
                            return (
                              <text
                                x={(x || 0) + 10}
                                y={(y || 0) - 8}
                                fill={trail.color}
                                fontSize={11}
                                fontWeight={700}
                              >
                                {trail.seriesLabel}
                              </text>
                            );
                          }}
                        />
                      )}
                    </React.Fragment>
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <DataUnavailable
                title="No RRG data"
                message="No rotation data returned for the selected symbols."
                onRetry={() => refetch()}
                showRetryButton
              />
            )}
          </div>
        </Card>

        <Card className="w-[180px] flex-shrink-0 bg-card/60 border-primary/20 p-2 flex flex-col">
          <div className="text-xs font-semibold text-primary mb-2">
            Readings
          </div>
          <div className="space-y-1 overflow-auto flex-1">
            {(data?.legend || []).map((item) => (
              <div
                key={item.symbol}
                className="text-[10px] px-1.5 py-1 rounded border border-border/40"
              >
                <div className="font-semibold text-foreground">
                  {item.symbol}
                </div>
                <div className="flex gap-2 font-mono text-muted-foreground">
                  <span>R:{item.rsRatio.toFixed(1)}</span>
                  <span>M:{item.rsMom.toFixed(1)}</span>
                </div>
              </div>
            ))}
            {(data?.legend || []).length === 0 && (
              <div className="text-[10px] text-muted-foreground">No data</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
