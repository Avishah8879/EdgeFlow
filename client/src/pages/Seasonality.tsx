import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TickerCombobox } from "@/components/strategy-backtest/TickerCombobox";
import { useHourlyTickerOptions } from "@/hooks/use-hourly-ticker-options";
import { useSeasonality } from "@/hooks/use-seasonality";
import type { WeeklyStat, MonthlyStat, YearlyHeatmapEntry } from "@/hooks/use-seasonality";
import { useSmartLoader } from "@/hooks/use-smart-loader";
import { SEO } from "@/components/SEO";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  Tooltip as RechartsTooltip,
} from "recharts";
import { Calendar, TrendingUp, TrendingDown, BarChart3, Info } from "lucide-react";
import { cn } from "@/lib/utils";

function getHeatmapBg(value: number): string {
  if (value > 2) return "bg-green-600/80";
  if (value > 1) return "bg-green-500/60";
  if (value > 0.5) return "bg-green-400/40";
  if (value > 0) return "bg-green-400/20";
  if (value > -0.5) return "bg-red-400/20";
  if (value > -1) return "bg-red-400/40";
  if (value > -2) return "bg-red-500/60";
  return "bg-red-600/80";
}

function getBarColor(value: number): string {
  return value >= 0 ? "hsl(142, 71%, 45%)" : "hsl(0, 72%, 51%)";
}

