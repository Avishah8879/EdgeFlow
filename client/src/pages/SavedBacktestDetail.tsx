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
import { Badge } from '@/components/ui/badge';
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
  LineChart,
} from 'lucide-react';
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
      <div className="container max-w-6xl mx-auto py-8 px-4">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="container max-w-6xl mx-auto py-8 px-4">
        <div className="text-center py-16">
          <h2 className="text-xl font-semibold mb-2">Result not found</h2>
          <p className="text-muted-foreground mb-4">
            The backtest result you're looking for doesn't exist or you don't have access to it.
          </p>
          <Link href="/saved-results">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Saved Results
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
    <div className="container max-w-6xl mx-auto py-8 px-4">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        onClick={() => navigate('/saved-results')}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Saved Results
      </Button>

      {/* Header Card */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <LineChart className="h-6 w-6 text-primary" />
                <CardTitle>{result.name}</CardTitle>
              </div>
              <CardDescription className="flex items-center gap-2">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(result.created_at), { addSuffix: true })}
                {result.execution_time_ms && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <span>Optimized in {(result.execution_time_ms / 1000).toFixed(2)}s</span>
                  </>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-base px-3 py-1">{result.ticker}</Badge>
              <Badge variant="secondary" className="text-base px-3 py-1">{result.mode}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Strategy Condition</label>
              <div className="bg-muted/50 rounded-md p-3 mt-1">
                <code className="text-sm break-all">{result.strategy_condition}</code>
              </div>
            </div>

            {result.custom_rules && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Custom Rules</label>
                <div className="bg-muted/50 rounded-md p-3 mt-1">
                  <code className="text-sm break-all">{result.custom_rules}</code>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              {result.is_shared && result.share_token ? (
                <Button variant="outline" size="sm" onClick={copyShareLink}>
                  {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                  {copied ? 'Copied' : 'Copy Share Link'}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShare}
                  disabled={shareBacktestMutation.isPending}
                >
                  {shareBacktestMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Share2 className="h-4 w-4 mr-1" />
                  )}
                  Share
                </Button>
              )}
              <Link href={`/alpha-generation?ticker=${result.ticker}`}>
                <Button variant="outline" size="sm">
                  Run New Backtest
                </Button>
              </Link>
            </div>
          </div>
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
  );
}
