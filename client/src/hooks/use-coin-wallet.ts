import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { getAuthBaseUrl } from "@/lib/api-config";

export interface CoinBalance {
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
  recent: CoinTransaction[];
}

export interface CoinTransaction {
  id: string;
  user_id: string;
  platform_id: string | null;
  type: "purchase" | "debit" | "refund" | "admin_grant" | "monthly_top_up" | "expiry" | "signup_bonus";
  amount: number;
  feature_key: string | null;
  reference_id: string | null;
  balance_after: number;
  created_at: string;
  metadata: Record<string, any>;
}

export interface CoinPack {
  id: string;
  name: string;
  coin_amount: number;
  bonus_coins: number;
  price_inr_paise: number;
  sort_order: number;
}

const BALANCE_KEY = ["coin-wallet", "balance"];
const TXNS_KEY    = (offset: number) => ["coin-wallet", "transactions", offset];
const PACKS_KEY   = ["coin-wallet", "packs"];

export function useCoinBalance() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<{ data: CoinBalance }>({
    queryKey: BALANCE_KEY,
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/coins/balance`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Failed to fetch coin balance");
      return r.json();
    },
    enabled: !!token,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useCoinTransactions(limit = 20, offset = 0) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<{ data: CoinTransaction[]; meta: { total: number; limit: number; offset: number } }>({
    queryKey: TXNS_KEY(offset),
    queryFn: async () => {
      const r = await fetch(
        `${baseUrl}/api/coins/transactions?limit=${limit}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!r.ok) throw new Error("Failed to fetch transactions");
      return r.json();
    },
    enabled: !!token,
    staleTime: 15_000,
  });
}

export function useCoinPacks() {
  const baseUrl = getAuthBaseUrl();

  return useQuery<{ data: CoinPack[] }>({
    queryKey: PACKS_KEY,
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/coins/packs`);
      if (!r.ok) throw new Error("Failed to fetch packs");
      return r.json();
    },
    staleTime: 5 * 60_000,
  });
}

// ─── Admin hooks ─────────────────────────────────────────────────────────────

export interface FeatureCost {
  feature_key: string;
  cost: number;
  description: string | null;
  is_active: boolean;
}

export interface AdminCoinPack {
  id: string;
  name: string;
  coin_amount: number;
  bonus_coins: number;
  price_inr_paise: number;
  is_active: boolean;
  sort_order: number;
}

const ADMIN_PACKS_KEY    = ["admin", "coin-packs"];
const ADMIN_FEATURES_KEY = ["admin", "feature-costs"];
const ADMIN_STATS_KEY    = ["admin", "coin-stats"];

export function useAdminCoinPacks() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  return useQuery<{ data: AdminCoinPack[] }>({
    queryKey: ADMIN_PACKS_KEY,
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/admin/coins/packs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Failed to load packs");
      return r.json();
    },
    enabled: !!token,
    staleTime: 30_000,
  });
}

export function useCreateCoinPack() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string; coin_amount: number; bonus_coins: number;
      price_inr_paise: number; sort_order: number;
    }) => {
      const r = await fetch(`${baseUrl}/api/admin/coins/packs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.message || "Failed to create pack");
      }
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_PACKS_KEY }),
  });
}

export function useUpdateCoinPack() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<{
      name: string; coin_amount: number; bonus_coins: number;
      price_inr_paise: number; sort_order: number; is_active: boolean;
    }> }) => {
      const r = await fetch(`${baseUrl}/api/admin/coins/packs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.message || "Failed to update pack");
      }
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_PACKS_KEY }),
  });
}

export function useDeleteCoinPack() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`${baseUrl}/api/admin/coins/packs/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.message || "Failed to delete pack");
      }
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_PACKS_KEY }),
  });
}

export function useFeatureCosts() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  return useQuery<{ data: FeatureCost[] }>({
    queryKey: ADMIN_FEATURES_KEY,
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/admin/coins/feature-costs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Failed to load feature costs");
      return r.json();
    },
    enabled: !!token,
    staleTime: 30_000,
  });
}

export function useUpdateFeatureCost() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      key,
      cost,
      description,
      is_active,
    }: {
      key: string;
      cost: number;
      description?: string;
      is_active?: boolean;
    }) => {
      const r = await fetch(`${baseUrl}/api/admin/coins/feature-costs/${encodeURIComponent(key)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cost, description, is_active }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.message || "Failed to update");
      }
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_FEATURES_KEY }),
  });
}

// ─── Coin pricing (single ₹/coin rate) ───────────────────────────────────────

export interface CoinPricing {
  paise_per_coin: number;
  signup_bonus_coins: number;
  updated_at: string;
}

const PRICING_KEY = ["coin-wallet", "pricing"];

export function useCoinPricing() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  return useQuery<{ data: CoinPricing }>({
    queryKey: PRICING_KEY,
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/coins/pricing`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Failed to load coin pricing");
      return r.json();
    },
    enabled: !!token,
    staleTime: 60_000,
  });
}

export function useUpdateCoinPricing() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ paise_per_coin }: { paise_per_coin: number }) => {
      const r = await fetch(`${baseUrl}/api/admin/coins/pricing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ paise_per_coin }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.message || "Failed to update pricing");
      }
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PRICING_KEY }),
  });
}

export function useUpdateSignupBonus() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ signup_bonus_coins }: { signup_bonus_coins: number }) => {
      const r = await fetch(`${baseUrl}/api/admin/coins/signup-bonus`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ signup_bonus_coins }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.message || "Failed to update signup bonus");
      }
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PRICING_KEY }),
  });
}

export interface CoinStats {
  coins_issued_24h: number;
  coins_spent_24h: number;
  txns_24h: number;
  active_users_24h: number;
  pending_intents: number;
  paid_24h: number;
  revenue_paise_24h: number;
  active_platforms: number;
  total_platforms: number;
}

export function useAdminCoinStats() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  return useQuery<{ data: CoinStats }>({
    queryKey: ADMIN_STATS_KEY,
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/admin/coins/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Failed to load stats");
      return r.json();
    },
    enabled: !!token,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

/** Used by admin pages to grant coins to a user. */
export function useAdminGrantCoins() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      amount,
      reason,
    }: {
      userId: string;
      amount: number;
      reason?: string;
    }) => {
      const r = await fetch(`${baseUrl}/api/admin/coins/grant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: userId, amount, reason }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message || "Failed to grant coins");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BALANCE_KEY });
    },
  });
}
