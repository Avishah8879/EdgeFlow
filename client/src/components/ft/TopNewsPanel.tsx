import { useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  RefreshCcw,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  Clock,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

// ─── Types ───────────────────────────────────────────────────────────────────
interface NewsArticle {
  id: string;
  headline: string;
  summary: string;
  source: string;
  timestamp: string;
  tickers: string[];
  sentiment: 'bullish' | 'bearish' | 'neutral';
  category: 'market' | 'earnings' | 'ma' | 'economic' | 'general';
  importance: 'high' | 'medium' | 'low';
}

type Filter =
  | 'all'
  | 'market'
  | 'earnings'
  | 'ma'
  | 'economic'
  | 'general'
  | 'bullish'
  | 'bearish';

const FILTER_CHIPS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All news' },
  { id: 'market', label: 'Market' },
  { id: 'earnings', label: 'Earnings' },
  { id: 'ma', label: 'M&A' },
  { id: 'economic', label: 'Economic' },
  { id: 'general', label: 'General' },
  { id: 'bullish', label: 'Bullish' },
  { id: 'bearish', label: 'Bearish' },
];

// 5-color rotating gradient for thumbnails (no real images in API)
const THUMB_GRADIENTS = [
  'linear-gradient(135deg, hsl(212 51% 24%) 0%, hsl(212 60% 35%) 100%)', // navy
  'linear-gradient(135deg, hsl(38 56% 53%) 0%, hsl(38 70% 65%) 100%)',   // gold
  'linear-gradient(135deg, hsl(150 50% 35%) 0%, hsl(150 60% 45%) 100%)', // green
  'linear-gradient(135deg, hsl(0 60% 50%) 0%, hsl(0 70% 60%) 100%)',     // red
  'linear-gradient(135deg, hsl(280 40% 50%) 0%, hsl(280 50% 60%) 100%)', // purple
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const sentimentIcon = {
  bullish: <TrendingUp className="w-3 h-3" />,
  bearish: <TrendingDown className="w-3 h-3" />,
  neutral: <Minus className="w-3 h-3" />,
};

const sentimentTone = {
  bullish: 'text-positive',
  bearish: 'text-negative',
  neutral: 'text-muted-foreground',
};

const categoryLabels: Record<NewsArticle['category'], string> = {
  market: 'Market',
  earnings: 'Earnings',
  ma: 'M&A',
  economic: 'Economic',
  general: 'General',
};

function formatTimestamp(ts: string): string {
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true });
  } catch {
    return ts;
  }
}

function gradientForId(id: string, idx: number): string {
  // Stable mapping: hash id to a color slot, fall back to index
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const slot = Math.abs(hash + idx) % THUMB_GRADIENTS.length;
  return THUMB_GRADIENTS[slot];
}

// ─── Featured article card (large, top of list) ──────────────────────────────
function FeaturedCard({ article }: { article: NewsArticle }) {
  return (
    <article className="rounded-xl border border-border bg-card overflow-hidden hover:shadow-card transition-shadow cursor-pointer group">
      <div
        className="h-[180px] md:h-[220px] w-full relative"
        style={{ background: gradientForId(article.id, 0) }}
      >
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className="text-[10.5px] font-bold uppercase tracking-uppercase px-2 py-1 rounded-full bg-white/15 backdrop-blur-sm text-white border border-white/20">
            Featured · {categoryLabels[article.category]}
          </span>
          {article.importance === 'high' && (
            <span className="text-[10px] font-bold uppercase tracking-uppercase px-1.5 py-0.5 rounded bg-[hsl(var(--brand-gold))] text-white">
              High
            </span>
          )}
        </div>
      </div>
      <div className="p-5">
        <h2 className="font-display text-xl md:text-2xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground leading-snug group-hover:text-[hsl(var(--brand-gold))] transition-colors">
          {article.headline}
        </h2>
        {article.summary && (
          <p className="text-sm text-muted-foreground mt-2.5 leading-relaxed line-clamp-2">
            {article.summary}
          </p>
        )}
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <span className="text-[11px] font-bold uppercase tracking-uppercase text-foreground">
            {article.source}
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-uppercase',
              sentimentTone[article.sentiment],
            )}
          >
            {sentimentIcon[article.sentiment]}
            {article.sentiment}
          </span>
          {article.tickers.slice(0, 3).map((t) => (
            <span
              key={t}
              className="text-[10.5px] font-mono font-bold px-1.5 py-0.5 rounded bg-[hsl(var(--brand-gold))]/10 text-[hsl(var(--brand-gold))]"
            >
              ${t}
            </span>
          ))}
          <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono ml-auto">
            <Clock className="w-3 h-3" />
            {formatTimestamp(article.timestamp)}
          </span>
        </div>
      </div>
    </article>
  );
}

