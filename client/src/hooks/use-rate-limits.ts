import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { getAuthBaseUrl } from "@/lib/api-config";

// Types for rate limit management
export interface RateLimitConfig {
  id: number;
  endpointKey: string;
  tier: "all" | "basic" | "premium" | "admin";
  windowMs: number;
  maxRequests: number;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RateLimitOverride {
  id: number;
  userId: string;
  userEmail: string;
  userName: string | null;
  endpointKey: string;
  windowMs: number;
  maxRequests: number;
  reason: string | null;
  expiresAt: string | null;
  createdBy: string;
  createdByEmail: string;
  createdAt: string;
}

export interface RateLimitViolation {
  id: number;
  userId: string | null;
  userEmail: string | null;
  ipAddress: string;
  endpointKey: string;
  endpointPath: string | null;
  requestCount: number;
  limitMax: number;
  windowMs: number;
  createdAt: string;
}

export interface ViolationStats {
  totalLast24h: number;
  byEndpoint: { endpointKey: string; count: string }[];
  byIp: { ipAddress: string; count: string }[];
  byUser: { userId: string; userEmail: string; count: string }[];
  hourlyTrend: { hour: string; count: number }[];
}

/**
 * Hook to fetch all rate limit configurations.
 */
export function useRateLimitConfigs() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<{ configs: RateLimitConfig[] }>({
    queryKey: ["admin-rate-limits"],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/admin/rate-limits`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch rate limits");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to create a new rate limit configuration.
 */
export function useCreateRateLimitConfig() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async (data: {
      endpointKey: string;
      tier: string;
      windowMs: number;
      maxRequests: number;
      description?: string;
    }) => {
      const response = await fetch(`${baseUrl}/api/admin/rate-limits`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create rate limit");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-rate-limits"] });
    },
  });
}

/**
 * Hook to update a rate limit configuration.
 */
export function useUpdateRateLimitConfig() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: number;
      windowMs?: number;
      maxRequests?: number;
      description?: string;
      isActive?: boolean;
    }) => {
      const response = await fetch(`${baseUrl}/api/admin/rate-limits/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update rate limit");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-rate-limits"] });
      // Invalidate user-facing usage limits so changes propagate immediately
      queryClient.invalidateQueries({ queryKey: ["usage-limits"] });
    },
  });
}

/**
 * Hook to delete a rate limit configuration.
 */
export function useDeleteRateLimitConfig() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`${baseUrl}/api/admin/rate-limits/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete rate limit");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-rate-limits"] });
    },
  });
}

/**
 * Hook to fetch all rate limit overrides.
 */
export function useRateLimitOverrides() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<{ overrides: RateLimitOverride[] }>({
    queryKey: ["admin-rate-limit-overrides"],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/admin/rate-limits/overrides`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch rate limit overrides");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 60 * 1000,
  });
}

/**
 * Hook to fetch rate limit overrides for a specific user.
 */
export function useUserRateLimitOverrides(userId: string) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<{ overrides: RateLimitOverride[] }>({
    queryKey: ["admin-rate-limit-overrides", userId],
    queryFn: async () => {
      const response = await fetch(
        `${baseUrl}/api/admin/rate-limits/overrides/user/${userId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch user rate limit overrides");
      }

      return response.json();
    },
    enabled: !!token && !!userId,
    staleTime: 60 * 1000,
  });
}

/**
 * Hook to create a rate limit override for a user.
 */
export function useCreateRateLimitOverride() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async (data: {
      userId: string;
      endpointKey: string;
      windowMs: number;
      maxRequests: number;
      reason?: string;
      expiresAt?: string;
    }) => {
      const response = await fetch(`${baseUrl}/api/admin/rate-limits/overrides`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create rate limit override");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-rate-limit-overrides"] });
      // Invalidate user-facing usage limits so changes propagate immediately
      queryClient.invalidateQueries({ queryKey: ["usage-limits"] });
    },
  });
}

/**
 * Hook to delete a rate limit override.
 */
export function useDeleteRateLimitOverride() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(
        `${baseUrl}/api/admin/rate-limits/overrides/${id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete rate limit override");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-rate-limit-overrides"] });
    },
  });
}

/**
 * Hook to fetch rate limit violations.
 */
export function useRateLimitViolations(filters: {
  page?: number;
  limit?: number;
  endpointKey?: string;
  userId?: string;
} = {}) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  const queryParams = new URLSearchParams();
  if (filters.page) queryParams.set("page", String(filters.page));
  if (filters.limit) queryParams.set("limit", String(filters.limit));
  if (filters.endpointKey) queryParams.set("endpointKey", filters.endpointKey);
  if (filters.userId) queryParams.set("userId", filters.userId);

  return useQuery<{
    violations: RateLimitViolation[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: ["admin-rate-limit-violations", filters],
    queryFn: async () => {
      const url = `${baseUrl}/api/admin/rate-limits/violations?${queryParams.toString()}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch rate limit violations");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch rate limit violation statistics.
 */
export function useRateLimitViolationStats() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<ViolationStats>({
    queryKey: ["admin-rate-limit-violation-stats"],
    queryFn: async () => {
      const response = await fetch(
        `${baseUrl}/api/admin/rate-limits/violations/stats`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch violation stats");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to cleanup old rate limit data.
 */
export function useCleanupRateLimitData() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async (retentionDays?: number) => {
      const response = await fetch(`${baseUrl}/api/admin/rate-limits/cleanup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ retentionDays }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to cleanup rate limit data");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-rate-limit-violations"] });
      queryClient.invalidateQueries({ queryKey: ["admin-rate-limit-violation-stats"] });
    },
  });
}

// Helper function to format window duration
export function formatWindowDuration(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  return `${hours}h`;
}

// Helper function to parse window duration string to ms
export function parseWindowDuration(str: string): number {
  const match = str.match(/^(\d+)(s|m|h)$/);
  if (!match) return 900000; // default 15 minutes
  const value = parseInt(match[1]);
  const unit = match[2];
  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    default:
      return 900000;
  }
}
