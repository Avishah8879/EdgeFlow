/**
 * Shared Result Page
 *
 * Displays shared screener and backtest results (public view).
 * Accessed via share tokens: /shared/screener/:token or /shared/backtest/:token
 */

import { useQuery } from '@tanstack/react-query';
import { useParams, useRoute, Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Search,
  LineChart,
  Clock,
  ArrowLeft,
  AlertCircle,
  Loader2,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { getAuthBaseUrl } from '@/lib/api-config';

const AUTH_BASE_URL = getAuthBaseUrl();

// Simple equity curve chart for shared results
function SimpleEquityCurve({ data }: { data: Array<{ x: string; y: number }> }) {
  const chartData = data.map((d) => ({
    date: d.x,
    value: d.y,
  }));

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  const yDomain = (() => {
    const values = chartData.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.1;
    return [Math.floor(min - padding), Math.ceil(max + padding)];
  })();

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsLineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={{ stroke: 'hsl(var(--border))' }}
        />
        <YAxis
          domain={yDomain}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={{ stroke: 'hsl(var(--border))' }}
          tickFormatter={(val) => `${val}%`}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded-md border border-border bg-card px-3 py-2 shadow-lg">
                <p className="text-xs text-muted-foreground">
                  {new Date(label).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
                <p className="text-sm font-medium">Return: {(payload[0].value as number).toFixed(2)}%</p>
              </div>
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#3b82f6"
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 4, fill: '#3b82f6' }}
        />
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}

// Types for shared results
interface SharedScreenerResult {
  id: string;
  name: string;
  expression: string;
  result_count: number;
  matching_symbols?: Array<{
    symbol: string;
    indicators?: Record<string, number>;
  }>;
  execution_time_ms?: number;
  created_at: string;
}

interface SharedBacktestResult {
  id: string;
  name: string;
  ticker: string;
  mode: string;
  strategy_condition: string;
  metrics: {
    total_profit?: number;
    win_rate?: number;
    num_trades?: number;
    calmar_ratio?: number;
    max_drawdown?: number;
    profit_factor?: number;
    avg_win?: number;
    avg_loss?: number;
  };
  equity_curve?: Array<{ x: string; y: number }>;
  candlestick_data?: any[];
  tpsl_values?: { target_pct: number; stop_pct: number };
  execution_time_ms?: number;
  created_at: string;
}

// Fetch functions
async function fetchSharedScreener(token: string): Promise<SharedScreenerResult> {
  const response = await fetch(`${AUTH_BASE_URL}/api/saved/screener/shared/${token}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('This shared result has expired or does not exist');
    }
    throw new Error('Failed to fetch shared result');
  }
  return response.json();
}

async function fetchSharedBacktest(token: string): Promise<SharedBacktestResult> {
  const response = await fetch(`${AUTH_BASE_URL}/api/saved/backtest/shared/${token}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('This shared result has expired or does not exist');
    }
    throw new Error('Failed to fetch shared result');
  }
  return response.json();
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="max-w-4xl mx-auto py-16 px-4">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
          <AlertCircle className="h-7 w-7 text-destructive" />
        </div>
        <h2 className="font-display text-2xl font-bold text-[hsl(var(--brand-navy))] dark:text-foreground mb-2">
          Result not found
        </h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-md">{message}</p>
        <Link href="/">
          <Button className="rounded-full bg-[hsl(var(--brand-navy))] text-white hover:bg-[hsl(var(--brand-navy))]/90">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to home
          </Button>
        </Link>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="max-w-4xl mx-auto py-16 px-4">
      <div className="flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--brand-gold))]" />
        <p className="text-sm text-muted-foreground">Loading shared result…</p>
      </div>
    </div>
  );
}

