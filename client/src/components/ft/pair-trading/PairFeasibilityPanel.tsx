import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  usePairMatrix,
  usePairTradingGroups,
  type GroupType,
  type PairMethod,
} from '@/hooks/use-pair-trading';
import { PairControlsBar, type View } from './PairControlsBar';
import { PairMatrix } from './PairMatrix';
import { PairChartView } from './PairChartView';

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

  const handleViewChart = () => {
    if (selectedPair || (matrixQuery.data && matrixQuery.data.symbols.length >= 2)) {
      if (!selectedPair && matrixQuery.data) {
        const [x, y] = matrixQuery.data.symbols;
        setSelectedPair({ x, y });
      }
      setView('chart');
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
      <PairControlsBar
        groupType={groupType}
        onGroupTypeChange={setGroupType}
        group={group}
        onGroupChange={setGroup}
        availableGroups={availableGroups}
        groupsLoading={groupsQuery.isLoading}
        groupsError={groupsQuery.isError}
        method={method}
        onMethodChange={setMethod}
        lookbackInput={lookbackInput}
        onLookbackInputChange={setLookbackInput}
        symbolSearch={symbolSearch}
        onSymbolSearchChange={setSymbolSearch}
        onApply={handleApply}
        onReset={handleReset}
        applyDisabled={!group}
        view={view}
        onViewMatrix={() => setView('matrix')}
        onViewChart={handleViewChart}
        onRefresh={() => matrixQuery.refetch()}
        isRefreshing={matrixQuery.isFetching}
      />

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
