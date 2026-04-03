import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  ArrowLeft,
  TrendingUp,
  BarChart3,
  RefreshCw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// Types
interface ReportListItem {
  symbol: string;
  longName: string;
  recommendation: string;
  valuationMetric: string;
  analysisDate: string;
}

interface StockReport {
  symbol: string;
  longName: string;
  sector: string | null;
  industry: string | null;
  // Scorecard
  valuationMetric: string | null;
  profitabilityMetric: string | null;
  analystRecommendation: string | null;
  entryRating: string | null;
  entryPoint: number | null;
  targetPrice: number | null;
  // Analysis
  performanceBenchmark: number | null;
  performancePctOfBenchmark: number | null;
  growthExpectedVsProjections: number | null;
  growthVsSectorRate: number | null;
  growthNotes: string | null;
  profitabilityPctOfRevenue: number | null;
  // Metadata
  reportTitle: string | null;
  analystName: string | null;
  notes: string | null;
  analysisDate: string | null;
  // Financial Statements
  incomeStatement: Record<string, Record<string, number>> | null;
  balanceSheet: Record<string, Record<string, number>> | null;
  cashFlow: Record<string, Record<string, number>> | null;
}

// Color mappings for badges
const getValuationColor = (value: string | null) => {
  if (!value) return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  const lower = value.toLowerCase();
  if (lower.includes("undervalued"))
    return "bg-green-500/20 text-green-400 border-green-500/30";
  if (lower.includes("overvalued"))
    return "bg-red-500/20 text-red-400 border-red-500/30";
  return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
};

const getProfitabilityColor = (value: string | null) => {
  if (!value) return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  const lower = value.toLowerCase();
  if (lower === "high" || lower === "excellent")
    return "bg-green-500/20 text-green-400 border-green-500/30";
  if (lower === "good")
    return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (lower === "average")
    return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  if (lower === "low" || lower === "poor")
    return "bg-red-500/20 text-red-400 border-red-500/30";
  return "bg-gray-500/20 text-gray-400 border-gray-500/30";
};

const getRecommendationColor = (value: string | null) => {
  if (!value) return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  const lower = value.toLowerCase();
  if (lower === "buy" || lower === "strong buy")
    return "bg-green-500/20 text-green-400 border-green-500/30";
  if (lower === "hold")
    return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  if (lower === "sell" || lower === "strong sell")
    return "bg-red-500/20 text-red-400 border-red-500/30";
  return "bg-gray-500/20 text-gray-400 border-gray-500/30";
};

const getEntryRatingColor = (value: string | null) => {
  if (!value) return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  const lower = value.toLowerCase();
  if (lower === "good" || lower === "excellent")
    return "bg-green-500/20 text-green-400 border-green-500/30";
  if (lower === "average")
    return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  if (lower === "bad" || lower === "poor")
    return "bg-red-500/20 text-red-400 border-red-500/30";
  return "bg-gray-500/20 text-gray-400 border-gray-500/30";
};