function SharedScreenerView({ result }: { result: SharedScreenerResult }) {
  const symbols = result.matching_symbols || [];
  const indicatorKeys = symbols.length > 0 && symbols[0].indicators
    ? Object.keys(symbols[0].indicators)
    : [];

  return (
    <div className="min-h-screen bg-background">
      <section className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-8">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-uppercase text-[hsl(var(--brand-gold))]">
              <span className="inline-block h-px w-[18px] shrink-0 bg-[hsl(var(--brand-gold))]" />
              <Search className="h-3 w-3" />
              Shared screener
            </span>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
              {result.name}
            </h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Saved{' '}
              {formatDistanceToNow(new Date(result.created_at), {
                addSuffix: true,
              })}
            </p>
          </div>
        </div>
      </section>
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">

      {/* Expression Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Screening Expression</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 rounded-md p-3">
            <code className="text-sm break-all">{result.expression}</code>
          </div>
          <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
            <span>
              <strong className="text-foreground">{result.result_count}</strong> matches
            </span>
            {result.execution_time_ms && (
              <span>
                Executed in <strong className="text-foreground">{(result.execution_time_ms / 1000).toFixed(2)}s</strong>
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      {symbols.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Matching Stocks ({symbols.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Symbol</TableHead>
                    {indicatorKeys.map((key) => (
                      <TableHead key={key} className="text-right">
                        {key.toUpperCase()}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {symbols.map((item) => (
                    <TableRow key={item.symbol}>
                      <TableCell className="font-medium">{item.symbol}</TableCell>
                      {indicatorKeys.map((key) => (
                        <TableCell key={key} className="text-right font-mono text-sm">
                          {item.indicators?.[key]?.toFixed(2) ?? '-'}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}

function SharedBacktestView({ result }: { result: SharedBacktestResult }) {
  const metrics = result.metrics || {};
  const isAdvanced = result.mode === 'advanced';
  const isProfitable = (metrics.total_profit ?? 0) >= 0;

  return (
    <div className="min-h-screen bg-background">
      <section className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2 min-w-0">
              <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-uppercase text-[hsl(var(--brand-gold))]">
                <span className="inline-block h-px w-[18px] shrink-0 bg-[hsl(var(--brand-gold))]" />
                <LineChart className="h-3 w-3" />
                Shared backtest
              </span>
              <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
                {result.name}
              </h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                Saved{' '}
                {formatDistanceToNow(new Date(result.created_at), {
                  addSuffix: true,
                })}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-uppercase px-2.5 py-1.5 rounded-full bg-[hsl(var(--brand-navy))] text-white">
                {result.ticker}
              </span>
              <span className="text-[10.5px] font-bold uppercase tracking-uppercase px-2.5 py-1.5 rounded-full bg-muted text-muted-foreground">
                {result.mode}
              </span>
            </div>
          </div>
        </div>
      </section>
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">

      {/* Strategy Condition Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Strategy Condition</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 rounded-md p-3">
            <code className="text-sm break-all">{result.strategy_condition}</code>
          </div>
          {result.execution_time_ms && (
            <p className="text-sm text-muted-foreground mt-3">
              Optimized in {(result.execution_time_ms / 1000).toFixed(2)}s
            </p>
          )}
        </CardContent>
      </Card>

      {/* TPSL Values for Advanced Mode */}
      {isAdvanced && result.tpsl_values && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" />
              Take-Profit / Stop-Loss Settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-positive" />
                <div>
                  <p className="text-sm text-muted-foreground">Take Profit</p>
                  <p className="text-lg font-semibold text-positive">
                    +{result.tpsl_values.target_pct.toFixed(2)}%
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-negative" />
                <div>
                  <p className="text-sm text-muted-foreground">Stop Loss</p>
                  <p className="text-lg font-semibold text-negative">
                    -{result.tpsl_values.stop_pct.toFixed(2)}%
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Performance Metrics */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Performance Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total PnL</p>
              <p className={`text-xl font-bold ${isProfitable ? 'text-positive' : 'text-negative'}`}>
                {isProfitable ? '+' : ''}{metrics.total_profit?.toFixed(2)}%
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Win Rate</p>
              <p className="text-xl font-bold">{metrics.win_rate?.toFixed(1)}%</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Trades</p>
              <p className="text-xl font-bold">{metrics.num_trades}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Calmar Ratio</p>
              <p className="text-xl font-bold">{metrics.calmar_ratio?.toFixed(2)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Max Drawdown</p>
              <p className="text-xl font-bold text-negative">
                {metrics.max_drawdown?.toFixed(2)}%
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Profit Factor</p>
              <p className="text-xl font-bold">{metrics.profit_factor?.toFixed(2)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Avg Win</p>
              <p className="text-xl font-bold text-positive">
                +{metrics.avg_win?.toFixed(2)}%
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Avg Loss</p>
              <p className="text-xl font-bold text-negative">
                {metrics.avg_loss?.toFixed(2)}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Equity Curve Chart */}
      {result.equity_curve && result.equity_curve.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Equity Curve</CardTitle>
            <CardDescription>
              Portfolio value over time based on backtest simulation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[400px]">
              <SimpleEquityCurve data={result.equity_curve} />
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}

export default function SharedResult() {
  const params = useParams();
  const [isScreenerRoute] = useRoute('/shared/screener/:token');
  const [isBacktestRoute] = useRoute('/shared/backtest/:token');

  const token = params.token as string;
  const isScreener = isScreenerRoute;
  const isBacktest = isBacktestRoute;

  // Screener query
  const screenerQuery = useQuery({
    queryKey: ['shared-screener', token],
    queryFn: () => fetchSharedScreener(token),
    enabled: isScreener && !!token,
    retry: false,
  });

  // Backtest query
  const backtestQuery = useQuery({
    queryKey: ['shared-backtest', token],
    queryFn: () => fetchSharedBacktest(token),
    enabled: isBacktest && !!token,
    retry: false,
  });

  // Loading states
  if (screenerQuery.isLoading || backtestQuery.isLoading) {
    return <LoadingState />;
  }

  // Error states
  if (screenerQuery.error) {
    return <ErrorState message={(screenerQuery.error as Error).message} />;
  }
  if (backtestQuery.error) {
    return <ErrorState message={(backtestQuery.error as Error).message} />;
  }

  // Render appropriate view
  if (isScreener && screenerQuery.data) {
    return <SharedScreenerView result={screenerQuery.data} />;
  }
  if (isBacktest && backtestQuery.data) {
    return <SharedBacktestView result={backtestQuery.data} />;
  }

  // Fallback for unknown route
  return <ErrorState message="Invalid shared result URL" />;
}
