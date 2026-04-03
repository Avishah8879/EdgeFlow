/**
 * Saved Screener Detail Page
 *
 * Displays full details of a saved screener result including
 * all matching symbols with pagination.
 */

import { useState } from 'react';
import { Link, useParams, useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  Clock,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Share2,
  ExternalLink,
} from 'lucide-react';
import {
  useSavedScreenerResult,
  useShareScreenerResult,
} from '@/hooks/use-saved-results';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const ITEMS_PER_PAGE = 20;

export default function SavedScreenerDetail() {
  const params = useParams();
  const [, navigate] = useLocation();
  const resultId = params.id as string;

  const [currentPage, setCurrentPage] = useState(1);
  const [copied, setCopied] = useState(false);

  const { data: result, isLoading, error } = useSavedScreenerResult(resultId);
  const shareScreenerMutation = useShareScreenerResult();

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
            The screener result you're looking for doesn't exist or you don't have access to it.
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

  const matchingSymbols = result.matching_symbols || [];
  const totalPages = Math.ceil(matchingSymbols.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentPageSymbols = matchingSymbols.slice(startIndex, endIndex);

  // Get all indicator columns from the first result
  const indicatorKeys = matchingSymbols.length > 0 && matchingSymbols[0]?.indicators
    ? Object.keys(matchingSymbols[0].indicators)
    : [];

  const copyShareLink = () => {
    if (result.share_token) {
      navigator.clipboard.writeText(`${window.location.origin}/shared/screener/${result.share_token}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Share link copied!');
    }
  };

  const handleShare = async () => {
    try {
      await shareScreenerMutation.mutateAsync(resultId);
      toast.success('Share link generated');
    } catch (error: any) {
      toast.error(error.message || 'Failed to share');
    }
  };

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
              <CardTitle>{result.name}</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(result.created_at), { addSuffix: true })}
                {result.execution_time_ms && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <span>Executed in {(result.execution_time_ms / 1000).toFixed(2)}s</span>
                  </>
                )}
              </CardDescription>
            </div>
            <Badge variant="secondary" className="text-lg px-3 py-1">
              {result.result_count} matches
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Expression</label>
              <div className="bg-muted/50 rounded-md p-3 mt-1">
                <code className="text-sm break-all">{result.expression}</code>
              </div>
            </div>

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
                  disabled={shareScreenerMutation.isPending}
                >
                  {shareScreenerMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Share2 className="h-4 w-4 mr-1" />
                  )}
                  Share
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      {matchingSymbols.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Matching Stocks</CardTitle>
              <div className="text-sm text-muted-foreground">
                Showing {startIndex + 1}-{Math.min(endIndex, matchingSymbols.length)} of {matchingSymbols.length}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-28 font-semibold">Symbol</TableHead>
                      {indicatorKeys.map((key) => (
                        <TableHead key={key} className="text-right font-semibold">
                          {key.toUpperCase()}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentPageSymbols.map((item: any) => (
                      <TableRow key={item.symbol} className="hover:bg-muted/30">
                        <TableCell className="font-medium">
                          <Link
                            href={`/stocks/${item.symbol}`}
                            className="hover:underline text-primary flex items-center gap-1"
                          >
                            {item.symbol}
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </TableCell>
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
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>

                <div className="flex items-center gap-2">
                  {/* Page numbers */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? 'default' : 'outline'}
                        size="sm"
                        className="w-8 h-8 p-0"
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No matching symbols data available
          </CardContent>
        </Card>
      )}
    </div>
  );
}
