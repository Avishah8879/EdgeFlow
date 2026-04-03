import { useMemo, useState, memo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  flexRender,
  ColumnDef,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { Download, ArrowUpDown } from "lucide-react";
import { Link } from "wouter";
import MiniPriceChart from "./MiniPriceChart";

interface ExpertScreenerResult {
  symbol: string;
  close: number;
  volume: number;
  liquidity: number;
  as_of: string;
  indicators: Record<string, number | null>;
}

// Memoized symbol cell to prevent hover reset on table updates
const SymbolCell = memo(
  ({ symbol, fullSymbol }: { symbol: string; fullSymbol: string }) => {
    return (
      <HoverCard openDelay={300} closeDelay={100}>
        <HoverCardTrigger asChild>
          <Link
            href={`/stocks/${symbol}`}
            className="font-semibold text-primary hover:underline"
          >
            {symbol}
          </Link>
        </HoverCardTrigger>
        <HoverCardContent className="w-[340px] p-4" align="start">
          <MiniPriceChart ticker={fullSymbol} />
        </HoverCardContent>
      </HoverCard>
    );
  },
  (prevProps, nextProps) => {
    // Only re-render if symbol or fullSymbol actually changed
    return prevProps.symbol === nextProps.symbol && prevProps.fullSymbol === nextProps.fullSymbol;
  }
);
SymbolCell.displayName = "SymbolCell";

interface ResultsTableProps {
  results: ExpertScreenerResult[];
  indicatorColumns?: string[];
}

export default function ResultsTable({
  results,
  indicatorColumns = [],
}: ResultsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "liquidity", desc: true },
  ]);

  const columns = useMemo<ColumnDef<ExpertScreenerResult>[]>(() => {
    const baseColumns: ColumnDef<ExpertScreenerResult>[] = [
      {
        accessorKey: "symbol",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="-ml-4"
            >
              Symbol
              <ArrowUpDown className="ml-2 h-3 w-3" />
            </Button>
          );
        },
        cell: ({ row }) => {
          const symbol = row.original.symbol;
          return <SymbolCell symbol={symbol} fullSymbol={symbol} />;
        },
      },
      {
        accessorKey: "close",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="-ml-4"
            >
              Close
              <ArrowUpDown className="ml-2 h-3 w-3" />
            </Button>
          );
        },
        cell: ({ row }) => {
          return (
            <span className="font-mono">₹{row.original.close.toLocaleString()}</span>
          );
        },
      },
      {
        accessorKey: "volume",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="-ml-4"
            >
              Volume
              <ArrowUpDown className="ml-2 h-3 w-3" />
            </Button>
          );
        },
        cell: ({ row }) => {
          return (
            <span className="font-mono text-xs">
              {row.original.volume.toLocaleString()}
            </span>
          );
        },
      },
      {
        accessorKey: "liquidity",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="-ml-4"
            >
              Liquidity
              <ArrowUpDown className="ml-2 h-3 w-3" />
            </Button>
          );
        },
        cell: ({ row }) => {
          const value = row.original.liquidity;
          const formatted =
            value >= 1e9
              ? `₹${(value / 1e9).toFixed(2)}B`
              : value >= 1e7
              ? `₹${(value / 1e7).toFixed(2)}Cr`
              : `₹${(value / 1e5).toFixed(2)}L`;
          return <span className="font-mono text-xs font-semibold">{formatted}</span>;
        },
      },
    ];

    // Add indicator columns
    const indicatorCols: ColumnDef<ExpertScreenerResult>[] = indicatorColumns.map(
      (indicator) => ({
        id: indicator,
        accessorFn: (row) => row.indicators?.[indicator] ?? null,
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="-ml-4"
            >
              {indicator}
              <ArrowUpDown className="ml-2 h-3 w-3" />
            </Button>
          );
        },
        cell: ({ row }) => {
          const value = row.original.indicators?.[indicator];
          return (
            <span className="font-mono text-xs">
              {value != null ? value.toFixed(2) : "—"}
            </span>
          );
        },
      })
    );

    return [...baseColumns, ...indicatorCols];
  }, [indicatorColumns]);

  const table = useReactTable({
    data: results,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.symbol, // Stable row IDs prevent re-renders
  });

  const downloadCSV = () => {
    if (results.length === 0) return;

    // Build CSV header
    const headers = ["Symbol", "Close", "Volume", "Liquidity", ...indicatorColumns];
    const csvRows = [headers.join(",")];

    // Add data rows
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

    // Create and download blob
    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            {results.length} {results.length === 1 ? "Match" : "Matches"}
          </h3>
          <p className="text-xs text-muted-foreground">
            Ranked by liquidity
          </p>
        </div>

        <Button
          onClick={downloadCSV}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <Download className="w-4 h-4" />
          Download CSV
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="hover:bg-muted/50">
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
