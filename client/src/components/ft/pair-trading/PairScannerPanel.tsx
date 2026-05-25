import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  usePairTradingGroups,
  usePairScan,
  type GroupType,
  type PairMethod,
  type ScanConditions,
  type PairScanResult,
} from '@/hooks/use-pair-trading';
import { useSavePairWatchlistEntry } from '@/hooks/use-pair-watchlist';
import { useAuth } from '@/contexts/AuthContext';
import { PairControlsBar } from './PairControlsBar';
import { PairChartView } from './PairChartView';
import { ScanConditionsBlock } from './ScanConditionsBlock';

interface AppliedScan {
  groupType: GroupType;
  group: string;
  method: PairMethod;
  lookbackDays: number;
  conditions: ScanConditions;
}

interface SelectedPair {
  symbolA: string;
  symbolB: string;
  correlation: number | null;
  pvalue?: number | null;
}

interface SaveTarget {
  row: PairScanResult;
}

function fmt(n: number | null | undefined, decimals: number, suffix = ''): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(decimals)}${suffix}`;
}

export function PairScannerPanel() {
  const { user } = useAuth();

  // Controls state
  const [groupType, setGroupType] = useState<GroupType>('sector');
  const [group, setGroup] = useState<string>('');
  const [method, setMethod] = useState<PairMethod>('correlation');
  const [lookbackInput, setLookbackInput] = useState<string>('40');
  const [symbolSearch, setSymbolSearch] = useState('');

  // Conditions state
  const [conditions, setConditions] = useState<ScanConditions>({});
  const [conditionsKey, setConditionsKey] = useState(0);
  const [validationError, setValidationError] = useState('');

  // Frozen params/conditions — only update on valid Run Scan
  const [appliedScan, setAppliedScan] = useState<AppliedScan | null>(null);

  // Chart drill-down — set when View Chart is clicked; cleared on Back
  const [selectedPair, setSelectedPair] = useState<SelectedPair | null>(null);

  // Save dialog state
  const [saveTarget, setSaveTarget] = useState<SaveTarget | null>(null);
  const [saveName, setSaveName] = useState('');

  const saveMutation = useSavePairWatchlistEntry();

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

  const scanQuery = usePairScan({
    groupType: appliedScan?.groupType ?? 'sector',
    group: appliedScan?.group ?? '',
    method: appliedScan?.method ?? 'correlation',
    lookbackDays: appliedScan?.lookbackDays ?? 40,
    conditions: appliedScan?.conditions ?? {},
    enabled: appliedScan !== null,
  });

  const sortedResults = useMemo((): PairScanResult[] => {
    if (!scanQuery.data?.results) return [];
    return [...scanQuery.data.results].sort((a, b) => {
      const ca = a.correlation ?? -Infinity;
      const cb = b.correlation ?? -Infinity;
      return cb - ca;
    });
  }, [scanQuery.data?.results]);

  const handleApply = () => {
    const parsed = parseInt(lookbackInput, 10);
    const lookbackDays = Number.isFinite(parsed) ? Math.max(10, Math.min(500, parsed)) : 40;
    setLookbackInput(String(lookbackDays));
  };

  const handleControlsReset = () => {
    setGroupType('sector');
    setMethod('correlation');
    setLookbackInput('40');
    setSymbolSearch('');
    if (groupsQuery.data?.sectors.length) {
      setGroup(groupsQuery.data.sectors[0]);
    }
  };

  const handleRunScan = () => {
    const checks: [string, number | undefined, number | undefined][] = [
      ['Correlation', conditions.correlationMin, conditions.correlationMax],
    ];
    for (const [label, min, max] of checks) {
      if (min !== undefined && max !== undefined && min > max) {
        setValidationError(`${label}: min must be ≤ max.`);
        return;
      }
    }
    setValidationError('');
    const parsed = parseInt(lookbackInput, 10);
    const lookbackDays = Number.isFinite(parsed) ? Math.max(10, Math.min(500, parsed)) : 40;
    setLookbackInput(String(lookbackDays));
    setSelectedPair(null);
    setAppliedScan({ groupType, group, method, lookbackDays, conditions: { ...conditions } });
  };

  const handleConditionsReset = () => {
    setConditions({});
    setConditionsKey((k) => k + 1);
    setAppliedScan(null);
    setSelectedPair(null);
    setValidationError('');
  };

  const openSaveDialog = (row: PairScanResult) => {
    setSaveTarget({ row });
    setSaveName(`${row.symbolA} / ${row.symbolB}`);
  };

  const handleSaveConfirm = () => {
    if (!saveTarget || !appliedScan) return;
    const { row } = saveTarget;
    saveMutation.mutate(
      {
        name: saveName.trim() || `${row.symbolA} / ${row.symbolB}`,
        symbol1: row.symbolA,
        symbol2: row.symbolB,
        method: appliedScan.method,
        lookbackDays: appliedScan.lookbackDays,
        correlation: row.correlation,
        beta: row.beta,
        delta: row.delta,
        pvalue: row.pvalue,
      },
      {
        onSuccess: () => {
          toast.success(`Saved ${row.symbolA} / ${row.symbolB} to watchlist`);
          setSaveTarget(null);
          setSaveName('');
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const correlationHeader =
    appliedScan?.method === 'cointegration' ? 'Coint Score' : 'Correlation';

  return (
    <TooltipProvider>
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
          onReset={handleControlsReset}
          applyDisabled={!group}
        />

        <ScanConditionsBlock
          key={conditionsKey}
          value={conditions}
          onChange={setConditions}
          onRun={handleRunScan}
          onReset={handleConditionsReset}
          method={method}
          runDisabled={!group}
          validationError={validationError}
        />

        {/* Chart drill-down — replaces results area when a row's View Chart is clicked */}
        {selectedPair !== null && appliedScan !== null && (
          <PairChartView
            xSymbol={selectedPair.symbolA}
            ySymbol={selectedPair.symbolB}
            lookbackDays={appliedScan.lookbackDays}
            method={appliedScan.method}
            matrixScore={selectedPair.correlation}
            pvalue={selectedPair.pvalue}
            onBack={() => setSelectedPair(null)}
          />
        )}

        {/* Results area — hidden while chart is open */}
        {selectedPair === null && (
          <>
            {appliedScan === null && (
              <div className="py-16 text-center text-muted-foreground text-sm">
                Configure conditions and run a scan.
              </div>
            )}

            {appliedScan !== null && (
              <>
                {scanQuery.data?.truncated && (
                  <div className="flex items-center gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400">
                    <AlertTriangle className="w-4 h-4" />
                    Showing the first {scanQuery.data.symbol_cap} symbols in this{' '}
                    {appliedScan.groupType}. Refine by industry for a complete view.
                  </div>
                )}

                {scanQuery.isLoading && (
                  <div className="py-16 text-center text-muted-foreground text-sm">
                    Scanning…
                  </div>
                )}

                {scanQuery.isError && (
                  <div className="py-16 text-center text-destructive text-sm">
                    Scan failed: {(scanQuery.error as Error).message}
                  </div>
                )}

                {!scanQuery.isLoading && scanQuery.data && sortedResults.length === 0 && (
                  <div className="py-16 text-center text-muted-foreground text-sm">
                    No pairs matched the conditions.
                  </div>
                )}

                {!scanQuery.isLoading && sortedResults.length > 0 && (
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                            Symbol A
                          </th>
                          <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                            Symbol B
                          </th>
                          <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                            {correlationHeader}
                          </th>
                          <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                            Beta
                          </th>
                          <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                            Delta (σ%)
                          </th>
                          <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedResults.map((row) => (
                          <tr
                            key={`${row.symbolA}-${row.symbolB}`}
                            className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                          >
                            <td className="px-4 py-2.5 font-mono font-medium text-foreground">
                              {row.symbolA}
                            </td>
                            <td className="px-4 py-2.5 font-mono font-medium text-foreground">
                              {row.symbolB}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums text-foreground">
                              {fmt(row.correlation, 1)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums text-foreground">
                              {fmt(row.beta, 3)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums text-foreground">
                              {fmt(row.delta, 3, '%')}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setSelectedPair({
                                      symbolA: row.symbolA,
                                      symbolB: row.symbolB,
                                      correlation: row.correlation,
                                      pvalue: row.pvalue,
                                    })
                                  }
                                >
                                  View Chart
                                </Button>
                                {user ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openSaveDialog(row)}
                                  >
                                    Save
                                  </Button>
                                ) : (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span>
                                        <Button size="sm" variant="outline" disabled>
                                          Save
                                        </Button>
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>Sign in to save pairs</TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Save name dialog */}
        <Dialog
          open={saveTarget !== null}
          onOpenChange={(open) => {
            if (!open) {
              setSaveTarget(null);
              setSaveName('');
            }
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Save pair to watchlist</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="save-pair-name" className="text-sm">
                Name
              </Label>
              <Input
                id="save-pair-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveConfirm();
                }}
                placeholder="e.g. Tech hedge"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setSaveTarget(null);
                  setSaveName('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveConfirm}
                disabled={saveMutation.isPending || !saveName.trim()}
              >
                {saveMutation.isPending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
