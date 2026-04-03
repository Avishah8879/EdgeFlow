import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useMarketMood, type NiftyOHLC } from "@/hooks/use-market-mood";
import { useMarketStatus } from "@/hooks/use-market-status";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo, useEffect, useRef } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  CandlestickSeries,
  ColorType,
  createSeriesMarkers,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type UTCTimestamp,
  type Time,
} from "lightweight-charts";

// Map Fear/Greed category to color and styling
function getCategoryStyle(category: string) {
  const normalized = category.toLowerCase();

  if (normalized.includes("extreme greed")) {
    return {
      textColor: "text-positive",
      bgColor: "bg-positive/10",
      borderColor: "border-positive/30",
      chartColor: "hsl(var(--positive))",
      chartColorFaded: "hsl(var(--positive) / 0.2)",
      Icon: TrendingUp,
      description: "Extreme optimism",
    };
  } else if (normalized.includes("greed")) {
    return {
      textColor: "text-positive",
      bgColor: "bg-positive/10",
      borderColor: "border-positive/30",
      chartColor: "hsl(var(--positive))",
      chartColorFaded: "hsl(var(--positive) / 0.2)",
      Icon: TrendingUp,
      description: "Low volatility",
    };
  } else if (normalized.includes("extreme fear")) {
    return {
      textColor: "text-negative",
      bgColor: "bg-negative/10",
      borderColor: "border-negative/30",
      chartColor: "hsl(var(--negative))",
      chartColorFaded: "hsl(var(--negative) / 0.2)",
      Icon: TrendingDown,
      description: "Extreme panic",
    };
  } else if (normalized.includes("fear")) {
    return {
      textColor: "text-negative",
      bgColor: "bg-negative/10",
      borderColor: "border-negative/30",
      chartColor: "hsl(var(--negative))",
      chartColorFaded: "hsl(var(--negative) / 0.2)",
      Icon: TrendingDown,
      description: "High volatility",
    };
  } else {
    return {
      textColor: "text-muted-foreground",
      bgColor: "bg-muted/50",
      borderColor: "border-muted",
      chartColor: "hsl(var(--muted-foreground))",
      chartColorFaded: "hsl(var(--muted-foreground) / 0.2)",
      Icon: Minus,
      description: "Normal volatility",
    };
  }
}

// Format timestamp to readable time (e.g., "10:20")
function formatTime(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "--:--";
  }
}

// Custom tooltip for chart
function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { timestamp: string; value: number } }>;
}) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground">
        {formatTime(data.timestamp)}
      </p>
      <p className="text-sm font-medium text-foreground">
        VIX: {data.value.toFixed(1)}
      </p>
    </div>
  );
}

// IST offset in seconds (+5:30 = 5.5 hours)
const IST_OFFSET_SECONDS = 5.5 * 60 * 60;

// Convert ISO timestamp to UTCTimestamp for lightweight-charts
// Adding IST offset so chart displays IST times
function toISTTimestamp(isoString: string): UTCTimestamp {
  const utcSeconds = Math.floor(new Date(isoString).getTime() / 1000);
  // Add IST offset so the chart library displays IST time
  return (utcSeconds + IST_OFFSET_SECONDS) as UTCTimestamp;
}

// Get CSS color from CSS variable
function getCSSColor(variable: string): string {
  const root = document.documentElement;
  const value = getComputedStyle(root).getPropertyValue(variable).trim();
  return value ? `hsl(${value})` : "#888";
}

