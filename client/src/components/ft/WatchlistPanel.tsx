import { useState, useEffect, useRef, useCallback } from 'react';
import { TrendingUp, TrendingDown, Plus, X, Loader2, Star, StarOff, Eye, MoreVertical, Activity, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useStockQuote } from '@/hooks/useStockQuote';
import { useSymbolSearch } from '@/hooks/useSymbolSearch';
import { useWatchlistSectorData } from '@/hooks/useWatchlistSectorData';
import { useSparklineData } from '@/hooks/useSparklineData';
import { cn } from '@/lib/utils';
import { ResponsiveContainer, LineChart, Line, YAxis } from 'recharts';

interface WatchlistItemWithQuote {
  symbol: string;
  id: string;
  sector?: string;
  industry?: string;
}


function WatchlistTickerItem({ symbol }: { symbol: string }) {
  const { data: quote, isLoading } = useStockQuote(symbol, true, {
    refetchInterval: 30000, // Reduced from 10s to 30s to prevent data flickering
    staleTime: 20000,
  });

  const isPositive = (quote?.change ?? 0) >= 0;

  return (
    <div className="flex items-center gap-2 text-[11px] font-mono text-foreground whitespace-nowrap">
      <span className="text-muted-foreground financial-ticker">{symbol}</span>
      {isLoading ? (
        <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />
      ) : quote ? (
        <>
          <span className="text-primary financial-price">
            {quote.price ? quote.price.toFixed(2) : '—'}
          </span>
          <span
            className={cn(
              'flex items-center gap-0.5',
              isPositive ? 'financial-change-positive' : 'financial-change-negative'
            )}
          >
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {isPositive ? '+' : ''}
            {quote.changePercent?.toFixed(2) ?? '0.00'}%
          </span>
        </>
      ) : (
        <span className="text-muted-foreground">N/A</span>
      )}
    </div>
  );
}

function WatchlistTickerTape({ symbols }: { symbols: string[] }) {
  const uniqueSymbols = Array.from(new Set(symbols));
  if (uniqueSymbols.length === 0) {
    return null;
  }

  const marqueeSymbols =
    uniqueSymbols.length === 1 ? uniqueSymbols : uniqueSymbols.concat(uniqueSymbols);

  return (
    <div className="relative overflow-hidden border-b border-border bg-card" data-testid="watchlist-ticker">
      <div className="ticker-track flex items-center gap-6 py-2 px-3">
        {marqueeSymbols.map((symbol, index) => (
          <WatchlistTickerItem key={`${symbol}-${index}`} symbol={symbol} />
        ))}
      </div>
      <style>{`
        @keyframes watchlist-ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-track {
          min-width: 200%;
          white-space: nowrap;
          animation: watchlist-ticker 30s linear infinite;
        }
      `}</style>
    </div>
  );
}

