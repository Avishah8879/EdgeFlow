/**
 * Saved Results Hook
 *
 * Provides queries and mutations for saved screener and backtest results.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthBaseUrl } from '@/lib/api-config';

const AUTH_BASE_URL = getAuthBaseUrl();

// Types
export interface SavedScreenerResult {
  id: string;
  name: string;
  expression: string;
  result_count: number;
  matching_symbols?: any[];
  execution_time_ms?: number;
  is_shared: boolean;
  share_token?: string;
  created_at: string;
  updated_at: string;
}

export interface SavedBacktestResult {
  id: string;
  name: string;
  ticker: string;
  mode: string;
  custom_rules?: string;
  strategy_condition: string;
  metrics: any;
  equity_curve?: any[];
  candlestick_data?: any[];
  tpsl_values?: { target_pct: number; stop_pct: number };
  train_end_date?: string;
  train_end_index?: number;
  max_drawdown_point?: { date: string; value: number | null };
  execution_time_ms?: number;
  is_shared: boolean;
  share_token?: string;
  created_at: string;
  updated_at: string;
}

export interface SavedFundamentalScreenerResult {
  id: string;
  name: string;
  expression: string;
  result_count: number;
  matching_symbols?: any[];
  execution_time_ms?: number;
  is_shared: boolean;
  share_token?: string;
  created_at: string;
  updated_at: string;
}

export interface SavedPortfolioOptimizerResult {
  id: string;
  name: string;
  holdings: any[];
  params?: any;
  result?: any;
  execution_time_ms?: number;
  is_shared: boolean;
  share_token?: string;
  created_at: string;
  updated_at: string;
}

export interface RecentSavedRun {
  id: string;
  type: 'screener' | 'backtest' | 'fundamental-screener' | 'portfolio-optimizer';
  name: string;
  summary: any;
  detail_path: string;
  created_at: string;
}

interface SavedResultsResponse<T> {
  results: T[];
  total: number;
  limit: number;
  offset: number;
}

interface ShareResponse {
  shareToken: string;
  shareUrl: string;
}

async function fetchRecentSavedRuns(limit: number = 10): Promise<SavedResultsResponse<RecentSavedRun>> {
  const response = await fetch(`${AUTH_BASE_URL}/api/saved/recent?limit=${limit}`);

  if (!response.ok) {
    throw new Error('Failed to fetch recent saved runs');
  }

  return response.json();
}

// ============================================================================
// SCREENER RESULTS
// ============================================================================

/**
 * Fetch user's saved screener results
 */
async function fetchScreenerResults(
  limit: number = 20,
  offset: number = 0
): Promise<SavedResultsResponse<SavedScreenerResult>> {
  const response = await fetch(
    `${AUTH_BASE_URL}/api/saved/screener?limit=${limit}&offset=${offset}`
  );

  if (!response.ok) {
    throw new Error('Failed to fetch saved screener results');
  }

  return response.json();
}

/**
 * Fetch a single screener result by ID
 */
async function fetchScreenerResult(id: string): Promise<SavedScreenerResult> {
  const response = await fetch(`${AUTH_BASE_URL}/api/saved/screener/${id}`);

  if (!response.ok) {
    throw new Error('Failed to fetch screener result');
  }

  return response.json();
}

/**
 * Save a new screener result
 */
async function saveScreenerResult(data: {
  name: string;
  expression: string;
  resultCount: number;
  matchingSymbols: any[];
  executionTimeMs?: number;
}): Promise<SavedScreenerResult> {
  const response = await fetch(`${AUTH_BASE_URL}/api/saved/screener`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to save' }));
    throw new Error(error.message || 'Failed to save screener result');
  }

  return response.json();
}

/**
 * Delete a screener result
 */
async function deleteScreenerResult(id: string): Promise<void> {
  const response = await fetch(`${AUTH_BASE_URL}/api/saved/screener/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to delete' }));
    throw new Error(error.message || 'Failed to delete screener result');
  }
}

/**
 * Share a screener result
 */
async function shareScreenerResult(id: string): Promise<ShareResponse> {
  const response = await fetch(`${AUTH_BASE_URL}/api/saved/screener/${id}/share`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to share' }));
    throw new Error(error.message || 'Failed to share screener result');
  }

  return response.json();
}

// ============================================================================
// FUNDAMENTAL SCANNER RESULTS
// ============================================================================

async function fetchFundamentalScreenerResults(
  limit: number = 20,
  offset: number = 0
): Promise<SavedResultsResponse<SavedFundamentalScreenerResult>> {
  const response = await fetch(
    `${AUTH_BASE_URL}/api/saved/fundamental-screener?limit=${limit}&offset=${offset}`
  );

  if (!response.ok) {
    throw new Error('Failed to fetch saved fundamental scanner results');
  }

  return response.json();
}

async function fetchFundamentalScreenerResult(id: string): Promise<SavedFundamentalScreenerResult> {
  const response = await fetch(`${AUTH_BASE_URL}/api/saved/fundamental-screener/${id}`);

  if (!response.ok) {
    throw new Error('Failed to fetch fundamental scanner result');
  }

  return response.json();
}

async function saveFundamentalScreenerResult(data: {
  name: string;
  expression: string;
  resultCount: number;
  matchingSymbols: any[];
  executionTimeMs?: number;
}): Promise<SavedFundamentalScreenerResult> {
  const response = await fetch(`${AUTH_BASE_URL}/api/saved/fundamental-screener`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to save' }));
    throw new Error(error.message || 'Failed to save fundamental scanner result');
  }

  return response.json();
}

async function deleteFundamentalScreenerResult(id: string): Promise<void> {
  const response = await fetch(`${AUTH_BASE_URL}/api/saved/fundamental-screener/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to delete' }));
    throw new Error(error.message || 'Failed to delete fundamental scanner result');
  }
}