// ─── Standard story card ─────────────────────────────────────────────────────
function StoryCard({ article, idx }: { article: NewsArticle; idx: number }) {
  return (
    <article className="rounded-xl border border-border bg-card overflow-hidden hover:shadow-card transition-shadow cursor-pointer group flex">
      <div
        className="w-[100px] sm:w-[120px] flex-shrink-0 relative"
        style={{ background: gradientForId(article.id, idx) }}
      >
        {article.importance === 'high' && (
          <span className="absolute top-2 left-2 text-[9px] font-bold uppercase tracking-uppercase px-1.5 py-0.5 rounded bg-[hsl(var(--brand-gold))] text-white">
            High
          </span>
        )}
      </div>
      <div className="p-4 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <span className="text-[9.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
            {categoryLabels[article.category]}
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-uppercase flex-shrink-0',
              sentimentTone[article.sentiment],
            )}
          >
            {sentimentIcon[article.sentiment]}
            {article.sentiment}
          </span>
        </div>
        <h3 className="font-display text-[15px] font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground leading-snug group-hover:text-[hsl(var(--brand-gold))] transition-colors line-clamp-2">
          {article.headline}
        </h3>
        {article.summary && (
          <p className="text-[12px] text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">
            {article.summary}
          </p>
        )}
        <div className="flex items-center gap-2.5 mt-2.5 flex-wrap">
          <span className="text-[10.5px] font-bold uppercase tracking-uppercase text-foreground">
            {article.source}
          </span>
          {article.tickers.slice(0, 2).map((t) => (
            <span
              key={t}
              className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-muted text-foreground"
            >
              ${t}
            </span>
          ))}
          <span className="text-[10.5px] text-muted-foreground flex items-center gap-1 font-mono ml-auto">
            <Clock className="w-3 h-3" />
            {formatTimestamp(article.timestamp)}
          </span>
        </div>
      </div>
    </article>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────
export function TopNewsPanel() {
  const [filter, setFilter] = useState<Filter>('all');

  const { data: newsData = [], isLoading, error, refetch, isFetching } =
    useQuery<NewsArticle[]>({
      queryKey: ['/api/news/top'],
      refetchInterval: 5 * 60 * 1000,
      staleTime: 2 * 60 * 1000,
      select: (raw: any): NewsArticle[] => {
        const arr = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.data)
            ? raw.data
            : [];
        return arr.map(
          (item: any, i: number): NewsArticle => ({
            id: item.id ?? String(i),
            headline: item.headline ?? item.title ?? '',
            summary: item.summary ?? item.description ?? '',
            source: item.source ?? item.source_name ?? 'Unknown',
            timestamp:
              item.timestamp ??
              item.published_at ??
              item.date ??
              new Date().toISOString(),
            tickers: item.tickers ?? [],
            sentiment: item.sentiment ?? 'neutral',
            category: item.category ?? 'general',
            importance: item.importance ?? 'medium',
          }),
        );
      },
    });

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // Apply filter
  const filtered = useMemo(() => {
    if (filter === 'all') return newsData;
    if (filter === 'bullish' || filter === 'bearish')
      return newsData.filter((a) => a.sentiment === filter);
    return newsData.filter((a) => a.category === filter);
  }, [newsData, filter]);

  // Pick featured article — highest-importance, most-recent
  const featured = useMemo(() => {
    if (filtered.length === 0) return null;
    const ranked = [...filtered].sort((a, b) => {
      const wa = a.importance === 'high' ? 2 : a.importance === 'medium' ? 1 : 0;
      const wb = b.importance === 'high' ? 2 : b.importance === 'medium' ? 1 : 0;
      if (wb !== wa) return wb - wa;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
    return ranked[0];
  }, [filtered]);

  const stories = useMemo(() => {
    if (!featured) return filtered;
    return filtered.filter((a) => a.id !== featured.id);
  }, [filtered, featured]);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-4 bg-background">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Failed to load news</p>
          <Button size="sm" variant="outline" onClick={handleRefresh} className="mt-2">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-background overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-4">
        {/* Filter chips + refresh */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTER_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setFilter(chip.id)}
                className={cn(
                  'h-8 px-3.5 text-[11.5px] font-bold rounded-full border transition-colors whitespace-nowrap',
                  filter === chip.id
                    ? 'bg-[hsl(var(--brand-navy))] text-white border-[hsl(var(--brand-navy))] dark:bg-[hsl(var(--brand-gold))] dark:text-[hsl(var(--brand-navy))] dark:border-[hsl(var(--brand-gold))]'
                    : 'bg-card border-border text-muted-foreground hover:bg-muted',
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={handleRefresh}
            disabled={isFetching}
            title="Refresh"
          >
            <RefreshCcw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
          </Button>
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="h-[400px] flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--brand-gold))]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <ExternalLink className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No news matching this filter
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Featured (left, full row on mobile) */}
            <div className="lg:col-span-1">
              {featured && <FeaturedCard article={featured} />}
            </div>

            {/* Story list (right) */}
            <div className="lg:col-span-1 space-y-3">
              {stories.slice(0, 7).map((article, idx) => (
                <StoryCard key={article.id} article={article} idx={idx} />
              ))}
              {stories.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Only one story available for this filter.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
