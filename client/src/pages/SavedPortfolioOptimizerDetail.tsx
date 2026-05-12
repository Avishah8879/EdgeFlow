import { Link, useParams } from 'wouter';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronRight, Clock, Home, Loader2 } from 'lucide-react';
import { useSavedPortfolioOptimizerResult } from '@/hooks/use-saved-results';
import { formatDistanceToNow } from 'date-fns';
import { Eyebrow } from '@/components/ui/eyebrow';
import { OptimizationResults } from '@/components/ft/PortfolioOptimizerPanel';

export default function SavedPortfolioOptimizerDetail() {
  const params = useParams();
  const resultId = params.id as string;
  const { data: saved, isLoading, error } = useSavedPortfolioOptimizerResult(resultId);

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto py-16 px-4">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--brand-gold))]" />
        </div>
      </div>
    );
  }

  if (error || !saved || !saved.result) {
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

  const holdings = Array.isArray(saved.holdings) ? saved.holdings : [];

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
            <span className="text-foreground font-medium truncate max-w-[200px]">{saved.name}</span>
          </nav>

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1.5 min-w-0">
              <Eyebrow tone="gold" rule>
                Saved portfolio optimizer
              </Eyebrow>
              <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
                {saved.name}
              </h1>
              <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(saved.created_at), { addSuffix: true })}
                {saved.execution_time_ms && (
                  <>
                    <span>·</span>
                    <span>Computed in {(saved.execution_time_ms / 1000).toFixed(2)}s</span>
                  </>
                )}
              </p>
            </div>
            <span className="font-mono text-sm font-bold uppercase tracking-uppercase px-3 py-1.5 rounded-full bg-muted text-muted-foreground tabular-nums">
              {holdings.length} holdings
            </span>
          </div>

          {holdings.length > 0 && (
            <div className="rounded-md bg-muted/40 p-3 mt-5">
              <code className="text-[12.5px] font-mono break-all text-foreground">
                {holdings.map((h: any) => `${h.symbol} ${h.quantity}%`).join(' · ')}
              </code>
            </div>
          )}
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <OptimizationResults result={saved.result} />
        </div>
      </div>
    </div>
  );
}
