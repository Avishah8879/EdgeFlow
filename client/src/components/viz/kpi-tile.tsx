import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/ui/eyebrow";
import { DeltaBadge } from "@/components/ui/delta-badge";

interface KpiTileProps {
  /** Label sits above the value as an eyebrow. */
  label: string;
  /** Pre-formatted value string (use existing format helpers). */
  value: string | number;
  /** Optional change number — color + arrow inferred from sign. */
  delta?: number;
  /** Suffix on the delta (e.g. "%", " bps"). */
  deltaSuffix?: string;
  /** Optional secondary line under the value (e.g. "vs prev close"). */
  caption?: string;
  className?: string;
}

/**
 * KpiTile — eyebrow + mono numeric + delta. Used in Dashboard, Portfolio
 * header, Admin overview. Numerics MUST be mono + tabular-nums per the
 * "premium terminal" rule.
 */
export function KpiTile({
  label,
  value,
  delta,
  deltaSuffix = "%",
  caption,
  className,
}: KpiTileProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Eyebrow>{label}</Eyebrow>
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-foreground">
          {value}
        </span>
        {delta != null && <DeltaBadge value={delta} suffix={deltaSuffix} />}
      </div>
      {caption && (
        <span className="text-xs text-muted-foreground">{caption}</span>
      )}
    </div>
  );
}

export default KpiTile;
