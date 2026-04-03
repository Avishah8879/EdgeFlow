import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SearchInput } from "./SearchInput";
import { SearchResults } from "./SearchResults";
import { RecentSearches } from "./RecentSearches";
import { TrendingStocks } from "./TrendingStocks";
import { useSearch, useTrendingStocks, type SearchResult } from "@/hooks/use-search";
import {
  getSearchHistory,
  addToSearchHistory,
  removeFromSearchHistory,
  clearSearchHistory,
  type RecentSearch,
} from "@/lib/search-history";
import { cn } from "@/lib/utils";
import { useTracking } from "@/contexts/TrackingContext";

// Helper to get the correct route based on suffix
function getDetailRoute(symbol: string, suffix: string | null | undefined): string {
  const encodedSymbol = encodeURIComponent(symbol);
  // Both -INDEX and -NAV suffixes are market indices
  if (suffix === '-INDEX' || suffix === '-NAV') {
    return `/index/${encodedSymbol}`;
  }
  return `/stocks/${encodedSymbol}`;
}

interface SearchBarProps {
  /** Variant: 'inline' for navbar dropdown, 'dialog' for command palette */
  variant?: "inline" | "dialog";
  /** Close callback (required for dialog, optional for inline) */
  onClose?: () => void;
  /** Placeholder text */
  placeholder?: string;
  /** Additional input class names (inline variant only) */
  inputClassName?: string;
  /** Test ID for the input element */
  testId?: string;
  /** Enable Ctrl+K keyboard shortcut to focus this search bar */
  enableGlobalShortcut?: boolean;
}

