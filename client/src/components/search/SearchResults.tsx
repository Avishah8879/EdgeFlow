import { TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SearchResult } from "@/hooks/use-search";

// Helper to get suffix display config (label + colors)
function getSuffixConfig(suffix: string | null): { label: string; className: string } | null {
  if (!suffix || suffix === '-EQ') return null; // Skip regular equity
  const config: Record<string, { label: string; className: string }> = {
    '-SM': { label: 'SME', className: 'bg-blue-500/20 text-blue-400' },
    '-BE': { label: 'Trade-to-Trade', className: 'bg-amber-500/20 text-amber-400' },
    '-ST': { label: 'Surveillance', className: 'bg-orange-500/20 text-orange-400' },
    '-INDEX': { label: 'Index', className: 'bg-purple-500/20 text-purple-400' },
    '-NAV': { label: 'NAV', className: 'bg-teal-500/20 text-teal-400' },
  };
  return config[suffix] || null;
}

interface SearchResultsProps {
  results: SearchResult[];
  isLoading: boolean;
  isPricesLoading: boolean;
  onSelect: (result: SearchResult) => void;
  selectedIndex?: number;
}

export function SearchResults({
  results,
  isLoading,
  isPricesLoading,
  onSelect,
  selectedIndex = -1,
}: SearchResultsProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No results found
      </div>
    );
  }

  return (
    <div>
      {results.map((result, index) => (
        <SearchResultItem
          key={result.ticker_id}
          result={result}
          index={index}
          isPricesLoading={isPricesLoading}
          isSelected={index === selectedIndex}
          onClick={() => onSelect(result)}
        />
      ))}
    </div>
  );
}

interface SearchResultItemProps {
  result: SearchResult;
  index: number;
  isPricesLoading: boolean;
  isSelected: boolean;
  onClick: () => void;
}

function SearchResultItem({
  result,
  index,
  isPricesLoading,
  isSelected,
  onClick,
}: SearchResultItemProps) {
  const displayName = result.long_name || result.name || result.symbol;
  const hasPrice = result.current_price !== undefined;
  const changePercent = result.change_percent ?? 0;
  const isPositive = changePercent > 0;
  const isNegative = changePercent < 0;
  const suffixConfig = getSuffixConfig(result.suffix);

  return (
    <button
      onClick={onClick}
      data-index={index}
      className={cn(
        "w-full px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-2 sm:gap-4 hover:bg-muted/50 transition-colors text-left border-b border-border/50 last:border-b-0",
        isSelected && "bg-muted"
      )}
    >
      {/* Left side: Name and Symbol */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="text-sm font-medium truncate">
          {displayName}
        </div>
        <div className="text-xs text-muted-foreground font-mono flex items-center gap-1 truncate">
          {result.symbol}
          {suffixConfig && (
            <span className={cn("px-1 py-px rounded text-[9px] font-medium leading-none shrink-0", suffixConfig.className)}>
              {suffixConfig.label}
            </span>
          )}
        </div>
      </div>

      {/* Right side: Price and Change */}
      <div className="text-right shrink-0 min-w-[65px] sm:min-w-0">
        {isPricesLoading && !hasPrice ? (
          <div className="flex flex-col items-end gap-1">
            <div className="h-4 w-16 bg-muted animate-pulse rounded" />
            <div className="h-3 w-12 bg-muted animate-pulse rounded" />
          </div>
        ) : hasPrice ? (
          <>
            <div className="text-sm font-semibold">
              {formatPrice(result.current_price!)}
            </div>
            <div
              className={cn(
                "text-xs font-medium inline-flex items-center gap-0.5",
                isPositive && "text-positive",
                isNegative && "text-negative",
                !isPositive && !isNegative && "text-muted-foreground"
              )}
            >
              {isPositive && <TrendingUp className="h-3 w-3" />}
              {isNegative && <TrendingDown className="h-3 w-3" />}
              {isPositive ? "+" : ""}
              {changePercent.toFixed(2)}%
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">--</div>
        )}
      </div>
    </button>
  );
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}
