/**
 * Pros / Cons panel — adapter pattern (plan §9 option a):
 *   - Covered ticker (has_cmots_data=true) → consume useCmotsProsCons,
 *     showing the §9.3 rule-engine output as {type, label, detail} cards.
 *   - Uncovered ticker (has_cmots_data=false) → fall back to the existing
 *     client-side derivation (derivePros/deriveCons on the fundamentals
 *     scalar object) and adapt to the same {type, label, detail} shape
 *     so the rendering code is uniform.
 *
 * The frontend sees one component, two data paths. Backend consolidation
 * to a unified get_pros_cons_from_fundamentals accessor is a future
 * candidate (filed in TODO_CMOTS.md as Item -5 if revisited).
 */
import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCmotsCoverage } from "@/hooks/use-cmots-coverage";
import { useCmotsProsCons, type CmotsProConEntry } from "@/hooks/use-cmots-pros-cons";

interface ProsConsPanelProps {
  /** Symbol — drives both the coverage probe and the CMOTS accessor. */
  ticker: string | undefined;
  /** Fallback source for uncovered tickers — the existing
   *  ``stock-detail.fundamentals`` flat dict (trailing_pe, return_on_equity,
   *  profit_margin, debt_to_equity, revenue_growth, etc.). */
  fundamentalsFallback: Record<string, any> | null | undefined;
}

// ─── Fallback derivation for uncovered tickers ──────────────────────────
//
// This fallback path runs ONLY for tickers where ``has_cmots_data=false``.
// In practice (pre- and post-§10 cutover) those rows are populated
// exclusively by the legacy yfinance writer, which uses the following
// API conventions (per main.py:6267-6284):
//
//   - profit_margin, operating_margin, return_on_equity, return_on_assets,
//     revenue_growth, earnings_growth, payout_ratio
//     → API ALWAYS multiplies the fraction-stored DB value by 100
//       (e.g. DB 0.0914 → API 9.14). Use these values directly as %.
//   - dividend_yield → API does NOT multiply; yfinance stores the DB
//     value as percentage already (e.g. RELIANCE 0.38, 360ONE 1.61).
//     Use directly — no ×100.
//   - debt_to_equity, current_ratio, trailing_pe, price_to_book
//     → numeric ratios, not percentages. Use directly.
//
// (The §6 CMOTS backfill stores dividend_yield as fraction (0.0044), but
// CMOTS-backfilled rows have ``has_cmots_data=true`` → routed through the
// rule-engine path, not this fallback. The fallback never sees §6 data.)
//
// The original derivePros/deriveCons in StockDetail.tsx had a latent
// double-multiply bug for the first group (the table was empty in dev
// pre-§6 so it never manifested visibly). Those functions are deleted
// in Phase 3 wiring; ProsConsPanel becomes the sole source.

function deriveFromFundamentals(f: Record<string, any>): CmotsProConEntry[] {
  const out: CmotsProConEntry[] = [];
  // Pros
  if (f.return_on_equity != null && f.return_on_equity >= 15) {
    out.push({ type: "pro", label: "Healthy ROE",
      detail: `Return on equity of ${f.return_on_equity.toFixed(2)}%` });
  }
  if (f.profit_margin != null && f.profit_margin >= 15) {
    out.push({ type: "pro", label: "Strong profit margins",
      detail: `Profit margin of ${f.profit_margin.toFixed(2)}%` });
  }
  if (f.dividend_yield != null && f.dividend_yield >= 2) {
    out.push({ type: "pro", label: "Healthy dividend yield",
      detail: `${f.dividend_yield.toFixed(2)}% yield` });
  }
  if (f.debt_to_equity != null && f.debt_to_equity < 0.3) {
    out.push({ type: "pro", label: "Low leverage",
      detail: "Company is almost debt free" });
  }
  if (f.revenue_growth != null && f.revenue_growth >= 15) {
    out.push({ type: "pro", label: "Strong revenue growth",
      detail: `Revenue growth of ${f.revenue_growth.toFixed(2)}%` });
  }
  if (f.earnings_growth != null && f.earnings_growth >= 15) {
    out.push({ type: "pro", label: "Strong earnings growth",
      detail: `Earnings growth of ${f.earnings_growth.toFixed(2)}%` });
  }
  if (f.current_ratio != null && f.current_ratio >= 1.5) {
    out.push({ type: "pro", label: "Strong liquidity",
      detail: `Current ratio of ${f.current_ratio.toFixed(2)}` });
  }
  // Cons
  if (f.return_on_equity != null && f.return_on_equity < 10) {
    out.push({ type: "con", label: "Weak ROE",
      detail: `Return on equity of ${f.return_on_equity.toFixed(2)}%` });
  }
  if (f.profit_margin != null && f.profit_margin < 5) {
    out.push({ type: "con", label: "Low profit margins",
      detail: `Profit margin of ${f.profit_margin.toFixed(2)}%` });
  }
  if (
    f.payout_ratio != null
    && f.payout_ratio < 10
    && f.dividend_yield != null
    && f.dividend_yield > 0
  ) {
    out.push({ type: "con", label: "Low dividend payout",
      detail: `Payout of ${f.payout_ratio.toFixed(2)}% of profits` });
  }
  if (f.debt_to_equity != null && f.debt_to_equity > 1) {
    out.push({ type: "con", label: "High leverage",
      detail: `Debt to equity ratio of ${f.debt_to_equity.toFixed(2)}` });
  }
  if (f.trailing_pe != null && f.trailing_pe > 50) {
    out.push({ type: "con", label: "Premium valuation",
      detail: `Trading at P/E of ${f.trailing_pe.toFixed(2)}` });
  }
  if (f.price_to_book != null && f.price_to_book > 5) {
    out.push({ type: "con", label: "High price-to-book",
      detail: `Trading at ${f.price_to_book.toFixed(2)}× book value` });
  }
  return out;
}


