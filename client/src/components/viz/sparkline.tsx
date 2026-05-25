import { cn } from "@/lib/utils";

interface SparklineProps {
  /** Series of numeric points; rendered left-to-right. */
  data: number[];
  /** Width × height in px. Defaults match the design spec (84×24). */
  width?: number;
  height?: number;
  /** Color tone — auto picks positive/negative from first vs last point. */
  tone?: "auto" | "positive" | "negative" | "neutral";
  /** Render the area fill below the line. */
  filled?: boolean;
  className?: string;
}

/**
 * Sparkline — 84×24 inline trend line. Vanilla SVG, no chart lib needed.
 * Color follows trend direction by default; stroke uses currentColor so
 * the parent component can override via `text-positive`/`text-negative`.
 */
export function Sparkline({
  data,
  width = 84,
  height = 24,
  tone = "auto",
  filled = true,
  className,
}: SparklineProps) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const areaPath = `M0,${height} L${points
    .split(" ")
    .join(" L ")} L${width},${height} Z`;

  const trendTone =
    tone === "auto"
      ? data[data.length - 1] >= data[0]
        ? "positive"
        : "negative"
      : tone;

  const colorClass =
    trendTone === "positive"
      ? "text-positive"
      : trendTone === "negative"
        ? "text-negative"
        : "text-muted-foreground";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("inline-block", colorClass, className)}
      aria-hidden
    >
      {filled && (
        <path
          d={areaPath}
          fill="currentColor"
          fillOpacity={0.1}
          stroke="none"
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default Sparkline;
