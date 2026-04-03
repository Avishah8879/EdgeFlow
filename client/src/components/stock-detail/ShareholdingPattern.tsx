import { Fragment, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Users, BarChart3, ChevronDown, ChevronRight } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  useShareholding,
  type ShareholdingCategory,
} from "@/hooks/use-shareholding";

// =============================================================================
// Category colors
// =============================================================================

const CATEGORIES = [
  { key: "Promoters", color: "hsl(var(--chart-1, 220 70% 50%))" },
  { key: "FIIs", color: "hsl(var(--positive))" },
  { key: "DIIs", color: "#3b82f6" },
  { key: "Public", color: "hsl(var(--negative))" },
  { key: "Government", color: "#a855f7" },
] as const;

const CATEGORY_COLOR_MAP: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.color])
);

const FALLBACK_COLOR = "#6b7280";

function getCategoryColor(name: string) {
  return CATEGORY_COLOR_MAP[name] ?? FALLBACK_COLOR;
}

// =============================================================================
// Custom tooltip
// =============================================================================

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
}

function ShareholdingTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="font-medium text-foreground mb-1.5">{label}</p>
      {[...payload].reverse().map((entry) => (
        <div key={entry.name} className="flex justify-between gap-6 py-0.5">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            {entry.name}
          </span>
          <span className="font-mono font-medium">
            {entry.value != null ? `${entry.value.toFixed(2)}%` : "N/A"}
          </span>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Breakdown table
// =============================================================================

function ShareholdingTable({
  quarters,
  data,
}: {
  quarters: string[];
  data: ShareholdingCategory[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Display oldest → newest (left to right) like screener.in, cap at last 12
  const displayQuarters = [...quarters].reverse().slice(-12);

  const toggleExpand = (category: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 pr-4 text-muted-foreground font-medium sticky left-0 bg-card z-10">
              Category
            </th>
            {displayQuarters.map((q) => (
              <th
                key={q}
                className="text-right py-2 px-2 text-muted-foreground font-medium whitespace-nowrap"
              >
                {q}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const color = getCategoryColor(row.category);
            const hasSharers = row.shareholders && row.shareholders.length > 0;
            const isExpanded = expanded.has(row.category);

            return (
              <Fragment key={row.category}>
                {/* Category aggregate row */}
                <tr
                  className={`border-b border-border/50 ${hasSharers ? "cursor-pointer hover:bg-muted/30" : ""}`}
                  onClick={hasSharers ? () => toggleExpand(row.category) : undefined}
                >
                  <td className="py-2 pr-4 font-medium sticky left-0 bg-card z-10">
                    <span className="flex items-center gap-2">
                      {hasSharers ? (
                        isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        )
                      ) : (
                        <span className="w-3.5 shrink-0" />
                      )}
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      {row.category}
                    </span>
                  </td>
                  {[...row.values].reverse().slice(-12).map((val, idx, arr) => {
                    const olderVal = idx > 0 ? arr[idx - 1] : null;
                    const change =
                      val != null && olderVal != null
                        ? Math.round((val - olderVal) * 100) / 100
                        : null;

                    return (
                      <td key={idx} className="text-right py-2 px-2 font-mono">
                        <div>
                          <span className="text-sm">
                            {val != null ? `${val.toFixed(2)}%` : "-"}
                          </span>
                          {change != null && Math.abs(change) >= 0.01 && (
                            <div
                              className={`text-xs ${
                                change > 0
                                  ? "text-positive"
                                  : "text-negative"
                              }`}
                            >
                              {change > 0 ? "+" : ""}
                              {change.toFixed(2)}
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* Individual shareholder sub-rows */}
                {isExpanded &&
                  row.shareholders.map((sh) => (
                    <tr
                      key={`${row.category}-${sh.name}`}
                      className="border-b border-border/20"
                    >
                      <td className="py-1.5 pr-4 sticky left-0 bg-card z-10">
                        <span className="flex items-center gap-2 pl-[22px] text-muted-foreground text-xs">
                          <span className="w-2 shrink-0" />
                          {sh.name}
                        </span>
                      </td>
                      {[...sh.values].reverse().slice(-12).map((val, idx, arr) => {
                        const olderVal =
                          idx > 0 ? arr[idx - 1] : null;
                        const change =
                          val != null && olderVal != null
                            ? Math.round((val - olderVal) * 100) / 100
                            : null;

                        return (
                          <td
                            key={idx}
                            className="text-right py-1.5 px-2 font-mono text-muted-foreground"
                          >
                            <div>
                              <span className="text-xs">
                                {val != null ? `${val.toFixed(2)}%` : "-"}
                              </span>
                              {change != null &&
                                Math.abs(change) >= 0.01 && (
                                  <div
                                    className={`text-[10px] ${
                                      change > 0
                                        ? "text-positive"
                                        : "text-negative"
                                    }`}
                                  >
                                    {change > 0 ? "+" : ""}
                                    {change.toFixed(2)}
                                  </div>
                                )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
// Main component
// =============================================================================

interface ShareholdingPatternProps {
  ticker: string;
}

export default function ShareholdingPattern({ ticker }: ShareholdingPatternProps) {
  const [view, setView] = useState<"quarterly" | "yearly">("quarterly");
  const { data, isLoading, error } = useShareholding(ticker, view);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Shareholding Pattern</CardTitle>
          </div>
          {/* Quarterly / Yearly toggle */}
          <div className="flex gap-1">
            <Button
              variant={view === "quarterly" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("quarterly")}
            >
              Quarterly
            </Button>
            <Button
              variant={view === "yearly" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("yearly")}
            >
              Yearly
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Loading */}
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-[300px] w-full rounded-md" />
            <Skeleton className="h-40 w-full rounded-md" />
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-2">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Shareholding data not available
            </p>
            <p className="text-xs text-muted-foreground/70">
              {(error as Error).message}
            </p>
          </div>
        )}

        {/* Data */}
        {data && !isLoading && (
          <>
            {/* Line Chart */}
            {data.chart_data.length > 1 && (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={data.chart_data}
                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      opacity={0.5}
                    />
                    <XAxis
                      dataKey="quarter"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={{ stroke: "hsl(var(--border))" }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v: number) => `${v}%`}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={{ stroke: "hsl(var(--border))" }}
                      tickLine={false}
                    />
                    <Tooltip content={<ShareholdingTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                      iconType="circle"
                      iconSize={8}
                    />
                    {/* Render lines for each category that exists in the data */}
                    {CATEGORIES.filter((cat) =>
                      data.chart_data.some(
                        (d) => d[cat.key] != null && Number(d[cat.key]) > 0
                      )
                    ).map((cat) => (
                      <Line
                        key={cat.key}
                        type="monotone"
                        dataKey={cat.key}
                        stroke={cat.color}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 0 }}
                      />
                    ))}
                    {/* Render any extra categories not in our predefined list */}
                    {data.data
                      .filter(
                        (row) => !CATEGORIES.some((c) => c.key === row.category)
                      )
                      .map((row) => (
                        <Line
                          key={row.category}
                          type="monotone"
                          dataKey={row.category}
                          stroke={FALLBACK_COLOR}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, strokeWidth: 0 }}
                        />
                      ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Breakdown Table */}
            {data.data.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-muted-foreground" />
                  Detailed Breakdown
                </h3>
                <ShareholdingTable
                  quarters={data.quarters}
                  data={data.data}
                />
              </div>
            )}

          </>
        )}
      </CardContent>
    </Card>
  );
}
