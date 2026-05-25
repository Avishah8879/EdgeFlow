/**
 * Financial Statements panel — Standalone/Consolidated × P&L/BS/CF/Quarterly/Yearly.
 *
 * Renders CMOTS WideTable (periods × labels × matrix) as a table. The
 * existing ``FinancialTable.tsx`` consumes a different shape
 * (Record<period, Record<label, value>> with RowDef aliasing) so we
 * render the WideTable directly here. Same sticky-header / mono-numeric
 * styling for visual consistency.
 *
 * Gated on useCmotsCoverage — uncovered tickers see a clean empty state.
 */
import { useState } from "react";
import { AlertCircle, FileSpreadsheet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCmotsCoverage } from "@/hooks/use-cmots-coverage";
import {
  useCmotsFinancials,
  type StatementType,
  type FinancialReport,
  type WideTable,
} from "@/hooks/use-cmots-financials";

interface FinancialStatementsPanelProps {
  ticker: string | undefined;
}

const STATEMENT_TABS: ReadonlyArray<{ id: StatementType; label: string }> = [
  { id: "standalone",    label: "Standalone" },
  { id: "consolidated",  label: "Consolidated" },
];

const REPORT_TABS: ReadonlyArray<{ id: FinancialReport; label: string }> = [
  { id: "profit_loss",   label: "P&L" },
  { id: "balance_sheet", label: "Balance Sheet" },
  { id: "cash_flow",     label: "Cash Flow" },
  { id: "quarterly",     label: "Quarterly" },
  { id: "yearly",        label: "Yearly" },
];

// CMOTS financial values are stored in crores (₹). Render with Indian
// thousand separators; 0 decimals for absolute amounts. EPS-like labels
// get 2 decimals. Percent-suffixed labels (e.g. "Tax %") get a % sign.
function formatStatementCell(value: number | null | undefined, label: string): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const lbl = label.toLowerCase();
  if (lbl.includes("%") || lbl.endsWith(" margin") || lbl.endsWith(" ratio")) {
    return `${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`;
  }
  if (/\beps\b|per share/i.test(label)) {
    return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function FinancialStatementsPanel({ ticker }: FinancialStatementsPanelProps) {
  const [statementType, setStatementType] = useState<StatementType>("consolidated");
  const [report, setReport] = useState<FinancialReport>("profit_loss");
  const coverage = useCmotsCoverage(ticker);
  const financials = useCmotsFinancials(ticker, statementType, report);

  if (coverage.data && !coverage.data.has_cmots_data) {
    return (
      <EmptyState>
        <p className="text-sm text-muted-foreground">
          Detailed financial statements not available for this ticker.
        </p>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      {/* Statement type — primary toggle */}
      <div className="flex flex-wrap gap-1">
        {STATEMENT_TABS.map((tab) => (
          <Button
            key={tab.id}
            variant={statementType === tab.id ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setStatementType(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Report — secondary toggle */}
      <div className="flex flex-wrap gap-1">
        {REPORT_TABS.map((tab) => (
          <Button
            key={tab.id}
            variant={report === tab.id ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setReport(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <StatementsBody
        isLoading={financials.isLoading}
        error={financials.error as Error | null}
        data={financials.data}
      />
    </div>
  );
}

function StatementsBody({
  isLoading,
  error,
  data,
}: {
  isLoading: boolean;
  error: Error | null;
  data: WideTable | undefined;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-7 w-full" />
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
        <span>Failed to load statement: {error.message}</span>
      </div>
    );
  }
  if (!data || !data.periods.length || !data.labels.length) {
    return <EmptyState />;
  }

  const { periods, labels, data: matrix } = data;

  return (
    <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border/70 bg-card sticky top-0">
            <th className="text-left py-2 pr-3 font-medium text-muted-foreground sticky left-0 bg-card whitespace-nowrap text-xs uppercase tracking-wide">
              {/* parent column header intentionally empty */}
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
                    "py-1.5 pr-3 sticky left-0 whitespace-nowrap text-foreground",
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
                    {formatStatementCell(matrix[rowIdx]?.[colIdx], label)}
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

function EmptyState({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border/50 py-10">
      <FileSpreadsheet className="h-6 w-6 text-muted-foreground/50" />
      {children ?? (
        <p className="text-sm text-muted-foreground">
          No statement data available for the selected view.
        </p>
      )}
    </div>
  );
}
