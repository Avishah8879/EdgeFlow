/**
 * Stat strip — horizontal grid of label/value/subtext cells, used in the
 * stock-detail hero. Each cell follows the design's eyebrow-label + mono
 * value + optional subtext pattern.
 *
 * Reusable primitive: accepts an arbitrary stat list and lays them out
 * responsively. Default 7-cell layout matches the current page's content
 * (Mkt Cap | P/E | P/B | Div Yield | 52W Range | ROCE | ROE). Subtexts
 * are per-stat optional — Phase B leaves them undefined (deferred to
 * Phase D when sector/peer data flows per locked Phase 0 §7 q-subtexts).
 */
import { cn } from "@/lib/utils";

export interface StatStripCell {
  label: string;
  value: string;
  /** Optional small caption below the value. */
  sub?: string;
}

interface StatStripProps {
  stats: StatStripCell[];
  className?: string;
}

/**
 * Map cell count → Tailwind grid-cols class. Defaults to a sensible
 * responsive shape (2 cols mobile → 4 cols tablet → N cols desktop).
 */
function gridColsClass(n: number): string {
  switch (n) {
    case 6:
      return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6";
    case 7:
      return "grid-cols-2 sm:grid-cols-4 lg:grid-cols-7";
    case 8:
      return "grid-cols-2 sm:grid-cols-4 lg:grid-cols-8";
    default:
      return `grid-cols-2 sm:grid-cols-4`;
  }
}

export function StatStrip({ stats, className }: StatStripProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card overflow-hidden",
        className,
      )}
    >
      <div className={cn("grid", gridColsClass(stats.length))}>
        {stats.map((s, idx) => (
          <StatCell key={`${s.label}-${idx}`} label={s.label} value={s.value} sub={s.sub} />
        ))}
      </div>
    </div>
  );
}

function StatCell({ label, value, sub }: StatStripCell) {
  return (
    <div className="p-3.5 md:p-4 border-r last:border-r-0 border-b sm:[&:nth-child(-n+4)]:border-b lg:border-b-0 border-border">
      <div className="text-[10px] font-bold uppercase tracking-uppercase text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-base font-bold tabular-nums text-foreground mt-1.5 leading-none">
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}
