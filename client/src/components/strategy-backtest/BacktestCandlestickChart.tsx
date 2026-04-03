import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type IChartApi,
  type SeriesMarker,
  type UTCTimestamp,
  type Time,
  type ISeriesMarkersPluginApi,
} from "lightweight-charts";
import { getCSSColor } from "@/lib/theme-utils";

export interface BacktestCandlestickBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  entry?: boolean;
  exit?: boolean;
  entry_price?: number | null;
  exit_price?: number | null;
}

interface BacktestCandlestickChartProps {
  data: BacktestCandlestickBar[];
  height?: number;
}

const toUTCTimestamp = (isoString: string): UTCTimestamp =>
  Math.floor(new Date(isoString).getTime() / 1000) as UTCTimestamp;

export function BacktestCandlestickChart({
  data,
  height = 500,
}: BacktestCandlestickChartProps) {
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const destroyChart = () => {
    if (markersRef.current) {
      try {
        markersRef.current.detach();
      } catch {
        // Ignore if already detached
      }
      markersRef.current = null;
    }
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      destroyChart();
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || data.length === 0) {
      destroyChart();
      return;
    }

    destroyChart();

    // Get computed colors from CSS variables (for theme support)
    const foregroundColor = getCSSColor("--foreground");
    const borderColor = getCSSColor("--border");
    const mutedForeground = getCSSColor("--muted-foreground");

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: mutedForeground,
        fontSize: 12,
        fontFamily: "var(--font-sans, 'Inter', sans-serif)",
      },
      grid: {
        horzLines: { color: borderColor },
        vertLines: { color: borderColor },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: foregroundColor,
          width: 1,
          style: 3,
          visible: true,
        },
        horzLine: {
          color: foregroundColor,
          width: 1,
          style: 3,
          visible: true,
        },
      },
      rightPriceScale: {
        borderVisible: true,
        borderColor: borderColor,
        scaleMargins: { top: 0.2, bottom: 0.1 },
      },
      timeScale: {
        borderVisible: true,
        borderColor: borderColor,
        barSpacing: 10,
        minBarSpacing: 4,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a",
      downColor: "#dc2626",
      wickUpColor: "#15803d",
      wickDownColor: "#b91c1c",
      borderUpColor: "#16a34a",
      borderDownColor: "#dc2626",
      priceLineColor: "hsl(var(--primary))",
      priceLineWidth: 2,
      priceLineVisible: true,
    });

    const candleData: CandlestickData[] = data
      .map((bar) => ({
        time: toUTCTimestamp(bar.date),
        open: Number(bar.open),
        high: Number(bar.high),
        low: Number(bar.low),
        close: Number(bar.close),
      }))
      .sort((a, b) => a.time - b.time);

    series.setData(candleData);
    chart.timeScale().fitContent();

    // Add entry/exit markers
    const markers: SeriesMarker<UTCTimestamp>[] = [];
    data.forEach((bar) => {
      const baseTime = toUTCTimestamp(bar.date);
      if (bar.entry) {
        markers.push({
          time: baseTime,
          position: "belowBar",
          shape: "arrowUp",
          color: "#16a34a",
          text: "Entry",
        });
      }
      if (bar.exit) {
        markers.push({
          time: baseTime,
          position: "aboveBar",
          shape: "arrowDown",
          color: "#dc2626",
          text: "Exit",
        });
      }
    });
    if (markers.length) {
      markersRef.current = createSeriesMarkers(series, markers);
    }

    // Handle resize
    if (typeof window !== "undefined" && "ResizeObserver" in window) {
      const observer = new ResizeObserver(() => {
        if (chartRef.current && container) {
          chartRef.current.applyOptions({
            width: container.clientWidth,
          });
        }
      });
      observer.observe(container);
      resizeObserverRef.current = observer;
    }

    chartRef.current = chart;

    return () => {
      destroyChart();
    };
  }, [data, height, resolvedTheme]);

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        Candlestick data unavailable.
      </div>
    );
  }

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}
