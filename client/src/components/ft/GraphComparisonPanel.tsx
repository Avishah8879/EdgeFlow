import { useState, useEffect, useMemo, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Plus, X, Info } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  calculatePearsonCorrelation,
  buildNormalizedSeries,
  buildPairScatter,
  buildRegressionLine,
  computeResiduals,
  residualStdDev as computeResidualStdDev,
  type OhlcPoint,
} from '@/lib/stats';
import { PairRegressionChart } from '@/components/ft/pair-trading/charts/PairRegressionChart';
import { ResidualsChart } from '@/components/ft/pair-trading/charts/ResidualsChart';
import { cn } from '@/lib/utils';
import { getCSSColor } from '@/lib/theme-utils';

interface DailyPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChartData {
  symbol: string;
  data: DailyPoint[];
}

interface MetricsRow {
  symbol: string;
  available: boolean;
  long_name?: string | null;
  sector?: string | null;
  last_price?: number | null;
  change_percent?: number | null;
  return_1y?: number | null;
  cagr_3y?: number | null;
  return_ytd?: number | null;
  fifty_two_week_high?: number | null;
  fifty_two_week_low?: number | null;
  market_cap?: number | null;
  trailing_pe?: number | null;
  price_to_book?: number | null;
  return_on_equity?: number | null;
  debt_to_equity?: number | null;
  dividend_yield?: number | null;
  beta_1y?: number | null;
  volatility_30d?: number | null;
  avg_volume?: number | null;
}

// Brand-aligned palette per design ref. Each entry maps to an HSL token; the
// array is consumed positionally by symbol index.
const PALETTE: Array<{ token: string; cssVar: string | null; hsl: string }> = [
  { token: 'gold', cssVar: '--brand-gold', hsl: '38 56% 53%' },
  { token: 'sky', cssVar: '--brand-sky', hsl: '199 65% 54%' },
  { token: 'green', cssVar: null, hsl: '150 50% 40%' },
  { token: 'red', cssVar: null, hsl: '0 60% 50%' },
  { token: 'purple', cssVar: null, hsl: '280 40% 50%' },
];

const TIME_RANGES = ['1M', '3M', '6M', '1Y', '3Y', '5Y'] as const;
type TimeRange = (typeof TIME_RANGES)[number];

const RETURN_MODES = [
  { id: 'percent' as const, label: '% return' },
  { id: 'absolute' as const, label: 'Absolute' },
  { id: 'beta-adj' as const, label: 'Beta-adj' },
];
type ReturnMode = (typeof RETURN_MODES)[number]['id'];

const TIME_RANGE_DAYS: Record<TimeRange, number> = {
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
  '3Y': 365 * 3,
  '5Y': 365 * 5,
};

