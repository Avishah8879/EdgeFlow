import { Eyebrow } from "@/components/ui/eyebrow";

interface FtPageHeaderProps {
  /** Section / breadcrumb-y eyebrow text. e.g. "Terminal · Movers & flow". */
  eyebrow: string;
  /** Page H1. */
  title: string;
  /** Optional one-line descriptor under the H1. */
  description?: string;
  /** Optional right-aligned slot — chips, status pill, refresh button, etc. */
  rightSlot?: React.ReactNode;
  /** Optional row beneath the descriptor — usually tab bar / sub-nav. */
  belowSlot?: React.ReactNode;
}

/**
 * FtPageHeader — tight masthead band for Financial Terminal pages.
 *
 * Per design ref (`{terminal-page}.html`), terminal pages use a smaller
 * H1 (~26px) than editorial pages (~32-42px) and sit on a single-row
 * `bg-card` band with a subtle border-b. Body content fills below.
 *
 * Pair with a flex column shell so the body can claim remaining height:
 *   <div className="flex flex-col h-[calc(100vh-3.5rem)]">
 *     <FtPageHeader … />
 *     <div className="flex-1 overflow-hidden"><Panel /></div>
 *   </div>
 */
export function FtPageHeader({
  eyebrow,
  title,
  description,
  rightSlot,
  belowSlot,
}: FtPageHeaderProps) {
  return (
    <div className="border-b border-border bg-card">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1.5 min-w-0">
            <Eyebrow tone="gold" rule>
              {eyebrow}
            </Eyebrow>
            <h1 className="font-display text-2xl md:text-[26px] font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground leading-[1.1]">
              {title}
            </h1>
            {description && (
              <p className="text-sm text-muted-foreground max-w-3xl">
                {description}
              </p>
            )}
          </div>
          {rightSlot && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {rightSlot}
            </div>
          )}
        </div>
        {belowSlot}
      </div>
    </div>
  );
}

export default FtPageHeader;
