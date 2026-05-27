import { useQuery } from "@tanstack/react-query";
import type { PlatformSlug } from "@/lib/platforms";

export interface PlatformSession {
  apiKey: string;
  userId: string;
  platform: {
    name: string;
    url: string;
  };
}

export function usePlatformSession(slug: PlatformSlug | undefined) {
  return useQuery<PlatformSession>({
    queryKey: ["platform-session", slug],
    queryFn: async () => {
      if (!slug) throw new Error("Platform slug required");
      const res = await fetch(`/api/platforms/${encodeURIComponent(slug)}/session`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`${res.status}: ${text}`);
      }

      const envelope = await res.json();
      return envelope.data ?? envelope;
    },
    enabled: !!slug,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    retry: 1,
  });
}
