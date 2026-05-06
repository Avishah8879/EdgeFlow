import { Fragment, useState } from "react";
import { Check, Coins, Crown, Lock, Minus, Zap } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
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

type PlanFeatureValue = string | true | false;

interface PlanDef {
  id: string;
  name: string;
  tier: "free" | "semi" | "pro";
  price: number;
  billingNote: string;
  description: string;
  ctaLabel: string;
  ctaVariant: "ghost" | "gold" | "primary";
  featured: boolean;
  ribbon: string | null;
  features: string[];
  locked: string[];
}

const PLANS: PlanDef[] = [
  {
    id: "free",
    name: "Free",
    tier: "free",
    price: 0,
    billingNote: "Free forever · no card needed",
    description: "For investors getting their bearings on Indian markets.",
    ctaLabel: "Open free account",
    ctaVariant: "ghost",
    featured: false,
    ribbon: null,
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
    tier: "semi",
    price: 299,
    billingNote: "Per month · cancel anytime",
    description: "For serious retail investors who run research weekly.",
    ctaLabel: "Upgrade to Semi",
    ctaVariant: "gold",
    featured: true,
    ribbon: "Most popular",
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
    tier: "pro",
    price: 999,
    billingNote: "Per month · unlimited everything",
    description: "For full-time traders, advisors, and power users.",
    ctaLabel: "Upgrade to Pro",
    ctaVariant: "primary",
    featured: false,
    ribbon: null,
    features: [
      "Everything in Semi",
      "No coin debits — everything unlimited",
      "Unlimited backtesting",
      "Unlimited screener runs",
      "Unlimited AI sentiment",
      "Equity Pro AI chat",
      "Priority support",
    ],
    locked: [],
  },
];

// ─── Comparison matrix ───────────────────────────────────────────────────────

interface CompareSection {
  title: string;
  rows: Array<{
    label: string;
    free: PlanFeatureValue;
    semi: PlanFeatureValue;
    pro: PlanFeatureValue;
  }>;
}

const COMPARE: CompareSection[] = [
  {
    title: "Data & coverage",
    rows: [
      { label: "Stock universe", free: "3,000+ NSE", semi: "3,000+ NSE", pro: "3,000+ NSE" },
      { label: "Real-time prices", free: "Delayed", semi: true, pro: true },
      { label: "Market indices", free: "57 indices", semi: "57 indices", pro: "57 indices" },
      { label: "Fundamentals depth", free: "Basic", semi: "20 quarters", pro: "20 quarters" },
    ],
  },
  {
    title: "Research",
    rows: [
      { label: "Pre-built screeners", free: false, semi: true, pro: true },
      { label: "Custom expert screener", free: false, semi: "2 coins / run", pro: "Unlimited" },
      { label: "Strategy backtesting", free: false, semi: "5 coins / run", pro: "Unlimited" },
      { label: "Reverse DCF model", free: false, semi: true, pro: true },
      { label: "AI sentiment analysis", free: false, semi: "3 coins / run", pro: "Unlimited" },
    ],
  },
  {
    title: "Workspace",
    rows: [
      { label: "Saved screener history", free: false, semi: true, pro: true },
      { label: "Equity Pro AI chat", free: false, semi: false, pro: true },
      { label: "CSV export", free: false, semi: true, pro: true },
      { label: "Support", free: "Community", semi: "Email · 24h", pro: "Priority" },
    ],
  },
];

// ─── FAQ ─────────────────────────────────────────────────────────────────────

const FAQ = [
  {
    q: "Is my market data really live?",
    a: "On Semi and Pro, yes — we receive a SEBI-licensed real-time NSE feed. The Free tier shows the same data with a brief delay, fine for end-of-day investing.",
  },
  {
    q: "How do coins work?",
    a: "Semi includes 100 coins per month. Backtests cost 5, screener runs cost 2, and sentiment analyses cost 3. Buy more anytime — coins never expire and stack across months.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from your profile; you keep access until the period ends. All saved screens, backtests, and notes export as CSV before your subscription deactivates.",
  },
  {
    q: "Do you give investment advice?",
    a: "No. EquityPro is a research terminal. We publish data and tools — never recommendations on individual securities for individual users.",
  },
  {
    q: "GST and invoicing?",
    a: "All listed prices include 18% GST. Invoices are generated automatically with your GSTIN; reach out for proforma invoices or annual prepay options.",
  },
  {
    q: "What happens to coins if I cancel Semi?",
    a: "Any unused coins from your Semi subscription remain in your wallet and can still be spent on individual feature runs after you downgrade.",
  },
];

