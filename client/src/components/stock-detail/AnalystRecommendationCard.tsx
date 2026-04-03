import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FileText, Loader2, TrendingUp, BarChart3, FileCheck, Target, ChevronRight } from "lucide-react";
import { useExternalAnalyst } from "@/hooks/use-external-analyst";
import { useStockScorecard, getScorecardLabelColor, formatDimensionLabel, type ScoreDimension } from "@/hooks/use-stock-scorecard";
import { getRatingColorClass, getValueColorClass } from "@/lib/theme-utils";
import { getApiBaseUrl } from "@/lib/api-config";

interface AnalystRecommendationCardProps {
  data: any;
  ticker: string;
}

// Helper to format metric keys to readable labels
function formatMetricLabel(key: string): string {
  const labels: Record<string, string> = {
    trailing_pe: "P/E Ratio",
    forward_pe: "Forward P/E",
    price_to_book: "P/B Ratio",
    price_to_sales: "P/S Ratio",
    peg_ratio: "PEG Ratio",
    weighted_avg: "Weighted Avg",
    return_on_equity: "ROE",
    return_on_assets: "ROA",
    profit_margin: "Profit Margin",
    revenue_cagr: "Revenue CAGR (2Y)",
    net_income_cagr: "Net Income CAGR (2Y)",
    debt_to_equity: "Debt/Equity",
    interest_coverage: "Interest Coverage",
    return_1y: "1Y Return",
    ma200: "MA200",
    rsi: "RSI (14)",
    high_52w: "52W High",
    pct_from_52w_high: "% from 52W High",
  };
  if (labels[key]) return labels[key];
  return key.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

// Helper to format metric values
function formatMetricValue(key: string, value: number | string | null): string {
  if (value === null || value === undefined) return "N/A";
  const numValue = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(numValue)) return "N/A";

  if (key.includes("cagr") || key.includes("margin") || key.includes("return") ||
      key === "return_on_equity" || key === "return_on_assets" || key === "pct_from_52w_high") {
    return `${(numValue * 100).toFixed(1)}%`;
  }
  if (key.includes("pe") || key.includes("ratio") || key.includes("book") ||
      key.includes("sales") || key === "debt_to_equity" || key === "interest_coverage" || key === "weighted_avg") {
    return numValue.toFixed(2);
  }
  if (key === "ma200" || key === "high_52w") {
    return `₹${numValue.toFixed(2)}`;
  }
  if (key === "rsi") {
    return numValue.toFixed(1);
  }
  return numValue.toFixed(2);
}

// Key metrics to show in collapsed preview for each dimension
const KEY_METRICS: Record<string, string[]> = {
  valuation: ["trailing_pe", "price_to_book", "weighted_avg"],
  profitability: ["return_on_equity", "profit_margin"],
  growth: ["revenue_cagr", "net_income_cagr"],
  momentum: ["return_1y"],
  entry_rating: ["pct_from_52w_high", "rsi"],
};

// Score accordion item - collapsible with preview
interface ScoreAccordionItemProps {
  dimensionKey: string;
  score: ScoreDimension;
  isOpen: boolean;
  onToggle: () => void;
}

