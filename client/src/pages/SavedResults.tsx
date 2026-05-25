/**
 * Saved Results Page
 *
 * Displays user's saved screener and backtest results with ability to
 * view details, delete, and share results.
 */

import { useState } from 'react';
import { Link } from 'wouter';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Search,
  LineChart,
  Trash2,
  Share2,
  Clock,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  BookmarkX,
  Eye,
  PlayCircle,
} from 'lucide-react';
import {
  useSavedScreenerResults,
  useSavedBacktestResults,
  useSavedFundamentalScreenerResults,
  useSavedPortfolioOptimizerResults,
  useDeleteScreenerResult,
  useDeleteBacktestResult,
  useDeleteFundamentalScreenerResult,
  useDeletePortfolioOptimizerResult,
  useShareScreenerResult,
  useShareBacktestResult,
  useShareFundamentalScreenerResult,
  useSharePortfolioOptimizerResult,
  SavedScreenerResult,
  SavedBacktestResult,
  SavedFundamentalScreenerResult,
  SavedPortfolioOptimizerResult,
} from '@/hooks/use-saved-results';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

function EmptyState({ type }: { type: 'screener' | 'backtest' }) {
  const isScreener = type === 'screener';
  const Icon = isScreener ? Search : LineChart;
  const path = isScreener ? '/screener' : '/alpha-generation';
  const label = isScreener ? 'Expert Screener' : 'Alpha Generation';

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-border bg-card">
      <div className="h-14 w-14 rounded-full bg-muted/50 flex items-center justify-center mb-4">
        <BookmarkX className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="font-display text-lg font-bold text-[hsl(var(--brand-navy))] dark:text-foreground mb-2">
        No saved {type} results yet
      </h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-md">
        Run a {type === 'screener' ? 'stock screen' : 'backtest'} and save the
        results to view them here later.
      </p>
      <Link href={path}>
        <Button className="rounded-full bg-[hsl(var(--brand-navy))] text-white hover:bg-[hsl(var(--brand-navy))]/90">
          <Icon className="h-4 w-4 mr-2" />
          Go to {label}
        </Button>
      </Link>
    </div>
  );
}

