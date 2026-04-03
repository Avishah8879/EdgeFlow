import { TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrendingStock {
  ticker_id: number;
  symbol: string;
  name?: string;
  long_name?: string;
  ltp: number;
  change_percent: number;
}

interface TrendingStocksProps {
  stocks: TrendingStock[];
  isLoading: boolean;
  onSelect: (stock: TrendingStock) => void;
  selectedIndex?: number;
  startIndex?: number; // Offset for keyboard navigation (after recent searches)
}

export function TrendingStocks({
  stocks,
  isLoading,
  onSelect,
  selectedIndex = -1,
  startIndex = 0,
}: TrendingStocksProps) {
  if (isLoading) {
    return (
      <div className="py-2">
        <div className="px-3 sm:px-4 py-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Trending Stocks
          </span>
          <span className="ml-2 text-xs text-muted-foreground">Day Change</span>
        </div>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (stocks.length === 0) {
    return null;
  }

  return (
    <div className="py-2">
      <div className="px-3 sm:px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Trending Stocks
        </span>
        <span className="text-xs text-muted-foreground">Day Change</span>
      </div>
      <div>
        {stocks.map((stock, index) => (
          <TrendingStockItem
            key={stock.ticker_id || stock.symbol}
            stock={stock}
            index={startIndex + index}
            isSelected={startIndex + index === selectedIndex}
            onSelect={() => onSelect(stock)}
          />
        ))}
      </div>
    </div>
  );
}

interface TrendingStockItemProps {
  stock: TrendingStock;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}

function TrendingStockItem({ stock, index, isSelected, onSelect }: TrendingStockItemProps) {
  const displayName = stock.long_name || stock.name || stock.symbol;
  const initial = stock.symbol.charAt(0).toUpperCase();
  const changePercent = stock.change_percent ?? 0;
  const isPositive = changePercent > 0;
  const isNegative = changePercent < 0;

  return (
    <button
      onClick={onSelect}
      data-index={index}
      className={cn(
        "w-full px-3 py-2 sm:px-4 sm:py-2.5 flex items-center gap-2 sm:gap-3 hover:bg-muted/50 transition-colors text-left",
        isSelected && "bg-muted"
      )}
    >
      {/* Avatar with initial */}
      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
        <span className="text-xs sm:text-sm font-medium text-muted-foreground">
          {initial}
        </span>
      </div>

      {/* Name */}
      <span className="flex-1 text-sm truncate min-w-0">{displayName}</span>

      {/* Change percent */}
      <span
        className={cn(
          "text-sm font-medium inline-flex items-center gap-0.5 shrink-0",
          isPositive && "text-positive",
          isNegative && "text-negative",
          !isPositive && !isNegative && "text-muted-foreground"
        )}
      >
        {isPositive && <TrendingUp className="h-3 w-3" />}
        {isNegative && <TrendingDown className="h-3 w-3" />}
        {isPositive ? "+" : ""}
        {changePercent.toFixed(2)}%
      </span>
    </button>
  );
}