// Format number as percentage
const formatPercent = (value: number | null, decimals: number = 1) => {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(decimals)}%`;
};

// Format number in Indian Crores
const formatCrores = (value: number | null) => {
  if (value === null || value === undefined) return "—";
  // Values in the DB appear to already be in their base unit
  const crores = value / 10000000; // 1 crore = 10 million
  if (Math.abs(crores) >= 1) {
    return `₹${crores.toFixed(2)} Cr`;
  }
  return `₹${value.toLocaleString("en-IN")}`;
};

export function ResearchReportsPanel() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch list of stocks with reports
  const {
    data: reportsList = [],
    isLoading: isLoadingList,
    refetch: refetchList,
  } = useQuery<ReportListItem[]>({
    queryKey: ["/api/research-reports/list"],
    staleTime: 30 * 60 * 1000,
  });

  // Fetch detailed report when a symbol is selected
  const { data: report, isLoading: isLoadingReport } = useQuery<StockReport>({
    queryKey: ["/api/research-reports", selectedSymbol],
    enabled: !!selectedSymbol,
    staleTime: 30 * 60 * 1000,
  });

  // Filter list based on search
  const filteredList = useMemo(() => {
    if (!searchTerm) return reportsList;
    const search = searchTerm.toLowerCase();
    return reportsList.filter(
      (item) =>
        item.symbol.toLowerCase().includes(search) ||
        item.longName.toLowerCase().includes(search)
    );
  }, [reportsList, searchTerm]);

  // Reset highlighted index when filtered list changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredList.length, searchTerm]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (listRef.current && filteredList.length > 0) {
      const highlightedElement = listRef.current.querySelector(
        `[data-index="${highlightedIndex}"]`
      );
      highlightedElement?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, filteredList.length]);

  // Keyboard navigation handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredList.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          Math.min(prev + 1, filteredList.length - 1)
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filteredList[highlightedIndex]) {
          setSelectedSymbol(filteredList[highlightedIndex].symbol);
        }
        break;
      case "Escape":
        e.preventDefault();
        if (searchTerm) {
          setSearchTerm("");
        }
        break;
    }
  };

  // Render stock list view
  const renderListView = () => (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wide font-bold text-foreground">
            RESEARCH REPORTS
          </span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[9px] px-1.5 py-0">
              {filteredList.length} STOCKS
            </Badge>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => refetchList()}
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        </div>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Search by symbol or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      {/* Stock List */}
      <ScrollArea className="flex-1">
        {isLoadingList ? (
          <div className="p-3 space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="animate-pulse h-12 bg-muted/20 rounded" />
            ))}
          </div>
        ) : filteredList.length > 0 ? (
          <div className="p-2" ref={listRef}>
            {filteredList.map((item, index) => (
              <button
                key={item.symbol}
                data-index={index}
                onClick={() => setSelectedSymbol(item.symbol)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={cn(
                  "w-full px-3 py-2 rounded transition-colors text-left flex items-center justify-between group",
                  index === highlightedIndex
                    ? "bg-muted/50"
                    : "hover:bg-muted/30"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-bold text-primary">
                      {item.symbol}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] px-1.5 py-0",
                        getRecommendationColor(item.recommendation)
                      )}
                    >
                      {item.recommendation}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {item.longName}
                  </p>
                </div>
                <ArrowLeft
                  className={cn(
                    "w-4 h-4 text-muted-foreground rotate-180 transition-opacity",
                    index === highlightedIndex
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100"
                  )}
                />
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            No stocks found
          </div>
        )}
      </ScrollArea>
    </div>
  );

  // Render detail view
  const renderDetailView = () => {
    if (!report) return null;

    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="px-3 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setSelectedSymbol(null)}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono font-bold text-primary">
                  {report.symbol}
                </span>
                {report.sector && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                    {report.sector}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {report.longName}
              </p>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-3 space-y-4">
            {/* Stock Scorecard */}
            <div className="bg-card/50 rounded-lg p-3 border border-border">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
                Stock Scorecard
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase">
                    Valuation
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs px-2 py-0.5",
                      getValuationColor(report.valuationMetric)
                    )}
                  >
                    {report.valuationMetric || "—"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase">
                    Profitability
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs px-2 py-0.5",
                      getProfitabilityColor(report.profitabilityMetric)
                    )}
                  >
                    {report.profitabilityMetric || "—"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase">
                    Recommendation
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs px-2 py-0.5",
                      getRecommendationColor(report.analystRecommendation)
                    )}
                  >
                    {report.analystRecommendation || "—"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase">
                    Entry Rating
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs px-2 py-0.5",
                      getEntryRatingColor(report.entryRating)
                    )}
                  >
                    {report.entryRating || "—"}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Analysis Section */}
            <div className="bg-card/50 rounded-lg p-3 border border-border">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
                Analysis
              </h3>
              <div className="space-y-4">
                {/* Valuation */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      Valuation
                    </span>
                  </div>
                  <div className="pl-5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Metric
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs px-2 py-0.5",
                          getValuationColor(report.valuationMetric)
                        )}
                      >
                        {report.valuationMetric || "—"}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Performance */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      Performance
                    </span>
                  </div>
                  <div className="pl-5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Benchmark
                      </span>
                      <span
                        className={cn(
                          "text-xs font-mono",
                          report.performanceBenchmark !== null &&
                            report.performanceBenchmark >= 0
                            ? "text-green-400"
                            : "text-red-400"
                        )}
                      >
                        {formatPercent(report.performanceBenchmark)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        vs Benchmark
                      </span>
                      <span
                        className={cn(
                          "text-xs font-mono",
                          report.performancePctOfBenchmark !== null &&
                            report.performancePctOfBenchmark >= 1
                            ? "text-green-400"
                            : "text-red-400"
                        )}
                      >
                        {formatPercent(report.performancePctOfBenchmark)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Growth */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      Growth
                    </span>
                  </div>
                  <div className="pl-5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Expected Growth
                      </span>
                      <span
                        className={cn(
                          "text-xs font-mono",
                          report.growthExpectedVsProjections !== null &&
                            report.growthExpectedVsProjections >= 0
                            ? "text-green-400"
                            : "text-red-400"
                        )}
                      >
                        {formatPercent(report.growthExpectedVsProjections)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Profitability */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      Profitability
                    </span>
                  </div>
                  <div className="pl-5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Metric
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs px-2 py-0.5",
                          getProfitabilityColor(report.profitabilityMetric)
                        )}
                      >
                        {report.profitabilityMetric || "—"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        % of Revenue
                      </span>
                      <span
                        className={cn(
                          "text-xs font-mono",
                          report.profitabilityPctOfRevenue !== null &&
                            report.profitabilityPctOfRevenue >= 0
                            ? "text-green-400"
                            : "text-red-400"
                        )}
                      >
                        {formatPercent(report.profitabilityPctOfRevenue)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Financial Statements */}
            {(report.incomeStatement ||
              report.balanceSheet ||
              report.cashFlow) && (
              <div className="bg-card/50 rounded-lg p-3 border border-border">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
                  Financial Statements
                </h3>
                <Tabs defaultValue="income" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 h-8 bg-muted/30 p-1">
                    <TabsTrigger
                      value="income"
                      className="text-[10px] py-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    >
                      Income Statement
                    </TabsTrigger>
                    <TabsTrigger
                      value="balance"
                      className="text-[10px] py-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    >
                      Balance Sheet
                    </TabsTrigger>
                    <TabsTrigger
                      value="cashflow"
                      className="text-[10px] py-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    >
                      Cash Flow
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="income" className="mt-2">
                    <FinancialTable data={report.incomeStatement} />
                  </TabsContent>

                  <TabsContent value="balance" className="mt-2">
                    <FinancialTable data={report.balanceSheet} />
                  </TabsContent>

                  <TabsContent value="cashflow" className="mt-2">
                    <FinancialTable data={report.cashFlow} />
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    );
  };

  // Loading state for detail view
  if (selectedSymbol && isLoadingReport) {
    return (
      <div className="h-full flex flex-col bg-card">
        <div className="px-3 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setSelectedSymbol(null)}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-mono font-bold text-primary">
              {selectedSymbol}
            </span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-card">
      {selectedSymbol && report ? renderDetailView() : renderListView()}
    </div>
  );
}

// Financial Table Component
function FinancialTable({
  data,
}: {
  data: Record<string, Record<string, number>> | null;
}) {
  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground text-xs">
        No data available
      </div>
    );
  }

  // Get years (sorted descending)
  const years = Object.keys(data)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 4);

  // Get all metrics from the first year
  const firstYearData = data[years[0]];
  const metrics = firstYearData ? Object.keys(firstYearData).sort() : [];

  // Format value
  const formatValue = (value: number | undefined) => {
    if (value === undefined || value === null) return "—";
    // Convert to crores (assuming values are in base unit)
    const crores = value / 10000000;
    if (Math.abs(crores) >= 0.01) {
      return `₹${crores.toFixed(2)} Cr`;
    }
    return `₹${value.toLocaleString("en-IN")}`;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 px-2 font-medium text-muted-foreground">
              Metric
            </th>
            {years.map((year) => (
              <th
                key={year}
                className="text-right py-2 px-2 font-medium text-muted-foreground font-mono"
              >
                {year}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric, idx) => (
            <tr
              key={metric}
              className={cn(
                "border-b border-border/50",
                idx % 2 === 0 ? "bg-muted/5" : ""
              )}
            >
              <td className="py-1.5 px-2 text-foreground">{metric}</td>
              {years.map((year) => (
                <td
                  key={year}
                  className="text-right py-1.5 px-2 font-mono text-muted-foreground"
                >
                  {formatValue(data[year]?.[metric])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
