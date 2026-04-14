import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Scatter, ReferenceLine } from 'recharts';
import { Plus, X, Calendar, TrendingUp } from 'lucide-react';

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

interface NormalizedData {
  date: string;
  [symbol: string]: string | number;
}

interface PairScatterPoint {
  date: string;
  xValue: number;
  yValue: number;
}

interface ResidualPoint {
  date: string;
  residual: number;
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

  // Fetch comparison data
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

  // Calculate normalized data for percentage comparison
  const normalizedData = useMemo(() => {
    if (!comparisonData || comparisonData.length === 0) return [];

    // Find the common dates across all symbols
    const allDates = new Set<string>();
    comparisonData.forEach(({ data }) => {
      data.forEach((point) => allDates.add(point.date));
    });

    const sortedDates = Array.from(allDates).sort();
    
    // Create a map for quick lookup
    const dataMap: Record<string, Record<string, number>> = {};
    comparisonData.forEach(({ symbol, data }) => {
      dataMap[symbol] = {};
      data.forEach((point) => {
        dataMap[symbol][point.date] = point.close;
      });
    });

    // Get base prices (first available price for each symbol)
    const basePrices: Record<string, number> = {};
    comparisonData.forEach(({ symbol, data }) => {
      if (data.length > 0) {
        basePrices[symbol] = data[0].close;
      }
    });

    // Normalize to percentage change from base
    return sortedDates.map((date) => {
      const point: NormalizedData = { date };
      
      symbols.forEach((symbol) => {
        if (dataMap[symbol] && dataMap[symbol][date] && basePrices[symbol]) {
          const percentChange = ((dataMap[symbol][date] - basePrices[symbol]) / basePrices[symbol]) * 100;
          point[symbol] = parseFloat(percentChange.toFixed(2));
        }
      });
      
      return point;
    }).filter((point) => {
      // Only include points where all symbols have data
      return symbols.every((symbol) => point[symbol] !== undefined);
    });
  }, [comparisonData, symbols]);

  // Calculate correlation matrix
  useEffect(() => {
    if (!comparisonData || comparisonData.length < 2) return;

    const matrix: Record<string, Record<string, number>> = {};
    
    for (let i = 0; i < symbols.length; i++) {
      matrix[symbols[i]] = {};
      for (let j = 0; j < symbols.length; j++) {
        if (i === j) {
          matrix[symbols[i]][symbols[j]] = 1;
        } else {
          // Calculate correlation
          const data1 = comparisonData[i]?.data || [];
          const data2 = comparisonData[j]?.data || [];
          
          if (data1.length > 0 && data2.length > 0) {
            const correlation = calculateCorrelation(
              data1.map(d => d.close),
              data2.map(d => d.close)
            );
            matrix[symbols[i]][symbols[j]] = correlation;
          }
        }
      }
    }
    
    setCorrelationMatrix(matrix);
  }, [comparisonData, symbols]);

  const calculateCorrelation = (x: number[], y: number[]): number => {
    const n = Math.min(x.length, y.length);
    if (n === 0) return 0;

    const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

    let num = 0;
    let denX = 0;
    let denY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }

