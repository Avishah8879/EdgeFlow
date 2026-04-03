import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { getAuthBaseUrl } from "@/lib/api-config";
import type { UserRole, UserTier } from "@/lib/auth";

// Types for admin user management
export interface AdminUser {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
  role: UserRole;
  tier: UserTier;
  provider: "password" | "google";
  isActive: boolean;
  isLocked: boolean;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  failedAttempts: number;
  lockedUntil: string | null;
}

export interface UsersListResponse {
  users: AdminUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface UsersFilters {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole;
  tier?: UserTier;
  status?: "active" | "locked" | "inactive";
  sortBy?: "created_at" | "last_login" | "email" | "username";
  sortOrder?: "asc" | "desc";
}

/**
 * Hook to fetch paginated list of users for admin.
 */
export function useAdminUsers(filters: UsersFilters = {}) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  const queryParams = new URLSearchParams();
  if (filters.page) queryParams.set("page", String(filters.page));
  if (filters.limit) queryParams.set("limit", String(filters.limit));
  if (filters.search) queryParams.set("search", filters.search);
  if (filters.role) queryParams.set("role", filters.role);
  if (filters.tier) queryParams.set("tier", filters.tier);
  if (filters.status) queryParams.set("status", filters.status);
  if (filters.sortBy) queryParams.set("sortBy", filters.sortBy);
  if (filters.sortOrder) queryParams.set("sortOrder", filters.sortOrder);

  return useQuery<UsersListResponse>({
    queryKey: ["admin-users", filters],
    queryFn: async (): Promise<UsersListResponse> => {
      const url = `${baseUrl}/api/admin/users?${queryParams.toString()}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch users");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch a single user by ID.
 */
export function useAdminUser(userId: string) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<AdminUser>({
    queryKey: ["admin-user", userId],
    queryFn: async (): Promise<AdminUser> => {
      const response = await fetch(`${baseUrl}/api/admin/users/${userId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch user");
      }

      const data = await response.json();
      return data.user;
    },
    enabled: !!token && !!userId,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to update a user's role.
 */
export function useUpdateUserRole() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: UserRole }) => {
      const response = await fetch(`${baseUrl}/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update user role");
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user", variables.userId] });
      // Invalidate user-facing queries so changes propagate immediately
      queryClient.invalidateQueries({ queryKey: ["user-subscription"] });
      queryClient.invalidateQueries({ queryKey: ["usage-limits"] });
    },
  });
}

/**
 * Hook to update a user's tier.
 */
export function useUpdateUserTier() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async ({ userId, tier }: { userId: string; tier: UserTier }) => {
      const response = await fetch(`${baseUrl}/api/admin/users/${userId}/tier`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tier }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update user tier");
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user", variables.userId] });
      // Invalidate user-facing queries so tier changes propagate immediately
      queryClient.invalidateQueries({ queryKey: ["user-subscription"] });
      queryClient.invalidateQueries({ queryKey: ["usage-limits"] });
      queryClient.invalidateQueries({ queryKey: ["trial-eligibility"] });
    },
  });
}

/**
 * Hook to unlock a locked user account.
 */
export function useUnlockUser() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(`${baseUrl}/api/admin/users/${userId}/unlock`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to unlock user");
      }

      return response.json();
    },
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user", userId] });
    },
  });
}

/**
 * Hook to revoke all sessions for a user.
 */
export function useRevokeUserSessions() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(`${baseUrl}/api/admin/users/${userId}/sessions`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to revoke sessions");
      }

      return response.json();
    },
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: ["admin-user", userId] });
    },
  });
}

/**
 * Hook to update user details (name, email, etc.)
 */
export function useUpdateUser() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async ({
      userId,
      updates,
    }: {
      userId: string;
      updates: Partial<Pick<AdminUser, "name" | "username" | "email" | "isActive">>;
    }) => {
      const response = await fetch(`${baseUrl}/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update user");
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user", variables.userId] });
    },
  });
}

/**
 * Hook to bulk update tier for multiple users.
 */
export function useBulkUpdateTier() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async ({ userIds, tier }: { userIds: string[]; tier: UserTier }) => {
      const response = await fetch(`${baseUrl}/api/admin/users/bulk/tier`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userIds, tier }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to bulk update tier");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      // Invalidate user-facing queries so tier changes propagate immediately
      queryClient.invalidateQueries({ queryKey: ["user-subscription"] });
      queryClient.invalidateQueries({ queryKey: ["usage-limits"] });
      queryClient.invalidateQueries({ queryKey: ["trial-eligibility"] });
    },
  });
}

/**
 * Hook to bulk revoke sessions for multiple users.
 */
export function useBulkRevokeSessions() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async (userIds: string[]) => {
      const response = await fetch(`${baseUrl}/api/admin/users/bulk/sessions`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userIds }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to bulk revoke sessions");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
}

/**
 * Hook to export users as CSV.
 */
export function useExportUsers() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async (userIds?: string[]) => {
      const response = await fetch(`${baseUrl}/api/admin/users/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userIds }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to export users");
      }

      return response.blob();
    },
  });
}
