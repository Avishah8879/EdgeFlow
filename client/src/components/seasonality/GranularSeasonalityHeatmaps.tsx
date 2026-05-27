import { BarChart3, Calendar, Clock } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useGranularSeasonality } from "@/hooks/use-granular-seasonality";
import type { GranularBucket } from "@/hooks/use-granular-seasonality";
import { useSmartLoader } from "@/hooks/use-smart-loader";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const WEEKDAY_LABELS: Record<string, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
};
const MONTH_LABELS: Record<string, string> = {
  Jan: "January",
  Feb: "February",
  Mar: "March",
  Apr: "April",
  May: "May",
  Jun: "June",
  Jul: "July",
  Aug: "August",
  Sep: "September",
  Oct: "October",
  Nov: "November",
  Dec: "December",
};

interface HeatmapCellData {
  key: string;
  label: string;
  bucket?: GranularBucket;
  value?: number;
  displayValue?: string;
  scaleValue?: number;
}

function formatReturn(value: number, lowCount: boolean) {
  const prefix = lowCount ? "~" : value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

function formatWinPct(value: number, lowCount: boolean) {
  return `${lowCount ? "~" : ""}${Math.round(value * 100)}%`;
}

function bgFor(value: number, scale: number, lowCount: boolean): string {
  const intensity = scale > 0 ? Math.min(1, Math.abs(value) / scale) : 0;
  const alpha = (0.08 + intensity * 0.55) * (lowCount ? 0.4 : 1);
  const token = value >= 0 ? "--positive" : "--negative";
  return `hsl(var(${token}) / ${alpha.toFixed(2)})`;
}

function scaleFor(values: number[]) {
  if (values.length === 0) return 0;
  return Math.max(...values.map((value) => Math.abs(value)));
}

function HeatmapCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function HeatmapCell({
  cell,
  scale,
}: {
  cell: HeatmapCellData;
  scale: number;
}) {
  if (!cell.bucket || cell.value === undefined) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex-1 h-8 rounded-[2px] bg-muted/20" />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <p className="font-medium">{cell.label}</p>
          <p>No data</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  const lowCount = cell.bucket.count < 5;
  const scaleValue = cell.scaleValue ?? cell.value;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex-1 h-8 rounded-[2px] transition-colors",
            "flex items-center justify-center px-1",
            "font-mono tabular-nums text-[10px]",
          )}
          style={{ backgroundColor: bgFor(scaleValue, scale, lowCount) }}
        >
          {cell.displayValue ?? formatReturn(cell.value, lowCount)}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <p className="font-medium">{cell.label}</p>
        <p>Avg Return: {formatReturn(cell.bucket.avg_return, false)}</p>
        <p>Win Rate: {formatWinPct(cell.bucket.win_pct, false)}</p>
        <p>Samples: {cell.bucket.count}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function HeaderRow({ labels, labelWidth = "w-12" }: { labels: string[]; labelWidth?: string }) {
  return (
    <div className="flex gap-[1px] mb-1">
      <div className={cn(labelWidth, "shrink-0")} />
      {labels.map((label) => (
        <div key={label} className="flex-1 text-[10px] text-center text-muted-foreground">
          {label}
        </div>
      ))}
    </div>
  );
}

function LabeledRow({
  label,
  cells,
  scale,
  labelWidth = "w-12",
}: {
  label: string;
  cells: HeatmapCellData[];
  scale: number;
  labelWidth?: string;
}) {
  return (
    <div className="flex gap-[1px] mb-[1px]">
      <div className={cn(labelWidth, "shrink-0 text-xs text-muted-foreground font-medium flex items-center")}>
        {label}
      </div>
      {cells.map((cell) => (
        <HeatmapCell key={cell.key} cell={cell} scale={scale} />
      ))}
    </div>
  );
}