async function shareFundamentalScreenerResult(id: string): Promise<ShareResponse> {
  const response = await fetch(`${AUTH_BASE_URL}/api/saved/fundamental-screener/${id}/share`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to share' }));
    throw new Error(error.message || 'Failed to share fundamental scanner result');
  }

  return response.json();
}

// ============================================================================
// PORTFOLIO OPTIMIZER RESULTS
// ============================================================================

async function fetchPortfolioOptimizerResults(
  limit: number = 20,
  offset: number = 0
): Promise<SavedResultsResponse<SavedPortfolioOptimizerResult>> {
  const response = await fetch(
    `${AUTH_BASE_URL}/api/saved/portfolio-optimizer?limit=${limit}&offset=${offset}`
  );

  if (!response.ok) {
    throw new Error('Failed to fetch saved portfolio optimizer results');
  }

  return response.json();
}

async function fetchPortfolioOptimizerResult(id: string): Promise<SavedPortfolioOptimizerResult> {
  const response = await fetch(`${AUTH_BASE_URL}/api/saved/portfolio-optimizer/${id}`);

  if (!response.ok) {
    throw new Error('Failed to fetch portfolio optimizer result');
  }

  return response.json();
}

async function savePortfolioOptimizerResult(data: {
  name: string;
  holdings: any[];
  params?: any;
  result: any;
  executionTimeMs?: number;
}): Promise<SavedPortfolioOptimizerResult> {
  const response = await fetch(`${AUTH_BASE_URL}/api/saved/portfolio-optimizer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to save' }));
    throw new Error(error.message || 'Failed to save portfolio optimizer result');
  }

  return response.json();
}

async function deletePortfolioOptimizerResult(id: string): Promise<void> {
  const response = await fetch(`${AUTH_BASE_URL}/api/saved/portfolio-optimizer/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to delete' }));
    throw new Error(error.message || 'Failed to delete portfolio optimizer result');
  }
}

async function sharePortfolioOptimizerResult(id: string): Promise<ShareResponse> {
  const response = await fetch(`${AUTH_BASE_URL}/api/saved/portfolio-optimizer/${id}/share`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to share' }));
    throw new Error(error.message || 'Failed to share portfolio optimizer result');
  }

  return response.json();
}

// ============================================================================
// BACKTEST RESULTS
// ============================================================================

/**
 * Fetch user's saved backtest results
 */
async function fetchBacktestResults(
  limit: number = 20,
  offset: number = 0,
  ticker?: string
): Promise<SavedResultsResponse<SavedBacktestResult>> {
  let url = `${AUTH_BASE_URL}/api/saved/backtest?limit=${limit}&offset=${offset}`;
  if (ticker) {
    url += `&ticker=${encodeURIComponent(ticker)}`;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Failed to fetch saved backtest results');
  }

  return response.json();
}

/**
 * Fetch a single backtest result by ID
 */
async function fetchBacktestResult(id: string): Promise<SavedBacktestResult> {
  const response = await fetch(`${AUTH_BASE_URL}/api/saved/backtest/${id}`);

  if (!response.ok) {
    throw new Error('Failed to fetch backtest result');
  }

  return response.json();
}

/**
 * Save a new backtest result
 */
async function saveBacktestResult(data: {
  name: string;
  ticker: string;
  mode: string;
  customRules?: string;
  strategyCondition: string;
  metrics: any;
  equityCurve?: any[];
  candlestickData?: any[];
  tpslValues?: { target_pct: number; stop_pct: number };
  trainEndDate?: string;
  trainEndIndex?: number;
  maxDrawdownPoint?: { date: string; value: number | null };
  executionTimeMs?: number;
}): Promise<SavedBacktestResult> {
  const response = await fetch(`${AUTH_BASE_URL}/api/saved/backtest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to save' }));
    throw new Error(error.message || 'Failed to save backtest result');
  }

  return response.json();
}

/**
 * Delete a backtest result
 */
async function deleteBacktestResult(id: string): Promise<void> {
  const response = await fetch(`${AUTH_BASE_URL}/api/saved/backtest/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to delete' }));
    throw new Error(error.message || 'Failed to delete backtest result');
  }
}

/**
 * Share a backtest result
 */
