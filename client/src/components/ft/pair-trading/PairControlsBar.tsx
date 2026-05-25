import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RefreshCw, Search } from 'lucide-react';
import type { GroupType, PairMethod } from '@/hooks/use-pair-trading';

export type View = 'matrix' | 'chart';

interface PairControlsBarProps {
  groupType: GroupType;
  onGroupTypeChange: (v: GroupType) => void;
  group: string;
  onGroupChange: (v: string) => void;
  availableGroups: string[];
  groupsLoading?: boolean;
  groupsError?: boolean;
  method: PairMethod;
  onMethodChange: (v: PairMethod) => void;
  lookbackInput: string;
  onLookbackInputChange: (v: string) => void;
  symbolSearch: string;
  onSymbolSearchChange: (v: string) => void;
  onApply: () => void;
  onReset: () => void;
  applyDisabled?: boolean;
  // View toggle — Feasibility-specific; omit entire block when undefined
  view?: View;
  onViewMatrix?: () => void;
  onViewChart?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function PairControlsBar({
  groupType,
  onGroupTypeChange,
  group,
  onGroupChange,
  availableGroups,
  groupsLoading,
  groupsError,
  method,
  onMethodChange,
  lookbackInput,
  onLookbackInputChange,
  symbolSearch,
  onSymbolSearchChange,
  onApply,
  onReset,
  applyDisabled,
  view,
  onViewMatrix,
  onViewChart,
  onRefresh,
  isRefreshing,
}: PairControlsBarProps) {
  const showViewToggle = view !== undefined;

  return (
    <Card className="p-3 bg-card/50 border-primary/20">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search symbol"
            value={symbolSearch}
            onChange={(e) => onSymbolSearchChange(e.target.value)}
            className="h-9 w-40"
          />
        </div>

        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Group Type
          </Label>
          <Select value={groupType} onValueChange={(v) => onGroupTypeChange(v as GroupType)}>
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
          <Select
            value={group}
            onValueChange={onGroupChange}
            disabled={availableGroups.length === 0}
          >
            <SelectTrigger className="w-56 h-9">
              <SelectValue
                placeholder={
                  groupsLoading
                    ? 'Loading…'
                    : groupsError
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
          <Select value={method} onValueChange={(v) => onMethodChange(v as PairMethod)}>
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
            onChange={(e) => onLookbackInputChange(e.target.value)}
            className="w-24 h-9"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button onClick={onApply} disabled={applyDisabled}>
            Apply
          </Button>
          <Button variant="outline" onClick={onReset}>
            Reset
          </Button>

          {showViewToggle && (
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              <button
                type="button"
                onClick={onViewMatrix}
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
                onClick={onViewChart}
                className={`px-3 py-2 text-sm ${
                  view === 'chart'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-transparent text-muted-foreground hover:bg-muted'
                }`}
              >
                Chart
              </button>
            </div>
          )}

          {onRefresh !== undefined && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
