import { useEffect, useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ReferenceLine,
} from 'recharts';
import { cn } from '@/lib/utils';
import { getCSSColor } from '@/lib/theme-utils';
import { useStockQuote } from '@/hooks/useStockQuote';

// ─── Types ───────────────────────────────────────────────────────────────────
interface OptionContract {
  contract: string;
  strike: number;
  lastPrice: number;
  bid: number;
  ask: number;
  change: number;
  changePercent: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  inTheMoney: boolean;
  delta?: number;
  oiDelta?: number | null;
}

interface ChainSummary {
  atmStrike: number | null;
  atmIV: number | null;
  pcr: number | null;
  totalCallOI: number;
  totalPutOI: number;
  maxPain: number | null;
}

interface OptionChainResponse {
  symbol: string;
  expiry: string | null;
  availableExpiries: string[];
  calls: OptionContract[];
  puts: OptionContract[];
  underlying?: number | null;
  summary?: ChainSummary | null;
}

const SUPPORTED_SYMBOLS = ['NIFTY', 'BANKNIFTY'] as const;

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n)
    ? '—'
    : n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

const fmtInt = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? '—'
    : Math.round(n).toLocaleString('en-IN');

const fmtCompact = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${(n / 1e7).toFixed(2)}cr`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Math.round(n).toLocaleString('en-IN');
};

const fmtSignedCompact = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${fmtCompact(n)}`;
};

