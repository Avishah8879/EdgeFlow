import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCcw, TrendingUp, TrendingDown, Minus, Search, Filter, Clock, ExternalLink, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

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

const categoryLabels = {
  market: 'Market News',
  earnings: 'Earnings',
  ma: 'M&A',
  economic: 'Economic Data',
  general: 'General',
};

const sentimentIcons = {
  bullish: <TrendingUp className="w-3 h-3" />,
  bearish: <TrendingDown className="w-3 h-3" />,
  neutral: <Minus className="w-3 h-3" />,
};

const sentimentColors = {
  bullish: 'text-green-400',
  bearish: 'text-red-400',
  neutral: 'text-muted-foreground',
};

export function TopNewsPanel() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSentiment, setSelectedSentiment] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch news data with React Query
  const { data: newsData = [], isLoading, error, refetch } = useQuery<NewsArticle[]>({
    queryKey: ['/api/news/top'],
    refetchInterval: autoRefresh ? 5 * 60 * 1000 : false, // 5 minute auto-refresh
    staleTime: 2 * 60 * 1000, // Data considered fresh for 2 minutes
  });

  // Manual refresh handler
  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // Filter news based on search and filters
  const filteredNews = useMemo(() => {
    return newsData.filter((article) => {
      const matchesSearch = searchTerm === '' || 
        article.headline.toLowerCase().includes(searchTerm.toLowerCase()) ||
        article.summary?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        article.tickers?.some(ticker => ticker.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesCategory = selectedCategory === 'all' || article.category === selectedCategory;
      const matchesSentiment = selectedSentiment === 'all' || article.sentiment === selectedSentiment;
      
      return matchesSearch && matchesCategory && matchesSentiment;
    });
  }, [newsData, searchTerm, selectedCategory, selectedSentiment]);

  // Group news by category
  const groupedNews = useMemo(() => {
    const grouped: Record<string, NewsArticle[]> = {};
    filteredNews.forEach((article) => {
      if (!grouped[article.category]) {
        grouped[article.category] = [];
      }
      grouped[article.category].push(article);
    });
    return grouped;
  }, [filteredNews]);

  const formatTimestamp = (timestamp: string) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return timestamp;
    }
  };

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Failed to load news</p>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={handleRefresh} 
            className="mt-2"
            data-testid="button-retry"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Header */}
      <div className="px-3 py-1.5 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wide font-bold text-foreground">
            TOP NEWS
          </span>
          <div className="flex items-center gap-1">
            <Badge 
              variant="outline" 
              className={cn(
                "text-[9px] px-1.5 py-0",
                autoRefresh ? "bg-primary/20" : ""
              )}
            >
              {autoRefresh ? "AUTO" : "MANUAL"}
            </Badge>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={handleRefresh}
              disabled={isLoading}
              data-testid="button-refresh"
            >
              <RefreshCcw className={cn("w-3 h-3", isLoading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-3 py-1.5 space-y-1.5 border-b border-border">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            placeholder="Search news, tickers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-7 pl-7 text-xs"
            data-testid="filter-search"
          />
        </div>

        {/* Category and Sentiment Filters */}
        <div className="flex gap-2">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="h-7 text-xs flex-1" data-testid="filter-category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="market">Market News</SelectItem>
              <SelectItem value="earnings">Earnings</SelectItem>
              <SelectItem value="ma">M&A</SelectItem>
              <SelectItem value="economic">Economic Data</SelectItem>
              <SelectItem value="general">General</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedSentiment} onValueChange={setSelectedSentiment}>
            <SelectTrigger className="h-7 text-xs flex-1" data-testid="filter-sentiment">
              <SelectValue placeholder="Sentiment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sentiment</SelectItem>
              <SelectItem value="bullish">Bullish</SelectItem>
              <SelectItem value="bearish">Bearish</SelectItem>
              <SelectItem value="neutral">Neutral</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* News Content */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-muted/20 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-muted/10 rounded w-full mb-1" />
                  <div className="h-3 bg-muted/10 rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : Object.keys(groupedNews).length > 0 ? (
            <Tabs defaultValue={Object.keys(groupedNews)[0]} className="w-full">
              <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${Object.keys(groupedNews).length}, 1fr)` }}>
                {Object.keys(groupedNews).map((category) => (
                  <TabsTrigger key={category} value={category} className="text-xs">
                    {categoryLabels[category as keyof typeof categoryLabels]}
                    <Badge variant="secondary" className="ml-1 text-[9px] px-1">
                      {groupedNews[category].length}
                    </Badge>
                  </TabsTrigger>
                ))}
              </TabsList>

              {Object.keys(groupedNews).map((category) => (
                <TabsContent key={category} value={category} className="mt-3 space-y-3">
                  {groupedNews[category].map((article, index) => (
                    <div
                      key={article.id}
                      className="p-3 rounded-md border border-border hover:bg-card cursor-pointer group transition-colors"
                      data-testid={`news-item-${index}`}
                    >
                      {/* Article Header */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-foreground leading-tight group-hover:text-primary">
                            {article.headline}
                          </h4>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className={cn("flex items-center gap-1", sentimentColors[article.sentiment])}>
                            {sentimentIcons[article.sentiment]}
                            <span className="text-[9px] uppercase font-medium">
                              {article.sentiment}
                            </span>
                          </div>
                          <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>

                      {/* Article Summary */}
                      {article.summary && (
                        <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                          {article.summary}
                        </p>
                      )}

                      {/* Article Meta */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-secondary uppercase font-medium">
                            {article.source}
                          </span>
                          {article.importance === 'high' && (
                            <Badge variant="destructive" className="text-[8px] px-1 py-0">
                              HIGH
                            </Badge>
                          )}
                          {article.tickers && article.tickers.length > 0 && (
                            <div className="flex gap-1">
                              {article.tickers.slice(0, 3).map((ticker) => (
                                <Badge
                                  key={ticker}
                                  variant="outline"
                                  className="text-[9px] px-1.5 py-0 bg-primary/10 border-primary/20 text-primary"
                                >
                                  ${ticker}
                                </Badge>
                              ))}
                              {article.tickers.length > 3 && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1.5 py-0"
                                >
                                  +{article.tickers.length - 3}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span className="font-mono">
                            {formatTimestamp(article.timestamp)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <div className="text-center py-8">
              <Filter className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No news matching filters</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}