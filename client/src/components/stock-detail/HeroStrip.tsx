/**
 * Hero strip for the stock-detail page — gradient bg, breadcrumbs,
 * ticker mark, eyebrow + badges row, company name h1, price block (right-
 * aligned at md:+), quick actions slot, and the 7-cell StatStrip below.
 * Composes TickerMark + StatStrip + CmotsBadge primitives.
 *
 * Phase B rework (2026-05-18):
 * - Industry promoted from meta text to a navy badge in the eyebrow row.
 * - Static "Index · NIFTY 50" gold badge added (Phase 0 q2 static-for-now lock).
 * - Eyebrow trimmed to "Stock · {exchange}" (symbol shown in ticker mark + h1).
 * - Meta line dropped — sector/industry now badges; website moved next to delta.
 * - Price block: LTP + absolute-change + percent-change inline row;
 *   status line below shows "LIVE · NSE · 14:32 IST" (or CLOSED variant).
 * - Hero gradient: radial size 800px → 1200px, alpha 0.10 → 0.14 (more visible).
 *
 * Stat strip content unchanged from current page (locked: 7 cells incl. ROCE).
 */
import { type ReactNode } from "react";
import { Link } from "wouter";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/ui/eyebrow";
import { CmotsBadge } from "./CmotsBadge";
import { TickerMark } from "./TickerMark";
import { StatStrip, type StatStripCell } from "./StatStrip";

interface BasicInfoLike {
  symbol: string;
  exchange?: string | null;
  sector?: string | null;
  industry?: string | null;
  website?: string | null;
}

interface HeroStripProps {
  /** Display company name (resolved upstream; may differ from `basic.long_name`). */
  companyName: string;
  basic: BasicInfoLike;
  /** Formatted LTP, e.g. "₹2,948.55". */
  priceFormatted: string;
  /** Pre-formatted signed absolute change in rupees, e.g. "+42.30" or "−12.05". Null hides it. */
  priceChangeAbsoluteFormatted: string | null;
  /** Signed percentage change vs prev close. Null hides delta block. */
  priceChangePercent: number | null;
  /** Pre-composed status line, e.g. "LIVE · NSE · 14:32 IST" or "CLOSED · NSE". Null hides it. */
  statusLine: string | null;
  /** Stat strip cells below the hero. Pre-formatted. */
  stats: StatStripCell[];
  /** Market-cap tier badge ("Large Cap" | "Mid Cap" | "Small Cap" | null). */
  mcapTier: string | null;
  /** Whether to render the static NIFTY 50 badge. Static for now per Phase 0 q2. */
  nifty50Member?: boolean;
  /** Slot for the right-aligned quick actions (Generate Alpha button, etc.). */
  quickActions?: ReactNode;
}

export function HeroStrip({
  companyName,
  basic,
  priceFormatted,
  priceChangeAbsoluteFormatted,
  priceChangePercent,
  statusLine,
  stats,
  mcapTier,
  nifty50Member = true, // static-true per Phase 0 q2; remove once index-membership lookup lands
  quickActions,
}: HeroStripProps) {
  const isPositive = priceChangePercent != null && priceChangePercent >= 0;
  const changeColorClass = isPositive ? "text-positive" : "text-negative";

  return (
    <div className="space-y-4">
      <section
        className="relative overflow-hidden rounded-xl border border-border bg-card -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 pt-5 pb-6"
        style={{
          background:
            "radial-gradient(1200px 200px at 90% -50%, hsl(var(--brand-gold) / 0.14), transparent 70%), linear-gradient(180deg, hsl(var(--card)), hsl(var(--background)))",
        }}
      >
        {/* Breadcrumbs */}
        <nav
          className="text-xs text-muted-foreground flex items-center gap-1.5 mb-3"
          aria-label="Breadcrumb"
        >
          <Link href="/home" className="hover:text-[hsl(var(--brand-gold))] transition-colors">
            Markets
          </Link>
          <span className="opacity-40">/</span>
          <Link href="/stocks" className="hover:text-[hsl(var(--brand-gold))] transition-colors">
            Stocks
          </Link>
          <span className="opacity-40">/</span>
          <span className="text-foreground/80">{basic.symbol}</span>
        </nav>

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5">
          {/* Identity block */}
          <div className="flex items-start gap-4 min-w-0">
            <TickerMark symbol={basic.symbol} />
            <div className="space-y-1.5 min-w-0">
              {/* Eyebrow + badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <Eyebrow tone="gold">Stock · {basic.exchange ?? "NSE"}</Eyebrow>
                <CmotsBadge ticker={basic.symbol} />
                {mcapTier && <BadgeNavy>{mcapTier}</BadgeNavy>}
                {basic.industry && <BadgeNavy>{basic.industry}</BadgeNavy>}
                {/* TODO: replace static NIFTY 50 with real index-membership lookup
                    once the endpoint lands (Phase 0 §7 q2 deferred TODO). */}
                {nifty50Member && <BadgeGold>Index · NIFTY 50</BadgeGold>}
              </div>
              {/* Company name */}
              <h1 className="font-display text-2xl md:text-3xl font-bold leading-tight tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
                {companyName}
              </h1>
              {/* Optional website link only (sector/industry now badges) */}
              {basic.website && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <a
                    href={basic.website.startsWith("http") ? basic.website : `https://${basic.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-[hsl(var(--brand-gold))] transition-colors"
                  >
                    <Globe className="w-3 h-3" />
                    {basic.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Price + quick actions */}
          <div className="flex flex-col items-start md:items-end shrink-0 gap-3">
            <div className="flex flex-col items-start md:items-end">
              {/* LTP big mono */}
              <span className="text-3xl md:text-4xl font-semibold font-mono tabular-nums text-foreground leading-none">
                {priceFormatted}
              </span>
              {/* Change row: absolute + percentage, both colored */}
              {(priceChangeAbsoluteFormatted != null || priceChangePercent != null) && (
                <div
                  className={cn(
                    "flex items-baseline gap-2 mt-2 font-mono tabular-nums text-sm font-semibold",
                    changeColorClass,
                  )}
                >
                  {priceChangeAbsoluteFormatted && <span>{priceChangeAbsoluteFormatted}</span>}
                  {priceChangePercent != null && (
                    <span>
                      {priceChangePercent >= 0 ? "+" : ""}
                      {priceChangePercent.toFixed(2)}%
                    </span>
                  )}
                </div>
              )}
              {/* Status line: LIVE · NSE · HH:MM IST */}
              {statusLine && (
                <span className="text-[10.5px] text-muted-foreground mt-1.5 font-bold uppercase tracking-uppercase">
                  {statusLine}
                </span>
              )}
            </div>
            {quickActions && <div className="flex items-center gap-2">{quickActions}</div>}
          </div>
        </div>
      </section>

      <StatStrip stats={stats} />
    </div>
  );
}

// ─── Inline badge primitives ────────────────────────────────────────────────
// Small enough to keep co-located. If reused across pages, extract later.

function BadgeNavy({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-uppercase border border-[hsl(var(--brand-navy)/0.3)] text-[hsl(var(--brand-navy))] dark:text-foreground bg-[hsl(var(--brand-navy)/0.05)]">
      {children}
    </span>
  );
}

function BadgeGold({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-uppercase border border-[hsl(var(--brand-gold)/0.4)] text-[hsl(var(--brand-gold))] bg-[hsl(var(--brand-gold)/0.10)]">
      {children}
    </span>
  );
}
