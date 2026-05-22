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
  /**
   * Visual density. Defaults to "default" (existing behavior — no caller
   * changes required). "narrow" applies the design's compact-tabular
   * treatment: smaller padding (7px/9px), 12px font, sticky-left name
   * column, last-period column highlighted (`.cur` gold bg @ varying
   * opacity per row kind), and `kind`-driven row backgrounds.
   */
  density?: "default" | "narrow";
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

export function FinancialTable({ data, rows, emptyMessage, density = "default" }: FinancialTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const narrow = density === "narrow";

  if (!data || Object.keys(data).length === 0) {
    return <div className="text-sm text-muted-foreground py-6 text-center">{emptyMessage}</div>;
  }

  const periods = Object.keys(data).sort();
  // In narrow mode the LAST period is the "current" column (visually highlighted).
  const currentPeriod = narrow && periods.length > 0 ? periods[periods.length - 1] : null;

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

  // Narrow-mode cell/text classes — tighter padding (7px/9px ≈ py-1 px-2.5)
  // and 12px font (text-xs). Default mode preserves existing 8px / 13px sizing.
  const cellPaddingY = narrow ? "py-1" : "py-1.5";
  const cellPaddingX = narrow ? "px-2.5" : "px-3";
  const fontSizeClass = narrow ? "text-xs" : "text-sm";

  // Per design extraction, current-column gold opacity scales with row kind:
  //   normal → @ 0.05, subtotal → @ 0.12, highlight → @ 0.15.
  const curBgFor = (kind?: "sub" | "hl") => {
    if (!narrow) return "";
    if (kind === "hl") return "bg-[hsl(var(--brand-gold)/0.15)]";
    if (kind === "sub") return "bg-[hsl(var(--brand-gold)/0.12)]";
    return "bg-[hsl(var(--brand-gold)/0.05)]";
  };

  // Row-bg per kind (narrow only — default mode preserves zebra stripes).
  const rowBgFor = (kind?: "sub" | "hl", idx?: number) => {
    if (!narrow) return idx != null && idx % 2 === 1 ? "bg-muted/20" : "bg-card";
    if (kind === "hl") return "bg-[hsl(var(--brand-navy)/0.06)] border-t border-border/70";
    if (kind === "sub") return "bg-muted/40";
    return idx != null && idx % 2 === 1 ? "bg-muted/20" : "bg-card";
  };

  return (
    <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
      <table className={cn("w-full border-collapse", fontSizeClass)}>
        <thead>
          <tr className="border-b border-border/70 bg-card sticky top-0">
            <th className={cn("text-left pr-3 font-medium text-muted-foreground sticky left-0 bg-card whitespace-nowrap text-xs uppercase tracking-wide z-10", cellPaddingY)}>
              {/* parent column header intentionally empty */}
            </th>
            {periods.map((p) => (
              <th
                key={p}
                className={cn(
                  "text-right font-medium whitespace-nowrap text-xs uppercase tracking-wide",
                  cellPaddingY,
                  cellPaddingX,
                  p === currentPeriod
                    ? "text-[hsl(var(--brand-gold))] bg-[hsl(var(--brand-gold)/0.08)] font-semibold"
                    : "text-muted-foreground",
                )}
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
            const kindBg = rowBgFor(def.kind, idx);
            const isBold = def.bold || def.kind === "sub" || def.kind === "hl";

            return (
              <Fragment key={def.field}>
                <tr
                  className={cn(
                    "border-b border-border/30 last:border-b-0 transition-colors",
                    kindBg,
                    !narrow && "hover:bg-muted/40",
                    narrow && def.kind !== "hl" && def.kind !== "sub" && "hover:bg-muted/30",
                  )}
                >
                  <td
                    className={cn(
                      "pr-3 sticky left-0 whitespace-nowrap text-foreground",
                      cellPaddingY,
                      kindBg, // sticky-left bg matches row bg so it doesn't show transparent
                      isBold && "font-semibold",
                      def.kind === "hl" && narrow && "text-[hsl(var(--brand-navy))] dark:text-foreground",
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
                  {periods.map((p) => {
                    const isCurrent = narrow && p === currentPeriod;
                    return (
                      <td
                        key={p}
                        className={cn(
                          "text-right font-mono tabular-nums whitespace-nowrap",
                          cellPaddingY,
                          cellPaddingX,
                          isBold && "font-semibold",
                          isCurrent && curBgFor(def.kind),
                          isCurrent && def.kind === "hl" && "text-[hsl(var(--brand-navy))] dark:text-[hsl(var(--brand-gold))]",
                        )}
                      >
                        {formatTableCell(resolvedField ? data[p]?.[resolvedField] : null, fieldForRender)}
                      </td>
                    );
                  })}
                </tr>

                {hasExpandable && isOpen &&
                  children.map((child) => (
                    <tr
                      key={`${def.field}::${child}`}
                      className="border-b border-border/20 last:border-b-0 bg-muted/30"
                    >
                      <td
                        className={cn(
                          "pr-3 sticky left-0 whitespace-nowrap bg-muted/30 text-muted-foreground",
                          cellPaddingY,
                        )}
                      >
                        <span className={cn(
                          "inline-flex items-center gap-1.5 pl-6",
                          narrow ? "text-[11px]" : "text-[13px]",
                        )}>
                          <span className="text-border">·</span>
                          {child}
                        </span>
                      </td>
                      {periods.map((p) => {
                        const isCurrent = narrow && p === currentPeriod;
                        return (
                          <td
                            key={p}
                            className={cn(
                              "text-right font-mono tabular-nums whitespace-nowrap text-muted-foreground",
                              cellPaddingY,
                              cellPaddingX,
                              narrow ? "text-[11px]" : "text-[13px]",
                              isCurrent && "bg-[hsl(var(--brand-gold)/0.05)]",
                            )}
                          >
                            {formatTableCell(data[p]?.[child], child)}
                          </td>
                        );
                      })}
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
