import { useEffect, useRef } from "react";
import {
  LineSeries,
  type LineData,
  type IChartApi,
  type UTCTimestamp,
  ColorType,
  CrosshairMode,
  createChart,
} from "lightweight-charts";
import { Loader2 } from "lucide-react";
import { usePriceChart } from "@/hooks/use-price-chart";

// Helper to get computed CSS color from HSL variable
function getCSSColor(variable: string): string {
  if (typeof window === 'undefined') return '#ffffff';
  const hsl = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  if (!hsl) return '#ffffff';
  return `hsl(${hsl})`;
}

interface MiniPriceChartProps {
  ticker: string;
}

const numberOrNaN = (value: unknown): number =>
  typeof value === "number"
    ? value
    : value === null || value === undefined
      ? Number.NaN
      : Number(value);

export default function MiniPriceChart({ ticker }: MiniPriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Display ticker without .NS suffix
  const displayTicker = ticker.replace('.NS', '');

  // Try intraday data first (1min)
  const intradayQuery = usePriceChart({
    ticker,
    timeframe: "1min",
    months: 0, // Current day only
  });

  // Fallback to hourly data if intraday fails or has no data
  const shouldUseHourly =
    !intradayQuery.isLoading &&
    (!!intradayQuery.error || !intradayQuery.data?.price_data?.length);

  const hourlyQuery = usePriceChart({
    ticker,
    timeframe: "1hour",
    months: 0.25, // ~1 week
    enabled: shouldUseHourly,
  });

  // Use intraday data if available, otherwise hourly
  const { data, isLoading, error } = shouldUseHourly ? hourlyQuery : intradayQuery;
  const timeframeLabel = shouldUseHourly ? "Hourly" : "Intraday";
  const periodLabel = shouldUseHourly ? "Last Week" : "Today";

  const destroyChart = () => {
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }
  };

  useEffect(() => {
    const container = chartContainerRef.current;

    // Process price data - convert to line data (time, close)
    const priceData = data?.price_data ?? [];
    const cleaned: LineData[] = priceData
      .map((point) => ({
        time: Number(point.time) as UTCTimestamp,
        value: numberOrNaN(point.close),
      }))
      .filter((point) =>
        Number.isFinite(point.time) && Number.isFinite(point.value)
      );

    if (!container || cleaned.length === 0) {
      destroyChart();
      return;
    }

    destroyChart();

    // Get theme-aware colors
    const foregroundColor = getCSSColor('--foreground');
    const borderColor = getCSSColor('--border');
    const primaryColor = getCSSColor('--primary');

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 200,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: foregroundColor,
        fontFamily: "var(--font-sans, 'Inter', sans-serif)",
        fontSize: 11,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      grid: {
        horzLines: { color: "hsla(var(--foreground), 0.08)" },
        vertLines: { color: "hsla(var(--foreground), 0.08)" },
      },
      rightPriceScale: {
        borderColor: borderColor,
        scaleMargins: {
          top: 0.15,
          bottom: 0.15,
        },
      },
      timeScale: {
        borderColor: borderColor,
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const series = chart.addSeries(LineSeries, {
      color: primaryColor,
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: primaryColor,
      crosshairMarkerBackgroundColor: primaryColor,
    });
    series.setData(cleaned);
    chart.timeScale().fitContent();

    chartInstanceRef.current = chart;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries.length || !chartInstanceRef.current) return;
      const { width } = entries[0].contentRect;
      chartInstanceRef.current.applyOptions({ width: Math.floor(width) });
    });

    resizeObserver.observe(container);
    resizeObserverRef.current = resizeObserver;

    return () => {
      destroyChart();
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 h-[200px] w-full items-center justify-center bg-muted/50 rounded-lg">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading {displayTicker}...</span>
      </div>
    );
  }

  if (error || !data?.price_data?.length) {
    return (
      <div className="flex h-[200px] w-full items-center justify-center bg-muted/50 rounded-lg text-xs text-muted-foreground">
        {error ? (error instanceof Error ? error.message : String(error)) : "No price data available"}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {displayTicker} - {periodLabel}
        </span>
        <span className="text-xs text-muted-foreground/70">{timeframeLabel}</span>
      </div>
      <div ref={chartContainerRef} className="h-[200px] w-full rounded-lg" />
    </div>
  );
}
