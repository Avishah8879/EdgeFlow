import { useState } from 'react';
import { Link, useParams } from 'wouter';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowLeft, ChevronLeft, ChevronRight, Clock, Home, Loader2 } from 'lucide-react';
import { useSavedFundamentalScreenerResult } from '@/hooks/use-saved-results';
import { formatDistanceToNow } from 'date-fns';
import { Eyebrow } from '@/components/ui/eyebrow';

const ITEMS_PER_PAGE = 20;

function formatValue(value: unknown): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  if (Math.abs(n) >= 1000) {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
  }
  return n.toFixed(2);
}

export default function SavedFundamentalScreenerDetail() {
  const params = useParams();
  const resultId = params.id as string;
  const [currentPage, setCurrentPage] = useState(1);

  const { data: result, isLoading, error } = useSavedFundamentalScreenerResult(resultId);

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

  const matchingSymbols = result.matching_symbols || [];
  const totalPages = Math.ceil(matchingSymbols.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentPageSymbols = matchingSymbols.slice(startIndex, endIndex);
  const fundamentalKeys =
    matchingSymbols.length > 0 && matchingSymbols[0]?.fundamentals
      ? Object.keys(matchingSymbols[0].fundamentals)
      : [];

  return (
    <div className="min-h-screen bg-background">
      <section className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
            <Link href="/home" className="hover:text-foreground transition-colors flex items-center gap-1">
              <Home className="w-3 h-3" /> Home
            </Link>
            <ChevronRight className="w-3 h-3 opacity-40" />
            <Link href="/saved-results" className="hover:text-foreground transition-colors">
              Saved results
            </Link>
            <ChevronRight className="w-3 h-3 opacity-40" />
            <span className="text-foreground font-medium truncate max-w-[200px]">{result.name}</span>
          </nav>

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1.5 min-w-0">
              <Eyebrow tone="gold" rule>
                Saved fundamental scanner
              </Eyebrow>
              <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
                {result.name}
              </h1>
              <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(result.created_at), { addSuffix: true })}
                {result.execution_time_ms && (
                  <>
                    <span>·</span>
                    <span>Executed in {(result.execution_time_ms / 1000).toFixed(2)}s</span>
                  </>
                )}
              </p>
            </div>
            <span className="font-mono text-sm font-bold uppercase tracking-uppercase px-3 py-1.5 rounded-full bg-[hsl(var(--brand-gold))]/15 text-[hsl(var(--brand-gold))] tabular-nums">
              {result.result_count} matches
            </span>
          </div>

          <div className="rounded-md bg-muted/40 p-3 mt-5">
            <code className="text-[12.5px] font-mono break-all text-foreground">
              {result.expression}
            </code>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8">
        {matchingSymbols.length > 0 ? (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-display text-base font-bold text-[hsl(var(--brand-navy))] dark:text-foreground">
                Matching stocks
              </h2>
              <div className="text-xs text-muted-foreground font-mono tabular-nums">
                {startIndex + 1}-{Math.min(endIndex, matchingSymbols.length)} of {matchingSymbols.length}
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Symbol</TableHead>
                    <TableHead>Sector</TableHead>
                    {fundamentalKeys.map((key) => (
                      <TableHead key={key} className="text-right">
                        {key.toUpperCase()}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentPageSymbols.map((item: any) => (
                    <TableRow key={item.symbol}>
                      <TableCell className="font-mono font-bold text-[hsl(var(--brand-gold))]">
                        {item.symbol}
                      </TableCell>
                      <TableCell>{item.sector || '—'}</TableCell>
                      {fundamentalKeys.map((key) => (
                        <TableCell key={key} className="text-right font-mono tabular-nums text-[12.5px]">
                          {formatValue(item.fundamentals?.[key])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <div className="text-xs text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card py-12 text-center text-muted-foreground">
            No matching symbols data available
          </div>
        )}
      </div>
    </div>
  );
}
