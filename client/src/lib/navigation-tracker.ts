/**
 * Navigation tracker for SPA back/forward detection with history state management
 *
 * Tracks navigation type by intercepting:
 * - pushState (navbar links via wouter) → always means "fresh visit"
 * - popstate (browser back/forward buttons) → means "returning to previous page"
 *
 * Also manages history.state for keyed result storage, allowing multiple
 * results to be persisted and restored when navigating back through history.
 */

// Navigation type tracking - in-memory for reliability
let lastNavigationType: "unknown" | "push" | "back_forward" = "unknown";
let lastHistoryState: Record<string, unknown> | null = null;
let isInitialized = false;

/**
 * Initialize the navigation tracker.
 * Should be called once at app startup.
 */
export function initNavigationTracker(): void {
  if (isInitialized) return;
  isInitialized = true;

  // Listen for browser back/forward navigation
  window.addEventListener("popstate", (event) => {
    lastNavigationType = "back_forward";
    lastHistoryState = event.state as Record<string, unknown> | null;
  });

  // Intercept pushState to detect navbar navigation
  const originalPushState = history.pushState.bind(history);
  history.pushState = function (
    data: unknown,
    unused: string,
    url?: string | URL | null
  ) {
    lastNavigationType = "push";
    lastHistoryState = null; // New navigation, no previous state
    return originalPushState(data, unused, url);
  };

  // Handle initial page load
  const navEntries = performance.getEntriesByType(
    "navigation"
  ) as PerformanceNavigationTiming[];
  const navType = navEntries[0]?.type;

  if (navType === "reload") {
    lastNavigationType = "unknown";
    lastHistoryState = history.state as Record<string, unknown> | null;
  } else if (navType === "back_forward") {
    lastNavigationType = "back_forward";
    lastHistoryState = history.state as Record<string, unknown> | null;
  } else {
    lastNavigationType = "unknown";
    lastHistoryState = null;
  }
}

/**
 * Check if we should clear state (fresh start).
 * Returns true for push navigation (navbar) or direct navigation.
 * Returns false for reload (to preserve state) or back/forward.
 */
export function shouldClearState(): boolean {
  // Push (navbar click) = fresh start, clear storage
  // Unknown on reload with existing state = preserve
  // Unknown without state = fresh start
  return lastNavigationType === "push" ||
    (lastNavigationType === "unknown" && !lastHistoryState);
}

/**
 * Check if we should restore state.
 * Returns true for browser back/forward navigation or reload with existing state.
 * Consumes the navigation type (resets to prevent stale state).
 */
export function shouldRestoreState(): boolean {
  // Restore on back/forward OR reload with existing history state
  const shouldRestore = lastNavigationType === "back_forward" ||
    (lastNavigationType === "unknown" && !!lastHistoryState);
  // Reset after checking to prevent stale state affecting future navigations
  lastNavigationType = "unknown";
  return shouldRestore;
}

/**
 * Get the result key from history state for a specific page.
 * Returns null if no key exists.
 */
export function getHistoryStateKey(pageKey: string): string | null {
  const state = lastHistoryState || (history.state as Record<string, unknown> | null);
  const key = state?.[pageKey] as string | null;
  return key || null;
}

/**
 * Set a result key in history state for a specific page.
 *
 * @param pageKey - The key identifying the page (e.g., "backtestResultKey")
 * @param resultKey - The storage key for the result
 * @param createNewEntry - If true and a key already exists, creates a new history entry.
 *                         This allows multiple runs to have separate history entries.
 */
export function setHistoryStateKey(pageKey: string, resultKey: string, createNewEntry: boolean = false): void {
  const currentState = (history.state as Record<string, unknown>) || {};
  const existingKey = currentState[pageKey];
  const newState = { ...currentState, [pageKey]: resultKey };

  // If createNewEntry is true and there's already a different key, use pushState
  // to create a new history entry (so user can navigate back to previous result)
  if (createNewEntry && existingKey && existingKey !== resultKey) {
    history.pushState(newState, "", window.location.href);
  } else {
    history.replaceState(newState, "", window.location.href);
  }
}

/**
 * Clear a result key from history state.
 */
export function clearHistoryStateKey(pageKey: string): void {
  const currentState = (history.state as Record<string, unknown>) || {};
  const { [pageKey]: _, ...newState } = currentState;
  history.replaceState(Object.keys(newState).length ? newState : null, "", window.location.href);
}

/**
 * Clear URL parameters (for use on fresh navigation)
 */
export function clearUrlParams(): void {
  if (window.location.search) {
    const currentState = history.state;
    history.replaceState(currentState, "", window.location.pathname);
  }
}

/**
 * Get current navigation type (for debugging)
 */
export function getNavigationType(): string {
  return lastNavigationType;
}
