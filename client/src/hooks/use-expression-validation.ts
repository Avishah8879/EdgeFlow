import { useEffect, useState } from "react";
import { getApiBaseUrl } from "@/lib/api-config";

const DEBOUNCE_MS = 300;

export interface ExpressionValidation {
  /** True only when we have a definite positive result from the backend. */
  isValid: boolean;
  /** Human-readable error, includes position when the backend supplies one. */
  error: string | null;
  /**
   * True ONLY while a fetch is in flight. Stays false during the 300ms
   * debounce wait — the previous validation's result remains active so the
   * Run button doesn't flicker disabled while a user types fast.
   */
  isValidating: boolean;
  /** True if the most recent fetch failed for network reasons. */
  isOffline: boolean;
  /** Unknown identifiers reported by the backend audit, if any. */
  unknownIdentifiers: string[];
}

interface ValidateResponse {
  valid: boolean;
  expression: string;
  error?: string;
  unknown_identifiers?: string[];
}

const EMPTY_RESULT: ExpressionValidation = {
  isValid: false,
  error: null,
  isValidating: false,
  isOffline: false,
  unknownIdentifiers: [],
};

/**
 * Debounced real-time expression validator. Calls
 * `POST /api/expert-screener/validate` ~300ms after the last keystroke and
 * exposes a single state object the caller can use to gate the Run /
 * Save-as-Template buttons and render an inline error.
 *
 * Empty / whitespace-only expressions short-circuit to EMPTY_RESULT with no
 * fetch — callers should gate on `!expression.trim()` separately. The hook
 * never emits an error for empty input.
 *
 * Network failures set `isOffline: true` and `isValid: true` (optimistic) so
 * the Run button stays enabled when validation is unavailable.
 */
export function useExpressionValidation(
  expression: string,
  enabled: boolean = true,
): ExpressionValidation {
  const [state, setState] = useState<ExpressionValidation>(EMPTY_RESULT);

  useEffect(() => {
    // Hook disabled (e.g. while screener is running) — bail out, leave state.
    if (!enabled) return;

    const trimmed = expression.trim();

    // Empty input: never produce an error. Wipe any prior validation state.
    if (!trimmed) {
      setState(EMPTY_RESULT);
      return;
    }

    // Each effect owns its own AbortController. Cleanup aborts the fetch
    // (if it was already in flight) AND cancels the pending debounce timer,
    // so stale responses can never land into newer state.
    const controller = new AbortController();

    const timer = setTimeout(() => {
      // Flip isValidating only now, when the fetch is actually starting.
      setState((prev) => ({ ...prev, isValidating: true }));

      const baseUrl = getApiBaseUrl();
      fetch(`${baseUrl}/api/expert-screener/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expression: trimmed }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            throw new Error(`Validation request failed (${res.status})`);
          }
          const envelope = await res.json();
          const data: ValidateResponse = envelope?.data ?? envelope;
          if (controller.signal.aborted) return;
          setState({
            isValid: Boolean(data.valid),
            error: data.valid ? null : (data.error ?? "Invalid expression"),
            isValidating: false,
            isOffline: false,
            unknownIdentifiers: data.unknown_identifiers ?? [],
          });
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          // Network failure — stay optimistic so Run isn't blocked.
          setState({
            isValid: true,
            error: null,
            isValidating: false,
            isOffline: true,
            unknownIdentifiers: [],
          });
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [expression, enabled]);

  return state;
}
