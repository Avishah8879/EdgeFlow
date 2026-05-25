import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Search, AlertTriangle } from 'lucide-react';
import {
  usePairMatrix,
  usePairTradingGroups,
  type GroupType,
  type PairMethod,
} from '@/hooks/use-pair-trading';
import { PairMatrix } from './PairMatrix';
import { PairChartView } from './PairChartView';

type View = 'matrix' | 'chart';

export function PairFeasibilityPanel() {
  const [groupType, setGroupType] = useState<GroupType>('sector');
  const [group, setGroup] = useState<string>('');
  const [method, setMethod] = useState<PairMethod>('correlation');
  const [lookbackInput, setLookbackInput] = useState<string>('40');
  const [applied, setApplied] = useState<{
    groupType: GroupType;
    group: string;
    method: PairMethod;
    lookbackDays: number;
  } | null>(null);
  const [symbolSearch, setSymbolSearch] = useState('');
  const [view, setView] = useState<View>('matrix');
  const [selectedPair, setSelectedPair] = useState<{ x: string; y: string } | null>(null);

  const groupsQuery = usePairTradingGroups();
  const availableGroups = useMemo(() => {
    if (!groupsQuery.data) return [] as string[];
    return groupType === 'sector' ? groupsQuery.data.sectors : groupsQuery.data.industries;
  }, [groupsQuery.data, groupType]);

  useEffect(() => {
    if (!group && availableGroups.length > 0) {
      setGroup(availableGroups[0]);
    }
  }, [availableGroups, group]);

  useEffect(() => {
    if (group && !availableGroups.includes(group)) {
      setGroup(availableGroups[0] ?? '');
    }
  }, [availableGroups, group]);

  useEffect(() => {
    if (!applied && group) {
      setApplied({ groupType, group, method, lookbackDays: 40 });
    }
  }, [group, applied, groupType, method]);

  const matrixQuery = usePairMatrix({
    groupType: applied?.groupType ?? groupType,
    group: applied?.group ?? group,
    method: applied?.method ?? method,
    lookbackDays: applied?.lookbackDays ?? 40,
    enabled: !!applied?.group,
  });

  const handleApply = () => {
    const parsed = parseInt(lookbackInput, 10);
    const lookbackDays = Number.isFinite(parsed) ? Math.max(10, Math.min(500, parsed)) : 40;
    setLookbackInput(String(lookbackDays));
    setApplied({ groupType, group, method, lookbackDays });
    setView('matrix');
    setSelectedPair(null);
  };

  const handleReset = () => {
    setGroupType('sector');
    setMethod('correlation');
    setLookbackInput('40');
    setSymbolSearch('');
    if (groupsQuery.data?.sectors.length) {
      setGroup(groupsQuery.data.sectors[0]);
    }
  };

  const handleCellClick = (x: string, y: string) => {
    setSelectedPair({ x, y });
    setView('chart');
  };

  const handleBack = () => {
    setView('matrix');
    setSelectedPair(null);
  };

  const selectedPairMeta = useMemo(() => {
    if (!selectedPair || !matrixQuery.data) return null;
    const { symbols, matrix, pvalues } = matrixQuery.data;
    const i = symbols.indexOf(selectedPair.x);
    const j = symbols.indexOf(selectedPair.y);
    if (i < 0 || j < 0) return null;
    return {
      score: matrix[i]?.[j] ?? null,
      pvalue: pvalues?.[i]?.[j] ?? null,
    };
  }, [selectedPair, matrixQuery.data]);

  return (
    <div className="space-y-4">
      <Card className="p-3 bg-card/50 border-primary/20">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search symbol"
              value={symbolSearch}
              onChange={(e) => setSymbolSearch(e.target.value)}
              className="h-9 w-40"
            />
          </div>

          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Group Type
            </Label>
            <Select value={groupType} onValueChange={(v) => setGroupType(v as GroupType)}>
              <SelectTrigger className="w-28 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sector">Sector</SelectItem>
                <SelectItem value="industry">Industry</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {groupType === 'sector' ? 'Sector' : 'Industry'}
            </Label>
            <Select value={group} onValueChange={setGroup} disabled={availableGroups.length === 0}>
              <SelectTrigger className="w-56 h-9">
                <SelectValue
                  placeholder={
                    groupsQuery.isLoading
                      ? 'Loading…'
                      : groupsQuery.isError
                      ? 'Failed to load'
                      : availableGroups.length === 0
                      ? `No ${groupType}s available`
                      : 'Select group'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableGroups.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Method
            </Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PairMethod)}>
              <SelectTrigger className="w-40 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="correlation">Correlation</SelectItem>
                <SelectItem value="cointegration">Cointegration</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Lookback (days)
            </Label>
            <Input
              type="number"
              min={10}
              max={500}
              value={lookbackInput}
              onChange={(e) => setLookbackInput(e.target.value)}
              className="w-24 h-9"
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <Button onClick={handleApply} disabled={!group}>
              Apply
            </Button>
            <Button variant="outline" onClick={handleReset}>
              Reset
            </Button>
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setView('matrix')}
                className={`px-3 py-2 text-sm ${
                  view === 'matrix'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-transparent text-muted-foreground hover:bg-muted'
                }`}
              >
                Matrix
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedPair || (matrixQuery.data && matrixQuery.data.symbols.length >= 2)) {
                    if (!selectedPair && matrixQuery.data) {
                      const [x, y] = matrixQuery.data.symbols;
                      setSelectedPair({ x, y });
                    }
                    setView('chart');
                  }
                }}
                className={`px-3 py-2 text-sm ${
                  view === 'chart'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-transparent text-muted-foreground hover:bg-muted'
                }`}
              >
                Chart
              </button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => matrixQuery.refetch()}
              disabled={matrixQuery.isFetching}
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${matrixQuery.isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </Card>

      {matrixQuery.data?.truncated && (
        <div className="flex items-center gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400">
          <AlertTriangle className="w-4 h-4" />
          Showing the first {matrixQuery.data.symbol_cap} symbols in this {applied?.groupType}.
          Refine by industry for a complete view.
        </div>
      )}

      {view === 'matrix' && (
        <>
          {matrixQuery.isLoading && (
            <div className="py-16 text-center text-muted-foreground">Loading matrix…</div>
          )}
          {matrixQuery.error && (
            <div className="py-16 text-center text-destructive">
              Failed to load matrix: {(matrixQuery.error as Error).message}
            </div>
          )}
          {!matrixQuery.isLoading && matrixQuery.data && (
            <PairMatrix
              data={matrixQuery.data}
              onCellClick={handleCellClick}
              highlightSymbol={symbolSearch}
            />
          )}
          {!matrixQuery.isLoading && !matrixQuery.data && applied && (
            <div className="py-16 text-center text-muted-foreground">
              No data for this selection.
            </div>
          )}
        </>
      )}

      {view === 'chart' && selectedPair && (
        <PairChartView
          xSymbol={selectedPair.x}
          ySymbol={selectedPair.y}
          lookbackDays={applied?.lookbackDays ?? 40}
          method={applied?.method ?? method}
          matrixScore={selectedPairMeta?.score ?? null}
          pvalue={selectedPairMeta?.pvalue ?? null}
          onBack={handleBack}
        />
      )}
    </div>
  );
}
