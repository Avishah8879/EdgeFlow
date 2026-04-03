import { useEffect, useCallback, useMemo, useRef } from "react";
import { Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { usePriceChart } from "@/hooks/use-price-chart";
import { useSmartLoader } from "@/hooks/use-smart-loader";
import { useChartInstance, useChartTheme, useChartSeries } from "./hooks";
import { formatISTTime, timeToIST } from "./utils/timezone";
import type { ChartType, LegendData, UTCTimestamp } from "./types";
import type { MouseEventParams, CandlestickData, LineData, HistogramData } from "lightweight-charts";

interface ChartContainerProps {
  ticker: string;
  timeframe: string;
  months: number;
  displayMonths: number;
  displayBars?: number;
  showVolume: boolean;
  chartType: ChartType;
  onLegendChange: (data: LegendData | null) => void;
  chartRef: React.MutableRefObject<any>;
}

export function ChartContainer({
  ticker,
  timeframe,
  months,
  displayMonths,
  displayBars,
  showVolume,
  chartType,
  onLegendChange,
  chartRef: externalChartRef,
}: ChartContainerProps) {
  // Theme colors (reactive to theme changes)
  const { colors } = useChartTheme();

  // Chart instance (lazy initialization)
  const { chartRef, containerRef, applyColors, takeScreenshot } = useChartInstance(colors);

  // Expose chart ref and screenshot function to parent
  useEffect(() => {
    externalChartRef.current = {
      chartRef,
      takeScreenshot,
    };
  }, [externalChartRef, chartRef, takeScreenshot]);

  // Fetch price data
  const { data, isLoading, isFetching, error } = usePriceChart({
    ticker,
    timeframe,
    months,
  });

  // Smart loader (300ms delay before showing skeleton)
  const { showSkeleton } = useSmartLoader(isLoading, 300);

  // Track if we've ever had data (for loading state)
  const hasEverHadData = useRef(false);
  if (data?.price_data?.length) hasEverHadData.current = true;

  // Extract price data
  const priceData = useMemo(() => {
    return data?.price_data || [];
  }, [data?.price_data]);

  // Initialize chart when container is ready and we have data
  // This triggers the lazy chart creation
  const chartInitialized = useRef(false);
  useEffect(() => {
    if (containerRef.current && priceData.length > 0 && !chartInitialized.current) {
      try {
        // Trigger chart creation by calling api()
        chartRef.current.api();
        chartInitialized.current = true;
      } catch (e) {
        console.error("[ChartContainer] Failed to initialize chart:", e);
      }
    }
  }, [chartRef, containerRef, priceData.length]);

  // Series management (only after chart is initialized)
  const { seriesRef, getActiveSeries } = useChartSeries({
    chartRef,
    colors,
    priceData,
    chartType,
    showVolume,
  });

  // Update chart colors when theme changes
  useEffect(() => {
    applyColors(colors);
  }, [colors, applyColors]);

  // Set visible range when data loads or timeframe changes
  // Track both timeframe and data length to detect when we need to reset visible range
  const prevVisibleRangeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!chartRef.current.isReady() || priceData.length === 0) return;

    // Create a key that combines timeframe and data length
    // This ensures we reset visible range when either changes
    const visibleRangeKey = `${timeframe}-${priceData.length}`;
    if (prevVisibleRangeKeyRef.current === visibleRangeKey) return;
    prevVisibleRangeKeyRef.current = visibleRangeKey;

    const chart = chartRef.current.api();

    // Convert timestamps to IST (matching the chart data)
    const lastTimeIST = timeToIST(priceData[priceData.length - 1].time);
    const firstTimeIST = timeToIST(priceData[0].time);

    // Use double requestAnimationFrame to ensure setData() has completed
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (chartRef.current.isRemoved) return;

        // For intraday: use time-based (1 hour)
        // For 1D/1W/1M: use candle-based (displayBars)
        if (timeframe === "1min") {
          // Intraday: show last 1 hour
          const displaySeconds = 3600;
          const desiredFromTime = lastTimeIST - displaySeconds;

          if (firstTimeIST > desiredFromTime) {
            // Sparse data - fit all content
            chart.timeScale().fitContent();
          } else {
            chart.timeScale().setVisibleRange({
              from: desiredFromTime as UTCTimestamp,
              to: lastTimeIST as UTCTimestamp,
            });
          }
        } else if (displayBars && priceData.length > 0) {
          // Candle-based: show last N bars
          const barsToShow = Math.min(displayBars, priceData.length);
          const fromIndex = Math.max(0, priceData.length - barsToShow);
          const fromTime = timeToIST(priceData[fromIndex].time);

          chart.timeScale().setVisibleRange({
            from: fromTime as UTCTimestamp,
            to: lastTimeIST as UTCTimestamp,
          });
        } else {
          // Fallback: use displayMonths (time-based)
          const displaySeconds = displayMonths * 30 * 24 * 60 * 60;
          const desiredFromTime = lastTimeIST - displaySeconds;

          if (firstTimeIST > desiredFromTime) {
            chart.timeScale().fitContent();
          } else {
            chart.timeScale().setVisibleRange({
              from: desiredFromTime as UTCTimestamp,
              to: lastTimeIST as UTCTimestamp,
            });
          }
        }
      });
    });
  }, [chartRef, priceData, timeframe, displayMonths, displayBars]);

  // Handle crosshair move for legend
  const handleCrosshairMove = useCallback(
    (param: MouseEventParams) => {
      if (!param.time) {
        onLegendChange(null);
        return;
      }

      const activeSeries = getActiveSeries();
      if (!activeSeries) {
        onLegendChange(null);
        return;
      }

      const seriesData = param.seriesData.get(activeSeries);
      if (!seriesData) {
        onLegendChange(null);
        return;
      }

      // Get volume data if available
      const volumeSeries = seriesRef.current.volume;
      const volumeData = volumeSeries
        ? (param.seriesData.get(volumeSeries) as HistogramData | undefined)
        : undefined;

      // Extract OHLC based on chart type
      let open: number, high: number, low: number, close: number;

      if (chartType === "candlestick") {
        const candle = seriesData as CandlestickData;
        open = candle.open;
        high = candle.high;
        low = candle.low;
        close = candle.close;
      } else {
        // Line chart - use close for all values
        const line = seriesData as LineData;
        open = high = low = close = line.value;
      }

      // Calculate change
      const change = close - open;
      const changePercent = open !== 0 ? (change / open) * 100 : 0;

      onLegendChange({
        time: formatISTTime(param.time as number, { showDate: true, showTime: timeframe === "1min" }),
        open,
        high,
        low,
        close,
        volume: volumeData?.value,
        change,
        changePercent,
      });
    },
    [getActiveSeries, seriesRef, chartType, timeframe, onLegendChange]
  );

  // Subscribe to crosshair move
  useEffect(() => {
    if (!chartRef.current.isReady()) return;

    const chart = chartRef.current.api();
    chart.subscribeCrosshairMove(handleCrosshairMove);

    return () => {
      if (chartRef.current.isReady()) {
        chart.unsubscribeCrosshairMove(handleCrosshairMove);
      }
    };
  }, [chartRef, handleCrosshairMove, priceData.length]);

  // NOTE: Fullscreen resize is handled by the debounced ResizeObserver in useChartInstance
  // No separate fullscreenchange handler needed - it caused race conditions

  // Determine what to show
  const showLoadingOverlay = showSkeleton && !hasEverHadData.current;
  const showFetchingIndicator = isFetching && hasEverHadData.current;
  const showError = !!error && !isLoading;
  const showNoData = !isLoading && !error && priceData.length === 0;

  return (
    <div className="relative w-full h-full">
      {/* Chart container - always mounted, fills parent via flex layout */}
      <div
        ref={containerRef}
        className="w-full h-full min-h-[380px]"
      />

      {/* Loading overlay - only on initial load */}
      <AnimatePresence>
        {showLoadingOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-20"
          >
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Loading chart...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtle fetching indicator during refetch */}
      <AnimatePresence>
        {showFetchingIndicator && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-2 right-2 z-10"
          >
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error overlay */}
      <AnimatePresence>
        {showError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-background/80 z-20"
          >
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Failed to load chart"}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* No data overlay */}
      <AnimatePresence>
        {showNoData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-background/80 z-20"
          >
            <p className="text-sm text-muted-foreground">
              {timeframe === "1min"
                ? "No intraday data available (market closed or data not yet populated)"
                : "No chart data available"}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
