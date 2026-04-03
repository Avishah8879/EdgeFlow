/**
 * Usage Limits Hook
 *
 * Provides query for user's current usage and limits:
 * - Screener runs remaining
 * - Backtest runs remaining
 */

import { useQuery } from '@tanstack/react-query';
import { getAuthBaseUrl } from '@/lib/api-config';

const AUTH_BASE_URL = getAuthBaseUrl();

// Types
export interface UsageLimits {
  tier: 'basic' | 'premium';
  limits: {
    screenerRunsPerHour: number;
    backtestRunsPerHour: number;
  };
  usage: {
    screenerRuns: number;
    backtestRuns: number;
  };
  remaining: {
    screenerRuns: number;
    backtestRuns: number;
  };
  resetsAt: string; // ISO timestamp
}

/**
 * Fetch user's usage limits
 */
async function fetchUsageLimits(): Promise<UsageLimits> {
  const response = await fetch(`${AUTH_BASE_URL}/auth/v2/usage-limits`);

  if (!response.ok) {
    throw new Error('Failed to fetch usage limits');
  }

  return response.json();
}

/**
 * Hook for fetching user's usage limits
 */
export function useUsageLimits() {
  return useQuery({
    queryKey: ['usage-limits'],
    queryFn: fetchUsageLimits,
    staleTime: 15 * 1000, // 15 seconds (reduced for faster admin change propagation)
    refetchInterval: 30 * 1000, // Refetch every 30 seconds
    retry: 1,
  });
}

/**
 * Calculate percentage used for a specific feature
 */
export function getUsagePercentage(usage: number, limit: number): number {
  if (limit === 0) return 100;
  return Math.min(100, Math.round((usage / limit) * 100));
}

/**
 * Get time remaining until limits reset
 */
export function getTimeUntilReset(resetsAt: string): string {
  const now = new Date();
  const resetTime = new Date(resetsAt);
  const diff = resetTime.getTime() - now.getTime();

  if (diff <= 0) return 'now';

  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 1) return 'less than a minute';
  if (minutes === 1) return '1 minute';
  return `${minutes} minutes`;
}
