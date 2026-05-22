/**
 * Ticker mark — 56×56 navy gradient badge with the symbol's curated short
 * form (e.g. "RIL", "HDFC", "TCS"). Appears in the hero strip next to the
 * company name. Matches the design's navy-gradient pattern with gold
 * hairline border + card shadow.
 *
 * Short form lookup: `getTickerShortForm()` — curated map for 45 NIFTY 50
 * + 7 high-volume entries, with algorithmic 3-char fallback for unknowns.
 *
 * Font auto-shrink schedule (locked 2026-05-18, floor 14px so abbreviation
 * still reads as a logo):
 *   ≤ 4 chars → 18px
 *     5 chars → 16px
 *     6 chars → 14px
 * Map entries are capped at 6 chars; algorithmic fallback caps at 3 chars.
 */
import { cn } from "@/lib/utils";
import { getTickerShortForm } from "@/lib/ticker-short-forms";

interface TickerMarkProps {
  symbol: string;
  className?: string;
}

function fontSizeClassFor(charCount: number): string {
  if (charCount <= 4) return "text-lg";        // 18px (Tailwind default for text-lg)
  if (charCount === 5) return "text-base";     // 16px
  return "text-sm";                            // 14px (floor; 6+ char entries shouldn't exist)
}

export function TickerMark({ symbol, className }: TickerMarkProps) {
  const abbreviation = getTickerShortForm(symbol);
  const sizeClass = fontSizeClassFor(abbreviation.length);
  return (
    <div
      aria-hidden
      className={cn(
        "hidden sm:flex shrink-0 h-14 w-14 items-center justify-center rounded-xl",
        "border border-[hsl(var(--brand-gold)/0.4)]",
        "text-white font-display font-extrabold tabular-nums",
        sizeClass,
        "shadow-card",
        className,
      )}
      style={{
        background:
          "linear-gradient(135deg, hsl(var(--brand-navy)) 0%, hsl(var(--brand-navy-deep)) 100%)",
      }}
    >
      {abbreviation}
    </div>
  );
}
