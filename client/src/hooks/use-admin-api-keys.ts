import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { getAuthBaseUrl } from "@/lib/api-config";

export interface AdminApiKey {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  tier: "basic" | "premium" | "enterprise";
  keyType: "standard" | "admin";
  rateLimitPerMinute: number;
  rateLimitPerHour: number;
  rateLimitPerDay: number;
  allowedOrigins: string[];
  allowedIps: string[];
  allowedEndpoints: string[];
  createdBy: string | null;
  description: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  createdAt: string;
  updatedAt: string;
  userEmail?: string;
  userName?: string;
}

export interface AdminApiKeyStats {
  totalKeys: number;
  activeKeys: number;
  enterpriseKeys: number;
  adminKeys: number;
}

export interface AdminApiKeyFilters {
  search?: string;
  userId?: string;
  tier?: string;
  keyType?: string;
  isActive?: string;
  page?: number;
  limit?: number;
}

interface ListResponse {
  data: AdminApiKey[];
  meta: { count: number; total: number; page: number; limit: number; has_more: boolean };
}

/**
 * List all API keys (admin).
 */
export function useAdminApiKeys(filters: AdminApiKeyFilters = {}) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<ListResponse>({
    queryKey: ["admin-api-keys", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.userId) params.set("user_id", filters.userId);
      if (filters.tier) params.set("tier", filters.tier);
      if (filters.keyType) params.set("key_type", filters.keyType);
      if (filters.isActive) params.set("is_active", filters.isActive);
      if (filters.page) params.set("page", String(filters.page));
      if (filters.limit) params.set("limit", String(filters.limit));

      const response = await fetch(`${baseUrl}/api/admin/api-keys?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch API keys");
      return response.json();
    },
    enabled: !!token,
    staleTime: 15_000,
  });
}

/**
 * Get aggregate stats for API keys.
 */
export function useAdminApiKeyStats() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<AdminApiKeyStats>({
    queryKey: ["admin-api-key-stats"],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/admin/api-keys/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch stats");
      const envelope = await response.json();
      return envelope.data ?? envelope;
    },
    enabled: !!token,
    staleTime: 30_000,
  });
}

/**
 * Create admin/enterprise API key.
 */
export function useAdminCreateApiKey() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation<
    { data: { key: string; apiKey: AdminApiKey } },
    Error,
    {
      userId: string;
      name: string;
      description?: string;
      tier?: string;
      rateLimitPerMinute?: number;
      rateLimitPerHour?: number;
      rateLimitPerDay?: number;
      allowedIps?: string[];
      allowedEndpoints?: string[];
      allowedOrigins?: string[];
      expiresAt?: string;
    }
  >({
    mutationFn: async (body) => {
      const response = await fetch(`${baseUrl}/api/admin/api-keys`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message ?? "Failed to create API key");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["admin-api-key-stats"] });
    },
  });
}

/**
 * Update an API key (admin).
 */
export function useAdminUpdateApiKey() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation<
    { data: AdminApiKey },
    Error,
    { keyId: string; updates: Record<string, any> }
  >({
    mutationFn: async ({ keyId, updates }) => {
      const response = await fetch(`${baseUrl}/api/admin/api-keys/${keyId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message ?? "Failed to update API key");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-api-keys"] });
    },
  });
}

/**
 * Revoke an API key (admin).
 */
export function useAdminRevokeApiKey() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation<void, Error, { keyId: string; reason?: string }>({
    mutationFn: async ({ keyId, reason }) => {
      const response = await fetch(`${baseUrl}/api/admin/api-keys/${keyId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message ?? "Failed to revoke API key");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["admin-api-key-stats"] });
    },
  });
}
