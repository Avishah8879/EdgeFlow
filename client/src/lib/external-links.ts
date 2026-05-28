/**
 * Centralized external destinations.
 *
 * EquityPro AI replaces the in-platform Alpha Generation / strategy
 * backtesting feature. The URL is configured via VITE_EQUITYPRO_AI_URL
 * in `.env` (Vite injects at build time). Keep this file as the single
 * source of truth so a domain change is one edit.
 */

const FALLBACK_EQUITYPRO_AI_URL = "https://ai.equitypro.ai";

export function getEquityProAiUrl(): string {
  const fromEnv = (import.meta.env.VITE_EQUITYPRO_AI_URL as string | undefined)?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : FALLBACK_EQUITYPRO_AI_URL;
}

/**
 * Props you can spread onto an <a> to make it open in a new tab safely.
 * Always pair with a meaningful `aria-label` if the link text is purely
 * decorative.
 */
export const EXTERNAL_LINK_PROPS = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;
