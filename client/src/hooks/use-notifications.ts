/**
 * System Notifications Hook
 *
 * Provides query and mutation for fetching active system notifications
 * and dismissing them.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { getAuthBaseUrl } from '@/lib/api-config';

const AUTH_BASE_URL = getAuthBaseUrl();

// Types
export interface SystemNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'maintenance' | 'urgent';
  target_roles: string[] | null;
  is_dismissible: boolean;
  show_on_pages: string[] | null;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface NotificationsResponse {
  notifications: SystemNotification[];
}

/**
 * Fetch active notifications for the current user
 */
async function fetchActiveNotifications(): Promise<SystemNotification[]> {
  const response = await fetch(`${AUTH_BASE_URL}/api/notifications/active`);

  if (!response.ok) {
    throw new Error('Failed to fetch notifications');
  }

  const data: NotificationsResponse = await response.json();
  return data.notifications;
}

/**
 * Dismiss a notification
 */
async function dismissNotification(notificationId: string): Promise<void> {
  const response = await fetch(`${AUTH_BASE_URL}/api/notifications/${notificationId}/dismiss`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to dismiss' }));
    throw new Error(error.message || 'Failed to dismiss notification');
  }
}

/**
 * Hook for fetching active notifications
 */
export function useActiveNotifications() {
  return useQuery({
    queryKey: ['notifications', 'active'],
    queryFn: fetchActiveNotifications,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
    retry: 1,
  });
}

/**
 * Hook for dismissing a notification
 */
export function useDismissNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: dismissNotification,
    onSuccess: () => {
      // Invalidate notifications to remove dismissed one
      queryClient.invalidateQueries({ queryKey: ['notifications', 'active'] });
    },
  });
}

/**
 * Filter notifications for the current page
 */
export function filterNotificationsForPage(
  notifications: SystemNotification[],
  currentPath: string
): SystemNotification[] {
  return notifications.filter((notification) => {
    // If show_on_pages is null or contains 'all', show everywhere
    if (!notification.show_on_pages || notification.show_on_pages.includes('all')) {
      return true;
    }

    // Map paths to page names
    const pageMap: Record<string, string> = {
      '/home': 'home',
      '/stocks': 'stocks',
      '/indices': 'indices',
      '/screener': 'screener',
      '/alpha-generation': 'backtest',
      '/portfolio': 'portfolio',
      '/watchlist': 'watchlist',
      '/news': 'news',
      '/profile': 'profile',
    };

    // Check if current path matches any show_on_pages
    const currentPage = pageMap[currentPath] || currentPath.replace('/', '');
    return notification.show_on_pages.includes(currentPage);
  });
}

/**
 * Combined hook for notification banner functionality
 */
export function useNotificationBanner() {
  const [location] = useLocation();
  const { data: notifications = [], isLoading, error } = useActiveNotifications();
  const dismissMutation = useDismissNotification();

  // Filter notifications for current page
  const visibleNotifications = filterNotificationsForPage(notifications, location);

  return {
    notifications: visibleNotifications,
    isLoading,
    error,
    dismissNotification: dismissMutation.mutate,
    isDismissing: dismissMutation.isPending,
  };
}
