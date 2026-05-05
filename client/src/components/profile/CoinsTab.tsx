import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Coins, Loader2, ShoppingCart, Plus } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCoinBalance,
  useCoinPacks,
  useCoinPricing,
  useCoinTransactions,
  type CoinTransaction,
} from "@/hooks/use-coin-wallet";
import { useCheckout, openCashfreeCheckout, useVerifyPayment } from "@/hooks/use-checkout";

const TXN_TYPE_LABEL: Record<CoinTransaction["type"], string> = {
  purchase: "Purchase",
  debit: "Debit",
  refund: "Refund",
  admin_grant: "Admin grant",
  monthly_top_up: "Monthly top-up",
  expiry: "Expiry",
  signup_bonus: "Signup bonus",
};

const TXN_TYPE_VARIANT: Record<CoinTransaction["type"], "default" | "secondary" | "destructive" | "outline"> = {
  purchase: "default",
  debit: "destructive",
  refund: "secondary",
  admin_grant: "secondary",
  monthly_top_up: "secondary",
  expiry: "outline",
  signup_bonus: "default",
};

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function BalanceCard() {
  const { data, isLoading } = useCoinBalance();
  const balance = data?.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-5 w-5 text-primary" />
          Coin balance
        </CardTitle>
        <CardDescription>
          Coins are debited per gated feature use. See ledger below for every credit and debit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Current</p>
              <p className="text-3xl font-semibold font-mono text-primary">
                {(balance?.balance ?? 0).toLocaleString("en-IN")}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Lifetime earned</p>
              <p className="text-2xl font-semibold font-mono text-positive">
                {(balance?.lifetime_earned ?? 0).toLocaleString("en-IN")}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Lifetime spent</p>
              <p className="text-2xl font-semibold font-mono text-muted-foreground">
                {(balance?.lifetime_spent ?? 0).toLocaleString("en-IN")}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BuyCoinsPanel() {
  const { data: packsData, isLoading: packsLoading } = useCoinPacks();
  const { data: pricingData } = useCoinPricing();
  const checkout = useCheckout();
  const [customQty, setCustomQty] = useState<string>("");
  const [activePackId, setActivePackId] = useState<string | null>(null);

  const packs = packsData?.data ?? [];
  const paisePerCoin = pricingData?.data.paise_per_coin ?? 100;

  const customPaise = useMemo(() => {
    const n = parseInt(customQty, 10);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n * paisePerCoin;
  }, [customQty, paisePerCoin]);

  const handlePackBuy = async (packId: string, packName: string) => {
    setActivePackId(packId);
    try {
      const session = await checkout.mutateAsync({ kind: "coin_pack", productId: packId });
      openCashfreeCheckout(session.payment_session_id);
    } catch (err: any) {
      toast.error(err.message ?? `Failed to start checkout for ${packName}`);
    } finally {
      setActivePackId(null);
    }
  };

  const handleCustomBuy = async () => {
    const n = parseInt(customQty, 10);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter a positive number of coins");
      return;
    }
    try {
      const session = await checkout.mutateAsync({ kind: "custom_coins", quantity: n });
      openCashfreeCheckout(session.payment_session_id);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to start checkout");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-primary" />
          Buy coins
        </CardTitle>
        <CardDescription>
          Pick a pack, or enter a custom amount. All purchases go through Cashfree.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Packs */}
        {packsLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : packs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No packs available.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {packs.map((pack) => {
              const total = pack.coin_amount + pack.bonus_coins;
              const effectiveRate = pack.price_inr_paise / total;
              const isLoading = activePackId === pack.id;
              return (
                <Card key={pack.id} className="border-primary/20">
                  <CardContent className="p-4 space-y-2">
                    <p className="text-sm font-semibold">{pack.name}</p>
                    <p className="text-2xl font-mono font-semibold text-primary">
                      {total.toLocaleString("en-IN")} <span className="text-xs text-muted-foreground">coins</span>
                    </p>
                    {pack.bonus_coins > 0 && (
                      <p className="text-xs text-positive">
                        +{pack.bonus_coins} bonus on {pack.coin_amount}
                      </p>
                    )}
                    <p className="text-sm font-mono">{formatRupees(pack.price_inr_paise)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      ≈ {formatRupees(effectiveRate)} / coin
                    </p>
                    <Button
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => handlePackBuy(pack.id, pack.name)}
                      disabled={isLoading}
                    >
                      {isLoading && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                      Buy
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Custom amount */}
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium">Custom amount</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Rate: {formatRupees(paisePerCoin)} per coin (set by admin)
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="custom-coins-qty">Coins</Label>
              <Input
                id="custom-coins-qty"
                type="number"
                min={1}
                max={100000}
                value={customQty}
                onChange={(e) => setCustomQty(e.target.value)}
                className="w-32 font-mono"
                placeholder="e.g. 250"
              />
            </div>
            <div className="pb-2">
              <p className="text-xs text-muted-foreground">You pay</p>
              <p className="text-lg font-mono font-semibold">
                {customPaise > 0 ? formatRupees(customPaise) : "—"}
              </p>
            </div>
            <Button
              onClick={handleCustomBuy}
              disabled={checkout.isPending || customPaise === 0}
              className="ml-auto"
            >
              {checkout.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Buy
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LedgerCard() {
  const PAGE = 20;
  const [offset, setOffset] = useState(0);
  const { data, isLoading } = useCoinTransactions(PAGE, offset);
  const txns = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const showingFrom = txns.length === 0 ? 0 : offset + 1;
  const showingTo = offset + txns.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transaction ledger</CardTitle>
        <CardDescription>
          Every credit and debit, oldest entries paginated. Showing {showingFrom}–{showingTo} of {total}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : txns.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No transactions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Feature</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance after</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txns.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(t.created_at).toLocaleString("en-IN", {
                        day: "2-digit", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={TXN_TYPE_VARIANT[t.type]} className="text-[11px]">
                        {TXN_TYPE_LABEL[t.type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{t.feature_key ?? "—"}</TableCell>
                    <TableCell className={`text-right font-mono ${t.amount > 0 ? "text-positive" : t.amount < 0 ? "text-destructive" : ""}`}>
                      {t.amount > 0 ? `+${t.amount}` : t.amount}
                    </TableCell>
                    <TableCell className="text-right font-mono">{t.balance_after}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {total > PAGE && (
          <div className="flex items-center justify-between mt-4">
            <Button
              size="sm"
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={offset + PAGE >= total}
              onClick={() => setOffset(offset + PAGE)}
            >
              Next
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CoinsTab() {
  const qc = useQueryClient();
  const verify = useVerifyPayment();

  // If we landed here from a Cashfree redirect, the URL carries
  //   ?cf_order_id=<our intent.id>&cf_payment_id=<cashfree's payment id>
  // (Cashfree's `{order_id}` template substitutes the merchant order_id,
  //  which is our intent.id — the param name is misleading.)
  // Don't trust the redirect alone: poll the server's verify endpoint
  // which calls Cashfree's order-status API and credits if PAID.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const intentId = params.get("cf_order_id");
    if (!intentId) return;

    // Strip the params first so a refresh doesn't re-trigger.
    const url = new URL(window.location.href);
    url.searchParams.delete("cf_order_id");
    url.searchParams.delete("cf_payment_id");
    window.history.replaceState(null, "", url.toString());

    verify
      .mutateAsync(intentId)
      .then((data) => {
        if (data.status === "paid" && !data.already_fulfilled) {
          toast.success("Payment confirmed — coins credited.");
          qc.invalidateQueries({ queryKey: ["coin-wallet"] });
        } else if (data.status === "paid" && data.already_fulfilled) {
          toast.info("Payment already credited.");
        } else {
          toast.warning(data.message ?? `Payment status: ${data.status}. Try again in a moment.`);
        }
      })
      .catch((err: any) => {
        toast.error(err.message ?? "Could not verify payment");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <BalanceCard />
      <BuyCoinsPanel />
      <LedgerCard />
    </div>
  );
}

export default CoinsTab;
