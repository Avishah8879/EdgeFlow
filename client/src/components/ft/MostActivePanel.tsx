import { ArrowUp, ArrowDown, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';

interface ActiveStock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

export function MostActivePanel() {
  const { data: stocks, isLoading, isError, refetch } = useQuery<ActiveStock[]>({
    queryKey: ['/api/most-active'],
    staleTime: 60000, // 1 minute
    refetchInterval: 60000, // Auto-refresh every minute
  });

  const formatVolume = (volume: number): string => {
    if (volume >= 1000000000) return `${(volume / 1000000000).toFixed(1)}B`;
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
    if (volume >= 1000) return `${(volume / 1000).toFixed(0)}K`;
    return volume.toString();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" data-testid="loading-spinner-active" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-background">
        <AlertCircle className="w-8 h-8 text-destructive" data-testid="error-icon-active" />
        <p className="text-sm text-muted-foreground" data-testid="text-error-message">Failed to load most active stocks</p>
        <Button 
          onClick={() => refetch()} 
          size="sm"
          data-testid="button-retry-active"
        >
          Retry
        </Button>
      </div>
    );
  }

  const lastUpdate = new Date();

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Most Active</span>
          <span className="text-[10px] text-muted-foreground" data-testid="text-last-update">
            {lastUpdate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => refetch()}
          data-testid="button-refresh-active"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      <div className="grid grid-cols-5 gap-1 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/40">
        <div>Symbol</div>
        <div>Company</div>
        <div className="text-right">Price</div>
        <div className="text-right">Change</div>
        <div className="text-right">Volume</div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-3">
          {stocks && stocks.map((stock, index) => (
            <div
              key={stock.symbol}
              className="grid grid-cols-5 gap-1 py-2 border-b border-border hover:bg-accent transition-colors cursor-pointer"
              data-testid={`row-active-${stock.symbol}`}
            >
              <div className="flex items-center gap-1">
                <span className="text-primary font-mono text-sm financial-ticker" data-testid={`text-symbol-${stock.symbol}`}>
                  {stock.symbol}
                </span>
                <span className="text-[10px] text-muted-foreground" data-testid={`text-rank-${index + 1}`}>
                  {index + 1}
                </span>
              </div>
              <div className="text-[11px] text-foreground truncate" title={stock.name} data-testid={`text-name-${stock.symbol}`}>
                {stock.name}
              </div>
              <div className="text-right font-mono text-sm text-foreground financial-price" data-testid={`text-price-${stock.symbol}`}>
                ₹{stock.price.toFixed(2)}
              </div>
              <div className="text-right">
                <div className={`flex items-center justify-end gap-1 ${stock.change >= 0 ? 'financial-change-positive' : 'financial-change-negative'}`}>
                  {stock.change >= 0 ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  )}
                  <span className="font-mono text-sm" data-testid={`text-change-percent-${stock.symbol}`}>
                    {Math.abs(stock.changePercent).toFixed(2)}%
                  </span>
                </div>
                <div className={`text-[10px] font-mono ${stock.change >= 0 ? 'financial-change-positive' : 'financial-change-negative'}`} data-testid={`text-change-${stock.symbol}`}>
                  {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm text-foreground" data-testid={`text-volume-${stock.symbol}`}>
                  {formatVolume(stock.volume)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  shares
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}