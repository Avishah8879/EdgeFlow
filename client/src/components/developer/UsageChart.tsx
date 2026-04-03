import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useApiUsage,
  useApiKeyUsage,
  type KeyBreakdown,
} from "@/hooks/use-api-usage";
import {
  Activity,
  ArrowLeft,
  Clock,
  Globe,
  Key,
  Layers,
} from "lucide-react";

const PERIODS = [
  { value: "1d", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-blue-500",
  POST: "bg-green-500",
  PUT: "bg-yellow-500",
  DELETE: "bg-red-500",
  PATCH: "bg-purple-500",
};

export function UsageChart() {
  const [period, setPeriod] = useState("7d");
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);

  const { data: usage, isLoading } = useApiUsage(period);
  const { data: keyUsage, isLoading: keyUsageLoading } = useApiKeyUsage(
    selectedKeyId,
    period
  );

  // When viewing a specific key
  if (selectedKeyId) {
    return (
      <KeyDetailView
        keyUsage={keyUsage}
        isLoading={keyUsageLoading}
        period={period}
        onPeriodChange={setPeriod}
        onBack={() => setSelectedKeyId(null)}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="h-6 w-40 bg-muted rounded animate-pulse" />
          <div className="h-9 w-36 bg-muted rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-48 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!usage || usage.totalRequests === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Usage Overview</CardTitle>
          <PeriodSelector value={period} onChange={setPeriod} />
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Activity className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-medium mb-1">No usage data yet</h3>
            <p className="text-muted-foreground text-sm">
              Make some API calls to see statistics here. Usage data is recorded
              for every authenticated API key request.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const days = usage.byDay ?? [];
  const byKey = usage.byKey ?? [];
  const recentActivity = usage.recentActivity ?? [];

  return (
    <div className="space-y-6">
      {/* Header with period selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Usage Overview</h2>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Requests"
          value={usage.totalRequests.toLocaleString()}
          icon={<Activity className="h-4 w-4" />}
        />
        <SummaryCard
          label="Active Keys"
          value={byKey.length.toString()}
          icon={<Key className="h-4 w-4" />}
        />
        <SummaryCard
          label="Endpoints Hit"
          value={Object.keys(usage.byEndpoint ?? {}).length.toString()}
          icon={<Globe className="h-4 w-4" />}
        />
        <SummaryCard
          label={period === "1d" ? "Avg / Hour" : "Avg / Day"}
          value={
            usage.totalRequests > 0
              ? Math.round(
                  usage.totalRequests /
                    ({ "1d": 24, "7d": 7, "30d": 30, "90d": 90 }[period] ?? 7)
                ).toLocaleString()
              : "0"
          }
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {/* Daily bar chart */}
      <DailyChart days={days} period={period} />

      {/* Per-key breakdown */}
      {byKey.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Per-Key Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {byKey.map((k) => (
                <KeyRow
                  key={k.keyId}
                  keyData={k}
                  total={usage.totalRequests}
                  onClick={() => setSelectedKeyId(k.keyId)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Endpoints + Methods side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top endpoints */}
        {usage.byEndpoint && Object.keys(usage.byEndpoint).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Endpoints</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(usage.byEndpoint)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 10)
                  .map(([endpoint, count]) => {
                    const pct = Math.round(
                      (count / usage.totalRequests) * 100
                    );
                    return (
                      <div key={endpoint} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <code className="text-xs font-mono truncate max-w-[70%]">
                            {endpoint}
                          </code>
                          <span className="text-muted-foreground text-xs shrink-0">
                            {count.toLocaleString()} ({pct}%)
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary/70 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* HTTP methods */}
        {usage.byMethod && Object.keys(usage.byMethod).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">By HTTP Method</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(usage.byMethod)
                  .sort(([, a], [, b]) => b - a)
                  .map(([method, count]) => {
                    const pct = Math.round(
                      (count / usage.totalRequests) * 100
                    );
                    return (
                      <div key={method} className="flex items-center gap-3">
                        <Badge
                          variant="outline"
                          className="font-mono text-xs w-16 justify-center shrink-0"
                        >
                          {method}
                        </Badge>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${METHOD_COLORS[method] ?? "bg-muted-foreground"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground w-20 text-right shrink-0">
                          {count.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-3 font-medium">Time</th>
                    <th className="text-left py-2 px-3 font-medium">Method</th>
                    <th className="text-left py-2 px-3 font-medium">
                      Endpoint
                    </th>
                    <th className="text-left py-2 px-3 font-medium">Key</th>
                    <th className="text-left py-2 pl-3 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivity.map((req, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-3 text-muted-foreground text-xs whitespace-nowrap">
                        {formatTime(req.time)}
                      </td>
                      <td className="py-2 px-3">
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] px-1.5"
                        >
                          {req.method}
                        </Badge>
                      </td>
                      <td className="py-2 px-3">
                        <code className="text-xs font-mono">{req.endpoint}</code>
                      </td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">
                        {req.keyName ?? "—"}
                      </td>
                      <td className="py-2 pl-3 text-xs text-muted-foreground font-mono">
                        {req.ip}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ─── Per-key detail view ─── */

function KeyDetailView({
  keyUsage,
  isLoading,
  period,
  onPeriodChange,
  onBack,
}: {
  keyUsage: import("@/hooks/use-api-usage").KeyUsageSummary | undefined;
  isLoading: boolean;
  period: string;
  onPeriodChange: (p: string) => void;
  onBack: () => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to overview
        </button>
        <div className="h-48 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!keyUsage) {
    return (
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to overview
        </button>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground text-sm">
              No usage data for this key yet.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const days = keyUsage.byDay ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h2 className="text-lg font-semibold">{keyUsage.keyName}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <code className="text-xs text-muted-foreground font-mono">
                {keyUsage.keyPrefix}...
              </code>
              <Badge variant="outline" className="text-[10px]">
                {keyUsage.tier}
              </Badge>
            </div>
          </div>
        </div>
        <PeriodSelector value={period} onChange={onPeriodChange} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <SummaryCard
          label="Total Requests"
          value={keyUsage.totalRequests.toLocaleString()}
          icon={<Activity className="h-4 w-4" />}
        />
        <SummaryCard
          label="Endpoints Hit"
          value={Object.keys(keyUsage.byEndpoint ?? {}).length.toString()}
          icon={<Globe className="h-4 w-4" />}
        />
        <SummaryCard
          label="Avg / Day"
          value={
            days.length > 0
              ? Math.round(keyUsage.totalRequests / days.length).toLocaleString()
              : "0"
          }
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      <DailyChart days={days} period={period} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {keyUsage.byEndpoint &&
          Object.keys(keyUsage.byEndpoint).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Endpoints</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(keyUsage.byEndpoint)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 10)
                    .map(([endpoint, count]) => {
                      const pct = Math.round(
                        (count / keyUsage.totalRequests) * 100
                      );
                      return (
                        <div key={endpoint} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <code className="text-xs font-mono truncate max-w-[70%]">
                              {endpoint}
                            </code>
                            <span className="text-muted-foreground text-xs shrink-0">
                              {count.toLocaleString()} ({pct}%)
                            </span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary/70 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}

        {keyUsage.byMethod &&
          Object.keys(keyUsage.byMethod).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By HTTP Method</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(keyUsage.byMethod)
                    .sort(([, a], [, b]) => b - a)
                    .map(([method, count]) => {
                      const pct = Math.round(
                        (count / keyUsage.totalRequests) * 100
                      );
                      return (
                        <div key={method} className="flex items-center gap-3">
                          <Badge
                            variant="outline"
                            className="font-mono text-xs w-16 justify-center shrink-0"
                          >
                            {method}
                          </Badge>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${METHOD_COLORS[method] ?? "bg-muted-foreground"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-sm text-muted-foreground w-20 text-right shrink-0">
                            {count.toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}
      </div>
    </div>
  );
}

/* ─── Shared sub-components ─── */

function PeriodSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PERIODS.map((p) => (
          <SelectItem key={p.value} value={p.value}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

/**
 * Fill in all slots for the selected period with 0 counts for missing entries.
 * For "1d" period: returns 24 hourly slots (e.g. "2026-02-17 09:00").
 * For other periods: returns daily slots (e.g. "2026-02-17").
 */
function fillSlotsForPeriod(
  data: { date: string; count: number }[],
  period: string
): { date: string; count: number }[] {
  const countMap = new Map(data.map((d) => [d.date, d.count]));

  if (period === "1d") {
    // Server returns epoch ms (UTC hour buckets) for 1d period.
    // Build a map from epoch-hour → count, then generate 24 local-time slots.
    const epochMap = new Map<number, number>();
    for (const d of data) {
      epochMap.set(Number(d.date), d.count);
    }

    const result: { date: string; count: number }[] = [];
    const now = new Date();
    now.setMinutes(0, 0, 0);
    // Snap current time to the hour boundary (epoch ms)
    const nowEpoch = Math.floor(now.getTime() / 3_600_000) * 3_600_000;

    for (let i = 23; i >= 0; i--) {
      const slotEpoch = nowEpoch - i * 3_600_000;
      const d = new Date(slotEpoch);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hour = String(d.getHours()).padStart(2, "0");
      const label = `${year}-${month}-${day} ${hour}:00`;
      result.push({ date: label, count: epochMap.get(slotEpoch) ?? 0 });
    }
    return result;
  }

  // Daily slots
  const periodDays: Record<string, number> = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
  };
  const totalDays = periodDays[period] ?? 7;

  const result: { date: string; count: number }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    // Use local date (not toISOString which is UTC and shifts dates in non-UTC timezones)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    result.push({ date: dateStr, count: countMap.get(dateStr) ?? 0 });
  }

  return result;
}

function DailyChart({
  days,
  period,
}: {
  days: { date: string; count: number }[];
  period: string;
}) {
  const isHourly = period === "1d";
  const filled = fillSlotsForPeriod(days, period);
  const maxCount = Math.max(...filled.map((d) => d.count), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {isHourly ? "Requests by Hour" : "Requests by Day"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-stretch gap-1 h-36">
          {filled.map((slot, idx) => {
            const height =
              slot.count > 0
                ? Math.max((slot.count / maxCount) * 100, 4)
                : 2;
            // Label sampling: show every Nth label to avoid clutter
            const showLabel =
              filled.length <= 14 ||
              idx % Math.ceil(filled.length / 12) === 0 ||
              idx === filled.length - 1;
            // For hourly: show "09:00", for daily: show "02-17"
            const label = isHourly
              ? slot.date.slice(11, 16)
              : slot.date.slice(5);
            return (
              <div
                key={slot.date}
                className="flex-1 flex flex-col items-center gap-1 group min-w-0"
              >
                <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {slot.count}
                </span>
                <div className="flex-1 w-full flex items-end">
                  <div
                    className={`w-full rounded-t transition-colors ${
                      slot.count > 0
                        ? "bg-primary/80 hover:bg-primary"
                        : "bg-muted/50"
                    }`}
                    style={{ height: `${height}%` }}
                    title={`${slot.date}: ${slot.count} requests`}
                  />
                </div>
                <span
                  className={`text-[10px] text-muted-foreground truncate w-full text-center shrink-0 ${
                    showLabel ? "" : "invisible"
                  }`}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function KeyRow({
  keyData,
  total,
  onClick,
}: {
  keyData: KeyBreakdown;
  total: number;
  onClick: () => void;
}) {
  const pct = total > 0 ? Math.round((keyData.requests / total) * 100) : 0;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors text-left"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{keyData.keyName}</span>
          <Badge variant="outline" className="text-[10px] shrink-0">
            {keyData.tier}
          </Badge>
        </div>
        <code className="text-xs text-muted-foreground font-mono">
          {keyData.keyPrefix}...
        </code>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold">
          {keyData.requests.toLocaleString()}
        </div>
        <div className="text-xs text-muted-foreground">{pct}%</div>
      </div>
      <div className="w-20 h-2 bg-muted rounded-full overflow-hidden shrink-0 hidden sm:block">
        <div
          className="h-full bg-primary/70 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
    </button>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}