// ─── Render ────────────────────────────────────────────────────────────────


function EntryCard({ entry }: { entry: CmotsProConEntry }) {
  const Icon = entry.type === "pro" ? CheckCircle2
             : entry.type === "con" ? AlertCircle
             : Info;
  const colorClass = entry.type === "pro" ? "text-positive"
                   : entry.type === "con" ? "text-negative"
                   : "text-muted-foreground";
  return (
    <div className="flex items-start gap-3 p-3 rounded-md border border-border/50 bg-card">
      <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", colorClass)} />
      <div className="min-w-0 space-y-0.5">
        <div className="text-sm font-medium text-foreground">{entry.label}</div>
        <div className="text-xs text-muted-foreground">{entry.detail}</div>
      </div>
    </div>
  );
}


export function ProsConsPanel({ ticker, fundamentalsFallback }: ProsConsPanelProps) {
  const { data: coverage } = useCmotsCoverage(ticker);
  const isCovered = !!coverage?.has_cmots_data;

  // CMOTS hook runs unconditionally (TanStack Query is cheap to keep
  // mounted; the gate inside the backend ensures uncovered returns []
  // quickly). But we only use its output when isCovered=true.
  const cmotsQuery = useCmotsProsCons(ticker);

  let entries: CmotsProConEntry[] = [];
  let source: "cmots" | "derived" | "unknown" = "unknown";

  if (isCovered) {
    if (cmotsQuery.isLoading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}
        </div>
      );
    }
    if (cmotsQuery.error) {
      return (
        <div className="py-8 flex flex-col items-center justify-center text-center space-y-2">
          <AlertCircle className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Pros / Cons unavailable</p>
        </div>
      );
    }
    entries = cmotsQuery.data ?? [];
    source = "cmots";
  } else if (fundamentalsFallback) {
    entries = deriveFromFundamentals(fundamentalsFallback);
    source = "derived";
  }

  if (entries.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">
        No notable strengths or weaknesses detected.
      </div>
    );
  }

  // Group pros and cons (info entries blend with pros visually)
  const pros = entries.filter((e) => e.type !== "con");
  const cons = entries.filter((e) => e.type === "con");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {pros.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-positive font-bold">Pros</div>
            <div className="space-y-2">
              {pros.map((e, idx) => <EntryCard key={`pro-${idx}`} entry={e} />)}
            </div>
          </div>
        )}
        {cons.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-negative font-bold">Cons</div>
            <div className="space-y-2">
              {cons.map((e, idx) => <EntryCard key={`con-${idx}`} entry={e} />)}
            </div>
          </div>
        )}
      </div>
      {source === "cmots" && (
        <p className="text-[10.5px] text-muted-foreground uppercase tracking-uppercase font-bold">
          Source: CMOTS rule engine
        </p>
      )}
    </div>
  );
}
