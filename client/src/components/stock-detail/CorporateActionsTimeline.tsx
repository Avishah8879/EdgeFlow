/**
 * Corporate Actions Timeline — vertical timeline of dividends, bonuses,
 * splits, AGMs, board meetings, etc., color-coded by action_type. Picks
 * from existing Tailwind palette (text-positive / amber / blue / purple
 * / muted-foreground) to stay visually consistent with the rest of the
 * stock-detail page.
 *
 * No action_type filter UI in this panel (the §9 plan reserves filtering
 * for a future enhancement) — surfaces all events newest-first.
 */
import { AlertCircle, Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCmotsCorporateActions, type CmotsCorporateAction } from "@/hooks/use-cmots-corporate-actions";

interface CorporateActionsTimelineProps {
  ticker: string | undefined;
  /** Cap on entries to render — keeps long histories scrollable. */
  maxEntries?: number;
}

// action_type → display config. Colors pulled from existing Tailwind
// theme classes that the rest of the app uses (positive/negative/etc.).
// Anything not in this map renders with the muted default.
const ACTION_TYPE_CONFIG: Record<
  string,
  { label: string; dotClass: string; chipClass: string }
> = {
  dividend: {
    label: "Dividend",
    dotClass: "bg-positive",
    chipClass: "bg-[hsl(var(--positive)/0.10)] text-positive border-[hsl(var(--positive)/0.3)]",
  },
  bonus: {
    label: "Bonus",
    dotClass: "bg-blue-500",
    chipClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
  },
  split: {
    label: "Stock Split",
    dotClass: "bg-purple-500",
    chipClass: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
  },
  rights: {
    label: "Rights Issue",
    dotClass: "bg-pink-500",
    chipClass: "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/30",
  },
  buyback: {
    label: "Buyback",
    dotClass: "bg-amber-500",
    chipClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  },
  agm: {
    label: "AGM",
    dotClass: "bg-muted-foreground",
    chipClass: "bg-muted/40 text-muted-foreground border-border",
  },
  egm: {
    label: "EGM",
    dotClass: "bg-muted-foreground",
    chipClass: "bg-muted/40 text-muted-foreground border-border",
  },
  board_meeting: {
    label: "Board Meeting",
    dotClass: "bg-muted-foreground/60",
    chipClass: "bg-muted/30 text-muted-foreground border-border",
  },
  book_closure: {
    label: "Book Closure",
    dotClass: "bg-muted-foreground/60",
    chipClass: "bg-muted/30 text-muted-foreground border-border",
  },
  merger_demerger: {
    label: "Merger / Demerger",
    dotClass: "bg-orange-500",
    chipClass: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",
  },
  ofs: {
    label: "Offer for Sale",
    dotClass: "bg-orange-500",
    chipClass: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",
  },
  change_of_name: {
    label: "Name Change",
    dotClass: "bg-muted-foreground/60",
    chipClass: "bg-muted/30 text-muted-foreground border-border",
  },
  delisted: {
    label: "Delisting",
    dotClass: "bg-negative",
    chipClass: "bg-[hsl(var(--negative)/0.10)] text-negative border-[hsl(var(--negative)/0.3)]",
  },
  forthcoming: {
    label: "Forthcoming",
    dotClass: "bg-[hsl(var(--brand-gold))]",
    chipClass: "bg-[hsl(var(--brand-gold)/0.10)] text-[hsl(var(--brand-gold))] border-[hsl(var(--brand-gold)/0.3)]",
  },
};

const DEFAULT_CONFIG = {
  label: "Event",
  dotClass: "bg-muted-foreground/60",
  chipClass: "bg-muted/30 text-muted-foreground border-border",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// Render a single event's payload-derived detail line. Each action type
// surfaces 1–2 fields from payload that the timeline should show beneath
// the action_type chip (e.g. dividend amount, bonus ratio).
function describeEvent(entry: CmotsCorporateAction): string {
  const p = entry.payload ?? {};
  switch (entry.action_type) {
    case "dividend":
      return p.divamount != null
        ? `₹${p.divamount}/share${p.divper != null ? ` · ${p.divper}%` : ""}${p.remark ? ` · ${p.remark}` : ""}`
        : (p.remark as string | undefined) ?? "Dividend declared";
    case "bonus":
      return (p.bonusratio as string | undefined) ?? "Bonus issue";
    case "split":
      return p.oldfv != null && p.newfv != null
        ? `Face value ₹${p.oldfv} → ₹${p.newfv}`
        : "Stock split";
    case "rights":
      return (p.rightsratio as string | undefined) ?? "Rights issue";
    case "buyback":
      return p.maxbaybackprice != null
        ? `Max price ₹${p.maxbaybackprice}/share`
        : "Buyback announced";
    case "agm":
    case "egm":
      return (p.purpose as string | undefined) ?? "General meeting";
    case "board_meeting":
      return (p.purpose as string | undefined) ?? "Board meeting";
    case "book_closure":
      return (p.purpose as string | undefined) ?? "Book closure";
    case "merger_demerger":
      return (p.purpose as string | undefined) ?? "Merger / Demerger";
    case "ofs":
      return p.floorprice != null
        ? `OFS floor ₹${p.floorprice}/share`
        : "Offer for sale";
    case "forthcoming":
      return (p.corpaction as string | undefined) ?? "Upcoming event";
    default:
      return entry.source_slug ?? "Event";
  }
}


export function CorporateActionsTimeline({
  ticker,
  maxEntries = 30,
}: CorporateActionsTimelineProps) {
  const { data, isLoading, error } = useCmotsCorporateActions(ticker);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="h-2 w-2 rounded-full shrink-0 mt-2" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-1/4" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 flex flex-col items-center justify-center text-center space-y-2">
        <AlertCircle className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Corporate actions unavailable</p>
        <p className="text-xs text-muted-foreground/70">{(error as Error).message}</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">
        No corporate actions on record.
      </div>
    );
  }

  const entries = data.slice(0, maxEntries);

  return (
    <div className="relative">
      {/* Vertical rail */}
      <div className="absolute left-[5px] top-1 bottom-1 w-px bg-border/70" aria-hidden />
      <ol className="space-y-3">
        {entries.map((entry, idx) => {
          const cfg = ACTION_TYPE_CONFIG[entry.action_type] ?? DEFAULT_CONFIG;
          return (
            <li
              key={`${entry.source_slug}-${entry.action_date}-${idx}`}
              className="relative pl-6"
            >
              {/* Dot */}
              <span
                className={cn(
                  "absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-card",
                  cfg.dotClass,
                )}
                aria-hidden
              />
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[10.5px] font-mono tabular-nums text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {formatDate(entry.action_date)}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-md border px-2 py-0.5",
                    "text-[10.5px] font-bold uppercase tracking-uppercase",
                    cfg.chipClass,
                  )}
                >
                  {cfg.label}
                </span>
              </div>
              <p className="text-sm text-foreground mt-0.5">
                {describeEvent(entry)}
              </p>
            </li>
          );
        })}
      </ol>
      {data.length > maxEntries && (
        <p className="mt-3 text-[10.5px] text-muted-foreground uppercase tracking-uppercase font-bold">
          Showing {maxEntries} of {data.length} events
        </p>
      )}
    </div>
  );
}
