import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChevronRight, BarChart2 } from "lucide-react";
import { useShareholding } from "@/hooks/use-shareholding";
import { cn } from "@/lib/utils";

const CATEGORY_COLORS: Record<string, string> = {
  Promoters: "#F59E0B",
  FIIs: "#10B981",
  DIIs: "#3B82F6",
  Public: "#EF4444",
  Government: "#A855F7",
};

const CHART_ORDER = ["Promoters", "FIIs", "DIIs", "Public", "Government"];

function formatPercent(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(decimals)}%`;
}

function formatDelta(curr: number | null, prev: number | null): { text: string; positive: boolean } | null {
  if (curr == null || prev == null) return null;
  const diff = curr - prev;
  if (Math.abs(diff) < 0.005) return null; // ignore essentially-zero deltas
  return {
    text: `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}`,
    positive: diff >= 0,
  };
}

export default function ShareholdingPanel({ ticker }: { ticker: string }) {
  const [view, setView] = useState<"quarterly" | "yearly">("quarterly");
  const { data, isLoading } = useShareholding(ticker, view);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <section className="rounded-xl border border-border/50 bg-card p-5 md:p-6">
      {/* Header with title + toggle */}
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Shareholding Pattern</h2>
        <div className="inline-flex rounded-full border border-border/50 p-1 bg-muted/40">
          <button
            type="button"
            onClick={() => setView("quarterly")}
            className={cn(
              "px-4 py-1 rounded-full text-xs font-medium transition-colors",
              view === "quarterly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            data-testid="toggle-shareholding-quarterly"
          >
            Quarterly
          </button>
          <button
            type="button"
            onClick={() => setView("yearly")}
            className={cn(
              "px-4 py-1 rounded-full text-xs font-medium transition-colors",
              view === "yearly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            data-testid="toggle-shareholding-yearly"
          >
            Yearly
          </button>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="text-sm text-muted-foreground py-6 text-center">Loading shareholding…</div>
      ) : data.data.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center">Shareholding data not available.</div>
      ) : (
        <>
          {/* CHART */}
          <div className="h-[320px] w-full mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.chart_data} margin={{ top: 10, right: 24, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" vertical={false} />
                <XAxis
                  dataKey="quarter"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  axisLine={{ stroke: "hsl(var(--border) / 0.5)" }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 60]}
                  ticks={[0, 15, 30, 45, 60]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value: number) => [`${value.toFixed(2)}%`]}
                />
                {CHART_ORDER.filter((cat) => data.data.some((d) => d.category === cat)).map((cat) => (
                  <Line
                    key={cat}
                    type="monotone"
                    dataKey={cat}
                    stroke={CATEGORY_COLORS[cat] ?? "#888"}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mb-6 text-xs">
            {CHART_ORDER.filter((cat) => data.data.some((d) => d.category === cat)).map((cat) => (
              <div key={cat} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: CATEGORY_COLORS[cat] }}
                />
                <span className="text-muted-foreground">{cat}</span>
              </div>
            ))}
          </div>

          {/* Detailed Breakdown */}
          <div className="border-t border-border/50 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Detailed Breakdown</h3>
            </div>

            <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border/70">
                    <th className="text-left py-2.5 pr-3 font-medium text-muted-foreground sticky left-0 bg-card whitespace-nowrap">
                      Category
                    </th>
                    {data.quarters.map((q) => (
                      <th key={q} className="text-right py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">
                        {q}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((row, idx) => {
                    const expanded = expandedCategories.has(row.category);
                    const hasShareholders = row.shareholders && row.shareholders.length > 0;
                    const color = CATEGORY_COLORS[row.category];
                    const stripe = idx % 2 === 1;

                    return (
                      <>
                        <tr
                          key={row.category}
                          className={cn(
                            "border-b border-border/30 transition-colors",
                            stripe && "bg-muted/20",
                            "hover:bg-muted/40",
                          )}
                        >
                          <td className={cn(
                            "py-2 pr-3 sticky left-0 whitespace-nowrap",
                            stripe ? "bg-muted/20" : "bg-card",
                          )}>
                            <button
                              type="button"
                              onClick={() => hasShareholders && toggleCategory(row.category)}
                              className={cn(
                                "flex items-center gap-2 text-foreground",
                                hasShareholders ? "cursor-pointer hover:text-primary transition-colors" : "cursor-default",
                              )}
                              data-testid={`shareholding-category-${row.category}`}
                            >
                              {hasShareholders ? (
                                <ChevronRight
                                  className={cn(
                                    "w-3.5 h-3.5 text-muted-foreground transition-transform",
                                    expanded && "rotate-90",
                                  )}
                                />
                              ) : (
                                <span className="w-3.5 h-3.5" />
                              )}
                              {color && (
                                <span
                                  className="inline-block w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: color }}
                                />
                              )}
                              <span className="font-medium">{row.category}</span>
                            </button>
                          </td>
                          {row.values.map((v, i) => {
                            const prev = i > 0 ? row.values[i - 1] : null;
                            const delta = formatDelta(v, prev);
                            return (
                              <td key={i} className="text-right py-2 px-3 whitespace-nowrap">
                                <div className="font-mono tabular-nums text-foreground">{formatPercent(v)}</div>
                                {delta && (
                                  <div
                                    className={cn(
                                      "text-[10px] font-mono tabular-nums mt-0.5",
                                      delta.positive ? "text-positive" : "text-negative",
                                    )}
                                  >
                                    {delta.text}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>

                        {/* Expanded sub-rows: individual shareholders */}
                        {expanded && hasShareholders && row.shareholders.map((sh) => (
                          <tr
                            key={`${row.category}-${sh.name}`}
                            className="border-b border-border/20 bg-muted/10 hover:bg-muted/30 transition-colors"
                          >
                            <td className="py-1.5 pr-3 pl-9 sticky left-0 bg-muted/10 whitespace-nowrap text-xs text-muted-foreground">
                              {sh.name}
                            </td>
                            {sh.values.map((v, i) => {
                              const prev = i > 0 ? sh.values[i - 1] : null;
                              const delta = formatDelta(v, prev);
                              return (
                                <td key={i} className="text-right py-1.5 px-3 whitespace-nowrap">
                                  <div className="font-mono tabular-nums text-xs text-muted-foreground">
                                    {formatPercent(v)}
                                  </div>
                                  {delta && (
                                    <div
                                      className={cn(
                                        "text-[9px] font-mono tabular-nums mt-0.5",
                                        delta.positive ? "text-positive" : "text-negative",
                                      )}
                                    >
                                      {delta.text}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              * Classifications may have changed across quarters.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
