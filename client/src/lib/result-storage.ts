/**
 * Result storage management using sessionStorage
 * Stores analysis results (screener, backtest) for navigation persistence
 *
 * Supports KEYED storage for multiple results across browser history.
 * Each result is stored with a unique key, and the key is associated
 * with a browser history entry via history.state.
 *
 * sessionStorage is used instead of localStorage because:
 * - Results are session-specific and should clear when tab closes
 * - Avoids polluting localStorage with large temporary data
 * - Matches ephemeral nature of analysis results
 */

import type {
  ExpertScreenerResult,
  ExpertScreenerSummary,
} from "@/hooks/use-expert-screener";

// Storage key prefixes
const STORAGE_PREFIX = {
  SCREENER: "tiphub_screener_",
  BACKTEST: "tiphub_backtest_",
} as const;

// Schema version for migrations
const CURRENT_VERSION = 1;

// Maximum age before data is considered stale (1 hour)
const MAX_AGE_MS = 60 * 60 * 1000;

// Maximum results to store to avoid quota issues (~500 stocks = ~1MB)
const MAX_SCREENER_RESULTS = 500;

// Maximum number of keyed results to keep (LRU cleanup)
const MAX_KEYED_RESULTS = 10;

// Check if sessionStorage is available
function isStorageAvailable(): boolean {
  try {
    const testKey = "__storage_test__";
    sessionStorage.setItem(testKey, testKey);
    sessionStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

const STORAGE_AVAILABLE = isStorageAvailable();

// Persisted state types
export interface PersistedScreenerState {
  version: number;
  timestamp: number;
  expression: string;
  status: "completed" | "interrupted" | "error";
  results: ExpertScreenerResult[];
  summary: ExpertScreenerSummary | null;
  error: string | null;
}

// Using unknown type for backtest results to accommodate
// both BacktestResult from shared/schema and AdvancedOptimizationResult
// The consumer is responsible for casting to the appropriate type
export interface PersistedBacktestState {
  version: number;
  timestamp: number;
  ticker: string;
  customRules: string;
  mode: "standard" | "advanced";
  status: "completed" | "interrupted" | "error";
  result: unknown;
  advancedResult: unknown;
  error: string | null;
  duration: number | null;
}

// Helper: Check if data has expired
function isExpired(timestamp: number): boolean {
  return Date.now() - timestamp > MAX_AGE_MS;
}

// Helper: Safe JSON parse
function safeJsonParse<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

// Helper: Generate unique key
function generateKey(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Helper: Get all keys with a prefix
function getKeysWithPrefix(prefix: string): string[] {
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(prefix)) {
      keys.push(key);
    }
  }
  return keys;
}

// Helper: Cleanup old keyed results (keep only most recent N)
function cleanupOldResults(prefix: string, maxToKeep: number): void {
  const keys = getKeysWithPrefix(prefix);
  if (keys.length <= maxToKeep) return;

  // Sort by timestamp (extracted from stored data)
  const keyTimestamps: { key: string; timestamp: number }[] = [];
  for (const key of keys) {
    const stored = sessionStorage.getItem(key);
    const parsed = safeJsonParse<{ timestamp?: number }>(stored);
    keyTimestamps.push({ key, timestamp: parsed?.timestamp || 0 });
  }

  keyTimestamps.sort((a, b) => b.timestamp - a.timestamp);

  // Remove oldest entries
  const toRemove = keyTimestamps.slice(maxToKeep);
  for (const { key } of toRemove) {
    sessionStorage.removeItem(key);
  }
}

// Helper: Try to set item, handling quota exceeded
function safeSetItem(key: string, value: string): boolean {
  try {
    sessionStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      // Clean up old keyed results and retry
      try {
        cleanupOldResults(STORAGE_PREFIX.SCREENER, 3);
        cleanupOldResults(STORAGE_PREFIX.BACKTEST, 3);
        sessionStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

// ============= KEYED BACKTEST STORAGE =============

/**
 * Get persisted backtest result by key
 * Returns null if not found, expired, or invalid version
 */
export function getBacktestResultByKey(key: string | null): PersistedBacktestState | null {
  if (!STORAGE_AVAILABLE || !key) {
    return null;
  }
  try {
    const storageKey = `${STORAGE_PREFIX.BACKTEST}${key}`;
    const stored = sessionStorage.getItem(storageKey);
    const parsed = safeJsonParse<PersistedBacktestState>(stored);

    if (!parsed) {
      return null;
    }
    if (parsed.version !== CURRENT_VERSION) {
      sessionStorage.removeItem(storageKey);
      return null;
    }
    if (isExpired(parsed.timestamp)) {
      sessionStorage.removeItem(storageKey);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Save backtest result with a unique key
 * Returns the generated key for storing in history.state
 */
export function setBacktestResultWithKey(
  state: Omit<PersistedBacktestState, "version" | "timestamp">
): string | null {
  if (!STORAGE_AVAILABLE) {
    return null;
  }
  try {
    const key = generateKey();
    const storageKey = `${STORAGE_PREFIX.BACKTEST}${key}`;

    const fullState: PersistedBacktestState = {
      ...state,
      version: CURRENT_VERSION,
      timestamp: Date.now(),
    };

    const json = JSON.stringify(fullState);

    const success = safeSetItem(storageKey, json);
    if (success) {
      // Cleanup old results to prevent storage bloat
      cleanupOldResults(STORAGE_PREFIX.BACKTEST, MAX_KEYED_RESULTS);
      return key;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Clear a specific backtest result by key
 */
export function clearBacktestResultByKey(key: string | null): void {
  if (!key) return;
  try {
    const storageKey = `${STORAGE_PREFIX.BACKTEST}${key}`;
    sessionStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}

// ============= KEYED SCREENER STORAGE =============

/**
 * Get persisted screener result by key
 * Returns null if not found, expired, or invalid version
 */
export function getScreenerResultByKey(key: string | null): PersistedScreenerState | null {
  if (!STORAGE_AVAILABLE || !key) {
    return null;
  }
  try {
    const storageKey = `${STORAGE_PREFIX.SCREENER}${key}`;
    const stored = sessionStorage.getItem(storageKey);
    const parsed = safeJsonParse<PersistedScreenerState>(stored);

    if (!parsed) {
      return null;
    }
    if (parsed.version !== CURRENT_VERSION) {
      sessionStorage.removeItem(storageKey);
      return null;
    }
    if (isExpired(parsed.timestamp)) {
      sessionStorage.removeItem(storageKey);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Save screener result with a unique key
 * Returns the generated key for storing in history.state
 */
export function setScreenerResultWithKey(
  state: Omit<PersistedScreenerState, "version" | "timestamp">
): string | null {
  if (!STORAGE_AVAILABLE) {
    return null;
  }
  try {
    const key = generateKey();
    const storageKey = `${STORAGE_PREFIX.SCREENER}${key}`;

    // Truncate results if needed
    const truncatedResults = state.results.slice(0, MAX_SCREENER_RESULTS);

    const fullState: PersistedScreenerState = {
      ...state,
      results: truncatedResults,
      version: CURRENT_VERSION,
      timestamp: Date.now(),
    };

    const json = JSON.stringify(fullState);

    const success = safeSetItem(storageKey, json);
    if (success) {
      // Cleanup old results to prevent storage bloat
      cleanupOldResults(STORAGE_PREFIX.SCREENER, MAX_KEYED_RESULTS);
      return key;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Clear a specific screener result by key
 */
export function clearScreenerResultByKey(key: string | null): void {
  if (!key) return;
  try {
    const storageKey = `${STORAGE_PREFIX.SCREENER}${key}`;
    sessionStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}

// ============= LEGACY NON-KEYED STORAGE (for backward compatibility) =============

const LEGACY_KEYS = {
  SCREENER: "tiphub_screener_result",
  BACKTEST: "tiphub_backtest_result",
} as const;

/**
 * @deprecated Use getScreenerResultByKey instead
 */
export function getScreenerResult(): PersistedScreenerState | null {
  if (!STORAGE_AVAILABLE) return null;
  try {
    const stored = sessionStorage.getItem(LEGACY_KEYS.SCREENER);
    const parsed = safeJsonParse<PersistedScreenerState>(stored);
    if (!parsed || parsed.version !== CURRENT_VERSION || isExpired(parsed.timestamp)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @deprecated Use setScreenerResultWithKey instead
 */
export function setScreenerResult(
  state: Omit<PersistedScreenerState, "version" | "timestamp">
): void {
  if (!STORAGE_AVAILABLE) return;
  const fullState: PersistedScreenerState = {
    ...state,
    results: state.results.slice(0, MAX_SCREENER_RESULTS),
    version: CURRENT_VERSION,
    timestamp: Date.now(),
  };
  safeSetItem(LEGACY_KEYS.SCREENER, JSON.stringify(fullState));
}

/**
 * @deprecated Use clearScreenerResultByKey instead
 */
export function clearScreenerResult(): void {
  try {
    sessionStorage.removeItem(LEGACY_KEYS.SCREENER);
  } catch {
    // ignore
  }
}

/**
 * @deprecated Use getBacktestResultByKey instead
 */
export function getBacktestResult(): PersistedBacktestState | null {
  if (!STORAGE_AVAILABLE) return null;
  try {
    const stored = sessionStorage.getItem(LEGACY_KEYS.BACKTEST);
    const parsed = safeJsonParse<PersistedBacktestState>(stored);
    if (!parsed || parsed.version !== CURRENT_VERSION || isExpired(parsed.timestamp)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @deprecated Use setBacktestResultWithKey instead
 */
export function setBacktestResult(
  state: Omit<PersistedBacktestState, "version" | "timestamp">
): void {
  if (!STORAGE_AVAILABLE) return;
  const fullState: PersistedBacktestState = {
    ...state,
    version: CURRENT_VERSION,
    timestamp: Date.now(),
  };
  safeSetItem(LEGACY_KEYS.BACKTEST, JSON.stringify(fullState));
}

/**
 * @deprecated Use clearBacktestResultByKey instead
 */
export function clearBacktestResult(): void {
  try {
    sessionStorage.removeItem(LEGACY_KEYS.BACKTEST);
  } catch {
    // ignore
  }
}

// ============= UTILITIES =============

/**
 * Get approximate storage usage in bytes
 */
export function getStorageSize(): {
  screener: number;
  backtest: number;
  total: number;
} {
  let screenerSize = 0;
  let backtestSize = 0;

  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX.SCREENER) || key === LEGACY_KEYS.SCREENER) {
      screenerSize += sessionStorage.getItem(key)?.length ?? 0;
    } else if (key?.startsWith(STORAGE_PREFIX.BACKTEST) || key === LEGACY_KEYS.BACKTEST) {
      backtestSize += sessionStorage.getItem(key)?.length ?? 0;
    }
  }

  return {
    screener: screenerSize * 2, // UTF-16 encoding
    backtest: backtestSize * 2,
    total: (screenerSize + backtestSize) * 2,
  };
}

/**
 * Clear all result storage (keyed and legacy)
 */
export function clearAllResults(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX.SCREENER) ||
        key?.startsWith(STORAGE_PREFIX.BACKTEST) ||
        key === LEGACY_KEYS.SCREENER ||
        key === LEGACY_KEYS.BACKTEST) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    sessionStorage.removeItem(key);
  }
}
