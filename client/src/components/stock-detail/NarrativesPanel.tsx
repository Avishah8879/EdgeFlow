/**
 * Narratives panel — Director's Report / Chairman / Auditor / MD&A /
 * Notes-to-Account. Doc-type toggle uses the same custom button-group
 * pattern as ShareholdingViewToggle. body_html is bleach-sanitized
 * server-side per §5 — we render it directly via dangerouslySetInnerHTML
 * inside an isolated container with `prose` typography for readability.
 */
import { useState } from "react";
import { AlertCircle, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCmotsNarratives, type CmotsDocType } from "@/hooks/use-cmots-narratives";

interface NarrativesPanelProps {
  ticker: string | undefined;
}

const DOC_TYPES: ReadonlyArray<{ id: CmotsDocType; label: string; short: string }> = [
  { id: "director_report",  label: "Director's Report",   short: "Director" },
  { id: "chairman_report",  label: "Chairman's Report",   short: "Chairman" },
  { id: "auditor_report",   label: "Auditor's Report",    short: "Auditor" },
  { id: "mda",              label: "Management Discussion", short: "MD&A" },
  { id: "notes_to_account", label: "Notes to Account",    short: "Notes" },
] as const;


export function NarrativesPanel({ ticker }: NarrativesPanelProps) {
  const [docType, setDocType] = useState<CmotsDocType>("director_report");
  const { data, isLoading, error } = useCmotsNarratives(ticker, docType);

  return (
    <div className="space-y-4">
      {/* Doc-type toggle — same shape as ShareholdingViewToggle */}
      <div className="flex flex-wrap gap-1">
        {DOC_TYPES.map((dt) => (
          <Button
            key={dt.id}
            variant={docType === dt.id ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setDocType(dt.id)}
          >
            {dt.short}
          </Button>
        ))}
      </div>

      {/* Body */}
      <NarrativeBody isLoading={isLoading} error={error as Error | null} entries={data} />
    </div>
  );
}


function NarrativeBody({
  isLoading,
  error,
  entries,
}: {
  isLoading: boolean;
  error: Error | null;
  entries: ReturnType<typeof useCmotsNarratives>["data"];
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 flex flex-col items-center justify-center text-center space-y-2">
        <AlertCircle className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Narrative unavailable</p>
        <p className="text-xs text-muted-foreground/70">{error.message}</p>
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">
        No filings of this type on record.
      </div>
    );
  }

  // Show the most recent entry; small selector if multiple years exist.
  // entries are already sorted year DESC by the accessor.
  return (
    <div className="space-y-3">
      {entries.length > 1 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="h-3 w-3" />
          {entries.length} filings on record
        </div>
      )}
      <NarrativeReader entry={entries[0]} />
    </div>
  );
}


function NarrativeReader({ entry }: { entry: NonNullable<ReturnType<typeof useCmotsNarratives>["data"]>[number] }) {
  const html = entry.body_html ?? "";
  if (!html.trim()) {
    // body_html absent but row exists (rare) — fall back to plain text
    const plain = entry.body_text?.trim() ?? "";
    if (!plain) {
      return (
        <div className="text-sm text-muted-foreground py-6 text-center">
          Filing on record but body is empty.
        </div>
      );
    }
    return (
      <div className="rounded-md border border-border/50 bg-card p-4">
        <YearHeader year={entry.year} />
        <pre className="whitespace-pre-wrap text-sm text-foreground font-sans">
          {plain}
        </pre>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border/50 bg-card p-4">
      <YearHeader year={entry.year} />
      {/*
        body_html is bleach-sanitized server-side per §5 normalize_narratives
        (uses an explicit ALLOWED_TAGS allowlist + the _DANGEROUS_TAG_BLOCK_RE
        pre-pass that strips script/style/iframe content entirely).
        Safe to render directly.
      */}
      <div
        className={cn(
          "cmots-narrative",
          "prose prose-sm dark:prose-invert max-w-none",
          "text-sm text-foreground",
          "max-h-[640px] overflow-y-auto pr-2",
        )}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}


function YearHeader({ year }: { year: number | null }) {
  return (
    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/40">
      <FileText className="h-3.5 w-3.5 text-[hsl(var(--brand-gold))]" />
      <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
        {year ? `FY ${year}` : "Latest filing"}
      </span>
    </div>
  );
}
