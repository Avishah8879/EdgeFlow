import { AuthSession, persistSession } from "@/lib/auth";
import { getApiBaseUrl, getAuthBaseUrl } from "@/lib/api-config";

let accessToken: string | null = null;
let refreshToken: string | null = null;
let interceptorInitialized = false;

// Mutex for token refresh - prevents concurrent refresh requests
let refreshPromise: Promise<AuthSession> | null = null;

/**
 * Determine if a request should include the Authorization header
 * Now attaches to BOTH Python backend AND Node backend
 */
const shouldAttachAuth = (url: string) => {
  // Don't attach auth to auth endpoints (prevents circular issues)
  if (url.includes('/auth/v2/login') || url.includes('/auth/v2/signup') || url.includes('/auth/google')) {
    return false;
  }

  // For relative URLs, attach to all API calls
  if (url.startsWith("/api/") || url.startsWith("api/") || url.startsWith("/auth/")) {
    return true;
  }

  // For absolute URLs, check if they match our backend URLs
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const pythonBaseUrl = getApiBaseUrl();
    const nodeBaseUrl = getAuthBaseUrl();

    // If base URLs are empty (remote access with relative URLs), don't match absolute URLs
    if (!pythonBaseUrl && !nodeBaseUrl) {
      return false;
    }

    // Attach to both Python and Node backend URLs
    return (pythonBaseUrl && url.startsWith(pythonBaseUrl)) ||
           (nodeBaseUrl && url.startsWith(nodeBaseUrl));
  }

  return false;
};

const buildHeaders = (
  input: RequestInfo | URL,
  init?: RequestInit,
): Headers => {
  const headers = new Headers();

  if (input instanceof Request) {
    input.headers.forEach((value, key) => {
      headers.set(key, value);
    });
  }

  if (init?.headers) {
    const initHeaders = new Headers(init.headers as HeadersInit);
    initHeaders.forEach((value, key) => {
      headers.set(key, value);
    });
  }

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  return headers;
};

const extractUrl = (input: RequestInfo | URL): string => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return String(input);
};

/**
 * Initialize auth fetch interceptor
 * Now supports both access token and refresh token
 */
export const initializeAuthFetchInterceptor = (
  token: string | null,
  refresh?: string | null
) => {
  if (typeof window === "undefined" || interceptorInitialized) {
    accessToken = token;
    refreshToken = refresh || null;
    return;
  }

  interceptorInitialized = true;
  accessToken = token;
  refreshToken = refresh || null;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = extractUrl(input);

    // Don't attach auth if no token or URL doesn't need auth
    if (!accessToken || !shouldAttachAuth(url)) {
      return originalFetch(input, init);
    }

    const headers = buildHeaders(input, init);
    const nextInit: RequestInit = {
      ...init,
      headers,
    };

    // Make request with auth header
    let response: Response;
    if (input instanceof Request) {
      response = await originalFetch(new Request(input, nextInit));
    } else {
      response = await originalFetch(input, nextInit);
    }

    // Check if token expired (401) and try to refresh
    if (response.status === 401 && refreshToken && !url.includes('/auth/v2/refresh')) {
      console.log('[AUTH_FETCH] Token expired, attempting refresh...');

      try {
        // Use mutex pattern - only one refresh request at a time
        if (!refreshPromise) {
          // First request to detect expiry - start the refresh
          const currentRefreshToken = refreshToken; // Capture before async
          refreshPromise = (async (): Promise<AuthSession> => {
            // Use dynamic auth base URL for refresh endpoint
            const authBaseUrl = getAuthBaseUrl();
            const refreshResponse = await originalFetch(`${authBaseUrl}/auth/v2/refresh`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken: currentRefreshToken }),
            });

            if (!refreshResponse.ok) {
              const errorText = await refreshResponse.text();
              throw new Error(`Refresh failed: ${refreshResponse.status} ${errorText}`);
            }

            return refreshResponse.json();
          })();
        } else {
          console.log('[AUTH_FETCH] Refresh already in progress, waiting...');
        }

        // All concurrent requests wait on the same promise
        const session = await refreshPromise;

        // Update tokens
        accessToken = session.token;
        refreshToken = session.refreshToken ?? null;

        // CRITICAL: Persist session to localStorage immediately
        // This ensures the refreshed session (with role, etc.) is saved
        // even if the AuthContext event listener isn't attached yet (race condition fix)
        if (session.token && session.user) {
          persistSession(session as AuthSession);
          console.log('[AUTH_FETCH] Session persisted to localStorage');
        }

        // Notify any listeners (like AuthContext) about the refresh
        window.dispatchEvent(new CustomEvent('auth-token-refreshed', {
          detail: session
        }));

        console.log('[AUTH_FETCH] Token refreshed successfully, retrying request');

        // Retry original request with new token
        headers.set('Authorization', `Bearer ${accessToken}`);
        const retryInit: RequestInit = { ...nextInit, headers };

        if (input instanceof Request) {
          return originalFetch(new Request(input, retryInit));
        } else {
          return originalFetch(input, retryInit);
        }
      } catch (error) {
        console.error('[AUTH_FETCH] Token refresh error:', error);
        // Clear tokens on refresh failure - user needs to re-login
        accessToken = null;
        refreshToken = null;
        window.dispatchEvent(new CustomEvent('auth-refresh-failed'));
      } finally {
        // Clear the mutex so future refreshes can proceed
        refreshPromise = null;
      }
    }

    return response;
  };
};

/**
 * Update auth tokens (both access and refresh)
 */
export const updateAuthFetchToken = (
  token: string | null,
  refresh?: string | null
) => {
  accessToken = token;
  if (refresh !== undefined) {
    refreshToken = refresh;
  }
};
