import { useMarketStatus } from "@/hooks/use-market-status";
import { cn } from "@/lib/utils";

/**
 * MarketStatusPill — design-spec pill with pulse-dot and session label.
 *
 *   • Open       → green pulsing dot + "Market Open"
 *   • Closed     → red dot + "Market Closed"
 *   • Pre/Post   → amber dot + label
 *
 * Wraps the existing useMarketStatus hook; preserves the unhappy-path
 * (loading, no data) UX by rendering a neutral placeholder.
 */
export function MarketStatusPill({ className }: { className?: string }) {
  const { data: marketStatus, isLoading } = useMarketStatus();

  if (isLoading || !marketStatus) {
    return (
      <span
        className={cn(
          "inline-flex h-7 items-center gap-2 rounded-pill border border-border bg-card px-3 text-[11px] font-medium text-muted-foreground",
          className,
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
        Loading…
      </span>
    );
  }

  const status = marketStatus.status;
  const reason = marketStatus.reason ?? status;
  const isOpen = marketStatus.is_open === true;
  const isPreOrPost =
    status === "PRE_MARKET" ||
    status === "PRE-MARKET" ||
    status === "AFTER_HOURS" ||
    status === "POST-MARKET";
  const closedReasonLabel: Record<string, string> = {
    HOLIDAY: "Holiday",
    WEEKEND: "Weekend",
    PRE_MARKET: "Pre-market",
    "PRE-MARKET": "Pre-market",
    AFTER_HOURS: "After hours",
    "POST-MARKET": "After hours",
    CLOSED: "Closed",
  };
  const tone =
    isOpen
      ? { dot: "bg-[hsl(var(--status-open))]", text: "text-[hsl(var(--status-open))]", border: "border-[hsl(var(--status-open)/0.3)]", bg: "bg-[hsl(var(--status-open)/0.08)]", pulse: true, label: "Market Open" }
      : isPreOrPost
        ? { dot: "bg-[hsl(var(--status-pre-market))]", text: "text-[hsl(var(--status-pre-market))]", border: "border-[hsl(var(--status-pre-market)/0.3)]", bg: "bg-[hsl(var(--status-pre-market)/0.08)]", pulse: false, label: "Market Closed" }
        : { dot: "bg-[hsl(var(--status-closed))]", text: "text-[hsl(var(--status-closed))]", border: "border-[hsl(var(--status-closed)/0.3)]", bg: "bg-[hsl(var(--status-closed)/0.08)]", pulse: false, label: "Market Closed" };
  const title = isOpen
    ? marketStatus.message
    : `${closedReasonLabel[reason] ?? reason}: ${marketStatus.message}`;

  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-2 rounded-pill border px-3 text-[11px] font-semibold",
        tone.border,
        tone.bg,
        tone.text,
        className,
      )}
      title={title}
    >
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          tone.dot,
          tone.pulse && "animate-pulse",
        )}
        aria-hidden
      />
      {tone.label}
    </span>
  );
}

export default MarketStatusPill;
