import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/api-config';

// =============================================================================
// Types
// =============================================================================

export interface ReverseDCFInputs {
  targetPrice?: number;
  wacc?: number;           // Default 0.10 (10%)
  terminalGrowth?: number; // Default 0.03 (3%)
  forecastYears?: number;  // Default 5
}

export interface ReverseDCFInputsUsed {
  starting_revenue: number;
  ebit_margin: number;      // As percentage (e.g., 15.2)
  tax_rate: number;         // As percentage (e.g., 25.0)
  reinvestment_rate: number;
  wacc: number;             // As percentage (e.g., 10.0)
  terminal_growth: number;  // As percentage (e.g., 3.0)
  forecast_years: number;
  net_debt: number;
  shares_outstanding: number;
  market_cap: number | null;
}

export interface ReverseDCFResult {
  success: boolean;
  ticker: string;
  error?: string;

  // Market implied results
  implied_growth_rate: number;        // As percentage (e.g., 12.5)
  enterprise_value: number;
  equity_value: number;
  implied_price: number;

  // Target price implied results (if target provided)
  implied_growth_rate_target: number | null;
  enterprise_value_target: number | null;
  equity_value_target: number | null;
  implied_price_target: number | null;

  // Current valuation
  current_price: number;
  target_price: number | null;
  upside_percent: number | null;
  valuation_status: 'Conservative' | 'Fairly valued' | 'Reasonable' | 'Aggressive';
  valuation_status_target: 'Conservative' | 'Fairly valued' | 'Reasonable' | 'Aggressive' | null;

  // Data quality
  data_quality: 'Good' | 'Partial' | 'Estimated';
  warnings: string[];

  // Inputs used (for transparency)
  inputs_used: ReverseDCFInputsUsed;

  // Solver info
  solver_iterations: number;
}

// =============================================================================
// Query Hook - Initial load with defaults
// =============================================================================

/**
 * Hook for fetching Reverse DCF analysis with default parameters.
 *
 * Uses server-side caching (24 hours) - results are shared across users.
 *
 * @param ticker Stock symbol (e.g., "RELIANCE")
 */
export function useReverseDCF(ticker: string | undefined) {
  const baseUrl = getApiBaseUrl();

  return useQuery<ReverseDCFResult>({
    queryKey: ['reverse-dcf', ticker],
    queryFn: async () => {
      if (!ticker) {
        throw new Error('Ticker is required');
      }

      const response = await fetch(`${baseUrl}/api/reverse-dcf/${encodeURIComponent(ticker)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Use defaults - no target_price for shared caching
          wacc: 0.10,
          terminal_growth: 0.03,
          forecast_years: 5,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to calculate Reverse DCF' }));
        throw new Error(error.detail || 'Failed to calculate Reverse DCF');
      }

      const envelope = await response.json();
      const result = envelope.data ?? envelope;

      // Handle unsuccessful result
      if (!result.success) {
        throw new Error(result.error || 'Reverse DCF calculation failed');
      }

      return result;
    },
    enabled: !!ticker,
    staleTime: 60 * 60 * 1000, // 1 hour (matches server cache)
    gcTime: 2 * 60 * 60 * 1000, // 2 hours
    retry: 1,
  });
}

// =============================================================================
// Mutation Hook - Recalculate with custom parameters
// =============================================================================

/**
 * Hook for recalculating Reverse DCF with custom parameters.
 *
 * When target_price is provided, results are NOT cached (user-specific).
 * When only WACC/terminal_growth/forecast_years change, results ARE cached.
 *
 * @param ticker Stock symbol (e.g., "RELIANCE")
 */
export function useReverseDCFMutation(ticker: string) {
  const baseUrl = getApiBaseUrl();
  const queryClient = useQueryClient();

  return useMutation<ReverseDCFResult, Error, ReverseDCFInputs>({
    mutationFn: async (inputs: ReverseDCFInputs) => {
      const response = await fetch(`${baseUrl}/api/reverse-dcf/${encodeURIComponent(ticker)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target_price: inputs.targetPrice ?? null,
          wacc: inputs.wacc ?? 0.10,
          terminal_growth: inputs.terminalGrowth ?? 0.03,
          forecast_years: inputs.forecastYears ?? 5,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to calculate Reverse DCF' }));
        throw new Error(error.detail || 'Failed to calculate Reverse DCF');
      }

      const envelope = await response.json();
      const result = envelope.data ?? envelope;

      // Handle unsuccessful result
      if (!result.success) {
        throw new Error(result.error || 'Reverse DCF calculation failed');
      }

      return result;
    },
    onSuccess: (data, variables) => {
      // Update the query cache with the new result
      // Only update if no target_price (default params)
      if (!variables.targetPrice) {
        queryClient.setQueryData(['reverse-dcf', ticker], data);
      }
    },
  });
}

// =============================================================================
// Utility: Format values for display
// =============================================================================

/**
 * Format growth rate for display (e.g., 12.5 -> "12.5%")
 */
export function formatGrowthRate(rate: number | null): string {
  if (rate === null) return 'N/A';
  const sign = rate >= 0 ? '' : '';
  return `${sign}${rate.toFixed(1)}%`;
}

/**
 * Format large currency values in Indian notation
 */
export function formatIndianCurrency(value: number | null): string {
  if (value === null) return 'N/A';
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1e7) {
    return `${sign}₹${(absValue / 1e7).toFixed(2)} Cr`;
  } else if (absValue >= 1e5) {
    return `${sign}₹${(absValue / 1e5).toFixed(2)} L`;
  } else {
    return `${sign}₹${absValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }
}

/**
 * Get color class for valuation status
 */
export function getValuationStatusColor(status: string): string {
  switch (status) {
    case 'Conservative':
      return 'text-positive';           // Green - low expectations, potential upside
    case 'Reasonable':
      return 'text-primary';            // Orange - healthy growth premium
    case 'Aggressive':
      return 'text-negative';           // Red - high expectations, risky
    case 'Fairly valued':
    default:
      return 'text-muted-foreground';   // Neutral
  }
}

/**
 * Get color class for implied growth rate
 */
export function getGrowthRateColor(rate: number): string {
  if (rate > 20) return 'text-positive';
  if (rate > 10) return 'text-positive/80';
  if (rate > 0) return 'text-muted-foreground';
  return 'text-negative';
}
