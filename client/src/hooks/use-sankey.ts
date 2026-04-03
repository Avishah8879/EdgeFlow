import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/api-config';

// =============================================================================
// Types
// =============================================================================

export interface SankeyNode {
  id: string;
  color: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

export interface SankeyResponse {
  ticker: string;
  year: number;
  type: 'income' | 'cashflow' | 'balance';
  available_years: number[];
  data: SankeyData;
}

export interface SankeyYearsResponse {
  income_years: number[];
  cashflow_years: number[];
  balance_years: number[];
}

// =============================================================================
// Hook: useSankeyYears - Get available years for Sankey diagrams
// =============================================================================

/**
 * Fetch available years for both income and cashflow Sankey diagrams.
 *
 * Uses server-side caching (24 hours) - financial data is quarterly.
 *
 * @param ticker Stock symbol (e.g., "RELIANCE.NS", "AAPL")
 */
export function useSankeyYears(ticker: string | undefined) {
  const baseUrl = getApiBaseUrl();

  return useQuery<SankeyYearsResponse>({
    queryKey: ['sankey-years', ticker],
    queryFn: async () => {
      if (!ticker) {
        throw new Error('Ticker is required');
      }

      const response = await fetch(
        `${baseUrl}/api/sankey/years/${encodeURIComponent(ticker)}`
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to fetch available years' }));
        throw new Error(error.detail || 'Failed to fetch available years');
      }

      const envelope = await response.json();
      return envelope.data ?? envelope;
    },
    enabled: !!ticker,
    staleTime: 30 * 60 * 1000, // 30 minutes (server has 24h cache)
    gcTime: 60 * 60 * 1000, // 1 hour
    retry: 1,
  });
}

// =============================================================================
// Hook: useSankey - Get Sankey diagram data
// =============================================================================

/**
 * Fetch Sankey diagram data for income or cashflow statement.
 *
 * Uses server-side caching (24 hours) - financial data is quarterly.
 *
 * @param ticker Stock symbol (e.g., "RELIANCE.NS", "AAPL")
 * @param statementType "income" or "cashflow"
 * @param year Fiscal year (optional, defaults to most recent)
 */
export function useSankey(
  ticker: string | undefined,
  statementType: 'income' | 'cashflow' | 'balance',
  year?: number
) {
  const baseUrl = getApiBaseUrl();

  return useQuery<SankeyResponse>({
    queryKey: ['sankey', ticker, statementType, year],
    queryFn: async () => {
      if (!ticker) {
        throw new Error('Ticker is required');
      }

      const url = year
        ? `${baseUrl}/api/sankey/${statementType}/${encodeURIComponent(ticker)}?year=${year}`
        : `${baseUrl}/api/sankey/${statementType}/${encodeURIComponent(ticker)}`;

      const response = await fetch(url);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to fetch Sankey data' }));
        throw new Error(error.detail || 'Failed to fetch Sankey data');
      }

      return response.json();
    },
    enabled: !!ticker,
    staleTime: 30 * 60 * 1000, // 30 minutes (server has 24h cache)
    gcTime: 60 * 60 * 1000, // 1 hour
    retry: 1,
  });
}

// =============================================================================
// Utility: Format Sankey values for display
// =============================================================================

/**
 * Format large financial values in Indian notation (Crores).
 */
export function formatSankeyValue(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1e7) {
    // Convert to Crores
    return `${sign}₹${(absValue / 1e7).toFixed(2)} Cr`;
  } else if (absValue >= 1e5) {
    // Convert to Lakhs
    return `${sign}₹${(absValue / 1e5).toFixed(2)} L`;
  } else if (absValue >= 1e3) {
    return `${sign}₹${(absValue / 1e3).toFixed(2)} K`;
  } else {
    return `${sign}₹${absValue.toFixed(2)}`;
  }
}

/**
 * Get statement type display name.
 */
export function getStatementTypeName(type: 'income' | 'cashflow'): string {
  return type === 'income' ? 'Income Statement' : 'Cash Flow';
}
