import { cn } from "@/lib/utils";

interface ScorecardRingProps {
  /** 0–100 score. */
  value: number;
  /** Pixel size of the ring (square). Defaults to 96. */
  size?: number;
  /** Stroke thickness. Defaults to 6. */
  strokeWidth?: number;
  /** Optional sublabel under the value. */
  label?: string;
  /** Color tone — auto = positive ≥66, neutral ≥34, negative below. */
  tone?: "auto" | "positive" | "neutral" | "negative" | "primary";
  className?: string;
}

/**
 * ScorecardRing — SVG donut with a value label centered. Used by Stock
 * Detail's 7-dimension scorecard. Animates the stroke-dasharray on mount.
 */
export function ScorecardRing({
  value,
  size = 96,
  strokeWidth = 6,
  label,
  tone = "auto",
  className,
}: ScorecardRingProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  const resolvedTone =
    tone === "auto"
      ? clamped >= 66
        ? "positive"
        : clamped >= 34
          ? "neutral"
          : "negative"
      : tone;

  const colorClass =
    resolvedTone === "positive"
      ? "text-positive"
      : resolvedTone === "negative"
        ? "text-negative"
        : resolvedTone === "primary"
          ? "text-primary"
          : "text-muted-foreground";

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-1",
        className,
      )}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          {/* track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={strokeWidth}
          />
          {/* value */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className={cn(
              "transition-[stroke-dashoffset] duration-slow ease-out",
              colorClass,
            )}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-xl font-semibold tabular-nums text-foreground">
            {Math.round(clamped)}
          </span>
        </div>
      </div>
      {label && (
        <span className="text-xs text-muted-foreground">{label}</span>
      )}
    </div>
  );
}

export default ScorecardRing;
