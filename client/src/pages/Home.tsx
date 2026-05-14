import {
  ArrowUpCircle,
  ArrowDownCircle,
  Activity,
  TrendingUp,
  TrendingDown,
  ChevronRight,
} from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { TabBar, type TabBarItem } from "@/components/ui/tab-bar";
import { MarketStatusPill } from "@/components/ui/market-status-pill";
import NewsSection from "@/components/NewsSection";
import { useIndices } from "@/hooks/use-indices";
import { useAuth } from "@/hooks/useAuth";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useBulkLTP } from "@/hooks/use-bulk-ltp";
import { useMarketMovers } from "@/hooks/use-market-movers";
import { useRecentSavedRuns, useSavedBacktestResults } from "@/hooks/use-saved-results";
import { getEquityProAiUrl, EXTERNAL_LINK_PROPS } from "@/lib/external-links";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { fadeInUp, easeOut } from "@/lib/motion";
import { SEO } from "@/components/SEO";
import { PAGE_SEO } from "@/lib/seo-config";
import { generateWebPageSchema } from "@/lib/json-ld";
import { Skeleton } from "@/components/ui/skeleton";

const heatmapTabs: TabBarItem<"sectors" | "industries" | "cap">[] = [
  { id: "sectors", label: "Sectors" },
  { id: "industries", label: "Industries" },
  { id: "cap", label: "Cap" },
];