// NIFTY Candlestick Chart with Signal Arrow Component
function NiftyCandlestickChart({
  ohlc,
  vixSeries,
}: {
  ohlc: NiftyOHLC[];
  vixSeries: Array<{ timestamp: string; value: number }>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  // Calculate signals for multiple bars
  // Signal: vix[i] - vix[i-3], show arrow when signal changes or at intervals
  const { signals, latestSignal } = useMemo(() => {
    if (vixSeries.length < 4 || ohlc.length === 0) {
      return { signals: [], latestSignal: null };
    }

    // Calculate signal for each OHLC bar where we have VIX data
    const barSignals: Array<{
      timestamp: string;
      isLong: boolean;
      delta: number;
    }> = [];

    for (let i = 3; i < vixSeries.length; i++) {
      const currentVix = vixSeries[i].value;
      const vix3BarsAgo = vixSeries[i - 3].value;
      const delta = currentVix - vix3BarsAgo;
      const isLong = delta <= 0;

      // Find corresponding OHLC bar
      const vixTimestamp = vixSeries[i].timestamp.slice(0, 16);
      const matchingOhlc = ohlc.find(
        (bar) => bar.timestamp.slice(0, 16) === vixTimestamp
      );

      if (matchingOhlc) {
        barSignals.push({
          timestamp: matchingOhlc.timestamp,
          isLong,
          delta,
        });
      }
    }

    // Filter to show markers only when signal changes (no consecutive same signals)
    const filteredSignals: typeof barSignals = [];
    let lastSignal: boolean | null = null;

    for (let i = 0; i < barSignals.length; i++) {
      const sig = barSignals[i];
      // Show signal only when it changes from previous
      if (lastSignal === null || sig.isLong !== lastSignal) {
        filteredSignals.push(sig);
        lastSignal = sig.isLong;
      }
    }

    // Calculate latest signal for header display
    const latest = barSignals.length > 0 ? barSignals[barSignals.length - 1] : null;

    return { signals: filteredSignals, latestSignal: latest };
  }, [vixSeries, ohlc]);

  useEffect(() => {
    if (!containerRef.current || ohlc.length === 0) return;

    // Create chart
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: getCSSColor("--muted-foreground"),
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: getCSSColor("--border"), style: 1 },
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: {
          color: getCSSColor("--muted-foreground"),
          width: 1,
          style: 2,
          labelBackgroundColor: getCSSColor("--card"),
        },
        horzLine: {
          color: getCSSColor("--muted-foreground"),
          width: 1,
          style: 2,
          labelBackgroundColor: getCSSColor("--card"),
        },
      },
    });
    chartRef.current = chart;

    // Create candlestick series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: getCSSColor("--positive"),
      downColor: getCSSColor("--negative"),
      borderUpColor: getCSSColor("--positive"),
      borderDownColor: getCSSColor("--negative"),
      wickUpColor: getCSSColor("--positive"),
      wickDownColor: getCSSColor("--negative"),
    });
    seriesRef.current = candlestickSeries;

    // Set candlestick data with IST timestamps
    const candleData = ohlc.map((bar) => ({
      time: toISTTimestamp(bar.timestamp),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }));
    candlestickSeries.setData(candleData);

    // Add signal markers on multiple bars (only where signal changes)
    if (signals.length > 0) {
      const markers: SeriesMarker<Time>[] = signals.map((sig) => ({
        time: toISTTimestamp(sig.timestamp),
        position: sig.isLong ? "belowBar" : "aboveBar",
        shape: sig.isLong ? "arrowUp" : "arrowDown",
        color: sig.isLong ? "#16a34a" : "#dc2626",
        size: 1.5,
      }));
      markersRef.current = createSeriesMarkers(candlestickSeries, markers);
    }

    // Fit content
    chart.timeScale().fitContent();

    // Handle resize
    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (markersRef.current) {
        markersRef.current.detach();
        markersRef.current = null;
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [ohlc, signals]);

  return (
    <div className="relative w-full h-full flex flex-col p-4">
      {/* Chart Header */}
      <div className="flex items-center justify-between pb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          NIFTY 50 (IST)
        </span>
        {latestSignal && (
          <span
            className={`signal-arrow-badge ${latestSignal.isLong ? "long" : "short"}`}
          >
            {latestSignal.isLong ? (
              <ArrowUp className="h-3.5 w-3.5 mr-1" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5 mr-1" />
            )}
            {latestSignal.isLong ? "LONG" : "SHORT"}
          </span>
        )}
      </div>
      {/* Chart Container */}
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
}

