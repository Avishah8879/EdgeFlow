import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Loader2, TrendingUp, TrendingDown, Minus, Shield } from "lucide-react";
import { useSentimentShared } from "@/contexts/SentimentContext";
import { getSentimentColorClass } from "@/lib/theme-utils";
import { Progress } from "@/components/ui/progress";

export default function SentimentGauge() {
  const { data, isLoading, isError } = useSentimentShared();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Market Sentiment</CardTitle>
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
          <CardTitle className="text-base">Market Sentiment</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No sentiment data available</p>
        </CardContent>
      </Card>
    );
  }

  const articles = data.articles || [];
  const positive = articles.filter((a: any) => a.sentiment?.label === "positive").length;
  const negative = articles.filter((a: any) => a.sentiment?.label === "negative").length;
  const neutral = articles.filter((a: any) => a.sentiment?.label === "neutral").length;
  const total = articles.length;

  const positivePercent = total > 0 ? (positive / total) * 100 : 0;
  const negativePercent = total > 0 ? (negative / total) * 100 : 0;
  const neutralPercent = total > 0 ? (neutral / total) * 100 : 0;

  // Calculate overall sentiment and confidence
  let overallSentiment = "Neutral";
  let sentimentIcon = <Minus className="w-8 h-8" />;
  let sentimentColor = getSentimentColorClass("neutral");
  let confidence = Math.abs(positivePercent - negativePercent);

  if (positivePercent > negativePercent + 10) {
    overallSentiment = "Bullish";
    sentimentIcon = <TrendingUp className="w-8 h-8" />;
    sentimentColor = getSentimentColorClass("bullish");
    confidence = positivePercent - negativePercent;
  } else if (negativePercent > positivePercent + 10) {
    overallSentiment = "Bearish";
    sentimentIcon = <TrendingDown className="w-8 h-8" />;
    sentimentColor = getSentimentColorClass("bearish");
    confidence = negativePercent - positivePercent;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Market Sentiment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Large Sentiment Display */}
        <div className="text-center space-y-3">
          <div className={`flex items-center justify-center ${sentimentColor}`}>
            {sentimentIcon}
          </div>
          <div>
            <div className={`text-4xl font-bold ${sentimentColor}`}>{overallSentiment}</div>
            <p className="text-sm text-muted-foreground mt-2">
              Based on {total} news article{total !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Confidence Score */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Confidence</span>
            </div>
            <span className="font-semibold">{confidence.toFixed(0)}%</span>
          </div>
          <Progress value={confidence} className="h-2" />
        </div>

        {/* Compact Sentiment Distribution */}
        <div className="pt-4 border-t space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-positive" />
              <span className="text-muted-foreground">Bullish</span>
            </div>
            <span className="font-medium">{positivePercent.toFixed(0)}%</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-negative" />
              <span className="text-muted-foreground">Bearish</span>
            </div>
            <span className="font-medium">{negativePercent.toFixed(0)}%</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-neutral" />
              <span className="text-muted-foreground">Neutral</span>
            </div>
            <span className="font-medium">{neutralPercent.toFixed(0)}%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
