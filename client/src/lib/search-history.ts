/**
 * Search history management using localStorage
 * Stores recent stock searches for quick access
 */

const STORAGE_KEY = 'tiphub_search_history';
const MAX_HISTORY = 10;

export interface RecentSearch {
  symbol: string;
  long_name: string | null;
  suffix?: string | null;
  timestamp: number;
}

/**
 * Get all recent searches from localStorage
 */
export function getSearchHistory(): RecentSearch[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const history = JSON.parse(stored) as RecentSearch[];
    // Return sorted by most recent first
    return history.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Failed to read search history:', error);
    return [];
  }
}

/**
 * Add a search to history
 * Deduplicates by symbol and maintains max limit
 */
export function addToSearchHistory(item: Omit<RecentSearch, 'timestamp'>): void {
  try {
    const history = getSearchHistory();

    // Remove existing entry for this symbol (if any)
    const filtered = history.filter(h => h.symbol !== item.symbol);

    // Add new entry at the beginning
    const newEntry: RecentSearch = {
      symbol: item.symbol,
      long_name: item.long_name,
      suffix: item.suffix,
      timestamp: Date.now(),
    };

    const updated = [newEntry, ...filtered].slice(0, MAX_HISTORY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save search history:', error);
  }
}

/**
 * Remove a specific item from history by symbol
 */
export function removeFromSearchHistory(symbol: string): void {
  try {
    const history = getSearchHistory();
    const filtered = history.filter(h => h.symbol !== symbol);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to remove from search history:', error);
  }
}

/**
 * Clear all search history
 */
export function clearSearchHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear search history:', error);
  }
}
