import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSentimentShared } from "@/contexts/SentimentContext";
import { getSentimentBadgeClass } from "@/lib/theme-utils";

export default function SentimentMetrics() {
  const { data, isLoading, isError } = useSentimentShared();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sentiment Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-40">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sentiment Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No sentiment data available</p>
        </CardContent>
      </Card>
    );
  }

  const articles = data.articles || [];

  // Calculate sentiment counts and average confidence
  const positiveArticles = articles.filter((a: any) => a.sentiment?.label === "positive");
  const negativeArticles = articles.filter((a: any) => a.sentiment?.label === "negative");
  const neutralArticles = articles.filter((a: any) => a.sentiment?.label === "neutral");

  const avgConfidence = (sentimentArticles: any[]) => {
    if (sentimentArticles.length === 0) return 0;
    const sum = sentimentArticles.reduce((acc: number, a: any) => acc + (a.sentiment?.score || 0), 0);
    return (sum / sentimentArticles.length) * 100;
  };

  const positiveConf = avgConfidence(positiveArticles);
  const negativeConf = avgConfidence(negativeArticles);
  const neutralConf = avgConfidence(neutralArticles);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sentiment Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Positive */}
          <div className="flex items-center justify-between p-2 rounded-md hover-elevate">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-positive" />
              <span className="text-sm font-medium">Positive</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={getSentimentBadgeClass("positive")}>
                {positiveArticles.length}
              </Badge>
              {positiveArticles.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {positiveConf.toFixed(0)}% conf.
                </span>
              )}
            </div>
          </div>

          {/* Negative */}
          <div className="flex items-center justify-between p-2 rounded-md hover-elevate">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-negative" />
              <span className="text-sm font-medium">Negative</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={getSentimentBadgeClass("negative")}>
                {negativeArticles.length}
              </Badge>
              {negativeArticles.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {negativeConf.toFixed(0)}% conf.
                </span>
              )}
            </div>
          </div>

          {/* Neutral */}
          <div className="flex items-center justify-between p-2 rounded-md hover-elevate">
            <div className="flex items-center gap-2">
              <Minus className="w-4 h-4 text-neutral" />
              <span className="text-sm font-medium">Neutral</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={getSentimentBadgeClass("neutral")}>
                {neutralArticles.length}
              </Badge>
              {neutralArticles.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {neutralConf.toFixed(0)}% conf.
                </span>
              )}
            </div>
          </div>

          {/* Total Articles */}
          <div className="pt-3 border-t">
            <p className="text-xs text-muted-foreground flex items-center justify-between">
              <span>Total Articles</span>
              <span className="font-semibold">{articles.length}</span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
