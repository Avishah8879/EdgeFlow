import { useMemo } from "react";
import { useRRG, type RRGPeriod } from "@/hooks/useRRG";
import { classifyQuadrant, type RRGQuadrant } from "@/lib/rrg-utils";

interface RRGQuadrantTableProps {
  symbols: string[];
  period?: RRGPeriod;
}

const QUADRANT_STYLES: Record<RRGQuadrant, string> = {
  Leading:   "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  Weakening: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Improving: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  Lagging:   "bg-rose-500/15 text-rose-600 dark:text-rose-400",
};

export function RRGQuadrantTable({ symbols, period = "2y" }: RRGQuadrantTableProps) {
  const { data, isLoading } = useRRG(symbols, period);

  const rows = useMemo(() => {
    if (!data?.legend?.length) return [];
    const trails = data.trails ?? [];
    return data.legend.map((item) => {
      const trail = trails.find((t) => (t.label ?? t.symbol) === item.symbol);
      return {
        symbol: item.symbol,
        rsRatio: item.rsRatio,
        rsMom: item.rsMom,
        quadrant: classifyQuadrant(item.rsRatio, item.rsMom),
        color: trail?.color ?? "#10b981",
      };
    });
  }, [data]);

  if (isLoading || rows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-md border border-border/60">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/60 bg-muted/30">
            <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              Symbol
            </th>
            <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              Quadrant
            </th>
            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              RS-Ratio
            </th>
            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              RS-Mom
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.symbol}
              className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors"
            >
              <td className="px-3 py-1.5 font-mono font-semibold" style={{ color: row.color }}>
                {row.symbol}
              </td>
              <td className="px-3 py-1.5">
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${QUADRANT_STYLES[row.quadrant]}`}
                >
                  {row.quadrant}
                </span>
              </td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-foreground">
                {row.rsRatio.toFixed(1)}
              </td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-foreground">
                {row.rsMom.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
