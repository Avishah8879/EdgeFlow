import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, RotateCcw, Filter, TrendingUp, TrendingDown } from 'lucide-react';

interface Trade {
  id: string;
  timestamp: number;
  symbol: string;
  price: number;
  size: number;
  bid: number;
  ask: number;
  condition: 'regular' | 'block' | 'odd';
  uptick: boolean;
}

interface SummaryStats {
  totalVolume: number;
  vwap: number;
  high: number;
  low: number;
  trades: number;
}

export function TimeAndSalesPanel() {
  const [symbol, setSymbol] = useState('RELIANCE');
  const [isStreaming, setIsStreaming] = useState(true);
  const [speed, setSpeed] = useState<1 | 2 | 5>(1);
  const [minSize, setMinSize] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [filteredTrades, setFilteredTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState<SummaryStats>({
    totalVolume: 0,
    vwap: 0,
    high: 0,
    low: 0,
    trades: 0,
  });
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const tradeIndexRef = useRef(0);

  // Fetch initial trade data
  const { data: initialTrades, isLoading, refetch } = useQuery<Trade[]>({
    queryKey: [`/api/time-sales/${symbol}?count=200`],
    staleTime: 0, // Always fetch fresh data
    enabled: !!symbol,
  });

  // Calculate summary statistics
  const calculateStats = useCallback((tradesToAnalyze: Trade[]) => {
    if (tradesToAnalyze.length === 0) {
      setStats({
        totalVolume: 0,
        vwap: 0,
        high: 0,
        low: 0,
        trades: 0,
      });
      return;
    }

    let totalVolume = 0;
    let vwapNumerator = 0;
    let high = tradesToAnalyze[0].price;
    let low = tradesToAnalyze[0].price;

    tradesToAnalyze.forEach((trade) => {
      totalVolume += trade.size;
      vwapNumerator += trade.price * trade.size;
      high = Math.max(high, trade.price);
      low = Math.min(low, trade.price);
    });

    setStats({
      totalVolume,
      vwap: totalVolume > 0 ? vwapNumerator / totalVolume : 0,
      high,
      low,
      trades: tradesToAnalyze.length,
    });
  }, []);

  // Simulate streaming trades
  useEffect(() => {
    if (!initialTrades || !isStreaming) return;

    // Start streaming from the beginning
    tradeIndexRef.current = 0;
    setTrades([]);

    const streamInterval = Math.floor(1000 / speed);

    intervalRef.current = setInterval(() => {
      if (tradeIndexRef.current >= initialTrades.length) {
        // Reset and continue streaming
        tradeIndexRef.current = 0;
      }

      const newTrade = {
        ...initialTrades[tradeIndexRef.current],
        timestamp: Date.now(), // Update timestamp for real-time feel
      };

      setTrades((prev) => {
        const updated = [...prev, newTrade];
        // Keep only last 500 trades for performance
        if (updated.length > 500) {
          return updated.slice(-500);
        }
        return updated;
      });

      tradeIndexRef.current++;
    }, streamInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [initialTrades, isStreaming, speed]);

  // Filter trades based on size
  useEffect(() => {
    const filtered = trades.filter((trade) => trade.size >= minSize);
    setFilteredTrades(filtered);
    calculateStats(filtered);
  }, [trades, minSize, calculateStats]);

  // Auto-scroll to latest trade
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredTrades, autoScroll]);

  const handleSymbolChange = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newSymbol = formData.get('symbol') as string;
    if (newSymbol) {
      setSymbol(newSymbol.toUpperCase());
      setTrades([]);
      refetch();
    }
  };

  const handleReset = () => {
    setTrades([]);
    tradeIndexRef.current = 0;
    refetch();
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    }).replace(',', '.');
  };

  const formatNumber = (num: number, decimals = 2) => {
    return num.toFixed(decimals);
  };

  const formatVolume = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div className="h-full flex flex-col bg-card p-2">
      {/* Controls */}
      <Card className="p-2 mb-2 bg-card/50 border-primary/20">
        <div className="space-y-2">
          {/* Symbol Input */}
          <form onSubmit={handleSymbolChange} className="flex gap-2">
            <Input
              name="symbol"
              defaultValue={symbol}
              placeholder="Enter symbol"
              className="w-32 font-mono"
              data-testid="input-symbol"
            />
            <Button type="submit" size="sm" data-testid="button-update">
              Update
            </Button>
          </form>

          {/* Playback Controls */}
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={isStreaming ? "default" : "outline"}
                onClick={() => setIsStreaming(!isStreaming)}
                data-testid="button-play-pause"
              >
                {isStreaming ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleReset}
                data-testid="button-reset"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>

            {/* Speed Control */}
            <div className="flex items-center gap-2">
              <Label className="text-xs">Speed:</Label>
              <Select value={speed.toString()} onValueChange={(v) => setSpeed(parseInt(v) as 1 | 2 | 5)}>
                <SelectTrigger className="w-20 h-8" data-testid="select-speed">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1x</SelectItem>
                  <SelectItem value="2">2x</SelectItem>
                  <SelectItem value="5">5x</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Size Filter */}
            <div className="flex items-center gap-2 flex-1">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Label className="text-xs">Min Size:</Label>
              <Input
                type="number"
                value={minSize}
                onChange={(e) => setMinSize(parseInt(e.target.value) || 0)}
                className="w-20 h-8"
                data-testid="input-min-size"
              />
              <Button
                size="sm"
                variant={autoScroll ? "default" : "outline"}
                onClick={() => setAutoScroll(!autoScroll)}
                data-testid="button-auto-scroll"
              >
                Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
              </Button>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-5 gap-4 p-3 bg-black/50 rounded border border-primary/30">
            <div>
              <div className="text-xs text-muted-foreground">Trades</div>
              <div className="text-sm font-mono text-primary">{stats.trades}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Volume</div>
              <div className="text-sm font-mono text-primary">{formatVolume(stats.totalVolume)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">VWAP</div>
              <div className="text-sm font-mono text-primary">${formatNumber(stats.vwap)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">High</div>
              <div className="text-sm font-mono text-green-500">${formatNumber(stats.high)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Low</div>
              <div className="text-sm font-mono text-red-500">${formatNumber(stats.low)}</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Trade Tape */}
      <Card className="flex-1 p-2 bg-card/50 border-primary/20 overflow-hidden">
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="grid grid-cols-7 gap-2 pb-1.5 mb-1.5 border-b border-primary/30 text-xs text-muted-foreground">
            <div>Time</div>
            <div>Symbol</div>
            <div className="text-right">Price</div>
            <div className="text-right">Size</div>
            <div className="text-right">Bid</div>
            <div className="text-right">Ask</div>
            <div className="text-center">Type</div>
          </div>

          {/* Trade List */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="text-center py-4 text-muted-foreground">Loading trades...</div>
            ) : filteredTrades.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">No trades to display</div>
            ) : (
              <div className="space-y-1">
                {filteredTrades.map((trade, index) => (
                  <div
                    key={trade.id}
                    data-testid={`trade-${index}`}
                    className={`grid grid-cols-7 gap-2 py-1 px-2 rounded text-xs font-mono ${
                      trade.condition === 'block' ? 'bg-blue-900/20' : 
                      trade.condition === 'odd' ? 'bg-yellow-900/20' : ''
                    } hover:bg-primary/10 transition-colors`}
                  >
                    <div className="text-muted-foreground">{formatTime(trade.timestamp)}</div>
                    <div>{trade.symbol}</div>
                    <div className={`text-right flex items-center justify-end gap-1 ${
                      trade.uptick ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {trade.uptick ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      ${formatNumber(trade.price)}
                    </div>
                    <div className="text-right">{trade.size.toLocaleString()}</div>
                    <div className="text-right text-muted-foreground">${formatNumber(trade.bid)}</div>
                    <div className="text-right text-muted-foreground">${formatNumber(trade.ask)}</div>
                    <div className="text-center">
                      <Badge 
                        variant={trade.condition === 'block' ? 'default' : 
                                trade.condition === 'odd' ? 'secondary' : 'outline'}
                        className="text-[10px] py-0"
                      >
                        {trade.condition}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}