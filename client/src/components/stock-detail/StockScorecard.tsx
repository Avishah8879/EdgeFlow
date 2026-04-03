import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import {
  useStockScorecard,
  getScorecardLabelColor,
  formatDimensionLabel,
} from "@/hooks/use-stock-scorecard";

interface StockScorecardProps {
  ticker: string | undefined;
}

export default function StockScorecard({ ticker }: StockScorecardProps) {
  const { data, isLoading, error } = useStockScorecard(ticker);

  // Loading state
  if (isLoading) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Stock Scorecard</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 space-y-4">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error || data?.error) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Stock Scorecard</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">
              {data?.error || "Unable to load scorecard"}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // No scores available
  if (!data?.scores) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Stock Scorecard</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            No scorecard data available
          </p>
        </CardContent>
      </Card>
    );
  }

  const dimensionOrder = [
    "valuation",
    "profitability",
    "growth",
    "momentum",
    "entry_rating",
  ];

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Stock Scorecard</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between py-4">
        {dimensionOrder.map((key) => {
          const score = data.scores?.[key as keyof typeof data.scores];
          if (!score) return null;

          const colorClass = getScorecardLabelColor(score.label);

          return (
            <div
              key={key}
              className="flex items-center justify-between py-3.5 px-2 rounded-md hover:bg-accent/30 transition-colors border-b border-border/50 last:border-b-0"
            >
              <span className="text-sm font-medium text-foreground">
                {formatDimensionLabel(key)}
              </span>
              <Badge className={`text-xs px-2.5 py-0.5 border ${colorClass}`} variant="outline">
                {score.label}
              </Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