function WatchlistRow({
  item,
  onSelect,
  onRemove,
  showSparkline,
  showPercentBar,
  onQuoteLoad,
}: {
  item: WatchlistItemWithQuote;
  onSelect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  showSparkline: boolean;
  showPercentBar: boolean;
  onQuoteLoad?: (symbol: string, change: number, volume: number) => void;
}) {
  const { data: quote, isLoading } = useStockQuote(item.symbol);
  const { data: sparklineData = [] } = useSparklineData(item.symbol, showSparkline);
  const [isFavorite, setIsFavorite] = useState(false);

  // Report quote data to parent for sorting
  useEffect(() => {
    if (quote && onQuoteLoad) {
      onQuoteLoad(item.symbol, quote.changePercent ?? 0, quote.volume ?? 0);
    }
  }, [quote, item.symbol, onQuoteLoad]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-[0.3fr_2fr_2fr_1.5fr_1.5fr_1fr_0.5fr] gap-2 px-3 py-2 border-b border-border">
        <div></div>
        <div className="text-sm font-bold font-mono text-secondary">{item.symbol}</div>
        <div className="flex items-center justify-end">
          <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />
        </div>
        <div></div>
        <div></div>
        <div></div>
        <div></div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="grid grid-cols-[0.3fr_2fr_2fr_1.5fr_1.5fr_1fr_0.5fr] gap-2 px-3 py-2 border-b border-border hover:bg-card cursor-pointer group"
        onClick={() => onSelect(item.symbol)}
      >
        <div></div>
        <div className="text-sm font-bold font-mono text-secondary">{item.symbol}</div>
        <div className="text-xs text-muted-foreground">No data</div>
        <div></div>
        <div></div>
        <div></div>
        <div className="flex items-center justify-end">
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5 opacity-0 group-hover:opacity-100 hover-elevate"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(item.symbol);
            }}
            data-testid={`button-remove-${item.symbol}`}
          >
            <X className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      </div>
    );
  }

  const isPositive = quote.change >= 0;
  const changePercent = Math.abs(quote.changePercent);
  const maxChange = 10; // Max 10% for visualization
  const barWidth = Math.min((changePercent / maxChange) * 100, 100);

  // No mock sector - show N/A when not available
  const sector = item.sector || 'N/A';

  return (
    <div
      className="grid grid-cols-[0.3fr_2fr_2fr_1.5fr_1.5fr_1fr_0.5fr] gap-2 px-3 py-2 border-b border-border hover:bg-card cursor-pointer group transition-colors"
      onClick={() => onSelect(item.symbol)}
      data-testid={`watchlist-item-${item.symbol}`}
    >
      {/* Favorite */}
      <div className="flex items-center">
        <Button
          size="icon"
          variant="ghost"
          className="h-5 w-5 hover-elevate"
          onClick={(e) => {
            e.stopPropagation();
            setIsFavorite(!isFavorite);
          }}
        >
          {isFavorite ? (
            <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
          ) : (
            <StarOff className="w-3 h-3 text-muted-foreground" />
          )}
        </Button>
      </div>

      {/* Symbol with sector badge */}
      <div className="flex flex-col gap-0.5">
        <div className="text-sm font-mono text-secondary financial-ticker">{item.symbol}</div>
        <Badge variant="outline" className="text-[8px] px-1 py-0 w-fit">
          {sector}
        </Badge>
      </div>

      {/* Sparkline or Price */}
      <div className="flex items-center">
        {showSparkline ? (
          <div className="w-full h-8">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                <YAxis domain={['dataMin', 'dataMax']} hide />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={isPositive ? "#00BFFF" : "#FF6B35"}
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm font-mono text-foreground financial-price">
            ₹{quote.price.toFixed(2)}
          </div>
        )}
      </div>

      {/* Change with visual bar */}
      <div className="flex flex-col gap-1">
        <div className={cn(
          "text-sm font-mono flex items-center gap-1",
          isPositive ? 'financial-change-positive' : 'financial-change-negative'
        )}>
          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          <span className="text-xs">
            {isPositive ? '+' : ''}{quote.changePercent.toFixed(2)}%
          </span>
        </div>
        {showPercentBar && (
          <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-300",
                isPositive ? 'bg-primary' : 'bg-destructive'
              )}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        )}
      </div>

      {/* Price Change */}
      <div className={cn(
        "text-xs font-mono",
        isPositive ? 'financial-change-positive' : 'financial-change-negative'
      )}>
        {isPositive ? '+' : ''}{quote.change.toFixed(2)}
      </div>

      {/* Volume */}
      <div className="text-xs font-mono text-muted-foreground">
        {(quote.volume / 1000000).toFixed(1)}M
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5 opacity-0 group-hover:opacity-100 hover-elevate"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSelect(item.symbol); }}>
              <Eye className="w-3 h-3 mr-2" />
              View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); }}>
              <Star className="w-3 h-3 mr-2" />
              Favorite
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={(e) => { e.stopPropagation(); onRemove(item.symbol); }}
              className="text-destructive"
            >
              <X className="w-3 h-3 mr-2" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

interface WatchlistPanelProps {
  onSelectStock?: (symbol: string) => void;
}