function ResultCard({
  title,
  subtitle,
  meta,
  expression,
  bodyExtras,
  detailHref,
  isShared,
  shareToken,
  shareTokenPath,
  runHref,
  onDelete,
  onShare,
}: {
  title: string;
  subtitle: string;
  meta: React.ReactNode;
  expression: string;
  bodyExtras?: React.ReactNode;
  detailHref: string;
  isShared: boolean;
  shareToken: string | undefined;
  shareTokenPath: string;
  runHref?: string;
  onDelete: () => void;
  onShare: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyShareLink = () => {
    if (shareToken) {
      navigator.clipboard.writeText(
        `${window.location.origin}${shareTokenPath}/${shareToken}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Share link copied!');
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card hover:shadow-card transition-shadow duration-base flex flex-col">
      <Link href={detailHref}>
        <div className="p-5 cursor-pointer flex-1">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0 space-y-1">
              <h3 className="font-display text-base font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground hover:text-[hsl(var(--brand-gold))] transition-colors truncate">
                {title}
              </h3>
              <p className="text-[11.5px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {subtitle}
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1.5">{meta}</div>
          </div>

          <div className="rounded-md bg-muted/40 p-2.5 mb-3">
            <code className="text-[11.5px] font-mono break-all text-foreground">
              {expression}
            </code>
          </div>

          {bodyExtras}

          <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--brand-gold))] font-semibold mt-3">
            <Eye className="h-3.5 w-3.5" />
            View details
            <ExternalLink className="h-3 w-3" />
          </div>
        </div>
      </Link>

      <div className="border-t border-border p-3 flex items-center gap-2">
        {isShared && shareToken ? (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              copyShareLink();
            }}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 mr-1.5" />
            ) : (
              <Copy className="h-3.5 w-3.5 mr-1.5" />
            )}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onShare();
            }}
          >
            <Share2 className="h-3.5 w-3.5 mr-1.5" />
            Share
          </Button>
        )}

        {runHref && (
          <Link href={runHref}>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full text-[hsl(var(--brand-gold))] hover:text-[hsl(var(--brand-gold))] hover:border-[hsl(var(--brand-gold)/0.45)]"
              onClick={(e) => e.stopPropagation()}
            >
              <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
              Run
            </Button>
          </Link>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full text-destructive hover:text-destructive hover:border-destructive/40"
              onClick={(e) => e.stopPropagation()}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete saved result?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{title}". This action cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function ScreenerResultCard({
  result,
  onDelete,
  onShare,
}: {
  result: SavedScreenerResult;
  onDelete: () => void;
  onShare: () => void;
}) {
  return (
    <ResultCard
      title={result.name}
      subtitle={formatDistanceToNow(new Date(result.created_at), {
        addSuffix: true,
      })}
      meta={
        <span className="text-[10.5px] font-bold uppercase tracking-uppercase px-2 py-1 rounded-full bg-[hsl(var(--brand-gold))]/15 text-[hsl(var(--brand-gold))]">
          <span className="font-mono tabular-nums">{result.result_count}</span>{' '}
          matches
        </span>
      }
      expression={result.expression}
      bodyExtras={
        result.execution_time_ms ? (
          <p className="text-[11px] text-muted-foreground">
            Executed in{' '}
            <span className="font-mono tabular-nums">
              {(result.execution_time_ms / 1000).toFixed(2)}s
            </span>
          </p>
        ) : null
      }
      detailHref={`/saved-results/screener/${result.id}`}
      isShared={result.is_shared}
      shareToken={result.share_token}
      shareTokenPath="/shared/screener"
      runHref={`/screener?expr=${encodeURIComponent(result.expression)}&autorun=1`}
      onDelete={onDelete}
      onShare={onShare}
    />
  );
}

function BacktestResultCard({
  result,
  onDelete,
  onShare,
}: {
  result: SavedBacktestResult;
  onDelete: () => void;
  onShare: () => void;
}) {
  const metrics = result.metrics || {};
  const totalProfit = metrics.total_profit ?? 0;

  return (
    <ResultCard
      title={result.name}
      subtitle={formatDistanceToNow(new Date(result.created_at), {
        addSuffix: true,
      })}
      meta={
        <>
          <span className="text-[10.5px] font-bold uppercase tracking-uppercase px-2 py-1 rounded-full bg-muted text-muted-foreground font-mono">
            {result.ticker}
          </span>
          <span className="text-[10.5px] font-bold uppercase tracking-uppercase px-2 py-1 rounded-full bg-muted/50 text-muted-foreground">
            {result.mode}
          </span>
        </>
      }
      expression={result.strategy_condition}
      bodyExtras={
        <div className="grid grid-cols-3 gap-3 text-xs pt-1">
          <div>
            <div className="text-[10.5px] uppercase tracking-uppercase font-bold text-muted-foreground">
              PnL
            </div>
            <div
              className={cn(
                'font-mono font-bold tabular-nums mt-0.5',
                totalProfit >= 0 ? 'text-positive' : 'text-negative',
              )}
            >
              {totalProfit >= 0 ? '+' : ''}
              {totalProfit.toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-uppercase font-bold text-muted-foreground">
              Win rate
            </div>
            <div className="font-mono font-bold tabular-nums mt-0.5 text-foreground">
              {metrics.win_rate?.toFixed(1) ?? '—'}%
            </div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-uppercase font-bold text-muted-foreground">
              Trades
            </div>
            <div className="font-mono font-bold tabular-nums mt-0.5 text-foreground">
              {metrics.num_trades ?? '—'}
            </div>
          </div>
        </div>
      }
      detailHref={`/saved-results/backtest/${result.id}`}
      isShared={result.is_shared}
      shareToken={result.share_token}
      shareTokenPath="/shared/backtest"
      runHref="/alpha-generation"
      onDelete={onDelete}
      onShare={onShare}
    />
  );
}

function FundamentalResultCard({
  result,
  onDelete,
  onShare,
}: {
  result: SavedFundamentalScreenerResult;
  onDelete: () => void;
  onShare: () => void;
}) {
  return (
    <ResultCard
      title={result.name}
      subtitle={formatDistanceToNow(new Date(result.created_at), {
        addSuffix: true,
      })}
      meta={
        <span className="text-[10.5px] font-bold uppercase tracking-uppercase px-2 py-1 rounded-full bg-[hsl(var(--brand-gold))]/15 text-[hsl(var(--brand-gold))]">
          <span className="font-mono tabular-nums">{result.result_count}</span>{' '}
          matches
        </span>
      }
      expression={result.expression}
      bodyExtras={
        result.execution_time_ms ? (
          <p className="text-[11px] text-muted-foreground">
            Executed in{' '}
            <span className="font-mono tabular-nums">
              {(result.execution_time_ms / 1000).toFixed(2)}s
            </span>
          </p>
        ) : null
      }
      detailHref={`/saved-results/fundamental-screener/${result.id}`}
      isShared={result.is_shared}
      shareToken={result.share_token}
      shareTokenPath="/shared/fundamental-screener"
      runHref={`/equity-screener?expr=${encodeURIComponent(result.expression)}&autorun=1`}
      onDelete={onDelete}
      onShare={onShare}
    />
  );
}

function PortfolioResultCard({
  result,
  onDelete,
  onShare,
}: {
  result: SavedPortfolioOptimizerResult;
  onDelete: () => void;
  onShare: () => void;
}) {
  const holdings = Array.isArray(result.holdings) ? result.holdings : [];
  const expression = holdings.map((h: any) => `${h.symbol} ${h.quantity}%`).join(' · ');

  return (
    <ResultCard
      title={result.name}
      subtitle={formatDistanceToNow(new Date(result.created_at), {
        addSuffix: true,
      })}
      meta={
        <span className="text-[10.5px] font-bold uppercase tracking-uppercase px-2 py-1 rounded-full bg-muted text-muted-foreground">
          <span className="font-mono tabular-nums">{holdings.length}</span>{' '}
          holdings
        </span>
      }
      expression={expression || 'Portfolio optimizer run'}
      bodyExtras={
        result.execution_time_ms ? (
          <p className="text-[11px] text-muted-foreground">
            Computed in{' '}
            <span className="font-mono tabular-nums">
              {(result.execution_time_ms / 1000).toFixed(2)}s
            </span>
          </p>
        ) : null
      }
      detailHref={`/saved-results/portfolio-optimizer/${result.id}`}
      isShared={result.is_shared}
      shareToken={result.share_token}
      shareTokenPath="/shared/portfolio-optimizer"
      runHref={`/portfolio-optimizer?holdings=${encodeURIComponent(JSON.stringify(holdings))}&autorun=1`}
      onDelete={onDelete}
      onShare={onShare}
    />
  );
}

export default function SavedResults() {
  const [activeTab, setActiveTab] = useState('screener');

  // Screener hooks
  const { data: screenerData, isLoading: screenerLoading } =
    useSavedScreenerResults();
  const deleteScreenerMutation = useDeleteScreenerResult();
  const shareScreenerMutation = useShareScreenerResult();

  // Backtest hooks
  const { data: backtestData, isLoading: backtestLoading } =
    useSavedBacktestResults();
  const deleteBacktestMutation = useDeleteBacktestResult();
  const shareBacktestMutation = useShareBacktestResult();

  // Fundamental scanner hooks
  const { data: fundamentalData, isLoading: fundamentalLoading } =
    useSavedFundamentalScreenerResults();
  const deleteFundamentalMutation = useDeleteFundamentalScreenerResult();
  const shareFundamentalMutation = useShareFundamentalScreenerResult();

  // Portfolio optimizer hooks
  const { data: portfolioData, isLoading: portfolioLoading } =
    useSavedPortfolioOptimizerResults();
  const deletePortfolioMutation = useDeletePortfolioOptimizerResult();
  const sharePortfolioMutation = useSharePortfolioOptimizerResult();

  const handleDeleteScreener = async (id: string) => {
    try {
      await deleteScreenerMutation.mutateAsync(id);
      toast.success('Result deleted');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
    }
  };

  const handleShareScreener = async (id: string) => {
    try {
      await shareScreenerMutation.mutateAsync(id);
      toast.success('Share link generated');
    } catch (error: any) {
      toast.error(error.message || 'Failed to share');
    }
  };

  const handleDeleteBacktest = async (id: string) => {
    try {
      await deleteBacktestMutation.mutateAsync(id);
      toast.success('Result deleted');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
    }
  };

  const handleShareBacktest = async (id: string) => {
    try {
      await shareBacktestMutation.mutateAsync(id);
      toast.success('Share link generated');
    } catch (error: any) {
      toast.error(error.message || 'Failed to share');
    }
  };

  const handleDeleteFundamental = async (id: string) => {
    try {
      await deleteFundamentalMutation.mutateAsync(id);
      toast.success('Result deleted');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
    }
  };

  const handleShareFundamental = async (id: string) => {
    try {
      await shareFundamentalMutation.mutateAsync(id);
      toast.success('Share link generated');
    } catch (error: any) {
      toast.error(error.message || 'Failed to share');
    }
  };

  const handleDeletePortfolio = async (id: string) => {
    try {
      await deletePortfolioMutation.mutateAsync(id);
      toast.success('Result deleted');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
    }
  };

  const handleSharePortfolio = async (id: string) => {
    try {
      await sharePortfolioMutation.mutateAsync(id);
      toast.success('Share link generated');
    } catch (error: any) {
      toast.error(error.message || 'Failed to share');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Page masthead */}
      <section className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-10">
          <div className="space-y-2">
            <Eyebrow tone="gold" rule>
              Library
            </Eyebrow>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
              Saved results.
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              View and manage your saved screener runs and strategy backtests.
            </p>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-10">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="screener" className="gap-2">
              <Search className="h-4 w-4" />
              Screener
              {screenerData?.total ? (
                <span className="ml-1 px-1.5 rounded-full bg-muted text-xs font-mono tabular-nums">
                  {screenerData.total}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="backtest" className="gap-2">
              <LineChart className="h-4 w-4" />
              Backtest
              {backtestData?.total ? (
                <span className="ml-1 px-1.5 rounded-full bg-muted text-xs font-mono tabular-nums">
                  {backtestData.total}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="fundamental" className="gap-2">
              <Search className="h-4 w-4" />
              Fundamental
              {fundamentalData?.total ? (
                <span className="ml-1 px-1.5 rounded-full bg-muted text-xs font-mono tabular-nums">
                  {fundamentalData.total}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="portfolio" className="gap-2">
              <LineChart className="h-4 w-4" />
              Portfolio
              {portfolioData?.total ? (
                <span className="ml-1 px-1.5 rounded-full bg-muted text-xs font-mono tabular-nums">
                  {portfolioData.total}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="screener">
            {screenerLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--brand-gold))]" />
              </div>
            ) : screenerData?.results.length === 0 ? (
              <EmptyState type="screener" />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {screenerData?.results.map((result) => (
                  <ScreenerResultCard
                    key={result.id}
                    result={result}
                    onDelete={() => handleDeleteScreener(result.id)}
                    onShare={() => handleShareScreener(result.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="backtest">
            {backtestLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--brand-gold))]" />
              </div>
            ) : backtestData?.results.length === 0 ? (
              <EmptyState type="backtest" />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {backtestData?.results.map((result) => (
                  <BacktestResultCard
                    key={result.id}
                    result={result}
                    onDelete={() => handleDeleteBacktest(result.id)}
                    onShare={() => handleShareBacktest(result.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="fundamental">
            {fundamentalLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--brand-gold))]" />
              </div>
            ) : fundamentalData?.results.length === 0 ? (
              <EmptyState type="screener" />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {fundamentalData?.results.map((result) => (
                  <FundamentalResultCard
                    key={result.id}
                    result={result}
                    onDelete={() => handleDeleteFundamental(result.id)}
                    onShare={() => handleShareFundamental(result.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="portfolio">
            {portfolioLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--brand-gold))]" />
              </div>
            ) : portfolioData?.results.length === 0 ? (
              <EmptyState type="backtest" />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {portfolioData?.results.map((result) => (
                  <PortfolioResultCard
                    key={result.id}
                    result={result}
                    onDelete={() => handleDeletePortfolio(result.id)}
                    onShare={() => handleSharePortfolio(result.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
