import { cn } from "@/lib/utils";

interface EyebrowProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Color tone — `muted` (default) or `gold` accent. */
  tone?: "muted" | "gold";
  /** Render with the section-eyebrow gold rule prefix (decorative line). */
  rule?: boolean;
}

/**
 * Eyebrow — uppercase, tracked, small label that sits above page H1s and
 * card titles. Per DESIGN_NOTES.md §3, eyebrows are <span> not headings.
 *
 *   <Eyebrow>OVERVIEW</Eyebrow>
 *   <Eyebrow tone="gold" rule>SECTION TITLE</Eyebrow>
 */
export function Eyebrow({
  tone = "muted",
  rule = false,
  className,
  children,
  ...props
}: EyebrowProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-uppercase",
        tone === "gold" ? "text-[hsl(var(--brand-gold))]" : "text-muted-foreground",
        className,
      )}
      {...props}
    >
      {rule && (
        <span
          aria-hidden
          className={cn(
            "inline-block h-px w-[18px] shrink-0",
            tone === "gold" ? "bg-[hsl(var(--brand-gold))]" : "bg-border",
          )}
        />
      )}
      {children}
    </span>
  );
}

export default Eyebrow;
