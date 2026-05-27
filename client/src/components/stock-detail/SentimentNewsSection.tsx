import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useLayoutEffect, useRef, useState } from "react";
import { useSentimentShared } from "@/contexts/SentimentContext";
import { getSentimentBadgeClass, getSentimentColorClass } from "@/lib/theme-utils";
import { SentimentAnalysisError } from "@/hooks/use-sentiment-analysis";

const decodeHtmlEntities = (text: string) => {
  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value;
  }

  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
};

const cleanDescription = (html: string) =>
  decodeHtmlEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

const formatArticleDate = (date: string) => {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? date : format(parsed, "d MMM yyyy, h:mm a");
};

export default function SentimentNewsSection() {
  const { data, isLoading, isError, error } = useSentimentShared();
  const articleRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [visibleArticlesHeight, setVisibleArticlesHeight] = useState<number>();
  const status = error instanceof SentimentAnalysisError ? error.status : undefined;
  const isAuthOrCoinError = status === 401 || status === 402;
  const isBackendError = !isAuthOrCoinError && (status == null || status >= 500 || isError);
  const tickerLabel = data?.ticker || "this ticker";
  const articles = data?.articles || [];
  const shouldScrollArticles = articles.length > 3;

  useLayoutEffect(() => {
    if (!shouldScrollArticles) {
      setVisibleArticlesHeight(undefined);
      return;
    }

    const updateHeight = () => {
      const firstThreeHeight = articleRefs.current
        .slice(0, 3)
        .reduce((total, element) => total + (element?.offsetHeight || 0), 0);

      if (firstThreeHeight > 0) {
        setVisibleArticlesHeight(firstThreeHeight);
      }
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    articleRefs.current.slice(0, 3).forEach((element) => {
      if (element) resizeObserver.observe(element);
    });

    return () => resizeObserver.disconnect();
  }, [shouldScrollArticles, articles]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>News & Sentiment Analysis</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : isAuthOrCoinError ? (
          <p className="text-center py-16 text-muted-foreground">
            Sign in or unlock sentiment analysis to view news
          </p>
        ) : isError || !data ? (
          <p className="text-center py-16 text-muted-foreground">
            {isBackendError
              ? "Unable to load news right now. Try again."
              : `No recent news found for ${tickerLabel}`}
          </p>
        ) : (
          <div
            className={shouldScrollArticles ? "overflow-y-auto pr-2" : undefined}
            style={
              shouldScrollArticles && visibleArticlesHeight
                ? { maxHeight: visibleArticlesHeight }
                : undefined
            }
          >
            {articles.map((article: any, idx: number) => (
              <div
                key={idx}
                ref={(element) => {
                  articleRefs.current[idx] = element;
                }}
              >
                {idx > 0 && <Separator className="my-4" />}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <a
                      href={article.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 hover:underline"
                    >
                      <h3 className="font-semibold text-base leading-tight">
                        {article.title}
                      </h3>
                    </a>
                    <Badge className={getSentimentBadgeClass(article.sentiment?.label || "neutral")}>
                      {article.sentiment?.label || "neutral"}
                    </Badge>
                  </div>

                  {article.desc && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {cleanDescription(article.desc)}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{article.source}</span>
                    {article.date && (
                      <>
                        <span>•</span>
                        <span>{formatArticleDate(article.date)}</span>
                      </>
                    )}
                    {article.sentiment?.score != null && (
                      <>
                        <span>•</span>
                        <span className={getSentimentColorClass(article.sentiment.label)}>
                          Confidence: {(article.sentiment.score * 100).toFixed(0)}%
                        </span>
                      </>
                    )}
                    <a
                      href={article.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto flex items-center gap-1 hover:text-foreground"
                    >
                      Read more <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            ))}

            {articles.length === 0 && (
              <p className="text-center py-8 text-muted-foreground">
                {data.error === "no_articles_found"
                  ? `No recent news found for ${tickerLabel}`
                  : "Unable to load news right now. Try again."}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
