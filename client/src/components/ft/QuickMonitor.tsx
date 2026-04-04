import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Loader2, Gauge, Activity, Plus, X, RotateCcw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useStockQuote } from '@/hooks/useStockQuote';
import { useQuery } from '@tanstack/react-query';
import { useSymbolSearch } from '@/hooks/useSymbolSearch';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

// Default indices to display (from DB)
const DEFAULT_INDICES = [
  { symbol: 'Nifty 50', label: 'NIFTY 50' },
  { symbol: 'Nifty Bank', label: 'BANK NIFTY' },
  { symbol: 'India VIX', label: 'INDIA VIX' },
  { symbol: 'HangSeng BeES-NAV', label: 'HANGSENG' },
];

// Storage key for persisted indices
const STORAGE_KEY = 'quickmonitor-indices';

interface MarketMover {
  symbol: string;
  trading_symbol?: string;
  price: number;
  change: number;
  changePercent: number;
  percent_change?: number;
  volume: number;
  rank?: number;
  open_interest?: number;
  net_change_open_interest?: number;
  expiry_type?: string;
  data_type?: string;
}

interface MoversResponse {
  gainers: MarketMover[];
  losers: MarketMover[];
  fetchedAt?: string;
}

interface SelectedIndex {
  symbol: string;
  label: string;
}

const getFearGreedLabel = (value: number) => {
  if (value < 20) return 'Extreme Fear';
  if (value < 40) return 'Fear';
  if (value < 60) return 'Neutral';
  if (value < 80) return 'Greed';
  return 'Extreme Greed';
};

const getFearGreedColor = (value: number) => {
  if (value < 20) return 'text-green-500';
  if (value < 40) return 'text-blue-500';
  if (value < 60) return 'text-yellow-500';
  if (value < 80) return 'text-orange-500';
  return 'text-red-400';
};

