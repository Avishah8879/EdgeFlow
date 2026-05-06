import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useStockQuote } from '@/hooks/useStockQuote';
import { cn } from '@/lib/utils';
import { getCSSColor } from '@/lib/theme-utils';

// ─── Types ───────────────────────────────────────────────────────────────────
interface PriceChartPoint {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

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

// ─── Workspace tabs (visual presets — all currently render same content) ────
const WORKSPACES = [
  'Pre-market',
  'Intraday',
  'Earnings week',
  'F&O dashboard',
  'Macro',
] as const;
type Workspace = (typeof WORKSPACES)[number];

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
  const changePct = quote?.changePercent;
  const change = quote?.change;
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

// ─── Live tick chart cell (NIFTY 1-hour bars from ohlc_1hour) ───────────────
function LiveTickCell({ symbol, label }: { symbol: string; label: string }) {
  const colors = useMemo(
    () => ({
      grid: getCSSColor('--border'),
      axis: getCSSColor('--muted-foreground'),
      gold: getCSSColor('--brand-gold'),
      tooltipBg: getCSSColor('--card'),
      tooltipBorder: getCSSColor('--border'),
      tooltipText: getCSSColor('--foreground'),
    }),
    [],
  );

  // last ~5 trading days of 1-hour bars
  const { data, isLoading, isError } = useQuery<PriceChartPoint[]>({
    queryKey: [`/api/price-chart/${symbol}?timeframe=1hour&months=0.25`],
    refetchInterval: 60000,
    staleTime: 30000,
    select: (raw: any) => {
      const arr = raw?.data ?? raw ?? [];
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((p: any) => p && Number.isFinite(p.close))
        .map((p: any) => ({
          time: Number(p.time ?? p.timestamp ?? 0),
          open: Number(p.open ?? 0),
          high: Number(p.high ?? 0),
          low: Number(p.low ?? 0),
          close: Number(p.close ?? 0),
          volume: Number(p.volume ?? 0),
        }));
    },
  });

  const chartData = useMemo(
    () =>
      (data ?? []).map((p) => ({
        ts: p.time,
        close: p.close,
        label: new Date(p.time * 1000).toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
      })),
    [data],
  );

  return (
    <Cell title={`${label} · 1-hour bars · last 5 sessions`} bodyClassName="p-2">
      {isLoading ? (
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : isError || chartData.length === 0 ? (
        <div className="h-full flex items-center justify-center text-[11px] text-muted-foreground">
          Data unavailable
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="mn-tick-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.gold} stopOpacity={0.3} />
                <stop offset="100%" stopColor={colors.gold} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} opacity={0.4} />
            <XAxis
              dataKey="label"
              stroke={colors.axis}
              tick={{ fontSize: 9, fill: colors.axis }}
              tickLine={false}
              minTickGap={50}
            />
            <YAxis
              stroke={colors.axis}
              tick={{ fontSize: 9, fill: colors.axis }}
              tickLine={false}
              domain={['auto', 'auto']}
              tickFormatter={(v: number) =>
                v.toLocaleString('en-IN', { maximumFractionDigits: 0 })
              }
            />
            <ChartTooltip
              contentStyle={{
                backgroundColor: colors.tooltipBg,
                border: `1px solid ${colors.tooltipBorder}`,
                borderRadius: 6,
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
              }}
              labelStyle={{ color: colors.axis }}
              itemStyle={{ color: colors.tooltipText }}
              formatter={(v: number) => fmt(v, 2)}
            />
            <Area
              type="monotone"
              dataKey="close"
              stroke={colors.gold}
              strokeWidth={1.5}
              fill="url(#mn-tick-gradient)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Cell>
  );
}

// ─── Top movers cell ─────────────────────────────────────────────────────────
function MoversCell() {
  const { data, isLoading } = useQuery<MarketMover[]>({
    queryKey: ['/api/market-movers'],
    refetchInterval: 60000,
    staleTime: 30000,
    select: (raw: any) => {
      const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      return arr.map(
        (m: any): MarketMover => ({
          symbol: m.symbol ?? m.trading_symbol ?? '',
          name: m.name ?? '',
          ltp: Number(m.ltp ?? m.price ?? 0),
          change_percent: Number(m.change_percent ?? m.changePercent ?? m.change_pct ?? 0),
          category: m.category,
        }),
      );
    },
  });

  // Combine + sort by absolute change so the most-moved symbols are at top
  const combined = useMemo(() => {
    const list = (data ?? [])
      .filter((m) => Number.isFinite(m.change_percent ?? 0) && (m.symbol?.length ?? 0) > 0)
      .slice()
      .sort(
        (a, b) =>
          Math.abs(b.change_percent ?? 0) - Math.abs(a.change_percent ?? 0),
      );
    return list.slice(0, 9);
  }, [data]);

  return (
    <Cell title="Top movers · NSE" bodyClassName="p-2 overflow-y-auto">
      {isLoading ? (
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : combined.length === 0 ? (
        <div className="h-full flex items-center justify-center text-[11px] text-muted-foreground">
          No data
        </div>
      ) : (
        <div className="font-mono text-[11px] space-y-0">
          {combined.map((m) => {
            const pct = m.change_percent ?? 0;
            const positive = pct >= 0;
            return (
              <div
                key={m.symbol}
                className="flex items-center justify-between py-[3px] border-b border-dashed border-border/40 last:border-b-0"
              >
                <span className="truncate min-w-0 flex-1">
                  <span className="font-bold text-foreground">{m.symbol}</span>
                  {m.name && (
                    <span className="ml-1.5 text-muted-foreground truncate">
                      {m.name}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    'tabular-nums font-bold flex-shrink-0 ml-2',
                    positive ? 'text-positive' : 'text-negative',
                  )}
                >
                  {positive ? '+' : ''}
                  {pct.toFixed(2)}% · {fmt(m.ltp, 2)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Cell>
  );
}

// ─── FII/DII cell (4 available rows) ─────────────────────────────────────────
function FiiDiiCell() {
  const { data, isLoading } = useQuery<FiiDiiRow[]>({
    queryKey: ['/api/fii-dii'],
    staleTime: 60 * 60 * 1000,
  });

  const summary = useMemo(() => {
    if (!data || data.length === 0) return null;
    const today = data[data.length - 1];
    const monthStart = new Date(today.date);
    monthStart.setDate(1);
    const mtd = data.filter((r) => new Date(r.date) >= monthStart);
    const fiiMtd = mtd.reduce((s, r) => s + r.fiiNetBuySell, 0);
    const diiMtd = mtd.reduce((s, r) => s + r.diiNetBuySell, 0);
    return {
      fiiToday: today.fiiNetBuySell,
      diiToday: today.diiNetBuySell,
      fiiMtd,
      diiMtd,
      mtdSessions: mtd.length,
    };
  }, [data]);

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
            const alpha = 0.25 + intensity * 0.55;
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
  const [workspace, setWorkspace] = useState<Workspace>('Intraday');

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Workspace tab strip */}
      <div className="flex items-center justify-between px-4 md:px-6 py-2.5 border-b border-border bg-card">
        <h2 className="font-display text-[18px] md:text-[20px] font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground hidden md:block">
          Multi-asset workspace
        </h2>
        <div className="flex items-center gap-1.5 flex-wrap font-mono text-[11.5px]">
          {WORKSPACES.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWorkspace(w)}
              className={cn(
                'h-7 px-3 rounded-md border font-bold transition-colors',
                workspace === w
                  ? 'bg-[hsl(var(--brand-navy))] text-white border-[hsl(var(--brand-navy))] dark:bg-[hsl(var(--brand-gold))] dark:text-[hsl(var(--brand-navy))] dark:border-[hsl(var(--brand-gold))]'
                  : 'bg-background border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* 12-col × 7-row grid. 3 quote tiles top, 5 panels below. */}
      <div className="flex-1 grid grid-cols-12 grid-rows-7 gap-1.5 p-1.5 overflow-hidden">
        {/* Row 1-2: 3 quote tiles */}
        <div className="col-span-12 sm:col-span-4 row-span-2">
          <QuoteTile symbol="Nifty 50" label="NIFTY 50" goldBorder />
        </div>
        <div className="col-span-12 sm:col-span-4 row-span-2">
          <QuoteTile symbol="Nifty Bank" label="BANK NIFTY" />
        </div>
        <div className="col-span-12 sm:col-span-4 row-span-2">
          <QuoteTile symbol="India VIX" label="INDIA VIX" />
        </div>

        {/* Row 3-5: tick chart (left) + movers (right) */}
        <div className="col-span-12 lg:col-span-7 row-span-3">
          <LiveTickCell symbol="Nifty 50" label="NIFTY" />
        </div>
        <div className="col-span-12 lg:col-span-5 row-span-3">
          <MoversCell />
        </div>

        {/* Row 6-7: FII/DII + News + Sector heat */}
        <div className="col-span-12 md:col-span-4 row-span-2">
          <FiiDiiCell />
        </div>
        <div className="col-span-12 md:col-span-4 row-span-2">
          <NewsCell />
        </div>
        <div className="col-span-12 md:col-span-4 row-span-2">
          <SectorHeatCell />
        </div>
      </div>
    </div>
  );
}
