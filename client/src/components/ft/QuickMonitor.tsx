import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useStockQuote } from '@/hooks/useStockQuote';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────
interface MarketMover {
  symbol: string;
  name?: string;
  ltp: number;
  price?: number;
  change?: number;
  change_percent?: number;
  changePercent?: number;
  category?: string; // GAINER | LOSER
}

interface ExtremeRow {
  symbol: string;
  name?: string;
  ltp: number | null;
  percent_change: number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
  distance_pct: number | null; // % away from the 52w extreme
}

interface ExtremesResponse {
  highs: ExtremeRow[];
  lows: ExtremeRow[];
}

interface RankRow {
  symbol: string;
  name?: string;
  ltp: number | null;
  pct: number | null;
}

interface FiiDiiRow {
  date: string;
  fiiNetBuySell: number;
  diiNetBuySell: number;
  fiiGrossBuy: number;
  fiiGrossSell: number;
  diiGrossBuy: number;
  diiGrossSell: number;
}

interface NewsItem {
  title: string;
  source?: string;
  publishedAt?: string;
  published_at?: string;
  link?: string;
  url?: string;
}

interface SectorHeatRow {
  sector: string;
  avg_change_percent: number;
  member_count: number;
}

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n)
    ? '—'
    : n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

const fmtCr = (rupees: number | null | undefined) => {
  if (rupees == null || !Number.isFinite(rupees)) return '—';
  const sign = rupees < 0 ? '−' : '+';
  const abs = Math.abs(rupees);
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}K cr`;
  return `${sign}₹${abs.toFixed(0)}cr`;
};

const fmtTime = (iso: string | undefined) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
};

// ─── Cell shell ──────────────────────────────────────────────────────────────
function Cell({
  title,
  className,
  goldBorder,
  children,
  bodyClassName,
}: {
  title: string;
  className?: string;
  goldBorder?: boolean;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-md bg-card overflow-hidden flex flex-col min-h-0',
        goldBorder ? 'border-2 border-[hsl(var(--brand-gold))]' : 'border border-border',
        className,
      )}
    >
      <div className="px-2.5 py-1.5 border-b border-border bg-muted/40 flex items-center justify-between">
        <span className="font-mono text-[10px] font-bold uppercase tracking-uppercase text-muted-foreground">
          {title}
        </span>
      </div>
      <div className={cn('flex-1 min-h-0 overflow-hidden', bodyClassName ?? 'p-2.5')}>
        {children}
      </div>
    </div>
  );
}

// ─── Quote tile ──────────────────────────────────────────────────────────────
function QuoteTile({
  symbol,
  label,
  goldBorder,
}: {
  symbol: string;
  label: string;
  goldBorder?: boolean;
}) {
  const { data: quote, isLoading } = useStockQuote(symbol, true, {
    refetchInterval: 30000,
  });

  const price = quote?.price;
  const change = quote?.change;
  // Indices don't always have percent_change populated in ltp_live, but
  // change (= ltp - close) is computed downstream. Compute the percent
  // locally as fallback when API returns 0.
  const apiPct = quote?.changePercent;
  const fallbackPct =
    price != null &&
    Number.isFinite(price) &&
    change != null &&
    Number.isFinite(change) &&
    Math.abs(price - change) > 0
      ? (change / (price - change)) * 100
      : 0;
  const changePct =
    apiPct != null && Number.isFinite(apiPct) && apiPct !== 0 ? apiPct : fallbackPct;
  const isPositive = (change ?? 0) >= 0;

  return (
    <Cell title={label} goldBorder={goldBorder} bodyClassName="p-3 flex flex-col items-center justify-center text-center">
      {isLoading || price == null || !Number.isFinite(price) ? (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="font-display text-[20px] font-extrabold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground leading-none">
            {label}
          </div>
          <div className="font-mono text-[28px] md:text-[30px] font-bold tabular-nums text-foreground mt-1.5 leading-none">
            {fmt(price, 2)}
          </div>
          <div
            className={cn(
              'font-mono text-[12.5px] font-bold tabular-nums mt-1.5 leading-none',
              isPositive ? 'text-positive' : 'text-negative',
            )}
          >
            {isPositive ? '+' : ''}
            {fmt(change, 2)} ({isPositive ? '+' : ''}
            {(changePct ?? 0).toFixed(2)}%)
          </div>
        </>
      )}
    </Cell>
  );
}

// ─── Generic ranking cell ────────────────────────────────────────────────────
function RankCell({
  title,
  rows,
  isLoading,
  emptyMessage = 'No data',
}: {
  title: string;
  rows: RankRow[];
  isLoading: boolean;
  emptyMessage?: string;
}) {
  return (
    <Cell title={title} bodyClassName="p-2 overflow-y-auto">
      {isLoading ? (
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="h-full flex items-center justify-center text-[11px] text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <div className="font-mono text-[10.5px] space-y-0">
          {rows.map((row) => {
            const pct = row.pct ?? 0;
            const positive = pct >= 0;
            return (
              <div
                key={row.symbol}
                className="flex items-center justify-between py-[3px] border-b border-dashed border-border/40 last:border-b-0 gap-1.5"
              >
                <span className="truncate min-w-0 flex-1">
                  <span className="font-bold text-foreground">{row.symbol}</span>
                </span>
                <span
                  className={cn(
                    'tabular-nums font-bold flex-shrink-0 text-right whitespace-nowrap',
                    positive ? 'text-positive' : 'text-negative',
                  )}
                >
                  {positive ? '+' : ''}
                  {pct.toFixed(2)}%
                </span>
                <span className="tabular-nums font-semibold flex-shrink-0 text-right text-muted-foreground whitespace-nowrap min-w-[3rem]">
                  {fmt(row.ltp, 2)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Cell>
  );
}

// ─── Movers data hook (shared by Gainers + Losers cells) ─────────────────────
function useMovers() {
  return useQuery<MarketMover[]>({
    queryKey: ['/api/market-movers'],
    refetchInterval: 60_000,
    staleTime: 30_000,
    select: (raw: any) => {
      const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      return arr.map(
        (m: any): MarketMover => ({
          symbol: m.symbol ?? m.trading_symbol ?? '',
          name: m.name ?? '',
          ltp: Number(m.ltp ?? m.price ?? 0),
          change_percent: Number(
            m.change_percent ?? m.changePercent ?? m.change_pct ?? 0,
          ),
          category: m.category,
        }),
      );
    },
  });
}

function GainersCell() {
  const { data, isLoading } = useMovers();
  const rows: RankRow[] = useMemo(() => {
    return (data ?? [])
      .filter(
        (m) =>
          (m.symbol?.length ?? 0) > 0 &&
          Number.isFinite(m.change_percent) &&
          (m.change_percent ?? 0) > 0,
      )
      .slice()
      .sort((a, b) => (b.change_percent ?? 0) - (a.change_percent ?? 0))
      .slice(0, 10)
      .map((m) => ({
        symbol: m.symbol,
        name: m.name,
        ltp: m.ltp,
        pct: m.change_percent ?? 0,
      }));
  }, [data]);
  return <RankCell title="Top gainers · today" rows={rows} isLoading={isLoading} />;
}

function LosersCell() {
  const { data, isLoading } = useMovers();
  const rows: RankRow[] = useMemo(() => {
    return (data ?? [])
      .filter(
        (m) =>
          (m.symbol?.length ?? 0) > 0 &&
          Number.isFinite(m.change_percent) &&
          (m.change_percent ?? 0) < 0,
      )
      .slice()
      .sort((a, b) => (a.change_percent ?? 0) - (b.change_percent ?? 0))
      .slice(0, 10)
      .map((m) => ({
        symbol: m.symbol,
        name: m.name,
        ltp: m.ltp,
        pct: m.change_percent ?? 0,
      }));
  }, [data]);
  return <RankCell title="Top losers · today" rows={rows} isLoading={isLoading} />;
}

// ─── 52-week extremes hook (shared by Highs + Lows cells) ────────────────────
function useExtremes() {
  return useQuery<ExtremesResponse>({
    queryKey: ['/api/monitor/extremes?limit=10'],
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
    select: (raw: any): ExtremesResponse => {
      const payload = raw?.data ?? raw ?? {};
      return {
        highs: Array.isArray(payload.highs) ? payload.highs : [],
        lows: Array.isArray(payload.lows) ? payload.lows : [],
      };
    },
  });
}

function HighsCell() {
  const { data, isLoading } = useExtremes();
  const rows: RankRow[] = useMemo(() => {
    const seen = new Set<string>();
    return (data?.highs ?? []).filter((r) => {
      if (seen.has(r.symbol)) return false;
      seen.add(r.symbol);
      return true;
    }).map((r) => ({
      symbol: r.symbol,
      name: r.name ?? undefined,
      ltp: r.ltp,
      pct: r.percent_change,
    }));
  }, [data]);
  return (
    <RankCell
      title="52-week highs"
      rows={rows}
      isLoading={isLoading}
      emptyMessage="None at 52w high"
    />
  );
}

function LowsCell() {
  const { data, isLoading } = useExtremes();
  const rows: RankRow[] = useMemo(() => {
    const seen = new Set<string>();
    return (data?.lows ?? []).filter((r) => {
      if (seen.has(r.symbol)) return false;
      seen.add(r.symbol);
      return true;
    }).map((r) => ({
      symbol: r.symbol,
      name: r.name ?? undefined,
      ltp: r.ltp,
      pct: r.percent_change,
    }));
  }, [data]);
  return (
    <RankCell
      title="52-week lows"
      rows={rows}
      isLoading={isLoading}
      emptyMessage="None at 52w low"
    />
  );
}

// ─── FII/DII cell (4 available rows) ─────────────────────────────────────────
function FiiDiiCell() {
  const { data, isLoading } = useQuery<FiiDiiRow[]>({
    queryKey: ['/api/fii-dii'],
    staleTime: 60 * 60 * 1000,
  });
  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const summary = useMemo(() => {
    if (rows.length === 0) return null;
    const today = rows[rows.length - 1];
    const monthStart = new Date(today.date);
    monthStart.setDate(1);
    const mtd = rows.filter((r) => new Date(r.date) >= monthStart);
    const fiiMtd = mtd.reduce((s, r) => s + r.fiiNetBuySell, 0);
    const diiMtd = mtd.reduce((s, r) => s + r.diiNetBuySell, 0);
    return {
      fiiToday: today.fiiNetBuySell,
      diiToday: today.diiNetBuySell,
      fiiMtd,
      diiMtd,
      mtdSessions: mtd.length,
    };
  }, [rows]);

  return (
    <Cell title="FII / DII flows">
      {isLoading || !summary ? (
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="font-mono text-[11px] space-y-0">
          {[
            { label: 'FII Cash today', v: summary.fiiToday },
            { label: 'DII Cash today', v: summary.diiToday },
            { label: 'FII MTD net', v: summary.fiiMtd },
            { label: 'DII MTD net', v: summary.diiMtd },
          ].map((row) => {
            const positive = row.v >= 0;
            return (
              <div
                key={row.label}
                className="flex items-center justify-between py-[5px] border-b border-dashed border-border/40 last:border-b-0"
              >
                <span className="text-muted-foreground">{row.label}</span>
                <span
                  className={cn(
                    'tabular-nums font-bold',
                    positive ? 'text-positive' : 'text-negative',
                  )}
                >
                  {fmtCr(row.v)}
                </span>
              </div>
            );
          })}
          <p className="text-[9.5px] text-muted-foreground pt-2 leading-relaxed">
            Provisional NSE/BSE data · {summary.mtdSessions} session
            {summary.mtdSessions !== 1 ? 's' : ''} MTD
          </p>
        </div>
      )}
    </Cell>
  );
}

// ─── News tape cell ──────────────────────────────────────────────────────────
function NewsCell() {
  const { data, isLoading } = useQuery<NewsItem[]>({
    queryKey: ['/api/news/top?limit=8'],
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
    select: (raw: any) => {
      const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      return arr.map(
        (n: any): NewsItem => ({
          title: n.title ?? n.headline ?? '',
          source: n.source ?? n.publisher ?? '',
          publishedAt: n.publishedAt ?? n.published_at ?? n.timestamp ?? '',
          link: n.link ?? n.url ?? '',
        }),
      );
    },
  });

  return (
    <Cell title="News tape · live" bodyClassName="p-2.5 overflow-y-auto">
      {isLoading ? (
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="h-full flex items-center justify-center text-[11px] text-muted-foreground">
          No news
        </div>
      ) : (
        <div className="space-y-0">
          {data.slice(0, 8).map((item, idx) => (
            <a
              key={`${item.title}-${idx}`}
              href={item.link || '#'}
              target={item.link ? '_blank' : undefined}
              rel={item.link ? 'noreferrer' : undefined}
              className={cn(
                'block py-1.5 border-b border-dashed border-border/40 last:border-b-0',
                'text-[10.5px] leading-snug',
                item.link ? 'hover:bg-muted/30 transition-colors' : '',
              )}
            >
              <span className="font-mono text-[9.5px] font-bold text-muted-foreground tracking-uppercase">
                {fmtTime(item.publishedAt) || (item.source ?? '')}
              </span>
              <span className="font-semibold text-foreground ml-1.5">
                · {item.title}
              </span>
            </a>
          ))}
        </div>
      )}
    </Cell>
  );
}

// ─── Sector heat cell (3×3 grid) ─────────────────────────────────────────────
function SectorHeatCell() {
  const { data, isLoading } = useQuery<SectorHeatRow[]>({
    queryKey: ['/api/monitor/sector-heat?limit=9'],
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
    select: (raw: any) => (Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : []),
  });

  return (
    <Cell title="Sector heat · today" bodyClassName="p-1">
      {isLoading ? (
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="h-full flex items-center justify-center text-[11px] text-muted-foreground">
          No data
        </div>
      ) : (
        <div className="grid grid-cols-3 grid-rows-3 gap-[2px] h-full">
          {data.slice(0, 9).map((s) => {
            const pct = s.avg_change_percent;
            const intensity = Math.min(1, Math.abs(pct) / 2);
            const positive = pct >= 0;
            const alpha = 0.55 + intensity * 0.35;
            const bg = positive
              ? `hsl(150 50% ${42 - intensity * 12}% / ${alpha.toFixed(2)})`
              : `hsl(0 60% ${52 - intensity * 12}% / ${alpha.toFixed(2)})`;
            return (
              <div
                key={s.sector}
                className="rounded-sm flex flex-col justify-center px-2 py-1 text-white"
                style={{ backgroundColor: bg }}
                title={`${s.member_count} stocks averaged`}
              >
                <div className="font-display font-bold text-[10.5px] truncate leading-tight">
                  {s.sector}
                </div>
                <div className="font-mono font-bold text-[12.5px] tabular-nums leading-tight">
                  {positive ? '+' : ''}
                  {pct.toFixed(2)}%
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Cell>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────
export function QuickMonitor() {
  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="grid grid-cols-12 gap-1.5 p-1.5">
          {/* Row 1: 3 quote tiles (160px) */}
          <div className="col-span-12 sm:col-span-4 h-[160px]">
            <QuoteTile symbol="Nifty 50" label="NIFTY 50" goldBorder />
          </div>
          <div className="col-span-12 sm:col-span-4 h-[160px]">
            <QuoteTile symbol="Nifty Bank" label="BANK NIFTY" />
          </div>
          <div className="col-span-12 sm:col-span-4 h-[160px]">
            <QuoteTile symbol="India VIX" label="INDIA VIX" />
          </div>

          {/* Row 2: 4 ranking tables — Top gainers / losers / 52w highs / lows */}
          <div className="col-span-12 sm:col-span-6 lg:col-span-3 h-[320px]">
            <GainersCell />
          </div>
          <div className="col-span-12 sm:col-span-6 lg:col-span-3 h-[320px]">
            <LosersCell />
          </div>
          <div className="col-span-12 sm:col-span-6 lg:col-span-3 h-[320px]">
            <HighsCell />
          </div>
          <div className="col-span-12 sm:col-span-6 lg:col-span-3 h-[320px]">
            <LowsCell />
          </div>

          {/* Row 3: FII/DII + News + Sector heat — 260px */}
          <div className="col-span-12 md:col-span-4 h-[260px]">
            <FiiDiiCell />
          </div>
          <div className="col-span-12 md:col-span-4 h-[260px]">
            <NewsCell />
          </div>
          <div className="col-span-12 md:col-span-4 h-[260px]">
            <SectorHeatCell />
          </div>
        </div>
      </div>
    </div>
  );
}
