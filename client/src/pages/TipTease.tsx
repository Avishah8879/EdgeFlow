import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useSubscriptionStatus } from "@/hooks/use-subscription";
import { useTipTeaseChat } from "@/hooks/use-tip-tease-chat";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Crown, Sparkles, ArrowRight, Lock } from "lucide-react";
import HeroSection from "@/components/tip-tease/HeroSection";
import ChatInterface from "@/components/tip-tease/ChatInterface";
import { SEO } from "@/components/SEO";
import { Eyebrow } from "@/components/ui/eyebrow";

/**
 * Premium upgrade prompt for non-premium users.
 */
function PremiumUpgradePrompt() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const handleUpgrade = () => {
    if (!isAuthenticated) {
      navigate("/signup?returnUrl=/tip-tease");
    } else {
      navigate("/pricing");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <section className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-10">
          <div className="space-y-2">
            <Eyebrow tone="gold" rule>
              Premium feature
            </Eyebrow>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
              Equity Pro AI.
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              AI-powered financial insights for Indian markets — only available
              to Premium subscribers.
            </p>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 md:py-16">
        <div className="flex justify-center">
          <div className="w-full max-w-md rounded-2xl border border-[hsl(var(--brand-gold))]/40 bg-card p-8 text-center shadow-card-lg">
            <div className="mx-auto w-14 h-14 rounded-full bg-[hsl(var(--brand-gold))]/15 flex items-center justify-center mb-5">
              <Lock className="w-6 h-6 text-[hsl(var(--brand-gold))]" />
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground mb-2">
              Unlock with Premium
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              Equity Pro AI is available exclusively for Premium subscribers.
              Get unlimited AI-powered financial insights and analysis.
            </p>

            <ul className="space-y-2.5 text-left mb-7">
              {[
                "Unlimited AI conversations",
                "Real-time market insights",
                "Personalized stock analysis",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-[hsl(var(--brand-gold))]/15 flex items-center justify-center">
                    <Sparkles className="w-2.5 h-2.5 text-[hsl(var(--brand-gold))]" />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <Button
              onClick={handleUpgrade}
              className="w-full h-11 rounded-full bg-[hsl(var(--brand-gold))] text-white hover:bg-[hsl(var(--brand-gold))]/90 gap-2"
            >
              <Crown className="w-4 h-4" />
              {isAuthenticated ? "Upgrade to Premium" : "Sign up for Premium"}
              <ArrowRight className="w-4 h-4" />
            </Button>

            {!isAuthenticated && (
              <p className="text-xs text-muted-foreground mt-4">
                Already have an account?{" "}
                <Link
                  href="/login?returnUrl=/tip-tease"
                  className="font-semibold text-[hsl(var(--brand-gold))] hover:underline"
                >
                  Log in
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Loading skeleton for TipTease page.
 */
function TipTeaseLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-5 w-72" />
        </div>
        <div className="max-w-2xl mx-auto space-y-6">
          <Skeleton className="h-14 w-full rounded-xl" />
          <div className="flex gap-2 justify-center">
            <Skeleton className="h-8 w-28 rounded-full" />
            <Skeleton className="h-8 w-32 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * TipTease AI Chat Page
 *
 * Features:
 * - Premium-only access with upgrade prompt
 * - Hero section (initial state) with example prompts
 * - Chat interface (after first message) with streaming
 * - Smooth transitions between states
 */
export default function TipTease() {
  const { isAuthenticated } = useAuth();
  const {
    isPremium,
    isTrialing,
    isLoading: subscriptionLoading,
  } = useSubscriptionStatus();

  const {
    messages,
    status,
    error,
    isStreaming,
    sendMessage,
    cancelStream,
    reset,
    summary,
    fetchSummary,
  } = useTipTeaseChat();

  // Fetch summary on mount (for hero section)
  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Check if user has premium access
  const hasPremiumAccess = isPremium || isTrialing;
  const hasMessages = messages.length > 0;

  // Show loading while checking subscription
  if (subscriptionLoading) {
    return (
      <>
        <SEO
          title="Equity Pro AI - AI-Powered Financial Insights"
          description="Get AI-powered financial insights for Indian stock markets. Ask about stocks, market trends, and investment concepts."
        />
        <TipTeaseLoading />
      </>
    );
  }

  // Show upgrade prompt for non-premium users
  if (!hasPremiumAccess) {
    return (
      <>
        <SEO
          title="Equity Pro AI - Premium Feature"
          description="Equity Pro AI is a premium feature. Upgrade to get AI-powered financial insights."
        />
        <PremiumUpgradePrompt />
      </>
    );
  }

  return (
    <>
      <SEO
        title="Equity Pro AI - AI-Powered Financial Insights"
        description="Get AI-powered financial insights for Indian stock markets. Ask about stocks, market trends, and investment concepts."
      />

      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8">
          <AnimatePresence mode="wait">
            {!hasMessages ? (
              <motion.div
                key="hero"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <HeroSection
                  onSendMessage={sendMessage}
                  summary={summary}
                  isLoading={!summary}
                  disabled={status === "connecting"}
                />
              </motion.div>
            ) : (
              <motion.div
                key="chat"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <ChatInterface
                  messages={messages}
                  onSendMessage={sendMessage}
                  onCancel={cancelStream}
                  onReset={reset}
                  isStreaming={isStreaming}
                  error={error}
                  status={status}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