    if (denX === 0 || denY === 0) return 0;
    return num / Math.sqrt(denX * denY);
  };

  const pairScatterData = useMemo<PairScatterPoint[]>(() => {
    if (!pairSelection.x || !pairSelection.y || normalizedData.length === 0) {
      return [];
    }

    return normalizedData
      .map((point) => {
        const xValue = point[pairSelection.x];
        const yValue = point[pairSelection.y];

        if (typeof xValue !== 'number' || typeof yValue !== 'number') {
          return null;
        }

        return {
          date: point.date,
          xValue,
          yValue,
        } as PairScatterPoint;
      })
      .filter((point): point is PairScatterPoint => point !== null);
  }, [pairSelection, normalizedData]);

  const autoPairBeta = useMemo(() => {
    if (!pairSelection.x || !pairSelection.y) {
      return 0;
    }

    if (pairSelection.x === pairSelection.y) {
      return 1;
    }

    const matrixValue =
      correlationMatrix[pairSelection.x]?.[pairSelection.y] ??
      correlationMatrix[pairSelection.y]?.[pairSelection.x];

    if (typeof matrixValue === 'number' && !Number.isNaN(matrixValue)) {
      return matrixValue;
    }

    if (pairScatterData.length < 2) {
      return 0;
    }

    const xSeries = pairScatterData.map((point) => point.xValue);
    const ySeries = pairScatterData.map((point) => point.yValue);
    return calculateCorrelation(xSeries, ySeries);
  }, [pairSelection, correlationMatrix, pairScatterData]);

  const manualBeta = useMemo(() => {
    const parsed = parseFloat(manualBetaInput);
    return Number.isFinite(parsed) ? parsed : NaN;
  }, [manualBetaInput]);

  const effectiveBeta = betaMode === 'manual' && Number.isFinite(manualBeta)
    ? manualBeta
    : autoPairBeta;

  const regressionLineData = useMemo<PairScatterPoint[]>(() => {
    if (pairScatterData.length < 2 || !Number.isFinite(effectiveBeta)) {
      return [];
    }

    const xValues = pairScatterData.map((point) => point.xValue);
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);

    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || minX === maxX) {
      return [];
    }

    return [
      { date: 'start', xValue: minX, yValue: effectiveBeta * minX },
      { date: 'end', xValue: maxX, yValue: effectiveBeta * maxX },
    ];
  }, [pairScatterData, effectiveBeta]);

  const residualsData = useMemo<ResidualPoint[]>(() => {
    if (pairScatterData.length === 0 || !Number.isFinite(effectiveBeta)) {
      return [];
    }

    return pairScatterData.map((point) => ({
      date: point.date,
      residual: parseFloat((point.yValue - effectiveBeta * point.xValue).toFixed(4)),
    }));
  }, [pairScatterData, effectiveBeta]);

  const residualStdDev = useMemo(() => {
    if (residualsData.length < 2) return 0;
    const values = residualsData.map((d) => d.residual);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance);
  }, [residualsData]);

  const calculateStats = useCallback(() => {
    if (!normalizedData || normalizedData.length === 0) return {};

    const stats: Record<string, any> = {};
    
    symbols.forEach((symbol) => {
      const values = normalizedData.map(d => d[symbol] as number).filter(v => v !== undefined);
      if (values.length === 0) return;

      const lastValue = values[values.length - 1];
      const returns = values.slice(1).map((v, i) => v - values[i]);
      const volatility = Math.sqrt(returns.reduce((sum, r) => sum + r * r, 0) / returns.length);
      
      stats[symbol] = {
        performance: lastValue,
        volatility: volatility.toFixed(2),
        beta: calculateBeta(symbol, 'NIFTY 50'), // Assuming NIFTY 50 as market proxy
      };
    });
    
    return stats;
  }, [normalizedData, symbols]);

  const calculateBeta = (symbol: string, market: string): number => {
    // Simplified beta calculation
    if (!correlationMatrix[symbol] || !correlationMatrix[symbol][market]) {
      return 1.0;
    }
    // This is a simplified calculation - real beta would need variance calculations
    return parseFloat((correlationMatrix[symbol][market] * 1.2).toFixed(2));
  };

  const handleAddSymbol = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSymbol && !symbols.includes(newSymbol.toUpperCase()) && symbols.length < 5) {
      setSymbols([...symbols, newSymbol.toUpperCase()]);
      setNewSymbol('');
      refetch();
    }
  };

  const handleRemoveSymbol = (symbolToRemove: string) => {
    setSymbols(symbols.filter(s => s !== symbolToRemove));
  };

  const stats = calculateStats();
  const pairAnalysisDisabled = symbols.length < 2 || normalizedData.length === 0;
  const canShowPairCharts = pairScatterData.length >= 2 && Number.isFinite(effectiveBeta);
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
          {/* Symbol Management */}
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

          {/* Time Range */}
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

      {/* Chart and Statistics */}
      <div className="flex-1 grid grid-cols-3 gap-4">
        {/* Chart */}
        <Card className="col-span-2 p-4 bg-card/50 border-primary/20">
          <div className="h-full">
            <h3 className="text-sm font-semibold mb-2 text-primary">
              Performance Comparison (% Change)
            </h3>
            {isLoading ? (
              <div className="flex items-center justify-center h-[calc(100%-2rem)]">
                <div className="text-muted-foreground">Loading chart data...</div>
              </div>
            ) : normalizedData.length > 0 ? (
              <ResponsiveContainer width="100%" height="90%">
                <LineChart data={normalizedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#9ca3af"
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis 
                    stroke="#9ca3af"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1f2937', 
                      border: '1px solid #374151',
                      borderRadius: '4px'
                    }}
                    formatter={(value: any) => `${value}%`}
                  />
                  <Legend />
                  {symbols.map((symbol, index) => (
                    <Line
                      key={symbol}
                      type="monotone"
                      dataKey={symbol}
                      stroke={colors[index % colors.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[calc(100%-2rem)]">
                <div className="text-muted-foreground">No data available</div>
              </div>
            )}
          </div>
        </Card>

        {/* Statistics Panel */}
        <div className="space-y-4">
          {/* Performance Metrics */}
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
                  <span className={`font-mono ${
                    stats[symbol]?.performance >= 0 ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {stats[symbol]?.performance ? `${stats[symbol].performance > 0 ? '+' : ''}${stats[symbol].performance.toFixed(2)}%` : 'N/A'}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Correlation Matrix */}
          <Card className="p-4 bg-card/50 border-primary/20">
            <h3 className="text-sm font-semibold mb-3 text-primary">Correlation Matrix</h3>
            <ScrollArea className="h-40">
              <div className="text-xs">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="text-left p-1"></th>
                      {symbols.map((symbol) => (
                        <th key={symbol} className="text-center p-1 font-mono">{symbol}</th>
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

          {/* Volatility & Beta */}
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
                  <div className="text-center font-mono">
                    {stats[symbol]?.volatility || 'N/A'}
                  </div>
                  <div className="text-center font-mono">
                    {stats[symbol]?.beta || 'N/A'}
                  </div>
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
                  <h4 className="text-xs font-semibold mb-2 text-primary">
                    Regression: Y = beta * X
                  </h4>
                  {canShowPairCharts ? (
                    <ResponsiveContainer width="100%" height={260}>
                      <ComposedChart data={pairScatterData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis
                          type="number"
                          dataKey="xValue"
                          name={pairSelection.x}
                          unit="%"
                          stroke="#9ca3af"
                          tick={{ fontSize: 10 }}
                        />
                        <YAxis
                          type="number"
                          dataKey="yValue"
                          name={pairSelection.y}
                          unit="%"
                          stroke="#9ca3af"
                          tick={{ fontSize: 10 }}
                        />
                        <Tooltip
                          cursor={{ strokeDasharray: '3 3' }}
                          contentStyle={{
                            backgroundColor: '#1f2937',
                            border: '1px solid #374151',
                            borderRadius: '4px',
                          }}
                          formatter={(value: any, name) => [`${value}%`, name]}
                        />
                        <Legend />
                        <Scatter
                          name={`${pairSelection.y} vs ${pairSelection.x}`}
                          data={pairScatterData}
                          fill="#3b82f6"
                        />
                        {regressionLineData.length === 2 && (
                          <Line
                            name="beta * X"
                            data={regressionLineData}
                            dataKey="yValue"
                            stroke="#f97316"
                            dot={false}
                            strokeWidth={2}
                          />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                      Not enough overlapping data to compute regression.
                    </div>
                  )}
                </div>

                <div className="p-3 bg-card border border-border rounded">
                  <h4 className="text-xs font-semibold mb-2 text-primary">
                    Residuals: Y - beta * X
                  </h4>
                  {canShowPairCharts && residualsData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={residualsData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis
                          dataKey="date"
                          stroke="#9ca3af"
                          tick={{ fontSize: 10 }}
                        />
                        <YAxis
                          stroke="#9ca3af"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(value) => `${value}%`}
                          domain={residualStdDev > 0 ? [
                            (dataMin: number) => Math.min(dataMin, -2.5 * residualStdDev),
                            (dataMax: number) => Math.max(dataMax, 2.5 * residualStdDev),
                          ] : ['auto', 'auto']}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1f2937',
                            border: '1px solid #374151',
                            borderRadius: '4px',
                          }}
                          formatter={(value: any) => `${value}%`}
                        />
                        <ReferenceLine y={0} stroke="#4b5563" strokeDasharray="4 2" />
                        {residualStdDev > 0 && (
                          <ReferenceLine
                            y={parseFloat((2 * residualStdDev).toFixed(4))}
                            stroke="#22c55e"
                            strokeDasharray="6 3"
                            strokeWidth={1}
                            label={{ value: `+2σ (${(2 * residualStdDev).toFixed(2)}%)`, position: 'right', fill: '#22c55e', fontSize: 9 }}
                          />
                        )}
                        {residualStdDev > 0 && (
                          <ReferenceLine
                            y={parseFloat((-2 * residualStdDev).toFixed(4))}
                            stroke="#ef4444"
                            strokeDasharray="6 3"
                            strokeWidth={1}
                            label={{ value: `-2σ (${(-2 * residualStdDev).toFixed(2)}%)`, position: 'right', fill: '#ef4444', fontSize: 9 }}
                          />
                        )}
                        <Line
                          type="monotone"
                          dataKey="residual"
                          stroke="#f97316"
                          dot={false}
                          strokeWidth={2}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                      Residuals unavailable for the selected pair.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
