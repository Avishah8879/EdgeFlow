import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Loader2, Newspaper } from "lucide-react";
import { useNews, type NewsArticle } from "@/hooks/use-news";

function formatRelativeTime(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return isoDate;
  }
}

interface NewsSectionProps {
  limit?: number;
}

export default function NewsSection({ limit = 10 }: NewsSectionProps) {
  const { data, isLoading, error } = useNews(limit);

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="pb-3 shrink-0">
        <CardTitle className="flex items-center gap-2">
          <Newspaper className="h-5 w-5 text-primary" />
          Market News
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto min-h-0 auto-hide-scrollbar">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-center py-16 text-muted-foreground">
            Failed to load news. Please try again later.
          </p>
        ) : !data?.articles?.length ? (
          <p className="text-center py-16 text-muted-foreground">
            No news articles available
          </p>
        ) : (
          <div className="space-y-4">
            {data.articles.map((article: NewsArticle, idx: number) => (
              <div key={article.id || idx}>
                {idx > 0 && <Separator className="my-4" />}
                <div className="space-y-2">
                  {/* Headline */}
                  <a
                    href={article.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block hover:underline"
                  >
                    <h3 className="font-medium text-sm leading-tight line-clamp-2">
                      {article.title}
                    </h3>
                  </a>

                  {/* Summary (if available and different from title) */}
                  {article.desc && article.desc !== "No summary available" && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {article.desc}
                    </p>
                  )}

                  {/* Meta: Source • Time • Read more */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate max-w-[120px]">{article.source}</span>
                    <span>•</span>
                    <span>{formatRelativeTime(article.date)}</span>
                    <a
                      href={article.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto flex items-center gap-1 hover:text-foreground shrink-0"
                    >
                      Read <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
