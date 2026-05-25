import { Fragment, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertCircle, BarChart3, ChevronDown, ChevronRight } from "lucide-react";
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
import { getCSSColor } from "@/lib/theme-utils";
import { cn } from "@/lib/utils";

// =============================================================================
// Category color mapping — theme-aware via getCSSColor + useTheme
// =============================================================================

type ViewMode = "quarterly" | "yearly";

const CATEGORY_KEYS = ["Promoters", "FIIs", "DIIs", "Public", "Government"] as const;
type CategoryKey = (typeof CATEGORY_KEYS)[number];

function useCategoryColors() {
  const { resolvedTheme } = useTheme();
  return useMemo(
    () => ({
      Promoters: getCSSColor("--chart-3"),     // amber
      FIIs: getCSSColor("--chart-2"),          // green
      DIIs: "hsl(217 91% 60%)",                // blue (no chart var available; same hue both themes)
      Public: getCSSColor("--chart-negative"), // red
      Government: getCSSColor("--chart-4"),    // purple
      fallback: getCSSColor("--muted-foreground"),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedTheme],
  );
}

// =============================================================================
// View toggle — exported separately so it can be mounted in a parent's action slot
// =============================================================================

export function ShareholdingViewToggle({
  view,
  onViewChange,
}: {
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
}) {
  return (
    <div className="flex gap-1">
      <Button
        variant={view === "quarterly" ? "default" : "ghost"}
        size="sm"
        className="h-7 text-xs"
        onClick={() => onViewChange("quarterly")}
      >
        Quarterly
      </Button>
      <Button
        variant={view === "yearly" ? "default" : "ghost"}
        size="sm"
        className="h-7 text-xs"
        onClick={() => onViewChange("yearly")}
      >
        Yearly
      </Button>
    </div>
  );
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
          <span className="font-mono font-medium tabular-nums">
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
  colors,
}: {
  quarters: string[];
  data: ShareholdingCategory[];
  colors: ReturnType<typeof useCategoryColors>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const displayQuarters = [...quarters].reverse().slice(-12);

  const toggleExpand = (category: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const colorFor = (cat: string): string =>
    (colors as any)[cat as CategoryKey] ?? colors.fallback;

  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 pr-4 text-muted-foreground font-medium sticky left-0 bg-card z-10 text-xs uppercase tracking-wide">
              Category
            </th>
            {displayQuarters.map((q) => (
              <th
                key={q}
                className="text-right py-2 px-2 text-muted-foreground font-medium whitespace-nowrap text-xs uppercase tracking-wide"
              >
                {q}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const color = colorFor(row.category);
            const hasSharers = row.shareholders && row.shareholders.length > 0;
            const isExpanded = expanded.has(row.category);

            return (
              <Fragment key={row.category}>
                <tr
                  className={cn(
                    "border-b border-border/50",
                    hasSharers && "cursor-pointer hover:bg-muted/30",
                  )}
                  onClick={hasSharers ? () => toggleExpand(row.category) : undefined}
                >
                  <td className="py-1.5 pr-4 font-medium sticky left-0 bg-card z-10">
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
                      <td key={idx} className="text-right py-1.5 px-2 font-mono tabular-nums">
                        <div>
                          <span className="text-sm">
                            {val != null ? `${val.toFixed(2)}%` : "—"}
                          </span>
                          {change != null && Math.abs(change) >= 0.01 && (
                            <div
                              className={cn(
                                "text-[10px]",
                                change > 0 ? "text-positive" : "text-negative",
                              )}
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

                {isExpanded &&
                  row.shareholders.map((sh) => (
                    <tr key={`${row.category}-${sh.name}`} className="border-b border-border/20">
                      <td className="py-1.5 pr-4 sticky left-0 bg-card z-10">
                        <span className="flex items-center gap-2 pl-[22px] text-muted-foreground text-xs">
                          <span className="w-2 shrink-0" />
                          {sh.name}
                        </span>
                      </td>
                      {[...sh.values].reverse().slice(-12).map((val, idx, arr) => {
                        const olderVal = idx > 0 ? arr[idx - 1] : null;
                        const change =
                          val != null && olderVal != null
                            ? Math.round((val - olderVal) * 100) / 100
                            : null;

                        return (
                          <td
                            key={idx}
                            className="text-right py-1.5 px-2 font-mono tabular-nums text-muted-foreground"
                          >
                            <div>
                              <span className="text-xs">
                                {val != null ? `${val.toFixed(2)}%` : "—"}
                              </span>
                              {change != null && Math.abs(change) >= 0.01 && (
                                <div
                                  className={cn(
                                    "text-[10px]",
                                    change > 0 ? "text-positive" : "text-negative",
                                  )}
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
  view: ViewMode;
}

export default function ShareholdingPattern({ ticker, view }: ShareholdingPatternProps) {
  const { data, isLoading, error } = useShareholding(ticker, view);
  const colors = useCategoryColors();

  const chartChrome = useMemo(
    () => ({
      grid: getCSSColor("--border"),
      axis: getCSSColor("--muted-foreground"),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colors],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[300px] w-full rounded-md" />
        <Skeleton className="h-40 w-full rounded-md" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 flex flex-col items-center justify-center text-center space-y-2">
        <AlertCircle className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Shareholding data not available</p>
        <p className="text-xs text-muted-foreground/70">{(error as Error).message}</p>
      </div>
    );
  }

  if (!data) return null;

  // Snapshot bars (Phase C addition per design's Section 13 layout).
  // Latest quarter's percentages, 4 standard rows + conditional Government when pct > 0.
  // Existing line chart + breakdown table preserved below per locked principle.
  // Non-standard categories (anything outside the 5 CATEGORY_KEYS) continue to
  // appear in the historical line chart only — they don't surface as snapshot bars.
  const latestSnapshot = (() => {
    const labelMap: Record<CategoryKey, string> = {
      Promoters: "Promoter",
      FIIs: "FII",
      DIIs: "DII",
      Public: "Public",
      Government: "Government",
    };
    const orderedKeys: CategoryKey[] = ["Promoters", "FIIs", "DIIs", "Public", "Government"];
    return orderedKeys
      .map((key) => {
        const row = data.data.find((d) => d.category === key);
        const pct = row?.values?.[0];
        return { key, label: labelMap[key], pct: typeof pct === "number" ? pct : null, color: colors[key] };
      })
      .filter((r) => {
        // 4 standard rows always (Promoter/FII/DII/Public) even if pct is null/zero —
        // a missing Promoter % typically means a data gap, not a real 0%.
        // Government row hides unless pct > 0 (most non-PSU tickers have 0%).
        if (r.key === "Government") return r.pct != null && r.pct > 0;
        return true;
      });
  })();

  return (
    <div className="space-y-6">
      {/* Snapshot bars — latest quarter at a glance */}
      {latestSnapshot.length > 0 && data.quarters.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
            As of {data.quarters[0]}
          </h3>
          <div className="space-y-2">
            {latestSnapshot.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-[100px_1fr_60px] items-center gap-3"
              >
                <span className="text-sm text-muted-foreground">{row.label}</span>
                <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: row.pct != null ? `${Math.min(100, Math.max(0, row.pct))}%` : "0%",
                      backgroundColor: row.color,
                    }}
                  />
                </div>
                <span className="text-sm font-mono tabular-nums text-right text-foreground">
                  {row.pct != null ? `${row.pct.toFixed(2)} %` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Line Chart */}
      {data.chart_data.length > 1 && (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.chart_data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartChrome.grid} opacity={0.5} />
              <XAxis
                dataKey="quarter"
                tick={{ fontSize: 11, fill: chartChrome.axis }}
                axisLine={{ stroke: chartChrome.grid }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 11, fill: chartChrome.axis }}
                axisLine={{ stroke: chartChrome.grid }}
                tickLine={false}
              />
              <Tooltip content={<ShareholdingTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={8} />

              {CATEGORY_KEYS.filter((cat) =>
                data.chart_data.some((d) => d[cat] != null && Number(d[cat]) > 0),
              ).map((cat) => (
                <Line
                  key={cat}
                  type="monotone"
                  dataKey={cat}
                  stroke={colors[cat]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              ))}
              {data.data
                .filter((row) => !CATEGORY_KEYS.includes(row.category as CategoryKey))
                .map((row) => (
                  <Line
                    key={row.category}
                    type="monotone"
                    dataKey={row.category}
                    stroke={colors.fallback}
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
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5" />
            Detailed Breakdown
          </h3>
          <ShareholdingTable quarters={data.quarters} data={data.data} colors={colors} />
          <p className="text-xs text-muted-foreground mt-3">
            * Classifications may have changed across quarters.
          </p>
        </div>
      )}
    </div>
  );
}
