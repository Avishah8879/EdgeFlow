/**
 * Order Book Heatmap Component
 *
 * Real-time 50-level order book depth visualization using Plotly.js heatmap.
 * Combined view: 75% Heatmap + 25% Order Book Ladder
 * Displays bid/ask depth, spread, imbalance, and total quantities.
 */

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Wifi,
  WifiOff,
  Search,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { cn, getCurrentFuturesInfo } from '@/lib/utils';
import Plot from '@/components/ft/PlotlyChart';
import { useDepthWebSocket, type DepthData } from '@/hooks/useDepthWebSocket';
import { useMarketStatus } from '@/hooks/use-market-status';
import { useSymbolSearch } from '@/hooks/useSymbolSearch';

// Get futures info with expiry dates
const niftyFut = getCurrentFuturesInfo('NIFTY');
const bankniftyFut = getCurrentFuturesInfo('BANKNIFTY');

// Symbol options for quick selection
// Note: NIFTY and BANKNIFTY use futures contracts (dynamic) because indices don't have depth data
const SYMBOL_OPTIONS = [
  { label: `NIFTY 50`, value: niftyFut.symbol, expiry: niftyFut.expiryStr },
  { label: `BANKNIFTY`, value: bankniftyFut.symbol, expiry: bankniftyFut.expiryStr },
  { label: 'RELIANCE', value: 'NSE:RELIANCE-EQ' },
  { label: 'AQYLON', value: 'NSE:AQYLON-BE' },
  { label: 'RAMASTEEL', value: 'NSE:RAMASTEEL-EQ' },
  { label: 'TCS', value: 'NSE:TCS-EQ' },
  { label: 'HDFCBANK', value: 'NSE:HDFCBANK-EQ' },
  { label: 'INFY', value: 'NSE:INFY-EQ' },
  { label: 'ICICIBANK', value: 'NSE:ICICIBANK-EQ' },
  { label: 'SBIN', value: 'NSE:SBIN-EQ' },
];

// Maximum data points to keep in heatmap history (full trading day ~6.25 hours)
// With data every ~0.5 seconds, full day = ~45000 entries
// Setting to 50000 to accommodate full trading day with buffer
const MAX_HEATMAP_POINTS = 50000;

// Aggregation bucket size in milliseconds (1 minute)
const AGGREGATION_BUCKET_MS = 60000;

// Initial visible window - show latest N data points
const INITIAL_VISIBLE_POINTS = 500;

// Levels to display in unified heatmap (bid + ask combined)
const HEATMAP_LEVELS = 20;

// Levels to show in ladder (reduced for better readability)
const LADDER_LEVELS = 20;

// Number of price levels for unified heatmap Y-axis
const UNIFIED_PRICE_LEVELS = 40;

interface Props {
  symbol?: string;
  onSymbolChange?: (symbol: string) => void;
}

