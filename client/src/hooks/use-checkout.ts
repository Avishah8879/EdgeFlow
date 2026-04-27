import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { getAuthBaseUrl } from "@/lib/api-config";
import { useCoinBalance } from "./use-coin-wallet";
import type { CoinPack } from "./use-coin-wallet";

export interface CheckoutResponse {
  intent_id: string;
  payment_session_id: string;
  cf_order_id: string;
  amount: number;
  currency: string;
}

export interface PaymentRecord {
  id: string;
  kind: "plan" | "coin_pack";
  product_id: string;
  amount_paise: number;
  status: "pending" | "paid" | "failed" | "expired" | "refunded";
  cashfree_order_id: string | null;
  fulfilled_at: string | null;
  created_at: string;
}

/**
 * Initiate a Cashfree checkout. Returns a payment_session_id which the
 * caller must pass to the Cashfree JS SDK to open the payment modal.
 *
 * The SDK must be loaded via a <script> tag:
 *   <script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
 */
export function useCheckout() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      kind,
      productId,
    }: {
      kind: "plan" | "coin_pack";
      productId: string;
    }): Promise<CheckoutResponse> => {
      const r = await fetch(`${baseUrl}/api/payments/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ kind, product_id: productId }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create payment order");
      }
      return (await r.json()).data;
    },
    onSuccess: () => {
      // Refresh balance in case a prior pending payment resolved
      qc.invalidateQueries({ queryKey: ["coin-wallet", "balance"] });
    },
  });
}

/** Payment history for the current user. */
export function usePaymentHistory(limit = 10) {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<{ data: PaymentRecord[] }>({
    queryKey: ["payment-history", limit],
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/payments/history?limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Failed to fetch payment history");
      return r.json();
    },
    enabled: !!token,
    staleTime: 30_000,
  });
}

/**
 * Open the Cashfree drop-in checkout. Requires the Cashfree JS SDK to be
 * loaded on the page. On success/failure the browser redirects to the
 * return_url set on the server (profile page with tab=coins).
 */
export function openCashfreeCheckout(paymentSessionId: string) {
  const cf = (window as any).Cashfree;
  if (!cf) {
    console.error("[CHECKOUT] Cashfree JS SDK not loaded");
    return;
  }
  const cashfree = cf({ mode: process.env.NODE_ENV === "production" ? "production" : "sandbox" });
  cashfree.checkout({ paymentSessionId });
}
