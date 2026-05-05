import { Fragment, useState } from "react";
import { Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveField, type RowDef } from "./financial-rows";

// Format JSONB cell values per the field's intent.
//   "OPM %", "Tax %", "Dividend Payout %"  → integer percent
//   "EPS in Rs", anything containing "EPS" → 2 decimals
//   Anything else                          → integer with thousand separators
//   Very large numbers (>=1e9)             → assumed raw rupees, divided to crores
export function formatTableCell(value: any, field: string): string {
  if (value == null) return "—";
  const num = typeof value === "number" ? value : parseFloat(value);
  if (!Number.isFinite(num)) return typeof value === "string" ? value : "—";

  if (field.trim().endsWith("%")) {
    return `${Math.round(num)}%`;
  }
  if (/eps/i.test(field)) {
    return num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const display = Math.abs(num) >= 1e9 ? num / 1e7 : num;
  return display.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

interface FinancialTableProps {
  data: Record<string, any> | null | undefined;
  rows: RowDef[];
  emptyMessage: string;
}

// Find which children of a parent row are actually present in any period's data.
function presentChildren(
  data: Record<string, any>,
  periods: string[],
  expectedChildren: string[],
): string[] {
  const seen = new Set<string>();
  for (const p of periods) {
    const row = data[p];
    if (!row || typeof row !== "object") continue;
    for (const child of expectedChildren) {
      if (child in row) seen.add(child);
    }
  }
  // Preserve declared order
  return expectedChildren.filter((c) => seen.has(c));
}

export function FinancialTable({ data, rows, emptyMessage }: FinancialTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (!data || Object.keys(data).length === 0) {
    return <div className="text-sm text-muted-foreground py-6 text-center">{emptyMessage}</div>;
  }

  const periods = Object.keys(data).sort();

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Resolve each RowDef to the actual field key present in data, plus its present children
  type ResolvedRow = {
    def: RowDef;
    resolvedField: string | null;
    children: string[];
  };
  const resolved: ResolvedRow[] = rows.map((def) => {
    // Pick first row that has the field, then resolve aliases
    let actual: string | null = null;
    for (const p of periods) {
      const r = data[p];
      const f = resolveField(r, def);
      if (f) {
        actual = f;
        break;
      }
    }
    const childrenPresent = def.children ? presentChildren(data, periods, def.children) : [];
    return { def, resolvedField: actual, children: childrenPresent };
  });

  // Drop rows whose canonical field has no data anywhere AND no children present
  const visible = resolved.filter((r) => r.resolvedField != null || r.children.length > 0);

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
          {visible.map((row, idx) => {
            const { def, resolvedField, children } = row;
            const isOpen = expanded.has(def.field);
            const fieldForRender = resolvedField ?? def.field;
            const hasExpandable = children.length > 0;
            const stripeBg = idx % 2 === 1 ? "bg-muted/20" : "bg-card";

            return (
              <Fragment key={def.field}>
                <tr
                  className={cn(
                    "border-b border-border/30 last:border-b-0 transition-colors",
                    idx % 2 === 1 && "bg-muted/20",
                    "hover:bg-muted/40",
                  )}
                >
                  <td
                    className={cn(
                      "py-1.5 pr-3 sticky left-0 whitespace-nowrap text-foreground",
                      stripeBg,
                      def.bold && "font-semibold",
                    )}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {hasExpandable ? (
                        <button
                          type="button"
                          onClick={() => toggle(def.field)}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? `Collapse ${def.field}` : `Expand ${def.field}`}
                          className="inline-flex items-center justify-center w-4 h-4 rounded text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
                        >
                          {isOpen ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                        </button>
                      ) : (
                        <span className="w-4 h-4 inline-block" />
                      )}
                      {def.field}
                    </span>
                  </td>
                  {periods.map((p) => (
                    <td
                      key={p}
                      className={cn(
                        "text-right py-1.5 px-3 font-mono tabular-nums whitespace-nowrap",
                        def.bold && "font-semibold",
                      )}
                    >
                      {formatTableCell(resolvedField ? data[p]?.[resolvedField] : null, fieldForRender)}
                    </td>
                  ))}
                </tr>

                {hasExpandable && isOpen &&
                  children.map((child) => (
                    <tr
                      key={`${def.field}::${child}`}
                      className="border-b border-border/20 last:border-b-0 bg-muted/30"
                    >
                      <td
                        className={cn(
                          "py-1.5 pr-3 sticky left-0 whitespace-nowrap bg-muted/30 text-muted-foreground",
                        )}
                      >
                        <span className="inline-flex items-center gap-1.5 pl-6 text-[13px]">
                          <span className="text-border">·</span>
                          {child}
                        </span>
                      </td>
                      {periods.map((p) => (
                        <td
                          key={p}
                          className="text-right py-1.5 px-3 font-mono tabular-nums whitespace-nowrap text-[13px] text-muted-foreground"
                        >
                          {formatTableCell(data[p]?.[child], child)}
                        </td>
                      ))}
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
