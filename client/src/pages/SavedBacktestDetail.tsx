/**
 * Saved Backtest Detail Page
 *
 * Displays full details of a saved backtest result including
 * equity curve and all performance metrics.
 *
 * Metric field names from optimizer:
 * - total_profit, win_rate, num_trades, calmar_ratio
 * - max_dd (not max_drawdown), profit_factor
 * - avg_p (average return per trade), Worst_10 (worst 10-day return)
 */

import { useState } from 'react';
import { Link, useParams, useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Clock,
  Loader2,
  Copy,
  Check,
  Share2,
  TrendingUp,
  Target,
  Shield,
  Home,
  ChevronRight,
} from 'lucide-react';
import { Eyebrow } from '@/components/ui/eyebrow';
import { cn } from '@/lib/utils';
import {
  useSavedBacktestResult,
  useShareBacktestResult,
} from '@/hooks/use-saved-results';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { EquityCurveChart } from '@/components/strategy-backtest/EquityCurveChart';

export default function SavedBacktestDetail() {
  const params = useParams();
  const [, navigate] = useLocation();
  const resultId = params.id as string;

  const [copied, setCopied] = useState(false);

  const { data: result, isLoading, error } = useSavedBacktestResult(resultId);
  const shareBacktestMutation = useShareBacktestResult();

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto py-16 px-4">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--brand-gold))]" />
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="max-w-6xl mx-auto py-16 px-4">
        <div className="text-center py-16">
          <h2 className="font-display text-2xl font-bold text-[hsl(var(--brand-navy))] dark:text-foreground mb-2">
            Result not found
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            The backtest result you're looking for doesn't exist or you don't
            have access to it.
          </p>
          <Link href="/saved-results">
            <Button className="rounded-full bg-[hsl(var(--brand-navy))] text-white hover:bg-[hsl(var(--brand-navy))]/90">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to saved results
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const metrics = result.metrics || {};
  const isAdvanced = result.mode === 'advanced';
  const isProfitable = (metrics.total_profit ?? 0) >= 0;

  const copyShareLink = () => {
    if (result.share_token) {
      navigator.clipboard.writeText(`${window.location.origin}/shared/backtest/${result.share_token}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Share link copied!');
    }
  };

  const handleShare = async () => {
    try {
      await shareBacktestMutation.mutateAsync(resultId);
      toast.success('Share link generated');
    } catch (error: any) {
      toast.error(error.message || 'Failed to share');
    }
  };

  // Use stored equity curve data and chart markers (no recalculation)
  const equityCurveData = result.equity_curve || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Page masthead */}
      <section className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
            <Link
              href="/home"
              className="hover:text-foreground transition-colors flex items-center gap-1"
            >
              <Home className="w-3 h-3" /> Home
            </Link>
            <ChevronRight className="w-3 h-3 opacity-40" />
            <Link
              href="/saved-results"
              className="hover:text-foreground transition-colors"
            >
              Saved results
            </Link>
            <ChevronRight className="w-3 h-3 opacity-40" />
            <span className="text-foreground font-medium truncate max-w-[200px]">
              {result.name}
            </span>
          </nav>

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1.5 min-w-0">
              <Eyebrow tone="gold" rule>
                Saved backtest
              </Eyebrow>
              <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
                {result.name}
              </h1>
              <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(result.created_at), {
                  addSuffix: true,
                })}
                {result.execution_time_ms && (
                  <>
                    <span>·</span>
                    <span>
                      Optimized in{' '}
                      <span className="font-mono tabular-nums">
                        {(result.execution_time_ms / 1000).toFixed(2)}s
                      </span>
                    </span>
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-uppercase px-2.5 py-1.5 rounded-full bg-[hsl(var(--brand-navy))] text-white">
                {result.ticker}
              </span>
              <span className="text-[10.5px] font-bold uppercase tracking-uppercase px-2.5 py-1.5 rounded-full bg-muted text-muted-foreground">
                {result.mode}
              </span>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground mb-1">
                Strategy condition
              </div>
              <div className="rounded-md bg-muted/40 p-3">
                <code className="text-[12.5px] font-mono break-all text-foreground">
                  {result.strategy_condition}
                </code>
              </div>
            </div>

            {result.custom_rules && (
              <div>
                <div className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground mb-1">
                  Custom rules
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <code className="text-[12.5px] font-mono break-all text-foreground">
                    {result.custom_rules}
                  </code>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-4">
            {result.is_shared && result.share_token ? (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={copyShareLink}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                )}
                {copied ? 'Copied' : 'Copy share link'}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={handleShare}
                disabled={shareBacktestMutation.isPending}
              >
                {shareBacktestMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Share2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                Share
              </Button>
            )}
            <Link href={`/alpha-generation?ticker=${result.ticker}`}>
              <Button variant="outline" size="sm" className="rounded-full">
                Run new backtest
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-6">

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
                    +{result.tpsl_values.target_pct?.toFixed(2)}%
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-negative" />
                <div>
                  <p className="text-sm text-muted-foreground">Stop Loss</p>
                  <p className="text-lg font-semibold text-negative">
                    -{result.tpsl_values.stop_pct?.toFixed(2)}%
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
            <div className="space-y-1 p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Total PnL</p>
              <p className={`text-2xl font-bold ${isProfitable ? 'text-positive' : 'text-negative'}`}>
                {isProfitable ? '+' : ''}{metrics.total_profit?.toFixed(2)}%
              </p>
            </div>
            <div className="space-y-1 p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Win Rate</p>
              <p className="text-2xl font-bold">{metrics.win_rate?.toFixed(1)}%</p>
            </div>
            <div className="space-y-1 p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Total Trades</p>
              <p className="text-2xl font-bold">{metrics.num_trades}</p>
            </div>
            <div className="space-y-1 p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Calmar Ratio</p>
              <p className="text-2xl font-bold">{metrics.calmar_ratio?.toFixed(2)}</p>
            </div>
            <div className="space-y-1 p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Max Drawdown</p>
              <p className="text-2xl font-bold text-negative">
                {metrics.max_dd?.toFixed(2)}%
              </p>
            </div>
            <div className="space-y-1 p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Profit Factor</p>
              <p className="text-2xl font-bold">{metrics.profit_factor?.toFixed(2)}</p>
            </div>
            <div className="space-y-1 p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Avg Return/Trade</p>
              <p className={`text-2xl font-bold ${(metrics.avg_p ?? 0) >= 0 ? 'text-positive' : 'text-negative'}`}>
                {((metrics.avg_p ?? 0) * 100).toFixed(2)}%
              </p>
            </div>
            <div className="space-y-1 p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Worst 10-Day</p>
              <p className="text-2xl font-bold text-negative">
                {((metrics.Worst_10 ?? 0) * 100).toFixed(2)}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Equity Curve Chart */}
      {equityCurveData.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Equity Curve</CardTitle>
            <CardDescription>
              Portfolio growth over time with 70/30 train/test split
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[580px]">
              <EquityCurveChart
                data={equityCurveData}
                trainEndDate={result.train_end_date || ''}
                trainEndIndex={result.train_end_index}
                maxDrawdownPoint={result.max_drawdown_point}
                metrics={metrics}
                condition={result.strategy_condition}
                title={result.name}
                showBrush
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Candlestick chart section - hidden for now, data is being saved but visualization pending */}
      </div>
    </div>
  );
}
