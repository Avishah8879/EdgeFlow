import type {
  IChartApi,
  ISeriesApi,
  CandlestickData,
  LineData,
  HistogramData,
  UTCTimestamp,
  DeepPartial,
  ChartOptions,
  TickMarkType,
} from "lightweight-charts";

// ============================================================================
// Time Range Configuration
// ============================================================================

export type TimeRange = "Intraday" | "1D" | "1W" | "1M";

export interface RangeConfig {
  timeframe: string;      // API timeframe: '1min', '1day', '1week', '1month'
  months: number;         // Data load period
  displayMonths: number;  // Initial visible period on chart (time-based, for intraday)
  displayBars?: number;   // Initial visible bars on chart (candle-based, for 1D/1W/1M)
  label: string;          // Display label
}

// ============================================================================
// Chart Types
// ============================================================================

export type ChartType = "candlestick" | "line";

// ============================================================================
// Chart Preferences (persisted to localStorage)
// ============================================================================

export interface ChartPreferences {
  showVolume: boolean;
  chartType: ChartType;
}

// ============================================================================
// Legend Data
// ============================================================================

export interface LegendData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  change: number;
  changePercent: number;
}

// ============================================================================
// Theme Colors
// ============================================================================

export interface ChartColors {
  foreground: string;
  border: string;
  gridLine: string;
  positive: string;
  negative: string;
  volume: string;
  line: string;          // Line chart color
}

// ============================================================================
// Chart Instance (Lazy Pattern)
// ============================================================================

export interface ChartInstanceRef {
  _api: IChartApi | null;
  _container: HTMLDivElement | null;
  isRemoved: boolean;

  /** Lazy getter - creates chart on first access */
  api(): IChartApi;

  /** Safe cleanup */
  free(): void;

  /** Check if chart exists and is valid */
  isReady(): boolean;
}

// ============================================================================
// Series Refs
// ============================================================================

export interface SeriesRefs {
  candlestick: ISeriesApi<"Candlestick"> | null;
  line: ISeriesApi<"Line"> | null;
  volume: ISeriesApi<"Histogram"> | null;
}

// ============================================================================
// Chart Container Props
// ============================================================================

export interface ChartContainerProps {
  ticker: string;
  timeframe: string;
  months: number;
  displayMonths: number;
  showVolume: boolean;
  chartType: ChartType;
  isFullscreen: boolean;
  onLegendChange: (data: LegendData | null) => void;
  onScreenshot: () => void;
}

// ============================================================================
// Chart Controls Props
// ============================================================================

export interface ChartControlsProps {
  selectedRange: TimeRange;
  onRangeChange: (range: TimeRange) => void;
  chartType: ChartType;
  onChartTypeChange: (type: ChartType) => void;
  showVolume: boolean;
  onVolumeToggle: () => void;
}

// ============================================================================
// Chart Toolbar Props
// ============================================================================

export interface ChartToolbarProps {
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
  onScreenshot: () => void;
}

// ============================================================================
// Chart Legend Props
// ============================================================================

export interface ChartLegendProps {
  data: LegendData;
}

// ============================================================================
// Hook Return Types
// ============================================================================

export interface UseChartInstanceReturn {
  chartRef: React.MutableRefObject<ChartInstanceRef>;
  containerRef: React.RefObject<HTMLDivElement>;
}

export interface UseChartThemeReturn {
  colors: ChartColors;
}

export interface UseChartPreferencesReturn {
  preferences: ChartPreferences;
  setShowVolume: (show: boolean) => void;
  toggleVolume: () => void;
  setChartType: (type: ChartType) => void;
}

export interface UseFullscreenReturn {
  isFullscreen: boolean;
  toggle: () => void;
  ref: React.RefObject<HTMLDivElement>;
}

// ============================================================================
// Re-exports from lightweight-charts
// ============================================================================

export type {
  IChartApi,
  ISeriesApi,
  CandlestickData,
  LineData,
  HistogramData,
  UTCTimestamp,
  DeepPartial,
  ChartOptions,
  TickMarkType,
};
