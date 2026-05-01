import React, { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Trash2, Search } from "lucide-react";
import { useSymbolSearch } from "@/hooks/useSymbolSearch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { RRGChart, type RRGPeriod } from "@/components/ft/RRGChart";
import { useQueryClient } from "@tanstack/react-query";

const defaultSymbols = [
  "RELIANCE",
  "HDFCBANK",
  "TCS",
  "INFY",
  "ICICIBANK",
  "SBIN",
];
type Period = RRGPeriod;

export function SystematicPatternsPanel() {
  const [symbols, setSymbols] = useState<string[]>(defaultSymbols);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("2y");

  // Symbol search state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: searchResults = [], isLoading: isSearchLoading } =
    useSymbolSearch(searchQuery);

  const refetchRRG = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/rrg-image"] });
  };

  const handleAddSymbol = (symbol: string) => {
    const cleaned = symbol.trim().toUpperCase();
    if (!cleaned) return;
    if (symbols.includes(cleaned)) return;
    setSymbols((prev) => [...prev, cleaned]);
  };

  const handleRemove = (ticker: string) => {
    setSymbols((prev) => prev.filter((sym) => sym !== ticker));
  };

  const handleSelectSearchResult = (symbol: string) => {
    handleAddSymbol(symbol);
    setSearchQuery("");
    setIsSearchOpen(false);
    setHighlightedIndex(0);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setIsSearchOpen(false);
      setSearchQuery("");
      setHighlightedIndex(0);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        Math.min(prev + 1, searchResults.length - 1)
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (searchResults.length > 0 && highlightedIndex < searchResults.length) {
        handleSelectSearchResult(searchResults[highlightedIndex].symbol);
      } else if (searchQuery.trim()) {
        // Allow manual entry
        handleAddSymbol(searchQuery.trim().toUpperCase());
        setSearchQuery("");
        setIsSearchOpen(false);
      }
    }
  };

  // Click outside to close search dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    };
    if (isSearchOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isSearchOpen]);

  // Reset highlighted index when search results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchResults]);

  return (
    <div className="h-full flex flex-col gap-3 bg-card overflow-auto p-3">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Symbol Search Combo-Box */}
        <div ref={searchContainerRef} className="relative">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search symbol..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              onKeyDown={handleSearchKeyDown}
              className="pl-8 w-[200px] h-8"
            />
          </div>

          {/* Dropdown Results */}
          {isSearchOpen && searchQuery.length >= 2 && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-card border border-border rounded-md shadow-xl z-50 max-h-60 overflow-y-auto">
              {isSearchLoading ? (
                <div className="px-3 py-4 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                </div>
              ) : searchResults.length > 0 ? (
                searchResults.map((result, idx) => (
                  <button
                    key={result.symbol}
                    className={cn(
                      "w-full px-3 py-2 text-left border-b border-border/50 last:border-b-0 transition-colors",
                      idx === highlightedIndex
                        ? "bg-primary/20"
                        : "hover:bg-primary/10"
                    )}
                    onClick={() => handleSelectSearchResult(result.symbol)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                  >
                    <div className="text-sm font-bold font-mono text-secondary">
                      {result.symbol}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {result.name}
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No results found. Press Enter to add "
                  {searchQuery.toUpperCase()}" manually.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Period Selector */}
        <Select
          value={selectedPeriod}
          onValueChange={(v) => setSelectedPeriod(v as Period)}
        >
          <SelectTrigger className="w-20 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1y">1Y</SelectItem>
            <SelectItem value="2y">2Y</SelectItem>
            <SelectItem value="5y">5Y</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-[11px] text-muted-foreground">
          Select 2+ symbols to compute RRG.
        </span>

        <Button
          size="sm"
          variant="ghost"
          onClick={refetchRRG}
          className="ml-auto"
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {symbols.map((sym) => (
          <Badge
            key={sym}
            variant="outline"
            className="cursor-pointer flex items-center gap-1"
          >
            {sym}
            <Trash2
              className="w-3 h-3 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(sym);
              }}
            />
          </Badge>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        <RRGChart symbols={symbols} period={selectedPeriod} />
      </div>
    </div>
  );
}
