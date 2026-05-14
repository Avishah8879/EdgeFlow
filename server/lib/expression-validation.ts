/**
 * Server-side expression validator.
 *
 * Forwards to the FastAPI `/api/expert-screener/validate` endpoint so the
 * Python `ConditionEvaluator` + `audit_identifiers` pair is the single
 * source of truth. Used by the user-templates POST/PATCH handlers to refuse
 * invalid expressions before they're persisted.
 *
 * Throws on network/transport failures so callers can translate to a 503.
 * Successful HTTP responses (including `{valid:false}`) are returned as-is.
 */

import { pythonBackendUrl } from './python-backend-url';

const FETCH_TIMEOUT_MS = 5_000;

export interface ValidateResult {
  valid: boolean;
  error?: string;
  unknownIdentifiers: string[];
}

export async function validateExpression(expression: string): Promise<ValidateResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${pythonBackendUrl()}/api/expert-screener/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expression }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Validation service returned ${res.status}`);
    }

    const envelope: unknown = await res.json();
    const data: any = (envelope as any)?.data ?? envelope;

    return {
      valid: Boolean(data?.valid),
      error: typeof data?.error === 'string' ? data.error : undefined,
      unknownIdentifiers: Array.isArray(data?.unknown_identifiers)
        ? data.unknown_identifiers
        : [],
    };
  } finally {
    clearTimeout(timer);
  }
}