export function SearchBar({
  variant = "dialog",
  onClose,
  placeholder = "Search for stocks",
  inputClassName,
  testId,
  enableGlobalShortcut = false,
}: SearchBarProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // OS detection for shortcut badge
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const shortcutKey = isMac ? '⌘' : 'Ctrl';

  // Tracking
  const { trackSearch } = useTracking();

  // Global Ctrl+K / Cmd+K shortcut to focus search
  useEffect(() => {
    if (!enableGlobalShortcut) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
        setIsDropdownOpen(true);
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [enableGlobalShortcut]);

  // Search hook
  const {
    results,
    isLoading,
    isPricesLoading,
  } = useSearch(searchTerm, searchTerm.length >= 1);

  // Trending stocks hook - only fetch when dropdown is open (inline) or always (dialog)
  // This prevents unnecessary API calls when SearchBar is mounted but not in use
  const shouldFetchTrending = variant === "dialog" || isDropdownOpen;
  const {
    data: trendingStocks = [],
    isLoading: isTrendingLoading,
  } = useTrendingStocks(5, shouldFetchTrending);

  // Load recent searches on mount (dialog) or when dropdown opens (inline)
  useEffect(() => {
    if (variant === "dialog") {
      setRecentSearches(getSearchHistory());
    }
  }, [variant]);

  useEffect(() => {
    if (variant === "inline" && isDropdownOpen) {
      setRecentSearches(getSearchHistory());
    }
  }, [variant, isDropdownOpen]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [results]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && dropdownRef.current) {
      const selectedItem = dropdownRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedIndex]);

  // Click outside handler for inline variant
  useEffect(() => {
    if (variant !== "inline" || !isDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [variant, isDropdownOpen]);

  // Handle selecting a search result
  const handleSelectResult = useCallback(
    (result: SearchResult) => {
      // Track search event with selected result
      if (searchTerm.trim()) {
        trackSearch(searchTerm.trim(), results.length, result.symbol);
      }

      // Add to history (include suffix for proper routing later)
      addToSearchHistory({
        symbol: result.symbol,
        long_name: result.long_name,
        suffix: result.suffix,
      });

      // Clear state
      setSearchTerm("");
      setSelectedIndex(-1);

      if (variant === "inline") {
        setIsDropdownOpen(false);
        inputRef.current?.blur();
      }

      // Navigate to detail page (stock or index based on suffix)
      navigate(getDetailRoute(result.symbol, result.suffix));

      // Close the search (dialog mode)
      onClose?.();
    },
    [navigate, onClose, variant, searchTerm, results.length, trackSearch]
  );

  // Handle selecting from recent searches
  const handleSelectRecent = useCallback(
    (search: RecentSearch) => {
      setSearchTerm("");
      setSelectedIndex(-1);

      if (variant === "inline") {
        setIsDropdownOpen(false);
        inputRef.current?.blur();
      }

      // Navigate to detail page (stock or index based on suffix)
      navigate(getDetailRoute(search.symbol, search.suffix));
      onClose?.();
    },
    [navigate, onClose, variant]
  );

  // Handle selecting from trending stocks
  const handleSelectTrending = useCallback(
    (stock: { symbol: string; long_name?: string; name?: string }) => {
      // Track search selection (trending stock)
      trackSearch("trending", trendingStocks.length, stock.symbol);

      // Add to history
      addToSearchHistory({
        symbol: stock.symbol,
        long_name: stock.long_name || stock.name || null,
      });

      setSearchTerm("");
      setSelectedIndex(-1);

      if (variant === "inline") {
        setIsDropdownOpen(false);
        inputRef.current?.blur();
      }

      navigate(`/stocks/${encodeURIComponent(stock.symbol)}`);
      onClose?.();
    },
    [navigate, onClose, variant, trackSearch, trendingStocks.length]
  );

  // Handle removing from recent searches
  const handleRemoveRecent = useCallback((symbol: string) => {
    removeFromSearchHistory(symbol);
    setRecentSearches(getSearchHistory());
  }, []);

  // Handle clearing all recent searches
  const handleClearAllRecent = useCallback(() => {
    clearSearchHistory();
    setRecentSearches([]);
  }, []);

  // Handle clearing search input
  const handleClearSearch = useCallback(() => {
    setSearchTerm("");
    inputRef.current?.focus();
  }, []);

  const isSearching = searchTerm.length >= 1;

  // Calculate total navigable items based on current state
  const getNavigableItemsCount = () => {
    if (isSearching) {
      return results.length;
    } else {
      // Recent searches + trending stocks
      return recentSearches.length + trendingStocks.length;
    }
  };

  // Handle selection based on current index
  const handleNavigableItemSelect = (index: number) => {
    if (isSearching) {
      if (results[index]) {
        handleSelectResult(results[index]);
      }
    } else {
      // First section: recent searches, second section: trending stocks
      if (index < recentSearches.length) {
        handleSelectRecent(recentSearches[index]);
      } else {
        const trendingIndex = index - recentSearches.length;
        if (trendingStocks[trendingIndex]) {
          handleSelectTrending(trendingStocks[trendingIndex]);
        }
      }
    }
  };

  // Keyboard navigation handler (used directly on input)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const totalItems = getNavigableItemsCount();

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (variant === "inline") {
        setIsDropdownOpen(true);
      }
      if (totalItems > 0) {
        setSelectedIndex((prev) => {
          const next = prev + 1;
          return next >= totalItems ? 0 : next; // Wrap around
        });
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (variant === "inline") {
        setIsDropdownOpen(true);
      }
      if (totalItems > 0) {
        setSelectedIndex((prev) => {
          const next = prev - 1;
          return next < 0 ? totalItems - 1 : next; // Wrap around
        });
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0) {
        handleNavigableItemSelect(selectedIndex);
      } else if (totalItems > 0) {
        // If no selection, select first item
        handleNavigableItemSelect(0);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (variant === "inline") {
        setIsDropdownOpen(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
      } else {
        onClose?.();
      }
    }
  };
  const showEmptyState = !isSearching && !isLoading;

  // Inline variant: Input with dropdown
  if (variant === "inline") {
    const showDropdown = isDropdownOpen;

    return (
      <div ref={containerRef} className="relative w-full">
        <div className="search-glow-container w-full">
          <div className="search-glow-bg" />
          <div className="search-glow-border" />
          <div className="search-glow-inner">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground z-10" />
            <Input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setIsDropdownOpen(true);
                setSelectedIndex(-1);
              }}
              onFocus={() => setIsDropdownOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              autoComplete="off"
              className={cn("pl-9 pr-16 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0", inputClassName)}
              data-testid={testId}
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  inputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground z-10"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <div className="search-shortcut-badge absolute right-3 top-1/2 -translate-y-1/2">
                {shortcutKey}+K
              </div>
            )}
          </div>
        </div>

        {showDropdown && (
          <div
            ref={dropdownRef}
            className="absolute left-0 top-full z-50 mt-1 w-full min-w-[280px] max-h-[60vh] sm:max-h-[400px] overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-lg"
          >
            {isSearching ? (
              // Search Results
              isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
                </div>
              ) : (
                <SearchResults
                  results={results}
                  isLoading={false}
                  isPricesLoading={isPricesLoading}
                  onSelect={handleSelectResult}
                  selectedIndex={selectedIndex}
                />
              )
            ) : showEmptyState ? (
              // Empty State: Recent Searches + Trending
              <>
                <RecentSearches
                  searches={recentSearches}
                  onSelect={handleSelectRecent}
                  onRemove={handleRemoveRecent}
                  onClearAll={handleClearAllRecent}
                  selectedIndex={selectedIndex}
                />
                {recentSearches.length > 0 && trendingStocks.length > 0 && (
                  <div className="border-t" />
                )}
                <TrendingStocks
                  stocks={trendingStocks}
                  isLoading={isTrendingLoading}
                  onSelect={handleSelectTrending}
                  selectedIndex={selectedIndex}
                  startIndex={recentSearches.length}
                />
                {recentSearches.length === 0 && trendingStocks.length === 0 && !isTrendingLoading && (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    Start typing to search stocks
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  // Dialog variant: SearchInput with content area (original behavior)
  return (
    <div className="flex flex-col">
      {/* Search Input */}
      <SearchInput
        ref={inputRef}
        value={searchTerm}
        onChange={setSearchTerm}
        onClear={handleClearSearch}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isSearching ? (
          // Search Results
          <SearchResults
            results={results}
            isLoading={isLoading}
            isPricesLoading={isPricesLoading}
            onSelect={handleSelectResult}
            selectedIndex={selectedIndex}
          />
        ) : showEmptyState ? (
          // Empty State: Recent Searches + Trending
          <>
            <RecentSearches
              searches={recentSearches}
              onSelect={handleSelectRecent}
              onRemove={handleRemoveRecent}
              onClearAll={handleClearAllRecent}
            />
            {recentSearches.length > 0 && trendingStocks.length > 0 && (
              <div className="border-t" />
            )}
            <TrendingStocks
              stocks={trendingStocks}
              isLoading={isTrendingLoading}
              onSelect={handleSelectTrending}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
