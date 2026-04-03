import { Button } from "@/components/ui/button";
import { BarChart3, CandlestickChart, LineChart, Camera, Maximize2, Minimize2 } from "lucide-react";
import { TIME_RANGES } from "./constants";
import type { TimeRange, ChartType } from "./types";

interface ChartControlsProps {
  selectedRange: TimeRange;
  onRangeChange: (range: TimeRange) => void;
  chartType: ChartType;
  onChartTypeChange: (type: ChartType) => void;
  showVolume: boolean;
  onVolumeToggle: () => void;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
  onScreenshot: () => void;
}

export function ChartControls({
  selectedRange,
  onRangeChange,
  chartType,
  onChartTypeChange,
  showVolume,
  onVolumeToggle,
  isFullscreen,
  onFullscreenToggle,
  onScreenshot,
}: ChartControlsProps) {
  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Single row: Title | Timeframes | Actions */}
      <div className="flex items-center justify-between gap-4">
        {/* Left: Title */}
        <h3 className="text-base font-medium shrink-0">Price Action</h3>

        {/* Center: Timeframe buttons */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {TIME_RANGES.map((range) => (
            <Button
              key={range}
              variant={selectedRange === range ? "default" : "ghost"}
              size="sm"
              onClick={() => onRangeChange(range)}
              className={`h-8 px-3 ${
                selectedRange === range
                  ? "bg-primary hover:bg-primary/90"
                  : ""
              }`}
            >
              {range}
            </Button>
          ))}
        </div>

        {/* Right: Actions (chart type, volume, screenshot, fullscreen) */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Chart Type Toggle */}
          <div className="flex items-center border rounded-md overflow-hidden">
            <Button
              variant={chartType === "candlestick" ? "default" : "ghost"}
              size="sm"
              onClick={() => onChartTypeChange("candlestick")}
              className={`h-8 px-2 rounded-none border-0 ${
                chartType === "candlestick"
                  ? "bg-primary hover:bg-primary/90"
                  : ""
              }`}
              title="Candlestick Chart"
            >
              <CandlestickChart className="w-4 h-4" />
            </Button>
            <Button
              variant={chartType === "line" ? "default" : "ghost"}
              size="sm"
              onClick={() => onChartTypeChange("line")}
              className={`h-8 px-2 rounded-none border-0 border-l ${
                chartType === "line" ? "bg-primary hover:bg-primary/90" : ""
              }`}
              title="Line Chart"
            >
              <LineChart className="w-4 h-4" />
            </Button>
          </div>

          {/* Volume Toggle */}
          <Button
            variant={showVolume ? "default" : "ghost"}
            size="sm"
            onClick={onVolumeToggle}
            className={`h-8 px-2 ${
              showVolume ? "bg-primary hover:bg-primary/90" : ""
            }`}
            title="Toggle Volume"
          >
            <BarChart3 className="w-4 h-4" />
          </Button>

          {/* Screenshot */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onScreenshot}
            className="h-8 px-2"
            title="Download chart as PNG"
          >
            <Camera className="w-4 h-4" />
          </Button>

          {/* Fullscreen */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onFullscreenToggle}
            className="h-8 px-2"
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