function fmtNum(value: number, decimals = 2): string {
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtChange(value: number, decimals = 2): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(decimals)}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ─── Top indices strip ───────────────────────────────────────────────
// Below `sm` (640px): horizontal-scroll swipeable strip (6 snap-points).
// `sm` and up: 2-col grid; `md`: 3-col; `lg+`: 6-col. The same outer wrapper
// switches `display` from flex (mobile) to grid (sm+) so one tile component
// services both modes.
function IndicesStrip() {
  const { data, isLoading } = useIndices({ limit: 6 });
  const indices = data?.data ?? [];

  // Tile styling adapts: on narrow widths cells need a min-width so they
  // remain readable while scrolling; on sm+ they fill grid cells and use
  // the existing shared-border treatment.
  const tileBase =
    "p-4 shrink-0 min-w-[140px] snap-start " +
    "sm:shrink sm:min-w-0 " +
    "sm:border-r sm:last:border-r-0 sm:border-b lg:border-b-0 sm:border-border";

  const containerCls =
    "flex overflow-x-auto snap-x snap-mandatory gap-3 px-3 py-1 " +
    "sm:overflow-visible sm:snap-none sm:gap-0 sm:px-0 sm:py-0 " +
    "sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 " +
    "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className={containerCls}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className={cn(tileBase, "rounded-md sm:rounded-none")}>
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-5 w-24 mb-1" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className={containerCls}>
        {indices.slice(0, 6).map((idx) => {
          const positive = idx.changePercent >= 0;
          return (
            <Link
              key={idx.id}
              href={`/index/${encodeURIComponent(idx.symbol)}`}
              className={cn(
                tileBase,
                "border border-border rounded-md sm:border-0 sm:rounded-none hover:bg-muted/30 transition-colors duration-fast",
              )}
            >
              <div className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground truncate">
                {idx.name}
              </div>
              <div className="font-mono text-lg font-bold tabular-nums mt-1 text-foreground">
                {fmtNum(idx.value)}
              </div>
              <div
                className={cn(
                  "font-mono text-[11px] font-semibold tabular-nums mt-0.5",
                  positive ? "text-positive" : "text-negative",
                )}
              >
                {positive ? "▲ " : "▼ "}
                {fmtChange(idx.change)} · {fmtChange(idx.changePercent)}%
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Watchlist rail ──────────────────────────────────────────────────
function WatchlistRail() {
  const { watchlist, isLoading } = useWatchlist();
  const symbols = watchlist.map((w) => w.symbol);
  const { data: ltpMap } = useBulkLTP(symbols.length > 0 ? symbols : undefined);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <Eyebrow className="block">Watchlist</Eyebrow>
          <h3 className="text-sm font-bold mt-0.5">Tracked tickers</h3>
        </div>
        <Link
          href="/watchlist"
          className="text-xs text-muted-foreground hover:text-[hsl(var(--brand-gold))] transition-colors duration-fast"
        >
          {watchlist.length} stocks
        </Link>
      </div>
      <div>
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : watchlist.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground mb-3">No tickers tracked yet</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/watchlist">Add stocks →</Link>
            </Button>
          </div>
        ) : (
          watchlist.slice(0, 7).map((item) => {
            const ltp = ltpMap?.[item.symbol];
            const price = ltp?.ltp ?? null;
            const pct = ltp?.percent_change ?? null;
            const positive = (pct ?? 0) >= 0;
            return (
              <Link
                key={item.symbol}
                href={`/stocks/${encodeURIComponent(item.symbol)}`}
                className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 border-b last:border-b-0 border-border hover:bg-muted/40 transition-colors duration-fast items-center"
              >
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-foreground truncate">{item.symbol}</div>
                </div>
                <div className="font-mono text-[12.5px] font-semibold tabular-nums text-right">
                  {price != null ? fmtNum(price) : "—"}
                </div>
                <div
                  className={cn(
                    "font-mono text-[11px] font-semibold tabular-nums text-right min-w-[56px]",
                    pct == null ? "text-muted-foreground" : positive ? "text-positive" : "text-negative",
                  )}
                >
                  {pct == null ? "—" : `${positive ? "+" : ""}${pct.toFixed(2)}%`}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── EquityPro AI CTA — external, replaces in-platform Alpha Generation ──
function AlphaCTA() {
  return (
    <a
      href={getEquityProAiUrl()}
      {...EXTERNAL_LINK_PROPS}
      className="relative block overflow-hidden rounded-xl border border-[hsl(var(--brand-gold)/0.3)] p-5 shadow-card-lg group"
      style={{
        background:
          "linear-gradient(155deg, hsl(var(--brand-navy)), hsl(var(--brand-navy-deep)))",
      }}
      aria-label="Open EquityPro AI in a new tab"
    >
      <span
        aria-hidden
        className="absolute -right-8 -top-8 h-32 w-32 rounded-full"
        style={{
          background:
            "radial-gradient(circle, hsl(var(--brand-gold) / 0.4), transparent 70%)",
          filter: "blur(20px)",
        }}
      />
      <div className="relative">
        <div className="text-[10.5px] font-bold uppercase tracking-uppercase text-[hsl(var(--brand-gold))]">
          EquityPro AI · external
        </div>
        <h3 className="font-display text-lg font-bold text-white mt-1.5">
          Generate alpha for your strategies
        </h3>
        <p className="text-[12.5px] leading-snug text-[hsl(38_30%_88%)] mt-2 mb-3">
          Build, backtest, and tune AI-driven trading strategies on the EquityPro AI
          platform. Opens in a new tab.
        </p>
        <span className="inline-flex h-8 items-center rounded-md bg-[hsl(var(--brand-gold))] px-3 text-xs font-semibold text-[hsl(var(--brand-navy-deep))] group-hover:bg-[hsl(var(--brand-gold-bright))] transition-colors duration-fast">
          Open EquityPro AI ↗
        </span>
      </div>
    </a>
  );
}

// ─── Sector heatmap (placeholder, shows top movers as fallback) ──────
function SectorHeatmap() {
  // Sector heatmap requires a backend hook for heatmap_sector_data which
  // isn't currently exposed via /api. Fall back to a market-cap-style grid
  // using the latest gainers/losers as a proxy until that endpoint lands.
  const { data: gainers } = useMarketMovers({ category: "GAINER", limit: 10 });
  const { data: losers } = useMarketMovers({ category: "LOSER", limit: 6 });

  const cells = [
    ...((gainers?.data ?? [])
      .filter((s) => s.change_percent != null)
      .slice(0, 6)
      .map((s) => ({
        name: s.symbol,
        pct: s.change_percent as number,
        positive: true,
      }))),
    ...((losers?.data ?? [])
      .filter((s) => s.change_percent != null)
      .slice(0, 6)
      .map((s) => ({
        name: s.symbol,
        pct: s.change_percent as number,
        positive: false,
      }))),
  ];

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-border">
        <div>
          <Eyebrow className="block">Top movers · Heatmap</Eyebrow>
          <h3 className="text-sm font-bold mt-0.5">NSE 200 · today</h3>
        </div>
        <TabBar tabs={heatmapTabs} value="sectors" onChange={() => {}} variant="segmented" />
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1 p-3">
        {cells.map((c, i) => {
          const intensity = Math.min(1, Math.abs(c.pct) / 5);
          const alpha = 0.18 + intensity * 0.55;
          const bg = c.positive
            ? `hsl(var(--positive) / ${alpha.toFixed(2)})`
            : `hsl(var(--negative) / ${alpha.toFixed(2)})`;
          return (
            <div
              key={`${c.name}-${i}`}
              className="rounded-md p-2.5 text-center"
              style={{ backgroundColor: bg }}
            >
              <div className="text-[11px] font-bold text-white truncate">{c.name}</div>
              <div className="font-mono text-[10.5px] font-bold text-white/85 mt-0.5 tabular-nums">
                {c.positive ? "+" : ""}
                {c.pct.toFixed(2)}%
              </div>
            </div>
          );
        })}
        {cells.length === 0 &&
          [...Array(12)].map((_, i) => <Skeleton key={i} className="h-12 rounded-md" />)}
      </div>
    </div>
  );
}

// ─── Top movers split (gainers / losers) ─────────────────────────────
function TopMoversSplit() {
  const { data: gainers, isLoading: gLoading } = useMarketMovers({ category: "GAINER", limit: 5 });
  const { data: losers, isLoading: lLoading } = useMarketMovers({ category: "LOSER", limit: 5 });
  const isLoading = gLoading || lLoading;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div>
          <Eyebrow className="block">Top movers</Eyebrow>
          <h3 className="text-sm font-bold mt-0.5">NSE 200 · gainers / losers</h3>
        </div>
        <Link
          href="/most-active"
          className="text-xs text-muted-foreground hover:text-[hsl(var(--brand-gold))] inline-flex items-center gap-1 transition-colors duration-fast"
        >
          View all <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2">
        <div className="md:border-r border-border">
          <div className="px-4 py-2 text-[10.5px] font-bold uppercase tracking-uppercase text-positive flex items-center gap-1.5 bg-muted/30">
            <ArrowUpCircle className="h-3.5 w-3.5" /> Gainers
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : (
            (gainers?.data ?? []).map((s) => (
              <Link
                key={`g-${s.symbol}`}
                href={`/stocks/${encodeURIComponent(s.symbol)}`}
                className="grid grid-cols-[1fr_auto] gap-3 px-4 py-2.5 border-b last:border-b-0 border-border hover:bg-muted/40 transition-colors duration-fast"
              >
                <div className="text-[12.5px] font-semibold text-foreground truncate">{s.symbol}</div>
                <span className="font-mono text-[12.5px] font-bold text-positive tabular-nums">
                  +{(s.change_percent ?? 0).toFixed(2)}%
                </span>
              </Link>
            ))
          )}
        </div>
        <div>
          <div className="px-4 py-2 text-[10.5px] font-bold uppercase tracking-uppercase text-negative flex items-center gap-1.5 bg-muted/30">
            <ArrowDownCircle className="h-3.5 w-3.5" /> Losers
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : (
            (losers?.data ?? []).map((s) => (
              <Link
                key={`l-${s.symbol}`}
                href={`/stocks/${encodeURIComponent(s.symbol)}`}
                className="grid grid-cols-[1fr_auto] gap-3 px-4 py-2.5 border-b last:border-b-0 border-border hover:bg-muted/40 transition-colors duration-fast"
              >
                <div className="text-[12.5px] font-semibold text-foreground truncate">{s.symbol}</div>
                <span className="font-mono text-[12.5px] font-bold text-negative tabular-nums">
                  {(s.change_percent ?? 0).toFixed(2)}%
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Live news feed ──────────────────────────────────────────────────
function LiveFeed() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div>
          <Eyebrow className="block">Live feed</Eyebrow>
          <h3 className="text-sm font-bold mt-0.5">Tickers · filings · brokerage</h3>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-positive/12 border border-positive/25 px-2 py-0.5 text-[11px] font-semibold text-positive">
          <span className="h-1.5 w-1.5 rounded-full bg-positive animate-pulse" /> Live
        </span>
      </div>
      <NewsSection limit={6} />
    </div>
  );
}

// ─── Saved screens rail ──────────────────────────────────────────────
function SavedScreensRail() {
  const { data, isLoading } = useRecentSavedRuns(5);
  const items = data?.results ?? [];
  const labelForType = (type: string) => {
    switch (type) {
      case "backtest":
        return "Backtest";
      case "fundamental-screener":
        return "Fundamental";
      case "portfolio-optimizer":
        return "Portfolio";
      default:
        return "Screener";
    }
  };
  const metaForRun = (run: any) => {
    if (run.type === "portfolio-optimizer") {
      return `${run.summary?.holdings_count ?? 0} holdings`;
    }
    if (run.type === "backtest") {
      return run.summary?.ticker ?? "Strategy run";
    }
    return `${run.summary?.result_count ?? 0} matches`;
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <Eyebrow className="block">Saved screens</Eyebrow>
          <h3 className="text-sm font-bold mt-0.5">Recent runs</h3>
        </div>
        <Link
          href="/saved-results"
          className="text-xs text-muted-foreground hover:text-[hsl(var(--brand-gold))] transition-colors duration-fast"
        >
          {items.length}
        </Link>
      </div>
      <div>
        {isLoading ? (
          <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : items.length === 0 ? (
          <div className="p-5 text-center text-xs text-muted-foreground">
            No saved screens yet.{" "}
            <Link href="/screener" className="text-[hsl(var(--brand-gold))] hover:underline">
              Run one →
            </Link>
          </div>
        ) : (
          items.slice(0, 5).map((run) => (
            <Link
              key={`${run.type}-${run.id}`}
              href={run.detail_path}
              className="grid grid-cols-[1fr_auto] gap-3 px-4 py-2.5 border-b last:border-b-0 border-border hover:bg-muted/40 transition-colors duration-fast"
            >
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-foreground truncate">{run.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {metaForRun(run)}
                </div>
              </div>
              <span className="inline-flex h-6 items-center rounded-pill bg-[hsl(var(--brand-gold)/0.15)] border border-[hsl(var(--brand-gold)/0.35)] px-2.5 text-[10.5px] font-bold text-[hsl(38_60%_38%)] dark:text-[hsl(var(--brand-gold))]">
                {labelForType(run.type)}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Recent backtests ────────────────────────────────────────────────
function RecentBacktestsRail() {
  const { data, isLoading } = useSavedBacktestResults(5);
  const items = data?.results ?? [];

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <Eyebrow className="block">Recent backtests</Eyebrow>
          <h3 className="text-sm font-bold mt-0.5">Latest QIGA runs</h3>
        </div>
        <Link
          href="/saved-results"
          className="text-xs text-muted-foreground hover:text-[hsl(var(--brand-gold))] transition-colors duration-fast"
        >
          {items.length}
        </Link>
      </div>
      <div>
        {isLoading ? (
          <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : items.length === 0 ? (
          <div className="p-5 text-center text-xs text-muted-foreground">
            No backtests saved yet.{" "}
            <Link href="/alpha-generation" className="text-[hsl(var(--brand-gold))] hover:underline">
              Run one →
            </Link>
          </div>
        ) : (
          items.slice(0, 5).map((b) => {
            const cagr = (b.metrics as any)?.cagr ?? null;
            const sharpe = (b.metrics as any)?.sharpe ?? null;
            const positiveCagr = cagr != null && cagr >= 0;
            return (
              <Link
                key={b.id}
                href={`/saved-results/backtest/${b.id}`}
                className="grid grid-cols-[1fr_auto] gap-3 px-4 py-2.5 border-b last:border-b-0 border-border hover:bg-muted/40 transition-colors duration-fast"
              >
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-foreground truncate">
                    {b.ticker}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {sharpe != null ? `Sharpe ${sharpe.toFixed(2)}` : "—"}
                    {cagr != null && ` · CAGR ${cagr.toFixed(1)}%`}
                  </div>
                </div>
                {cagr != null && (
                  <span
                    className={cn(
                      "font-mono text-[11px] font-bold tabular-nums",
                      positiveCagr ? "text-positive" : "text-negative",
                    )}
                  >
                    {positiveCagr ? "+" : ""}
                    {cagr.toFixed(1)}
                  </span>
                )}
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Quick screens (preset templates) ────────────────────────────────
const QUICK_SCREENS = [
  {
    id: "1",
    name: "Momentum & Liquidity",
    description: "Strong trend + large cash flow",
    expression:
      "(close > ema_50) and (ema_50 > ema_150) and (liquidity > 1000000000)",
    icon: TrendingUp,
  },
  {
    id: "2",
    name: "RSI Pullback",
    description: "Oversold dip in long-term uptrend",
    expression: "(close > sma_200) and (rsi_14 >= 35 and rsi_14 <= 50)",
    icon: Activity,
  },
  {
    id: "3",
    name: "52W Breakout Watch",
    description: "Price reclaiming prior highs",
    expression: "(close > 0.9 * high_52_W) and (ema_20 > ema_50)",
    icon: TrendingDown,
  },
];

function QuickScreens() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div>
          <Eyebrow className="block">Quick screens</Eyebrow>
          <h3 className="text-sm font-bold mt-0.5">Preset expressions</h3>
        </div>
        <Link
          href="/screener"
          className="text-xs text-muted-foreground hover:text-[hsl(var(--brand-gold))] inline-flex items-center gap-1 transition-colors duration-fast"
        >
          Open screener <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3">
        {QUICK_SCREENS.map((s) => (
          <Link
            key={s.id}
            href={`/screener?expr=${encodeURIComponent(s.expression)}`}
            className="group flex flex-col gap-1.5 p-4 border-b md:border-b-0 md:border-r last:border-r-0 last:border-b-0 border-border hover:bg-muted/40 transition-colors duration-fast"
          >
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-foreground">{s.name}</span>
              <s.icon className="h-3.5 w-3.5 text-[hsl(var(--brand-gold))]" strokeWidth={1.75} />
            </div>
            <span className="text-[11.5px] text-muted-foreground">{s.description}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────
export default function Home() {
  const { user } = useAuth();
  const [layout, setLayout] = useState<"classic" | "focus" | "terminal">("classic");

  const layoutTabs: TabBarItem<"classic" | "focus" | "terminal">[] = [
    { id: "classic", label: "Classic" },
    { id: "focus", label: "Focus" },
    { id: "terminal", label: "Terminal" },
  ];

  const firstName = user?.name?.split(" ")[0] ?? user?.username ?? "there";

  return (
    <>
      <SEO
        title={PAGE_SEO.home.title}
        description={PAGE_SEO.home.description}
        canonical="/home"
        jsonLd={generateWebPageSchema("Market Dashboard", PAGE_SEO.home.description, "/home")}
      />

      <div className="space-y-5">
        {/* Page header */}
        <motion.section
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={easeOut}
          className="flex items-end justify-between gap-4 flex-wrap pb-1"
        >
          <div className="space-y-1.5">
            <Eyebrow tone="gold" rule>
              Workspace
            </Eyebrow>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
              {greeting()}, {firstName}.
            </h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MarketStatusPill />
            </div>
          </div>
          <TabBar tabs={layoutTabs} value={layout} onChange={setLayout} variant="segmented" />
        </motion.section>

        {/* Indices strip — always full width */}
        <IndicesStrip />

        {/* Main grid — layout-aware */}
        {layout === "focus" ? (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5 items-start">
            <div className="flex flex-col gap-5">
              <SectorHeatmap />
              <TopMoversSplit />
              <QuickScreens />
              <LiveFeed />
            </div>
            <div className="flex flex-col gap-5">
              <AlphaCTA />
              <SavedScreensRail />
              <RecentBacktestsRail />
            </div>
          </div>
        ) : layout === "terminal" ? (
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-start">
            <div className="flex flex-col gap-4">
              <WatchlistRail />
              <AlphaCTA />
            </div>
            <div className="xl:col-span-2 flex flex-col gap-4">
              <SectorHeatmap />
              <TopMoversSplit />
              <LiveFeed />
              <QuickScreens />
            </div>
            <div className="flex flex-col gap-4">
              <SavedScreensRail />
              <RecentBacktestsRail />
            </div>
          </div>
        ) : (
          // Classic — 1/2/3-column grid that reflows continuously across widths.
          // Mobile priority order (when the wrappers collapse via display:contents)
          // is set by `order-N` on each rail; on lg+ the wrappers become flex
          // columns and `order-none` restores natural source order so the desktop
          // visual is identical to before.
          //   Mobile order: Watchlist (2) → Heatmap (3) → Movers (4) →
          //   LiveFeed (5) → QuickScreens (6) → AlphaCTA (99 = last).
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] xl:grid-cols-[280px_1fr_320px] gap-5 items-start">
            <div className="contents lg:flex lg:flex-col lg:gap-5">
              <div className="order-2 lg:order-none"><WatchlistRail /></div>
              <div className="order-[99] lg:order-none"><AlphaCTA /></div>
            </div>
            <div className="contents lg:flex lg:flex-col lg:gap-5">
              <div className="order-3 lg:order-none"><SectorHeatmap /></div>
              <div className="order-4 lg:order-none"><TopMoversSplit /></div>
              <div className="order-5 lg:order-none"><LiveFeed /></div>
              <div className="order-6 lg:order-none"><QuickScreens /></div>
            </div>
            <div className="hidden xl:flex xl:flex-col xl:gap-5">
              <SavedScreensRail />
              <RecentBacktestsRail />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
