import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  ReferenceLine,
  Brush,
} from "recharts";
import type { BacktestMetrics } from "@shared/schema";

interface EquityCurveChartProps {
  data: Array<{ date: string; value: number }>;
  trainEndDate: string;
  trainEndIndex?: number;
  maxDrawdownPoint?: { date: string; value: number | null };
  metrics: BacktestMetrics;
  condition: string;
  showBrush?: boolean;
  title?: string;
}

// Format date for display (e.g., "Jan 2023")
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// Shorter date format for Brush (e.g., "Jan '23")
function formatBrushDate(dateStr: string): string {
  const date = new Date(dateStr);
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const year = date.getFullYear().toString().slice(-2);
  return `${month} '${year}`;
}

// Format date for tooltip (e.g., "Jan 15, 2023")
function formatTooltipDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Custom tooltip component
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string }>;
  label?: string;
}) {
  if (!active || !payload || !payload.length || !label) return null;

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground">
        {formatTooltipDate(label)}
      </p>
      <p className="text-sm font-medium text-foreground">
        Return: {payload[0].value.toFixed(2)}%
      </p>
    </div>
  );
}

// Custom legend component
function CustomLegend() {
  return (
    <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground mt-2">
      <div className="flex items-center gap-1.5">
        <div className="h-0.5 w-4 bg-blue-500" />
        <span>Equity Curve</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="h-0.5 w-4 border-t-2 border-dashed border-muted-foreground/50" />
        <span>Train/Test Split</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-red-500" />
        <span>Max DD (Train)</span>
      </div>
    </div>
  );
}

export function EquityCurveChart({
  data,
  trainEndDate,
  trainEndIndex: trainEndIndexProp,
  maxDrawdownPoint,
  metrics,
  condition,
  showBrush = false,
  title = "Best Strategy",
}: EquityCurveChartProps) {
  // Data is already in percentage form from backend (e.g., 5.0 for 5%)
  const chartData = useMemo(() => {
    return data.map((d) => ({
      date: d.date,
      value: d.value,
    }));
  }, [data]);

  // Find the index of train end date for the reference line
  // Prefer backend-provided index if available to avoid date string comparison issues
  const trainEndIndex = useMemo(() => {
    // Use backend-provided index if valid
    if (
      trainEndIndexProp !== undefined &&
      trainEndIndexProp >= 0 &&
      trainEndIndexProp < chartData.length
    ) {
      return trainEndIndexProp;
    }
    // Fallback: find by date comparison with proper Date parsing
    if (!trainEndDate) return -1;
    const trainEndTime = new Date(trainEndDate).getTime();
    return chartData.findIndex(
      (d) => new Date(d.date).getTime() >= trainEndTime
    );
  }, [chartData, trainEndDate, trainEndIndexProp]);

  // Find max drawdown point data
  const maxDDPoint = useMemo(() => {
    if (!maxDrawdownPoint || maxDrawdownPoint.value === null) return null;
    const point = chartData.find((d) => d.date === maxDrawdownPoint.date);
    if (point) {
      return { date: point.date, value: point.value };
    }
    return null;
  }, [chartData, maxDrawdownPoint]);

  // Calculate Y-axis domain
  const yDomain = useMemo(() => {
    const values = chartData.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.1;
    return [Math.floor(min - padding), Math.ceil(max + padding)];
  }, [chartData]);

  // Get tick values for X-axis (show ~6 ticks)
  const xAxisTicks = useMemo(() => {
    if (chartData.length === 0) return [];
    const step = Math.ceil(chartData.length / 6);
    return chartData.filter((_, i) => i % step === 0).map((d) => d.date);
  }, [chartData]);

  return (
    <div className="w-full">
      {/* Title Section */}
      <div className="mb-3 text-center">
        <h4 className="text-sm font-semibold text-foreground">
          {title}
        </h4>
        <p className="mt-1 text-xs text-muted-foreground font-mono truncate max-w-full px-4">
          Condition: {condition}
        </p>
      </div>

      {/* Chart Container */}
      <div className="relative">
        {/* Stats Box Overlay */}
        <div className="absolute left-20 top-8 z-10 rounded-md border border-border/60 bg-card/95 px-3 py-2 text-xs shadow-sm backdrop-blur-sm">
          <div className="space-y-0.5 font-mono">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Trades:</span>
              <span className="font-medium text-foreground">
                {metrics.num_trades}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Total PnL:</span>
              <span className="font-medium text-foreground">
                {metrics.total_profit?.toFixed(2) ?? "N/A"}% (Train)
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Max DD:</span>
              <span className="font-medium text-foreground">
                {metrics.max_dd?.toFixed(2) ?? "N/A"}% (Train)
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Calmar:</span>
              <span className="font-medium text-foreground">
                {metrics.calmar_ratio?.toFixed(2) ?? "N/A"} (Train)
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Avg Ret:</span>
              <span className="font-medium text-foreground">
                {metrics.avg_p != null
                  ? (metrics.avg_p * 100).toFixed(2)
                  : "N/A"}
                %
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Profit Factor:</span>
              <span className="font-medium text-foreground">
                {metrics.profit_factor?.toFixed(2) ?? "N/A"}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Win Rate:</span>
              <span className="font-medium text-foreground">
                {metrics.win_rate?.toFixed(1) ?? "N/A"}%
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Worst 10-day:</span>
              <span className="font-medium text-foreground">
                {metrics.Worst_10 != null
                  ? (metrics.Worst_10 * 100).toFixed(2)
                  : "N/A"}
                %
              </span>
            </div>
          </div>
        </div>

        {/* Recharts Chart */}
        <ResponsiveContainer width="100%" height={500}>
          <LineChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 10, bottom: 30 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              opacity={0.5}
            />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              ticks={xAxisTicks}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tickLine={{ stroke: "hsl(var(--border))" }}
            />
            <YAxis
              domain={yDomain}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tickLine={{ stroke: "hsl(var(--border))" }}
              label={{
                value: "Equity Return (%)",
                angle: -90,
                position: "insideLeft",
                offset: 0,
                style: {
                  fontSize: 12,
                  fill: "hsl(var(--muted-foreground))",
                  textAnchor: "middle",
                },
              }}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Equity Curve Line */}
            <Line
              type="monotone"
              dataKey="value"
              stroke="#3b82f6"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 4, fill: "#3b82f6" }}
              name="Equity Curve"
            />

            {/* Train/Test Split Reference Line */}
            {trainEndIndex >= 0 && chartData[trainEndIndex] && (
              <ReferenceLine
                x={chartData[trainEndIndex].date}
                stroke="#888888"
                strokeDasharray="5 5"
                strokeWidth={2}
                ifOverflow="extendDomain"
              />
            )}

            {/* Max Drawdown Point */}
            {maxDDPoint && (
              <ReferenceDot
                x={maxDDPoint.date}
                y={maxDDPoint.value}
                r={6}
                fill="#ef4444"
                stroke="#ef4444"
              />
            )}

            {/* Brush for Zoom/Pan */}
            {showBrush && (
              <Brush
                dataKey="date"
                height={20}
                stroke="hsl(var(--primary))"
                fill="hsl(var(--muted))"
                tickFormatter={formatBrushDate}
              />
            )}
          </LineChart>
        </ResponsiveContainer>

        {/* Custom Legend */}
        <CustomLegend />
      </div>
    </div>
  );
}
