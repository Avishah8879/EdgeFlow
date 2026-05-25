import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { usePairWatchlist, useDeletePairWatchlistEntry } from '@/hooks/use-pair-watchlist';
import type { SavedPairWatchlistEntry } from '@/hooks/use-pair-watchlist';
import { PairChartView } from './PairChartView';
import type { PairMethod } from '@/hooks/use-pair-trading';

interface SelectedPair {
  symbolA: string;
  symbolB: string;
  lookbackDays: number;
  method: PairMethod;
  matrixScore: number | null;
  pvalue?: number | null;
}

function fmt(n: number | null | undefined, decimals: number, suffix = ''): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(decimals)}${suffix}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PairWatchlistPanel() {
  const [selectedPair, setSelectedPair] = useState<SelectedPair | null>(null);

  const { data, isLoading, isError } = usePairWatchlist();
  const deleteMutation = useDeletePairWatchlistEntry();

  const handleDelete = (entry: SavedPairWatchlistEntry) => {
    deleteMutation.mutate(entry.id, {
      onSuccess: () => toast.success(`Removed ${entry.symbol1} / ${entry.symbol2}`),
      onError: (err) => toast.error(err.message),
    });
  };

  const handleViewChart = (entry: SavedPairWatchlistEntry) => {
    setSelectedPair({
      symbolA: entry.symbol1,
      symbolB: entry.symbol2,
      lookbackDays: entry.lookback_days,
      method: entry.method as PairMethod,
      matrixScore: entry.correlation,
      pvalue: entry.pvalue,
    });
  };

  if (selectedPair !== null) {
    return (
      <PairChartView
        xSymbol={selectedPair.symbolA}
        ySymbol={selectedPair.symbolB}
        lookbackDays={selectedPair.lookbackDays}
        method={selectedPair.method}
        matrixScore={selectedPair.matrixScore}
        pvalue={selectedPair.pvalue}
        onBack={() => setSelectedPair(null)}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">Loading watchlist…</div>
    );
  }

  if (isError) {
    return (
      <div className="py-16 text-center text-destructive text-sm">Failed to load watchlist.</div>
    );
  }

  const entries = data?.results ?? [];

  if (entries.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        No saved pairs yet. Run a scan and save pairs to see them here.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Name</th>
            <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Symbol A</th>
            <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Symbol B</th>
            <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Correlation</th>
            <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Beta</th>
            <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Delta (σ%)</th>
            <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Method</th>
            <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Lookback</th>
            <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Saved</th>
            <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.id}
              className="border-b border-border/50 hover:bg-muted/30 transition-colors"
            >
              <td className="px-4 py-2.5 text-foreground max-w-[120px] truncate">{entry.name}</td>
              <td className="px-4 py-2.5 font-mono font-medium text-foreground">{entry.symbol1}</td>
              <td className="px-4 py-2.5 font-mono font-medium text-foreground">{entry.symbol2}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-foreground">
                {fmt(entry.correlation, 1)}
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-foreground">
                {fmt(entry.beta, 3)}
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-foreground">
                {fmt(entry.delta, 3, '%')}
              </td>
              <td className="px-4 py-2.5 text-right text-muted-foreground capitalize">{entry.method}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{entry.lookback_days}d</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                {formatDate(entry.created_at)}
              </td>
              <td className="px-4 py-2.5 text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleViewChart(entry)}>
                    View Chart
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(entry)}
                    disabled={deleteMutation.isPending}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
