import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { getAuthBaseUrl } from "@/lib/api-config";

// Types for feature flags
export interface FeatureFlag {
  id: number;
  key: string;
  name: string;
  description: string | null;
  isEnabled: boolean;
  targetTiers: string[] | null;
  targetRoles: string[] | null;
  rolloutPercentage: number;
  startsAt: string | null;
  expiresAt: string | null;
  category: string;
  createdAt: string;
  updatedAt: string;
  overridesCount?: number;
}

export interface FeatureFlagOverride {
  id: number;
  flagId: number;
  userId: string;
  userEmail: string;
  userName: string | null;
  isEnabled: boolean;
  reason: string | null;
  expiresAt: string | null;
  createdByEmail: string;
  createdAt: string;
}

export interface FlagAuditEntry {
  id: number;
  action: string;
  oldValue: Record<string, any> | null;
  newValue: Record<string, any> | null;
  ipAddress: string | null;
  createdAt: string;
  adminEmail: string;
}

export interface FlagCategory {
  name: string;
  count: number;
}

/**
 * Hook to fetch all feature flags.
 */
export function useFeatureFlags(category?: string) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  const queryParams = new URLSearchParams();
  if (category) queryParams.set("category", category);

  return useQuery<{ flags: FeatureFlag[] }>({
    queryKey: ["admin-feature-flags", category],
    queryFn: async () => {
      const url = `${baseUrl}/api/admin/feature-flags${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch feature flags");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to fetch a single feature flag.
 */
export function useFeatureFlag(id: number) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<{ flag: FeatureFlag }>({
    queryKey: ["admin-feature-flag", id],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/admin/feature-flags/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch feature flag");
      }

      return response.json();
    },
    enabled: !!token && !!id,
    staleTime: 60 * 1000,
  });
}

/**
 * Hook to fetch feature flag categories.
 */
export function useFeatureFlagCategories() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<{ categories: FlagCategory[] }>({
    queryKey: ["admin-feature-flag-categories"],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/admin/feature-flags/categories`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch categories");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to create a new feature flag.
 */
export function useCreateFeatureFlag() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async (data: {
      key: string;
      name: string;
      description?: string;
      isEnabled?: boolean;
      targetTiers?: string[];
      targetRoles?: string[];
      rolloutPercentage?: number;
      startsAt?: string;
      expiresAt?: string;
      category?: string;
    }) => {
      const response = await fetch(`${baseUrl}/api/admin/feature-flags`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create feature flag");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-feature-flags"] });
      queryClient.invalidateQueries({ queryKey: ["admin-feature-flag-categories"] });
    },
  });
}

/**
 * Hook to update a feature flag.
 */
export function useUpdateFeatureFlag() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: number;
      name?: string;
      description?: string;
      isEnabled?: boolean;
      targetTiers?: string[] | null;
      targetRoles?: string[] | null;
      rolloutPercentage?: number;
      startsAt?: string | null;
      expiresAt?: string | null;
      category?: string;
    }) => {
      const response = await fetch(`${baseUrl}/api/admin/feature-flags/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update feature flag");
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-feature-flags"] });
      queryClient.invalidateQueries({ queryKey: ["admin-feature-flag", variables.id] });
      // Invalidate user-facing feature flags so changes propagate immediately
      queryClient.invalidateQueries({ queryKey: ["user-feature-flags"] });
    },
  });
}

/**
 * Hook to toggle a feature flag.
 */
export function useToggleFeatureFlag() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`${baseUrl}/api/admin/feature-flags/${id}/toggle`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to toggle feature flag");
      }

      return response.json();
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["admin-feature-flags"] });
      queryClient.invalidateQueries({ queryKey: ["admin-feature-flag", id] });
      // Invalidate user-facing feature flags so changes propagate immediately
      queryClient.invalidateQueries({ queryKey: ["user-feature-flags"] });
    },
  });
}

/**
 * Hook to delete a feature flag.
 */
export function useDeleteFeatureFlag() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`${baseUrl}/api/admin/feature-flags/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete feature flag");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-feature-flags"] });
      queryClient.invalidateQueries({ queryKey: ["admin-feature-flag-categories"] });
    },
  });
}

/**
 * Hook to fetch overrides for a flag.
 */
export function useFeatureFlagOverrides(flagId: number) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<{ overrides: FeatureFlagOverride[] }>({
    queryKey: ["admin-feature-flag-overrides", flagId],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/admin/feature-flags/${flagId}/overrides`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch overrides");
      }

      return response.json();
    },
    enabled: !!token && !!flagId,
    staleTime: 60 * 1000,
  });
}

/**
 * Hook to create an override.
 */
export function useCreateFlagOverride() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async ({
      flagId,
      userId,
      isEnabled,
      reason,
      expiresAt,
    }: {
      flagId: number;
      userId: string;
      isEnabled: boolean;
      reason?: string;
      expiresAt?: string;
    }) => {
      const response = await fetch(`${baseUrl}/api/admin/feature-flags/${flagId}/overrides`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId, isEnabled, reason, expiresAt }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create override");
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-feature-flag-overrides", variables.flagId] });
      queryClient.invalidateQueries({ queryKey: ["admin-feature-flag", variables.flagId] });
      // Invalidate user-facing feature flags so changes propagate immediately
      queryClient.invalidateQueries({ queryKey: ["user-feature-flags"] });
    },
  });
}

/**
 * Hook to delete an override.
 */
export function useDeleteFlagOverride() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async ({ overrideId, flagId }: { overrideId: number; flagId: number }) => {
      const response = await fetch(`${baseUrl}/api/admin/feature-flags/overrides/${overrideId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete override");
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-feature-flag-overrides", variables.flagId] });
      queryClient.invalidateQueries({ queryKey: ["admin-feature-flag", variables.flagId] });
    },
  });
}

/**
 * Hook to fetch audit log for a flag.
 */
export function useFeatureFlagAudit(flagId: number) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<{ audit: FlagAuditEntry[] }>({
    queryKey: ["admin-feature-flag-audit", flagId],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/admin/feature-flags/audit/${flagId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch audit log");
      }

      return response.json();
    },
    enabled: !!token && !!flagId,
    staleTime: 30 * 1000,
  });
}
