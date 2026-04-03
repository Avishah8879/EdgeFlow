import { useState, useEffect, useRef, useMemo } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  Time,
  ColorType,
  SingleValueData,
  AreaSeries,
  LineSeries,
  CandlestickSeries,
  BarSeries,
  HistogramSeries,
} from 'lightweight-charts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Loader2, Activity, BarChart3, CandlestickChart, GitCompare, X } from 'lucide-react';
import { useChartData, useBatchChartData, useIntradayCompareData, PriceDataPoint } from '@/hooks/useChartData';
import { useStockQuote } from '@/hooks/useStockQuote';
import { use52WeekData } from '@/hooks/use52WeekData';
import { useSymbolSearch } from '@/hooks/useSymbolSearch';
import { cn } from '@/lib/utils';

// Colors for comparison symbols
const compareColors = [
  '#FF6B6B',  // Coral Red
  '#4ECDC4',  // Teal
  '#FFE66D',  // Yellow
  '#95E1D3',  // Mint
  '#F38181',  // Salmon
  '#AA96DA',  // Lavender
];

const timeframes = ['1m', '1D', '1W', '1M'] as const;
type Timeframe = typeof timeframes[number];
const intradayTimeframes = new Set<Timeframe>(['1m']);
const timeframeSet = new Set<string>(timeframes);

interface StockChartProps {
  symbol: string;
  initialTimeframe?: Timeframe;
  hideToolbar?: boolean;
  onSymbolChange?: (newSymbol: string) => void;
}
const chartTypes = [
  { value: 'area', icon: Activity, label: 'Area' },
  { value: 'line', icon: Activity, label: 'Line' },
  { value: 'candle', icon: CandlestickChart, label: 'Candle' },
  { value: 'bar', icon: BarChart3, label: 'Bar' },
];

const indicators = ['SMA20', 'SMA50', 'EMA12', 'EMA26', 'Volume'];

// Indicator calculation functions
function calculateSMA(data: SingleValueData[], period: number): SingleValueData[] {
  const result: SingleValueData[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].value;
    }
    result.push({ time: data[i].time, value: sum / period });
  }
  return result;
}

function calculateEMA(data: SingleValueData[], period: number): SingleValueData[] {
  if (data.length < period) return [];
  const result: SingleValueData[] = [];
  const multiplier = 2 / (period + 1);

  // Start with SMA for the first EMA value
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i].value;
  }
  let ema = sum / period;
  result.push({ time: data[period - 1].time, value: ema });

  // Calculate EMA for remaining values
  for (let i = period; i < data.length; i++) {
    ema = (data[i].value - ema) * multiplier + ema;
    result.push({ time: data[i].time, value: ema });
  }
  return result;
}

// Indicator colors
const indicatorColors: Record<string, string> = {
  SMA20: '#FFD700',  // Gold
  SMA50: '#FF69B4',  // Hot Pink
  EMA12: '#00FF7F',  // Spring Green
  EMA26: '#FF4500',  // Orange Red
};

const normalizeTimeframe = (value?: string): Timeframe => {
  if (value && timeframeSet.has(value)) {
    return value as Timeframe;
  }
  return '1m';
};