export default function MarketMood() {
  const { data, isLoading } = useMarketMood();
  const { data: marketStatus } = useMarketStatus();
  const isMarketOpen = marketStatus?.is_open ?? false;

  // Always have valid data (hook provides fallback)
  const current = data?.current ?? {
    value: 50,
    category: "Neutral",
    timestamp: new Date().toISOString(),
  };
  const series = data?.series ?? [];
  const niftyOhlc = data?.nifty_ohlc ?? [];
  const status = data?.status ?? "default";
  const error = data?.error;

  const currentStyle = getCategoryStyle(current.category);
  const CategoryIcon = currentStyle.Icon;

  // Calculate change from previous bar
  const change = useMemo(() => {
    if (series.length < 2) return null;
    const prev = series[series.length - 2]?.value ?? current.value;
    return current.value - prev;
  }, [series, current.value]);

  // Calculate min/max for display
  const { minVal, maxVal } = useMemo(() => {
    if (series.length === 0) return { minVal: 0, maxVal: 100 };
    const values = series.map((s) => s.value);
    return {
      minVal: Math.min(...values),
      maxVal: Math.max(...values),
    };
  }, [series]);

  return (
    <div className={`mood-flip-card h-full ${isMarketOpen ? "market-open" : ""}`} data-testid="card-market-mood">
      <div className="mood-flip-inner h-full">
        {/* FRONT SIDE - Existing Market Mood Gauge */}
        <div className="mood-flip-front">
          <Card className="overflow-hidden h-full flex flex-col border-0 bg-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Market Mood
                  </h2>
                  {status === "stale" && (
                    <span title="Data may be stale">
                      <AlertCircle className="h-3.5 w-3.5 text-primary" />
                    </span>
                  )}
                  {status === "default" && (
                    <span className="text-xs text-muted-foreground">
                      (Default)
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {isLoading
                    ? "Loading..."
                    : `Updated ${formatTime(current.timestamp)}`}
                </span>
              </div>
              {error && (
                <p className="text-xs text-negative mt-1" title={error}>
                  Error: {error}
                </p>
              )}
            </CardHeader>

            <CardContent className="pt-0 flex-1 flex flex-col">
              {/* Hero Section */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-4xl font-bold tracking-tight">
                      {current.value.toFixed(1)}
                    </span>
                    {change !== null && (
                      <span
                        className={`flex items-center text-sm font-medium ${
                          change > 0
                            ? "text-negative"
                            : change < 0
                            ? "text-positive"
                            : "text-muted-foreground"
                        }`}
                      >
                        {change > 0 ? (
                          <ArrowUp className="h-3.5 w-3.5 mr-0.5" />
                        ) : change < 0 ? (
                          <ArrowDown className="h-3.5 w-3.5 mr-0.5" />
                        ) : null}
                        {change > 0 ? "+" : ""}
                        {change.toFixed(1)}
                      </span>
                    )}
                  </div>
                  {/* Category Badge */}
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${currentStyle.bgColor} ${currentStyle.textColor} ${currentStyle.borderColor}`}
                    >
                      <CategoryIcon className="h-3 w-3" />
                      {current.category}
                    </span>
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${currentStyle.bgColor} ${currentStyle.textColor} ${currentStyle.borderColor}`}
                    >
                      {currentStyle.description}
                    </span>
                  </div>
                </div>
              </div>

              {/* Chart Section */}
              <div className="mt-4 flex-1 flex flex-col">
                {series.length > 0 ? (
                  <div className="flex-1 min-h-[100px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={series}
                        margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                      >
                        <defs>
                          <linearGradient
                            id="vixGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor={currentStyle.chartColor}
                              stopOpacity={0.4}
                            />
                            <stop
                              offset="100%"
                              stopColor={currentStyle.chartColor}
                              stopOpacity={0.05}
                            />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="timestamp" hide />
                        <YAxis hide domain={["dataMin - 2", "dataMax + 2"]} />
                        <Tooltip
                          content={<CustomTooltip />}
                          cursor={{
                            stroke: "hsl(var(--muted-foreground))",
                            strokeWidth: 1,
                            strokeDasharray: "4 4",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke={currentStyle.chartColor}
                          strokeWidth={2}
                          fill="url(#vixGradient)"
                          dot={false}
                          activeDot={{
                            r: 4,
                            fill: currentStyle.chartColor,
                            stroke: "hsl(var(--background))",
                            strokeWidth: 2,
                          }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex items-center justify-center flex-1 min-h-[100px] text-muted-foreground text-sm">
                    {isLoading ? "Loading chart..." : "No data available"}
                  </div>
                )}

                {/* Min/Max Footer */}
                {series.length > 0 && (
                  <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                    <span>Min: {minVal.toFixed(1)}</span>
                    <span className="text-muted-foreground/60">
                      Hover to flip
                    </span>
                    <span>Max: {maxVal.toFixed(1)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* BACK SIDE - NIFTY Candlestick Chart with Signal */}
        <div className="mood-flip-back">
          {niftyOhlc.length > 0 ? (
            <NiftyCandlestickChart ohlc={niftyOhlc} vixSeries={series} />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              {isLoading ? "Loading chart..." : "No NIFTY data available"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
