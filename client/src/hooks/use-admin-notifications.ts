import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { getAuthBaseUrl } from "@/lib/api-config";

// Types
export interface NotificationEventType {
  id: number;
  key: string;
  name: string;
  description: string | null;
  category: string;
  defaultEnabled: boolean;
  severity: "info" | "warning" | "critical";
  createdAt: string;
}

export interface NotificationPreference {
  eventTypeId: number;
  key: string;
  name: string;
  description: string | null;
  category: string;
  defaultEnabled: boolean;
  severity: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  preferenceId: number | null;
}

export interface NotificationSetting {
  value: string | null;
  description: string | null;
}

export interface NotificationQueueItem {
  id: number;
  eventTypeKey: string;
  recipientEmail: string;
  subject: string;
  status: "pending" | "sent" | "failed" | "cancelled";
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  scheduledAt: string;
  sentAt: string | null;
  createdAt: string;
}

export interface NotificationHistoryItem {
  id: number;
  eventTypeKey: string;
  recipientEmail: string;
  subject: string;
  status: "sent" | "failed";
  errorMessage: string | null;
  sentAt: string;
  eventTypeName: string;
}

export interface EmailTemplate {
  id: number;
  eventTypeKey: string;
  subjectTemplate: string;
  bodyTextTemplate: string;
  bodyHtmlTemplate: string | null;
  variables: string[];
  createdAt: string;
  updatedAt: string;
  eventTypeName: string;
}

export interface NotificationStats {
  queue: Record<string, number>;
  history: Array<{
    date: string;
    status: string;
    count: number;
  }>;
  byEventType: Array<{
    event_type_key: string;
    total: number;
    sent: number;
    failed: number;
  }>;
}

/**
 * Hook to fetch notification event types.
 */
export function useNotificationEventTypes() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<{ eventTypes: NotificationEventType[] }>({
    queryKey: ["admin-notification-event-types"],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/admin/notifications/event-types`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch event types");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch notification preferences for the current admin.
 */
export function useNotificationPreferences() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<{ preferences: NotificationPreference[] }>({
    queryKey: ["admin-notification-preferences"],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/admin/notifications/preferences`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch preferences");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to update notification preferences.
 */
export function useUpdateNotificationPreferences() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async (preferences: Array<{ eventTypeId: number; emailEnabled: boolean; pushEnabled?: boolean }>) => {
      const response = await fetch(`${baseUrl}/api/admin/notifications/preferences`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ preferences }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update preferences");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notification-preferences"] });
    },
  });
}

/**
 * Hook to fetch global notification settings (super_admin only).
 */
export function useNotificationSettings() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<{ settings: Record<string, NotificationSetting> }>({
    queryKey: ["admin-notification-settings"],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/admin/notifications/settings`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch settings");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 60 * 1000,
  });
}

/**
 * Hook to update global notification settings (super_admin only).
 */
export function useUpdateNotificationSettings() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async (settings: Record<string, string | null>) => {
      const response = await fetch(`${baseUrl}/api/admin/notifications/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ settings }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update settings");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notification-settings"] });
    },
  });
}

/**
 * Hook to send a test notification.
 */
export function useSendTestNotification() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${baseUrl}/api/admin/notifications/test`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to send test notification");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notification-queue"] });
    },
  });
}

/**
 * Hook to fetch notification queue.
 */
export function useNotificationQueue(status?: string) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  const queryParams = new URLSearchParams();
  if (status) queryParams.set("status", status);

  return useQuery<{ queue: NotificationQueueItem[]; stats: Record<string, number> }>({
    queryKey: ["admin-notification-queue", status],
    queryFn: async () => {
      const url = `${baseUrl}/api/admin/notifications/queue${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch queue");
      }

      return response.json();
    },
    enabled: !!token,
    refetchInterval: 30 * 1000, // Refresh every 30 seconds
  });
}

/**
 * Hook to fetch notification history.
 */
export function useNotificationHistory(page: number = 1, limit: number = 20, eventType?: string) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  const queryParams = new URLSearchParams();
  queryParams.set("page", String(page));
  queryParams.set("limit", String(limit));
  if (eventType) queryParams.set("eventType", eventType);

  return useQuery<{
    history: NotificationHistoryItem[];
    pagination: { page: number; limit: number; total: number };
  }>({
    queryKey: ["admin-notification-history", page, limit, eventType],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/admin/notifications/history?${queryParams.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch history");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 60 * 1000,
  });
}

/**
 * Hook to retry a failed notification.
 */
export function useRetryNotification() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`${baseUrl}/api/admin/notifications/queue/${id}/retry`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to retry notification");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notification-queue"] });
    },
  });
}

/**
 * Hook to cancel a pending notification.
 */
export function useCancelNotification() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`${baseUrl}/api/admin/notifications/queue/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to cancel notification");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notification-queue"] });
    },
  });
}

/**
 * Hook to fetch email templates.
 */
export function useEmailTemplates() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<{ templates: EmailTemplate[] }>({
    queryKey: ["admin-email-templates"],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/admin/notifications/templates`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch templates");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to update an email template.
 */
export function useUpdateEmailTemplate() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async ({
      eventTypeKey,
      subjectTemplate,
      bodyTextTemplate,
      bodyHtmlTemplate,
    }: {
      eventTypeKey: string;
      subjectTemplate?: string;
      bodyTextTemplate?: string;
      bodyHtmlTemplate?: string | null;
    }) => {
      const response = await fetch(`${baseUrl}/api/admin/notifications/templates/${eventTypeKey}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ subjectTemplate, bodyTextTemplate, bodyHtmlTemplate }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update template");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-email-templates"] });
    },
  });
}

/**
 * Hook to fetch notification statistics.
 */
export function useNotificationStats(days: number = 7) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<NotificationStats>({
    queryKey: ["admin-notification-stats", days],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/admin/notifications/stats?days=${days}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch stats");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 60 * 1000,
  });
}
