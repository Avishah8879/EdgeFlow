import { cn } from "@/lib/utils";

interface HeatmapCellProps {
  /** Numeric value driving the diverging color scale (e.g. % return). */
  value: number;
  /** Mapping bound — values past this saturate. Defaults to 5 (5%). */
  scale?: number;
  /** Display label (often a sector name). */
  label: string;
  /** Optional secondary text below the label. */
  caption?: string;
  className?: string;
}

/**
 * HeatmapCell — diverging-scale tile (Sector Rotation, Seasonality).
 * Maps `value` to a 7-step scale of `--positive` / `--negative` with
 * varying alpha. Text auto-flips for legibility on saturated cells.
 */
export function HeatmapCell({
  value,
  scale = 5,
  label,
  caption,
  className,
}: HeatmapCellProps) {
  const intensity = Math.min(1, Math.abs(value) / scale);
  const positive = value >= 0;

  // 0.06 → 0.55 alpha range gives 7 distinguishable steps
  const alpha = 0.06 + intensity * 0.49;
  const bg = positive
    ? `hsl(var(--positive) / ${alpha.toFixed(2)})`
    : `hsl(var(--negative) / ${alpha.toFixed(2)})`;

  // Saturated cells (intensity > 0.6) flip text to white for legibility
  const textColorClass =
    intensity > 0.6
      ? "text-white"
      : positive
        ? "text-positive"
        : "text-negative";

  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded-md border border-border p-3 transition-colors duration-fast",
        className,
      )}
      style={{ backgroundColor: bg }}
    >
      <span
        className={cn(
          "text-[11px] font-medium",
          intensity > 0.6 ? "text-white/90" : "text-foreground",
        )}
      >
        {label}
      </span>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "font-mono text-base font-semibold tabular-nums",
            textColorClass,
          )}
        >
          {value > 0 ? "+" : ""}
          {value.toFixed(2)}%
        </span>
        {caption && (
          <span
            className={cn(
              "text-[10px] font-mono tabular-nums",
              intensity > 0.6 ? "text-white/70" : "text-muted-foreground",
            )}
          >
            {caption}
          </span>
        )}
      </div>
    </div>
  );
}

export default HeatmapCell;
