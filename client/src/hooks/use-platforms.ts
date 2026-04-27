import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { getAuthBaseUrl } from "@/lib/api-config";

export interface Platform {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlatformApiKey {
  id: string;
  platform_id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at: string | null;
  last_used_ip: string | null;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
}

export interface CreatePlatformInput {
  slug: string;
  name: string;
  description?: string;
}

export interface UpdatePlatformInput {
  name?: string;
  description?: string | null;
  is_active?: boolean;
}

export interface CreatedPlatformKey {
  data: PlatformApiKey;
  publicKey: string;
  secret: string;
}

const platformsKey = ["admin-platforms"];
const platformKeysKey = (id: string) => ["admin-platforms", id, "keys"];

export function usePlatforms() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<{ data: Platform[] }>({
    queryKey: platformsKey,
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/admin/platforms`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Failed to load platforms");
      return r.json();
    },
    enabled: !!token,
    staleTime: 30_000,
  });
}

export function useCreatePlatform() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePlatformInput) => {
      const r = await fetch(`${baseUrl}/api/admin/platforms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(input),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create platform");
      }
      return r.json() as Promise<{ data: Platform }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformsKey });
    },
  });
}

export function useUpdatePlatform() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdatePlatformInput }) => {
      const r = await fetch(`${baseUrl}/api/admin/platforms/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message || "Failed to update platform");
      }
      return r.json() as Promise<{ data: Platform }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformsKey });
    },
  });
}

export function usePlatformKeys(platformId: string | null) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<{ data: PlatformApiKey[] }>({
    queryKey: platformId ? platformKeysKey(platformId) : ["admin-platforms", "noop"],
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/admin/platforms/${platformId}/keys`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Failed to load keys");
      return r.json();
    },
    enabled: !!token && !!platformId,
    staleTime: 15_000,
  });
}

export function useCreatePlatformKey() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ platformId, name }: { platformId: string; name: string }) => {
      const r = await fetch(`${baseUrl}/api/admin/platforms/${platformId}/keys`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create key");
      }
      return r.json() as Promise<CreatedPlatformKey>;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: platformKeysKey(vars.platformId) });
    },
  });
}

export function useRevokePlatformKey() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      platformId,
      keyId,
      reason,
    }: {
      platformId: string;
      keyId: string;
      reason?: string;
    }) => {
      const r = await fetch(`${baseUrl}/api/admin/platforms/keys/${keyId}/revoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message || "Failed to revoke key");
      }
      return r.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: platformKeysKey(vars.platformId) });
    },
  });
}
