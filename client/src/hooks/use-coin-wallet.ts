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
  type: "purchase" | "debit" | "refund" | "admin_grant" | "monthly_top_up" | "expiry";
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