export function StockChart({ symbol, initialTimeframe = '1m', hideToolbar = false, onSymbolChange }: StockChartProps) {
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>(normalizeTimeframe(initialTimeframe));
  const [chartType, setChartType] = useState('area');
  const [showVolume, setShowVolume] = useState(true);
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>(['Volume']);
  const [compareSymbols, setCompareSymbols] = useState<string[]>([]);

  // Symbol search state
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const { data: searchResults = [] } = useSymbolSearch(searchQuery);

  // Compare mode state
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareQuery, setCompareQuery] = useState('');
  const [compareHighlightedIndex, setCompareHighlightedIndex] = useState(0);
  const compareInputRef = useRef<HTMLInputElement>(null);
  const compareContainerRef = useRef<HTMLDivElement>(null);
  const { data: compareSearchResults = [] } = useSymbolSearch(compareQuery);

  useEffect(() => {
    setSelectedTimeframe(normalizeTimeframe(initialTimeframe));
  }, [initialTimeframe]);

  // Focus search input when entering search mode
  useEffect(() => {
    if (isSearching && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearching]);

  // Reset highlighted index when search results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchResults]);

  // Click outside to close search
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearching(false);
        setSearchQuery('');
      }
    };
    if (isSearching) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSearching]);

  // Focus compare input when entering compare mode
  useEffect(() => {
    if (isCompareMode && compareInputRef.current) {
      compareInputRef.current.focus();
    }
  }, [isCompareMode]);

  // Reset compare highlighted index when search results change
  useEffect(() => {
    setCompareHighlightedIndex(0);
  }, [compareSearchResults]);

  // Click outside to close compare search
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (compareContainerRef.current && !compareContainerRef.current.contains(e.target as Node)) {
        setIsCompareMode(false);
        setCompareQuery('');
      }
    };
    if (isCompareMode) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCompareMode]);

  const handleSymbolSelect = (newSymbol: string) => {
    setIsSearching(false);
    setSearchQuery('');
    if (onSymbolChange && newSymbol !== symbol) {
      onSymbolChange(newSymbol);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsSearching(false);
      setSearchQuery('');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && searchResults.length > 0) {
      e.preventDefault();
      handleSymbolSelect(searchResults[highlightedIndex].symbol);
    }
  };

  const handleCompareSymbolSelect = (newSymbol: string) => {
    if (newSymbol !== symbol && !compareSymbols.includes(newSymbol) && compareSymbols.length < 6) {
      setCompareSymbols((prev) => [...prev, newSymbol]);
    }
    setIsCompareMode(false);
    setCompareQuery('');
  };

  const handleRemoveCompareSymbol = (symbolToRemove: string) => {
    setCompareSymbols((prev) => prev.filter((s) => s !== symbolToRemove));
  };

  const handleCompareKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsCompareMode(false);
      setCompareQuery('');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCompareHighlightedIndex((prev) => Math.min(prev + 1, compareSearchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCompareHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && compareSearchResults.length > 0) {
      e.preventDefault();
      handleCompareSymbolSelect(compareSearchResults[compareHighlightedIndex].symbol);
    }
  };

  // Chart refs for TradingView
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<
    ISeriesApi<'Candlestick' | 'Line' | 'Area' | 'Bar'> | null
  >(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  // Save visible range to restore after chart type/indicator changes
  const savedVisibleRangeRef = useRef<{ from: number; to: number } | null>(null);
  const lastDataKeyRef = useRef<string>(''); // Track symbol+timeframe to know when data changes

  const { data: chartData, isLoading: isLoadingChart } = useChartData(symbol, selectedTimeframe);
  const { data: quote, isLoading: isLoadingQuote } = useStockQuote(symbol);
  const { data: week52Data } = use52WeekData(symbol);

  // Fetch comparison symbols data using batch endpoint (5-10x faster)
  const intradayTimeframesSet = new Set(['1m']);
  const isIntradayTf = intradayTimeframesSet.has(selectedTimeframe);

  // Use batch loading for non-intraday timeframes (daily/weekly/monthly)
  const { data: batchCompareData } = useBatchChartData(
    compareSymbols,
    selectedTimeframe,
    !isIntradayTf && compareSymbols.length > 0
  );

  // Use individual fetches for intraday comparison (batch doesn't support intraday)
  const { data: intradayCompareData } = useIntradayCompareData(
    compareSymbols,
    isIntradayTf && compareSymbols.length > 0
  );

  // Unified compare data - use batch for daily/weekly/monthly, individual for intraday
  const unifiedCompareData = isIntradayTf ? intradayCompareData : batchCompareData;

  // Transform data for TradingView Lightweight Charts
  const sortedChartData = useMemo(() => {
    if (!chartData || !Array.isArray(chartData)) return [];
    return [...chartData].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [chartData]);

  const transformedData = useMemo(() => {
    if (sortedChartData.length === 0) return [];
    return sortedChartData.reduce<CandlestickData[]>((acc, point) => {
      const timestamp = new Date(point.timestamp);

      // TradingView time format based on timeframe
      // For intraday: extract IST time directly from timestamp string to avoid timezone issues
      const isIntraday = intradayTimeframes.has(selectedTimeframe);
      let time: Time;
      if (isIntraday) {
        // Parse IST time components directly from the timestamp string
        // This ensures we display the exact IST time regardless of browser timezone
        const match = point.timestamp.match(/T(\d{2}):(\d{2})/);
        if (match) {
          const hours = parseInt(match[1], 10);
          const minutes = parseInt(match[2], 10);
          // Create a UTC date with IST time values (TradingView displays UTC as-is)
          const dateStr = point.timestamp.split('T')[0];
          const fakeUtcDate = new Date(`${dateStr}T00:00:00Z`);
          fakeUtcDate.setUTCHours(hours, minutes, 0, 0);
          time = Math.floor(fakeUtcDate.getTime() / 1000) as Time;
        } else {
          time = Math.floor(timestamp.getTime() / 1000) as Time;
        }
      } else {
        time = timestamp.toISOString().split('T')[0] as Time; // YYYY-MM-DD for daily
      }

      const last = acc[acc.length - 1];
      if (last && last.time === time) {
        // Skip duplicates to maintain strict ordering
        return acc;
      }

      acc.push({
        time,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
      });
      return acc;
    }, []);
  }, [sortedChartData, selectedTimeframe]);

  const closingPriceData: SingleValueData[] = useMemo(() => (
    transformedData.map((point) => ({
      time: point.time,
      value: point.close,
    }))
  ), [transformedData]);

  // Calculate indicator data
  const indicatorData = useMemo(() => ({
    SMA20: calculateSMA(closingPriceData, 20),
    SMA50: calculateSMA(closingPriceData, 50),
    EMA12: calculateEMA(closingPriceData, 12),
    EMA26: calculateEMA(closingPriceData, 26),
  }), [closingPriceData]);

  // Normalize comparison data to percentage change
  const normalizedCompareData = useMemo(() => {
    if (compareSymbols.length === 0 || closingPriceData.length === 0) return [];

    // Get the base price (first visible price of main symbol)
    const mainBasePrice = closingPriceData[0]?.value || 1;

    // Normalize main symbol data to percentage
    const mainNormalized: SingleValueData[] = closingPriceData.map((point) => ({
      time: point.time,
      value: ((point.value - mainBasePrice) / mainBasePrice) * 100,
    }));

    // Create a map of time -> index for quick lookup
    const timeIndexMap = new Map<Time, number>();
    closingPriceData.forEach((point, index) => {
      timeIndexMap.set(point.time, index);
    });

    // Process each comparison symbol using batch data
    const compareData: { symbol: string; data: SingleValueData[]; color: string }[] = [];

    compareSymbols.forEach((sym, symIndex) => {
      // Get data from unified compare response (keyed by uppercase symbol)
      const upperSym = sym.toUpperCase();
      const symData = unifiedCompareData && typeof unifiedCompareData === 'object' && upperSym in unifiedCompareData
        ? (unifiedCompareData as Record<string, PriceDataPoint[]>)[upperSym]
        : undefined;
      if (!symData || !Array.isArray(symData) || symData.length === 0) return;

      // Sort and transform comparison data
      const sorted = [...symData].sort(
        (a: PriceDataPoint, b: PriceDataPoint) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      // Find base price for this symbol (first point that aligns with main chart)
      const transformedCompare: { time: Time; close: number }[] = [];
      for (const point of sorted) {
        const timestamp = new Date(point.timestamp);
        let time: Time;
        if (isIntradayTf) {
          // Parse IST time directly from timestamp string (same logic as main chart)
          const match = point.timestamp.match(/T(\d{2}):(\d{2})/);
          if (match) {
            const hours = parseInt(match[1], 10);
            const minutes = parseInt(match[2], 10);
            const dateStr = point.timestamp.split('T')[0];
            const fakeUtcDate = new Date(`${dateStr}T00:00:00Z`);
            fakeUtcDate.setUTCHours(hours, minutes, 0, 0);
            time = Math.floor(fakeUtcDate.getTime() / 1000) as Time;
          } else {
            time = Math.floor(timestamp.getTime() / 1000) as Time;
          }
        } else {
          time = timestamp.toISOString().split('T')[0] as Time;
        }

        // Only include points that exist in the main chart timeframe
        if (timeIndexMap.has(time)) {
          transformedCompare.push({ time, close: point.close });
        }
      }

      if (transformedCompare.length === 0) return;

      const compareBasePrice = transformedCompare[0].close || 1;
      const normalized: SingleValueData[] = transformedCompare.map((point) => ({
        time: point.time,
        value: ((point.close - compareBasePrice) / compareBasePrice) * 100,
      }));

      compareData.push({
        symbol: sym,
        data: normalized,
        color: compareColors[symIndex % compareColors.length],
      });
    });

    return { mainNormalized, compareData };
  }, [closingPriceData, compareSymbols, unifiedCompareData, isIntradayTf]);

  // Volume data for histogram - must use same time conversion as candlestick data
  const volumeData = useMemo(() => {
    if (sortedChartData.length === 0) return [];
    return sortedChartData.reduce<HistogramData[]>((acc, point) => {
      const timestamp = new Date(point.timestamp);
      const isIntraday = intradayTimeframes.has(selectedTimeframe);
      let time: Time;

      if (isIntraday) {
        // Parse IST time directly from timestamp string (same as candlestick data)
        const match = point.timestamp.match(/T(\d{2}):(\d{2})/);
        if (match) {
          const hours = parseInt(match[1], 10);
          const minutes = parseInt(match[2], 10);
          const dateStr = point.timestamp.split('T')[0];
          const fakeUtcDate = new Date(`${dateStr}T00:00:00Z`);
          fakeUtcDate.setUTCHours(hours, minutes, 0, 0);
          time = Math.floor(fakeUtcDate.getTime() / 1000) as Time;
        } else {
          time = Math.floor(timestamp.getTime() / 1000) as Time;
        }
      } else {
        time = timestamp.toISOString().split('T')[0] as Time;
      }

      const last = acc[acc.length - 1];
      if (last && last.time === time) {
        return acc;
      }

      acc.push({
        time,
        value: point.volume || 0,
        color: point.close >= point.open ? '#00BFFF33' : '#FF6B3533',
      });
      return acc;
    }, []);
  }, [sortedChartData, selectedTimeframe]);

  // Calculate price and change, with fallback to chart data if quote API fails
  let currentPrice = 0;
  let previousPrice = 0;
  let change = 0;
  let changePercent = 0;

  if (quote?.price) {
    // Quote API succeeded - use quote data
    currentPrice = quote.price || 0;
    previousPrice = quote.previousClose || 0;
    change = quote.change || 0;
    changePercent = quote.changePercent || 0;
  } else if (transformedData.length > 0) {
    // Quote API failed but we have chart data - calculate from chart
    const lastPoint = transformedData[transformedData.length - 1];
    const firstPoint = transformedData[0];
    currentPrice = lastPoint?.close || 0;
    previousPrice = firstPoint?.close || 0;
    
    if (previousPrice > 0) {
      change = currentPrice - previousPrice;
      changePercent = (change / previousPrice) * 100;
    }
  }

  const isPositive = change >= 0;

  // Use real data from API, show only available fields
  const yearHigh = week52Data?.high52Week;
  const yearLow = week52Data?.low52Week;

  const toggleIndicator = (indicator: string) => {
    setSelectedIndicators((prev) => {
      const isActive = prev.includes(indicator);

      if (indicator === 'Volume') {
        setShowVolume(!isActive);
      }

      return isActive
        ? prev.filter((i) => i !== indicator)
        : [...prev, indicator];
    });
  };

  // Create and update TradingView chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0A0A0A' },
        textColor: '#666',
      },
      grid: {
        vertLines: { color: '#1a1a1a' },
        horzLines: { color: '#1a1a1a' },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: {
        timeVisible: intradayTimeframes.has(selectedTimeframe),
        secondsVisible: false,
        borderColor: '#333',
      },
      rightPriceScale: {
        borderColor: '#333',
      },
    });

    const buildMainSeries = () => {
      switch (chartType) {
        case 'area': {
          const areaSeries = chart.addSeries(AreaSeries, {
            lineColor: '#00BFFF',
            topColor: 'rgba(0, 191, 255, 0.3)',
            bottomColor: 'rgba(0, 191, 255, 0.05)',
            priceLineVisible: false,
          });
          areaSeries.setData(closingPriceData);
          return areaSeries;
        }
        case 'line': {
          const lineSeries = chart.addSeries(LineSeries, {
            color: '#00BFFF',
            lineWidth: 2,
          });
          lineSeries.setData(closingPriceData);
          return lineSeries;
        }
        case 'bar': {
          const barSeries = chart.addSeries(BarSeries, {
            upColor: '#00BFFF',
            downColor: '#FF6B35',
            thinBars: false,
          });
          barSeries.setData(transformedData);
          return barSeries;
        }
        default: {
          const candlestickSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#00BFFF',
            downColor: '#FF6B35',
            borderUpColor: '#00BFFF',
            borderDownColor: '#FF6B35',
            wickUpColor: '#00BFFF',
            wickDownColor: '#FF6B35',
          });
          candlestickSeries.setData(transformedData);
          return candlestickSeries;
        }
      }
    };

    const mainSeries = buildMainSeries();

    let volumeSeries: ISeriesApi<'Histogram'> | null = null;
    if (showVolume && volumeData.length > 0) {
      volumeSeries = chart.addSeries(HistogramSeries, {
        color: '#26a69a',
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: '',
      });

      volumeSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      });

      volumeSeries.setData(volumeData);
    }

    // Add indicator line series
    const indicatorSeriesMap: Record<string, ISeriesApi<'Line'>> = {};
    const indicatorKeys = ['SMA20', 'SMA50', 'EMA12', 'EMA26'] as const;

    for (const key of indicatorKeys) {
      if (selectedIndicators.includes(key) && indicatorData[key].length > 0) {
        const series = chart.addSeries(LineSeries, {
          color: indicatorColors[key],
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          title: key,
        });
        series.setData(indicatorData[key]);
        indicatorSeriesMap[key] = series;
      }
    }

    // Add comparison line series (normalized to percentage)
    const compareSeriesMap: Record<string, ISeriesApi<'Line'>> = {};
    if (normalizedCompareData && typeof normalizedCompareData === 'object' && 'compareData' in normalizedCompareData) {
      for (const { symbol: compSymbol, data: compData, color } of normalizedCompareData.compareData) {
        if (compData.length > 0) {
          const series = chart.addSeries(LineSeries, {
            color,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            title: compSymbol,
            priceScaleId: 'compare', // Use separate scale for percentage
          });
          series.setData(compData);
          compareSeriesMap[compSymbol] = series;
        }
      }

      // Configure the comparison scale (percentage) with clear formatting
      if (Object.keys(compareSeriesMap).length > 0) {
        chart.priceScale('compare').applyOptions({
          scaleMargins: {
            top: 0.1,
            bottom: 0.2,
          },
          borderVisible: true,
          borderColor: '#FF6B6B44',
          autoScale: true,
        });

        // Add percentage formatting to comparison series
        for (const series of Object.values(compareSeriesMap)) {
          series.applyOptions({
            priceFormat: {
              type: 'custom',
              formatter: (price: number) => `${price >= 0 ? '+' : ''}${price.toFixed(2)}%`,
            },
          });
        }
      }
    }

    // Set visible range - restore saved range if data hasn't changed, otherwise show last 50 bars
    const dataLength = transformedData.length;
    const currentDataKey = `${symbol}:${selectedTimeframe}`;
    const dataChanged = currentDataKey !== lastDataKeyRef.current;
    lastDataKeyRef.current = currentDataKey;

    if (dataLength > 0) {
      if (!dataChanged && savedVisibleRangeRef.current) {
        // Restore previous visible range (chart type/indicator change only)
        const { from, to } = savedVisibleRangeRef.current;
        // Clamp to valid range
        const clampedFrom = Math.max(0, Math.min(from, dataLength - 1));
        const clampedTo = Math.max(clampedFrom, Math.min(to, dataLength - 1));
        chart.timeScale().setVisibleLogicalRange({ from: clampedFrom, to: clampedTo });
      } else {
        // New data - show last 50 bars
        const barsToShow = 50;
        const from = Math.max(0, dataLength - barsToShow);
        chart.timeScale().setVisibleLogicalRange({ from, to: dataLength - 1 });
        savedVisibleRangeRef.current = null; // Clear saved range for new data
      }
    } else {
      chart.timeScale().fitContent();
      savedVisibleRangeRef.current = null;
    }

    chartRef.current = chart;
    mainSeriesRef.current = mainSeries;
    volumeSeriesRef.current = volumeSeries;

    // Use ResizeObserver to handle container size changes (fixes chart not rendering on initial load)
    const resizeObserver = new ResizeObserver((entries) => {
      if (chartContainerRef.current && chartRef.current) {
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) {
          chartRef.current.applyOptions({ width, height });
        }
      }
    });

    if (chartContainerRef.current) {
      resizeObserver.observe(chartContainerRef.current);
    }

    // Also trigger initial resize after a short delay to ensure container has dimensions
    const initialResizeTimeout = setTimeout(() => {
      if (chartContainerRef.current && chartRef.current) {
        const width = chartContainerRef.current.clientWidth;
        const height = chartContainerRef.current.clientHeight;
        if (width > 0 && height > 0) {
          chartRef.current.applyOptions({ width, height });
        }
      }
    }, 50);

    return () => {
      clearTimeout(initialResizeTimeout);
      resizeObserver.disconnect();
      // Save visible range before destroying chart (for restoring after chart type/indicator change)
      try {
        const visibleRange = chart.timeScale().getVisibleLogicalRange();
        if (visibleRange) {
          savedVisibleRangeRef.current = { from: visibleRange.from, to: visibleRange.to };
        }
      } catch {
        // Chart might already be removed
      }
      chart.remove();
      if (chartRef.current === chart) {
        chartRef.current = null;
      }
      if (mainSeriesRef.current === mainSeries) {
        mainSeriesRef.current = null;
      }
      if (volumeSeriesRef.current === volumeSeries) {
        volumeSeriesRef.current = null;
      }
    };
  }, [chartType, closingPriceData, selectedTimeframe, showVolume, transformedData, volumeData, selectedIndicators, indicatorData, normalizedCompareData]);

  if (isLoadingQuote || isLoadingChart) {
    return (
      <div className="h-full flex items-center justify-center bg-card">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <span className="text-sm text-muted-foreground uppercase tracking-wide">Loading {symbol}...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-card">
      {!hideToolbar && (
      <div className="px-3 py-1.5 border-b border-border">
        <div className="flex items-start justify-between mb-1">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <div ref={searchContainerRef} className="relative">
                {isSearching ? (
                  <div className="relative">
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      placeholder="Search symbol..."
                      className="w-48 h-8 px-2 bg-card border border-primary rounded font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    {searchResults.length > 0 && (
                      <div className="absolute top-full left-0 mt-1 w-64 max-h-48 overflow-y-auto bg-card border border-border rounded shadow-lg z-50">
                        {searchResults.map((result, index) => (
                          <button
                            key={result.symbol}
                            onClick={() => handleSymbolSelect(result.symbol)}
                            onMouseEnter={() => setHighlightedIndex(index)}
                            className={cn(
                              "w-full px-3 py-2 text-left flex items-center gap-2 transition-colors",
                              highlightedIndex === index ? "bg-primary/20" : "hover:bg-muted"
                            )}
                          >
                            <span className="font-mono font-bold text-sm text-secondary">{result.symbol}</span>
                            <span className="text-xs text-muted-foreground truncate">{result.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchQuery.length >= 2 && searchResults.length === 0 && (
                      <div className="absolute top-full left-0 mt-1 w-64 bg-card border border-border rounded shadow-lg z-50 px-3 py-2">
                        <span className="text-xs text-muted-foreground">No results found</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <h3
                    onClick={() => onSymbolChange && setIsSearching(true)}
                    className={cn(
                      "text-xl font-mono text-secondary financial-ticker",
                      onSymbolChange && "cursor-pointer hover:text-primary transition-colors"
                    )}
                    data-testid={`chart-symbol-${symbol}`}
                    title={onSymbolChange ? "Click to change symbol" : undefined}
                  >
                    {symbol}
                  </h3>
                )}
              </div>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary/50 text-primary">
                NSE
              </Badge>
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-mono text-foreground financial-price" data-testid={`chart-price-${symbol}`}>
                ₹{currentPrice.toFixed(2)}
              </span>
              <div className={cn("flex items-center gap-1", isPositive ? 'financial-change-positive' : 'financial-change-negative')}>
                {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span className="text-sm font-mono" data-testid={`chart-change-${symbol}`}>
                  {isPositive ? '+' : ''}{change.toFixed(2)} ({isPositive ? '+' : ''}{changePercent.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>
          
          {/* Chart Controls */}
          <div className="flex flex-col gap-1">
            {/* Timeframe Selector */}
            <div className="flex gap-1">
              {timeframes.map((tf) => (
                <Button
                  key={tf}
                  size="sm"
                  variant={selectedTimeframe === tf ? 'default' : 'ghost'}
                  className={cn(
                    "h-6 px-2 text-[10px] font-bold uppercase",
                    selectedTimeframe === tf ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                  )}
                  onClick={() => setSelectedTimeframe(tf)}
                  data-testid={`button-timeframe-${tf}`}
                >
                  {tf.toUpperCase()}
                </Button>
              ))}
            </div>
            
            {/* Chart Type Selector */}
            <div className="flex gap-1">
              {chartTypes.map((type) => (
                <Button
                  key={type.value}
                  size="icon"
                  variant={chartType === type.value ? 'default' : 'ghost'}
                  className="h-6 w-6"
                  onClick={() => setChartType(type.value)}
                  title={type.label}
                >
                  <type.icon className="w-3 h-3" />
                </Button>
              ))}
              <div ref={compareContainerRef} className="relative">
                <Button
                  size="icon"
                  variant={compareSymbols.length > 0 ? 'default' : 'ghost'}
                  className={cn("h-6 w-6", compareSymbols.length > 0 && "bg-primary/20")}
                  onClick={() => setIsCompareMode(!isCompareMode)}
                  title="Compare symbols"
                >
                  <GitCompare className="w-3 h-3" />
                </Button>
                {isCompareMode && (
                  <div className="absolute top-full right-0 mt-1 z-50">
                    <input
                      ref={compareInputRef}
                      type="text"
                      value={compareQuery}
                      onChange={(e) => setCompareQuery(e.target.value)}
                      onKeyDown={handleCompareKeyDown}
                      placeholder="Add symbol..."
                      className="w-48 h-8 px-2 bg-card border border-primary rounded font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    {compareSearchResults.length > 0 && (
                      <div className="mt-1 w-64 max-h-48 overflow-y-auto bg-card border border-border rounded shadow-lg">
                        {compareSearchResults
                          .filter((r) => r.symbol !== symbol && !compareSymbols.includes(r.symbol))
                          .map((result, index) => (
                          <button
                            key={result.symbol}
                            onClick={() => handleCompareSymbolSelect(result.symbol)}
                            onMouseEnter={() => setCompareHighlightedIndex(index)}
                            className={cn(
                              "w-full px-3 py-2 text-left flex items-center gap-2 transition-colors",
                              compareHighlightedIndex === index ? "bg-primary/20" : "hover:bg-muted"
                            )}
                          >
                            <span className="font-mono font-bold text-sm text-secondary">{result.symbol}</span>
                            <span className="text-xs text-muted-foreground truncate">{result.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {compareQuery.length >= 2 && compareSearchResults.length === 0 && (
                      <div className="mt-1 w-64 bg-card border border-border rounded shadow-lg px-3 py-2">
                        <span className="text-xs text-muted-foreground">No results found</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Compare Legend with current values */}
        {compareSymbols.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card/50">
            <span className="text-[10px] text-muted-foreground uppercase">Compare (% change):</span>
            <Badge
              variant="outline"
              className="text-[9px] px-1.5 py-0.5 border-[#00BFFF] text-[#00BFFF] flex items-center gap-1"
            >
              <span className="font-bold">{symbol}</span>
              <span className="text-[#00BFFF]/70">₹{currentPrice.toFixed(2)}</span>
              {normalizedCompareData && 'mainNormalized' in normalizedCompareData && normalizedCompareData.mainNormalized.length > 0 && (
                <span className={cn(
                  "ml-1",
                  normalizedCompareData.mainNormalized[normalizedCompareData.mainNormalized.length - 1].value >= 0
                    ? "text-green-400"
                    : "text-red-400"
                )}>
                  {normalizedCompareData.mainNormalized[normalizedCompareData.mainNormalized.length - 1].value >= 0 ? '+' : ''}
                  {normalizedCompareData.mainNormalized[normalizedCompareData.mainNormalized.length - 1].value.toFixed(2)}%
                </span>
              )}
            </Badge>
            {compareSymbols.map((sym, index) => {
              // Get current percentage from normalized data
              const compData = normalizedCompareData && 'compareData' in normalizedCompareData
                ? normalizedCompareData.compareData.find(c => c.symbol === sym)
                : undefined;
              const currentPct = compData?.data[compData.data.length - 1]?.value;

              return (
                <Badge
                  key={sym}
                  variant="outline"
                  className="text-[9px] px-1.5 py-0.5 flex items-center gap-1 cursor-pointer group"
                  style={{ borderColor: compareColors[index % compareColors.length], color: compareColors[index % compareColors.length] }}
                  onClick={() => handleRemoveCompareSymbol(sym)}
                >
                  <span className="font-bold">{sym}</span>
                  {currentPct !== undefined && (
                    <span style={{ color: currentPct >= 0 ? '#4ade80' : '#f87171' }}>
                      {currentPct >= 0 ? '+' : ''}{currentPct.toFixed(2)}%
                    </span>
                  )}
                  <X className="w-2.5 h-2.5 opacity-50 group-hover:opacity-100" />
                </Badge>
              );
            })}
            <button
              onClick={() => setCompareSymbols([])}
              className="text-[9px] text-muted-foreground hover:text-destructive transition-colors ml-1"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Key Metrics - Only show data we actually have */}
        <div className="grid grid-cols-4 gap-2 mt-2 pt-2 border-t border-border">
          <div>
            <span className="text-[9px] text-muted-foreground uppercase block">Open</span>
            <span className="text-xs font-mono font-bold text-foreground">
              ₹{quote?.open?.toFixed(2) || '-'}
            </span>
          </div>
          <div>
            <span className="text-[9px] text-muted-foreground uppercase block">High</span>
            <span className="text-xs font-mono font-bold text-primary">
              ₹{quote?.high?.toFixed(2) || '-'}
            </span>
          </div>
          <div>
            <span className="text-[9px] text-muted-foreground uppercase block">Low</span>
            <span className="text-xs font-mono font-bold text-destructive">
              ₹{quote?.low?.toFixed(2) || '-'}
            </span>
          </div>
          <div>
            <span className="text-[9px] text-muted-foreground uppercase block">Volume</span>
            <span className="text-xs font-mono font-bold">
              {quote?.volume?.toLocaleString() || '-'}
            </span>
          </div>
        </div>
        
        {/* 52 Week Range if available */}
        {(yearHigh && yearLow) && (
          <div className="mt-2 pt-2 border-t border-border">
            <span className="text-[9px] text-muted-foreground uppercase block mb-1">52W Range</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-destructive">
                ₹{yearLow.toFixed(2)}
              </span>
              <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-destructive via-accent to-primary rounded-full"
                  style={{ 
                    width: `${Math.min(100, Math.max(0, ((currentPrice - yearLow) / (yearHigh - yearLow)) * 100))}%` 
                  }}
                  title={`Current: ₹${currentPrice.toFixed(2)}`}
                />
              </div>
              <span className="text-xs font-mono font-bold text-primary">
                ₹{yearHigh.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Technical Indicators Selector */}
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
          <span className="text-[10px] text-muted-foreground uppercase">Indicators:</span>
          <div className="flex gap-1 flex-wrap">
            {indicators.map((indicator) => (
              <Badge
                key={indicator}
                variant={selectedIndicators.includes(indicator) ? "default" : "outline"}
                className={cn(
                  "text-[9px] px-1.5 py-0 cursor-pointer",
                  selectedIndicators.includes(indicator) && "bg-primary/20 border-primary"
                )}
                onClick={() => toggleIndicator(indicator)}
              >
                {indicator}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      )}
      {/* Chart Area with TradingView */}
      <div className={`flex-1 ${hideToolbar ? 'p-1' : 'p-2'}`}>
        {transformedData.length > 0 ? (
          <div
            ref={chartContainerRef}
            className="w-full h-full"
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <div className="text-center">
              <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-2 opacity-50" />
              {intradayTimeframes.has(selectedTimeframe) ? (
                <>
                  <p className="text-muted-foreground text-sm font-mono">
                    Intraday ({selectedTimeframe}) data loading for {symbol}...
                  </p>
                  <p className="text-muted-foreground/70 text-xs mt-1">
                    Try switching between 1m, 5m, 15m, 1h, or view daily candles (1D)
                  </p>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground text-sm font-mono">
                    No chart data available for {symbol}
                  </p>
                  <p className="text-muted-foreground/70 text-xs mt-1">
                    Check symbol or try different timeframe
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
