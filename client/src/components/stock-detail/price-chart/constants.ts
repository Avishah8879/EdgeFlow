import type { TimeRange, RangeConfig, ChartPreferences } from "./types";

// ============================================================================
// Time Range Configuration
// ============================================================================

export const RANGE_CONFIG: Record<TimeRange, RangeConfig> = {
  Intraday: {
    timeframe: "1min",
    months: 0,              // Today only
    displayMonths: 0.0014,  // ~1 hour visible (0.0014 * 30 days * 24 hours ≈ 1 hour)
    label: "Intraday",
  },
  "1D": {
    timeframe: "1day",
    months: 10,             // ~200 trading days
    displayMonths: 1,       // Fallback (not used when displayBars is set)
    displayBars: 30,        // Show last 30 candles initially
    label: "1D",
  },
  "1W": {
    timeframe: "1week",
    months: 48,             // ~200 weeks
    displayMonths: 3,       // Fallback (not used when displayBars is set)
    displayBars: 30,        // Show last 30 candles initially
    label: "1W",
  },
  "1M": {
    timeframe: "1month",
    months: 200,            // ~200 months
    displayMonths: 24,      // Fallback (not used when displayBars is set)
    displayBars: 30,        // Show last 30 candles initially
    label: "1M",
  },
};

// ============================================================================
// Default Preferences
// ============================================================================

export const DEFAULT_PREFERENCES: ChartPreferences = {
  showVolume: false,
  chartType: "candlestick",
};

// ============================================================================
// Storage Keys
// ============================================================================

export const STORAGE_KEYS = {
  PREFERENCES: "chart-preferences",
} as const;

// ============================================================================
// Chart Dimensions
// ============================================================================

export const CHART_HEIGHT = {
  normal: 420,
  fullscreen: "100vh",
} as const;

// ============================================================================
// Animation Timings
// ============================================================================

export const ANIMATION_TIMING = {
  /** Delay before showing loading skeleton (ms) */
  loadingDelay: 300,
  /** Theme transition delay for CSS variables to update (ms) */
  themeTransitionDelay: 50,
  /** Fade animation duration (ms) */
  fadeDuration: 200,
} as const;

// ============================================================================
// Time Ranges Array (for iteration)
// ============================================================================

export const TIME_RANGES: TimeRange[] = ["Intraday", "1D", "1W", "1M"];
