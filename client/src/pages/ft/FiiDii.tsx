import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { TabBar, type TabBarItem } from "@/components/ui/tab-bar";
import { getCSSColor } from "@/lib/theme-utils";
import { cn } from "@/lib/utils";

interface FIIDIIRow {
  date: string;
  fiiNetBuySell: number;
  diiNetBuySell: number;
  fiiGrossBuy: number;
  fiiGrossSell: number;
  diiGrossBuy: number;
  diiGrossSell: number;
}

const flowTabs: TabBarItem<"cash" | "fno" | "sectoral">[] = [
  { id: "cash", label: "Cash" },
  { id: "fno", label: "F&O" },
  { id: "sectoral", label: "Sectoral" },
];

const cumTabs: TabBarItem<"3m" | "ytd" | "1y">[] = [
  { id: "3m", label: "3M" },
  { id: "ytd", label: "YTD" },
  { id: "1y", label: "1Y" },
];

function formatCr(value: number, signed = true): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : signed && value > 0 ? "+" : "";
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}K cr`;
  return `${sign}₹${abs.toFixed(0)}cr`;
}

function formatDateShort(d: string): string {
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return d;
  }
}

function formatDateRow(d: string): { day: string; weekday: string } {
  try {
    const date = new Date(d);
    return {
      day: date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      weekday: date.toLocaleDateString("en-IN", { weekday: "short" }),
    };
  } catch {
    return { day: d, weekday: "" };
  }
}

export default function FiiDii() {
  const { resolvedTheme } = useTheme();
  const [flowMode, setFlowMode] = useState<"cash" | "fno" | "sectoral">("cash");
  const [cumMode, setCumMode] = useState<"3m" | "ytd" | "1y">("ytd");

  const { data, isLoading, isError, refetch } = useQuery<FIIDIIRow[]>({
    queryKey: ["/api/fii-dii"],
    staleTime: 3600000,
  });

  // Theme-aware chart chrome — recomputes on theme switch
  const chartColors = useMemo(
    () => ({
      grid: getCSSColor("--border"),
      axis: getCSSColor("--muted-foreground"),
      tooltipBg: getCSSColor("--card"),
      tooltipBorder: getCSSColor("--border"),
      tooltipText: getCSSColor("--foreground"),
      fii: getCSSColor("--brand-gold"),
      dii: getCSSColor("--brand-sky"),
      nifty: getCSSColor("--muted-foreground"),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedTheme],
  );

  // ── Summary KPIs derived from the 30-session window ─────────────────
  const summary = useMemo(() => {
    if (!data || data.length === 0) return null;
    const today = data[data.length - 1];
    const monthStart = new Date(today.date);
    monthStart.setDate(1);
    const mtd = data.filter((r) => new Date(r.date) >= monthStart);
    const fiiMtd = mtd.reduce((s, r) => s + r.fiiNetBuySell, 0);
    const diiMtd = mtd.reduce((s, r) => s + r.diiNetBuySell, 0);
    const fiiPosSessions = mtd.filter((r) => r.fiiNetBuySell > 0).length;
    const diiPosSessions = mtd.filter((r) => r.diiNetBuySell > 0).length;
    return {
      today,
      fiiMtd,
      diiMtd,
      mtdSessions: mtd.length,
      fiiPosSessions,
      diiPosSessions,
    };
  }, [data]);

  // ── Charts: paired-bar + cumulative ─────────────────────────────────
  const flowsChartData = useMemo(
    () =>
      (data ?? []).slice(-30).map((r) => ({
        date: formatDateShort(r.date),
        FII: Math.round(r.fiiNetBuySell),
        DII: Math.round(r.diiNetBuySell),
      })),
    [data],
  );

  const cumulativeChartData = useMemo(() => {
    if (!data) return [];
    let fiiCum = 0;
    let diiCum = 0;
    return data.map((r) => {
      fiiCum += r.fiiNetBuySell;
      diiCum += r.diiNetBuySell;
      return {
        date: formatDateShort(r.date),
        FII: Math.round(fiiCum),
        DII: Math.round(diiCum),
      };
    });
  }, [data]);

  // ── States ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2
          className="h-6 w-6 animate-spin text-[hsl(var(--brand-gold))]"
          data-testid="loading-spinner-fii-dii"
        />
      </div>
    );
  }

  if (isError || !data || !summary) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="h-8 w-8 text-destructive" data-testid="error-icon-fii-dii" />
        <p className="text-sm text-muted-foreground" data-testid="text-error-message">
          Failed to load FII/DII data
        </p>
        <Button onClick={() => refetch()} size="sm" data-testid="button-retry-fii-dii">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="space-y-2 pb-2">
        <Eyebrow tone="gold" rule>
          Terminal · Institutional flows
        </Eyebrow>
        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
          FII &amp; DII activity
        </h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Cash market net flows by FIIs/FPIs and DIIs from NSE/BSE provisional data.
          Updated post 06:00 PM IST daily.
        </p>
      </div>

      {/* 4-up KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 rounded-xl border border-border bg-card overflow-hidden">
        <KpiCell
          label="FII cash · today (prov)"
          value={formatCr(summary.today.fiiNetBuySell)}
          tone={summary.today.fiiNetBuySell >= 0 ? "up" : "down"}
          caption={`${formatDateShort(summary.today.date)} · ${summary.today.fiiNetBuySell >= 0 ? "absorbers" : "sellers"}`}
        />
        <KpiCell
          label="DII cash · today"
          value={formatCr(summary.today.diiNetBuySell)}
          tone={summary.today.diiNetBuySell >= 0 ? "up" : "down"}
          caption={summary.today.diiNetBuySell >= 0 ? "strong absorbers" : "selling pressure"}
        />
        <KpiCell
          label="FII MTD"
          value={formatCr(summary.fiiMtd)}
          tone={summary.fiiMtd >= 0 ? "up" : "down"}
          caption={`${summary.fiiPosSessions} of ${summary.mtdSessions} sessions positive`}
        />
        <KpiCell
          label="DII MTD"
          value={formatCr(summary.diiMtd)}
          tone={summary.diiMtd >= 0 ? "up" : "down"}
          caption={`${summary.diiPosSessions} of ${summary.mtdSessions} sessions positive`}
        />
      </div>

      {/* Charts: side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Daily net flows */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
            <div>
              <h3 className="font-display text-lg font-bold text-[hsl(var(--brand-navy))] dark:text-foreground">
                Daily net flows · last 30 sessions
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Paired bars (gold = FII · sky = DII) · ₹ crore
              </p>
            </div>
            <TabBar tabs={flowTabs} value={flowMode} onChange={setFlowMode} variant="segmented" />
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flowsChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.5} />
                <XAxis
                  dataKey="date"
                  stroke={chartColors.axis}
                  tick={{ fontSize: 10, fill: chartColors.axis }}
                  axisLine={{ stroke: chartColors.grid }}
                  tickLine={false}
                />
                <YAxis
                  stroke={chartColors.axis}
                  tick={{ fontSize: 10, fill: chartColors.axis }}
                  axisLine={{ stroke: chartColors.grid }}
                  tickLine={false}
                  tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartColors.tooltipBg,
                    border: `1px solid ${chartColors.tooltipBorder}`,
                    borderRadius: 6,
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                  }}
                  labelStyle={{ color: chartColors.axis }}
                  itemStyle={{ color: chartColors.tooltipText }}
                  formatter={(value: number) => formatCr(value)}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" iconSize={8} />
                <Bar dataKey="FII" fill={chartColors.fii} radius={[2, 2, 0, 0]} />
                <Bar dataKey="DII" fill={chartColors.dii} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cumulative flow */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
            <div>
              <h3 className="font-display text-lg font-bold text-[hsl(var(--brand-navy))] dark:text-foreground">
                Cumulative flow vs NIFTY
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Running total from window start · ₹ crore
              </p>
            </div>
            <TabBar tabs={cumTabs} value={cumMode} onChange={setCumMode} variant="segmented" />
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={cumulativeChartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.5} />
                <XAxis
                  dataKey="date"
                  stroke={chartColors.axis}
                  tick={{ fontSize: 10, fill: chartColors.axis }}
                  axisLine={{ stroke: chartColors.grid }}
                  tickLine={false}
                />
                <YAxis
                  stroke={chartColors.axis}
                  tick={{ fontSize: 10, fill: chartColors.axis }}
                  axisLine={{ stroke: chartColors.grid }}
                  tickLine={false}
                  tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartColors.tooltipBg,
                    border: `1px solid ${chartColors.tooltipBorder}`,
                    borderRadius: 6,
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                  }}
                  labelStyle={{ color: chartColors.axis }}
                  itemStyle={{ color: chartColors.tooltipText }}
                  formatter={(value: number) => formatCr(value)}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="line" />
                <Line
                  type="monotone"
                  dataKey="FII"
                  stroke={chartColors.fii}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="DII"
                  stroke={chartColors.dii}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Session table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-display text-base font-bold text-[hsl(var(--brand-navy))] dark:text-foreground">
              Session-by-session · last {Math.min(data.length, 14)} days
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Source: NSE/BSE provisional · ₹ crore
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => refetch()}
            data-testid="button-refresh-fii-dii"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] font-mono">
            <thead>
              <tr className="bg-muted/40 text-[10.5px] uppercase tracking-uppercase font-bold text-muted-foreground">
                <th className="text-left py-3 px-4">Date</th>
                <th className="text-right py-3 px-4">FII Buy</th>
                <th className="text-right py-3 px-4">FII Sell</th>
                <th className="text-right py-3 px-4">FII Net</th>
                <th className="text-right py-3 px-4">DII Buy</th>
                <th className="text-right py-3 px-4">DII Sell</th>
                <th className="text-right py-3 px-4">DII Net</th>
              </tr>
            </thead>
            <tbody>
              {data
                .slice()
                .reverse()
                .slice(0, 14)
                .map((row, idx) => {
                  const date = formatDateRow(row.date);
                  return (
                    <tr
                      key={row.date}
                      className="border-t border-border/60 hover:bg-muted/30 transition-colors duration-fast"
                      data-testid={`row-fii-dii-${idx}`}
                    >
                      <td className="py-2.5 px-4 text-left">
                        <span
                          className="font-display text-[13px] font-bold text-foreground"
                          data-testid={`text-date-${idx}`}
                        >
                          {date.day}
                        </span>{" "}
                        <span className="text-muted-foreground">· {date.weekday}</span>
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums">
                        {row.fiiGrossBuy.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums">
                        {row.fiiGrossSell.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </td>
                      <td
                        className={cn(
                          "py-2.5 px-4 text-right tabular-nums font-bold",
                          row.fiiNetBuySell >= 0 ? "text-positive" : "text-negative",
                        )}
                        data-testid={`text-fii-${idx}`}
                      >
                        {row.fiiNetBuySell >= 0 ? "+" : ""}
                        {row.fiiNetBuySell.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums">
                        {row.diiGrossBuy.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums">
                        {row.diiGrossSell.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </td>
                      <td
                        className={cn(
                          "py-2.5 px-4 text-right tabular-nums font-bold",
                          row.diiNetBuySell >= 0 ? "text-positive" : "text-negative",
                        )}
                        data-testid={`text-dii-${idx}`}
                      >
                        {row.diiNetBuySell >= 0 ? "+" : ""}
                        {row.diiNetBuySell.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCell({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  tone: "up" | "down" | "neutral";
}) {
  const valueClass =
    tone === "up"
      ? "text-positive"
      : tone === "down"
        ? "text-negative"
        : "text-foreground";

  return (
    <div className="p-5 border-r last:border-r-0 border-b sm:border-b-0 sm:[&:nth-child(2)]:border-b lg:[&:nth-child(2)]:border-b-0 border-border">
      <div className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "font-mono text-[26px] font-bold tabular-nums mt-1.5 leading-none",
          valueClass,
        )}
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground mt-1.5">{caption}</div>
    </div>
  );
}