function ScoreAccordionItem({ dimensionKey, score, isOpen, onToggle }: ScoreAccordionItemProps) {
  const colorClass = getScorecardLabelColor(score.label);
  const keyMetrics = KEY_METRICS[dimensionKey] || [];

  // Get preview metrics (first 2-3 key metrics with values)
  const previewMetrics = keyMetrics
    .filter(key => score.metrics?.[key] !== null && score.metrics?.[key] !== undefined)
    .slice(0, 3)
    .map(key => ({
      label: formatMetricLabel(key),
      value: formatMetricValue(key, score.metrics?.[key])
    }));

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <div className={`rounded-lg border transition-colors ${
        isOpen ? "border-primary/30 bg-accent/30" : "border-border/50 hover:border-border"
      }`}>
        {/* Header - Always visible */}
        <CollapsibleTrigger className="w-full text-left">
          <div className="flex items-center justify-between p-3 cursor-pointer">
            <div className="flex items-center gap-2">
              <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
                isOpen ? "rotate-90" : ""
              }`} />
              <span className="font-medium">{formatDimensionLabel(dimensionKey)}</span>
            </div>
            <Badge className={`text-xs px-2 py-0.5 border ${colorClass}`} variant="outline">
              {score.label}
            </Badge>
          </div>

          {/* Key Metrics Preview - Visible when collapsed */}
          {!isOpen && previewMetrics.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2 text-xs text-muted-foreground">
              {previewMetrics.map((m, i) => (
                <span key={i}>
                  <span className="opacity-70">{m.label}</span>{" "}
                  <span className="font-mono font-medium text-foreground">{m.value}</span>
                </span>
              ))}
            </div>
          )}
        </CollapsibleTrigger>

        {/* Expanded Content */}
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-0 border-t border-border/30">
            {/* Explanation */}
            <p className="text-sm text-muted-foreground leading-relaxed py-3">
              {score.explanation}
            </p>

            {/* Metrics Grid - 3 columns on desktop, 2 on mobile */}
            {score.metrics && Object.keys(score.metrics).length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(score.metrics).map(([key, value]) => (
                  <div key={key} className="bg-muted/30 rounded-md p-2">
                    <div className="text-xs text-muted-foreground truncate">
                      {formatMetricLabel(key)}
                    </div>
                    <div className="text-sm font-semibold font-mono mt-0.5">
                      {formatMetricValue(key, value)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export default function AnalystRecommendationCard({ data, ticker }: AnalystRecommendationCardProps) {
  const hasProprietary = data.has_proprietary_report;
  const proprietary = data.proprietary_analysis;

  // Only fetch external analyst data if proprietary data is not available
  const { data: externalData, isLoading: externalLoading } = useExternalAnalyst(ticker, {
    enabled: !hasProprietary,
  });

  // Fetch scorecard data for the Score Breakdown tab
  const { data: scorecardData, isLoading: scorecardLoading } = useStockScorecard(ticker);

  // Accordion state - only one dimension open at a time
  const [openDimension, setOpenDimension] = useState<string | null>(null);

  const external = externalData?.external_analyst;

  // Loading state
  if (!hasProprietary && externalLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Analyst Recommendation</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8 space-y-2">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Loading analyst data...</p>
        </CardContent>
      </Card>
    );
  }

  // No data available
  if (!hasProprietary && (!external || !external.analyst_ratings)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Analyst Recommendation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No analyst data available</p>
        </CardContent>
      </Card>
    );
  }

  const dimensionOrder = [
    "valuation", "profitability", "growth", "momentum", "entry_rating",
  ];

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base">Analyst Recommendation</CardTitle>
          {hasProprietary && proprietary?.report_title && (
            <p className="text-xs text-muted-foreground">{proprietary.report_title}</p>
          )}
        </div>
      </CardHeader>
      <CardContent className="py-2 px-4">
        {hasProprietary && proprietary ? (
          /* Proprietary Analysis with Tabs */
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">
                <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="analysis">
                <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                Analysis
              </TabsTrigger>
              <TabsTrigger value="scores">
                <Target className="w-3.5 h-3.5 mr-1.5" />
                Scores
              </TabsTrigger>
              <TabsTrigger value="report">
                <FileCheck className="w-3.5 h-3.5 mr-1.5" />
                Report
              </TabsTrigger>
            </TabsList>

            {/* OVERVIEW TAB */}
            <TabsContent value="overview" className="space-y-4 mt-4">
              <div className="flex items-center justify-between p-4 bg-accent rounded-lg">
                <span className="text-sm font-medium uppercase tracking-wide">Recommendation</span>
                <Badge className={`${getRatingColorClass(proprietary.analyst_recommendation || "")} text-base px-3 py-1`}>
                  {proprietary.analyst_recommendation || "N/A"}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {proprietary.current_market_price && (
                  <div className="p-4 bg-card border rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">Current Price</div>
                    <div className="text-2xl font-bold">₹{proprietary.current_market_price.toFixed(2)}</div>
                  </div>
                )}
                {proprietary.target_price && (
                  <div className="p-4 bg-positive/10 border-2 border-positive/30 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">Target Price</div>
                    <div className="text-2xl font-bold text-positive">₹{proprietary.target_price.toFixed(2)}</div>
                    {proprietary.current_market_price && (
                      <div className="text-xs text-positive mt-1">
                        +{(((proprietary.target_price - proprietary.current_market_price) / proprietary.current_market_price) * 100).toFixed(1)}% upside
                      </div>
                    )}
                  </div>
                )}
              </div>

              {proprietary.entry_point && (
                <div className="p-4 bg-accent rounded-lg">
                  <div className="text-xs text-muted-foreground mb-2">Recommended Entry Point</div>
                  <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold">₹{proprietary.entry_point.toFixed(2)}</div>
                    {proprietary.entry_rating && (
                      <Badge className={getRatingColorClass(proprietary.entry_rating)}>
                        {proprietary.entry_rating}
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-2 text-xs text-muted-foreground">
                View the Analysis tab for detailed metrics or Scores tab for breakdown.
              </div>
            </TabsContent>

            {/* ANALYSIS TAB */}
            <TabsContent value="analysis" className="space-y-4 mt-4">
              <div className="space-y-2">
                <div className="text-sm font-semibold uppercase tracking-wider py-2 px-3 bg-accent/50 rounded flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Valuation
                </div>
                <div className="space-y-1.5 pl-2">
                  {proprietary.valuation_metric && (
                    <div className="flex items-center justify-between px-3 py-2 hover-elevate rounded">
                      <span className="text-xs text-muted-foreground">Metric</span>
                      <Badge className={getRatingColorClass(proprietary.valuation_metric)}>
                        {proprietary.valuation_metric}
                      </Badge>
                    </div>
                  )}
                  {proprietary.valuation_dcf && (
                    <div className="flex items-center justify-between px-3 py-2 hover-elevate rounded">
                      <span className="text-xs text-muted-foreground">DCF Valuation</span>
                      <span className="text-sm font-semibold font-mono">₹{proprietary.valuation_dcf.toFixed(2)}</span>
                    </div>
                  )}
                  {proprietary.reverse_dcf && (
                    <div className="flex items-center justify-between px-3 py-2 hover-elevate rounded">
                      <span className="text-xs text-muted-foreground">Reverse DCF</span>
                      <span className="text-sm font-semibold font-mono">₹{proprietary.reverse_dcf.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold uppercase tracking-wider py-2 px-3 bg-accent/50 rounded flex items-center gap-2">
                  <BarChart3 className="w-3.5 h-3.5" />
                  Performance
                </div>
                <div className="space-y-1.5 pl-2">
                  {proprietary.performance_benchmark !== null && proprietary.performance_benchmark !== undefined && (
                    <div className="flex items-center justify-between px-3 py-2 hover-elevate rounded">
                      <span className="text-xs text-muted-foreground">Benchmark</span>
                      <span className="text-sm font-semibold font-mono">{(proprietary.performance_benchmark * 100).toFixed(1)}%</span>
                    </div>
                  )}
                  {proprietary.performance_pct_of_benchmark !== null && proprietary.performance_pct_of_benchmark !== undefined && (
                    <div className="flex items-center justify-between px-3 py-2 hover-elevate rounded">
                      <span className="text-xs text-muted-foreground">vs Benchmark</span>
                      <span className={`text-sm font-semibold font-mono ${getValueColorClass(proprietary.performance_pct_of_benchmark)}`}>
                        {(proprietary.performance_pct_of_benchmark * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold uppercase tracking-wider py-2 px-3 bg-accent/50 rounded flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Growth
                </div>
                <div className="space-y-1.5 pl-2">
                  {proprietary.growth_expected_vs_projections !== null && proprietary.growth_expected_vs_projections !== undefined && (
                    <div className="flex items-center justify-between px-3 py-2 hover-elevate rounded">
                      <span className="text-xs text-muted-foreground">Expected Growth</span>
                      <span className={`text-sm font-semibold font-mono ${getValueColorClass(proprietary.growth_expected_vs_projections)}`}>
                        {(proprietary.growth_expected_vs_projections * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                  {proprietary.growth_vs_sector_rate !== null && proprietary.growth_vs_sector_rate !== undefined && (
                    <div className="flex items-center justify-between px-3 py-2 hover-elevate rounded">
                      <span className="text-xs text-muted-foreground">vs Sector Rate</span>
                      <span className={`text-sm font-semibold font-mono ${getValueColorClass(proprietary.growth_vs_sector_rate)}`}>
                        {(proprietary.growth_vs_sector_rate * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold uppercase tracking-wider py-2 px-3 bg-accent/50 rounded flex items-center gap-2">
                  <BarChart3 className="w-3.5 h-3.5" />
                  Profitability
                </div>
                <div className="space-y-1.5 pl-2">
                  {proprietary.profitability_metric && (
                    <div className="flex items-center justify-between px-3 py-2 hover-elevate rounded">
                      <span className="text-xs text-muted-foreground">Metric</span>
                      <Badge className={getRatingColorClass(proprietary.profitability_metric)}>
                        {proprietary.profitability_metric}
                      </Badge>
                    </div>
                  )}
                  {proprietary.profitability_pct_of_revenue !== null && proprietary.profitability_pct_of_revenue !== undefined && (
                    <div className="flex items-center justify-between px-3 py-2 hover-elevate rounded">
                      <span className="text-xs text-muted-foreground">% of Revenue</span>
                      <span className="text-sm font-semibold font-mono">{(proprietary.profitability_pct_of_revenue * 100).toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* SCORES TAB - Score Breakdown with accordion */}
            <TabsContent value="scores" className="space-y-2 mt-4">
              {scorecardLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="rounded-lg border border-border/50 p-3">
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-5 w-16" />
                      </div>
                      <Skeleton className="h-3 w-48 mt-2" />
                    </div>
                  ))}
                </div>
              ) : scorecardData?.scores ? (
                <div className="space-y-2">
                  {dimensionOrder.map((key) => {
                    const score = scorecardData.scores?.[key as keyof typeof scorecardData.scores];
                    if (!score) return null;
                    return (
                      <ScoreAccordionItem
                        key={key}
                        dimensionKey={key}
                        score={score}
                        isOpen={openDimension === key}
                        onToggle={() => setOpenDimension(openDimension === key ? null : key)}
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No score breakdown available
                </p>
              )}
            </TabsContent>

            {/* REPORT TAB */}
            <TabsContent value="report" className="space-y-4 mt-4">
              {proprietary.growth_notes && (
                <div className="space-y-2">
                  <div className="text-sm font-semibold uppercase tracking-wider py-2 px-3 bg-accent/50 rounded">
                    Growth Analysis
                  </div>
                  <p className="text-sm leading-relaxed px-3 text-muted-foreground">{proprietary.growth_notes}</p>
                </div>
              )}

              {proprietary.notes && (
                <div className="space-y-2">
                  <div className="text-sm font-semibold uppercase tracking-wider py-2 px-3 bg-accent/50 rounded">
                    Analyst Notes
                  </div>
                  <p className="text-sm leading-relaxed px-3 text-muted-foreground">{proprietary.notes}</p>
                </div>
              )}

              {proprietary.pdf_file_name && (
                <div className="pt-2">
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <a
                      href={`${getApiBaseUrl()}/api/stock-analysis/${ticker}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Download Full Report (PDF)
                    </a>
                  </Button>
                </div>
              )}

              <div className="pt-4 border-t space-y-2">
                <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Analyst Details
                </div>
                <div className="space-y-2 text-sm">
                  {proprietary.analyst_name ? (
                    <div className="flex items-center justify-between px-3 py-2 hover-elevate rounded">
                      <span className="text-xs text-muted-foreground">Analyst</span>
                      <span className="font-medium">{proprietary.analyst_name}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic px-3">Analyst information not available</p>
                  )}
                  {proprietary.sector && (
                    <div className="flex items-center justify-between px-3 py-2 hover-elevate rounded">
                      <span className="text-xs text-muted-foreground">Sector</span>
                      <span className="font-medium">{proprietary.sector}</span>
                    </div>
                  )}
                  {proprietary.analysis_date && (
                    <div className="flex items-center justify-between px-3 py-2 hover-elevate rounded">
                      <span className="text-xs text-muted-foreground">Date</span>
                      <span className="font-medium">{new Date(proprietary.analysis_date).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        ) : external && external.analyst_ratings ? (
          /* External Analyst Data with Scores Tab */
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="overview">
                <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="scores">
                <Target className="w-3.5 h-3.5 mr-1.5" />
                Scores
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
              <Badge variant="outline" className="mb-2">External Source</Badge>

              <div className="space-y-3">
                {external.analyst_ratings.recommendation && (
                  <div className="flex items-center justify-between p-3 bg-accent rounded-lg">
                    <span className="text-sm text-muted-foreground">Consensus</span>
                    <Badge className={getRatingColorClass(external.analyst_ratings.recommendation)}>
                      {external.analyst_ratings.recommendation}
                    </Badge>
                  </div>
                )}

                {external.analyst_ratings.target_mean_price && (
                  <div className="flex items-center justify-between px-3 py-2 hover-elevate rounded">
                    <span className="text-sm text-muted-foreground">Target Mean</span>
                    <span className="font-semibold font-mono">
                      ₹{external.analyst_ratings.target_mean_price.toFixed(2)}
                    </span>
                  </div>
                )}

                {external.analyst_ratings.number_of_analysts && (
                  <div className="flex items-center justify-between px-3 py-2 hover-elevate rounded">
                    <span className="text-sm text-muted-foreground">Number of Analysts</span>
                    <span className="font-semibold">{external.analyst_ratings.number_of_analysts}</span>
                  </div>
                )}
              </div>

              {external.research_reports && external.research_reports.length > 0 && (
                <div className="pt-4 border-t space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent Reports</p>
                  <div className="space-y-2">
                    {external.research_reports.slice(0, 3).map((report: any, idx: number) => (
                      <div key={idx} className="text-sm px-3 py-2 hover-elevate rounded">
                        <span className="font-medium">{report.firm}</span>
                        <span className="text-muted-foreground"> → </span>
                        <span>{report.to_grade}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* SCORES TAB for external - Same accordion behavior */}
            <TabsContent value="scores" className="space-y-2 mt-4">
              {scorecardLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="rounded-lg border border-border/50 p-3">
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-5 w-16" />
                      </div>
                      <Skeleton className="h-3 w-48 mt-2" />
                    </div>
                  ))}
                </div>
              ) : scorecardData?.scores ? (
                <div className="space-y-2">
                  {dimensionOrder.map((key) => {
                    const score = scorecardData.scores?.[key as keyof typeof scorecardData.scores];
                    if (!score) return null;
                    return (
                      <ScoreAccordionItem
                        key={key}
                        dimensionKey={key}
                        score={score}
                        isOpen={openDimension === key}
                        onToggle={() => setOpenDimension(openDimension === key ? null : key)}
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No score breakdown available
                </p>
              )}
            </TabsContent>
          </Tabs>
        ) : null}
      </CardContent>
    </Card>
  );
}
