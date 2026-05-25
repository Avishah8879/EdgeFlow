import { useMemo, useState, memo } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, ArrowUpDown } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import MiniPriceChart from "./MiniPriceChart";

interface ExpertScreenerResult {
  symbol: string;
  close: number;
  volume: number;
  liquidity: number;
  as_of: string;
  indicators: Record<string, number | null>;
}

type SortKey = "symbol" | "close" | "volume" | "liquidity" | string;
type SortDirection = "asc" | "desc";

const formatLiquidity = (value: number) => {
  if (value >= 1e9) return `₹${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e7) return `₹${(value / 1e7).toFixed(2)}Cr`;
  return `₹${(value / 1e5).toFixed(2)}L`;
};

const formatVolume = (value: number) => {
  if (value >= 1e7) return `${(value / 1e7).toFixed(2)}Cr`;
  if (value >= 1e5) return `${(value / 1e5).toFixed(2)}L`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString("en-IN");
};

const tickerInitials = (symbol: string) => {
  const cleaned = symbol.replace(/[^A-Z0-9]/gi, "");
  return cleaned.slice(0, 2).toUpperCase();
};

const SymbolHoverLink = memo(
  ({ symbol }: { symbol: string }) => (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <Link
          href={`/stocks/${symbol}`}
          className="font-mono text-sm font-semibold text-foreground hover:text-primary transition-colors"
          data-testid={`link-result-${symbol}`}
        >
          {symbol}
        </Link>
      </HoverCardTrigger>
      <HoverCardContent className="w-[340px] p-4" align="start">
        <MiniPriceChart ticker={symbol} />
      </HoverCardContent>
    </HoverCard>
  ),
  (prev, next) => prev.symbol === next.symbol,
);
SymbolHoverLink.displayName = "SymbolHoverLink";

interface ResultsTableProps {
  results: ExpertScreenerResult[];
  indicatorColumns?: string[];
}

export default function ResultsTable({ results, indicatorColumns = [] }: ResultsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("liquidity");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const sortOptions = useMemo(
    () => [
      { key: "liquidity", label: "Liquidity" },
      { key: "close", label: "Close" },
      { key: "volume", label: "Volume" },
      { key: "symbol", label: "Symbol" },
      ...indicatorColumns.map((ind) => ({ key: ind, label: ind })),
    ],
    [indicatorColumns],
  );

  const sorted = useMemo(() => {
    const getValue = (r: ExpertScreenerResult): number | string => {
      if (sortKey === "symbol") return r.symbol;
      if (sortKey === "close") return r.close;
      if (sortKey === "volume") return r.volume;
      if (sortKey === "liquidity") return r.liquidity;
      return r.indicators?.[sortKey] ?? -Infinity;
    };
    return [...results].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      let cmp: number;
      if (typeof av === "string" && typeof bv === "string") {
        cmp = av.localeCompare(bv);
      } else {
        cmp = (av as number) - (bv as number);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [results, sortKey, sortDir]);

  const downloadCSV = () => {
    if (results.length === 0) return;
    const headers = ["Symbol", "Close", "Volume", "Liquidity", ...indicatorColumns];
    const csvRows = [headers.join(",")];
    results.forEach((result) => {
      const row = [
        result.symbol,
        result.close,
        result.volume,
        result.liquidity,
        ...indicatorColumns.map((ind) => result.indicators?.[ind] ?? ""),
      ];
      csvRows.push(row.join(","));
    });
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expert-screener-results-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (results.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-sm">No stocks matched the expression yet.</p>
        <p className="text-xs mt-2">Results will appear here as stocks are screened.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-medium text-foreground">
            {results.length} {results.length === 1 ? "match" : "matches"}
          </h3>
          <p className="text-xs text-muted-foreground">
            Sorted by {sortOptions.find((o) => o.key === sortKey)?.label ?? sortKey}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="h-9 w-[160px] rounded-full" data-testid="select-sort-key">
              <SelectValue placeholder="Sort by…" />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((opt) => (
                <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-full gap-1.5"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            data-testid="button-toggle-sort-direction"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            {sortDir === "asc" ? "Asc" : "Desc"}
          </Button>
          <Button
            onClick={downloadCSV}
            variant="outline"
            size="sm"
            className="h-9 rounded-full gap-1.5"
            data-testid="button-download-csv"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
        </div>
      </div>

      {/* Card list */}
      <div className="space-y-2">
        {sorted.map((result) => (
          <div
            key={result.symbol}
            className="flex items-center gap-4 px-4 md:px-5 py-4 rounded-2xl border border-border/50 bg-card hover:border-primary/40 hover:bg-primary/5 transition-colors"
            data-testid={`row-result-${result.symbol}`}
          >
            {/* Avatar */}
            <div className="shrink-0 w-11 h-11 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-mono text-xs font-semibold text-primary">
              {tickerInitials(result.symbol)}
            </div>

            {/* Symbol + meta */}
            <div className="flex-1 min-w-0 space-y-0.5">
              <SymbolHoverLink symbol={result.symbol} />
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>Liq <span className="font-mono text-foreground/80">{formatLiquidity(result.liquidity)}</span></span>
                <span className="opacity-40">·</span>
                <span>Vol <span className="font-mono text-foreground/80">{formatVolume(result.volume)}</span></span>
              </div>
            </div>

            {/* Indicators (compact) — hidden on mobile to keep the row scannable */}
            {indicatorColumns.length > 0 && (
              <div className="hidden md:flex items-center gap-3 max-w-[40%] overflow-x-auto">
                {indicatorColumns.slice(0, 4).map((ind) => {
                  const val = result.indicators?.[ind];
                  return (
                    <div key={ind} className="flex flex-col gap-0.5 shrink-0 min-w-[60px]">
                      <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/80 truncate">{ind}</span>
                      <span className={cn(
                        "font-mono text-xs",
                        val == null ? "text-muted-foreground" : "text-foreground",
                      )}>
                        {val != null ? val.toFixed(2) : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Price */}
            <div className="shrink-0 text-right">
              <div className="font-mono text-sm font-semibold text-foreground tabular-nums">
                ₹{result.close.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-[0.15em]">close</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