async function shareBacktestResult(id: string): Promise<ShareResponse> {
  const response = await fetch(`${AUTH_BASE_URL}/api/saved/backtest/${id}/share`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to share' }));
    throw new Error(error.message || 'Failed to share backtest result');
  }

  return response.json();
}

// ============================================================================
// HOOKS
// ============================================================================

export function useRecentSavedRuns(limit: number = 10) {
  return useQuery({
    queryKey: ['saved-recent', limit],
    queryFn: () => fetchRecentSavedRuns(limit),
    staleTime: 60 * 1000,
  });
}

/**
 * Hook for listing saved screener results
 */
export function useSavedScreenerResults(limit: number = 20, offset: number = 0) {
  return useQuery({
    queryKey: ['saved-screener', limit, offset],
    queryFn: () => fetchScreenerResults(limit, offset),
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook for fetching a single screener result
 * @param id - The result ID
 * @param enabled - Optional flag to control when the query runs (default: true)
 */
export function useSavedScreenerResult(id: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['saved-screener', id],
    queryFn: () => fetchScreenerResult(id),
    enabled: !!id && enabled,
    staleTime: 60 * 1000,
  });
}

/**
 * Hook for saving a screener result
 */
export function useSaveScreenerResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveScreenerResult,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-screener'] });
      queryClient.invalidateQueries({ queryKey: ['saved-recent'] });
    },
  });
}

/**
 * Hook for deleting a screener result
 */
export function useDeleteScreenerResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteScreenerResult,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-screener'] });
      queryClient.invalidateQueries({ queryKey: ['saved-recent'] });
    },
  });
}

/**
 * Hook for sharing a screener result
 */
export function useShareScreenerResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: shareScreenerResult,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-screener'] });
    },
  });
}

export function useSavedFundamentalScreenerResults(limit: number = 20, offset: number = 0) {
  return useQuery({
    queryKey: ['saved-fundamental-screener', limit, offset],
    queryFn: () => fetchFundamentalScreenerResults(limit, offset),
    staleTime: 60 * 1000,
  });
}

export function useSavedFundamentalScreenerResult(id: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['saved-fundamental-screener', id],
    queryFn: () => fetchFundamentalScreenerResult(id),
    enabled: !!id && enabled,
    staleTime: 60 * 1000,
  });
}

export function useSaveFundamentalScreenerResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveFundamentalScreenerResult,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-fundamental-screener'] });
      queryClient.invalidateQueries({ queryKey: ['saved-recent'] });
    },
  });
}

export function useDeleteFundamentalScreenerResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteFundamentalScreenerResult,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-fundamental-screener'] });
      queryClient.invalidateQueries({ queryKey: ['saved-recent'] });
    },
  });
}

export function useShareFundamentalScreenerResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: shareFundamentalScreenerResult,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-fundamental-screener'] });
    },
  });
}

export function useSavedPortfolioOptimizerResults(limit: number = 20, offset: number = 0) {
  return useQuery({
    queryKey: ['saved-portfolio-optimizer', limit, offset],
    queryFn: () => fetchPortfolioOptimizerResults(limit, offset),
    staleTime: 60 * 1000,
  });
}

export function useSavedPortfolioOptimizerResult(id: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['saved-portfolio-optimizer', id],
    queryFn: () => fetchPortfolioOptimizerResult(id),
    enabled: !!id && enabled,
    staleTime: 60 * 1000,
  });
}

export function useSavePortfolioOptimizerResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: savePortfolioOptimizerResult,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-portfolio-optimizer'] });
      queryClient.invalidateQueries({ queryKey: ['saved-recent'] });
    },
  });
}

export function useDeletePortfolioOptimizerResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deletePortfolioOptimizerResult,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-portfolio-optimizer'] });
      queryClient.invalidateQueries({ queryKey: ['saved-recent'] });
    },
  });
}

export function useSharePortfolioOptimizerResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: sharePortfolioOptimizerResult,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-portfolio-optimizer'] });
    },
  });
}

/**
 * Hook for listing saved backtest results
 */
export function useSavedBacktestResults(
  limit: number = 20,
  offset: number = 0,
  ticker?: string
) {
  return useQuery({
    queryKey: ['saved-backtest', limit, offset, ticker],
    queryFn: () => fetchBacktestResults(limit, offset, ticker),
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook for fetching a single backtest result
 */
export function useSavedBacktestResult(id: string) {
  return useQuery({
    queryKey: ['saved-backtest', id],
    queryFn: () => fetchBacktestResult(id),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

/**
 * Hook for saving a backtest result
 */
export function useSaveBacktestResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveBacktestResult,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-backtest'] });
      queryClient.invalidateQueries({ queryKey: ['saved-recent'] });
    },
  });
}

/**
 * Hook for deleting a backtest result
 */
export function useDeleteBacktestResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteBacktestResult,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-backtest'] });
      queryClient.invalidateQueries({ queryKey: ['saved-recent'] });
    },
  });
}

/**
 * Hook for sharing a backtest result
 */
export function useShareBacktestResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: shareBacktestResult,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-backtest'] });
    },
  });
}
