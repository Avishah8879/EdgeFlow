import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { PairMatrixResponse } from '@/hooks/use-pair-trading';

interface Props {
  data: PairMatrixResponse;
  onCellClick?: (xSymbol: string, ySymbol: string) => void;
  highlightSymbol?: string;
}

/**
 * Maps a score (expected 0..100 for correlation positive, -100..100 theoretical)
 * to a background color. Uses semantic HSL tokens from the theme so the matrix
 * stays readable under both light and dark mode (per client/src/index.css).
 */
function cellBackground(score: number | null, method: PairMatrixResponse['method']): string {
  if (score === null || Number.isNaN(score)) return 'bg-muted/40';
  if (method === 'correlation') {
    // score in [-100, 100]
    if (score >= 100) return 'bg-[hsl(var(--positive)/0.85)] text-white';
    if (score >= 70) return 'bg-[hsl(var(--positive)/0.75)] text-white';
    if (score >= 40) return 'bg-[hsl(var(--positive)/0.55)] text-white';
    if (score >= 10) return 'bg-[hsl(var(--positive)/0.30)]';
    if (score > -10) return 'bg-muted/40';
    if (score > -40) return 'bg-[hsl(var(--negative)/0.30)]';
    if (score > -70) return 'bg-[hsl(var(--negative)/0.55)] text-white';
    return 'bg-[hsl(var(--negative)/0.80)] text-white';
  }
  // cointegration: 0..100 where 100 = (1 - p_value)*100
  if (score >= 99) return 'bg-[hsl(var(--positive)/0.85)] text-white';
  if (score >= 95) return 'bg-[hsl(var(--positive)/0.70)] text-white';
  if (score >= 90) return 'bg-[hsl(var(--positive)/0.50)]';
  if (score >= 80) return 'bg-[hsl(var(--positive)/0.30)]';
  return 'bg-muted/40 text-muted-foreground';
}

export function PairMatrix({ data, onCellClick, highlightSymbol }: Props) {
  const { symbols, matrix, method, pvalues } = data;

  const needle = useMemo(() => highlightSymbol?.trim().toUpperCase() ?? '', [highlightSymbol]);

  return (
    <div className="w-full overflow-auto rounded-md border border-border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/30">
            <th className="sticky left-0 z-10 bg-muted/30 px-3 py-2 text-left font-semibold text-muted-foreground border-b border-r border-border">
              Symbol
            </th>
            {symbols.map((s) => (
              <th
                key={s}
                className={cn(
                  'px-3 py-2 text-center font-mono text-xs font-medium text-foreground border-b border-border',
                  needle && s.includes(needle) && 'text-primary',
                )}
              >
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {symbols.map((rowSym, i) => (
            <tr key={rowSym}>
              <td
                className={cn(
                  'sticky left-0 z-10 bg-muted/20 px-3 py-2 font-mono text-xs font-medium border-r border-b border-border',
                  needle && rowSym.includes(needle) && 'text-primary',
                )}
              >
                {rowSym}
              </td>
              {symbols.map((colSym, j) => {
                const score = matrix[i]?.[j] ?? null;
                const pval = pvalues?.[i]?.[j];
                const isDiagonal = i === j;
                const clickable = !isDiagonal && score !== null;
                const title =
                  score === null
                    ? 'Insufficient data'
                    : method === 'correlation'
                    ? `corr(${rowSym}, ${colSym}) = ${(score / 100).toFixed(3)}`
                    : `coint(${rowSym}, ${colSym}) p-value = ${pval ?? 'n/a'}`;
                return (
                  <td
                    key={colSym}
                    title={title}
                    onClick={() => clickable && onCellClick?.(rowSym, colSym)}
                    className={cn(
                      'px-3 py-2 text-center font-mono text-xs border-b border-border/50 transition-colors',
                      cellBackground(score, method),
                      clickable && 'cursor-pointer hover:brightness-110 hover:ring-1 hover:ring-primary',
                      isDiagonal && 'opacity-80',
                    )}
                  >
                    {score === null ? '—' : Math.round(score)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
