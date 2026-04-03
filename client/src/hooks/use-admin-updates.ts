/**
 * Admin Updates WebSocket Hook
 *
 * Listens for real-time admin changes (tier updates, feature flags, rate limits)
 * and automatically invalidates relevant queries + shows toast notifications.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { readStoredSession } from '@/lib/auth';
import { getAuthBaseUrl } from '@/lib/api-config';
import { toast } from 'sonner';

// ============================================================================
// TYPES
// ============================================================================

type AdminEventType =
  | 'CONNECTED'
  | 'TIER_CHANGED'
  | 'ROLE_CHANGED'
  | 'FEATURE_FLAG_CHANGED'
  | 'RATE_LIMIT_CHANGED'
  | 'ACCOUNT_UNLOCKED'
  | 'SESSION_REVOKED'
  | 'NOTIFICATION';

interface AdminEvent {
  type: AdminEventType;
  payload: Record<string, unknown>;
  message?: string;
  timestamp: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const getWebSocketUrl = (): string => {
  const authBaseUrl = getAuthBaseUrl();

  // If authBaseUrl is empty (relative URLs), use current origin
  if (!authBaseUrl) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }

  // Convert http(s) to ws(s)
  if (authBaseUrl.startsWith('https://')) {
    return authBaseUrl.replace('https://', 'wss://');
  }
  if (authBaseUrl.startsWith('http://')) {
    return authBaseUrl.replace('http://', 'ws://');
  }

  // Default to current origin
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
};

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000]; // Exponential backoff

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook that connects to the admin updates WebSocket and handles incoming events.
 * Automatically invalidates relevant queries and shows toast notifications.
 */
