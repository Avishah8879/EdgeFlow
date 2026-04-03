import { useRef, useEffect, useCallback, useMemo } from "react";
import {
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
} from "lightweight-charts";
import type {
  ChartInstanceRef,
  ChartColors,
  ChartType,
  SeriesRefs,
  CandlestickData,
  LineData,
  HistogramData,
  UTCTimestamp,
} from "../types";
import { timeToIST } from "../utils/timezone";

interface UseChartSeriesOptions {
  chartRef: React.MutableRefObject<ChartInstanceRef>;
  colors: ChartColors;
  priceData: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>;
  chartType: ChartType;
  showVolume: boolean;
}

/**
 * Convert HSL color to HSLA with alpha
 */
function hslToHsla(hslColor: string, alpha: number): string {
  const match = hslColor.match(/hsl\(([^)]+)\)/);
  if (!match) return hslColor;

  const values = match[1].trim();
  const parts = values.includes(",")
    ? values.split(",").map((p) => p.trim())
    : values.split(/\s+/);

  if (parts.length >= 3) {
    return `hsla(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
  }

  return hslColor;
}

/**
 * useChartSeries - Manages chart series (candlestick, line, volume)
 *
 * Key features:
 * - Supports switching between candlestick and line chart types
 * - Volume series is added/removed based on preference
 * - Data updates via setData() without recreating series
 * - Color updates via applyOptions() without recreating series
 */
export function useChartSeries({
  chartRef,
  colors,
  priceData,
  chartType,
  showVolume,
}: UseChartSeriesOptions) {
  const seriesRef = useRef<SeriesRefs>({
    candlestick: null,
    line: null,
    volume: null,
  });

  // Track previous values to detect what actually changed
  const prevChartTypeRef = useRef<ChartType>(chartType);
  const prevShowVolumeRef = useRef<boolean>(showVolume);
  const prevCandlestickDataRef = useRef<CandlestickData[]>([]);
  const prevLineDataRef = useRef<LineData[]>([]);
  const prevVolumeDataRef = useRef<HistogramData[]>([]);

  // Memoize candlestick data with IST timestamps
  const candlestickData: CandlestickData[] = useMemo(
    () =>
      priceData.map((d) => ({
        time: timeToIST(d.time) as UTCTimestamp,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      })),
    [priceData]
  );

  // Memoize line data with IST timestamps
  const lineData: LineData[] = useMemo(
    () =>
      priceData.map((d) => ({
        time: timeToIST(d.time) as UTCTimestamp,
        value: d.close,
      })),
    [priceData]
  );

  // Memoize volume data with IST timestamps and colors
  const volumeData: HistogramData[] = useMemo(
    () =>
      priceData
        .filter((d) => d.volume !== undefined && d.volume > 0)
        .map((d, i) => {
          const isUp = i === 0 || d.close >= priceData[Math.max(0, i - 1)].close;
          const baseColor = isUp ? colors.positive : colors.negative;
          return {
            time: timeToIST(d.time) as UTCTimestamp,
            value: d.volume!,
            color: hslToHsla(baseColor, 0.5),
          };
        }),
    [priceData, colors.positive, colors.negative]
  );

  // Get the currently active price series
  const getActiveSeries = useCallback(() => {
    return chartType === "candlestick"
      ? seriesRef.current.candlestick
      : seriesRef.current.line;
  }, [chartType]);

  // Unified effect: Handle ALL series management atomically
  // Only update series when their specific data/state changes
  useEffect(() => {
    if (!chartRef.current.isReady()) return;

    const chart = chartRef.current.api();

    // Detect what actually changed
    const chartTypeChanged = prevChartTypeRef.current !== chartType;
    const showVolumeChanged = prevShowVolumeRef.current !== showVolume;
    const candlestickDataChanged = prevCandlestickDataRef.current !== candlestickData;
    const lineDataChanged = prevLineDataRef.current !== lineData;
    const volumeDataChanged = prevVolumeDataRef.current !== volumeData;

    // Update refs
    prevChartTypeRef.current = chartType;
    prevShowVolumeRef.current = showVolume;
    prevCandlestickDataRef.current = candlestickData;
    prevLineDataRef.current = lineData;
    prevVolumeDataRef.current = volumeData;

    // 1. Handle chart type switching (remove opposite series)
    if (chartTypeChanged) {
      if (chartType === "candlestick" && seriesRef.current.line) {
        chart.removeSeries(seriesRef.current.line);
        seriesRef.current.line = null;
      } else if (chartType === "line" && seriesRef.current.candlestick) {
        chart.removeSeries(seriesRef.current.candlestick);
        seriesRef.current.candlestick = null;
      }
    }

    // 2. Create/update price series (only when data or type changed)
    if (chartType === "candlestick") {
      const needsCreate = !seriesRef.current.candlestick;
      if (needsCreate) {
        seriesRef.current.candlestick = chart.addSeries(CandlestickSeries, {
          upColor: colors.positive,
          downColor: colors.negative,
          borderVisible: true,
          borderUpColor: colors.positive,
          borderDownColor: colors.negative,
          wickUpColor: colors.positive,
          wickDownColor: colors.negative,
          wickVisible: true,
          priceLineVisible: false,
        });
      }

      // Only update data if it changed or series was just created
      if ((needsCreate || candlestickDataChanged) && candlestickData.length > 0 && seriesRef.current.candlestick) {
        seriesRef.current.candlestick.setData(candlestickData);
      }
    } else {
      // Line chart
      const needsCreate = !seriesRef.current.line;
      if (needsCreate) {
        seriesRef.current.line = chart.addSeries(LineSeries, {
          color: colors.line,
          lineWidth: 2,
          priceLineVisible: false,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 4,
        });
      }

      // Only update data if it changed or series was just created
      if ((needsCreate || lineDataChanged) && lineData.length > 0 && seriesRef.current.line) {
        seriesRef.current.line.setData(lineData);
      }
    }

    // 3. Handle volume series visibility (only when showVolume or volumeData changed)
    if (showVolumeChanged || volumeDataChanged) {
      if (showVolume && volumeData.length > 0) {
        // Create volume series if needed
        if (!seriesRef.current.volume) {
          seriesRef.current.volume = chart.addSeries(HistogramSeries, {
            priceFormat: { type: "volume" },
            priceScaleId: "volume",
            lastValueVisible: false,
            priceLineVisible: false,
          });

          chart.priceScale("volume").applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
          });
        }

        // Update volume data
        seriesRef.current.volume.setData(volumeData);
      } else if (seriesRef.current.volume) {
        // Remove volume series
        chart.removeSeries(seriesRef.current.volume);
        seriesRef.current.volume = null;
      }
    }
  }, [chartRef, chartType, candlestickData, lineData, colors, showVolume, volumeData]);

  // Effect: Update series colors when theme changes
  useEffect(() => {
    if (seriesRef.current.candlestick) {
      seriesRef.current.candlestick.applyOptions({
        upColor: colors.positive,
        downColor: colors.negative,
        borderUpColor: colors.positive,
        borderDownColor: colors.negative,
        wickUpColor: colors.positive,
        wickDownColor: colors.negative,
      });
    }

    if (seriesRef.current.line) {
      seriesRef.current.line.applyOptions({
        color: colors.line,
      });
    }
  }, [colors]);

  // Cleanup function (called externally if needed)
  const cleanup = useCallback(() => {
    if (!chartRef.current.isReady()) return;

    const chart = chartRef.current.api();

    if (seriesRef.current.candlestick) {
      chart.removeSeries(seriesRef.current.candlestick);
      seriesRef.current.candlestick = null;
    }
    if (seriesRef.current.line) {
      chart.removeSeries(seriesRef.current.line);
      seriesRef.current.line = null;
    }
    if (seriesRef.current.volume) {
      chart.removeSeries(seriesRef.current.volume);
      seriesRef.current.volume = null;
    }
  }, [chartRef]);

  return {
    seriesRef,
    getActiveSeries,
    cleanup,
  };
}
