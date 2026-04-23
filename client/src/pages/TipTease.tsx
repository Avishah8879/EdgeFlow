import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useSubscriptionStatus } from "@/hooks/use-subscription";
import { useTipTeaseChat } from "@/hooks/use-tip-tease-chat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Crown, Sparkles, ArrowRight, Lock } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import HeroSection from "@/components/tip-tease/HeroSection";
import ChatInterface from "@/components/tip-tease/ChatInterface";
import { SEO } from "@/components/SEO";

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
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8">
        <SectionHeader
          title="Equity Pro AI"
          description="AI-powered financial insights for Indian markets"
          size="lg"
        />

        <div className="flex justify-center mt-12">
          <Card className="w-full max-w-md text-center">
            <CardHeader>
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Lock className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-2xl">Premium Feature</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-muted-foreground">
                Equity Pro AI is available exclusively for Premium subscribers.
                Get AI-powered financial insights with unlimited access.
              </p>

              <div className="space-y-3 text-left">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-sm">Unlimited AI conversations</span>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-sm">Real-time market insights</span>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-sm">Personalized stock analysis</span>
                </div>
              </div>

              <Button onClick={handleUpgrade} className="w-full gap-2">
                <Crown className="w-4 h-4" />
                {isAuthenticated ? "Upgrade to Premium" : "Sign Up for Premium"}
                <ArrowRight className="w-4 h-4" />
              </Button>

              {!isAuthenticated && (
                <p className="text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <Link href="/login?returnUrl=/tip-tease" className="text-primary hover:underline">
                    Log in
                  </Link>
                </p>
              )}
            </CardContent>
          </Card>
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
