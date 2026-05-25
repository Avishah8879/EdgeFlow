import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { DataUnavailable } from "@/components/ft/DataUnavailable";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip as ChartTooltip,
  ReferenceArea,
  ReferenceLine,
} from "recharts";

export type RRGPeriod = "1y" | "2y" | "5y";

export type RRGResponse = {
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

interface RRGChartProps {
  /** Symbols to plot. Need at least 2 for the API to compute. */
  symbols: string[];
  /** Lookback window. Default "2y". */
  period?: RRGPeriod;
  /** Hide the readings sidebar (right panel). Default false. */
  hideReadings?: boolean;
  /** Fixed pixel height. If omitted, the component fills its parent (flex-1). */
  height?: number;
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function sanitizeErrorMessage(error: Error | unknown): string {
  if (!(error instanceof Error)) return "An unexpected error occurred";
  const msg = error.message;
  if (msg.includes("<html>") || msg.includes("<!DOCTYPE")) {
    return "Server temporarily unavailable. Please try again.";
  }
  if (msg.includes('"message"')) {
    try {
      const m = msg.match(/\{[^}]*"message"[^}]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (parsed.message) return parsed.message;
      }
    } catch {}
  }
  if (msg.toLowerCase().includes("rate limit")) {
    return "Rate limit exceeded. Please wait a moment before retrying.";
  }
  if (msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("network")) {
    return "Connection timeout. Please check your network and try again.";
  }
  if (msg.length < 200 && !msg.includes("<")) return msg;
  return "Could not load rotation data. Please try again.";
}

export function RRGChart({
  symbols,
  period = "2y",
  hideReadings = false,
  height,
}: RRGChartProps) {
  const debouncedSymbols = useDebouncedValue(symbols, 500);
  const debouncedPeriod = useDebouncedValue(period, 300);

  const queryKey = useMemo(
    () => ["/api/rrg-image", debouncedSymbols.join(","), debouncedPeriod],
    [debouncedSymbols, debouncedPeriod]
  );

  const { data, isLoading, isError, refetch, error } = useQuery<RRGResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        symbols: debouncedSymbols.join(","),
        period: debouncedPeriod,
      });
      const response = await apiRequest("GET", `/api/rrg-image?${params.toString()}`);
      const json = await response.json();
      return (json?.data || json) as RRGResponse;
    },
    enabled: debouncedSymbols.length >= 2,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });

  const trails = useMemo(() => data?.trails || [], [data?.trails]);
  const chartRanges = data?.ranges || { xMin: -120, xMax: 120, yMin: -40, yMax: 40 };

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

  const containerStyle = height !== undefined ? { height } : undefined;
  const containerClass =
    height !== undefined ? "flex gap-3 min-h-0" : "flex gap-3 min-h-0 h-full";

  return (
    <div className={containerClass} style={containerStyle}>
      <Card className="flex-1 bg-card/60 border-primary/20 p-2 flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-1 flex-shrink-0">
          <div className="text-xs text-muted-foreground">
            <span className="uppercase tracking-wide font-medium">RRG</span>
            <span className="mx-2">•</span>
            <span>Benchmark: {data?.benchmark || "NIFTY 50"}</span>
            <span className="mx-2">•</span>
            <span className="opacity-70">Trails show relative momentum vs benchmark over time</span>
          </div>
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
          {isError && (
            <span
              className="text-xs text-destructive truncate max-w-xs"
              title={sanitizeErrorMessage(error)}
            >
              {sanitizeErrorMessage(error)}
            </span>
          )}
        </div>
        <div className="flex-1 min-h-0 relative">
          {trails.length > 0 && (
            <>
              <div
                className="absolute pointer-events-none z-10 text-sky-400 text-[10px] font-bold opacity-80"
                style={{ left: 115, top: 25 }}
              >
                IMPROVING
              </div>
              <div
                className="absolute pointer-events-none z-10 text-emerald-400 text-[10px] font-bold opacity-80"
                style={{ right: 25, top: 25 }}
              >
                LEADING
              </div>
              <div
                className="absolute pointer-events-none z-10 text-rose-400 text-[10px] font-bold opacity-80"
                style={{ left: 115, bottom: 75 }}
              >
                LAGGING
              </div>
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
              message="Select at least two holdings to view a relative rotation graph."
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
              <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 50 }}>
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
                  label={{ value: "RS-Momentum", angle: -90, position: "insideLeft" }}
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
                      typeof value === "number" ? value.toFixed(2) : value,
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

      {!hideReadings && (
        <Card className="w-[180px] flex-shrink-0 bg-card/60 border-primary/20 p-2 flex flex-col">
          <div className="text-xs font-semibold text-primary mb-2">Readings</div>
          <div className="space-y-1 overflow-auto flex-1">
            {(data?.legend || []).map((item) => (
              <div
                key={item.symbol}
                className="text-[10px] px-1.5 py-1 rounded border border-border/40"
              >
                <div className="font-semibold text-foreground">{item.symbol}</div>
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
      )}
    </div>
  );
}
