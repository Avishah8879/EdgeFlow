import { useQuery } from '@tanstack/react-query';

// =============================================================================
// Types
// =============================================================================

export interface StrikeExposure {
  strike: number;
  ce_gxoi: number;
  pe_gxoi: number;
  net_gxoi: number;
  ce_gex: number;
  pe_gex: number;
  net_gex: number;
  ce_vega: number;
  pe_vega: number;
  net_vega: number;
  ce_vxoi: number;
  pe_vxoi: number;
  net_vxoi: number;
  ce_vex: number;
  pe_vex: number;
  net_vex: number;
  ce_oi: number;
  pe_oi: number;
  ce_iv: number;
  pe_iv: number;
}

export interface ExposureData {
  by_strike: StrikeExposure[];
  atm_strike: number | null;
  atm_gxoi: number;
  total_gex: number;
  gamma_regime: 'LONG GAMMA' | 'SHORT GAMMA' | 'UNKNOWN';
  spot: number;
  expiry: string | null;
  timestamp: string;
}

export interface TimeSeriesPoint {
  timestamp: string;
  atm_gxoi: number;
  atm_straddle: number | null;
  atm_strike: number | null;
  spot: number;
  ce_ltp: number;
  pe_ltp: number;
}

export interface TimeSeriesData {
  symbol: string;
  data: TimeSeriesPoint[];
  is_market_open: boolean;
  date: string;
  requested_date?: string | null;
  display_date?: string | null;
  is_fallback_session?: boolean;
  fallback_reason?: string | null;
  valid_bar_count?: number;
  message?: string | null;
}

export interface SurfaceData {
  strikes: number[];
  iv_values?: number[];
  gxoi_values?: number[];
  gex_values?: number[];
  moneyness?: number[];
  spot: number;
  expiry: string | null;
  timestamp: string;
  history?: SurfaceSnapshot[];
}

export interface SurfaceSnapshot {
  timestamp: string;
  strikes: number[];
  iv_values: number[];
  gxoi_values?: number[];
  spot: number;
}

// =============================================================================
// API Fetchers
// =============================================================================

async function fetchExposure(symbol: string, expiry?: string): Promise<ExposureData> {
  const query = expiry ? `?expiry=${encodeURIComponent(expiry)}` : '';
  const res = await fetch(`/api/options-visualizer/exposure/${symbol.toUpperCase()}${query}`, {
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch exposure data: ${res.statusText}`);
  }

  const json = await res.json();
  return json?.data || json;
}

async function fetchTimeSeries(symbol: string, date?: string): Promise<TimeSeriesData> {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  const res = await fetch(`/api/options-visualizer/timeseries/${symbol.toUpperCase()}${query}`, {
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch time series: ${res.statusText}`);
  }

  const json = await res.json();
  return json?.data || json;
}