function MonthlyHeatmap({ monthly }: { monthly: Record<string, GranularBucket> }) {
  const returnScale = scaleFor(Object.values(monthly).map((bucket) => bucket.avg_return));
  const winScale = scaleFor(Object.values(monthly).map((bucket) => bucket.win_pct - 0.5));

  const returnCells = MONTHS.map((month) => {
    const bucket = monthly[month];
    return {
      key: `${month}-return`,
      label: MONTH_LABELS[month],
      bucket,
      value: bucket?.avg_return,
    };
  });

  const winCells = MONTHS.map((month) => {
    const bucket = monthly[month];
    const lowCount = Boolean(bucket && bucket.count < 5);
    return {
      key: `${month}-win`,
      label: MONTH_LABELS[month],
      bucket,
      value: bucket?.win_pct,
      displayValue: bucket ? formatWinPct(bucket.win_pct, lowCount) : undefined,
      scaleValue: bucket ? bucket.win_pct - 0.5 : undefined,
    };
  });

  return (
    <HeatmapCard title="Avg Monthly Return" icon={<Calendar className="w-4 h-4" />}>
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <HeaderRow labels={MONTHS} />
          <LabeledRow label="Avg" cells={returnCells} scale={returnScale} />
          <LabeledRow label="Win" cells={winCells} scale={winScale} />
        </div>
      </div>
    </HeatmapCard>
  );
}

function MonthWeekHeatmap({ weekly }: { weekly: Record<string, GranularBucket> }) {
  const scale = scaleFor(Object.values(weekly).map((bucket) => bucket.avg_return));

  return (
    <HeatmapCard title="Week of Month x Month" icon={<BarChart3 className="w-4 h-4" />}>
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <HeaderRow labels={MONTHS} />
          {[1, 2, 3, 4].map((week) => {
            const cells = MONTHS.map((month) => {
              const key = `${month}_W${week}`;
              return {
                key,
                label: `${MONTH_LABELS[month]} - Week ${week}`,
                bucket: weekly[key],
                value: weekly[key]?.avg_return,
              };
            });

            return <LabeledRow key={week} label={`W${week}`} cells={cells} scale={scale} />;
          })}
        </div>
      </div>
    </HeatmapCard>
  );
}

function WeekdayWeekHeatmap({ daily }: { daily: Record<string, GranularBucket> }) {
  const scale = scaleFor(Object.values(daily).map((bucket) => bucket.avg_return));
  const weekLabels = ["W1", "W2", "W3", "W4"];

  return (
    <HeatmapCard title="Day of Week x Week of Month" icon={<Clock className="w-4 h-4" />}>
      <div className="overflow-x-auto">
        <div className="min-w-[420px]">
          <HeaderRow labels={weekLabels} labelWidth="w-16" />
          {WEEKDAYS.map((day) => {
            const cells = [1, 2, 3, 4].map((week) => {
              const key = `W${week}_${day}`;
              return {
                key,
                label: `${WEEKDAY_LABELS[day]} - Week ${week}`,
                bucket: daily[key],
                value: daily[key]?.avg_return,
              };
            });

            return <LabeledRow key={day} label={day} cells={cells} scale={scale} labelWidth="w-16" />;
          })}
        </div>
      </div>
    </HeatmapCard>
  );
}

export function GranularSeasonalityHeatmaps({
  ticker,
  years,
}: {
  ticker: string;
  years: number;
}) {
  const { data, isLoading, error } = useGranularSeasonality(ticker, years);
  const { showSkeleton } = useSmartLoader(isLoading);

  if (showSkeleton) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-56 rounded-lg" />
        <Skeleton className="h-56 rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="py-6 text-center">
          <p className="text-sm text-destructive">
            Failed to load granular seasonality data. {error.message}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <MonthlyHeatmap monthly={data.monthly} />
      <MonthWeekHeatmap weekly={data.weekly} />
      <WeekdayWeekHeatmap daily={data.daily} />
    </div>
  );
}
