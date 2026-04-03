/**
 * Visibility Refresh Hook
 *
 * Refreshes critical user data when the user returns to the tab.
 * This ensures admin changes propagate quickly even without WebSocket.
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook that refreshes user data when the tab becomes visible again.
 * This helps ensure admin changes (tier, permissions) propagate to the user.
 */
export function useVisibilityRefresh() {
  const queryClient = useQueryClient();
  const { isAuthenticated, token, refreshUserProfile } = useAuth();
  const lastRefreshRef = useRef<number>(0);
  const MIN_REFRESH_INTERVAL = 30 * 1000; // 30 seconds minimum between refreshes

  useEffect(() => {
    if (!isAuthenticated || !token) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;

      // Prevent too frequent refreshes
      const now = Date.now();
      if (now - lastRefreshRef.current < MIN_REFRESH_INTERVAL) return;
      lastRefreshRef.current = now;

      console.log('[VisibilityRefresh] Tab became visible, refreshing user data...');

      // Invalidate user-facing queries
      queryClient.invalidateQueries({ queryKey: ['user-subscription'] });
      queryClient.invalidateQueries({ queryKey: ['usage-limits'] });
      queryClient.invalidateQueries({ queryKey: ['trial-eligibility'] });
      queryClient.invalidateQueries({ queryKey: ['user-feature-flags'] });

      // Also refresh the user profile from AuthContext if available
      if (typeof refreshUserProfile === 'function') {
        try {
          await refreshUserProfile();
        } catch (error) {
          console.error('[VisibilityRefresh] Failed to refresh user profile:', error);
        }
      }
    };

    // Add listener
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, token, queryClient, refreshUserProfile]);
}

/**
 * Hook that refreshes user data on focus (when user clicks back into window).
 * Complementary to visibility change for better UX.
 */
export function useFocusRefresh() {
  const queryClient = useQueryClient();
  const { isAuthenticated, token } = useAuth();
  const lastRefreshRef = useRef<number>(0);
  const MIN_REFRESH_INTERVAL = 60 * 1000; // 1 minute minimum between focus refreshes

  useEffect(() => {
    if (!isAuthenticated || !token) return;

    const handleFocus = () => {
      const now = Date.now();
      if (now - lastRefreshRef.current < MIN_REFRESH_INTERVAL) return;
      lastRefreshRef.current = now;

      console.log('[FocusRefresh] Window focused, refreshing user data...');

      // Invalidate critical queries
      queryClient.invalidateQueries({ queryKey: ['user-subscription'] });
      queryClient.invalidateQueries({ queryKey: ['usage-limits'] });
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [isAuthenticated, token, queryClient]);
}
