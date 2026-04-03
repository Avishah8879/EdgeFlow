import { Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecentSearch } from "@/lib/search-history";

interface RecentSearchesProps {
  searches: RecentSearch[];
  onSelect: (search: RecentSearch) => void;
  onRemove: (symbol: string) => void;
  onClearAll?: () => void;
  selectedIndex?: number;
}

export function RecentSearches({
  searches,
  onSelect,
  onRemove,
  onClearAll,
  selectedIndex = -1,
}: RecentSearchesProps) {
  if (searches.length === 0) {
    return null;
  }

  return (
    <div className="py-2">
      <div className="px-3 sm:px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Recent Searches
        </span>
        {onClearAll && searches.length > 1 && (
          <button
            onClick={onClearAll}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear all
          </button>
        )}
      </div>
      <div>
        {searches.map((search, index) => (
          <RecentSearchItem
            key={search.symbol}
            search={search}
            index={index}
            isSelected={index === selectedIndex}
            onSelect={() => onSelect(search)}
            onRemove={() => onRemove(search.symbol)}
          />
        ))}
      </div>
    </div>
  );
}

interface RecentSearchItemProps {
  search: RecentSearch;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

function RecentSearchItem({ search, index, isSelected, onSelect, onRemove }: RecentSearchItemProps) {
  const displayName = search.long_name || search.symbol;

  return (
    <div
      data-index={index}
      className={cn(
        "group flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 hover:bg-muted/50 transition-colors",
        isSelected && "bg-muted"
      )}
    >
      <button
        onClick={onSelect}
        className="flex-1 flex items-center gap-2 sm:gap-3 text-left min-w-0"
      >
        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm truncate">{displayName}</span>
        <span className="text-xs px-1.5 sm:px-2 py-0.5 rounded bg-accent text-accent-foreground shrink-0">
          STOCK
        </span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="p-1 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-muted rounded transition-all"
        aria-label={`Remove ${search.symbol} from history`}
      >
        <X className="h-3 w-3 text-muted-foreground" />
      </button>
    </div>
  );
}
