import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type PairMethod, type ScanConditions } from '@/hooks/use-pair-trading';

interface ScanConditionsBlockProps {
  value: ScanConditions;
  onChange: (c: ScanConditions) => void;
  onRun: () => void;
  onReset: () => void;
  method: PairMethod;
  runDisabled?: boolean;
  validationError?: string;
}

type StringFields = {
  correlationMin: string;
  correlationMax: string;
};

function toStr(n: number | undefined): string {
  return n !== undefined ? String(n) : '';
}

function parseConditions(s: StringFields): ScanConditions {
  const n = (v: string): number | undefined => {
    const p = parseFloat(v);
    return Number.isFinite(p) ? p : undefined;
  };
  return {
    correlationMin: n(s.correlationMin),
    correlationMax: n(s.correlationMax),
  };
}

export function ScanConditionsBlock({
  value,
  onChange,
  onRun,
  onReset,
  method,
  runDisabled,
  validationError,
}: ScanConditionsBlockProps) {
  const [strings, setStrings] = useState<StringFields>({
    correlationMin: toStr(value.correlationMin),
    correlationMax: toStr(value.correlationMax),
  });

  const handleField = (field: keyof StringFields, raw: string) => {
    const next = { ...strings, [field]: raw };
    setStrings(next);
    onChange(parseConditions(next));
  };

  const rows: {
    label: string;
    minKey: keyof StringFields;
    maxKey: keyof StringFields;
  }[] = [
    {
      label: method === 'cointegration' ? 'Coint Score' : 'Correlation',
      minKey: 'correlationMin',
      maxKey: 'correlationMax',
    },
  ];

  return (
    <Card className="p-4 bg-card/50 border-primary/20">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-3">
        Conditions
      </p>

      <div className="space-y-3">
        {rows.map(({ label, minKey, maxKey }) => (
          <div key={label} className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium w-28 shrink-0">{label}</span>

            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                Min
              </Label>
              <Input
                type="number"
                step="any"
                placeholder="—"
                value={strings[minKey]}
                onChange={(e) => handleField(minKey, e.target.value)}
                className="w-24 h-9"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                Max
              </Label>
              <Input
                type="number"
                step="any"
                placeholder="—"
                value={strings[maxKey]}
                onChange={(e) => handleField(maxKey, e.target.value)}
                className="w-24 h-9"
              />
            </div>
          </div>
        ))}
      </div>

      {validationError && (
        <p className="mt-3 text-xs text-destructive">{validationError}</p>
      )}

      <div className="flex items-center gap-2 mt-4">
        <Button onClick={onRun} disabled={runDisabled}>
          Run Scan
        </Button>
        <Button variant="outline" onClick={onReset}>
          Reset Conditions
        </Button>
      </div>
    </Card>
  );
}
