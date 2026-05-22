/**
 * Credit Ratings panel — table of {date, agency, rating, source, file_url}
 * extracted from BSE/NSE announcements (§9.4 regex). file_url renders as
 * an external link; we do NOT try to embed the PDF preview.
 *
 * Empty / error / loading states match existing stock-detail conventions:
 *   - Loading: Skeleton from @/components/ui/skeleton
 *   - Empty:   inline muted-text fallback (no dedicated EmptyState component)
 *   - Error:   AlertCircle + muted text, centered
 */
import { AlertCircle, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCmotsCreditRatings } from "@/hooks/use-cmots-credit-ratings";

interface CreditRatingsPanelProps {
  ticker: string | undefined;
}

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

export function CreditRatingsPanel({ ticker }: CreditRatingsPanelProps) {
  const { data, isLoading, error } = useCmotsCreditRatings(ticker);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 flex flex-col items-center justify-center text-center space-y-2">
        <AlertCircle className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Credit ratings unavailable</p>
        <p className="text-xs text-muted-foreground/70">{(error as Error).message}</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">
        No credit rating events on record.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border/70 bg-card">
            <th className="text-left py-2 pr-3 text-xs uppercase tracking-wide text-muted-foreground font-medium">
              Date
            </th>
            <th className="text-left py-2 pr-3 text-xs uppercase tracking-wide text-muted-foreground font-medium">
              Agency
            </th>
            <th className="text-left py-2 pr-3 text-xs uppercase tracking-wide text-muted-foreground font-medium">
              Rating
            </th>
            <th className="text-left py-2 pr-3 text-xs uppercase tracking-wide text-muted-foreground font-medium">
              Source
            </th>
            <th className="text-left py-2 pr-3 text-xs uppercase tracking-wide text-muted-foreground font-medium">
              Filing
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((entry, idx) => (
            <tr
              key={`${entry.date}-${entry.agency}-${entry.rating}-${idx}`}
              className={idx % 2 === 1 ? "bg-muted/20" : "bg-card"}
            >
              <td className="py-2 pr-3 font-mono tabular-nums text-foreground whitespace-nowrap">
                {formatDate(entry.date)}
              </td>
              <td className="py-2 pr-3 text-foreground font-medium">
                {entry.agency}
              </td>
              <td className="py-2 pr-3 font-mono tabular-nums font-semibold text-foreground">
                {entry.rating}
              </td>
              <td className="py-2 pr-3 text-muted-foreground">
                {entry.source}
              </td>
              <td className="py-2 pr-3">
                {entry.file_url ? (
                  <a
                    href={entry.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[hsl(var(--brand-gold))] hover:underline"
                    aria-label={`Open ${entry.agency} ${entry.rating} filing`}
                  >
                    View
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > 0 && data.some((d) => d.caption) && (
        <p className="mt-3 text-[10.5px] text-muted-foreground uppercase tracking-uppercase font-bold">
          Source: CMOTS · Hover a row for full caption (not yet wired)
        </p>
      )}
    </div>
  );
}
