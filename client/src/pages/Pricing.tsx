import { useState } from "react";
import { Check, Coins, Zap, Crown, Lock } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/hooks/useAuth";
import { useCoinPacks } from "@/hooks/use-coin-wallet";
import { useCheckout, openCashfreeCheckout } from "@/hooks/use-checkout";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { fadeInUp, easeOut } from "@/lib/motion";
import { toast } from "sonner";
import { Eyebrow } from "@/components/ui/eyebrow";

// ─── Plan definitions (matches subscription_plans seed in migration 025) ──────

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    billingNote: "Forever free",
    tier: "free",
    colorClass: "border-border/50",
    badge: null as string | null,
    features: [
      "Home dashboard & market overview",
      "Stock browser (3,000+ NSE stocks)",
      "Market indices (57 indices)",
      "Basic news feed",
      "Market mood (Fear & Greed)",
    ],
    locked: [
      "Strategy backtesting",
      "Expert screener",
      "AI sentiment analysis",
      "Equity Pro AI chat",
    ],
  },
  {
    id: "semi_monthly",
    name: "Semi",
    price: 299,
    billingNote: "/ month",
    tier: "semi",
    colorClass: "border-primary/60",
    badge: "Popular" as string | null,
    features: [
      "Everything in Free",
      "100 coins / month included",
      "Strategy backtesting (5 coins / run)",
      "Expert screener (2 coins / run)",
      "AI sentiment analysis (3 coins / run)",
      "Saved screener history",
      "Premium news depth",
    ],
    locked: ["Equity Pro AI chat (Pro only)"],
  },
  {
    id: "pro_monthly",
    name: "Pro",
    price: 999,
    billingNote: "/ month",
    tier: "pro",
    colorClass: "border-amber-500/60",
    badge: "Unlimited" as string | null,
    features: [
      "Everything in Semi",
      "No coin debits — everything free",
      "Unlimited backtesting",
      "Unlimited screener runs",
      "Unlimited AI sentiment",
      "Equity Pro AI chat",
      "Priority support",
    ],
    locked: [],
  },
] as const;

function PlanCard({
  plan,
  currentTier,
  onUpgrade,
  isLoading,
}: {
  plan: (typeof PLANS)[number];
  currentTier: string | null;
  onUpgrade: (planId: string) => void;
  isLoading: boolean;
}) {
  const isCurrent = currentTier === plan.tier;
  const canUpgrade =
    (currentTier === "free" && (plan.tier === "semi" || plan.tier === "pro")) ||
    (currentTier === "semi" && plan.tier === "pro");

  return (
    <div
      className={cn(
        "relative rounded-2xl border-2 p-6 flex flex-col gap-5 bg-card",
        "transition-shadow hover:shadow-md",
        plan.colorClass,
        isCurrent && "ring-2 ring-primary/40",
      )}
    >
      {plan.badge && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground rounded-full px-4">
          {plan.badge}
        </Badge>
      )}

      <div>
        <div className="flex items-center gap-2 mb-1">
          {plan.tier === "pro"  && <Crown className="h-4 w-4 text-amber-500" />}
          {plan.tier === "semi" && <Zap    className="h-4 w-4 text-primary"   />}
          <h3 className="text-xl font-semibold">{plan.name}</h3>
        </div>
        <div className="flex items-baseline gap-1">
          {plan.price === 0 ? (
            <span className="text-3xl font-bold">₹0</span>
          ) : (
            <>
              <span className="text-3xl font-bold font-mono tabular-nums">₹{plan.price}</span>
              <span className="text-sm text-muted-foreground">{plan.billingNote}</span>
            </>
          )}
        </div>
      </div>

      <ul className="space-y-2 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <Check className="h-4 w-4 text-positive shrink-0 mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
        {plan.locked.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <Button variant="secondary" disabled className="rounded-full w-full">
          Current plan
        </Button>
      ) : plan.price === 0 ? (
        <Button asChild variant="outline" className="rounded-full w-full">
          <Link href="/signup">Get started free</Link>
        </Button>
      ) : (
        <Button
          className="rounded-full w-full"
          variant={plan.tier === "pro" ? "default" : "outline"}
          disabled={isLoading || !canUpgrade}
          onClick={() => onUpgrade(plan.id)}
        >
          {isLoading ? "Redirecting…" : canUpgrade ? `Upgrade to ${plan.name}` : "Contact support to downgrade"}
        </Button>
      )}
    </div>
  );
}

