/**
 * GrowthGrid — 4-card responsive grid (Sales / Profit / Stock-Price / ROE
 * compounded growth metrics). Sits below the P&L table in the stock-detail
 * page, matching the design's `.growth-grid` section.
 *
 * Phase C scope: extracted from inline JSX in StockDetail.tsx. Data
 * sources unchanged — Sales/Profit use existing `computeCagr` over
 * income_statement, Stock Price/ROE periods left as "—" placeholders
 * pending Phase D wiring (Phase D will pull from CMOTS `cmots_ratio_yearly`
 * and `usePriceChart` over multi-year windows).
 */
import { cn } from "@/lib/utils";

interface GrowthPeriod {
  label: string;
  value: string;
}

interface GrowthCardData {
  title: string;
  periods: GrowthPeriod[];
}

interface GrowthGridProps {
  cards: GrowthCardData[];
  className?: string;
}

export function GrowthGrid({ cards, className }: GrowthGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6",
        className,
      )}
    >
      {cards.map((c) => (
        <GrowthCard key={c.title} title={c.title} periods={c.periods} />
      ))}
    </div>
  );
}

function GrowthCard({ title, periods }: GrowthCardData) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-uppercase text-muted-foreground mb-3">
        {title}
      </h3>
      <div className="space-y-1.5">
        {periods.map((p) => (
          <div
            key={p.label}
            className="flex items-center justify-between text-sm border-b border-dashed border-border/30 last:border-b-0 pb-1.5 last:pb-0"
          >
            <span className="text-muted-foreground">{p.label}:</span>
            <span className="font-mono font-semibold tabular-nums text-[hsl(var(--brand-gold))]">
              {p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
