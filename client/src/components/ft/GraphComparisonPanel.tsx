import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, X, Calendar } from 'lucide-react';
import {
  calculatePearsonCorrelation,
  buildNormalizedSeries,
  buildPairScatter,
  buildRegressionLine,
  computeResiduals,
  residualStdDev as computeResidualStdDev,
  type OhlcPoint,
} from '@/lib/stats';
import { PerformanceComparisonChart } from '@/components/ft/pair-trading/charts/PerformanceComparisonChart';
import { PairRegressionChart } from '@/components/ft/pair-trading/charts/PairRegressionChart';
import { ResidualsChart } from '@/components/ft/pair-trading/charts/ResidualsChart';

interface ChartData {
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

const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

const timeRanges = [
  { value: '5D', label: '5 Days' },
  { value: '1M', label: '1 Month' },
  { value: '3M', label: '3 Months' },
  { value: '6M', label: '6 Months' },
  { value: '1Y', label: '1 Year' },
];

export function GraphComparisonPanel() {
  const [symbols, setSymbols] = useState<string[]>(['RELIANCE', 'INFY']);
  const [newSymbol, setNewSymbol] = useState('');
  const [timeRange, setTimeRange] = useState('1M');
  const [correlationMatrix, setCorrelationMatrix] = useState<Record<string, Record<string, number>>>({});
  const [pairAnalysisOpen, setPairAnalysisOpen] = useState(false);
  const [pairSelection, setPairSelection] = useState<{ x: string; y: string }>(() => ({
    x: 'RELIANCE',
    y: 'INFY',
  }));
  const [betaMode, setBetaMode] = useState<'auto' | 'manual'>('auto');
  const [manualBetaInput, setManualBetaInput] = useState('1.00');

  const { data: comparisonData, isLoading, refetch } = useQuery<ChartData[]>({
    queryKey: [`/api/chart/compare?symbols=${symbols.join(',')}&range=${timeRange}`],
    enabled: symbols.length > 0,
    select: (raw: any): ChartData[] => {
      const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      return arr;
    },
  });

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

      if (nextX === prev.x && nextY === prev.y) {
        return prev;
      }

      return { x: nextX, y: nextY };
    });
  }, [symbols]);

  const normalizedData = useMemo(() => {
    if (!comparisonData || comparisonData.length === 0) return [];
    const seriesMap: Record<string, OhlcPoint[]> = {};
    for (const entry of comparisonData) {
      seriesMap[entry.symbol] = entry.data.map((d) => ({ date: d.date, close: d.close }));
    }
    return buildNormalizedSeries(seriesMap, symbols);
  }, [comparisonData, symbols]);

  useEffect(() => {
    if (!comparisonData || comparisonData.length < 2) return;

    const matrix: Record<string, Record<string, number>> = {};

    for (let i = 0; i < symbols.length; i++) {
      matrix[symbols[i]] = {};
      for (let j = 0; j < symbols.length; j++) {
        if (i === j) {
          matrix[symbols[i]][symbols[j]] = 1;
        } else {
          const data1 = comparisonData[i]?.data || [];
          const data2 = comparisonData[j]?.data || [];

          if (data1.length > 0 && data2.length > 0) {
            const correlation = calculatePearsonCorrelation(
              data1.map((d) => d.close),
              data2.map((d) => d.close),
            );
            matrix[symbols[i]][symbols[j]] = correlation;
          }
        }
      }
    }

    setCorrelationMatrix(matrix);
  }, [comparisonData, symbols]);

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

  const residualStdDev = useMemo(() => computeResidualStdDev(residualsData), [residualsData]);

  const stats = useMemo(() => {
    if (!normalizedData || normalizedData.length === 0) return {} as Record<string, any>;
    const out: Record<string, any> = {};
    symbols.forEach((symbol) => {
      const values = normalizedData.map((d) => d[symbol] as number).filter((v) => v !== undefined);
      if (values.length === 0) return;
      const lastValue = values[values.length - 1];
      const returns = values.slice(1).map((v, i) => v - values[i]);
      const volatility = Math.sqrt(returns.reduce((sum, r) => sum + r * r, 0) / returns.length);
      const marketCorr = correlationMatrix[symbol]?.['NIFTY 50'];
      const beta = typeof marketCorr === 'number' ? parseFloat((marketCorr * 1.2).toFixed(2)) : 1.0;
      out[symbol] = {
        performance: lastValue,
        volatility: volatility.toFixed(2),
        beta,
      };
    });
    return out;
  }, [normalizedData, symbols, correlationMatrix]);

  const handleAddSymbol = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSymbol && !symbols.includes(newSymbol.toUpperCase()) && symbols.length < 5) {
      setSymbols([...symbols, newSymbol.toUpperCase()]);
      setNewSymbol('');
      refetch();
    }
  };

  const handleRemoveSymbol = (symbolToRemove: string) => {
    setSymbols(symbols.filter((s) => s !== symbolToRemove));
  };

  const pairAnalysisDisabled = symbols.length < 2 || normalizedData.length === 0;
  const pairEquationLabel = pairSelection.x && pairSelection.y
    ? `${pairSelection.y} = ${Number.isFinite(effectiveBeta) ? effectiveBeta.toFixed(2) : 'beta'} * ${pairSelection.x}`
    : 'Select securities';
  const pairXValue = pairSelection.x || symbols[0] || '';
  const pairYValue = pairSelection.y || symbols[1] || symbols[0] || '';

  return (
    <div className="h-full flex flex-col bg-card p-2 overflow-y-auto">
      {/* Controls */}
      <Card className="p-2 mb-2 bg-card/50 border-primary/20">
        <div className="space-y-2">
          <div>
            <Label className="text-xs mb-2">Securities ({symbols.length}/5)</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {symbols.map((symbol, index) => (
                <Badge key={symbol} variant="outline" className="py-1 px-2">
                  <div
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: colors[index % colors.length] }}
                  />
                  {symbol}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-1 p-0 h-4 w-4"
                    onClick={() => handleRemoveSymbol(symbol)}
                    data-testid={`button-remove-${symbol}`}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </Badge>
              ))}
            </div>
            {symbols.length < 5 && (
              <form onSubmit={handleAddSymbol} className="flex gap-2">
                <Input
                  placeholder="Add symbol..."
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                  className="w-32"
                  data-testid="input-add-symbol"
                />
                <Button type="submit" size="sm" data-testid="button-add">
                  <Plus className="w-4 h-4" />
                </Button>
              </form>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Label className="text-xs">Time Range:</Label>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32" data-testid="select-time-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timeRanges.map((range) => (
                  <SelectItem key={range.value} value={range.value}>
                    {range.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Pair Regression Toolkit
              </p>
              <p className="text-[11px] text-muted-foreground/80">
                Compare any two securities using beta = corr(Y, X)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pairAnalysisDisabled}
                onClick={() => setPairAnalysisOpen((prev) => !prev)}
              >
                {pairAnalysisOpen ? 'Hide Pair Regression' : 'Show Pair Regression'}
              </Button>
              {pairAnalysisOpen && (
                <>
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Beta Mode
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
                      className="w-24 h-8 text-xs"
                      value={manualBetaInput}
                      onChange={(e) => setManualBetaInput(e.target.value)}
                      placeholder="Beta"
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="flex-1 grid grid-cols-3 gap-4">
        <Card className="col-span-2 p-4 bg-card/50 border-primary/20">
          <div className="h-full">
            <h3 className="text-sm font-semibold mb-2 text-primary">
              Performance Comparison (% Change)
            </h3>
            <PerformanceComparisonChart
              data={normalizedData}
              symbols={symbols}
              colors={colors}
              isLoading={isLoading}
            />
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4 bg-card/50 border-primary/20">
            <h3 className="text-sm font-semibold mb-3 text-primary">Performance Metrics</h3>
            <div className="space-y-2">
              {symbols.map((symbol, index) => (
                <div key={symbol} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: colors[index % colors.length] }}
                    />
                    <span className="font-mono">{symbol}</span>
                  </div>
                  <span
                    className={`font-mono ${
                      stats[symbol]?.performance >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}
                  >
                    {stats[symbol]?.performance
                      ? `${stats[symbol].performance > 0 ? '+' : ''}${stats[symbol].performance.toFixed(2)}%`
                      : 'N/A'}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4 bg-card/50 border-primary/20">
            <h3 className="text-sm font-semibold mb-3 text-primary">Correlation Matrix</h3>
            <ScrollArea className="h-40">
              <div className="text-xs">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="text-left p-1"></th>
                      {symbols.map((symbol) => (
                        <th key={symbol} className="text-center p-1 font-mono">
                          {symbol}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {symbols.map((symbol1) => (
                      <tr key={symbol1}>
                        <td className="font-mono p-1">{symbol1}</td>
                        {symbols.map((symbol2) => {
                          const corr = correlationMatrix[symbol1]?.[symbol2] || 0;
                          return (
                            <td
                              key={symbol2}
                              className={`text-center p-1 font-mono ${
                                symbol1 === symbol2
                                  ? 'text-muted-foreground'
                                  : corr > 0.5
                                  ? 'text-green-500'
                                  : corr < -0.5
                                  ? 'text-red-500'
                                  : 'text-yellow-500'
                              }`}
                            >
                              {corr.toFixed(2)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          </Card>

          <Card className="p-4 bg-card/50 border-primary/20">
            <h3 className="text-sm font-semibold mb-3 text-primary">Risk Metrics</h3>
            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-3 gap-2 text-muted-foreground mb-1">
                <div>Symbol</div>
                <div className="text-center">Volatility</div>
                <div className="text-center">Beta</div>
              </div>
              {symbols.map((symbol) => (
                <div key={symbol} className="grid grid-cols-3 gap-2">
                  <div className="font-mono">{symbol}</div>
                  <div className="text-center font-mono">{stats[symbol]?.volatility || 'N/A'}</div>
                  <div className="text-center font-mono">{stats[symbol]?.beta || 'N/A'}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {pairAnalysisOpen && (
        <Card className="mt-4 p-4 bg-card/50 border-primary/30">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-primary">Pair Regression Analysis</h3>
              <p className="text-xs text-muted-foreground">{pairEquationLabel}</p>
            </div>
            <Badge variant="outline" className="text-[11px] px-2 py-1 font-mono">
              beta = {Number.isFinite(effectiveBeta) ? effectiveBeta.toFixed(2) : '0.00'} ({betaMode})
            </Badge>
          </div>

          {symbols.length < 2 ? (
            <div className="text-sm text-muted-foreground">
              Add at least two securities to unlock pair analysis.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <Label className="text-xs mb-1">Base Security (X)</Label>
                  <Select
                    value={pairXValue}
                    onValueChange={(value) => setPairSelection((prev) => ({ ...prev, x: value }))}
                  >
                    <SelectTrigger>
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
                  <Label className="text-xs mb-1">Response Security (Y)</Label>
                  <Select
                    value={pairYValue}
                    onValueChange={(value) => setPairSelection((prev) => ({ ...prev, y: value }))}
                  >
                    <SelectTrigger>
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
                <div className="p-3 bg-card border border-border rounded">
                  <h4 className="text-xs font-semibold mb-2 text-primary">Regression: Y = beta * X</h4>
                  <PairRegressionChart
                    scatter={pairScatterData}
                    regressionLine={regressionLineData}
                    xSymbol={pairSelection.x}
                    ySymbol={pairSelection.y}
                  />
                </div>

                <div className="p-3 bg-card border border-border rounded">
                  <h4 className="text-xs font-semibold mb-2 text-primary">Residuals: Y - beta * X</h4>
                  <ResidualsChart residuals={residualsData} stdDev={residualStdDev} />
                </div>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