async function fetchSurface(
  symbol: string,
  surfaceType: 'iv' | 'gxoi' = 'iv',
  expiry?: string,
  includeHistory = false
): Promise<SurfaceData> {
  const params = new URLSearchParams();
  if (expiry) params.append('expiry', expiry);
  params.append('surface_type', surfaceType);
  if (includeHistory) params.append('include_history', 'true');

  const queryString = params.toString();
  const res = await fetch(
    `/api/options-visualizer/surface/${symbol.toUpperCase()}${queryString ? `?${queryString}` : ''}`,
    { credentials: 'include' }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch surface data: ${res.statusText}`);
  }

  const json = await res.json();
  return json?.data || json;
}

// =============================================================================
// Hooks
// =============================================================================

interface UseOptionsVisualizerDataOptions {
  symbol: string;
  expiry?: string;
  surfaceType?: 'iv' | 'gxoi';
  includeHistory?: boolean;
  enabled?: boolean;
  refreshInterval?: number; // in milliseconds
}

export function useOptionsVisualizerData({
  symbol,
  expiry,
  surfaceType = 'iv',
  includeHistory = false,
  enabled = true,
  refreshInterval = 30000, // 30 seconds default
}: UseOptionsVisualizerDataOptions) {
  // Exposure data (GxOI, GEX by strike)
  const exposureQuery = useQuery<ExposureData>({
    queryKey: ['options-visualizer', 'exposure', symbol.toUpperCase(), expiry || ''],
    queryFn: () => fetchExposure(symbol, expiry),
    enabled: enabled && symbol.trim().length > 0,
    refetchInterval: refreshInterval,
    staleTime: 10000, // Consider stale after 10 seconds
    retry: 2,
  });

  // Time series data (ATM GxOI history)
  const timeSeriesQuery = useQuery<TimeSeriesData>({
    queryKey: ['options-visualizer', 'timeseries', symbol.toUpperCase()],
    queryFn: () => fetchTimeSeries(symbol),
    enabled: enabled && symbol.trim().length > 0,
    refetchInterval: refreshInterval,
    staleTime: 10000,
    retry: 2,
  });

  // Surface data (IV or GxOI surface for 3D visualization)
  const surfaceQuery = useQuery<SurfaceData>({
    queryKey: ['options-visualizer', 'surface', symbol.toUpperCase(), surfaceType, expiry || '', includeHistory],
    queryFn: () => fetchSurface(symbol, surfaceType, expiry, includeHistory),
    enabled: enabled && symbol.trim().length > 0,
    refetchInterval: refreshInterval * 2, // 60 seconds for surface (less frequent)
    staleTime: 30000,
    retry: 2,
  });

  return {
    exposure: exposureQuery.data,
    timeSeries: timeSeriesQuery.data,
    surface: surfaceQuery.data,

    isLoading: exposureQuery.isLoading || timeSeriesQuery.isLoading || surfaceQuery.isLoading,
    isExposureLoading: exposureQuery.isLoading,
    isTimeSeriesLoading: timeSeriesQuery.isLoading,
    isSurfaceLoading: surfaceQuery.isLoading,

    error: exposureQuery.error || timeSeriesQuery.error || surfaceQuery.error,

    refetch: () => {
      exposureQuery.refetch();
      timeSeriesQuery.refetch();
      surfaceQuery.refetch();
    },
    refetchExposure: exposureQuery.refetch,
    refetchTimeSeries: timeSeriesQuery.refetch,
    refetchSurface: surfaceQuery.refetch,
  };
}

// Individual hooks for more granular control
export function useExposureData(symbol: string, expiry?: string, refreshInterval = 30000) {
  return useQuery<ExposureData>({
    queryKey: ['options-visualizer', 'exposure', symbol.toUpperCase(), expiry || ''],
    queryFn: () => fetchExposure(symbol, expiry),
    enabled: symbol.trim().length > 0,
    refetchInterval: refreshInterval,
    staleTime: 10000,
    retry: 2,
  });
}

export function useTimeSeriesData(symbol: string, refreshInterval = 30000) {
  return useQuery<TimeSeriesData>({
    queryKey: ['options-visualizer', 'timeseries', symbol.toUpperCase()],
    queryFn: () => fetchTimeSeries(symbol),
    enabled: symbol.trim().length > 0,
    refetchInterval: refreshInterval,
    staleTime: 10000,
    retry: 2,
  });
}

export function useSurfaceData(
  symbol: string,
  surfaceType: 'iv' | 'gxoi' = 'iv',
  expiry?: string,
  includeHistory = false,
  refreshInterval = 60000
) {
  return useQuery<SurfaceData>({
    queryKey: ['options-visualizer', 'surface', symbol.toUpperCase(), surfaceType, expiry || '', includeHistory],
    queryFn: () => fetchSurface(symbol, surfaceType, expiry, includeHistory),
    enabled: symbol.trim().length > 0,
    refetchInterval: refreshInterval,
    staleTime: 30000,
    retry: 2,
  });
}