const fmtPct = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`;

// ─── Cell shell ──────────────────────────────────────────────────────────────
function Cell({
  title,
  rightSlot,
  children,
  bodyClassName,
  className,
}: {
  title: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card overflow-hidden flex flex-col',
        className,
      )}
    >
      <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between">
        <span className="font-mono text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
          {title}
        </span>
        {rightSlot}
      </div>
      <div className={cn('flex-1 min-h-0', bodyClassName ?? 'p-4')}>{children}</div>
    </div>
  );
}

// ─── KPI tile (Max pain / PCR / ATM IV / Total OI) ───────────────────────────
function KpiTile({
  label,
  value,
  caption,
  tone = 'default',
}: {
  label: string;
  value: string;
  caption?: string;
  tone?: 'default' | 'gold';
}) {
  return (
    <div
      className={cn(
        'p-4 border-r last:border-r-0 border-border',
        tone === 'gold' && 'bg-[hsl(var(--brand-gold))]/8',
      )}
    >
      <div className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          'font-mono text-[22px] font-bold tabular-nums leading-none mt-1.5',
          tone === 'gold'
            ? 'text-[hsl(var(--brand-gold))]'
            : 'text-foreground',
        )}
      >
        {value}
      </div>
      {caption && (
        <div className="text-[10.5px] text-muted-foreground mt-1.5">{caption}</div>
      )}
    </div>
  );
}

// ─── OI Δ cell — color and arrow per sign ─────────────────────────────────────
function OiDeltaCell({ value }: { value: number | null | undefined }) {
  if (value == null) {
    return <span className="text-muted-foreground/60 text-[10.5px]">—</span>;
  }
  const positive = value >= 0;
  return (
    <span
      className={cn(
        'font-mono tabular-nums font-bold text-[11px]',
        positive ? 'text-positive' : 'text-negative',
      )}
    >
      {positive ? '+' : ''}
      {fmtCompact(value)}
    </span>
  );
}

// ─── OI bar (right-fill for calls, left-fill for puts) ───────────────────────
function OiBar({
  value,
  max,
  side,
}: {
  value: number;
  max: number;
  side: 'call' | 'put';
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const fill =
    side === 'call'
      ? 'hsl(var(--negative))'
      : 'hsl(var(--positive))';
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      {side === 'call' && (
        <span className="font-mono text-[11px] tabular-nums text-foreground w-10 text-right">
          {fmtCompact(value)}
        </span>
      )}
      <div className="relative flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="absolute top-0 h-full"
          style={{
            width: `${pct}%`,
            backgroundColor: fill,
            opacity: 0.6,
            [side === 'call' ? 'right' : 'left']: 0,
          } as any}
        />
      </div>
      {side === 'put' && (
        <span className="font-mono text-[11px] tabular-nums text-foreground w-10 text-left">
          {fmtCompact(value)}
        </span>
      )}
    </div>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────
export function OptionChainPanel() {
  const [symbol, setSymbol] = useState<string>('NIFTY');
  const [symbolInput, setSymbolInput] = useState<string>('NIFTY');
  const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null);
  const [strikeWindow, setStrikeWindow] = useState<10 | 20 | 999>(10);

  const { data, isLoading, isError, refetch, isFetching } =
    useQuery<OptionChainResponse>({
      queryKey: [
        `/api/options/${encodeURIComponent(symbol)}${
          selectedExpiry ? `?expiry=${encodeURIComponent(selectedExpiry)}` : ''
        }`,
      ],
      staleTime: 10_000,
      refetchInterval: 15_000,
      placeholderData: keepPreviousData,
      select: (raw: any): OptionChainResponse => {
        const payload = raw?.data ?? raw ?? {};
        return {
          symbol: payload.symbol ?? symbol,
          expiry: payload.expiry ?? null,
          availableExpiries: Array.isArray(payload.availableExpiries)
            ? payload.availableExpiries
            : [],
          calls: Array.isArray(payload.calls) ? payload.calls : [],
          puts: Array.isArray(payload.puts) ? payload.puts : [],
          underlying: payload.underlying ?? null,
          summary: payload.summary ?? null,
        };
      },
    });

  // Sync expiry selection with returned chain (default to first / chain.expiry)
  useEffect(() => {
    if (data?.expiry && !selectedExpiry) {
      setSelectedExpiry(data.expiry);
    }
  }, [data?.expiry, selectedExpiry]);

  // Strike-keyed unified rows for the matrix
  const rows = useMemo(() => {
    if (!data) return [];
    const callsByStrike = new Map<number, OptionContract>();
    const putsByStrike = new Map<number, OptionContract>();
    for (const c of data.calls) callsByStrike.set(c.strike, c);
    for (const p of data.puts) putsByStrike.set(p.strike, p);
    const allStrikes = Array.from(
      new Set<number>([...callsByStrike.keys(), ...putsByStrike.keys()]),
    ).sort((a, b) => a - b);
    return allStrikes.map((strike) => ({
      strike,
      call: callsByStrike.get(strike),
      put: putsByStrike.get(strike),
    }));
  }, [data]);

  // ATM strike + windowed slice around ATM
  const atmStrike = data?.summary?.atmStrike ?? null;
  const visibleRows = useMemo(() => {
    if (!rows.length) return [];
    if (strikeWindow === 999 || atmStrike == null) return rows;
    const idx = rows.findIndex((r) => r.strike === atmStrike);
    if (idx < 0) return rows.slice(0, 21);
    const half = strikeWindow;
    return rows.slice(Math.max(0, idx - half), idx + half + 1);
  }, [rows, atmStrike, strikeWindow]);

  // Max OI (across visible window) for bar normalization
  const maxOi = useMemo(() => {
    let max = 0;
    for (const r of visibleRows) {
      if (r.call?.openInterest && r.call.openInterest > max) max = r.call.openInterest;
      if (r.put?.openInterest && r.put.openInterest > max) max = r.put.openInterest;
    }
    return max;
  }, [visibleRows]);

  const underlying = data?.underlying ?? null;
  const summary = data?.summary;
  const expiries = data?.availableExpiries ?? [];

  // Spot vs prev-close for the change indicator (chain doesn't include
  // change directly; we synthesize from underlying + the highest-volume call's
  // change as a proxy when needed — or just leave blank.)
  const spotChange = useMemo(() => {
    if (!data) return null;
    // Best-effort: use call ATM's change if we have it
    const atmCall = data.calls.find((c) => c.strike === summary?.atmStrike);
    if (atmCall?.change != null && atmCall?.changePercent != null) {
      return null; // option change isn't underlying change — skip rather than mislead
    }
    return null;
  }, [data, summary]);

  // ── Chart data ─────────────────────────────────────────────────────────
  const oiProfileData = useMemo(
    () =>
      visibleRows.map((r) => ({
        strike: r.strike,
        callOI: r.call?.openInterest ?? 0,
        putOI: r.put?.openInterest ?? 0,
      })),
    [visibleRows],
  );

  const ivSmileData = useMemo(
    () =>
      visibleRows.map((r) => {
        const ce = r.call?.impliedVolatility;
        const pe = r.put?.impliedVolatility;
        const ivs = [ce, pe].filter((v): v is number => Number.isFinite(v as number));
        const avg = ivs.length ? ivs.reduce((s, v) => s + v, 0) / ivs.length : null;
        return { strike: r.strike, ce: ce ?? null, pe: pe ?? null, avg };
      }),
    [visibleRows],
  );

  // India VIX for Chain pulse
  const { data: vixQuote } = useStockQuote('India VIX', true, {
    refetchInterval: 60_000,
  });

  const totalCallVol = useMemo(
    () => (data?.calls ?? []).reduce((s, c) => s + (c.volume || 0), 0),
    [data],
  );
  const totalPutVol = useMemo(
    () => (data?.puts ?? []).reduce((s, p) => s + (p.volume || 0), 0),
    [data],
  );

  const chartColors = useMemo(
    () => ({
      grid: getCSSColor('--border'),
      axis: getCSSColor('--muted-foreground'),
      gold: getCSSColor('--brand-gold'),
      tooltipBg: getCSSColor('--card'),
      tooltipBorder: getCSSColor('--border'),
      tooltipText: getCSSColor('--foreground'),
      positive: getCSSColor('--positive'),
      negative: getCSSColor('--negative'),
      navy: getCSSColor('--brand-navy'),
      sky: getCSSColor('--brand-sky'),
    }),
    [],
  );

  // ── Symbol input handler ───────────────────────────────────────────────
  const onSymbolSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = symbolInput.trim().toUpperCase();
    if (trimmed && trimmed !== symbol) {
      setSymbol(trimmed);
      setSelectedExpiry(null); // reset to default for new symbol
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--brand-gold))]" />
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-background">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-muted-foreground">Failed to load option chain</p>
        <Button onClick={() => refetch()} size="sm">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full bg-background overflow-y-auto">
      <div className="max-w-[1500px] mx-auto px-4 md:px-6 py-4 space-y-4">
        {/* Header strip — symbol, spot, expiry tabs, refresh */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
            {/* LEFT: symbol input + spot */}
            <div className="flex items-center gap-4 flex-wrap">
              <form onSubmit={onSymbolSubmit} className="flex items-center gap-2">
                <Input
                  value={symbolInput}
                  onChange={(e) => setSymbolInput(e.target.value)}
                  className="w-32 h-9 font-mono text-sm uppercase"
                  placeholder="NIFTY"
                />
                <Button type="submit" size="sm" variant="outline" className="h-9">
                  Load
                </Button>
              </form>

              {/* Quick switchers for the 2 supported indices */}
              <div className="inline-flex rounded-full border border-border overflow-hidden">
                {SUPPORTED_SYMBOLS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setSymbol(s);
                      setSymbolInput(s);
                      setSelectedExpiry(null);
                    }}
                    className={cn(
                      'h-9 px-3 text-[12px] font-bold transition-colors',
                      symbol === s
                        ? 'bg-[hsl(var(--brand-navy))] text-white dark:bg-[hsl(var(--brand-gold))] dark:text-[hsl(var(--brand-navy))]'
                        : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Spot price */}
              {underlying != null && (
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[28px] font-bold tabular-nums leading-none text-foreground">
                    {fmt(underlying, 2)}
                  </span>
                  <span className="text-[11px] uppercase tracking-uppercase font-bold text-muted-foreground">
                    Spot
                  </span>
                </div>
              )}
            </div>

            {/* RIGHT: refresh */}
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Refresh"
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </Button>
          </div>

          {/* Expiry tab strip */}
          {expiries.length > 0 && (
            <div className="px-5 pb-3 flex items-center gap-2 overflow-x-auto">
              {expiries.slice(0, 8).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setSelectedExpiry(e)}
                  className={cn(
                    'h-7 px-3 rounded-md text-[11.5px] font-bold whitespace-nowrap border transition-colors',
                    (selectedExpiry ?? data?.expiry) === e
                      ? 'border-[hsl(var(--brand-gold))] text-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))]/10 dark:text-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* KPI strip */}
        {summary && (
          <div className="rounded-xl border border-border bg-card overflow-hidden grid grid-cols-2 sm:grid-cols-4">
            <KpiTile
              label="Max pain"
              value={fmtInt(summary.maxPain)}
              caption={
                summary.maxPain != null && underlying != null
                  ? `${(((summary.maxPain - underlying) / underlying) * 100).toFixed(2)}% from spot`
                  : undefined
              }
              tone="gold"
            />
            <KpiTile
              label="PCR (OI)"
              value={fmt(summary.pcr, 2)}
              caption={
                summary.pcr != null
                  ? summary.pcr > 1
                    ? 'Put-heavy · bearish bias'
                    : summary.pcr < 1
                      ? 'Call-heavy · bullish bias'
                      : 'Balanced'
                  : undefined
              }
            />
            <KpiTile
              label="ATM IV"
              value={summary.atmIV != null ? `${summary.atmIV.toFixed(2)}%` : '—'}
              caption={
                summary.atmStrike != null ? `at ${fmtInt(summary.atmStrike)}` : undefined
              }
            />
            <KpiTile
              label="Total OI"
              value={fmtCompact(summary.totalCallOI + summary.totalPutOI)}
              caption={`CE ${fmtCompact(summary.totalCallOI)} · PE ${fmtCompact(summary.totalPutOI)}`}
            />
          </div>
        )}

        {/* Chain matrix */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between gap-3 flex-wrap">
            <h3 className="font-display text-base font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
              Option chain · {symbol} · {selectedExpiry ?? data?.expiry ?? '—'}
            </h3>
            <div className="inline-flex rounded-full border border-border overflow-hidden">
              {([10, 20, 999] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setStrikeWindow(w)}
                  className={cn(
                    'h-7 px-3 text-[11.5px] font-bold transition-colors',
                    strikeWindow === w
                      ? 'bg-[hsl(var(--brand-navy))] text-white dark:bg-[hsl(var(--brand-gold))] dark:text-[hsl(var(--brand-navy))]'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {w === 999 ? 'All' : `±${w}`}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[12px] font-mono">
              <thead>
                <tr className="bg-muted/40 text-[10px] uppercase tracking-uppercase font-bold text-muted-foreground">
                  {/* CALL side (left) */}
                  <th className="text-right py-2.5 px-3 border-b border-border">OI Δ</th>
                  <th className="text-left py-2.5 px-3 border-b border-border">OI</th>
                  <th className="text-right py-2.5 px-3 border-b border-border hidden md:table-cell">Vol</th>
                  <th className="text-right py-2.5 px-3 border-b border-border">IV</th>
                  <th className="text-right py-2.5 px-3 border-b border-border">Δ</th>
                  <th className="text-right py-2.5 px-3 border-b border-border">LTP</th>
                  {/* STRIKE */}
                  <th className="text-center py-2.5 px-3 border-b border-border bg-[hsl(var(--brand-navy))]/5 dark:bg-[hsl(var(--brand-gold))]/5">
                    Strike
                  </th>
                  {/* PUT side (right) */}
                  <th className="text-left py-2.5 px-3 border-b border-border">LTP</th>
                  <th className="text-left py-2.5 px-3 border-b border-border">Δ</th>
                  <th className="text-left py-2.5 px-3 border-b border-border">IV</th>
                  <th className="text-left py-2.5 px-3 border-b border-border hidden md:table-cell">Vol</th>
                  <th className="text-right py-2.5 px-3 border-b border-border">OI</th>
                  <th className="text-left py-2.5 px-3 border-b border-border">OI Δ</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={13}
                      className="text-center py-12 text-muted-foreground text-xs"
                    >
                      No strike data available
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row) => {
                    const isAtm = atmStrike != null && row.strike === atmStrike;
                    const itmCall = underlying != null && row.strike <= underlying;
                    const itmPut = underlying != null && row.strike >= underlying;
                    return (
                      <tr
                        key={row.strike}
                        className={cn(
                          'border-t border-border/60 transition-colors',
                          isAtm
                            ? 'bg-[hsl(var(--brand-gold))]/8 hover:bg-[hsl(var(--brand-gold))]/12'
                            : 'hover:bg-muted/30',
                        )}
                      >
                        {/* CALL side */}
                        <td
                          className={cn(
                            'text-right py-2.5 px-3',
                            itmCall && 'bg-[hsl(var(--positive))]/4',
                          )}
                        >
                          <OiDeltaCell value={row.call?.oiDelta ?? null} />
                        </td>
                        <td className={cn('py-2.5 px-3', itmCall && 'bg-[hsl(var(--positive))]/4')}>
                          <OiBar
                            value={row.call?.openInterest ?? 0}
                            max={maxOi}
                            side="call"
                          />
                        </td>
                        <td
                          className={cn(
                            'text-right py-2.5 px-3 hidden md:table-cell tabular-nums text-muted-foreground',
                            itmCall && 'bg-[hsl(var(--positive))]/4',
                          )}
                        >
                          {fmtCompact(row.call?.volume)}
                        </td>
                        <td
                          className={cn(
                            'text-right py-2.5 px-3 tabular-nums text-foreground',
                            itmCall && 'bg-[hsl(var(--positive))]/4',
                          )}
                        >
                          {row.call?.impliedVolatility != null
                            ? `${row.call.impliedVolatility.toFixed(1)}%`
                            : '—'}
                        </td>
                        <td
                          className={cn(
                            'text-right py-2.5 px-3 tabular-nums text-muted-foreground',
                            itmCall && 'bg-[hsl(var(--positive))]/4',
                          )}
                        >
                          {row.call?.delta != null ? row.call.delta.toFixed(3) : '—'}
                        </td>
                        <td
                          className={cn(
                            'text-right py-2.5 px-3 tabular-nums font-bold text-foreground',
                            itmCall && 'bg-[hsl(var(--positive))]/4',
                          )}
                        >
                          {fmt(row.call?.lastPrice, 2)}
                        </td>

                        {/* STRIKE */}
                        <td
                          className={cn(
                            'text-center py-2.5 px-3 font-bold tabular-nums',
                            isAtm
                              ? 'bg-[hsl(var(--brand-gold))] text-white text-[13px]'
                              : 'bg-[hsl(var(--brand-navy))]/5 dark:bg-[hsl(var(--brand-gold))]/5 text-foreground',
                          )}
                        >
                          {fmtInt(row.strike)}
                        </td>

                        {/* PUT side */}
                        <td
                          className={cn(
                            'text-left py-2.5 px-3 tabular-nums font-bold text-foreground',
                            itmPut && 'bg-[hsl(var(--positive))]/4',
                          )}
                        >
                          {fmt(row.put?.lastPrice, 2)}
                        </td>
                        <td
                          className={cn(
                            'text-left py-2.5 px-3 tabular-nums text-muted-foreground',
                            itmPut && 'bg-[hsl(var(--positive))]/4',
                          )}
                        >
                          {row.put?.delta != null ? row.put.delta.toFixed(3) : '—'}
                        </td>
                        <td
                          className={cn(
                            'text-left py-2.5 px-3 tabular-nums text-foreground',
                            itmPut && 'bg-[hsl(var(--positive))]/4',
                          )}
                        >
                          {row.put?.impliedVolatility != null
                            ? `${row.put.impliedVolatility.toFixed(1)}%`
                            : '—'}
                        </td>
                        <td
                          className={cn(
                            'text-left py-2.5 px-3 hidden md:table-cell tabular-nums text-muted-foreground',
                            itmPut && 'bg-[hsl(var(--positive))]/4',
                          )}
                        >
                          {fmtCompact(row.put?.volume)}
                        </td>
                        <td className={cn('py-2.5 px-3', itmPut && 'bg-[hsl(var(--positive))]/4')}>
                          <OiBar
                            value={row.put?.openInterest ?? 0}
                            max={maxOi}
                            side="put"
                          />
                        </td>
                        <td
                          className={cn(
                            'text-left py-2.5 px-3',
                            itmPut && 'bg-[hsl(var(--positive))]/4',
                          )}
                        >
                          <OiDeltaCell value={row.put?.oiDelta ?? null} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 3 bottom panels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* OI profile */}
          <Cell title="Open interest profile" className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={oiProfileData}
                margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.4} />
                <XAxis
                  dataKey="strike"
                  stroke={chartColors.axis}
                  tick={{ fontSize: 10, fill: chartColors.axis }}
                  tickLine={false}
                  tickFormatter={(v: number) => fmtInt(v)}
                />
                <YAxis
                  stroke={chartColors.axis}
                  tick={{ fontSize: 10, fill: chartColors.axis }}
                  tickLine={false}
                  tickFormatter={(v: number) => fmtCompact(v)}
                />
                <ChartTooltip
                  contentStyle={{
                    backgroundColor: chartColors.tooltipBg,
                    border: `1px solid ${chartColors.tooltipBorder}`,
                    borderRadius: 6,
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                  }}
                  labelStyle={{ color: chartColors.axis }}
                  itemStyle={{ color: chartColors.tooltipText }}
                  formatter={(v: number) => fmtCompact(v)}
                  labelFormatter={(label: number) => `Strike ${fmtInt(label)}`}
                />
                {atmStrike != null && (
                  <ReferenceLine
                    x={atmStrike}
                    stroke={chartColors.gold}
                    strokeDasharray="3 3"
                    strokeWidth={1.5}
                  />
                )}
                <Bar dataKey="callOI" fill={chartColors.negative} fillOpacity={0.7} name="Call OI" />
                <Bar dataKey="putOI" fill={chartColors.positive} fillOpacity={0.7} name="Put OI" />
              </ComposedChart>
            </ResponsiveContainer>
          </Cell>

          {/* IV smile */}
          <Cell title="IV smile" className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={ivSmileData}
                margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.4} />
                <XAxis
                  dataKey="strike"
                  stroke={chartColors.axis}
                  tick={{ fontSize: 10, fill: chartColors.axis }}
                  tickLine={false}
                  tickFormatter={(v: number) => fmtInt(v)}
                />
                <YAxis
                  stroke={chartColors.axis}
                  tick={{ fontSize: 10, fill: chartColors.axis }}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                />
                <ChartTooltip
                  contentStyle={{
                    backgroundColor: chartColors.tooltipBg,
                    border: `1px solid ${chartColors.tooltipBorder}`,
                    borderRadius: 6,
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                  }}
                  labelStyle={{ color: chartColors.axis }}
                  itemStyle={{ color: chartColors.tooltipText }}
                  formatter={(v: number) => (v == null ? '—' : `${v.toFixed(2)}%`)}
                  labelFormatter={(label: number) => `Strike ${fmtInt(label)}`}
                />
                {atmStrike != null && (
                  <ReferenceLine
                    x={atmStrike}
                    stroke={chartColors.gold}
                    strokeDasharray="3 3"
                    strokeWidth={1.5}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="ce"
                  stroke={chartColors.negative}
                  strokeWidth={1.4}
                  dot={false}
                  name="Call IV"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="pe"
                  stroke={chartColors.positive}
                  strokeWidth={1.4}
                  dot={false}
                  name="Put IV"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke={chartColors.gold}
                  strokeWidth={2}
                  dot={false}
                  name="Avg IV"
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </Cell>

          {/* Chain pulse */}
          <Cell title="Chain pulse" className="h-[300px]" bodyClassName="p-4 space-y-3">
            <PulseRow
              label="Total CE OI"
              value={fmtCompact(summary?.totalCallOI ?? null)}
              tone="negative"
            />
            <PulseRow
              label="Total PE OI"
              value={fmtCompact(summary?.totalPutOI ?? null)}
              tone="positive"
            />
            <PulseRow
              label="CE volume today"
              value={fmtCompact(totalCallVol)}
              tone="negative"
            />
            <PulseRow
              label="PE volume today"
              value={fmtCompact(totalPutVol)}
              tone="positive"
            />
            <div className="border-t border-border pt-3 mt-1">
              <PulseRow
                label="India VIX"
                value={vixQuote?.price != null ? vixQuote.price.toFixed(2) : '—'}
                subValue={
                  vixQuote?.changePercent != null
                    ? fmtPct(vixQuote.changePercent, 2)
                    : undefined
                }
                tone={
                  vixQuote?.change != null && vixQuote.change >= 0
                    ? 'negative'
                    : 'positive'
                }
              />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed pt-2">
              {summary?.pcr != null
                ? summary.pcr > 1.2
                  ? 'PCR > 1.2 — strong put-side activity, hedging or bearish bias.'
                  : summary.pcr < 0.8
                    ? 'PCR < 0.8 — call-heavy, retail positioning bullish.'
                    : 'PCR balanced. No strong directional skew in OI.'
                : '—'}
            </p>
          </Cell>
        </div>
      </div>
    </div>
  );
}

// ─── Pulse row helper ────────────────────────────────────────────────────────
function PulseRow({
  label,
  value,
  subValue,
  tone,
}: {
  label: string;
  value: string;
  subValue?: string;
  tone: 'positive' | 'negative' | 'neutral';
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-positive'
      : tone === 'negative'
        ? 'text-negative'
        : 'text-foreground';
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11.5px] uppercase tracking-uppercase font-bold text-muted-foreground">
        {label}
      </span>
      <div className="text-right">
        <div className={cn('font-mono text-[15px] font-bold tabular-nums', toneClass)}>
          {value}
        </div>
        {subValue && (
          <div className={cn('font-mono text-[10.5px] tabular-nums', toneClass)}>
            {subValue}
          </div>
        )}
      </div>
    </div>
  );
}
