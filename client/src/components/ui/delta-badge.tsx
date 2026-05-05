import { cn } from "@/lib/utils";

interface DeltaBadgeProps {
  /** Numeric value or pre-formatted string. Sign drives the color. */
  value: number | string;
  /**
   * If a string is passed, supply the sign explicitly via `direction`.
   * For numeric `value`, sign is inferred (>= 0 → up).
   */
  direction?: "up" | "down" | "flat";
  /** Suffix appended to numeric values, e.g. "%", " bps". */
  suffix?: string;
  /** Show the leading arrow (default true). */
  showArrow?: boolean;
  /** Visual variant — text only or pill. */
  variant?: "text" | "badge";
  className?: string;
}

/**
 * DeltaBadge — change indicator with mono numeric, semantic color, and an
 * SR-only "up"/"down" word so screen readers describe direction.
 *
 *   <DeltaBadge value={1.42} suffix="%" />          // text + arrow
 *   <DeltaBadge value="+₹3.2" direction="up" variant="badge" />
 */
export function DeltaBadge({
  value,
  direction,
  suffix = "",
  showArrow = true,
  variant = "text",
  className,
}: DeltaBadgeProps) {
  const numeric = typeof value === "number" ? value : null;
  const dir: "up" | "down" | "flat" =
    direction ??
    (numeric == null ? "flat" : numeric > 0 ? "up" : numeric < 0 ? "down" : "flat");

  const colorClass =
    dir === "up"
      ? "text-positive"
      : dir === "down"
        ? "text-negative"
        : "text-muted-foreground";

  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "•";
  const srWord = dir === "up" ? "up" : dir === "down" ? "down" : "flat";

  const formatted =
    numeric != null
      ? `${numeric > 0 ? "+" : ""}${numeric.toFixed(Math.abs(numeric) >= 100 ? 0 : 2)}${suffix}`
      : `${value}${suffix}`;

  if (variant === "badge") {
    const bg =
      dir === "up"
        ? "bg-positive/12 border-positive/25"
        : dir === "down"
          ? "bg-negative/12 border-negative/25"
          : "bg-muted border-border";
    return (
      <span
        className={cn(
          "inline-flex h-[22px] items-center gap-1 rounded-pill border px-2 text-[11px] font-mono font-semibold tabular-nums",
          bg,
          colorClass,
          className,
        )}
      >
        <span className="sr-only">{srWord}</span>
        {showArrow && <span className="text-[0.7em]">{arrow}</span>}
        {formatted}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono font-semibold tabular-nums",
        colorClass,
        className,
      )}
    >
      <span className="sr-only">{srWord}</span>
      {showArrow && <span className="text-[0.7em]">{arrow}</span>}
      {formatted}
    </span>
  );
}

export default DeltaBadge;
