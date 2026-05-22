/**
 * "CMOTS Data" pill — surfaced in the StockDetail hero strip next to the
 * Eyebrow when the ticker is covered by the CMOTS sync pipeline. Hidden
 * (renders nothing) when ``has_cmots_data=false``, so it costs zero
 * visual real estate for uncovered tickers.
 *
 * Visual: small outline pill in the brand-gold accent, matching the
 * existing eyebrow tone. Database symbol from lucide-react conveys
 * "data-backed". Lives alongside the Eyebrow on the same line.
 */
import { Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCmotsCoverage } from "@/hooks/use-cmots-coverage";

interface CmotsBadgeProps {
  ticker: string | undefined;
  className?: string;
}

export function CmotsBadge({ ticker, className }: CmotsBadgeProps) {
  const { data } = useCmotsCoverage(ticker);
  if (!data?.has_cmots_data) {
    return null;
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5",
        "border-[hsl(var(--brand-gold)/0.4)] bg-[hsl(var(--brand-gold)/0.08)]",
        "text-[10px] font-bold uppercase tracking-uppercase",
        "text-[hsl(var(--brand-gold))]",
        className,
      )}
      title="Fundamentals sourced from CMOTS RGX Research"
      data-testid="cmots-badge"
    >
      <Database className="h-2.5 w-2.5" />
      CMOTS Data
    </span>
  );
}