function CoinPackCard({
  pack,
  onBuy,
  isLoading,
}: {
  pack: { id: string; name: string; coin_amount: number; bonus_coins: number; price_inr_paise: number };
  onBuy: (packId: string) => void;
  isLoading: boolean;
}) {
  const total    = pack.coin_amount + pack.bonus_coins;
  const priceRs  = pack.price_inr_paise / 100;
  const perCoin  = (priceRs / total).toFixed(2);

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 flex flex-col gap-4 hover:border-primary/40 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="h-5 w-5 text-primary" />
          <span className="font-semibold">{pack.name}</span>
        </div>
        {pack.bonus_coins > 0 && (
          <Badge variant="secondary" className="text-xs rounded-full">
            +{pack.bonus_coins} bonus
          </Badge>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold font-mono tabular-nums">
          {total.toLocaleString("en-IN")}
        </p>
        <p className="text-xs text-muted-foreground">coins · ₹{perCoin}/coin</p>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold">₹{priceRs}</span>
        <Button size="sm" className="rounded-full" disabled={isLoading} onClick={() => onBuy(pack.id)}>
          Buy
        </Button>
      </div>
    </div>
  );
}

export default function Pricing() {
  const { isAuthenticated, user } = useAuth();
  const { data: packsData, isLoading: packsLoading } = useCoinPacks();
  const checkout = useCheckout();
  const [loadingProduct, setLoadingProduct] = useState<string | null>(null);

  const currentTier = user?.tier ?? null;

  const handleCheckout = async (kind: "plan" | "coin_pack", productId: string) => {
    if (!isAuthenticated) {
      window.location.href = `/login?returnUrl=/pricing`;
      return;
    }
    setLoadingProduct(productId);
    try {
      const result = await checkout.mutateAsync({ kind, productId });
      openCashfreeCheckout(result.payment_session_id);
    } catch (err: any) {
      toast.error(err.message || "Could not open payment. Try again.");
    } finally {
      setLoadingProduct(null);
    }
  };

  return (
    <>
      <SEO
        title="Pricing — EquityPro"
        description="Free, Semi, and Pro plans for Indian stock market analysis. Buy coins for individual feature access."
        canonical="/pricing"
      />
      <div className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-10 md:py-16 space-y-16">

          {/* Header — eyebrow + display H1 + muted byline */}
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            transition={easeOut}
            className="text-center space-y-3"
          >
            <div className="flex justify-center">
              <Eyebrow tone="gold" rule>
                Pricing
              </Eyebrow>
            </div>
            <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
              Pick your <em className="italic font-bold">plan</em>
            </h1>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Free forever. Pay only for what you use with coins, or go unlimited with Pro.
            </p>
          </motion.div>

          {/* Plan cards */}
          <section>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {PLANS.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  currentTier={currentTier}
                  onUpgrade={(id) => handleCheckout("plan", id)}
                  isLoading={loadingProduct === plan.id}
                />
              ))}
            </div>
          </section>

          {/* Coin packs */}
          <section>
            <div className="mb-6 text-center space-y-2">
              <div className="flex justify-center">
                <Eyebrow tone="gold" rule>
                  Coin Packs
                </Eyebrow>
              </div>
              <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
                Pay per use
              </h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Buy coins once, spend across all platforms. Coins never expire.
              </p>
            </div>

            {packsLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {(packsData?.data ?? []).map((pack) => (
                  <CoinPackCard
                    key={pack.id}
                    pack={pack}
                    onBuy={(id) => handleCheckout("coin_pack", id)}
                    isLoading={loadingProduct === pack.id}
                  />
                ))}
              </div>
            )}

            {/* Coin cost reference */}
            <div className="mt-6 rounded-2xl border border-border/50 bg-muted/20 p-5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                Coin costs per use (Semi tier)
              </p>
              <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <span><span className="font-mono font-semibold">5</span> coins — Strategy backtest</span>
                <span><span className="font-mono font-semibold">2</span> coins — Expert screener</span>
                <span><span className="font-mono font-semibold">3</span> coins — AI sentiment (per stock)</span>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Pro tier: zero coin debits on all features.
              </p>
            </div>
          </section>

        </div>
      </div>
    </>
  );
}
