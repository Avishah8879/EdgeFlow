import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-config";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // Data stays fresh for 5 minutes (was Infinity)
      gcTime: 10 * 60 * 1000, // Keep unused data in cache for 10 minutes
      retry: 1,
      retryDelay: 2000,
    },
    mutations: {
      retry: false,
    },
  },
});

// Prefetch regular ticker options (used by navigation search)
export function prefetchTickerOptions() {
  const baseUrl = getApiBaseUrl();
  const tickersApiUrl = `${baseUrl}/api/tickers`;

  queryClient.prefetchQuery({
    queryKey: ["ticker-options"],
    queryFn: async () => {
      const response = await fetch(tickersApiUrl);
      if (!response.ok) {
        throw new Error(`Failed to load tickers (${response.status})`);
      }
      const payload = await response.json();
      const items = Array.isArray(payload?.tickers) ? payload.tickers : [];
      const seen = new Set<string>();

      return items
        .map((item: any) => {
          const symbol = (item?.symbol ?? item?.ticker ?? item?.code)?.toUpperCase()?.trim();
          if (!symbol || seen.has(symbol)) return null;
          seen.add(symbol);
          const name = item?.name ?? item?.company_name ?? null;
          return { symbol, name: name ? String(name).trim() : null };
        })
        .filter(Boolean);
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

// Prefetch hourly ticker options (used by Strategy Backtesting)
export function prefetchHourlyTickerOptions() {
  const baseUrl = getApiBaseUrl();
  const tickersApiUrl = `${baseUrl}/api/tickers/with-hourly-data`;

  queryClient.prefetchQuery({
    queryKey: ["hourly-ticker-options"],
    queryFn: async () => {
      const response = await fetch(tickersApiUrl);
      if (!response.ok) {
        throw new Error(`Failed to load tickers with hourly data (${response.status})`);
      }
      const payload = await response.json();
      return Array.isArray(payload?.tickers) ? payload.tickers : [];
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

// Prefetch all ticker data (call on app initialization)
export function prefetchAllTickerData() {
  prefetchTickerOptions();
  prefetchHourlyTickerOptions();
}
