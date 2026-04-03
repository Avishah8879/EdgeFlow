/**
 * API Configuration
 *
 * Handles dynamic API base URL resolution to support both:
 * - Local development (localhost:81 via nginx)
 * - Remote access (ngrok, production domains)
 *
 * When accessed from localhost, uses VITE_GRADIO_BASE_URL.
 * When accessed remotely (ngrok, production), uses relative URLs
 * so requests go through the same origin.
 */

/**
 * Get the API base URL for making requests to the Python backend.
 *
 * Returns empty string for relative URLs when:
 * - Accessed from ngrok domains
 * - Accessed from production domains
 * - Origin doesn't match configured base URL
 *
 * Returns configured VITE_GRADIO_BASE_URL when:
 * - Accessed from localhost
 *
 * @returns Base URL string (empty for relative, or full URL for localhost)
 */
export function getApiBaseUrl(): string {
  // Server-side rendering check
  if (typeof window === 'undefined') {
    return import.meta.env.VITE_GRADIO_BASE_URL || '';
  }

  const currentOrigin = window.location.origin;
  const configuredUrl = import.meta.env.VITE_GRADIO_BASE_URL || '';

  // If accessed from localhost, use the configured URL
  // This handles local dev with nginx on port 81
  if (currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1')) {
    return configuredUrl.replace(/\/+$/, '');
  }

  // For any remote access (ngrok, production), use relative URLs
  // nginx routes /api/* correctly regardless of domain
  return '';
}

/**
 * Get the Auth API base URL for making requests to the Node.js backend.
 * Same logic as getApiBaseUrl but for auth endpoints.
 */
export function getAuthBaseUrl(): string {
  if (typeof window === 'undefined') {
    return import.meta.env.VITE_AUTH_BASE_URL || '';
  }

  const currentOrigin = window.location.origin;
  const configuredUrl = import.meta.env.VITE_AUTH_BASE_URL || '';

  if (currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1')) {
    return configuredUrl.replace(/\/+$/, '');
  }

  return '';
}

// Legacy export for backward compatibility
export const GRADIO_BASE_URL = getApiBaseUrl();
export const AUTH_BASE_URL = getAuthBaseUrl();
