import { formatCompactNumber } from "@/lib/utils";
import { getValueColorClass } from "@/lib/theme-utils";
import type { LegendData } from "./types";

interface ChartLegendProps {
  data: LegendData;
}

/**
 * Format price with Indian locale
 */
function formatPrice(value: number): string {
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function ChartLegend({ data }: ChartLegendProps) {
  const colorClass = getValueColorClass(data.change);
  const isPositive = data.change >= 0;

  return (
    <div className="absolute bottom-4 left-4 md:top-4 md:bottom-auto bg-background/95 backdrop-blur-md border shadow-lg rounded-lg px-3 py-2 text-sm z-10">
      <div className={`flex items-center gap-2 font-mono whitespace-nowrap ${colorClass}`}>
        {/* OHLC values */}
        <span>O {formatPrice(data.open)}</span>
        <span>H {formatPrice(data.high)}</span>
        <span>L {formatPrice(data.low)}</span>
        <span>C {formatPrice(data.close)}</span>

        {/* Volume (if available) */}
        {data.volume !== undefined && (
          <span>V {formatCompactNumber(data.volume, 2)}</span>
        )}

        {/* Change and percentage */}
        <span className="font-semibold">
          {isPositive ? "+" : ""}
          {data.change.toFixed(2)} ({isPositive ? "+" : ""}
          {data.changePercent.toFixed(2)}%)
        </span>
      </div>
    </div>
  );
}
