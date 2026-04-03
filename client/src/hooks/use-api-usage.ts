import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { getAuthBaseUrl } from "@/lib/api-config";

export interface KeyBreakdown {
  keyId: string;
  keyName: string;
  keyPrefix: string;
  tier: string;
  requests: number;
  lastUsed: string;
}

export interface KeyDayEntry {
  keyId: string;
  keyName: string;
  date: string;
  count: number;
}

export interface RecentRequest {
  endpoint: string;
  method: string;
  ip: string;
  time: string;
  keyName: string | null;
}

export interface UsageSummary {
  totalRequests: number;
  period: string;
  byEndpoint: Record<string, number>;
  byMethod: Record<string, number>;
  byDay: { date: string; count: number }[];
  byKey: KeyBreakdown[];
  byKeyDay: KeyDayEntry[];
  recentActivity: RecentRequest[];
  /** Kept for backwards compat — may be absent from new backend */
  byStatus?: Record<string, number>;
}

export interface KeyUsageSummary {
  keyId: string;
  keyName: string;
  keyPrefix: string;
  tier: string;
  period: string;
  totalRequests: number;
  byEndpoint: Record<string, number>;
  byMethod: Record<string, number>;
  byDay: { date: string; count: number }[];
}

/**
 * Fetch aggregated usage stats for all of the user's API keys.
 */
export function useApiUsage(period: string = "7d") {
  const { isAuthenticated, token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<UsageSummary>({
    queryKey: ["api-usage", period],
    queryFn: async (): Promise<UsageSummary> => {
      const response = await fetch(`${baseUrl}/api/developer/usage?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch usage data");
      const envelope = await response.json();
      return envelope.data ?? envelope;
    },
    enabled: isAuthenticated && !!token,
    staleTime: 60_000,
  });
}

/**
 * Fetch usage stats for a specific API key.
 */
export function useApiKeyUsage(keyId: string | null, period: string = "7d") {
  const { isAuthenticated, token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<KeyUsageSummary>({
    queryKey: ["api-key-usage", keyId, period],
    queryFn: async (): Promise<KeyUsageSummary> => {
      const response = await fetch(`${baseUrl}/api/developer/usage/${keyId}?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch key usage data");
      const envelope = await response.json();
      return envelope.data ?? envelope;
    },
    enabled: isAuthenticated && !!token && !!keyId,
    staleTime: 60_000,
  });
}
