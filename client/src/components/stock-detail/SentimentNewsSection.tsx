import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Loader2 } from "lucide-react";
import { useSentimentShared } from "@/contexts/SentimentContext";
import { getSentimentBadgeClass, getSentimentColorClass } from "@/lib/theme-utils";

function getSentimentVariant(label: string): "default" | "destructive" | "outline" | undefined {
  // Return undefined to allow custom classes via getSentimentBadgeClass
  return undefined;
}

export default function SentimentNewsSection() {
  const { data, isLoading, isError } = useSentimentShared();

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
        ) : isError || !data ? (
          <p className="text-center py-16 text-muted-foreground">
            No news articles available
          </p>
        ) : (
          <div className="space-y-4">
            {data.articles?.map((article: any, idx: number) => (
              <div key={idx}>
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
                      {article.desc}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{article.source}</span>
                    {article.date && (
                      <>
                        <span>•</span>
                        <span>{article.date}</span>
                      </>
                    )}
                    {article.sentiment?.score && (
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

            {data.articles?.length === 0 && (
              <p className="text-center py-8 text-muted-foreground">
                No news articles found for this ticker
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
