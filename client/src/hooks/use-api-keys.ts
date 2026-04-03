import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { getAuthBaseUrl } from "@/lib/api-config";

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  tier: "basic" | "premium" | "enterprise";
  keyType: "standard" | "admin";
  rateLimitPerMinute: number;
  rateLimitPerHour: number;
  rateLimitPerDay: number;
  allowedOrigins: string[];
  allowedEndpoints: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreateKeyResponse {
  key: string; // Full key shown ONCE
  apiKey: ApiKey;
}

/**
 * Fetch all API keys for the current user.
 */
export function useApiKeys() {
  const { isAuthenticated, token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<ApiKey[]>({
    queryKey: ["api-keys"],
    queryFn: async (): Promise<ApiKey[]> => {
      const response = await fetch(`${baseUrl}/api/developer/keys`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch API keys");
      const envelope = await response.json();
      return envelope.data ?? envelope.keys ?? [];
    },
    enabled: isAuthenticated && !!token,
    staleTime: 30_000,
  });
}

/**
 * Create a new API key.
 */
export function useCreateApiKey() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation<CreateKeyResponse, Error, { name: string; allowedOrigins?: string[] }>({
    mutationFn: async ({ name, allowedOrigins }) => {
      const response = await fetch(`${baseUrl}/api/developer/keys`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, allowedOrigins }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message ?? "Failed to create API key");
      }
      const envelope = await response.json();
      return envelope.data ?? envelope;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}

/**
 * Update an API key (name, allowed origins).
 */
export function useUpdateApiKey() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation<ApiKey, Error, { keyId: string; name?: string; allowedOrigins?: string[] }>({
    mutationFn: async ({ keyId, ...body }) => {
      const response = await fetch(`${baseUrl}/api/developer/keys/${keyId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message ?? "Failed to update API key");
      }
      const envelope = await response.json();
      return envelope.data ?? envelope;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}

/**
 * Revoke an API key.
 */
export function useRevokeApiKey() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation<void, Error, string>({
    mutationFn: async (keyId) => {
      const response = await fetch(`${baseUrl}/api/developer/keys/${keyId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message ?? "Failed to revoke API key");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}

/**
 * Reveal the full API key (decrypts on server).
 */
export function useRevealKey() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useMutation<{ key: string }, Error, string>({
    mutationFn: async (keyId) => {
      const response = await fetch(`${baseUrl}/api/developer/keys/${keyId}/reveal`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message ?? "Failed to reveal API key");
      }
      const envelope = await response.json();
      return envelope.data ?? envelope;
    },
  });
}

/**
 * Rotate an API key (generates new key, revokes old).
 */
export function useRotateApiKey() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation<CreateKeyResponse, Error, string>({
    mutationFn: async (keyId) => {
      const response = await fetch(`${baseUrl}/api/developer/keys/${keyId}/rotate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message ?? "Failed to rotate API key");
      }
      const envelope = await response.json();
      return envelope.data ?? envelope;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}
