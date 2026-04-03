import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { getAuthBaseUrl } from "@/lib/api-config";

// Types for subscription data
export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  tier: "basic" | "premium";
  price: number; // In rupees
  priceCents: number;
  currency: string;
  billingInterval: "month" | "year" | "lifetime" | null;
  intervalCount: number;
  trialDays: number;
  features: string[];
  isActive: boolean;
  sortOrder: number;
}

export interface UserSubscription {
  userId: string;
  tier: "basic" | "premium";
  status: "none" | "trialing" | "active" | "cancelled" | "expired";
  plan: {
    id: string;
    name: string;
    tier: string;
  } | null;
  subscriptionPlanId?: string | null; // Direct access for convenience
  subscriptionStart: string | null;
  subscriptionEnd: string | null;
  trialEnd: string | null;
  hadTrial: boolean;
  cancelledAt: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface SubscriptionHistoryEvent {
  id: string;
  eventType: string;
  createdAt: string;
  metadata: Record<string, any>;
}

// Auth base URL is now imported from api-config

/**
 * Hook to fetch all available subscription plans.
 * Public endpoint - doesn't require authentication.
 */
export function useSubscriptionPlans() {
  const baseUrl = getAuthBaseUrl();

  return useQuery<SubscriptionPlan[]>({
    queryKey: ["subscription-plans"],
    queryFn: async (): Promise<SubscriptionPlan[]> => {
      const response = await fetch(`${baseUrl}/api/subscription/plans`);

      if (!response.ok) {
        throw new Error("Failed to fetch subscription plans");
      }

      const envelope = await response.json();
      // Unwrap standardized { data } envelope, fallback to legacy .plans
      return envelope.data ?? envelope.plans;
    },
    staleTime: 30 * 60 * 1000, // 30 minutes - plans don't change often
    retry: 2,
  });
}

/**
 * Hook to fetch current user's subscription status.
 * Requires authentication.
 */
export function useUserSubscription() {
  const { isAuthenticated, token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<UserSubscription>({
    queryKey: ["user-subscription"],
    queryFn: async (): Promise<UserSubscription> => {
      const response = await fetch(`${baseUrl}/api/subscription/current`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch subscription status");
      }

      const envelope = await response.json();
      // Unwrap standardized { data } envelope
      return (envelope.data ?? envelope) as UserSubscription;
    },
    enabled: isAuthenticated && !!token,
    staleTime: 1 * 60 * 1000, // 1 minute (reduced for faster admin change propagation)
    retry: 2,
  });
}

/**
 * Hook to check if user is eligible for a free trial.
 * Requires authentication.
 */
export function useTrialEligibility() {
  const { isAuthenticated, token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<{ eligible: boolean }>({
    queryKey: ["trial-eligibility"],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/subscription/trial-eligibility`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to check trial eligibility");
      }

      const envelope = await response.json();
      // Unwrap standardized { data } envelope
      return (envelope.data ?? envelope) as { eligible: boolean };
    },
    enabled: isAuthenticated && !!token,
    staleTime: 2 * 60 * 1000, // 2 minutes (reduced for faster admin change propagation)
  });
}

/**
 * Hook to start a free trial.
 * Returns a mutation function.
 */
export function useStartTrial() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async (planId: string) => {
      const response = await fetch(`${baseUrl}/api/subscription/start-trial`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ planId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const msg = errorData.error?.message ?? errorData.error ?? "Failed to start trial";
        throw new Error(msg);
      }

      const envelope = await response.json();
      return envelope.data ?? envelope;
    },
    onSuccess: () => {
      // Invalidate relevant queries to refetch fresh data
      queryClient.invalidateQueries({ queryKey: ["user-subscription"] });
      queryClient.invalidateQueries({ queryKey: ["trial-eligibility"] });
    },
  });
}

/**
 * Hook to cancel subscription at period end.
 * Returns a mutation function.
 */
export function useCancelSubscription() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async (reason?: string) => {
      const response = await fetch(`${baseUrl}/api/subscription/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const msg = errorData.error?.message ?? errorData.error ?? "Failed to cancel subscription";
        throw new Error(msg);
      }

      const envelope = await response.json();
      return envelope.data ?? envelope;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-subscription"] });
    },
  });
}

/**
 * Hook to immediately downgrade to basic tier.
 * Returns a mutation function.
 */
export function useDowngradeSubscription() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = getAuthBaseUrl();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${baseUrl}/api/subscription/downgrade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        const msg = errorData.error?.message ?? errorData.error ?? "Failed to downgrade subscription";
        throw new Error(msg);
      }

      const envelope = await response.json();
      return envelope.data ?? envelope;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-subscription"] });
      queryClient.invalidateQueries({ queryKey: ["trial-eligibility"] });
    },
  });
}

/**
 * Hook to fetch subscription history.
 * Requires authentication.
 */
export function useSubscriptionHistory(limit: number = 20) {
  const { isAuthenticated, token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<SubscriptionHistoryEvent[]>({
    queryKey: ["subscription-history", limit],
    queryFn: async (): Promise<SubscriptionHistoryEvent[]> => {
      const response = await fetch(
        `${baseUrl}/api/subscription/history?limit=${limit}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch subscription history");
      }

      const envelope = await response.json();
      // Unwrap standardized { data } envelope, fallback to legacy .history
      return envelope.data ?? envelope.history;
    },
    enabled: isAuthenticated && !!token,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Helper hook to get subscription status flags.
 * Provides convenient boolean flags for common checks.
 */
export function useSubscriptionStatus() {
  const { data: subscription, isLoading, error } = useUserSubscription();
  const { data: eligibility } = useTrialEligibility();

  return {
    isLoading,
    error,
    subscription,
    // Convenience flags
    isPremium: subscription?.tier === "premium",
    isBasic: subscription?.tier === "basic",
    isTrialing: subscription?.status === "trialing",
    isActive: subscription?.status === "active",
    isCancelled: subscription?.status === "cancelled",
    isExpired: subscription?.status === "expired",
    canStartTrial: eligibility?.eligible ?? false,
    willExpire: subscription?.cancelAtPeriodEnd ?? false,
    // Dates
    trialEndsAt: subscription?.trialEnd ? new Date(subscription.trialEnd) : null,
    subscriptionEndsAt: subscription?.subscriptionEnd
      ? new Date(subscription.subscriptionEnd)
      : null,
  };
}
