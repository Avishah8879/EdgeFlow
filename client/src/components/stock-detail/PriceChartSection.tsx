import { useState, useCallback, useRef } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import {
  ChartContainer,
  ChartControls,
  ChartLegend,
  useChartPreferences,
  useFullscreen,
  RANGE_CONFIG,
} from "./price-chart";
import type { TimeRange, LegendData } from "./price-chart";

interface PriceChartSectionProps {
  ticker: string;
}

/**
 * PriceChartSection - Main chart component for stock detail page
 *
 * Features:
 * - Timeframe switching (Intraday, 1D, 1W, 1M)
 * - Chart type toggle (Candlestick / Line)
 * - Volume toggle with localStorage persistence
 * - Interactive OHLCV legend on crosshair hover
 * - Theme-aware colors (light/dark mode)
 * - Fullscreen mode
 * - Screenshot/export to PNG
 * - IST timezone display
 * - Smart loading with 300ms delay
 *
 * Architecture:
 * - Uses TradingView's official lazy initialization pattern
 * - Chart never destroyed except on unmount
 * - Separate effects for each concern (data, colors, resize)
 * - Stale data kept visible during refetch via placeholderData
 */
export default function PriceChartSection({ ticker }: PriceChartSectionProps) {
  // Time range state
  const [selectedRange, setSelectedRange] = useState<TimeRange>("Intraday");

  // Legend state (OHLCV on hover)
  const [legendData, setLegendData] = useState<LegendData | null>(null);

  // Chart preferences (persisted to localStorage)
  const { showVolume, chartType, toggleVolume, setChartType } = useChartPreferences();

  // Fullscreen state
  const { isFullscreen, toggle: toggleFullscreen, ref: fullscreenRef } = useFullscreen();

  // Chart ref for screenshot
  const chartRef = useRef<{
    chartRef: React.MutableRefObject<any>;
    takeScreenshot: () => HTMLCanvasElement | null;
  } | null>(null);

  // Get range config
  const rangeConfig = RANGE_CONFIG[selectedRange];

  // Handle legend change (memoized)
  const handleLegendChange = useCallback((data: LegendData | null) => {
    setLegendData(data);
  }, []);

  // Handle screenshot
  const handleScreenshot = useCallback(() => {
    if (!chartRef.current?.takeScreenshot) return;

    const canvas = chartRef.current.takeScreenshot();
    if (!canvas) return;

    // Convert to data URL and download
    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `${ticker}-chart-${Date.now()}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [ticker]);

  return (
    <div ref={fullscreenRef} className={isFullscreen ? "h-screen w-screen bg-background" : "h-full"}>
      <Card className={`flex flex-col h-full ${isFullscreen ? "rounded-none border-none" : "min-h-[480px] lg:min-h-[580px]"}`}>
        <CardHeader className="pb-3">
          {/* All controls in one row */}
          <ChartControls
            selectedRange={selectedRange}
            onRangeChange={setSelectedRange}
            chartType={chartType}
            onChartTypeChange={setChartType}
            showVolume={showVolume}
            onVolumeToggle={toggleVolume}
            isFullscreen={isFullscreen}
            onFullscreenToggle={toggleFullscreen}
            onScreenshot={handleScreenshot}
          />
        </CardHeader>

        <CardContent className="flex-1 p-0">
          <div className="relative h-full px-4 pb-4 pt-2">
            {/* Chart */}
            <ChartContainer
              ticker={ticker}
              timeframe={rangeConfig.timeframe}
              months={rangeConfig.months}
              displayMonths={rangeConfig.displayMonths}
              displayBars={rangeConfig.displayBars}
              showVolume={showVolume}
              chartType={chartType}
              onLegendChange={handleLegendChange}
              chartRef={chartRef}
            />

            {/* Legend (OHLCV on hover) */}
            {legendData && <ChartLegend data={legendData} />}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