function WeeklyBarChart({ data }: { data: WeeklyStat[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          Average Weekly Returns (%)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 10 }}
                interval={3}
                className="text-muted-foreground"
              />
              <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelFormatter={(v) => `Week ${v}`}
                formatter={(value: number) => [`${value.toFixed(4)}%`, "Avg Return"]}
              />
              <Bar dataKey="avg_return" radius={[2, 2, 0, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={getBarColor(entry.avg_return)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function MonthlyBarChart({ data }: { data: MonthlyStat[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Average Monthly Returns (%)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
              <XAxis dataKey="month_name" tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value: number) => [`${value.toFixed(4)}%`, "Avg Return"]}
              />
              <Bar dataKey="avg_return" radius={[2, 2, 0, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={getBarColor(entry.avg_return)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function YearlyHeatmap({ data }: { data: YearlyHeatmapEntry[] }) {
  const weeks = Array.from({ length: 52 }, (_, i) => i + 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Weekly Returns Heatmap
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Header row */}
            <div className="flex gap-[1px] mb-1">
              <div className="w-12 shrink-0 text-xs text-muted-foreground font-medium">Year</div>
              {weeks.map((w) => (
                <div
                  key={w}
                  className="flex-1 text-[8px] text-center text-muted-foreground"
                >
                  {w % 4 === 1 ? w : ""}
                </div>
              ))}
            </div>
            {/* Data rows */}
            {data.map((yearData) => (
              <div key={yearData.year} className="flex gap-[1px] mb-[1px]">
                <div className="w-12 shrink-0 text-xs text-muted-foreground font-mono">
                  {yearData.year}
                </div>
                {weeks.map((w) => {
                  const val = yearData.weeks[w];
                  return (
                    <Tooltip key={w}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "flex-1 h-5 rounded-[2px] transition-colors",
                            val !== undefined ? getHeatmapBg(val) : "bg-muted/20"
                          )}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <p className="font-medium">
                          {yearData.year} - Week {w}
                        </p>
                        <p>
                          {val !== undefined ? `${val > 0 ? "+" : ""}${val.toFixed(2)}%` : "No data"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
            {/* Legend */}
            <div className="flex items-center justify-center gap-1 mt-3 text-xs text-muted-foreground">
              <span>-2%+</span>
              <div className="flex gap-[1px]">
                {["bg-red-600/80", "bg-red-500/60", "bg-red-400/40", "bg-red-400/20", "bg-green-400/20", "bg-green-400/40", "bg-green-500/60", "bg-green-600/80"].map((cls, i) => (
                  <div key={i} className={cn("w-6 h-3 rounded-[1px]", cls)} />
                ))}
              </div>
              <span>+2%+</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function WeeklyStatsTable({ data }: { data: WeeklyStat[] }) {
  const [sortKey, setSortKey] = useState<keyof WeeklyStat>("week");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  const toggleSort = (key: keyof WeeklyStat) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const thClass = "text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground px-3 py-2 text-right first:text-left";
  const tdClass = "text-xs font-mono px-3 py-1.5 text-right first:text-left";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Info className="w-4 h-4" />
          Weekly Statistics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto max-h-80">
          <table className="w-full">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border">
                <th className={thClass} onClick={() => toggleSort("week")}>
                  Week {sortKey === "week" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th className={thClass} onClick={() => toggleSort("avg_return")}>
                  Avg Return {sortKey === "avg_return" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th className={thClass} onClick={() => toggleSort("median_return")}>
                  Median {sortKey === "median_return" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th className={thClass} onClick={() => toggleSort("win_rate")}>
                  Win Rate {sortKey === "win_rate" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th className={thClass} onClick={() => toggleSort("std_dev")}>
                  Std Dev {sortKey === "std_dev" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th className={thClass} onClick={() => toggleSort("count")}>
                  Samples {sortKey === "count" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.week} className="border-b border-border/50 hover:bg-muted/20">
                  <td className={tdClass}>{row.week}</td>
                  <td className={cn(tdClass, row.avg_return >= 0 ? "text-positive" : "text-negative")}>
                    {row.avg_return >= 0 ? "+" : ""}{row.avg_return.toFixed(2)}%
                  </td>
                  <td className={cn(tdClass, row.median_return >= 0 ? "text-positive" : "text-negative")}>
                    {row.median_return >= 0 ? "+" : ""}{row.median_return.toFixed(2)}%
                  </td>
                  <td className={cn(tdClass, row.win_rate >= 50 ? "text-positive" : "text-negative")}>
                    {row.win_rate.toFixed(1)}%
                  </td>
                  <td className={tdClass}>{row.std_dev.toFixed(2)}</td>
                  <td className={tdClass}>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Seasonality() {
  const [ticker, setTicker] = useState("");

  const tickersQuery = useHourlyTickerOptions();
  const tickerOptions = tickersQuery.data ?? [];

  const { data, isLoading, error } = useSeasonality(ticker || undefined);

  const { showSkeleton } = useSmartLoader(isLoading);

  return (
    <>
      <SEO
        title="Seasonality Analysis - Equity Pro"
        description="Analyze weekly and monthly seasonal return patterns for Indian stocks. Identify recurring trends using up to 10 years of historical data."
        canonical="/seasonality"
      />

      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Seasonality Analysis</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Analyze weekly and monthly return patterns to identify recurring seasonal trends.
          </p>
        </div>

        {/* Controls */}
        <Card className="mb-6">
          <CardContent className="pt-4 pb-4">
            <div className="max-w-md">
              <Label className="text-xs mb-1.5 block">Stock</Label>
              <TickerCombobox
                options={tickerOptions}
                value={ticker}
                onValueChange={setTicker}
                placeholder="Search and select stock..."
                isLoading={tickersQuery.isLoading}
              />
            </div>
          </CardContent>
        </Card>

        {/* Empty state */}
        {!ticker && (
          <div className="text-center py-16">
            <Calendar className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
            <h2 className="text-lg font-medium text-muted-foreground">Select a stock to analyze</h2>
            <p className="text-sm text-muted-foreground/60 mt-1">
              Choose a stock above to view its weekly and monthly seasonal return patterns.
            </p>
          </div>
        )}

        {/* Loading skeleton */}
        {ticker && showSkeleton && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-72 rounded-lg" />
            <Skeleton className="h-48 rounded-lg" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <Card className="border-destructive/50">
            <CardContent className="py-6 text-center">
              <p className="text-sm text-destructive">
                Failed to load seasonality data. {error.message}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {data && !showSkeleton && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs text-muted-foreground">Years of Data</p>
                  <p className="text-2xl font-semibold mt-1">{data.summary.years_covered}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {data.summary.data_range.start} — {data.summary.data_range.end}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs text-muted-foreground">Avg Weekly Return</p>
                  <p className={cn(
                    "text-2xl font-semibold mt-1",
                    data.summary.overall_avg_weekly_return >= 0 ? "text-positive" : "text-negative",
                  )}>
                    {data.summary.overall_avg_weekly_return >= 0 ? "+" : ""}
                    {data.summary.overall_avg_weekly_return.toFixed(2)}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {data.summary.total_weeks} total weeks
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs text-muted-foreground">Best Week</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <TrendingUp className="w-5 h-5 text-positive" />
                    <span className="text-2xl font-semibold text-positive">
                      #{data.summary.best_week}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Highest avg return</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs text-muted-foreground">Worst Week</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <TrendingDown className="w-5 h-5 text-negative" />
                    <span className="text-2xl font-semibold text-negative">
                      #{data.summary.worst_week}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Lowest avg return</p>
                </CardContent>
              </Card>
            </div>

            {/* Weekly bar chart */}
            <WeeklyBarChart data={data.weekly_stats} />

            {/* Heatmap */}
            <YearlyHeatmap data={data.yearly_heatmap} />

            {/* Monthly chart + Stats table side by side on desktop */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <MonthlyBarChart data={data.monthly_stats} />
              <WeeklyStatsTable data={data.weekly_stats} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
