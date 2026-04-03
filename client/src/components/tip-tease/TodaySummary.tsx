import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Clock } from "lucide-react";

interface TodaySummaryProps {
  summary: string | null;
  isMarketOpen?: boolean;
  marketStatus?: string;
  isLoading?: boolean;
}

/**
 * Today's market summary card displayed on the hero section.
 */
export default function TodaySummary({
  summary,
  isMarketOpen,
  marketStatus,
  isLoading,
}: TodaySummaryProps) {
  if (isLoading) {
    return (
      <Card className="w-full max-w-lg mx-auto">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4 mt-2" />
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return null;
  }

  return (
    <Card className="w-full max-w-lg mx-auto bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {isMarketOpen ? (
            <>
              <TrendingUp className="w-4 h-4 text-positive" />
              <span className="text-positive">Market Open</span>
            </>
          ) : (
            <>
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                {marketStatus || "Market Closed"}
              </span>
            </>
          )}
          <span className="text-muted-foreground ml-auto text-xs">
            Today's Summary
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{summary}</p>
      </CardContent>
    </Card>
  );
}
