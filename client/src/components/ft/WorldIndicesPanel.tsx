import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertCircle, RefreshCw, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getCSSColor } from '@/lib/theme-utils';

// ─── Types ───────────────────────────────────────────────────────────────────
type Region =
  | 'India'
  | 'Asia-Pacific'
  | 'Europe'
  | 'Americas'
  | 'Commodities & FX';

type Session = 'open' | 'closed' | 'pre-market';

interface IndexRow {
  symbol: string;
  name: string;
  region: Region;
  session: Session;
  ltp: number | null;
  change: number | null;
  change_percent: number | null;
  day_low: number | null;
  day_high: number | null;
  ytd_return: number | null;
  volatility_30d: number | null;
  sparkline: number[];
}

const REGIONS: Region[] = [
  'India',
  'Asia-Pacific',
  'Europe',
  'Americas',
  'Commodities & FX',
];

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmtPrice = (n: number | null, d = 2) =>
  n == null || !Number.isFinite(n)
    ? '—'
    : n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

const fmtPct = (n: number | null, d = 2) =>
  n == null || !Number.isFinite(n) ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`;

const fmtChange = (n: number | null) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// ─── Sparkline (inline SVG) ──────────────────────────────────────────────────
function Sparkline({
  values,
  positive,
}: {
  values: number[];
  positive: boolean;
}) {
  if (!values || values.length < 2) {
    return <div className="w-[80px] h-[24px]" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 80;
  const height = 24;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const color = positive ? getCSSColor('--positive') : getCSSColor('--negative');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="inline-block flex-shrink-0"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// ─── Day-range bar ───────────────────────────────────────────────────────────
function DayRangeBar({
  ltp,
  low,
  high,
}: {
  ltp: number | null;
  low: number | null;
  high: number | null;
}) {
  if (
    ltp == null ||
    low == null ||
    high == null ||
    !(high > low) ||
    !Number.isFinite(ltp)
  ) {
    return null;
  }
  const pct = Math.max(0, Math.min(1, (ltp - low) / (high - low))) * 100;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-mono tabular-nums text-muted-foreground">
        <span>{fmtPrice(low, 2)}</span>
        <span>{fmtPrice(high, 2)}</span>
      </div>
      <div className="relative h-1 rounded-full bg-muted overflow-hidden">
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2 w-1 bg-[hsl(var(--brand-gold))] rounded-full"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Session badge ───────────────────────────────────────────────────────────
function SessionBadge({ session }: { session: Session }) {
  const styles: Record<Session, string> = {
    open: 'bg-[hsl(var(--positive))]/15 text-positive border-[hsl(var(--positive))]/30',
    'pre-market': 'bg-[hsl(var(--brand-gold))]/15 text-[hsl(var(--brand-gold))] border-[hsl(var(--brand-gold))]/30',
    closed: 'bg-muted text-muted-foreground border-border',
  };
  const labels: Record<Session, string> = {
    open: 'Open',
    'pre-market': 'Pre-market',
    closed: 'Closed',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-uppercase px-1.5 py-0.5 rounded border',
        styles[session],
      )}
    >
      {session === 'open' && (
        <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
      )}
      {labels[session]}
    </span>
  );
}

// ─── Index card ──────────────────────────────────────────────────────────────
function IndexCard({ row }: { row: IndexRow }) {
  const positive = (row.change ?? 0) >= 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4 hover:border-[hsl(var(--brand-gold))]/40 hover:shadow-card transition-all duration-base">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="font-display text-[15px] font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground truncate">
              {row.symbol}
            </div>
            <SessionBadge session={row.session} />
          </div>
          <div className="text-[10.5px] text-muted-foreground truncate" title={row.name}>
            {row.name}
          </div>
        </div>
        <Sparkline values={row.sparkline} positive={positive} />
      </div>

      <div className="flex items-end justify-between gap-2 mb-3">
        <div className="font-mono text-[22px] font-bold tabular-nums text-foreground leading-none">
          {fmtPrice(row.ltp, 2)}
        </div>
        <div
          className={cn(
            'font-mono text-[12px] font-bold tabular-nums leading-tight text-right',
            positive ? 'text-positive' : 'text-negative',
          )}
        >
          <div className="flex items-center justify-end gap-1">
            {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {fmtChange(row.change)}
          </div>
          <div className="mt-0.5">{fmtPct(row.change_percent)}</div>
        </div>
      </div>

      <DayRangeBar ltp={row.ltp} low={row.day_low} high={row.day_high} />

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3 pt-3 border-t border-border">
        <div className="flex justify-between">
          <span className="text-[10px] uppercase tracking-uppercase font-bold text-muted-foreground">
            YTD
          </span>
          <span
            className={cn(
              'font-mono text-[11px] font-bold tabular-nums',
              row.ytd_return == null
                ? 'text-muted-foreground'
                : row.ytd_return >= 0
                  ? 'text-positive'
                  : 'text-negative',
            )}
          >
            {fmtPct(row.ytd_return, 1)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[10px] uppercase tracking-uppercase font-bold text-muted-foreground">
            30d vol
          </span>
          <span className="font-mono text-[11px] tabular-nums text-foreground">
            {row.volatility_30d == null ? '—' : `${row.volatility_30d.toFixed(1)}%`}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────
export function WorldIndicesPanel() {
  const [region, setRegion] = useState<'all' | Region>('all');

  const { data, isLoading, isError, refetch, isFetching } = useQuery<IndexRow[]>({
    queryKey: ['/api/world-indices'],
    refetchInterval: 60_000,
    staleTime: 30_000,
    select: (raw: any) =>
      Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [],
  });

  const grouped = useMemo(() => {
    const out: Partial<Record<Region, IndexRow[]>> = {};
    for (const row of data ?? []) {
      if (region !== 'all' && row.region !== region) continue;
      const r = row.region as Region;
      if (!out[r]) out[r] = [];
      out[r]!.push(row);
    }
    return out;
  }, [data, region]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--brand-gold))]" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-background">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-muted-foreground">Failed to load world indices</p>
        <Button onClick={() => refetch()} size="sm">
          Retry
        </Button>
      </div>
    );
  }

  const rows = data ?? [];

  return (
    <div className="h-full bg-background overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-5">
        {/* Region tab strip + refresh */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex rounded-full border border-border overflow-hidden bg-card flex-wrap">
            {(['all', ...REGIONS] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRegion(r)}
                className={cn(
                  'h-8 px-3.5 text-[11.5px] font-bold whitespace-nowrap transition-colors',
                  region === r
                    ? 'bg-[hsl(var(--brand-navy))] text-white dark:bg-[hsl(var(--brand-gold))] dark:text-[hsl(var(--brand-navy))]'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {r === 'all' ? 'All regions' : r}
              </button>
            ))}
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          </Button>
        </div>

        {/* Regional sections */}
        {rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <p className="text-sm text-muted-foreground">No index data available</p>
          </div>
        ) : (
          <div className="space-y-6">
            {REGIONS.map((r) => {
              const items = grouped[r] ?? [];
              if (items.length === 0) return null;
              return (
                <section key={r}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="font-display text-[13px] font-bold uppercase tracking-uppercase text-[hsl(var(--brand-navy))] dark:text-foreground">
                      {r}
                    </span>
                    <span className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                      {items.length} {items.length === 1 ? 'instrument' : 'instruments'}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {items.map((row) => (
                      <IndexCard key={`${r}-${row.symbol}`} row={row} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
