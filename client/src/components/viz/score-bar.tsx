import { cn } from "@/lib/utils";

interface ScoreBarProps {
  /** 0–100 value. */
  value: number;
  /** Display width in px. Defaults to 80. */
  width?: number;
  /** Bar height in px. Defaults to 6. */
  height?: number;
  /** Color tone for the fill. */
  tone?: "gold" | "primary" | "positive" | "negative";
  className?: string;
}

/**
 * ScoreBar — inline horizontal progress bar with gold fill on dark track.
 * Used in Screener results for ranking visuals.
 */
export function ScoreBar({
  value,
  width = 80,
  height = 6,
  tone = "gold",
  className,
}: ScoreBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  const fillColor =
    tone === "gold"
      ? "hsl(var(--brand-gold))"
      : tone === "primary"
        ? "hsl(var(--primary))"
        : tone === "positive"
          ? "hsl(var(--positive))"
          : "hsl(var(--negative))";

  return (
    <span
      className={cn(
        "inline-block overflow-hidden rounded-pill border border-border bg-muted",
        className,
      )}
      style={{ width, height }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span
        className="block h-full transition-[width] duration-slow ease-out"
        style={{ width: `${pct}%`, backgroundColor: fillColor }}
      />
    </span>
  );
}

export default ScoreBar;