const BENCHMARK_SYMBOL = 'NIFTY 50';

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmtPrice = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v)
    ? '—'
    : v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (v: number | null | undefined, d = 1) =>
  v == null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`;
const fmtRatio = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v) ? '—' : v.toFixed(d);
const fmtMcapCr = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return '—';
  // market_cap is in INR; show in crores with Indian grouping
  const cr = v / 1e7;
  return cr.toLocaleString('en-IN', { maximumFractionDigits: 0 });
};
const fmtVolM = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return '—';
  const m = v / 1e6;
  return m >= 10 ? m.toFixed(0) : m.toFixed(1);
};

// ─── Panel ───────────────────────────────────────────────────────────────────
export function GraphComparisonPanel() {
  const [symbols, setSymbols] = useState<string[]>(['RELIANCE', 'INFY']);
  const [newSymbol, setNewSymbol] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRange>('1Y');
  const [returnMode, setReturnMode] = useState<ReturnMode>('percent');
  const [pairAnalysisOpen, setPairAnalysisOpen] = useState(false);
  const [pairSelection, setPairSelection] = useState<{ x: string; y: string }>({
    x: 'RELIANCE',
    y: 'INFY',
  });
  const [betaMode, setBetaMode] = useState<'auto' | 'manual'>('auto');
  const [manualBetaInput, setManualBetaInput] = useState('1.00');

  // Theme-aware chart chrome
  const chartColors = useMemo(
    () => ({
      grid: getCSSColor('--border'),
      axis: getCSSColor('--muted-foreground'),
      tooltipBg: getCSSColor('--card'),
      tooltipBorder: getCSSColor('--border'),
      tooltipText: getCSSColor('--foreground'),
      gold: getCSSColor('--brand-gold'),
    }),
    [],
  );

  // ── Queries ────────────────────────────────────────────────────────────
  // Always include benchmark in chart series so we can compute beta-adj rebased series
  const chartSymbolList = useMemo(
    () => Array.from(new Set([...symbols, BENCHMARK_SYMBOL])).filter(Boolean),
    [symbols],
  );

  const { data: comparisonData, isLoading: chartLoading } = useQuery<ChartData[]>({
    queryKey: [
      `/api/chart/compare?symbols=${chartSymbolList.join(',')}&range=${timeRange}`,
    ],
    enabled: chartSymbolList.length > 0,
    select: (raw: any): ChartData[] => {
      const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      return arr;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: metricsData, isLoading: metricsLoading } = useQuery<MetricsRow[]>({
    queryKey: [
      `/api/compare/metrics?symbols=${symbols.join(',')}&benchmark=${BENCHMARK_SYMBOL}`,
    ],
    enabled: symbols.length > 0,
    select: (raw: any): MetricsRow[] => {
      const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      return arr;
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── Pair regression — keep selection valid ─────────────────────────────
  useEffect(() => {
    if (symbols.length === 0) {
      setPairSelection({ x: '', y: '' });
      return;
    }
    setPairSelection((prev) => {
      const fallbackX = symbols[0];
      const fallbackY = symbols[1] || symbols[0];
      const nextX = prev.x && symbols.includes(prev.x) ? prev.x : fallbackX;
      let nextY = prev.y && symbols.includes(prev.y) ? prev.y : fallbackY;
      if (nextY === nextX && symbols.length > 1) {
        nextY = symbols.find((sym) => sym !== nextX) || nextX;
      }
      if (nextX === prev.x && nextY === prev.y) return prev;
      return { x: nextX, y: nextY };
    });
  }, [symbols]);

  // ── Series transforms ──────────────────────────────────────────────────
  const seriesMap = useMemo(() => {
    const map: Record<string, OhlcPoint[]> = {};
    if (comparisonData) {
      for (const entry of comparisonData) {
        map[entry.symbol] = entry.data.map((d) => ({ date: d.date, close: d.close }));
      }
    }
    return map;
  }, [comparisonData]);

  // Normalized to 100 (rebased) — used for % return mode + correlation
  const normalizedData = useMemo(() => {
    if (!seriesMap || Object.keys(seriesMap).length === 0) return [];
    return buildNormalizedSeries(seriesMap, [...symbols, BENCHMARK_SYMBOL]);
  }, [seriesMap, symbols]);

  // % change from rebased-100 (subtract 100 → percentage delta)
  const percentReturnData = useMemo(
    () =>
      normalizedData.map((row) => {
        const out: any = { date: row.date };
        for (const sym of [...symbols, BENCHMARK_SYMBOL]) {
          const v = row[sym];
          if (typeof v === 'number') out[sym] = parseFloat((v - 100).toFixed(2));
        }
        return out;
      }),
    [normalizedData, symbols],
  );

  // Absolute price view — raw closes (each symbol on its own scale; cleaner if
  // we normalize each to its own first-day price ÷ 1 to keep multiple price
  // levels readable; instead we just plot raw closes and accept different y-ranges)
  const absoluteData = useMemo(() => {
    if (!seriesMap) return [];
    const allDates = new Set<string>();
    for (const sym of symbols) {
      (seriesMap[sym] ?? []).forEach((p) => allDates.add(p.date));
    }
    const sortedDates = Array.from(allDates).sort();
    const lookup: Record<string, Record<string, number>> = {};
    for (const sym of symbols) {
      lookup[sym] = {};
      for (const p of seriesMap[sym] ?? []) lookup[sym][p.date] = p.close;
    }
    return sortedDates.map((date) => {
      const row: any = { date };
      for (const sym of symbols) {
        if (lookup[sym][date] != null) row[sym] = lookup[sym][date];
      }
      return row;
    });
  }, [seriesMap, symbols]);

  // Beta-adjusted: subtract benchmark's percent-return × beta from each stock's
  // percent-return. Beta sourced from metricsData (computed server-side). When
  // beta is missing, fall back to 1.0.
  const betaBySymbol = useMemo(() => {
    const out: Record<string, number> = {};
    for (const row of metricsData ?? []) {
      out[row.symbol] = Number.isFinite(row.beta_1y as number) ? (row.beta_1y as number) : 1.0;
    }
    return out;
  }, [metricsData]);

  const betaAdjData = useMemo(
    () =>
      percentReturnData.map((row) => {
        const benchPct = typeof row[BENCHMARK_SYMBOL] === 'number' ? row[BENCHMARK_SYMBOL] : 0;
        const out: any = { date: row.date };
        for (const sym of symbols) {
          const v = row[sym];
          if (typeof v === 'number') {
            const beta = betaBySymbol[sym] ?? 1.0;
            out[sym] = parseFloat((v - beta * benchPct).toFixed(2));
          }
        }
        // include benchmark for reference (always 0 by definition)
        out[BENCHMARK_SYMBOL] = 0;
        return out;
      }),
    [percentReturnData, symbols, betaBySymbol],
  );

  const chartData =
    returnMode === 'percent'
      ? percentReturnData
      : returnMode === 'absolute'
        ? absoluteData
        : betaAdjData;

  // ── Correlation matrix (for sidebar) ────────────────────────────────────
  const correlationMatrix = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {};
    for (const sym1 of symbols) {
      matrix[sym1] = {};
      for (const sym2 of symbols) {
        if (sym1 === sym2) {
          matrix[sym1][sym2] = 1;
          continue;
        }
        const s1 = seriesMap[sym1] ?? [];
        const s2 = seriesMap[sym2] ?? [];
        if (s1.length === 0 || s2.length === 0) {
          matrix[sym1][sym2] = NaN;
          continue;
        }
        // Align by date
        const aligned = s1
          .map((p) => {
            const match = s2.find((q) => q.date === p.date);
            return match ? [p.close, match.close] : null;
          })
          .filter((p): p is [number, number] => p !== null);
        if (aligned.length < 5) {
          matrix[sym1][sym2] = NaN;
          continue;
        }
        // Use daily returns for correlation (more meaningful than price levels)
        const rets1: number[] = [];
        const rets2: number[] = [];
        for (let i = 1; i < aligned.length; i++) {
          const r1 = aligned[i][0] / aligned[i - 1][0] - 1;
          const r2 = aligned[i][1] / aligned[i - 1][1] - 1;
          if (Number.isFinite(r1) && Number.isFinite(r2)) {
            rets1.push(r1);
            rets2.push(r2);
          }
        }
        matrix[sym1][sym2] =
          rets1.length >= 5 ? calculatePearsonCorrelation(rets1, rets2) : NaN;
      }
    }
    return matrix;
  }, [seriesMap, symbols]);

  // ── Best/worst row highlight per metric ────────────────────────────────
  type RowKey =
    | 'return_1y'
    | 'cagr_3y'
    | 'return_ytd'
    | 'market_cap'
    | 'trailing_pe'
    | 'price_to_book'
    | 'return_on_equity'
    | 'debt_to_equity'
    | 'dividend_yield'
    | 'beta_1y'
    | 'volatility_30d';

  // For each metric, "best" direction: bigger=true means higher value is better.
  const metricDirection: Record<RowKey, 'bigger' | 'smaller'> = {
    return_1y: 'bigger',
    cagr_3y: 'bigger',
    return_ytd: 'bigger',
    market_cap: 'bigger',
    trailing_pe: 'smaller',
    price_to_book: 'smaller',
    return_on_equity: 'bigger',
    debt_to_equity: 'smaller',
    dividend_yield: 'bigger',
    beta_1y: 'smaller',
    volatility_30d: 'smaller',
  };

  function bestWorstFor(rows: MetricsRow[], key: RowKey): { best?: string; worst?: string } {
    const values = rows
      .map((r) => ({ sym: r.symbol, v: (r[key] as number | null | undefined) }))
      .filter((p): p is { sym: string; v: number } => Number.isFinite(p.v as number));
    if (values.length < 2) return {};
    const dir = metricDirection[key];
    const sorted = [...values].sort((a, b) => (dir === 'bigger' ? b.v - a.v : a.v - b.v));
    return { best: sorted[0].sym, worst: sorted[sorted.length - 1].sym };
  }

  const bestWorstByRow = useMemo(() => {
    const m = metricsData ?? [];
    return {
      return_1y: bestWorstFor(m, 'return_1y'),
      cagr_3y: bestWorstFor(m, 'cagr_3y'),
      return_ytd: bestWorstFor(m, 'return_ytd'),
      market_cap: bestWorstFor(m, 'market_cap'),
      trailing_pe: bestWorstFor(m, 'trailing_pe'),
      price_to_book: bestWorstFor(m, 'price_to_book'),
      return_on_equity: bestWorstFor(m, 'return_on_equity'),
      debt_to_equity: bestWorstFor(m, 'debt_to_equity'),
      dividend_yield: bestWorstFor(m, 'dividend_yield'),
      beta_1y: bestWorstFor(m, 'beta_1y'),
      volatility_30d: bestWorstFor(m, 'volatility_30d'),
    };
  }, [metricsData]);

  // ── Risk-return scatter coords ─────────────────────────────────────────
  const scatterPoints = useMemo(() => {
    const m = metricsData ?? [];
    const points = m
      .filter(
        (r): r is MetricsRow & { volatility_30d: number; return_1y: number } =>
          Number.isFinite(r.volatility_30d as number) && Number.isFinite(r.return_1y as number),
      )
      .map((r) => ({
        symbol: r.symbol,
        x: r.volatility_30d,
        y: r.return_1y,
      }));
    return points;
  }, [metricsData]);

  // ── Auto takeaways ─────────────────────────────────────────────────────
  const takeaways = useMemo(() => {
    const out: Array<{ symbol: string; text: string }> = [];
    const m = metricsData ?? [];
    if (m.length === 0) return out;

    // Best 1Y return
    const ret1y = bestWorstByRow.return_1y;
    if (ret1y.best) {
      const row = m.find((r) => r.symbol === ret1y.best);
      if (row) {
        out.push({
          symbol: row.symbol,
          text: `best 1Y return at ${fmtPct(row.return_1y, 1)}`,
        });
      }
    }
    // Lowest beta (defensive)
    const lowBeta = bestWorstByRow.beta_1y;
    if (lowBeta.best && lowBeta.best !== ret1y.best) {
      const row = m.find((r) => r.symbol === lowBeta.best);
      if (row) {
        out.push({
          symbol: row.symbol,
          text: `lowest beta (${fmtRatio(row.beta_1y, 2)}) — most defensive`,
        });
      }
    }
    // Highest ROE (quality)
    const highRoe = bestWorstByRow.return_on_equity;
    if (highRoe.best) {
      const row = m.find((r) => r.symbol === highRoe.best);
      if (row && !out.some((o) => o.symbol === row.symbol)) {
        out.push({
          symbol: row.symbol,
          text: `highest ROE (${fmtRatio(row.return_on_equity, 1)}%) — quality leader`,
        });
      }
    }
    // Worst 1Y return (laggard)
    if (ret1y.worst && ret1y.worst !== ret1y.best) {
      const row = m.find((r) => r.symbol === ret1y.worst);
      if (row && !out.some((o) => o.symbol === row.symbol)) {
        out.push({
          symbol: row.symbol,
          text: `weakest 1Y return at ${fmtPct(row.return_1y, 1)}`,
        });
      }
    }
    return out.slice(0, 4);
  }, [metricsData, bestWorstByRow]);

  // ── Pair analysis (preserved) ──────────────────────────────────────────
  const pairScatterData = useMemo(
    () => buildPairScatter(normalizedData, pairSelection.x, pairSelection.y),
    [normalizedData, pairSelection],
  );
  const autoPairBeta = useMemo(() => {
    if (!pairSelection.x || !pairSelection.y) return 0;
    if (pairSelection.x === pairSelection.y) return 1;
    const matrixValue =
      correlationMatrix[pairSelection.x]?.[pairSelection.y] ??
      correlationMatrix[pairSelection.y]?.[pairSelection.x];
    if (typeof matrixValue === 'number' && !Number.isNaN(matrixValue)) return matrixValue;
    if (pairScatterData.length < 2) return 0;
    return calculatePearsonCorrelation(
      pairScatterData.map((p) => p.xValue),
      pairScatterData.map((p) => p.yValue),
    );
  }, [pairSelection, correlationMatrix, pairScatterData]);
  const manualBeta = useMemo(() => {
    const parsed = parseFloat(manualBetaInput);
    return Number.isFinite(parsed) ? parsed : NaN;
  }, [manualBetaInput]);
  const effectiveBeta =
    betaMode === 'manual' && Number.isFinite(manualBeta) ? manualBeta : autoPairBeta;
  const regressionLineData = useMemo(
    () => buildRegressionLine(pairScatterData, effectiveBeta),
    [pairScatterData, effectiveBeta],
  );
  const residualsData = useMemo(
    () => computeResiduals(pairScatterData, effectiveBeta),
    [pairScatterData, effectiveBeta],
  );
  const residualStdDev = useMemo(
    () => computeResidualStdDev(residualsData),
    [residualsData],
  );
  const pairAnalysisDisabled = symbols.length < 2 || normalizedData.length === 0;
  const pairEquationLabel =
    pairSelection.x && pairSelection.y
      ? `${pairSelection.y} = ${
          Number.isFinite(effectiveBeta) ? effectiveBeta.toFixed(2) : 'beta'
        } * ${pairSelection.x}`
      : 'Select securities';
  const pairXValue = pairSelection.x || symbols[0] || '';
  const pairYValue = pairSelection.y || symbols[1] || symbols[0] || '';

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleAddSymbol = (e: React.FormEvent) => {
    e.preventDefault();
    const sym = newSymbol.trim().toUpperCase();
    if (sym && !symbols.includes(sym) && symbols.length < 5) {
      setSymbols([...symbols, sym]);
      setNewSymbol('');
    }
  };
  const handleRemoveSymbol = (s: string) => setSymbols(symbols.filter((x) => x !== s));

  const colorFor = (idx: number) => `hsl(${PALETTE[idx % PALETTE.length].hsl})`;
  const colorForSymbol = (sym: string) =>
    sym === BENCHMARK_SYMBOL
      ? `hsl(${PALETTE[4].hsl})` // purple
      : colorFor(symbols.indexOf(sym));

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <TooltipProvider>
      <div className="h-full flex flex-col bg-background overflow-y-auto">
        {/* Pills row — symbol selector */}
        <div className="border-b border-border bg-card px-4 md:px-8 py-4">
          <div className="flex items-center gap-2 flex-wrap">
            {symbols.map((symbol, index) => {
              const metricsRow = metricsData?.find((r) => r.symbol === symbol);
              const hsl = PALETTE[index % PALETTE.length].hsl;
              const change = metricsRow?.change_percent;
              return (
                <span
                  key={symbol}
                  className="inline-flex items-center h-9 px-3.5 rounded-full bg-card border-2 font-mono text-[13px] font-bold gap-2"
                  style={{
                    borderColor: `hsl(${hsl})`,
                    color: `hsl(${hsl})`,
                  }}
                >
                  <span>{symbol}</span>
                  {Number.isFinite(change as number) && (
                    <span
                      className={cn(
                        'text-[11px] tabular-nums',
                        (change as number) >= 0 ? 'text-positive' : 'text-negative',
                      )}
                    >
                      {(change as number) >= 0 ? '+' : ''}
                      {(change as number).toFixed(2)}
                    </span>
                  )}
                  <button
                    onClick={() => handleRemoveSymbol(symbol)}
                    className="text-muted-foreground hover:text-foreground"
                    data-testid={`button-remove-${symbol}`}
                    aria-label={`Remove ${symbol}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              );
            })}
            {symbols.length < 5 && (
              <form onSubmit={handleAddSymbol} className="flex items-center gap-2">
                <Input
                  placeholder="Add symbol…"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                  className="w-36 h-9 font-mono text-[13px] uppercase"
                  data-testid="input-add-symbol"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-full border-dashed"
                  data-testid="button-add"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add
                </Button>
              </form>
            )}
          </div>
        </div>

        {/* Main grid: chart + table on left, sidebar on right */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 p-4 md:p-6 max-w-[1600px] mx-auto w-full">
          {/* ─── LEFT COLUMN ───────────────────────────────────────────── */}
          <div className="space-y-4 min-w-0">
            {/* Performance chart */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                <h3 className="font-display text-lg font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
                  {returnMode === 'absolute'
                    ? 'Absolute price'
                    : returnMode === 'beta-adj'
                      ? 'Beta-adjusted return'
                      : 'Performance · re-based to 100'}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  <div className="inline-flex rounded-full border border-border overflow-hidden">
                    {TIME_RANGES.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setTimeRange(r)}
                        className={cn(
                          'px-3 h-7 text-[11.5px] font-bold transition-colors',
                          timeRange === r
                            ? 'bg-[hsl(var(--brand-navy))] text-white dark:bg-[hsl(var(--brand-gold))] dark:text-[hsl(var(--brand-navy))]'
                            : 'text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <div className="inline-flex rounded-full border border-border overflow-hidden">
                    {RETURN_MODES.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setReturnMode(m.id)}
                        className={cn(
                          'px-3 h-7 text-[11.5px] font-bold transition-colors whitespace-nowrap',
                          returnMode === m.id
                            ? 'bg-[hsl(var(--brand-navy))] text-white dark:bg-[hsl(var(--brand-gold))] dark:text-[hsl(var(--brand-navy))]'
                            : 'text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="h-[340px]">
                {chartLoading ? (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                    Loading…
                  </div>
                ) : chartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                    No data available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={chartColors.grid}
                        opacity={0.4}
                      />
                      <XAxis
                        dataKey="date"
                        stroke={chartColors.axis}
                        tick={{ fontSize: 10, fill: chartColors.axis }}
                        tickLine={false}
                        minTickGap={40}
                      />
                      <YAxis
                        stroke={chartColors.axis}
                        tick={{ fontSize: 10, fill: chartColors.axis }}
                        tickLine={false}
                        tickFormatter={(v: number) =>
                          returnMode === 'absolute'
                            ? v.toLocaleString('en-IN', { maximumFractionDigits: 0 })
                            : `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`
                        }
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
                        formatter={(v: number) =>
                          returnMode === 'absolute' ? fmtPrice(v, 2) : fmtPct(v, 2)
                        }
                      />
                      {returnMode !== 'absolute' && (
                        <ReferenceLine
                          y={0}
                          stroke={chartColors.gold}
                          strokeOpacity={0.4}
                          strokeDasharray="2 4"
                        />
                      )}
                      {symbols.map((sym, idx) => (
                        <Line
                          key={sym}
                          type="monotone"
                          dataKey={sym}
                          stroke={colorFor(idx)}
                          strokeWidth={2}
                          dot={false}
                          name={sym}
                          isAnimationActive={false}
                        />
                      ))}
                      {returnMode === 'percent' && (
                        <Line
                          type="monotone"
                          dataKey={BENCHMARK_SYMBOL}
                          stroke={`hsl(${PALETTE[4].hsl})`}
                          strokeWidth={1.5}
                          strokeDasharray="4 3"
                          dot={false}
                          name={BENCHMARK_SYMBOL}
                          isAnimationActive={false}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Inline period-returns legend */}
              {!chartLoading && metricsData && metricsData.length > 0 && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-1.5">
                  {symbols.map((sym, idx) => {
                    const row = metricsData.find((r) => r.symbol === sym);
                    const ret = row?.return_1y;
                    return (
                      <div
                        key={sym}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: colorFor(idx) }}
                          />
                          <span className="font-mono font-semibold text-foreground truncate">
                            {sym}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'font-mono tabular-nums font-bold',
                            (ret ?? 0) >= 0 ? 'text-positive' : 'text-negative',
                          )}
                        >
                          {fmtPct(ret, 1)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Metrics table — 15 rows */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px] font-mono">
                  <thead>
                    <tr className="bg-muted/40 text-[10.5px] uppercase tracking-uppercase font-bold text-muted-foreground">
                      <th className="text-left py-3 px-4 border-b border-border">
                        Metric
                      </th>
                      {symbols.map((sym) => (
                        <th
                          key={sym}
                          className="text-right py-3 px-4 border-b border-border whitespace-nowrap"
                        >
                          {sym}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {METRIC_ROWS.map((row) => (
                      <MetricsRowEl
                        key={row.key}
                        row={row}
                        symbols={symbols}
                        metricsData={metricsData}
                        bestWorst={bestWorstByRow}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {metricsLoading && (
                <div className="px-4 py-3 text-[11px] text-muted-foreground border-t border-border">
                  Refreshing fundamentals…
                </div>
              )}
            </div>
          </div>

          {/* ─── RIGHT SIDEBAR ─────────────────────────────────────────── */}
          <aside className="space-y-3.5 lg:sticky lg:top-4 lg:self-start">
            {/* Correlation matrix */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h4 className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground mb-3">
                Correlation matrix · {timeRange} daily
              </h4>
              {symbols.length < 2 ? (
                <p className="text-xs text-muted-foreground">
                  Add a second symbol to see correlations.
                </p>
              ) : (
                <div
                  className="grid gap-[2px] font-mono text-[11px]"
                  style={{
                    gridTemplateColumns: `60px repeat(${symbols.length}, 1fr)`,
                  }}
                >
                  <div />
                  {symbols.map((sym) => (
                    <div
                      key={`h-${sym}`}
                      className="text-[10px] font-bold uppercase tracking-uppercase text-muted-foreground text-center py-2 truncate"
                      title={sym}
                    >
                      {sym.slice(0, 5)}
                    </div>
                  ))}
                  {symbols.map((sym1) => (
                    <Fragment key={`row-${sym1}`}>
                      <div
                        className="text-[10px] font-bold uppercase tracking-uppercase text-muted-foreground py-2 truncate"
                        title={sym1}
                      >
                        {sym1.slice(0, 5)}
                      </div>
                      {symbols.map((sym2) => {
                        const corr = correlationMatrix[sym1]?.[sym2];
                        return (
                          <div
                            key={`c-${sym1}-${sym2}`}
                            className={cn(
                              'py-2 text-center font-bold',
                              corrCellClass(corr),
                            )}
                          >
                            {Number.isFinite(corr) ? corr.toFixed(2) : '—'}
                          </div>
                        );
                      })}
                    </Fragment>
                  ))}
                </div>
              )}
            </div>

            {/* Risk-return scatter */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h4 className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground mb-3">
                Risk · return scatter
              </h4>
              <RiskReturnScatter points={scatterPoints} colorFor={colorForSymbol} />
              <p className="text-[10.5px] text-muted-foreground mt-2">
                X = 30d annualized vol · Y = 1Y return
              </p>
            </div>

            {/* Quick takeaways */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h4 className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground mb-2.5">
                Quick takeaways
              </h4>
              {takeaways.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Add symbols to generate insights.
                </p>
              ) : (
                <ul className="space-y-1.5 text-[12px] leading-relaxed text-muted-foreground list-disc pl-5">
                  {takeaways.map((t) => (
                    <li key={t.symbol}>
                      <span className="font-display font-bold text-foreground">
                        {t.symbol}
                      </span>{' '}
                      · {t.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>

        {/* ─── PAIR REGRESSION TOOLKIT (collapsible, preserved) ──────── */}
        <div className="px-4 md:px-6 pb-6 max-w-[1600px] mx-auto w-full">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h4 className="font-display text-base font-bold text-[hsl(var(--brand-navy))] dark:text-foreground">
                  Pair regression toolkit
                </h4>
                <p className="text-[11.5px] text-muted-foreground mt-0.5">
                  Compare any two securities using beta = corr(Y, X)
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={pairAnalysisDisabled}
                  onClick={() => setPairAnalysisOpen((prev) => !prev)}
                >
                  {pairAnalysisOpen ? 'Hide' : 'Show'} regression
                </Button>
                {pairAnalysisOpen && (
                  <>
                    <Label className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                      Beta mode
                    </Label>
                    <Select
                      value={betaMode}
                      onValueChange={(value) => setBetaMode(value as 'auto' | 'manual')}
                    >
                      <SelectTrigger className="w-28 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                      </SelectContent>
                    </Select>
                    {betaMode === 'manual' && (
                      <Input
                        type="number"
                        step="0.01"
                        className="w-24 h-8 text-xs font-mono"
                        value={manualBetaInput}
                        onChange={(e) => setManualBetaInput(e.target.value)}
                        placeholder="Beta"
                      />
                    )}
                  </>
                )}
              </div>
            </div>

            {pairAnalysisOpen && (
              <div className="mt-4 pt-4 border-t border-border">
                {symbols.length < 2 ? (
                  <p className="text-sm text-muted-foreground">
                    Add at least two securities to unlock pair analysis.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                      <p className="text-xs text-muted-foreground font-mono">
                        {pairEquationLabel}
                      </p>
                      <span className="text-[10.5px] px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-mono font-bold uppercase tracking-uppercase">
                        β = {Number.isFinite(effectiveBeta) ? effectiveBeta.toFixed(2) : '0.00'} ({betaMode})
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <Label className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground mb-1.5 block">
                          Base security (X)
                        </Label>
                        <Select
                          value={pairXValue}
                          onValueChange={(value) =>
                            setPairSelection((prev) => ({ ...prev, x: value }))
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Select security" />
                          </SelectTrigger>
                          <SelectContent>
                            {symbols.map((symbol) => (
                              <SelectItem key={symbol} value={symbol}>
                                {symbol}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground mb-1.5 block">
                          Response security (Y)
                        </Label>
                        <Select
                          value={pairYValue}
                          onValueChange={(value) =>
                            setPairSelection((prev) => ({ ...prev, y: value }))
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Select security" />
                          </SelectTrigger>
                          <SelectContent>
                            {symbols.map((symbol) => (
                              <SelectItem key={symbol} value={symbol}>
                                {symbol}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="rounded-md border border-border p-3">
                        <h5 className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground mb-2">
                          Regression: Y = β · X
                        </h5>
                        <PairRegressionChart
                          scatter={pairScatterData}
                          regressionLine={regressionLineData}
                          xSymbol={pairSelection.x}
                          ySymbol={pairSelection.y}
                        />
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <h5 className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground mb-2">
                          Residuals: Y − β · X
                        </h5>
                        <ResidualsChart residuals={residualsData} stdDev={residualStdDev} />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

// ─── Metrics table row config ────────────────────────────────────────────────
type RowSpec =
  | {
      key: string;
      label: string;
      bestWorstKey?: keyof typeof emptyBestWorst;
      format: (row: MetricsRow | undefined) => string;
      tone?: 'pct' | 'mono' | 'big' | 'small';
    };

type BestWorst = { best?: string; worst?: string };
const emptyBestWorst: Record<string, BestWorst> = {
  return_1y: {},
  cagr_3y: {},
  return_ytd: {},
  market_cap: {},
  trailing_pe: {},
  price_to_book: {},
  return_on_equity: {},
  debt_to_equity: {},
  dividend_yield: {},
  beta_1y: {},
  volatility_30d: {},
};

const METRIC_ROWS: Array<{
  key: string;
  label: string;
  bestWorstKey?: keyof typeof emptyBestWorst;
  format: (row: MetricsRow | undefined) => string;
  isPct?: boolean;
}> = [
  { key: 'last_price', label: 'Last price', format: (r) => fmtPrice(r?.last_price, 2) },
  {
    key: 'return_1y',
    label: '1Y return',
    bestWorstKey: 'return_1y',
    isPct: true,
    format: (r) => fmtPct(r?.return_1y, 1),
  },
  {
    key: 'cagr_3y',
    label: '3Y CAGR',
    bestWorstKey: 'cagr_3y',
    isPct: true,
    format: (r) => fmtPct(r?.cagr_3y, 1),
  },
  {
    key: 'return_ytd',
    label: 'YTD',
    bestWorstKey: 'return_ytd',
    isPct: true,
    format: (r) => fmtPct(r?.return_ytd, 1),
  },
  { key: 'fifty_two_week_high', label: '52w high', format: (r) => fmtPrice(r?.fifty_two_week_high, 2) },
  { key: 'fifty_two_week_low', label: '52w low', format: (r) => fmtPrice(r?.fifty_two_week_low, 2) },
  {
    key: 'market_cap',
    label: 'Mkt cap (cr)',
    bestWorstKey: 'market_cap',
    format: (r) => fmtMcapCr(r?.market_cap),
  },
  {
    key: 'trailing_pe',
    label: 'P/E (TTM)',
    bestWorstKey: 'trailing_pe',
    format: (r) => fmtRatio(r?.trailing_pe, 1),
  },
  {
    key: 'price_to_book',
    label: 'P/B',
    bestWorstKey: 'price_to_book',
    format: (r) => fmtRatio(r?.price_to_book, 2),
  },
  {
    key: 'return_on_equity',
    label: 'ROE %',
    bestWorstKey: 'return_on_equity',
    format: (r) => fmtRatio(r?.return_on_equity, 1),
  },
  {
    key: 'debt_to_equity',
    label: 'Debt / Equity',
    bestWorstKey: 'debt_to_equity',
    format: (r) => fmtRatio(r?.debt_to_equity, 2),
  },
  {
    key: 'dividend_yield',
    label: 'Div yield',
    bestWorstKey: 'dividend_yield',
    isPct: true,
    format: (r) =>
      r?.dividend_yield == null || !Number.isFinite(r.dividend_yield)
        ? '—'
        : `${r.dividend_yield.toFixed(2)}%`,
  },
  {
    key: 'beta_1y',
    label: 'Beta (1Y)',
    bestWorstKey: 'beta_1y',
    format: (r) => fmtRatio(r?.beta_1y, 2),
  },
  {
    key: 'volatility_30d',
    label: 'Volatility 30d',
    bestWorstKey: 'volatility_30d',
    format: (r) =>
      r?.volatility_30d == null || !Number.isFinite(r.volatility_30d)
        ? '—'
        : `${r.volatility_30d.toFixed(1)}%`,
  },
  {
    key: 'avg_volume',
    label: 'Avg vol (M)',
    format: (r) => fmtVolM(r?.avg_volume),
  },
];

function MetricsRowEl({
  row,
  symbols,
  metricsData,
  bestWorst,
}: {
  row: (typeof METRIC_ROWS)[number];
  symbols: string[];
  metricsData: MetricsRow[] | undefined;
  bestWorst: typeof emptyBestWorst;
}) {
  return (
    <tr className="border-t border-border/60">
      <td className="text-left py-2.5 px-4 text-muted-foreground font-sans font-semibold">
        {row.label}
      </td>
      {symbols.map((sym) => {
        const r = metricsData?.find((m) => m.symbol === sym);
        const value = row.format(r);
        const bw = row.bestWorstKey ? bestWorst[row.bestWorstKey] : undefined;
        const isBest = bw?.best === sym && symbols.length > 1;
        const isWorst = bw?.worst === sym && symbols.length > 1 && bw.best !== bw.worst;
        return (
          <td
            key={sym}
            className={cn(
              'text-right py-2.5 px-4 tabular-nums whitespace-nowrap',
              isBest && 'bg-[hsl(var(--positive))]/12 text-positive font-bold',
              isWorst && 'bg-[hsl(var(--negative))]/10 text-negative',
              !isBest && !isWorst && 'text-foreground',
            )}
          >
            {value}
          </td>
        );
      })}
    </tr>
  );
}

// ─── Correlation cell shading ────────────────────────────────────────────────
function corrCellClass(corr: number | undefined): string {
  if (corr === undefined || !Number.isFinite(corr))
    return 'bg-muted text-muted-foreground';
  if (corr >= 0.99) return 'bg-[hsl(150_50%_40%/0.7)] text-white';
  if (corr >= 0.7) return 'bg-[hsl(150_50%_50%/0.5)] text-foreground';
  if (corr >= 0.4) return 'bg-[hsl(38_60%_60%/0.4)] text-foreground';
  if (corr >= 0.1) return 'bg-[hsl(0_50%_50%/0.18)] text-foreground';
  return 'bg-muted text-foreground';
}

// ─── Risk-return scatter (inline SVG) ────────────────────────────────────────
function RiskReturnScatter({
  points,
  colorFor,
}: {
  points: Array<{ symbol: string; x: number; y: number }>;
  colorFor: (sym: string) => string;
}) {
  if (points.length === 0) {
    return (
      <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">
        Insufficient data
      </div>
    );
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(0, Math.min(...xs));
  const xMax = Math.max(...xs, 30);
  const yMin = Math.min(0, Math.min(...ys));
  const yMax = Math.max(...ys, 10);

  const W = 280;
  const H = 200;
  const padL = 40;
  const padR = 12;
  const padT = 18;
  const padB = 28;

  const sx = (v: number) =>
    padL + ((v - xMin) / Math.max(0.0001, xMax - xMin)) * (W - padL - padR);
  const sy = (v: number) =>
    padT + ((yMax - v) / Math.max(0.0001, yMax - yMin)) * (H - padT - padB);

  const axisStroke = 'hsl(var(--border))';
  const muted = 'hsl(var(--muted-foreground))';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[180px]">
      {/* Axes */}
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke={axisStroke} />
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke={axisStroke} />
      <text
        x={padL}
        y={H - 8}
        fontSize={9}
        fontFamily="ui-monospace"
        fill={muted}
      >
        vol →
      </text>
      <text
        x={padL - 4}
        y={padT + 4}
        textAnchor="end"
        fontSize={9}
        fontFamily="ui-monospace"
        fill={muted}
      >
        ↑ ret
      </text>
      {/* Zero return guideline if 0 lies in domain */}
      {yMin <= 0 && yMax >= 0 && (
        <line
          x1={padL}
          y1={sy(0)}
          x2={W - padR}
          y2={sy(0)}
          stroke={axisStroke}
          strokeDasharray="2 3"
          strokeOpacity={0.6}
        />
      )}
      {points.map((p) => {
        const color = colorFor(p.symbol);
        return (
          <g key={p.symbol}>
            <circle
              cx={sx(p.x)}
              cy={sy(p.y)}
              r={11}
              fill={color}
              fillOpacity={0.35}
              stroke={color}
              strokeWidth={2}
            />
            <text
              x={sx(p.x)}
              y={sy(p.y) + 3}
              textAnchor="middle"
              fontSize={9}
              fontFamily="ui-monospace"
              fontWeight={700}
              fill="hsl(var(--foreground))"
            >
              {p.symbol.length > 5 ? p.symbol.slice(0, 4) : p.symbol}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
