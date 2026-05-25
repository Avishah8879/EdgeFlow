import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertCircle, RefreshCw, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────
interface ActiveRow {
  symbol: string;
  name: string | null;
  sector: string | null;
  ltp: number | null;
  change_percent: number | null;
  volume: number | null;
  value_cr: number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
  band_position: number | null; // 0..1
}

type SortKey = 'volume' | 'value' | 'gainers' | 'losers' | 'high52w' | 'low52w';

const TABS: Array<{ id: SortKey; label: string; description: string }> = [
  { id: 'volume', label: 'Volume', description: 'Most-traded shares today' },
  { id: 'value', label: 'Value', description: 'Highest turnover in ₹' },
  { id: 'gainers', label: 'Top gainers', description: 'Strongest % moves up' },
  { id: 'losers', label: 'Top losers', description: 'Largest % drawdowns' },
  { id: 'high52w', label: '52w high', description: 'At or near 52-week high' },
  { id: 'low52w', label: '52w low', description: 'At or near 52-week low' },
];

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmtPrice = (n: number | null) =>
  n == null || !Number.isFinite(n)
    ? '—'
    : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtPct = (n: number | null) =>
  n == null || !Number.isFinite(n) ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

const fmtVolume = (n: number | null) => {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
};

const fmtValueCr = (n: number | null) => {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(2)}K`;
  return n.toFixed(0);
};

// ─── Hero stat card (top 4 of the active sort) ───────────────────────────────
function HeroCard({ row, sort }: { row: ActiveRow; sort: SortKey }) {
  const pct = row.change_percent ?? 0;
  const positive = pct >= 0;

  // Pick a primary metric to highlight per sort context
  let metricLabel = 'Volume';
  let metricValue = fmtVolume(row.volume);
  if (sort === 'value') {
    metricLabel = 'Value (₹cr)';
    metricValue = fmtValueCr(row.value_cr);
  } else if (sort === 'gainers' || sort === 'losers') {
    metricLabel = 'Change';
    metricValue = fmtPct(row.change_percent);
  } else if (sort === 'high52w') {
    metricLabel = 'vs 52w high';
    metricValue = row.band_position != null
      ? `${(row.band_position * 100).toFixed(1)}% band`
      : '—';
  } else if (sort === 'low52w') {
    metricLabel = 'vs 52w low';
    metricValue = row.band_position != null
      ? `${(row.band_position * 100).toFixed(1)}% band`
      : '—';
  }

  return (
    <Link href={`/stocks/${encodeURIComponent(row.symbol)}`}>
      <div className="rounded-xl border border-border bg-card p-4 hover:border-[hsl(var(--brand-gold))]/50 hover:shadow-card transition-all duration-base cursor-pointer h-full flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <div className="font-display text-base font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground truncate">
              {row.symbol}
            </div>
            <div className="text-[10.5px] text-muted-foreground truncate" title={row.name ?? ''}>
              {row.name ?? '—'}
            </div>
          </div>
          {row.sector && (
            <span className="text-[9.5px] uppercase tracking-uppercase font-bold text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded whitespace-nowrap">
              {row.sector.slice(0, 12)}
            </span>
          )}
        </div>

        <div className="font-mono text-[20px] font-bold tabular-nums text-foreground leading-none mt-1">
          {fmtPrice(row.ltp)}
        </div>
        <div
          className={cn(
            'font-mono text-[12px] font-bold tabular-nums mt-1.5 flex items-center gap-1',
            positive ? 'text-positive' : 'text-negative',
          )}
        >
          {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {fmtPct(row.change_percent)}
        </div>

        <div className="flex justify-between items-end mt-3 pt-2 border-t border-border">
          <div className="text-[10px] uppercase tracking-uppercase font-bold text-muted-foreground">
            {metricLabel}
          </div>
          <div className="font-mono text-[12.5px] font-bold tabular-nums text-foreground">
            {metricValue}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── 52-week band position bar ───────────────────────────────────────────────
function BandBar({ position }: { position: number | null }) {
  if (position == null) {
    return <span className="text-muted-foreground text-[10.5px]">—</span>;
  }
  const pct = Math.max(0, Math.min(1, position)) * 100;
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="relative flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full bg-[hsl(var(--brand-gold))]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground w-8 text-right">
        {pct.toFixed(0)}
      </span>
    </div>
  );
}

// ─── Volume bar (relative to max in current view) ────────────────────────────
function VolumeBar({ value, max }: { value: number | null; max: number }) {
  if (value == null || max <= 0) {
    return <span className="text-muted-foreground text-[10.5px]">—</span>;
  }
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="relative flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full bg-[hsl(var(--brand-navy))] dark:bg-[hsl(var(--brand-gold))]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-[10.5px] tabular-nums text-foreground w-12 text-right">
        {fmtVolume(value)}
      </span>
    </div>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────
export function MostActivePanel() {
  const [sort, setSort] = useState<SortKey>('volume');

  const { data, isLoading, isError, refetch, isFetching } = useQuery<ActiveRow[]>({
    queryKey: [`/api/most-active?sort=${sort}&limit=25`],
    refetchInterval: 60_000,
    staleTime: 30_000,
    select: (raw: any) =>
      Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [],
  });

  const rows = data ?? [];
  const top4 = rows.slice(0, 4);
  const tableRows = rows.slice(0, 25);

  const maxVolume = useMemo(() => {
    return tableRows.reduce(
      (acc, r) => (r.volume != null && r.volume > acc ? r.volume : acc),
      0,
    );
  }, [tableRows]);

  const activeTab = TABS.find((t) => t.id === sort) ?? TABS[0];

  // ── Loading / error ─────────────────────────────────────────────────────
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
        <p className="text-sm text-muted-foreground">Failed to load most active stocks</p>
        <Button onClick={() => refetch()} size="sm">
          Retry
        </Button>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="h-full bg-background overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-4">
        {/* Tab strip + refresh */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex rounded-full border border-border overflow-hidden bg-card">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSort(tab.id)}
                className={cn(
                  'h-8 px-3.5 text-[11.5px] font-bold whitespace-nowrap transition-colors',
                  sort === tab.id
                    ? 'bg-[hsl(var(--brand-navy))] text-white dark:bg-[hsl(var(--brand-gold))] dark:text-[hsl(var(--brand-navy))]'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden md:inline">
              {activeTab.description}
            </span>
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
        </div>

        {/* 4 hero stat cards */}
        {top4.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {top4.map((row) => (
              <HeroCard key={row.symbol} row={row} sort={sort} />
            ))}
          </div>
        )}

        {/* Top-25 table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
            <h3 className="font-display text-base font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
              Top 25 · {activeTab.label.toLowerCase()}
            </h3>
            <span className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
              {tableRows.length} {tableRows.length === 1 ? 'row' : 'rows'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] font-mono">
              <thead>
                <tr className="bg-muted/40 text-[10.5px] uppercase tracking-uppercase font-bold text-muted-foreground">
                  <th className="text-left py-3 px-4 w-10">#</th>
                  <th className="text-left py-3 px-4">Stock</th>
                  <th className="text-left py-3 px-4 hidden md:table-cell">Sector</th>
                  <th className="text-right py-3 px-4">LTP</th>
                  <th className="text-right py-3 px-4">Chg %</th>
                  <th className="text-left py-3 px-4">Volume</th>
                  <th className="text-right py-3 px-4 hidden lg:table-cell">Value (₹cr)</th>
                  <th className="text-left py-3 px-4 hidden lg:table-cell">52w band</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="text-center py-12 text-muted-foreground text-xs"
                    >
                      No rows for this sort right now
                    </td>
                  </tr>
                ) : (
                  tableRows.map((row, idx) => {
                    const pct = row.change_percent ?? 0;
                    const positive = pct >= 0;
                    return (
                      <tr
                        key={row.symbol}
                        className="border-t border-border/60 hover:bg-muted/30 transition-colors duration-fast"
                      >
                        <td className="py-2.5 px-4 text-muted-foreground tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-4">
                          <Link
                            href={`/stocks/${encodeURIComponent(row.symbol)}`}
                            className="block group"
                          >
                            <div className="font-bold text-foreground group-hover:text-[hsl(var(--brand-gold))] transition-colors">
                              {row.symbol}
                            </div>
                            <div
                              className="text-[10.5px] text-muted-foreground truncate max-w-[180px]"
                              title={row.name ?? ''}
                            >
                              {row.name ?? '—'}
                            </div>
                          </Link>
                        </td>
                        <td className="py-2.5 px-4 hidden md:table-cell">
                          <span className="text-[10.5px] text-muted-foreground truncate">
                            {row.sector ?? '—'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-foreground">
                          {fmtPrice(row.ltp)}
                        </td>
                        <td
                          className={cn(
                            'py-2.5 px-4 text-right tabular-nums font-bold',
                            positive ? 'text-positive' : 'text-negative',
                          )}
                        >
                          {fmtPct(row.change_percent)}
                        </td>
                        <td className="py-2.5 px-4">
                          <VolumeBar value={row.volume} max={maxVolume} />
                        </td>
                        <td className="py-2.5 px-4 text-right tabular-nums hidden lg:table-cell text-foreground">
                          {fmtValueCr(row.value_cr)}
                        </td>
                        <td className="py-2.5 px-4 hidden lg:table-cell">
                          <BandBar position={row.band_position} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
