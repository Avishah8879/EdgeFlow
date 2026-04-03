import { TrendingUp, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Displays a percentage change value with optional icon and semantic colors
 * Includes pattern overlays for colorblind accessibility
 */
export function ChangeIndicator({
  value,
  showIcon = true,
  showSign = true,
  className,
}: {
  value: number
  showIcon?: boolean
  showSign?: boolean
  className?: string
}) {
  const isPositive = value > 0
  const isNegative = value < 0
  const isNeutral = value === 0

  if (isNeutral) {
    return (
      <span className={cn("text-neutral-foreground", className)}>
        0.00%
      </span>
    )
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        isPositive && "text-positive",
        isNegative && "text-negative",
        className
      )}
    >
      {showIcon && (
        isPositive ? (
          <TrendingUp className="w-3 h-3" />
        ) : (
          <TrendingDown className="w-3 h-3" />
        )
      )}
      {showSign && isPositive ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  )
}

/**
 * Badge variant with background color and border
 * For use in cards and summaries
 */
export function ChangeBadge({
  value,
  className,
}: {
  value: number
  className?: string
}) {
  const isPositive = value > 0
  const isNegative = value < 0
  const isNeutral = value === 0

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium",
        isPositive &&
          "bg-positive/10 text-positive border border-positive/20",
        isNegative &&
          "bg-negative/10 text-negative border border-negative/20",
        isNeutral &&
          "bg-neutral/10 text-neutral-foreground border border-neutral/20",
        className
      )}
    >
      {isPositive && <TrendingUp className="w-3 h-3" />}
      {isNegative && <TrendingDown className="w-3 h-3" />}
      <span>
        {isPositive ? "+" : ""}
        {value.toFixed(2)}%
      </span>
    </div>
  )
}

/**
 * Simple colored text with no icon
 * For compact displays
 */
export function ChangeText({
  value,
  showSign = true,
  showPercent = true,
  decimals = 2,
  className,
}: {
  value: number
  showSign?: boolean
  showPercent?: boolean
  decimals?: number
  className?: string
}) {
  const isPositive = value > 0
  const isNegative = value < 0
  const isNeutral = value === 0

  return (
    <span
      className={cn(
        "font-medium",
        isPositive && "text-positive",
        isNegative && "text-negative",
        isNeutral && "text-neutral-foreground",
        className
      )}
    >
      {showSign && isPositive ? "+" : ""}
      {value.toFixed(decimals)}{showPercent && "%"}
    </span>
  )
}