export function WatchlistPanel({ onSelectStock }: WatchlistPanelProps) {
  const [showAddInput, setShowAddInput] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [sortBy, setSortBy] = useState<'symbol' | 'change' | 'volume'>('symbol');
  const [groupBy, setGroupBy] = useState<'none' | 'sector' | 'industry'>('none');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [showSparklines, setShowSparklines] = useState(false);
  const [showPercentBars, setShowPercentBars] = useState(true);
  const [quoteData, setQuoteData] = useState<Record<string, { change: number; volume: number }>>({});

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Callback for WatchlistRow to report quote data for sorting
  const handleQuoteLoad = useCallback((symbol: string, change: number, volume: number) => {
    setQuoteData(prev => ({
      ...prev,
      [symbol]: { change, volume },
    }));
  }, []);

  const { watchlist, isLoading, addSymbol, removeSymbol, isAdding } = useWatchlist();
  const { data: searchResults = [] } = useSymbolSearch(newSymbol);

  // Fetch sector data for all watchlist symbols
  const watchlistSymbols = Array.isArray(watchlist) ? watchlist.map(item => item.symbol) : [];
  const { getSector, getIndustry } = useWatchlistSectorData(watchlistSymbols);

  const handleSymbolSelect = (symbol: string) => {
    addSymbol(symbol);
    setNewSymbol('');
    setShowAddInput(false);
    setHighlightedIndex(0);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setShowAddInput(false);
      setNewSymbol('');
      setHighlightedIndex(0);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults.length > 0) {
        handleSymbolSelect(searchResults[highlightedIndex].symbol);
      } else if (newSymbol.trim()) {
        // Fallback: add as-is if no search results
        handleSymbolSelect(newSymbol.toUpperCase());
      }
    }
  };

  // Click-outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowAddInput(false);
        setNewSymbol('');
        setHighlightedIndex(0);
      }
    };
    if (showAddInput) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAddInput]);

  // Enrich watchlist with real sector/industry data from stock_fundamentals
  const enrichedWatchlist = Array.isArray(watchlist)
    ? watchlist.map(item => ({
        ...item,
        sector: getSector(item.symbol),
        industry: getIndustry(item.symbol),
      }))
    : [];

  // Sort enriched watchlist based on sortBy option
  const sortedWatchlist = [...enrichedWatchlist].sort((a, b) => {
    if (sortBy === 'symbol') {
      return a.symbol.localeCompare(b.symbol);
    }
    if (sortBy === 'change') {
      const aChange = quoteData[a.symbol]?.change ?? 0;
      const bChange = quoteData[b.symbol]?.change ?? 0;
      return bChange - aChange; // Higher change first
    }
    if (sortBy === 'volume') {
      const aVolume = quoteData[a.symbol]?.volume ?? 0;
      const bVolume = quoteData[b.symbol]?.volume ?? 0;
      return bVolume - aVolume; // Higher volume first
    }
    return a.symbol.localeCompare(b.symbol);
  });

  // Get unique groups for filter dropdown
  const availableGroups = groupBy === 'none'
    ? []
    : [...new Set(sortedWatchlist.map(item =>
        groupBy === 'sector' ? (item.sector || 'Other') : (item.industry || 'Other')
      ))].sort();

  // Reset selected group when groupBy changes
  useEffect(() => {
    setSelectedGroup('all');
  }, [groupBy]);

  // Filter watchlist based on selected group
  const filteredWatchlist = groupBy === 'none' || selectedGroup === 'all'
    ? sortedWatchlist
    : sortedWatchlist.filter(item => {
        const itemGroup = groupBy === 'sector' ? item.sector : item.industry;
        return (itemGroup || 'Other') === selectedGroup;
      });

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-card">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Enhanced Header */}
      <div className="px-3 py-1.5 border-b border-border">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wide font-bold text-foreground">
            WATCHLIST
          </span>
          <div className="flex items-center gap-2">
            {/* View Options */}
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant={showSparklines ? "default" : "ghost"}
                className="h-5 w-5"
                onClick={() => setShowSparklines(!showSparklines)}
                title="Toggle Sparklines"
              >
                <Activity className="w-3 h-3" />
              </Button>
              <Button
                size="icon"
                variant={showPercentBars ? "default" : "ghost"}
                className="h-5 w-5"
                onClick={() => setShowPercentBars(!showPercentBars)}
                title="Toggle Percent Bars"
              >
                <BarChart3 className="w-3 h-3" />
              </Button>
            </div>
            
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 hover-elevate"
              onClick={() => setShowAddInput(!showAddInput)}
              data-testid="button-add-symbol"
            >
              <Plus className="h-4 w-4 text-primary" />
            </Button>
          </div>
        </div>

        {/* Sorting and Grouping Controls */}
        <div className="flex gap-2">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="h-6 text-[10px] flex-1">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent className="z-[9999]">
              <SelectItem value="symbol">Symbol A-Z</SelectItem>
              <SelectItem value="change">Change %</SelectItem>
              <SelectItem value="volume">Volume</SelectItem>
            </SelectContent>
          </Select>

          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
            <SelectTrigger className="h-6 text-[10px] flex-1">
              <SelectValue placeholder="Group by" />
            </SelectTrigger>
            <SelectContent className="z-[9999]">
              <SelectItem value="none">No Filter</SelectItem>
              <SelectItem value="sector">By Sector</SelectItem>
              <SelectItem value="industry">By Industry</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Filter by specific sector/industry when grouping is enabled */}
        {groupBy !== 'none' && availableGroups.length > 0 && (
          <div className="mt-1.5">
            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger className="h-6 text-[10px]">
                <SelectValue placeholder={`Select ${groupBy}`} />
              </SelectTrigger>
              <SelectContent className="z-[9999] max-h-[200px]">
                <SelectItem value="all">
                  All {groupBy === 'sector' ? 'Sectors' : 'Industries'} ({sortedWatchlist.length})
                </SelectItem>
                {availableGroups.map(group => {
                  const count = sortedWatchlist.filter(item =>
                    (groupBy === 'sector' ? item.sector : item.industry) === group ||
                    (!item.sector && !item.industry && group === 'Other')
                  ).length;
                  return (
                    <SelectItem key={group} value={group}>
                      {group} ({count})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Real-time Ticker */}
      <WatchlistTickerTape symbols={watchlistSymbols} />

      {/* Add Symbol Input with Search */}
      {showAddInput && (
        <div ref={searchContainerRef} className="px-3 py-1.5 border-b border-border relative">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search symbol..."
            value={newSymbol}
            onChange={(e) => {
              setNewSymbol(e.target.value);
              setHighlightedIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
            className="w-full h-7 px-2 text-xs bg-card border border-primary rounded font-mono uppercase text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            autoFocus
            data-testid="input-add-symbol"
          />

          {/* Search Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute left-3 right-3 top-full mt-1 max-h-48 overflow-y-auto bg-card border border-border rounded shadow-lg z-50">
              {searchResults.map((result, index) => (
                <button
                  key={result.symbol}
                  onClick={() => handleSymbolSelect(result.symbol)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={cn(
                    "w-full px-3 py-2 text-left flex items-center gap-2 transition-colors",
                    highlightedIndex === index ? "bg-primary/20" : "hover:bg-muted"
                  )}
                >
                  <span className="font-mono font-bold text-xs text-secondary">{result.symbol}</span>
                  <span className="text-xs text-muted-foreground truncate">{result.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* No Results Message */}
          {newSymbol.length >= 2 && searchResults.length === 0 && (
            <div className="absolute left-3 right-3 top-full mt-1 bg-card border border-border rounded shadow-lg z-50 px-3 py-2">
              <span className="text-xs text-muted-foreground">No results found</span>
            </div>
          )}
        </div>
      )}

      {/* Table Header */}
      <div className="grid grid-cols-[0.3fr_2fr_2fr_1.5fr_1.5fr_1fr_0.5fr] gap-2 px-3 py-1.5 border-b border-border bg-sidebar sticky top-0 z-10">
        <div></div>
        <div className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">Symbol</div>
        <div className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">
          {showSparklines ? 'Trend' : 'Price'}
        </div>
        <div className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">Change %</div>
        <div className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">Change</div>
        <div className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">Volume</div>
        <div></div>
      </div>

      {/* Watchlist Items */}
      <div className="flex-1 overflow-y-auto">
        {filteredWatchlist.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-muted-foreground text-xs">
            No stocks in this {groupBy === 'sector' ? 'sector' : 'industry'}
          </div>
        ) : (
          filteredWatchlist.map((item) => (
            <WatchlistRow
              key={item.id}
              item={item}
              onSelect={onSelectStock || (() => {})}
              onRemove={removeSymbol}
              showSparkline={showSparklines}
              showPercentBar={showPercentBars}
              onQuoteLoad={handleQuoteLoad}
            />
          ))
        )}
      </div>

      {/* Footer Stats */}
      <div className="px-3 py-2 border-t border-border bg-sidebar">
        <div className="text-[10px] text-muted-foreground">
          {selectedGroup !== 'all' ? `${filteredWatchlist.length} of ` : ''}{watchlist.length} symbols
        </div>
      </div>
    </div>
  );
}