// ─── Components ──────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  currentTier,
  onUpgrade,
  isLoading,
}: {
  plan: PlanDef;
  currentTier: string | null;
  onUpgrade: (planId: string) => void;
  isLoading: boolean;
}) {
  const isCurrent = currentTier === plan.tier;
  const canUpgrade =
    (currentTier === "free" && (plan.tier === "semi" || plan.tier === "pro")) ||
    (currentTier === "semi" && plan.tier === "pro");

  const ctaClass =
    plan.ctaVariant === "gold"
      ? "bg-[hsl(var(--brand-gold))] text-white hover:bg-[hsl(var(--brand-gold))]/90"
      : plan.ctaVariant === "primary"
        ? "bg-[hsl(var(--brand-navy))] text-white hover:bg-[hsl(var(--brand-navy))]/90"
        : "";

  return (
    <div
      className={cn(
        "relative rounded-2xl bg-card p-8 flex flex-col gap-5",
        "transition-shadow duration-base",
        plan.featured
          ? "border-2 border-[hsl(var(--brand-gold))] shadow-card-lg lg:-translate-y-2"
          : "border border-border hover:shadow-card",
        isCurrent && "ring-2 ring-[hsl(var(--brand-gold))]/40",
      )}
      data-testid={`plan-card-${plan.id}`}
    >
      {plan.ribbon && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[hsl(var(--brand-gold))] text-white text-[10.5px] font-bold uppercase tracking-uppercase px-3.5 py-1 rounded-full">
          {plan.ribbon}
        </span>
      )}

      <div>
        <div className="flex items-center gap-2 mb-1">
          {plan.tier === "pro" && <Crown className="h-4 w-4 text-[hsl(var(--brand-gold))]" />}
          {plan.tier === "semi" && <Zap className="h-4 w-4 text-[hsl(var(--brand-gold))]" />}
          <h3 className="font-display text-[22px] font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
            {plan.name}
          </h3>
        </div>
        <p className="text-[13px] text-muted-foreground leading-snug min-h-[2.6em]">
          {plan.description}
        </p>
      </div>

      <div>
        <div className="font-mono text-5xl font-bold tracking-tight tabular-nums text-foreground">
          ₹{plan.price.toLocaleString("en-IN")}
          {plan.price > 0 && (
            <span className="text-sm text-muted-foreground font-medium ml-1">/mo</span>
          )}
        </div>
        <div className="text-[11.5px] text-muted-foreground mt-1.5">{plan.billingNote}</div>
      </div>

      {isCurrent ? (
        <Button variant="secondary" disabled className="rounded-full w-full" data-testid={`button-current-${plan.id}`}>
          Current plan
        </Button>
      ) : plan.price === 0 ? (
        <Button asChild variant="outline" className="rounded-full w-full" data-testid={`button-signup-${plan.id}`}>
          <Link href="/signup">{plan.ctaLabel}</Link>
        </Button>
      ) : (
        <Button
          className={cn("rounded-full w-full", ctaClass)}
          variant={plan.ctaVariant === "ghost" ? "outline" : "default"}
          disabled={isLoading || !canUpgrade}
          onClick={() => onUpgrade(plan.id)}
          data-testid={`button-upgrade-${plan.id}`}
        >
          {isLoading
            ? "Redirecting…"
            : canUpgrade
              ? plan.ctaLabel
              : "Contact support to downgrade"}
        </Button>
      )}

      <ul className="space-y-2 flex-1 border-t border-border pt-5 mt-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-[13.5px] leading-snug">
            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-[hsl(var(--positive))]/15 flex items-center justify-center mt-0.5">
              <Check className="h-2.5 w-2.5 text-[hsl(var(--positive))]" strokeWidth={3} />
            </span>
            <span>{f}</span>
          </li>
        ))}
        {plan.locked.map((f) => (
          <li
            key={f}
            className="flex items-start gap-2.5 text-[13.5px] leading-snug text-muted-foreground"
          >
            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-muted flex items-center justify-center mt-0.5">
              <Lock className="h-2.5 w-2.5 text-muted-foreground" strokeWidth={2.5} />
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
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
  const total = pack.coin_amount + pack.bonus_coins;
  const priceRs = pack.price_inr_paise / 100;
  const perCoin = (priceRs / total).toFixed(2);

  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4 hover:shadow-card transition-shadow duration-base">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-[hsl(var(--brand-gold))]" />
          <span className="font-display text-[15px] font-bold text-[hsl(var(--brand-navy))] dark:text-foreground">
            {pack.name}
          </span>
        </div>
        {pack.bonus_coins > 0 && (
          <span className="text-[10px] font-bold uppercase tracking-uppercase text-[hsl(var(--brand-gold))]">
            +{pack.bonus_coins} bonus
          </span>
        )}
      </div>
      <div>
        <p className="font-mono text-[28px] font-bold tabular-nums leading-none">
          {total.toLocaleString("en-IN")}
        </p>
        <p className="text-[11.5px] text-muted-foreground mt-1">
          coins · ₹{perCoin}/coin
        </p>
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <span className="font-mono text-lg font-bold tabular-nums">₹{priceRs.toLocaleString("en-IN")}</span>
        <Button
          size="sm"
          className="rounded-full bg-[hsl(var(--brand-navy))] text-white hover:bg-[hsl(var(--brand-navy))]/90"
          disabled={isLoading}
          onClick={() => onBuy(pack.id)}
        >
          Buy
        </Button>
      </div>
    </div>
  );
}

function CompareCell({ value }: { value: PlanFeatureValue }) {
  if (value === true) {
    return <Check className="h-4 w-4 text-[hsl(var(--positive))] mx-auto" strokeWidth={3} />;
  }
  if (value === false) {
    return <Minus className="h-4 w-4 text-muted-foreground/50 mx-auto" strokeWidth={2} />;
  }
  return <span className="font-mono text-[12.5px] tabular-nums text-foreground">{value}</span>;
}

// ─── Page ────────────────────────────────────────────────────────────────────

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

      {/* Hero — gradient bg → page bg, centered eyebrow + display H1 */}
      <section className="border-b border-border bg-gradient-to-b from-card to-background">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-16 md:py-20 text-center">
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            transition={easeOut}
            className="space-y-4"
          >
            <div className="flex justify-center">
              <Eyebrow tone="gold" rule>
                Pricing
              </Eyebrow>
            </div>
            <h1 className="font-display text-4xl md:text-5xl lg:text-[54px] leading-[1.05] font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
              Honest pricing for
              <br />
              <em className="italic font-bold text-[hsl(var(--brand-gold))]">
                serious investors.
              </em>
            </h1>
            <p className="text-base md:text-[17px] text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Start free. Upgrade when your research demands it. Cancel anytime —
              your data exports cleanly.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Plan tier cards */}
      <section className="max-w-6xl mx-auto px-4 md:px-8 py-12 md:py-16">
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

      {/* Compare side-by-side */}
      <section className="border-t border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-14 md:py-16">
          <div className="space-y-2 mb-8">
            <Eyebrow tone="gold" rule>
              Side by side
            </Eyebrow>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
              Compare the plans.
            </h2>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th className="text-left py-3.5 px-5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground bg-muted/40 border-b border-border w-[34%]"></th>
                  <th className="text-center py-3.5 px-5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground bg-muted/40 border-b border-border">
                    Free
                  </th>
                  <th className="text-center py-3.5 px-5 text-[10.5px] font-bold uppercase tracking-uppercase text-[hsl(var(--brand-gold))] bg-muted/40 border-b border-border">
                    Semi
                  </th>
                  <th className="text-center py-3.5 px-5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground bg-muted/40 border-b border-border">
                    Pro
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((section, sIdx) => (
                  <Fragment key={section.title}>
                    <tr className="bg-muted/25">
                      <td
                        colSpan={4}
                        className={cn(
                          "py-3 px-5 text-[10.5px] font-bold uppercase tracking-uppercase text-[hsl(var(--brand-navy))] dark:text-[hsl(var(--brand-gold))]",
                          sIdx > 0 && "border-t border-border",
                        )}
                      >
                        {section.title}
                      </td>
                    </tr>
                    {section.rows.map((row) => (
                      <tr key={row.label} className="border-t border-border/60">
                        <td className="py-3 px-5 text-foreground">{row.label}</td>
                        <td className="py-3 px-5 text-center">
                          <CompareCell value={row.free} />
                        </td>
                        <td className="py-3 px-5 text-center">
                          <CompareCell value={row.semi} />
                        </td>
                        <td className="py-3 px-5 text-center">
                          <CompareCell value={row.pro} />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Coin packs (real product, not in design ref but kept) */}
      <section className="border-t border-border bg-muted/10">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-14 md:py-16">
          <div className="space-y-2 mb-8 text-center">
            <div className="flex justify-center">
              <Eyebrow tone="gold" rule>
                Coin packs
              </Eyebrow>
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
              Pay per use.
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Buy coins once, spend across all platform features. Coins never expire
              and stack across months.
            </p>
          </div>

          {packsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-xl" />
              ))}
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

          <div className="mt-6 rounded-xl border border-border bg-card p-5">
            <div className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground mb-3">
              Coin costs (Semi tier)
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <span>
                <span className="font-mono font-bold tabular-nums text-foreground">5</span>{" "}
                <span className="text-muted-foreground">coins · Strategy backtest</span>
              </span>
              <span>
                <span className="font-mono font-bold tabular-nums text-foreground">2</span>{" "}
                <span className="text-muted-foreground">coins · Expert screener</span>
              </span>
              <span>
                <span className="font-mono font-bold tabular-nums text-foreground">3</span>{" "}
                <span className="text-muted-foreground">coins · AI sentiment (per stock)</span>
              </span>
            </div>
            <p className="text-[12px] text-muted-foreground mt-3">
              Pro tier: zero coin debits — every feature is unlimited.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-14 md:py-20">
          <div className="space-y-2 mb-8">
            <Eyebrow tone="gold" rule>
              FAQ
            </Eyebrow>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
              Common questions.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {FAQ.map((item) => (
              <div
                key={item.q}
                className="rounded-xl border border-border bg-card p-6"
              >
                <h4 className="font-display text-[17px] font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground mb-2">
                  {item.q}
                </h4>
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