// Helper to format numbers
function formatNumber(num: number | undefined, decimals = 2): string {
  if (num === undefined || num === null || !Number.isFinite(num)) return '-';
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatCompact(num: number | undefined): string {
  if (num === undefined || num === null || !Number.isFinite(num)) return '-';
  if (Math.abs(num) >= 10000000) return `${(num / 10000000).toFixed(2)}Cr`;
  if (Math.abs(num) >= 100000) return `${(num / 100000).toFixed(2)}L`;
  if (Math.abs(num) >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString('en-IN');
}

/**
 * Aggregate depth data into time buckets for full-day view
 * Takes the last snapshot in each bucket (most recent state)
 */
function aggregateDepthHistory(
  data: DepthData[],
  bucketMs: number = AGGREGATION_BUCKET_MS
): DepthData[] {
  if (data.length === 0) return [];

  const buckets = new Map<number, DepthData>();

  for (const snap of data) {
    const ts = snap.t / 1e6; // Convert nanoseconds to milliseconds
    const bucketKey = Math.floor(ts / bucketMs) * bucketMs;
    // Keep the latest snapshot in each bucket
    buckets.set(bucketKey, snap);
  }

  // Sort by bucket time and return
  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([_, snap]) => snap);
}

/**
 * Format timestamp in IST timezone
 */
function formatTimeIST(date: Date): string {
  return date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Convert timestamp to IST-adjusted Date for Plotly display.
 * Plotly displays dates in the browser's local timezone.
 * This function creates a Date that when displayed will show IST time.
 */
function toISTDisplayDate(timestampMs: number): Date {
  // Get the IST time components
  const date = new Date(timestampMs);
  const istString = date.toLocaleString('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  // Parse back as local time (this creates a Date with IST values as local values)
  // Format: "MM/DD/YYYY, HH:MM:SS"
  const [datePart, timePart] = istString.split(', ');
  const [month, day, year] = datePart.split('/');
  const [hour, minute, second] = timePart.split(':');
  return new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
    parseInt(second)
  );
}

export function OrderBookHeatmap({ symbol: initialSymbol, onSymbolChange }: Props) {
  const [selectedSymbol, setSelectedSymbol] = useState(
    initialSymbol || SYMBOL_OPTIONS[0].value
  );
  const [symbolInput, setSymbolInput] = useState('');

  // Symbol search autocomplete state
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);

  // Intensity range for heatmap color scaling (percentage of maxQty: 0-100)
  const [intensityRange, setIntensityRange] = useState<[number, number]>([0, 100]);

  // Refs for ladder scroll containers
  const askScrollRef = useRef<HTMLDivElement>(null);
  const bidScrollRef = useRef<HTMLDivElement>(null);

  // Track current heatmap view index (for syncing ladder with heatmap scroll)
  // null = live view, number = historical index in heatmapHistory
  const [viewEndIndex, setViewEndIndex] = useState<number | null>(null);

  // Ref to store heatmap history for stable callback access
  const heatmapHistoryRef = useRef<{
    timestamps: number[];
    snapshots: DepthData[];
  }>({ timestamps: [], snapshots: [] });

  // Track if we've set the initial range (to prevent auto-scrolling after first load)
  const initialRangeSetRef = useRef(false);

  // Heatmap history data - stores raw depth snapshots
  const [heatmapHistory, setHeatmapHistory] = useState<{
    timestamps: number[];
    snapshots: DepthData[];
  }>({
    timestamps: [],
    snapshots: [],
  });

  // Sync with parent-provided symbol (e.g., from restored layout)
  useEffect(() => {
    if (initialSymbol && initialSymbol !== selectedSymbol) {
      setSelectedSymbol(initialSymbol);
      setHeatmapHistory({ timestamps: [], snapshots: [] });
      setViewEndIndex(null);
      initialRangeSetRef.current = false;
    }
  }, [initialSymbol]); // eslint-disable-line react-hooks/exhaustive-deps

  // Symbol search hook
  const { data: searchResults, isLoading: isSearching } = useSymbolSearch(searchQuery);
  const { data: marketStatus } = useMarketStatus();
  const isMarketOpen = marketStatus?.is_open === true;

  // WebSocket connection
  const {
    data,
    history,
    isConnected,
    isPending,
    isUnavailable,
    error,
    lastUpdate,
    reconnect,
  } = useDepthWebSocket(selectedSymbol, {
    enabled: true,
    onHistory: (historyData) => {
      // Aggregate historical data into 1-minute buckets for full-day view
      const aggregatedHistory = aggregateDepthHistory(historyData);
      console.log(`[Heatmap] Received ${historyData.length} history points, aggregated to ${aggregatedHistory.length} buckets`);
      setHeatmapHistory({
        timestamps: aggregatedHistory.map(d => d.t / 1e6),
        snapshots: aggregatedHistory,
      });
    },
  });

  // Update heatmap history with new data
  useEffect(() => {
    if (!data) return;

    setHeatmapHistory((prev) => {
      const newTimestamps = [...prev.timestamps, data.t / 1e6];
      const newSnapshots = [...prev.snapshots, data];
      const startIdx = Math.max(0, newTimestamps.length - MAX_HEATMAP_POINTS);

      const newHistory = {
        timestamps: newTimestamps.slice(startIdx),
        snapshots: newSnapshots.slice(startIdx),
      };

      // Keep ref in sync for stable callback access
      heatmapHistoryRef.current = newHistory;

      return newHistory;
    });
  }, [data]);

  // Also update ref when history is reset (e.g., symbol change or initial load)
  useEffect(() => {
    heatmapHistoryRef.current = heatmapHistory;
  }, [heatmapHistory]);

  // Track if we've scrolled the ASK section initially
  const askScrolledRef = useRef(false);

  // Auto-scroll ASK section to bottom once (to show best asks near mid-price)
  useEffect(() => {
    if (askScrollRef.current && data && !askScrolledRef.current) {
      // Small delay to ensure content is rendered
      setTimeout(() => {
        if (askScrollRef.current) {
          askScrollRef.current.scrollTop = askScrollRef.current.scrollHeight;
          askScrolledRef.current = true;
        }
      }, 100);
    }
  }, [data]);

  // Reset scroll flag when symbol changes
  useEffect(() => {
    askScrolledRef.current = false;
  }, [selectedSymbol]);

  // Calculate derived metrics
  const metrics = useMemo(() => {
    if (!data) return null;

    const bestBid = data.b[0] || 0;
    const bestAsk = data.a[0] || 0;
    const spread = bestAsk - bestBid;
    const spreadPercent = bestBid > 0 ? (spread / bestBid) * 100 : 0;
    const midPrice = (bestBid + bestAsk) / 2;

    const totalBidQty = data.bq.reduce((a, b) => a + b, 0);
    const totalAskQty = data.aq.reduce((a, b) => a + b, 0);
    const imbalance = totalBidQty + totalAskQty > 0
      ? (totalBidQty - totalAskQty) / (totalBidQty + totalAskQty)
      : 0;

    return {
      bestBid,
      bestAsk,
      spread,
      spreadPercent,
      midPrice,
      totalBidQty: data.tbq,
      totalAskQty: data.tsq,
      imbalance,
    };
  }, [data]);

  // Handle symbol search
  const handleSymbolSearch = useCallback(() => {
    if (symbolInput.trim()) {
      const formatted = symbolInput.toUpperCase().includes(':')
        ? symbolInput.toUpperCase()
        : `NSE:${symbolInput.toUpperCase()}-EQ`;
      setSelectedSymbol(formatted);
      onSymbolChange?.(formatted);
      setHeatmapHistory({
        timestamps: [],
        snapshots: [],
      });
      setViewEndIndex(null); // Reset to live view on symbol change
      initialRangeSetRef.current = false; // Reset so new symbol gets proper initial range
    }
  }, [symbolInput, onSymbolChange]);

  // Unified heatmap data - combines bids and asks on a single price axis
  const unifiedHeatmapData = useMemo(() => {
    if (heatmapHistory.snapshots.length === 0) return null;

    // Find price range across all snapshots
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    heatmapHistory.snapshots.forEach((snap) => {
      // Get valid bid prices (lowest bid prices are at higher indices)
      for (let i = 0; i < HEATMAP_LEVELS; i++) {
        if (snap.b[i] > 0) {
          minPrice = Math.min(minPrice, snap.b[i]);
          maxPrice = Math.max(maxPrice, snap.b[i]);
        }
        if (snap.a[i] > 0) {
          minPrice = Math.min(minPrice, snap.a[i]);
          maxPrice = Math.max(maxPrice, snap.a[i]);
        }
      }
    });

    if (minPrice === Infinity || maxPrice === -Infinity) return null;

    // Add some padding to price range
    const priceRange = maxPrice - minPrice;
    const padding = priceRange * 0.05;
    minPrice -= padding;
    maxPrice += padding;

    // Create price levels (Y-axis)
    const priceStep = (maxPrice - minPrice) / UNIFIED_PRICE_LEVELS;
    const priceLevels: number[] = [];
    for (let i = 0; i < UNIFIED_PRICE_LEVELS; i++) {
      priceLevels.push(minPrice + i * priceStep);
    }

    // Helper function to map price to level index using direct mapping
    // This avoids the proximity threshold issue when price range expands
    const getPriceLevelIndex = (price: number): number => {
      return Math.round((price - minPrice) / priceStep);
    };

    // Build Z matrix: rows are price levels, columns are time points
    // Initialize with zeros - each row is a price level, each column is a time point
    const zData: number[][] = Array.from({ length: UNIFIED_PRICE_LEVELS }, () =>
      Array(heatmapHistory.snapshots.length).fill(0)
    );

    // Map each snapshot's depth data directly to price level indices
    heatmapHistory.snapshots.forEach((snap, timeIdx) => {
      // Map bids - directly assign to closest price level
      for (let i = 0; i < HEATMAP_LEVELS; i++) {
        const bidPrice = snap.b[i];
        if (bidPrice > 0) {
          const levelIdx = getPriceLevelIndex(bidPrice);
          if (levelIdx >= 0 && levelIdx < UNIFIED_PRICE_LEVELS) {
            zData[levelIdx][timeIdx] += snap.bq[i] || 0;
          }
        }
      }

      // Map asks - directly assign to closest price level
      for (let i = 0; i < HEATMAP_LEVELS; i++) {
        const askPrice = snap.a[i];
        if (askPrice > 0) {
          const levelIdx = getPriceLevelIndex(askPrice);
          if (levelIdx >= 0 && levelIdx < UNIFIED_PRICE_LEVELS) {
            zData[levelIdx][timeIdx] += snap.aq[i] || 0;
          }
        }
      }
    });

    // Find max quantity for color scaling
    const maxQty = Math.max(...zData.flat().filter(q => q > 0), 1);

    return {
      z: zData,
      x: heatmapHistory.timestamps.map((t) => toISTDisplayDate(t)),
      y: priceLevels.map((p) => p.toFixed(2)),
      type: 'heatmap' as const,
      colorscale: [
        [0, 'rgba(20, 10, 40, 0.1)'],
        [0.2, 'rgba(80, 40, 120, 0.5)'],
        [0.4, 'rgba(120, 60, 160, 0.7)'],
        [0.6, 'rgba(200, 100, 80, 0.8)'],
        [0.8, 'rgba(255, 180, 50, 0.9)'],
        [1, 'rgba(255, 255, 100, 1)'],
      ] as [number, string][],
      showscale: true,
      colorbar: {
        title: { text: 'Qty', font: { size: 10, color: 'rgba(255,255,255,0.6)' } },
        tickfont: { size: 9, color: 'rgba(255,255,255,0.6)' },
        thickness: 15,
        len: 0.8,
      },
      hovertemplate: 'Price: %{y}<br>Time: %{x|%d-%b-%Y %H:%M:%S}<br>Qty: %{z:,.0f}<extra></extra>',
      // Apply intensity range clipping (percentage of maxQty)
      zmax: maxQty * (intensityRange[1] / 100),
      zmin: maxQty * (intensityRange[0] / 100),
      maxQty, // Expose for slider display
    };
  }, [heatmapHistory, intensityRange]);

  // Mid-price line for overlay
  const midPriceLine = useMemo(() => {
    if (heatmapHistory.snapshots.length === 0) return null;

    const xData: Date[] = [];
    const yData: number[] = [];

    heatmapHistory.snapshots.forEach((snap, idx) => {
      const bestBid = snap.b[0] || 0;
      const bestAsk = snap.a[0] || 0;
      if (bestBid > 0 && bestAsk > 0) {
        xData.push(toISTDisplayDate(heatmapHistory.timestamps[idx]));
        yData.push((bestBid + bestAsk) / 2);
      }
    });

    return {
      x: xData,
      y: yData.map((p) => p.toFixed(2)),
      type: 'scatter' as const,
      mode: 'lines' as const,
      line: { color: 'rgba(255, 255, 255, 0.8)', width: 2 },
      name: 'Mid Price',
      hovertemplate: 'Mid: %{y}<extra></extra>',
    };
  }, [heatmapHistory]);

  // Calculate initial visible range (last N points) - only set once
  const initialXRange = useMemo(() => {
    if (heatmapHistory.timestamps.length === 0) return undefined;

    // Only set the initial range once (to prevent auto-scrolling after user interaction)
    if (initialRangeSetRef.current) {
      return undefined; // Let Plotly manage the range after initial load
    }

    // Need at least some data points before setting initial range
    if (heatmapHistory.timestamps.length < 10) return undefined;

    initialRangeSetRef.current = true;

    const totalPoints = heatmapHistory.timestamps.length;
    const startIdx = Math.max(0, totalPoints - INITIAL_VISIBLE_POINTS);

    // Return the range for the last INITIAL_VISIBLE_POINTS (using IST-adjusted dates)
    return [
      toISTDisplayDate(heatmapHistory.timestamps[startIdx]),
      toISTDisplayDate(heatmapHistory.timestamps[totalPoints - 1]),
    ];
  }, [heatmapHistory.timestamps]);

  // Plotly layout with IST timezone display and rangeslider
  const plotLayout = useMemo(() => ({
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    margin: { l: 60, r: 20, t: 10, b: 80 }, // Increased bottom margin for rangeslider
    xaxis: {
      type: 'date' as const,
      gridcolor: 'rgba(255,255,255,0.1)',
      tickfont: { color: 'rgba(255,255,255,0.6)', size: 10 },
      // Format: HH:MM (24-hour) - timestamps are already in IST from server
      tickformat: '%H:%M',
      // Show date on first tick of day
      tickformatstops: [
        { dtickrange: [null, 60000] as [null, number], value: '%H:%M:%S' },      // < 1 min: show seconds
        { dtickrange: [60000, 3600000] as [number, number], value: '%H:%M' },     // 1 min - 1 hour: show HH:MM
        { dtickrange: [3600000, 86400000] as [number, number], value: '%H:%M' },  // 1 hour - 1 day: show HH:MM
        { dtickrange: [86400000, null] as [number, null], value: '%d-%b %H:%M' }, // > 1 day: show date
      ],
      title: {
        text: 'Time (IST)',
        font: { size: 10, color: 'rgba(255,255,255,0.5)' },
        standoff: 5,
      },
      // Rangeslider for scrolling through history
      rangeslider: {
        visible: true,
        thickness: 0.08,
        bgcolor: 'rgba(30, 30, 40, 0.8)',
        bordercolor: 'rgba(100, 100, 120, 0.5)',
        borderwidth: 1,
      },
      // Set initial visible range to last N points
      range: initialXRange,
    },
    yaxis: {
      gridcolor: 'rgba(255,255,255,0.1)',
      tickfont: { color: 'rgba(255,255,255,0.6)', size: 10 },
      title: {
        text: 'Price',
        font: { size: 10, color: 'rgba(255,255,255,0.5)' },
        standoff: 5,
      },
      // Fix y-axis to prevent it from auto-ranging with x-axis changes
      fixedrange: false,
    },
    showlegend: false,
    // Enable drag to pan/zoom
    dragmode: 'pan' as const,
  }), [initialXRange]);

  // Display symbol name and expiry info
  const { displayName, expiryInfo } = useMemo(() => {
    const match = SYMBOL_OPTIONS.find((s) => s.value === selectedSymbol);
    if (match) {
      return {
        displayName: match.label,
        expiryInfo: match.expiry || null
      };
    }
    const parts = selectedSymbol.split(':');
    if (parts.length === 2) {
      return {
        displayName: parts[1].replace('-EQ', '').replace('-INDEX', ''),
        expiryInfo: null
      };
    }
    return { displayName: selectedSymbol, expiryInfo: null };
  }, [selectedSymbol]);

  // Get snapshot data for the current view (synced with heatmap scroll)
  const currentSnapshot = useMemo(() => {
    // If no view index set, use live data
    if (viewEndIndex === null || !heatmapHistory.snapshots.length) {
      return data;
    }

    // Clamp index to valid range
    const clampedIdx = Math.min(viewEndIndex, heatmapHistory.snapshots.length - 1);

    // Return the historical snapshot at the specified index
    return heatmapHistory.snapshots[clampedIdx] || data;
  }, [viewEndIndex, heatmapHistory.snapshots, data]);

  // Get the timestamp for the current view (for display)
  // Shows null for live view, or the historical timestamp when viewing history
  const viewEndTime = useMemo(() => {
    if (viewEndIndex === null || !heatmapHistory.timestamps.length) {
      return null;
    }
    const clampedIdx = Math.min(viewEndIndex, heatmapHistory.timestamps.length - 1);
    return heatmapHistory.timestamps[clampedIdx];
  }, [viewEndIndex, heatmapHistory.timestamps]);

  // Get all 50 levels of bid/ask data (synced with heatmap view)
  // Filter out invalid/duplicate prices and sort properly
  const ladderData = useMemo(() => {
    if (!currentSnapshot) return null;

    const bids: Array<{ price: number; qty: number; orders: number }> = [];
    const asks: Array<{ price: number; qty: number; orders: number }> = [];
    const seenBidPrices = new Set<number>();
    const seenAskPrices = new Set<number>();

    for (let i = 0; i < LADDER_LEVELS; i++) {
      const bidPrice = currentSnapshot.b[i] || 0;
      const askPrice = currentSnapshot.a[i] || 0;

      // Only add valid, unique bid prices
      if (bidPrice > 0 && !seenBidPrices.has(bidPrice)) {
        seenBidPrices.add(bidPrice);
        bids.push({
          price: bidPrice,
          qty: currentSnapshot.bq[i] || 0,
          orders: currentSnapshot.bo?.[i] || 0,
        });
      }

      // Only add valid, unique ask prices
      if (askPrice > 0 && !seenAskPrices.has(askPrice)) {
        seenAskPrices.add(askPrice);
        asks.push({
          price: askPrice,
          qty: currentSnapshot.aq[i] || 0,
          orders: currentSnapshot.ao?.[i] || 0,
        });
      }
    }

    // Sort bids descending (best bid = highest price first)
    bids.sort((a, b) => b.price - a.price);

    // Sort asks ascending (best ask = lowest price first)
    asks.sort((a, b) => a.price - b.price);

    const maxBidQty = Math.max(...bids.map(b => b.qty).filter(q => q > 0), 1);
    const maxAskQty = Math.max(...asks.map(a => a.qty).filter(q => q > 0), 1);
    // Use combined max for consistent normalization across both sides
    const maxQty = Math.max(maxBidQty, maxAskQty);

    return { bids, asks, maxBidQty, maxAskQty, maxQty };
  }, [currentSnapshot]);

  // Metrics for current view (synced with heatmap)
  const ladderMetrics = useMemo(() => {
    if (!currentSnapshot) return null;

    const bestBid = currentSnapshot.b[0] || 0;
    const bestAsk = currentSnapshot.a[0] || 0;
    const spread = bestAsk - bestBid;
    const spreadPercent = bestBid > 0 ? (spread / bestBid) * 100 : 0;
    const midPrice = (bestBid + bestAsk) / 2;

    const totalBidQty = currentSnapshot.bq.reduce((a, b) => a + b, 0);
    const totalAskQty = currentSnapshot.aq.reduce((a, b) => a + b, 0);
    const imbalance = totalBidQty + totalAskQty > 0
      ? (totalBidQty - totalAskQty) / (totalBidQty + totalAskQty)
      : 0;

    return {
      bestBid,
      bestAsk,
      spread,
      spreadPercent,
      midPrice,
      totalBidQty: currentSnapshot.tbq,
      totalAskQty: currentSnapshot.tsq,
      imbalance,
    };
  }, [currentSnapshot]);

  // Handle Plotly relayout (when user scrolls/zooms the heatmap)
  // Using ref for timestamps to keep callback stable and avoid Plotly re-registration issues
  const handlePlotlyRelayout = useCallback((event: Record<string, unknown>) => {
    // Extract the x-axis range from the event
    // Handle both formats: xaxis.range[1] (from pan) and xaxis.range (from rangeslider)
    let endDateStr: string | null = null;

    if (event['xaxis.range[1]']) {
      endDateStr = event['xaxis.range[1]'] as string;
    } else if (event['xaxis.range']) {
      const range = event['xaxis.range'] as unknown;
      if (Array.isArray(range) && range.length >= 2) {
        endDateStr = range[1] as string;
      }
    }

    // Access timestamps from ref for stability
    const timestamps = heatmapHistoryRef.current.timestamps;

    if (endDateStr && timestamps.length > 0) {
      const displayedEndDate = new Date(endDateStr);
      const displayedEndMs = displayedEndDate.getTime();

      // Find the closest index in our data by comparing displayed dates
      let closestIdx = 0;
      let closestDiff = Infinity;

      for (let i = 0; i < timestamps.length; i++) {
        const displayedTs = toISTDisplayDate(timestamps[i]).getTime();
        const diff = Math.abs(displayedTs - displayedEndMs);
        if (diff < closestDiff) {
          closestDiff = diff;
          closestIdx = i;
        }
      }

      // If at or near the end (last 5 entries), reset to live view
      if (closestIdx >= timestamps.length - 5) {
        setViewEndIndex(null);
      } else {
        setViewEndIndex(closestIdx);
      }
    } else if (event['xaxis.autorange']) {
      setViewEndIndex(null);
    }
  }, []); // No dependencies - uses ref for stable callback

  return (
    <div className="h-full flex flex-col bg-black text-white font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-blue-400">{displayName}</span>
          {expiryInfo && (
            <span className="text-[10px] text-yellow-500/80 font-medium">
              (Exp: {expiryInfo})
            </span>
          )}
          {isUnavailable ? (
            <Badge variant="outline" className="border-orange-500/50 text-orange-400 text-[10px] px-1 py-0">
              <WifiOff className="w-3 h-3 mr-1" />
              UNAVAILABLE
            </Badge>
          ) : isPending ? (
            <Badge variant="outline" className="border-yellow-500/50 text-yellow-400 text-[10px] px-1 py-0">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              SUBSCRIBING
            </Badge>
          ) : isConnected && isMarketOpen ? (
            <Badge variant="outline" className="border-green-500/50 text-green-400 text-[10px] px-1 py-0">
              <Wifi className="w-3 h-3 mr-1" />
              LIVE
            </Badge>
          ) : !isMarketOpen ? (
            <Badge variant="outline" className="border-gray-500/50 text-gray-400 text-[10px] px-1 py-0">
              <WifiOff className="w-3 h-3 mr-1" />
              MARKET CLOSED
            </Badge>
          ) : (
            <Badge variant="outline" className="border-red-500/50 text-red-400 text-[10px] px-1 py-0">
              <WifiOff className="w-3 h-3 mr-1" />
              DISCONNECTED
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Symbol quick select */}
          <div className="flex gap-1">
            {SYMBOL_OPTIONS.slice(0, 5).map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setSelectedSymbol(opt.value);
                  onSymbolChange?.(opt.value);
                  setHeatmapHistory({
                    timestamps: [],
                    snapshots: [],
                  });
                  setViewEndIndex(null); // Reset to live view
                  initialRangeSetRef.current = false; // Reset for new symbol
                }}
                title={opt.expiry ? `Expiry: ${opt.expiry}` : opt.value}
                className={cn(
                  'px-2 py-0.5 text-[10px] rounded transition-colors',
                  selectedSymbol === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Symbol search with autocomplete */}
          <div className="relative">
            <div className="flex items-center gap-1">
              <Input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowResults(true);
                }}
                onFocus={() => setShowResults(true)}
                onBlur={() => setTimeout(() => setShowResults(false), 200)}
                placeholder="Search symbol..."
                className="w-32 h-6 text-[10px] bg-gray-900 border-gray-700"
              />
              <Search className="w-3 h-3 text-gray-500" />
            </div>

            {/* Dropdown results */}
            {showResults && searchQuery.length >= 2 && (
              <div className="absolute top-7 left-0 w-64 bg-gray-900 border border-gray-700 rounded-md shadow-lg max-h-64 overflow-y-auto z-50">
                {isSearching ? (
                  <div className="p-3 text-xs text-gray-400 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Searching...
                  </div>
                ) : searchResults && searchResults.length > 0 ? (
                  searchResults.map((result) => (
                    <button
                      key={result.symbol}
                      onClick={() => {
                        const formatted = result.isIndex
                          ? `NSE:${result.symbol}`
                          : `NSE:${result.symbol}-EQ`;
                        setSelectedSymbol(formatted);
                        onSymbolChange?.(formatted);
                        setSearchQuery('');
                        setShowResults(false);
                        setHeatmapHistory({ timestamps: [], snapshots: [] });
                        setViewEndIndex(null);
                        initialRangeSetRef.current = false;
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-gray-800 transition-colors border-b border-gray-800 last:border-0"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-medium text-blue-400">{result.symbol}</div>
                          <div className="text-[10px] text-gray-400 truncate">{result.name}</div>
                        </div>
                        {result.sector && (
                          <div className="text-[9px] text-gray-500 truncate max-w-[100px]">
                            {result.sector}
                          </div>
                        )}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="p-3 text-xs text-gray-500">
                    No symbols found
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Reconnect button */}
          {!isConnected && (
            <Button
              size="sm"
              variant="ghost"
              onClick={reconnect}
              className="h-6 px-2"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Reconnect
            </Button>
          )}
        </div>
      </div>

      {/* Metrics bar */}
      {metrics && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800 bg-gray-900/50">
          <div className="flex items-center gap-4 text-[10px]">
            <div>
              <span className="text-gray-500">Best Bid:</span>{' '}
              <span className="text-blue-400">{formatNumber(metrics.bestBid)}</span>
            </div>
            <div>
              <span className="text-gray-500">Best Ask:</span>{' '}
              <span className="text-red-400">{formatNumber(metrics.bestAsk)}</span>
            </div>
            <div>
              <span className="text-gray-500">Spread:</span>{' '}
              <span className="text-yellow-400">
                {formatNumber(metrics.spread)} ({formatNumber(metrics.spreadPercent)}%)
              </span>
            </div>
            <div>
              <span className="text-gray-500">Mid:</span>{' '}
              <span className="text-white">{formatNumber(metrics.midPrice)}</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-[10px]">
            <div>
              <span className="text-gray-500">TBQ:</span>{' '}
              <span className="text-blue-400">{formatCompact(metrics.totalBidQty)}</span>
            </div>
            <div>
              <span className="text-gray-500">TSQ:</span>{' '}
              <span className="text-red-400">{formatCompact(metrics.totalAskQty)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-500">Imbalance:</span>{' '}
              <span
                className={cn(
                  'flex items-center',
                  metrics.imbalance > 0 ? 'text-green-400' : 'text-red-400'
                )}
              >
                {metrics.imbalance > 0 ? (
                  <TrendingUp className="w-3 h-3 mr-0.5" />
                ) : (
                  <TrendingDown className="w-3 h-3 mr-0.5" />
                )}
                {(metrics.imbalance * 100).toFixed(1)}%
              </span>
            </div>

            {/* Intensity Range Slider */}
            <div className="flex items-center gap-2 ml-2 border-l border-gray-700 pl-3">
              <span className="text-gray-500 whitespace-nowrap">Intensity:</span>
              <span className="text-[9px] text-gray-400 w-6 text-right tabular-nums">
                {formatCompact(unifiedHeatmapData?.maxQty ? unifiedHeatmapData.maxQty * intensityRange[0] / 100 : 0)}
              </span>
              <Slider
                value={intensityRange}
                onValueChange={(value) => setIntensityRange(value as [number, number])}
                min={0}
                max={100}
                step={1}
                className="w-24 [&_[data-radix-slider-range]]:bg-gradient-to-r [&_[data-radix-slider-range]]:from-purple-600 [&_[data-radix-slider-range]]:to-yellow-500 [&_[data-radix-slider-thumb]]:h-3 [&_[data-radix-slider-thumb]]:w-3 [&_[data-radix-slider-thumb]]:border-purple-400 [&_[data-radix-slider-track]]:h-1.5"
              />
              <span className="text-[9px] text-gray-400 w-6 tabular-nums">
                {formatCompact(unifiedHeatmapData?.maxQty ? unifiedHeatmapData.maxQty * intensityRange[1] / 100 : 0)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIntensityRange([0, 100])}
                className="h-5 px-1.5 text-[9px] text-gray-400 hover:text-white"
                title="Reset intensity range"
              >
                Reset
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main content: 80% Heatmap + 20% Ladder */}
      <div className="flex-1 flex min-h-0">
        {/* Heatmap section (80%) */}
        <div className="w-4/5 min-h-0 border-r border-gray-700">
          {!data && !error && !isUnavailable && (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
              <span className="ml-2 text-gray-500">
                {isPending ? 'Subscribing to symbol...' : 'Connecting...'}
              </span>
            </div>
          )}

          {isUnavailable && (
            <div className="h-full flex flex-col items-center justify-center text-orange-400">
              <WifiOff className="w-8 h-8 mb-2" />
              <span className="text-lg font-semibold">Symbol Unavailable</span>
              <span className="text-sm text-gray-400 mt-1 max-w-xs text-center">
                All subscription slots are currently in use. Please try again later or select a different symbol.
              </span>
              <Button onClick={reconnect} variant="outline" size="sm" className="mt-4">
                Retry
              </Button>
            </div>
          )}

          {error && !isUnavailable && (
            <div className="h-full flex flex-col items-center justify-center text-red-400">
              <WifiOff className="w-8 h-8 mb-2" />
              <span>{error}</span>
              <Button onClick={reconnect} variant="outline" size="sm" className="mt-2">
                Retry
              </Button>
            </div>
          )}

          {data && unifiedHeatmapData && (
            <Plot
              key={selectedSymbol}
              data={midPriceLine ? [unifiedHeatmapData, midPriceLine] : [unifiedHeatmapData]}
              layout={{
                ...plotLayout,
                yaxis: {
                  ...plotLayout.yaxis,
                  title: { text: 'Price', font: { size: 10, color: 'rgba(255,255,255,0.6)' } },
                },
                autosize: true,
              }}
              config={{
                displayModeBar: true,
                modeBarButtonsToRemove: ['lasso2d', 'select2d', 'toImage', 'sendDataToCloud'],
                modeBarButtonsToAdd: [],
                displaylogo: false,
                responsive: true,
                scrollZoom: true,
              }}
              style={{ width: '100%', height: '100%' }}
              useResizeHandler
              onRelayout={handlePlotlyRelayout}
            />
          )}
        </div>

        {/* Order Book Ladder section (20%) */}
        <div className="w-1/5 flex flex-col min-h-0 bg-gray-950">
          {ladderData ? (
            <>
              {/* ASK section (top half) */}
              <div className="flex-1 flex flex-col min-h-0">
                {/* ASK Header */}
                <div className="bg-red-950/50 px-1 py-0.5 font-semibold text-red-400/80 shrink-0" style={{ fontSize: 'clamp(6px, 0.9vw, 8px)' }}>
                  <div className="flex items-center">
                    <span className="w-[48%] text-left pl-1">PRICE</span>
                    <span className="w-[30%] text-right">QTY</span>
                    <span className="w-[22%] text-right pr-1 pl-1">#</span>
                  </div>
                </div>
                {/* ASK rows - scrollable, reversed so best ask is at bottom (near mid-price) */}
                <div
                  ref={askScrollRef}
                  className="flex-1 flex flex-col overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                >
                  {[...ladderData.asks].reverse().map((ask) => {
                    const widthPercent = Math.min((ask.qty / ladderData.maxQty) * 100, 100);

                    return (
                      <div
                        key={ask.price}
                        className="relative flex items-center flex-1 min-h-[18px] px-1 hover:bg-red-900/30"
                        style={{ fontSize: 'clamp(9px, 1.3vw, 13px)' }}
                      >
                        <div
                          className="absolute right-0 top-0 bottom-0 bg-red-500/30"
                          style={{ width: `${widthPercent}%` }}
                        />
                        <span className="relative w-[48%] text-left pl-1 tabular-nums font-medium text-red-400">
                          {formatNumber(ask.price)}
                        </span>
                        <span className="relative w-[30%] text-right tabular-nums text-red-300">
                          {formatCompact(ask.qty)}
                        </span>
                        <span className="relative w-[22%] text-right pr-1 pl-1 text-gray-400 tabular-nums">
                          {ask.orders > 0 ? ask.orders : '-'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Mid-price separator */}
              <div
                className={cn(
                  "border-y px-1 min-h-[18px] flex items-center shrink-0",
                  viewEndTime ? "bg-orange-900/40 border-orange-500/50" : "bg-yellow-900/40 border-yellow-500/50"
                )}
                style={{ fontSize: 'clamp(9px, 1.3vw, 13px)' }}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1">
                    {ladderMetrics && ladderMetrics.imbalance > 0 ? (
                      <TrendingUp className="w-[1vw] h-[1vw] min-w-[10px] min-h-[10px] max-w-[14px] max-h-[14px] text-green-400" />
                    ) : (
                      <TrendingDown className="w-[1vw] h-[1vw] min-w-[10px] min-h-[10px] max-w-[14px] max-h-[14px] text-red-400" />
                    )}
                    <span className={cn(
                      "font-bold tabular-nums",
                      viewEndTime ? "text-orange-400" : "text-yellow-400"
                    )}>
                      {ladderMetrics ? formatNumber(ladderMetrics.midPrice) : '-'}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "tabular-nums",
                      viewEndTime ? "text-orange-300" : "text-yellow-300"
                    )}
                    style={{ fontSize: 'clamp(7px, 1.1vw, 11px)' }}
                  >
                    {ladderMetrics ? ladderMetrics.spreadPercent.toFixed(2) : '-'}%
                  </span>
                </div>
              </div>

              {/* BID section (bottom half) */}
              <div className="flex-1 flex flex-col min-h-0">
                {/* BID Header */}
                <div className="bg-blue-950/50 px-1 py-0.5 font-semibold text-blue-400/80 shrink-0" style={{ fontSize: 'clamp(6px, 0.9vw, 8px)' }}>
                  <div className="flex items-center">
                    <span className="w-[48%] text-left pl-1">PRICE</span>
                    <span className="w-[30%] text-right">QTY</span>
                    <span className="w-[22%] text-right pr-1 pl-1">#</span>
                  </div>
                </div>
                {/* BID rows - scrollable, best bid (highest price) at top */}
                <div
                  ref={bidScrollRef}
                  className="flex-1 flex flex-col overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                >
                  {ladderData.bids.map((bid) => {
                    const widthPercent = Math.min((bid.qty / ladderData.maxQty) * 100, 100);

                    return (
                      <div
                        key={bid.price}
                        className="relative flex items-center flex-1 min-h-[18px] px-1 hover:bg-blue-900/30"
                        style={{ fontSize: 'clamp(9px, 1.3vw, 13px)' }}
                      >
                        <div
                          className="absolute right-0 top-0 bottom-0 bg-blue-500/30"
                          style={{ width: `${widthPercent}%` }}
                        />
                        <span className="relative w-[48%] text-left pl-1 tabular-nums font-medium text-blue-400">
                          {formatNumber(bid.price)}
                        </span>
                        <span className="relative w-[30%] text-right tabular-nums text-blue-300">
                          {formatCompact(bid.qty)}
                        </span>
                        <span className="relative w-[22%] text-right pr-1 pl-1 text-gray-400 tabular-nums">
                          {bid.orders > 0 ? bid.orders : '-'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            </div>
          )}
        </div>
      </div>

      {/* Footer with last update and time range */}
      <div className="px-3 py-1 border-t border-gray-800 text-[9px] text-gray-500 flex justify-between shrink-0">
        <span>
          {lastUpdate
            ? `Last update: ${new Date(lastUpdate).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })} IST`
            : 'Waiting for data...'}
        </span>
        <span className="flex items-center gap-2">
          {/* Debug: show current view state */}
          {viewEndIndex !== null && (
            <span className="text-orange-400">
              View: idx={viewEndIndex}/{heatmapHistory.snapshots.length}
            </span>
          )}
          {heatmapHistory.timestamps.length > 0 && (
            <>
              Data: {new Date(heatmapHistory.timestamps[0]).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                hour12: false,
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              })}
              {' → '}
              {new Date(heatmapHistory.timestamps[heatmapHistory.timestamps.length - 1]).toLocaleTimeString('en-IN', {
                timeZone: 'Asia/Kolkata',
                hour12: false
              })}
              {' | '}
            </>
          )}
          {heatmapHistory.snapshots.length} pts
        </span>
      </div>
    </div>
  );
}

export default OrderBookHeatmap;
