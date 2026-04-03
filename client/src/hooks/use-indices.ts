import { useQuery } from "@tanstack/react-query";
import type { IndicesResponse } from "@/lib/types";
import { getApiBaseUrl } from "@/lib/api-config";

interface UseIndicesParams {
  limit?: number;
}

export function useIndices({ limit }: UseIndicesParams = {}) {
  const baseUrl = getApiBaseUrl();

  // Build query parameters
  const params = new URLSearchParams();
  if (limit) params.append("limit", limit.toString());

  const indicesUrl = `${baseUrl}/api/indices${params.toString() ? `?${params.toString()}` : ""}`;

  return useQuery({
    queryKey: ["indices", limit],
    queryFn: async (): Promise<IndicesResponse> => {
      const response = await fetch(indicesUrl);
      if (!response.ok) {
        throw new Error(`Failed to load indices (${response.status})`);
      }

      const payload = await response.json();
      return payload as IndicesResponse;
    },
    staleTime: 1000 * 60 * 2, // Consider data fresh for 2 minutes
    refetchInterval: 1000 * 60, // Auto-refresh every 60 seconds (indices don't change rapidly)
    gcTime: 1000 * 60 * 5, // Keep in cache for 5 minutes
    refetchOnWindowFocus: false, // Don't refetch when tab regains focus
  });
}
