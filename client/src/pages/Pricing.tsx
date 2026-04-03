import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import {
  useSubscriptionPlans,
  useSubscriptionStatus,
  useStartTrial,
} from "@/hooks/use-subscription";
import { useLocation, Link } from "wouter";
import { Check, Sparkles, Crown, Loader2, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function Pricing() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { data: plans, isLoading: plansLoading, error: plansError } = useSubscriptionPlans();
  const {
    subscription,
    isPremium,
    isTrialing,
    canStartTrial,
    trialEndsAt,
    isLoading: subscriptionLoading,
  } = useSubscriptionStatus();

  const startTrialMutation = useStartTrial();

  const handleStartTrial = async (planId: string) => {
    if (!isAuthenticated) {
      navigate(`/signup?returnUrl=${encodeURIComponent("/pricing")}`);
      return;
    }

    try {
      const result = await startTrialMutation.mutateAsync(planId);
      toast.success(result.message);
      navigate("/profile");
    } catch (error: any) {
      toast.error(error.message || "Failed to start trial");
    }
  };

  // Format price for display
  const formatPrice = (price: number, currency: string) => {
    if (price === 0) return "Free";
    if (currency === "INR") {
      return `₹${price.toLocaleString("en-IN")}`;
    }
    return `${currency} ${price}`;
  };

  // Get billing period text
  const getBillingPeriod = (interval: string | null, count: number) => {
    if (!interval) return "";
    if (interval === "month") return count === 1 ? "/month" : `/${count} months`;
    if (interval === "year") return count === 1 ? "/year" : `/${count} years`;
    if (interval === "lifetime") return "one-time";
    return "";
  };

  if (plansLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (plansError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">Failed to load pricing plans</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Try Again
        </Button>
      </div>
    );
  }

  // Sort plans by sort order
  const sortedPlans = plans?.sort((a, b) => a.sortOrder - b.sortOrder) || [];

  // Separate basic and premium plans
  const basicPlan = sortedPlans.find((p) => p.tier === "basic");
  const premiumPlans = sortedPlans.filter((p) => p.tier === "premium");

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-6xl px-6 py-12 space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">
            Choose Your Plan
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Start with a 7-day free trial on any Premium plan. No credit card required.
          </p>

          {/* Current subscription status banner */}
          {isAuthenticated && subscription && (
            <div className="mt-6">
              {isTrialing && trialEndsAt && (
                <Badge variant="outline" className="text-sm py-1 px-3">
                  <Clock className="h-3 w-3 mr-1" />
                  Trial ends {trialEndsAt.toLocaleDateString()}
                </Badge>
              )}
              {isPremium && !isTrialing && (
                <Badge className="text-sm py-1 px-3 bg-primary">
                  <Crown className="h-3 w-3 mr-1" />
                  Premium Member
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Pricing Cards */}
        <div className="grid gap-8 md:grid-cols-3">
          {/* Basic Plan */}
          {basicPlan && (
            <Card className="relative flex flex-col">
              <CardHeader>
                <CardTitle className="text-xl">{basicPlan.name}</CardTitle>
                <CardDescription>{basicPlan.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-6">
                <div>
                  <span className="text-4xl font-bold">
                    {formatPrice(basicPlan.price, basicPlan.currency)}
                  </span>
                  <span className="text-muted-foreground">
                    {getBillingPeriod(basicPlan.billingInterval, basicPlan.intervalCount)}
                  </span>
                </div>

                <Separator />

                <ul className="space-y-3">
                  {basicPlan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-positive shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {isAuthenticated ? (
                  subscription?.tier === "basic" && subscription?.status === "none" ? (
                    <Button variant="outline" className="w-full" disabled>
                      Current Plan
                    </Button>
                  ) : (
                    <Link href="/profile" className="w-full">
                      <Button variant="outline" className="w-full">
                        Manage Subscription
                      </Button>
                    </Link>
                  )
                ) : (
                  <Link href="/signup" className="w-full">
                    <Button variant="outline" className="w-full">
                      Get Started Free
                    </Button>
                  </Link>
                )}
              </CardFooter>
            </Card>
          )}

          {/* Premium Plans */}
          {premiumPlans.map((plan, index) => (
            <Card
              key={plan.id}
              className={`relative flex flex-col ${
                index === 0 ? "border-primary shadow-lg" : ""
              }`}
            >
              {index === 0 && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground px-3">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Most Popular
                  </Badge>
                </div>
              )}
              {plan.billingInterval === "year" && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge variant="secondary" className="px-3">
                    Save 17%
                  </Badge>
                </div>
              )}

              <CardHeader className="pt-8">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Crown className="h-5 w-5 text-primary" />
                  {plan.name}
                </CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-6">
                <div>
                  <span className="text-4xl font-bold">
                    {formatPrice(plan.price, plan.currency)}
                  </span>
                  <span className="text-muted-foreground">
                    {getBillingPeriod(plan.billingInterval, plan.intervalCount)}
                  </span>
                </div>

                {plan.trialDays > 0 && (
                  <p className="text-sm text-primary font-medium">
                    {plan.trialDays}-day free trial
                  </p>
                )}

                <Separator />

                <ul className="space-y-3">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-positive shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {isAuthenticated ? (
                  isPremium ? (
                    subscription?.plan?.id === plan.id ? (
                      <Button variant="outline" className="w-full" disabled>
                        Current Plan
                      </Button>
                    ) : (
                      <Link href="/profile" className="w-full">
                        <Button variant="outline" className="w-full">
                          Switch Plan
                        </Button>
                      </Link>
                    )
                  ) : canStartTrial ? (
                    <Button
                      className="w-full"
                      onClick={() => handleStartTrial(plan.id)}
                      disabled={startTrialMutation.isPending}
                    >
                      {startTrialMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Starting Trial...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          Start {plan.trialDays}-Day Free Trial
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button className="w-full" disabled>
                      Trial Used - Payment Coming Soon
                    </Button>
                  )
                ) : (
                  <Link
                    href={`/signup?returnUrl=${encodeURIComponent("/pricing")}`}
                    className="w-full"
                  >
                    <Button className="w-full">
                      <Sparkles className="mr-2 h-4 w-4" />
                      Start Free Trial
                    </Button>
                  </Link>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* FAQ Section */}
        <div className="space-y-6 pt-8">
          <h2 className="text-2xl font-semibold text-center">
            Frequently Asked Questions
          </h2>
          <div className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="text-base">
                  What happens after my trial ends?
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  After your 7-day trial, you'll be downgraded to the Basic plan
                  unless you subscribe. We'll send you a reminder before your
                  trial ends.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="text-base">Can I cancel anytime?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Yes! You can cancel your subscription at any time. You'll
                  retain access until the end of your current billing period.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="text-base">
                  Can I get another free trial?
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Each account is eligible for one free trial. Once you've used
                  your trial, you'll need to subscribe to access Premium
                  features.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="text-base">
                  What payment methods do you accept?
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Payment integration is coming soon. For now, enjoy your free
                  trial and we'll notify you when payment options are available.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
