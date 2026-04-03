/**
 * useUrlState - Bidirectional URL query parameter synchronization
 *
 * Syncs a React state value with a URL query parameter.
 * - Reads from URL on mount (one-time)
 * - Provides a function to write changes back to URL
 *
 * Uses replaceState by default to avoid polluting browser history.
 */
import { useEffect, useCallback, useRef } from "react";
import { useSearch } from "wouter";

interface UseUrlStateOptions<T> {
  /** Query parameter name */
  param: string;
  /** Current value in component state */
  value: T;
  /** Setter function to update component state */
  setValue: (value: T) => void;
  /** Serialize value to URL string (default: String()) */
  serialize?: (value: T) => string;
  /** Deserialize URL string to value (default: identity) */
  deserialize?: (urlValue: string) => T;
  /** Whether to replace history entry (default: true) */
  replace?: boolean;
}

export function useUrlState<T extends string>({
  param,
  value,
  setValue,
  serialize = String,
  deserialize = (v) => v as T,
  replace = true,
}: UseUrlStateOptions<T>) {
  const searchString = useSearch();
  const initializedRef = useRef(false);

  // Read from URL on mount (one-time)
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const params = new URLSearchParams(searchString);
    const urlValue = params.get(param);
    if (urlValue) {
      try {
        const deserialized = deserialize(decodeURIComponent(urlValue));
        setValue(deserialized);
      } catch (error) {
        console.error(`[useUrlState] Failed to deserialize param "${param}":`, error);
      }
    }
  }, []); // Intentionally empty - run only on mount

  // Function to sync current value to URL
  const syncToUrl = useCallback(
    (newValue: T) => {
      const params = new URLSearchParams(window.location.search);
      const serialized = serialize(newValue);

      if (serialized) {
        params.set(param, encodeURIComponent(serialized));
      } else {
        params.delete(param);
      }

      const newSearch = params.toString();
      const pathname = window.location.pathname;
      const newUrl = newSearch ? `${pathname}?${newSearch}` : pathname;

      if (replace) {
        window.history.replaceState(null, "", newUrl);
      } else {
        window.history.pushState(null, "", newUrl);
      }
    },
    [param, serialize, replace]
  );

  // Function to clear this param from URL
  const clearFromUrl = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete(param);

    const newSearch = params.toString();
    const pathname = window.location.pathname;
    const newUrl = newSearch ? `${pathname}?${newSearch}` : pathname;

    if (replace) {
      window.history.replaceState(null, "", newUrl);
    } else {
      window.history.pushState(null, "", newUrl);
    }
  }, [param, replace]);

  return { syncToUrl, clearFromUrl };
}

/**
 * useUrlParam - Simple read-only URL parameter hook
 * Returns the current value of a URL parameter
 */
export function useUrlParam(param: string): string | null {
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const value = params.get(param);
  return value ? decodeURIComponent(value) : null;
}
