import { useRef, useEffect, useCallback } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
} from "lightweight-charts";
import type { ChartInstanceRef, ChartColors, DeepPartial, ChartOptions, TickMarkType } from "../types";

// Month names for consistent UTC formatting
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format IST-shifted timestamp for time axis display
 * Since timestamps are already shifted by +5:30, we format as UTC to display IST correctly
 */
function formatISTTickMark(timestamp: number, tickMarkType: TickMarkType): string {
  const date = new Date(timestamp * 1000);

  // Use UTC formatting since timestamps are already IST-shifted
  switch (tickMarkType) {
    case 0: // Year
      return date.getUTCFullYear().toString();
    case 1: // Month
      return MONTHS[date.getUTCMonth()];
    case 2: // DayOfMonth
      return date.getUTCDate().toString();
    case 3: // Time
    case 4: // TimeWithSeconds
      const hours = date.getUTCHours().toString().padStart(2, '0');
      const minutes = date.getUTCMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    default:
      return date.getUTCDate().toString();
  }
}

/**
 * useChartInstance - Manages chart lifecycle using TradingView's official lazy pattern
 *
 * Key features:
 * - Lazy initialization: Chart created only when first accessed via api()
 * - Safe cleanup: isRemoved flag prevents operations on destroyed charts
 * - Single instance: Chart survives re-renders, destroyed only on unmount
 *
 * Based on: https://tradingview.github.io/lightweight-charts/tutorials/react/advanced
 */
export function useChartInstance(colors: ChartColors) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Create the chart instance ref with lazy initialization pattern
  const chartRef = useRef<ChartInstanceRef>({
    _api: null,
    _container: null,
    isRemoved: false,

    api() {
      if (this.isRemoved) {
        console.warn("[useChartInstance] Attempted to access removed chart");
        throw new Error("Chart has been removed");
      }

      // Lazy creation - only create chart when first accessed
      if (!this._api && containerRef.current) {
        this._container = containerRef.current;

        const options: DeepPartial<ChartOptions> = {
          width: containerRef.current.clientWidth,
          height: Math.max(containerRef.current.clientHeight, 380),
          layout: {
            background: { type: ColorType.Solid, color: "transparent" },
            textColor: colors.foreground,
            fontSize: 12,
            fontFamily: "var(--font-sans, 'Inter', sans-serif)",
          },
          grid: {
            horzLines: { color: colors.gridLine },
            vertLines: { color: colors.gridLine },
          },
          crosshair: {
            mode: CrosshairMode.Normal,
          },
          timeScale: {
            borderColor: colors.border,
            timeVisible: true,
            secondsVisible: false,
            tickMarkFormatter: formatISTTickMark,
          },
          localization: {
            // Custom time formatter for crosshair tooltip - formats IST-shifted timestamps as UTC
            timeFormatter: (timestamp: number) => {
              const date = new Date(timestamp * 1000);
              const day = date.getUTCDate();
              const month = MONTHS[date.getUTCMonth()];
              const hours = date.getUTCHours().toString().padStart(2, '0');
              const minutes = date.getUTCMinutes().toString().padStart(2, '0');
              return `${day} ${month}, ${hours}:${minutes}`;
            },
          },
          rightPriceScale: {
            borderColor: colors.border,
          },
          // Disable animations for snappier feel
          handleScroll: {
            vertTouchDrag: false,
          },
        };

        this._api = createChart(containerRef.current, options);
      }

      return this._api!;
    },

    free() {
      if (this._api) {
        this._api.remove();
        this._api = null;
        this._container = null;
      }
      this.isRemoved = true;
    },

    isReady() {
      return this._api !== null && !this.isRemoved;
    },
  });

  // Apply color updates when theme changes (without recreating chart)
  const applyColors = useCallback((newColors: ChartColors) => {
    if (!chartRef.current.isReady()) return;

    const chart = chartRef.current._api!;
    chart.applyOptions({
      layout: {
        textColor: newColors.foreground,
      },
      grid: {
        horzLines: { color: newColors.gridLine },
        vertLines: { color: newColors.gridLine },
      },
      timeScale: {
        borderColor: newColors.border,
      },
      rightPriceScale: {
        borderColor: newColors.border,
      },
    });
  }, []);

  // Resize handler - updates BOTH width and height together
  const handleResize = useCallback(() => {
    if (!chartRef.current.isReady() || !containerRef.current) return;

    const { width, height } = containerRef.current.getBoundingClientRect();
    chartRef.current._api!.applyOptions({
      width: Math.floor(width),
      height: Math.floor(Math.max(height, 380)),
    });
  }, []);

  // Take screenshot
  const takeScreenshot = useCallback((): HTMLCanvasElement | null => {
    if (!chartRef.current.isReady()) return null;

    return chartRef.current._api!.takeScreenshot();
  }, []);

  // Cleanup on unmount only (empty dependency array)
  useEffect(() => {
    return () => {
      chartRef.current.free();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Setup resize observer with debounce to prevent rapid-fire resizes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0 || chartRef.current.isRemoved) return;

      // Debounce: wait for layout to settle before resizing
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        handleResize();
      }, 50);
    });

    resizeObserver.observe(container);

    return () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
    };
  }, [handleResize]);

  return {
    chartRef,
    containerRef,
    applyColors,
    handleResize,
    takeScreenshot,
  };
}
