import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { getAuthBaseUrl } from "@/lib/api-config";

// Browser-detected IANA timezone, e.g. "Asia/Kolkata". Used for date-bucketed
// admin analytics so a viewer in IST sees a May-13 bar for activity that
// happened May-13 IST, not the UTC date the row was stored under.
function getBrowserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// Types for admin dashboard statistics
export interface UserStats {
  total: number;
  byRole: {
    user: number;
    moderator: number;
    admin: number;
    super_admin: number;
  };
  byTier: {
    basic: number;
    premium: number;
  };
  byProvider: {
    password: number;
    google: number;
  };
  active: number;
  locked: number;
  emailVerified: number;
}

export interface RecentActivity {
  signupsToday: number;
  signupsThisWeek: number;
  signupsThisMonth: number;
  loginsToday: number;
  loginsThisWeek: number;
  failedLoginsToday: number;
}

export interface SystemHealth {
  database: "healthy" | "degraded" | "down";
  cache: "healthy" | "degraded" | "down";
  api: "healthy" | "degraded" | "down";
  lastCheck: string;
}

export interface AdminDashboardStats {
  users: UserStats;
  activity: RecentActivity;
  system: SystemHealth;
}

export interface AuditLogEntry {
  id: string;
  adminId: string;
  adminUsername: string | null;
  adminEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  oldValue: Record<string, any> | null;
  newValue: Record<string, any> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuthLogEntry {
  id: string;
  userId: string | null;
  email: string;
  username: string | null;
  eventType: string;
  provider: string;
  success: boolean;
  failureReason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: {
    identifier?: string;
    failedAttempts?: number;
    [key: string]: unknown;
  } | null;
  createdAt: string;
}

export interface IpSummaryEntry {
  ipAddress: string;
  attemptCount: string;
  uniqueUsers: string;
  uniqueIdentifiers: string;
  eventTypes: string[];
  firstAttempt: string;
  lastAttempt: string;
  targetEmails: string[];
}

/**
 * Hook to fetch admin dashboard statistics.
 */
export function useAdminStats() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<AdminDashboardStats>({
    queryKey: ["admin-stats"],
    queryFn: async (): Promise<AdminDashboardStats> => {
      const response = await fetch(`${baseUrl}/api/admin/stats`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch admin stats");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });
}

/**
 * Hook to fetch audit logs.
 */
export function useAuditLogs(filters: {
  page?: number;
  limit?: number;
  userId?: string;
  action?: string;
  resourceType?: string;
  startDate?: string;
  endDate?: string;
} = {}) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  const queryParams = new URLSearchParams();
  if (filters.page) queryParams.set("page", String(filters.page));
  if (filters.limit) queryParams.set("limit", String(filters.limit));
  if (filters.userId) queryParams.set("userId", filters.userId);
  if (filters.action) queryParams.set("action", filters.action);
  if (filters.resourceType) queryParams.set("resourceType", filters.resourceType);
  if (filters.startDate) queryParams.set("startDate", filters.startDate);
  if (filters.endDate) queryParams.set("endDate", filters.endDate);

  return useQuery<{
    logs: AuditLogEntry[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: ["admin-audit-logs", filters],
    queryFn: async () => {
      const url = `${baseUrl}/api/admin/audit-logs?${queryParams.toString()}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch audit logs");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch authentication logs.
 */
export function useAuthLogs(filters: {
  page?: number;
  limit?: number;
  userId?: string;
  eventType?: string;
  success?: boolean;
  startDate?: string;
  endDate?: string;
  search?: string;
} = {}) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  const queryParams = new URLSearchParams();
  if (filters.page) queryParams.set("page", String(filters.page));
  if (filters.limit) queryParams.set("limit", String(filters.limit));
  if (filters.userId) queryParams.set("userId", filters.userId);
  if (filters.eventType) queryParams.set("eventType", filters.eventType);
  if (filters.success !== undefined) queryParams.set("success", String(filters.success));
  if (filters.startDate) queryParams.set("startDate", filters.startDate);
  if (filters.endDate) queryParams.set("endDate", filters.endDate);
  if (filters.search) queryParams.set("search", filters.search);

  return useQuery<{
    logs: AuthLogEntry[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: ["admin-auth-logs", filters],
    queryFn: async () => {
      const url = `${baseUrl}/api/admin/auth-logs?${queryParams.toString()}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch auth logs");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch failed login IP summary.
 */
export function useFailedLoginIpSummary(filters: {
  startDate?: string;
  endDate?: string;
  minAttempts?: number;
  enabled?: boolean;
} = {}) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  const queryParams = new URLSearchParams();
  if (filters.startDate) queryParams.set("startDate", filters.startDate);
  if (filters.endDate) queryParams.set("endDate", filters.endDate);
  if (filters.minAttempts) queryParams.set("minAttempts", String(filters.minAttempts));

  return useQuery<{ summary: IpSummaryEntry[] }>({
    queryKey: ["admin-auth-logs-ip-summary", filters],
    queryFn: async () => {
      const url = `${baseUrl}/api/admin/auth-logs/ip-summary?${queryParams.toString()}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch IP summary");
      }
      return response.json();
    },
    enabled: (filters.enabled !== false) && !!token,
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to fetch system notifications for admin.
 */
export function useAdminNotifications(filters: {
  page?: number;
  limit?: number;
  isActive?: boolean;
} = {}) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  const queryParams = new URLSearchParams();
  if (filters.page) queryParams.set("page", String(filters.page));
  if (filters.limit) queryParams.set("limit", String(filters.limit));
  if (filters.isActive !== undefined) queryParams.set("isActive", String(filters.isActive));

  return useQuery<{
    notifications: any[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: ["admin-notifications", filters],
    queryFn: async () => {
      const url = `${baseUrl}/api/admin/notifications?${queryParams.toString()}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch notifications");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 60 * 1000, // 1 minute
  });
}

// ============================================================================
// ADVANCED ANALYTICS HOOKS
// ============================================================================

export interface SignupDataPoint {
  date: string;
  count: number;
  premium: number;
  google: number;
}

export interface LoginDataPoint {
  date: string;
  total: number;
  success: number;
  failed: number;
  uniqueUsers: number;
}

export interface RetentionData {
  activeUsers: {
    day1: number;
    day7: number;
    day30: number;
    day90: number;
  };
  retentionRates: {
    day1: number;
    day7: number;
    day30: number;
    day90: number;
  };
  churnedUsers: number;
  newUserRetention: {
    newUsers: number;
    retained: number;
    rate: number;
  };
}

export interface GrowthDataPoint {
  month: string;
  signups: number;
  premium: number;
  cumulative: number;
}

export interface WeeklyGrowthPoint {
  week: string;
  count: number;
  growth: number;
}

export interface GrowthData {
  monthly: GrowthDataPoint[];
  weeklyGrowth: WeeklyGrowthPoint[];
}

/**
 * Hook to fetch signup analytics time-series data.
 */
export function useSignupAnalytics(days: number = 30) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  const tz = getBrowserTz();

  return useQuery<{ data: SignupDataPoint[] }>({
    queryKey: ["admin-analytics-signups", days, tz],
    queryFn: async () => {
      const response = await fetch(
        `${baseUrl}/api/admin/analytics/signups?days=${days}&tz=${encodeURIComponent(tz)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch signup analytics");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch login analytics time-series data.
 */
export function useLoginAnalytics(days: number = 30) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  const tz = getBrowserTz();

  return useQuery<{ data: LoginDataPoint[] }>({
    queryKey: ["admin-analytics-logins", days, tz],
    queryFn: async () => {
      const response = await fetch(
        `${baseUrl}/api/admin/analytics/logins?days=${days}&tz=${encodeURIComponent(tz)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch login analytics");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch retention analytics.
 */
export function useRetentionAnalytics() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<RetentionData>({
    queryKey: ["admin-analytics-retention"],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/admin/analytics/retention`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch retention analytics");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch growth analytics.
 */
export function useGrowthAnalytics() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  const tz = getBrowserTz();

  return useQuery<GrowthData>({
    queryKey: ["admin-analytics-growth", tz],
    queryFn: async () => {
      const response = await fetch(
        `${baseUrl}/api/admin/analytics/growth?tz=${encodeURIComponent(tz)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch growth analytics");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// ============================================================================
// USER ACTIVITY ANALYTICS
// ============================================================================

export interface ActiveUser {
  userId: string;
  userEmail: string;
  userName: string | null;
  currentPage: string;
  pageTitle: string | null;
  deviceType: string;
  browser: string;
  os: string;
  lastActivity: string;
}

export interface AnonymousSession {
  sessionId: string;
  currentPage: string;
  pageTitle: string | null;
  deviceType: string;
  browser: string;
  os: string;
  lastActivity: string;
}

export interface ActiveUsersData {
  loggedInUsers: ActiveUser[];
  anonymousSessions: AnonymousSession[];
  totalActive: number;
}

export interface PageStat {
  pagePath: string;
  viewCount: number;
  uniqueUsers: number;
  uniqueSessions: number;
  avgDurationSeconds: number | null;
  maxDurationSeconds: number | null;
}

export interface PageViewOverTime {
  date: string;
  pageViews: number;
  uniqueUsers: number;
  uniqueSessions: number;
}

export interface DeviceStat {
  deviceType: string;
  count: number;
  uniqueUsers: number;
}

export interface BrowserStat {
  browser: string;
  count: number;
}

export interface TimeByPage {
  pagePath: string;
  avgDuration: number;
  sessionsWithDuration: number;
}

export interface PageStatsData {
  byPage: PageStat[];
  overTime: PageViewOverTime[];
  byDevice: DeviceStat[];
  byBrowser: BrowserStat[];
  timeByPage: TimeByPage[];
}

export interface FeatureUsageStat {
  featureType: string;
  usageCount: number;
  uniqueUsers: number;
  avgExecutionMs: number | null;
  successCount: number;
  failureCount: number;
}

export interface FeatureUsageOverTime {
  date: string;
  featureType: string;
  count: number;
}

export interface TopFeatureUser {
  userId: string;
  userEmail: string;
  userName: string | null;
  usageCount: number;
  featuresUsed: string[];
}

export interface FeatureUsageData {
  byFeature: FeatureUsageStat[];
  overTime: FeatureUsageOverTime[];
  topUsers: TopFeatureUser[];
}

export interface SearchQuery {
  query: string;
  searchCount: number;
  avgResults: number | null;
  selectCount: number;
}

export interface SearchOverTime {
  date: string;
  searchCount: number;
  uniqueSearchers: number;
}

export interface TopSelection {
  selectedResult: string;
  selectionCount: number;
}

export interface SearchStatsData {
  topQueries: SearchQuery[];
  overTime: SearchOverTime[];
  topSelections: TopSelection[];
}

export interface UserPageView {
  pagePath: string;
  pageTitle: string | null;
  durationSeconds: number | null;
  deviceType: string;
  browser: string;
  timestamp: string;
}

export interface UserFeatureUsage {
  featureType: string;
  params: Record<string, unknown>;
  result: Record<string, unknown> | null;
  executionTimeMs: number | null;
  success: boolean;
  timestamp: string;
}

export interface UserSearch {
  query: string;
  resultCount: number | null;
  selectedResult: string | null;
  timestamp: string;
}

export interface UserActivitySummary {
  totalPageViews: number;
  uniquePages: number;
  avgPageDuration: number | null;
  totalTimeSeconds: number | null;
}

export interface UserActivityData {
  pageViews: UserPageView[];
  featureUsage: UserFeatureUsage[];
  searches: UserSearch[];
  summary: UserActivitySummary;
}

/**
 * Hook to fetch currently active users.
 */
export function useActiveUsers(minutesAgo: number = 5) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<ActiveUsersData>({
    queryKey: ["admin-active-users", minutesAgo],
    queryFn: async () => {
      const response = await fetch(
        `${baseUrl}/api/admin/analytics/active-users?minutes=${minutesAgo}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch active users");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 30 * 1000, // 30 seconds - refresh frequently for real-time feel
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });
}

/**
 * Hook to fetch page view statistics.
 */
export function usePageStats(days: number = 7) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  const tz = getBrowserTz();

  return useQuery<PageStatsData>({
    queryKey: ["admin-page-stats", days, tz],
    queryFn: async () => {
      const response = await fetch(
        `${baseUrl}/api/admin/analytics/page-stats?days=${days}&tz=${encodeURIComponent(tz)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch page stats");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch user activity for a specific user.
 */
export function useUserActivity(userId: string, days: number = 30) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<UserActivityData>({
    queryKey: ["admin-user-activity", userId, days],
    queryFn: async () => {
      const response = await fetch(
        `${baseUrl}/api/admin/analytics/user-activity/${userId}?days=${days}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch user activity");
      }

      return response.json();
    },
    enabled: !!token && !!userId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Hook to fetch feature usage statistics.
 */
export function useFeatureUsageStats(days: number = 7) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<FeatureUsageData>({
    queryKey: ["admin-feature-usage", days],
    queryFn: async () => {
      const response = await fetch(
        `${baseUrl}/api/admin/analytics/feature-usage?days=${days}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch feature usage stats");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch search analytics.
 */
export function useSearchStats(days: number = 7) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<SearchStatsData>({
    queryKey: ["admin-search-stats", days],
    queryFn: async () => {
      const response = await fetch(
        `${baseUrl}/api/admin/analytics/search-stats?days=${days}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch search stats");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// ============================================================================
// USER TIME SPENT ANALYTICS
// ============================================================================

export interface UserTopPage {
  pagePath: string;
  totalTime: number;
  viewCount: number;
}

export interface UserSessionStats {
  sessionCount: number;
  avgSessionDuration: number;
  maxSessionDuration: number;
}

export interface UserTimeStats {
  userId: string;
  userEmail: string;
  userName: string | null;
  avatarUrl: string | null;
  pageViews: number;
  measuredPageViews: number;
  uniquePages: number;
  totalTimeSeconds: number;
  avgTimePerPage: number;
  lastActivity: string;
  firstActivity: string;
  topPages: UserTopPage[];
  totalPagesCount: number;
  totalPagesTime: number;
  sessions: UserSessionStats;
}

export interface UserTimeOverview {
  activeUsers: number;
  totalPlatformTime: number;
  avgPageTime: number;
  totalPageViews: number;
  measuredPageViews: number;
}

export interface UserTimeStatsData {
  users: UserTimeStats[];
  overview: UserTimeOverview;
}

/**
 * Hook to fetch user time spent statistics.
 */
export function useUserTimeStats(days: number = 7) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<UserTimeStatsData>({
    queryKey: ["admin-user-time-stats", days],
    queryFn: async () => {
      const response = await fetch(
        `${baseUrl}/api/admin/analytics/user-time-stats?days=${days}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch user time stats");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