export function useAdminUpdates() {
  const { isAuthenticated, token, refreshUserProfile, logout } = useAuth();
  const queryClient = useQueryClient();

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRefreshingRef = useRef(false);

  const handleEvent = useCallback(
    (event: AdminEvent) => {
      console.log('[WS] Received event:', event.type, event.payload);

      switch (event.type) {
        case 'CONNECTED':
          console.log('[WS] Connected to admin updates');
          reconnectAttemptRef.current = 0; // Reset reconnect counter on successful connection
          break;

        case 'TIER_CHANGED':
          // Invalidate tier-dependent queries
          queryClient.invalidateQueries({ queryKey: ['user-subscription'] });
          queryClient.invalidateQueries({ queryKey: ['usage-limits'] });
          queryClient.invalidateQueries({ queryKey: ['trial-eligibility'] });

          // Refresh user profile to update localStorage
          refreshUserProfile?.();

          // Show toast notification
          if (event.message) {
            toast.success('Account Updated', {
              description: event.message,
              duration: 5000,
            });
          }
          break;

        case 'ROLE_CHANGED':
          // Refresh user profile
          refreshUserProfile?.();

          if (event.message) {
            toast.info('Role Updated', {
              description: event.message,
              duration: 5000,
            });
          }
          break;

        case 'FEATURE_FLAG_CHANGED':
          // Invalidate feature flags
          queryClient.invalidateQueries({ queryKey: ['user-feature-flags'] });

          // Only show toast for user-specific overrides
          if (event.payload?.isOverride && event.message) {
            toast.info('Feature Updated', {
              description: event.message,
              duration: 4000,
            });
          }
          break;

        case 'RATE_LIMIT_CHANGED':
          // Invalidate usage limits
          queryClient.invalidateQueries({ queryKey: ['usage-limits'] });

          // Only show toast for user-specific overrides
          if (event.payload?.isOverride && event.message) {
            toast.info('Limits Updated', {
              description: event.message,
              duration: 4000,
            });
          }
          break;

        case 'ACCOUNT_UNLOCKED':
          if (event.message) {
            toast.success('Account Unlocked', {
              description: event.message,
              duration: 5000,
            });
          }
          break;

        case 'SESSION_REVOKED':
          toast.error('Session Revoked', {
            description: event.message || 'Your session has been revoked. Please log in again.',
            duration: 10000,
          });
          // Log out the user
          setTimeout(() => {
            logout();
          }, 2000);
          break;

        case 'NOTIFICATION':
          if (event.message) {
            toast(event.message, {
              duration: 5000,
            });
          }
          break;

        default:
          console.log('[WS] Unknown event type:', event.type);
      }
    },
    [queryClient, refreshUserProfile, logout]
  );

  const refreshAndReconnect = useCallback(async () => {
    // Prevent concurrent refresh attempts
    if (isRefreshingRef.current) {
      console.log('[WS] Token refresh already in progress');
      return;
    }

    const storedSession = readStoredSession();
    if (!storedSession?.refreshToken) {
      console.log('[WS] No refresh token available, cannot reconnect');
      return;
    }

    isRefreshingRef.current = true;
    console.log('[WS] Attempting token refresh...');

    try {
      const nodeBaseUrl = getAuthBaseUrl();
      const response = await fetch(`${nodeBaseUrl}/auth/v2/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: storedSession.refreshToken }),
      });

      if (!response.ok) {
        console.log('[WS] Token refresh failed:', response.status);
        isRefreshingRef.current = false;
        return;
      }

      const session = await response.json();
      console.log('[WS] Token refreshed successfully');

      // Dispatch event so AuthContext updates state and localStorage
      // AuthContext will then trigger a re-render with new token
      window.dispatchEvent(new CustomEvent('auth-token-refreshed', {
        detail: session
      }));

      // Reset backoff for fresh reconnection
      reconnectAttemptRef.current = 0;
      // Note: Reconnection happens automatically via the token-refreshed listener below

    } catch (error) {
      console.error('[WS] Token refresh error:', error);
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  const connect = useCallback(() => {
    if (!isAuthenticated || !token) {
      return;
    }

    // Don't reconnect if already connected or connecting
    if (wsRef.current?.readyState === WebSocket.OPEN ||
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const wsUrl = `${getWebSocketUrl()}/ws/admin-updates?token=${token}`;

    try {
      console.log('[WS] Connecting to admin updates...');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data: AdminEvent = JSON.parse(event.data);
          handleEvent(data);
        } catch (error) {
          console.error('[WS] Failed to parse message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[WS] WebSocket error:', error);
      };

      ws.onclose = (event) => {
        console.log('[WS] WebSocket closed:', event.code, event.reason);
        wsRef.current = null;

        // Auth error - try to refresh token
        if (event.code === 4001) {
          console.log('[WS] Auth error (token expired), attempting refresh...');
          refreshAndReconnect();
          return;
        }

        // Schedule reconnect with exponential backoff
        if (isAuthenticated && token) {
          const delay = RECONNECT_DELAYS[Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS.length - 1)];
          console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current + 1})`);

          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptRef.current++;
            connect();
          }, delay);
        }
      };
    } catch (error) {
      console.error('[WS] Failed to create WebSocket:', error);
    }
  }, [isAuthenticated, token, handleEvent, refreshAndReconnect]);

  // Connect when authenticated
  useEffect(() => {
    if (isAuthenticated && token) {
      connect();
    }

    return () => {
      // Cleanup on unmount
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
    };
  }, [isAuthenticated, token, connect]);

  // Reconnect on visibility change (when user returns to tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isAuthenticated && token) {
        // Check if WebSocket is disconnected
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          console.log('[WS] Tab visible, reconnecting...');
          connect();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, token, connect]);

  // Reconnect when token is refreshed (by this hook or by HTTP 401 handler)
  useEffect(() => {
    const handleTokenRefreshed = () => {
      // If WebSocket is disconnected, reconnect with the new token
      // (AuthContext will have updated `token` by now)
      if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
        console.log('[WS] Token refreshed, reconnecting...');
        reconnectAttemptRef.current = 0;
        // Small delay to ensure AuthContext state has propagated
        setTimeout(() => connect(), 100);
      }
    };

    window.addEventListener('auth-token-refreshed', handleTokenRefreshed);
    return () => window.removeEventListener('auth-token-refreshed', handleTokenRefreshed);
  }, [connect]);
}