// Index Item that fetches its own data
function IndexItemWithData({ index, onRemove, canRemove }: {
  index: SelectedIndex;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const { data: quote, isLoading, isError } = useStockQuote(index.symbol);

  if (isLoading) {
    return (
      <div className="p-2 bg-card border border-border rounded relative group">
        <div className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1">
          {index.label}
        </div>
        <div className="flex items-center justify-center h-8">
          <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />
        </div>
      </div>
    );
  }

  if (isError || !quote || typeof quote.price === 'undefined') {
    return (
      <div className="p-2 bg-card border border-border rounded relative group">
        {canRemove && (
          <button
            onClick={onRemove}
            className="absolute top-1 right-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/20 transition-all"
          >
            <X className="w-3 h-3 text-destructive" />
          </button>
        )}
        <div className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1">
          {index.label}
        </div>
        <div className="text-xs text-muted-foreground">Data Unavailable</div>
      </div>
    );
  }

  const isPositive = (quote.change || 0) >= 0;
  const changePercent = quote.changePercent || 0;

  return (
    <div className="p-2.5 bg-card border border-border rounded hover:bg-card/80 transition-colors relative group">
      {canRemove && (
        <button
          onClick={onRemove}
          className="absolute top-1 right-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/20 transition-all"
        >
          <X className="w-3 h-3 text-destructive" />
        </button>
      )}
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1.5">
        {index.label}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base font-mono text-foreground financial-price">
          ₹{quote.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className={cn(
          "text-[11px] font-mono font-medium",
          isPositive ? 'text-[#00FF00]' : 'text-[#FF6B35]'
        )}>
          {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

// Add Index Search Component
function AddIndexSearch({ onAdd, existingSymbols }: {
  onAdd: (symbol: string, name: string) => void;
  existingSymbols: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const { data: searchResults = [] } = useSymbolSearch(query);

  // Filter out already added symbols
  const filteredResults = searchResults.filter(
    r => !existingSymbols.includes(r.symbol)
  ).slice(0, 8);

  const handleSelect = (symbol: string, name: string) => {
    onAdd(symbol, name);
    setIsOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setQuery('');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.min(prev + 1, filteredResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && filteredResults.length > 0) {
      e.preventDefault();
      const selected = filteredResults[highlightedIndex];
      handleSelect(selected.symbol, selected.name);
    }
  };

  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchResults]);

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => setIsOpen(true)}
        title="Add index to monitor"
      >
        <Plus className="w-3.5 h-3.5" />
      </Button>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search symbol..."
        autoFocus
        className="w-36 h-6 px-2 bg-card border border-primary rounded font-mono text-[10px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <button
        onClick={() => { setIsOpen(false); setQuery(''); }}
        className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5"
      >
        <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
      </button>

      {query.length >= 2 && filteredResults.length > 0 && (
        <div className="absolute top-full left-0 mt-1 w-56 max-h-40 overflow-y-auto bg-card border border-border rounded shadow-lg z-50">
          {filteredResults.map((result, idx) => (
            <button
              key={result.symbol}
              onClick={() => handleSelect(result.symbol, result.name)}
              onMouseEnter={() => setHighlightedIndex(idx)}
              className={cn(
                "w-full px-2 py-1.5 text-left flex items-center gap-2 transition-colors",
                highlightedIndex === idx ? "bg-primary/20" : "hover:bg-muted"
              )}
            >
              <span className="font-mono font-bold text-[10px] text-secondary">{result.symbol}</span>
              <span className="text-[9px] text-muted-foreground truncate">{result.name}</span>
            </button>
          ))}
        </div>
      )}

      {query.length >= 2 && filteredResults.length === 0 && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-card border border-border rounded shadow-lg z-50 px-2 py-1.5">
          <span className="text-[9px] text-muted-foreground">No results</span>
        </div>
      )}
    </div>
  );
}

export function QuickMonitor() {
  const [activeTab, setActiveTab] = useState('indices');
  const [filterType, setFilterType] = useState<'all' | 'equity' | 'futures'>('equity');

  // Load saved indices from localStorage
  const [selectedIndices, setSelectedIndices] = useState<SelectedIndex[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load saved indices:', e);
    }
    return DEFAULT_INDICES;
  });

  // Save to localStorage when indices change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedIndices));
    } catch (e) {
      console.warn('Failed to save indices:', e);
    }
  }, [selectedIndices]);

  const handleAddIndex = (symbol: string, name: string) => {
    if (selectedIndices.length >= 8) {
      alert('Maximum 8 indices allowed');
      return;
    }
    setSelectedIndices(prev => [...prev, {
      symbol,
      label: name || symbol
    }]);
  };

  const handleRemoveIndex = (symbol: string) => {
    setSelectedIndices(prev => prev.filter(i => i.symbol !== symbol));
  };

  const handleResetToDefaults = () => {
    setSelectedIndices(DEFAULT_INDICES);
  };

  // Fetch fear & greed index from API
  const {
    data: fearGreedData,
    isLoading: fearGreedLoading,
    isError: fearGreedError,
  } = useQuery<{
    value: number;
    label: string;
    description: string;
    symbol?: string;
    lookback?: number;
    sampleSize?: number;
    updatedAt?: string;
    source?: string;
    interval?: string;
  }>({
    queryKey: ['/api/fear-greed'],
    refetchInterval: 300000,
    select: (raw: any) => raw?.data ?? raw,
  });

  // Fetch market movers from API
  const { data: moversData, isLoading: moversLoading } = useQuery<MoversResponse>({
    queryKey: ['/api/market-movers'],
    staleTime: 60000,
    refetchInterval: 60000,
    select: (raw: any): MoversResponse => {
      // If already in {gainers, losers} shape, use as-is
      if (raw?.gainers || raw?.losers) return raw as MoversResponse;
      // Python returns {data: [...]} flat array with category field
      const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      const gainers: MarketMover[] = [];
      const losers: MarketMover[] = [];
      for (const item of arr) {
        const mover: MarketMover = {
          symbol: item.symbol ?? '',
          trading_symbol: item.trading_symbol,
          price: Number(item.ltp ?? item.price ?? 0),
          change: Number(item.change ?? 0),
          changePercent: Number(item.change_pct ?? item.change_percent ?? item.changePercent ?? 0),
          volume: Number(item.volume ?? 0),
          rank: item.rank,
        };
        if (item.category === 'LOSER' || mover.changePercent < 0) {
          losers.push(mover);
        } else {
          gainers.push(mover);
        }
      }
      return { gainers, losers, fetchedAt: raw?.meta?.fetched_at };
    },
  });

  const fearGreedValue = typeof fearGreedData?.value === 'number' ? fearGreedData.value : null;
  const fearGreedLabel = fearGreedData?.label
    || (fearGreedValue !== null ? getFearGreedLabel(fearGreedValue) : 'Unavailable');
  const fearGreedColor = fearGreedValue !== null ? getFearGreedColor(fearGreedValue) : 'text-muted-foreground';
  const normalizedFearGreedValue = fearGreedValue !== null
    ? Math.min(Math.max(fearGreedValue, 0), 100)
    : 0;

  // Helper function to determine if symbol is futures
  const isFuturesSymbol = (sym: string) => {
    return sym.includes('FUT') || sym.includes('25NOV') || sym.includes('25DEC') || sym.includes('26JAN');
  };

  // Get symbol from mover (handle both old and new field names)
  const getMoverSymbol = (m: MarketMover) => m.symbol || m.trading_symbol || '';
  const getMoverChange = (m: MarketMover) => m.changePercent ?? m.percent_change ?? 0;

  // Filter movers based on selected tab
  const filterMovers = (movers: MarketMover[]) => {
    let filtered = movers;

    if (filterType === 'equity') {
      filtered = movers.filter(m => !isFuturesSymbol(getMoverSymbol(m)));
    } else if (filterType === 'futures') {
      filtered = movers.filter(m => isFuturesSymbol(getMoverSymbol(m)));
    }

    return filtered;
  };

  const filteredGainers = filterMovers(moversData?.gainers || []);
  const filteredLosers = filterMovers(moversData?.losers || []);

  // Color intensity system for movers
  const getColorIntensity = (percentChange: number) => {
    const absChange = Math.abs(percentChange);
    if (absChange >= 5) return 'high';
    if (absChange >= 3) return 'medium';
    if (absChange >= 1) return 'low';
    return 'minimal';
  };

  const getGainerColor = (percentChange: number, intensity: string) => {
    const colors = {
      high: 'text-[#00FF00] font-bold',
      medium: 'text-[#00FF00]/80 font-semibold',
      low: 'text-[#00FF00]/60',
      minimal: 'text-[#00FF00]/40'
    };
    return colors[intensity as keyof typeof colors];
  };

  const getLoserColor = (percentChange: number, intensity: string) => {
    const colors = {
      high: 'text-[#FF6B35] font-bold',
      medium: 'text-[#FF6B35]/80 font-semibold',
      low: 'text-[#FF6B35]/60',
      minimal: 'text-[#FF6B35]/40'
    };
    return colors[intensity as keyof typeof colors];
  };

  const getBackgroundHighlight = (percentChange: number, isGainer: boolean) => {
    const absChange = Math.abs(percentChange);
    if (absChange >= 7) {
      return isGainer
        ? 'bg-[#00FF00]/5 border-l-2 border-[#00FF00]/30'
        : 'bg-[#FF6B35]/5 border-l-2 border-[#FF6B35]/30';
    }
    return '';
  };

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Fear & Greed Index - Always at top */}
      <div className="px-3 py-2.5 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">
              Fear & Greed
            </span>
          </div>
          {fearGreedData?.updatedAt && (
            <span className="text-[8px] text-muted-foreground">
              {formatDistanceToNow(new Date(fearGreedData.updatedAt), { addSuffix: true })}
            </span>
          )}
        </div>
        {fearGreedLoading ? (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
          </div>
        ) : fearGreedValue !== null ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <span className={cn("text-2xl font-bold font-mono", fearGreedColor)}>
                  {fearGreedValue.toFixed(1)}
                </span>
                <Badge variant="outline" className={cn("text-[8px] px-1.5 py-0", fearGreedColor)}>
                  {fearGreedLabel}
                </Badge>
              </div>
              <span className="text-[9px] text-muted-foreground">
                {fearGreedData?.symbol || 'NIFTY 50'}
              </span>
            </div>
            <Progress value={normalizedFearGreedValue} className="h-1.5" />
          </div>
        ) : (
          <div className="text-[10px] text-muted-foreground py-2">
            Index unavailable{fearGreedError ? ' (server error)' : ''}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start px-3 h-8 bg-background border-b rounded-none">
          <TabsTrigger value="indices" className="text-[10px] h-6 px-3">Indices</TabsTrigger>
          <TabsTrigger value="movers" className="text-[10px] h-6 px-3">Movers</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto">
          {/* Indices Tab */}
          <TabsContent value="indices" className="m-0 p-3">
            {/* Indices Header with Add/Reset */}
            <div className="flex items-center justify-between mb-3">
              <AddIndexSearch
                onAdd={handleAddIndex}
                existingSymbols={selectedIndices.map(i => i.symbol)}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={handleResetToDefaults}
                title="Reset to default indices"
              >
                <RotateCcw className="w-3 h-3" />
              </Button>
            </div>

            {/* Indices Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              {selectedIndices.map((index) => (
                <IndexItemWithData
                  key={index.symbol}
                  index={index}
                  onRemove={() => handleRemoveIndex(index.symbol)}
                  canRemove={selectedIndices.length > 1}
                />
              ))}
            </div>

            {selectedIndices.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-xs">No indices selected</p>
                <p className="text-[10px] mt-1">Click "Add Index" to add some</p>
              </div>
            )}
          </TabsContent>

          {/* Top Movers Tab */}
          <TabsContent value="movers" className="m-0 p-3">
            {moversLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
              </div>
            ) : (
              <>
                {/* Side-by-Side Layout */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Top Gainers */}
                  <div>
                    <div className="flex items-center gap-1 mb-2">
                      <TrendingUp className="w-3 h-3 text-[#00FF00]" />
                      <h4 className="text-[10px] font-mono text-[#00FF00]">GAINERS</h4>
                    </div>
                    <div className="space-y-0.5">
                      {filteredGainers.length > 0 ? (
                        filteredGainers.map((mover, idx) => {
                          const pctChange = getMoverChange(mover);
                          const sym = getMoverSymbol(mover);
                          const intensity = getColorIntensity(pctChange);
                          const colorClass = getGainerColor(pctChange, intensity);
                          const bgHighlight = getBackgroundHighlight(pctChange, true);

                          return (
                            <div
                              key={`${sym}-${idx}`}
                              className={cn(
                                "flex items-center justify-between py-1 px-1.5 rounded",
                                bgHighlight,
                                idx < 3 && "font-bold"
                              )}
                            >
                              <span className={cn("text-[9px] font-mono truncate flex-1", colorClass)}>
                                {sym}
                              </span>
                              <span className={cn("text-[10px] font-mono", colorClass)}>
                                +{pctChange.toFixed(2)}%
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-[9px] text-muted-foreground py-4 text-center">
                          No gainers available
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Top Losers */}
                  <div>
                    <div className="flex items-center gap-1 mb-2">
                      <TrendingDown className="w-3 h-3 text-[#FF6B35]" />
                      <h4 className="text-[10px] font-mono text-[#FF6B35]">LOSERS</h4>
                    </div>
                    <div className="space-y-0.5">
                      {filteredLosers.length > 0 ? (
                        filteredLosers.map((mover, idx) => {
                          const pctChange = getMoverChange(mover);
                          const sym = getMoverSymbol(mover);
                          const intensity = getColorIntensity(pctChange);
                          const colorClass = getLoserColor(pctChange, intensity);
                          const bgHighlight = getBackgroundHighlight(pctChange, false);

                          return (
                            <div
                              key={`${sym}-${idx}`}
                              className={cn(
                                "flex items-center justify-between py-1 px-1.5 rounded",
                                bgHighlight,
                                idx < 3 && "font-bold"
                              )}
                            >
                              <span className={cn("text-[9px] font-mono truncate flex-1", colorClass)}>
                                {sym}
                              </span>
                              <span className={cn("text-[10px] font-mono", colorClass)}>
                                {pctChange.toFixed(2)}%
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-[9px] text-muted-foreground py-4 text-center">
                          No losers available
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                {moversData?.fetchedAt && (
                  <div className="mt-3 pt-2 border-t border-border">
                    <div className="flex items-center justify-between text-[8px] text-muted-foreground">
                      <span>
                        Updated: {formatDistanceToNow(new Date(moversData.fetchedAt), { addSuffix: true })}
                      </span>
                      <span>{filteredGainers.length + filteredLosers.length} movers</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
