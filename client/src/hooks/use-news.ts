import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-config";

interface NewsArticle {
  id: string;
  title: string;
  desc: string;
  link: string;
  source: string;
  date: string;
}

interface NewsResponse {
  articles: NewsArticle[];
  count: number;
  total_count: number;
  page: number;
  total_pages: number;
  fetched_at: string;
}

export function useNews(limit: number = 20, page: number = 1) {
  const baseUrl = getApiBaseUrl();

  return useQuery<NewsResponse>({
    queryKey: ["news", limit, page],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/news?limit=${limit}&page=${page}`);
      if (!response.ok) {
        throw new Error("Failed to fetch news");
      }
      const envelope = await response.json();
      // Unwrap standardized { data, meta } envelope into legacy NewsResponse shape
      if (envelope.data && envelope.meta) {
        return {
          articles: envelope.data,
          count: envelope.meta.count,
          total_count: envelope.meta.total,
          page: envelope.meta.page,
          total_pages: envelope.meta.total_pages,
          fetched_at: envelope.meta.fetched_at,
        };
      }
      return envelope;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 mins
  });
}

export type { NewsArticle, NewsResponse };
