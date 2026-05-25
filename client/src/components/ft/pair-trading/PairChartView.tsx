import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import {
  buildNormalizedSeries,
  buildPairScatter,
  buildRegressionLine,
  calculatePearsonCorrelation,
  computeResiduals,
  residualStdDev as computeResidualStdDev,
  type OhlcPoint,
} from '@/lib/stats';
import { PerformanceComparisonChart } from './charts/PerformanceComparisonChart';
import { PairRegressionChart } from './charts/PairRegressionChart';
import { ResidualsChart } from './charts/ResidualsChart';
import type { PairMethod } from '@/hooks/use-pair-trading';

interface Props {
  xSymbol: string;
  ySymbol: string;
  lookbackDays: number;
  method: PairMethod;
  matrixScore: number | null;
  pvalue?: number | null;
  onBack: () => void;
}

interface PairSeriesEntry {
  symbol: string;
  data: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
}

const PAIR_COLORS = ['#10b981', '#3b82f6'];

export function PairChartView({
  xSymbol,
  ySymbol,
  lookbackDays,
  method,
  matrixScore,
  pvalue,
  onBack,
}: Props) {
  const symbolsKey = useMemo(() => `${xSymbol},${ySymbol}`, [xSymbol, ySymbol]);
  const pairSeriesPath = useMemo(() => {
    const params = new URLSearchParams({
      symbols: symbolsKey,
      lookback_days: String(lookbackDays),
    });
    return `/api/pair-trading/pair-series?${params.toString()}`;
  }, [symbolsKey, lookbackDays]);

  const { data, isLoading } = useQuery<PairSeriesEntry[]>({
    queryKey: [pairSeriesPath],
    enabled: !!xSymbol && !!ySymbol,
    select: (raw: any): PairSeriesEntry[] => {
      const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      return arr;
    },
  });

  const symbols = useMemo(() => [xSymbol, ySymbol], [xSymbol, ySymbol]);

  const normalizedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    const seriesMap: Record<string, OhlcPoint[]> = {};
    for (const entry of data) {
      seriesMap[entry.symbol] = entry.data.map((d) => ({ date: d.date, close: d.close }));
    }
    return buildNormalizedSeries(seriesMap, symbols);
  }, [data, symbols]);

  const pairScatter = useMemo(
    () => buildPairScatter(normalizedData, xSymbol, ySymbol),
    [normalizedData, xSymbol, ySymbol],
  );

  const beta = useMemo(() => {
    if (pairScatter.length < 2) return 0;
    return calculatePearsonCorrelation(
      pairScatter.map((p) => p.xValue),
      pairScatter.map((p) => p.yValue),
    );
  }, [pairScatter]);

  const regressionLine = useMemo(() => buildRegressionLine(pairScatter, beta), [pairScatter, beta]);
  const residuals = useMemo(() => computeResiduals(pairScatter, beta), [pairScatter, beta]);
  const stdDev = useMemo(() => computeResidualStdDev(residuals), [residuals]);

  const correlationPct =
    method === 'correlation' && matrixScore !== null ? matrixScore : beta * 100;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
            <ArrowLeft className="w-4 h-4" />
            Back to matrix
          </Button>
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {xSymbol} <span className="text-muted-foreground">vs</span> {ySymbol}
            </h3>
            <p className="text-xs text-muted-foreground">
              Lookback: {lookbackDays} trading days · Method: {method}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            Correlation: {correlationPct.toFixed(1)}%
          </Badge>
          {method === 'cointegration' && pvalue !== null && pvalue !== undefined && (
            <Badge variant="outline" className="font-mono text-xs">
              Coint p-value: {pvalue.toFixed(4)}
            </Badge>
          )}
          <Badge variant="outline" className="font-mono text-xs">
            β = {beta.toFixed(3)}
          </Badge>
          <Badge variant="outline" className="font-mono text-xs">
            σ(residuals) = {stdDev.toFixed(3)}%
          </Badge>
        </div>
      </div>

      <Card className="p-4 bg-card/50 border-primary/20">
        <h4 className="text-sm font-semibold mb-2 text-primary">
          Performance Comparison (% Change)
        </h4>
        <div className="h-[280px]">
          <PerformanceComparisonChart
            data={normalizedData}
            symbols={symbols}
            colors={PAIR_COLORS}
            isLoading={isLoading}
            heightPct="100%"
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4 bg-card/50 border-primary/20">
          <h4 className="text-sm font-semibold mb-2 text-primary">
            Pair Regression: {ySymbol} = β · {xSymbol}
          </h4>
          <PairRegressionChart
            scatter={pairScatter}
            regressionLine={regressionLine}
            xSymbol={xSymbol}
            ySymbol={ySymbol}
          />
        </Card>
        <Card className="p-4 bg-card/50 border-primary/20">
          <h4 className="text-sm font-semibold mb-2 text-primary">
            Residuals: {ySymbol} − β · {xSymbol}
          </h4>
          <ResidualsChart residuals={residuals} stdDev={stdDev} />
        </Card>
      </div>
    </div>
  );
}
