/**
 * Saved Results Page
 *
 * Displays user's saved screener and backtest results with ability to
 * view details, delete, and share results.
 */

import { useState } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
} from 'lucide-react';
import {
  useSavedScreenerResults,
  useSavedBacktestResults,
  useDeleteScreenerResult,
  useDeleteBacktestResult,
  useShareScreenerResult,
  useShareBacktestResult,
  SavedScreenerResult,
  SavedBacktestResult,
} from '@/hooks/use-saved-results';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

function EmptyState({ type }: { type: 'screener' | 'backtest' }) {
  const isScreener = type === 'screener';
  const Icon = isScreener ? Search : LineChart;
  const path = isScreener ? '/screener' : '/alpha-generation';
  const label = isScreener ? 'Expert Screener' : 'Alpha Generation';

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <BookmarkX className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-medium mb-2">No saved {type} results yet</h3>
      <p className="text-muted-foreground mb-6 max-w-md">
        Run a {type === 'screener' ? 'stock screen' : 'backtest'} and save the results to view them here later.
      </p>
      <Link href={path}>
        <Button>
          <Icon className="h-4 w-4 mr-2" />
          Go to {label}
        </Button>
      </Link>
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
  const [copied, setCopied] = useState(false);

  const copyShareLink = () => {
    if (result.share_token) {
      navigator.clipboard.writeText(`${window.location.origin}/shared/screener/${result.share_token}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Share link copied!');
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <Link href={`/saved-results/screener/${result.id}`}>
        <CardHeader className="pb-3 cursor-pointer">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base hover:text-primary transition-colors">
                {result.name}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 text-xs">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(result.created_at), { addSuffix: true })}
              </CardDescription>
            </div>
            <Badge variant="secondary">{result.result_count} matches</Badge>
          </div>
        </CardHeader>
        <CardContent className="cursor-pointer">
          <div className="space-y-3">
            <div className="bg-muted/50 rounded-md p-2">
              <code className="text-xs break-all">{result.expression}</code>
            </div>

            {result.execution_time_ms && (
              <p className="text-xs text-muted-foreground">
                Executed in {(result.execution_time_ms / 1000).toFixed(2)}s
              </p>
            )}

            {/* View Matches Link */}
            {result.result_count > 0 && (
              <div className="flex items-center gap-2 text-sm text-primary">
                <Eye className="h-4 w-4" />
                <span>View {result.result_count} matches</span>
                <ExternalLink className="h-3 w-3" />
              </div>
            )}
          </div>
        </CardContent>
      </Link>

      {/* Action buttons - prevent navigation when clicked */}
      <CardContent className="pt-0">
        <div className="flex items-center gap-2 pt-2 border-t">
          {result.is_shared && result.share_token ? (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                copyShareLink();
              }}
            >
              {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied ? 'Copied' : 'Copy Link'}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onShare();
              }}
            >
              <Share2 className="h-4 w-4 mr-1" />
              Share
            </Button>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={(e) => e.stopPropagation()}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete saved result?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete "{result.name}". This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} className="bg-destructive hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
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
  const [copied, setCopied] = useState(false);
  const metrics = result.metrics || {};

  const copyShareLink = () => {
    if (result.share_token) {
      navigator.clipboard.writeText(`${window.location.origin}/shared/backtest/${result.share_token}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Share link copied!');
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <Link href={`/saved-results/backtest/${result.id}`}>
        <CardHeader className="pb-3 cursor-pointer">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base hover:text-primary transition-colors">
                {result.name}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 text-xs">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(result.created_at), { addSuffix: true })}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{result.ticker}</Badge>
              <Badge variant="secondary">{result.mode}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="cursor-pointer">
          <div className="space-y-3">
            <div className="bg-muted/50 rounded-md p-2">
              <code className="text-xs break-all">{result.strategy_condition}</code>
            </div>

            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">PnL:</span>{' '}
                <span className={(metrics.total_profit ?? 0) >= 0 ? 'text-positive' : 'text-negative'}>
                  {metrics.total_profit?.toFixed(2)}%
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Win Rate:</span>{' '}
                <span>{metrics.win_rate?.toFixed(1)}%</span>
              </div>
              <div>
                <span className="text-muted-foreground">Trades:</span>{' '}
                <span>{metrics.num_trades}</span>
              </div>
            </div>

            {/* View Details Link */}
            <div className="flex items-center gap-2 text-sm text-primary">
              <Eye className="h-4 w-4" />
              <span>View full results</span>
              <ExternalLink className="h-3 w-3" />
            </div>
          </div>
        </CardContent>
      </Link>

      {/* Action buttons - prevent navigation when clicked */}
      <CardContent className="pt-0">
        <div className="flex items-center gap-2 pt-2 border-t">
          {result.is_shared && result.share_token ? (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                copyShareLink();
              }}
            >
              {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied ? 'Copied' : 'Copy Link'}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onShare();
              }}
            >
              <Share2 className="h-4 w-4 mr-1" />
              Share
            </Button>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={(e) => e.stopPropagation()}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete saved result?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete "{result.name}". This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} className="bg-destructive hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SavedResults() {
  const [activeTab, setActiveTab] = useState('screener');

  // Screener hooks
  const { data: screenerData, isLoading: screenerLoading } = useSavedScreenerResults();
  const deleteScreenerMutation = useDeleteScreenerResult();
  const shareScreenerMutation = useShareScreenerResult();

  // Backtest hooks
  const { data: backtestData, isLoading: backtestLoading } = useSavedBacktestResults();
  const deleteBacktestMutation = useDeleteBacktestResult();
  const shareBacktestMutation = useShareBacktestResult();

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

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4">
      <div className="mb-8 space-y-2">
        <Eyebrow tone="gold" rule>
          Library
        </Eyebrow>
        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
          Saved Results
        </h1>
        <p className="text-muted-foreground">
          View and manage your saved screener and backtest results
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="screener" className="gap-2">
            <Search className="h-4 w-4" />
            Screener Results
            {screenerData?.total ? (
              <Badge variant="secondary" className="ml-1">
                {screenerData.total}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="backtest" className="gap-2">
            <LineChart className="h-4 w-4" />
            Backtest Results
            {backtestData?.total ? (
              <Badge variant="secondary" className="ml-1">
                {backtestData.total}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="screener">
          {screenerLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
      </Tabs>
    </div>
  );
}
