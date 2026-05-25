/**
 * Ratios panel — yearly/quarterly WideTables + daily flat-dict snapshot.
 *
 * Yearly/Quarterly: rendered as period-column × label-row tables, newest-first
 * (matches CMOTS WideTable ordering — periods are ISO date strings, sorted
 * server-side). Mirrors FinancialTable.tsx's sticky-header / mono-numeric
 * styling without reusing it (FinancialTable consumes a different shape).
 *
 * Daily: rendered as a 2-column metric grid (key/value) — single-snapshot
 * data is more legible as a grid than a 1-column table.
 *
 * Gated on useCmotsCoverage — uncovered tickers see a clean empty state.
 */
import { useState } from "react";
import { AlertCircle, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCmotsCoverage } from "@/hooks/use-cmots-coverage";
import {
  useCmotsRatios,
  type RatioPeriod,
  type DailyRatios,
} from "@/hooks/use-cmots-ratios";
import type { WideTable } from "@/hooks/use-cmots-financials";

interface RatiosPanelProps {
  ticker: string | undefined;
}

const PERIOD_TABS: ReadonlyArray<{ id: RatioPeriod; label: string }> = [
  { id: "yearly",    label: "Yearly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "daily",     label: "Daily" },
];

// CMOTS ratio columns where values are stored as percentages (multiply
// by 1 then suffix '%'). Other ratios (PE, PBV, debt/equity) render as
// plain decimals.
const PERCENT_LIKE = new Set([
  "roe", "roa", "roce", "div_yield", "net_income_margin",
  "gross_income_margin", "asset_turnover", "fcf_margin",
  "dividend_payout", "sales_totalasset",
  // Daily_Ratios_C field names
  "ROE_TTM", "ROA_TTM", "DIVYIELD", "NetIncomeMargin_TTM",
  "EBITDA_Margin_TTM", "EBIT_Margin_TTM", "GrossMargin_TTM",
  "DividendPayout_TTM",
]);

function formatRatio(value: number | null | undefined, key: string): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (PERCENT_LIKE.has(key)) {
    return `${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`;
  }
  // Market-cap-style absolute numbers (CMOTS reports crores) — show as crores
  if (Math.abs(value) >= 1e5) {
    return value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  }
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function RatiosPanel({ ticker }: RatiosPanelProps) {
  const [period, setPeriod] = useState<RatioPeriod>("yearly");
  const coverage = useCmotsCoverage(ticker);
  const ratios = useCmotsRatios(ticker, period);

  if (coverage.data && !coverage.data.has_cmots_data) {
    return (
      <EmptyState>
        <p className="text-sm text-muted-foreground">
          Detailed ratios not available for this ticker.
        </p>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {PERIOD_TABS.map((tab) => (
          <Button
            key={tab.id}
            variant={period === tab.id ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setPeriod(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <RatiosBody
        isLoading={ratios.isLoading}
        error={ratios.error as Error | null}
        data={ratios.data}
        period={period}
      />
    </div>
  );
}

function RatiosBody({
  isLoading,
  error,
  data,
  period,
}: {
  isLoading: boolean;
  error: Error | null;
  data: WideTable | DailyRatios | undefined;
  period: RatioPeriod;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
        <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
        <span>Failed to load {period} ratios: {error.message}</span>
      </div>
    );
  }
  if (!data) {
    return <EmptyState />;
  }

  if (period === "daily") {
    return <DailyRatiosGrid data={data as DailyRatios} />;
  }
  return <WideTableView data={data as WideTable} />;
}

function WideTableView({ data }: { data: WideTable }) {
  const { periods, labels, data: matrix } = data;
  if (!periods.length || !labels.length) return <EmptyState />;

  return (
    <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border/70 bg-card sticky top-0">
            <th className="text-left py-2 pr-3 font-medium text-muted-foreground sticky left-0 bg-card whitespace-nowrap text-xs uppercase tracking-wide">
              Metric
            </th>
            {periods.map((p) => (
              <th
                key={p}
                className="text-right py-2 px-3 font-medium text-muted-foreground whitespace-nowrap text-xs uppercase tracking-wide"
              >
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, rowIdx) => {
            const stripeBg = rowIdx % 2 === 1 ? "bg-muted/20" : "bg-card";
            return (
              <tr
                key={label}
                className={cn(
                  "border-b border-border/30 last:border-b-0 transition-colors",
                  rowIdx % 2 === 1 && "bg-muted/20",
                  "hover:bg-muted/40",
                )}
              >
                <td
                  className={cn(
                    "py-1.5 pr-3 sticky left-0 whitespace-nowrap text-foreground text-xs uppercase tracking-wide",
                    stripeBg,
                  )}
                >
                  {label}
                </td>
                {periods.map((p, colIdx) => (
                  <td
                    key={p}
                    className="text-right py-1.5 px-3 font-mono tabular-nums whitespace-nowrap"
                  >
                    {formatRatio(matrix[rowIdx]?.[colIdx], label)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DailyRatiosGrid({ data }: { data: DailyRatios }) {
  const entries = Object.entries(data).filter(([, v]) => v != null);
  if (!entries.length) return <EmptyState />;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
      {entries.map(([key, value]) => (
        <div
          key={key}
          className="flex items-baseline justify-between border-b border-border/20 py-1.5"
        >
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {key}
          </span>
          <span className="font-mono tabular-nums text-sm">
            {formatRatio(value, key)}
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border/50 py-10">
      <TrendingUp className="h-6 w-6 text-muted-foreground/50" />
      {children ?? (
        <p className="text-sm text-muted-foreground">No ratio data available.</p>
      )}
    </div>
  );
}
