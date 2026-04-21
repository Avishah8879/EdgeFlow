import { useState } from "react";
import { ChevronDown, Hash, Calculator, Type } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FieldPicker } from "./FieldPicker";
import { PeriodPicker } from "./PeriodPicker";
import { OffsetPicker } from "./OffsetPicker";
import { getFieldCatalog } from "@/lib/screener/fields";
import type { ArithOp, FieldDef, ValueRef, Variant } from "@/lib/screener/types";

interface ValueChipProps {
  variant: Variant;
  value: ValueRef;
  onChange: (v: ValueRef) => void;
  /** Show offset picker? Only for Expert Screener and only at top-level LHS/RHS. */
  showOffset?: boolean;
  /** Prevent nested arith more than 3 levels deep (v1 safety). */
  depth?: number;
}

const ARITH_OPS: ArithOp[] = ["+", "-", "*", "/"];

function defaultFieldValue(variant: Variant): ValueRef {
  const f = getFieldCatalog(variant)[0];
  return {
    kind: "field",
    field: f.name,
    period: f.hasPeriod ? f.defaultPeriod ?? 14 : undefined,
  };
}

export function ValueChip({ variant, value, onChange, showOffset = false, depth = 0 }: ValueChipProps) {
  const [typeOpen, setTypeOpen] = useState(false);

  const changeKind = (kind: ValueRef["kind"]) => {
    setTypeOpen(false);
    if (kind === value.kind) return;
    if (kind === "number") onChange({ kind: "number", value: 0 });
    else if (kind === "field") onChange(defaultFieldValue(variant));
    else onChange({ kind: "arith", op: "+", lhs: { kind: "number", value: 0 }, rhs: defaultFieldValue(variant) });
  };

  const KindIcon =
    value.kind === "number" ? Hash : value.kind === "field" ? Type : Calculator;

  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-1 py-0.5">
      {/* Type selector */}
      <Popover open={typeOpen} onOpenChange={setTypeOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Change value type"
          >
            <KindIcon className="w-3 h-3" />
            <ChevronDown className="w-2.5 h-2.5 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[150px] p-0" align="start">
          <Command>
            <CommandList>
              <CommandGroup>
                <CommandItem value="number" onSelect={() => changeKind("number")}>
                  <Hash className="w-3 h-3 mr-2" /> Number
                </CommandItem>
                <CommandItem value="field" onSelect={() => changeKind("field")}>
                  <Type className="w-3 h-3 mr-2" /> Field
                </CommandItem>
                {depth < 3 && (
                  <CommandItem value="arith" onSelect={() => changeKind("arith")}>
                    <Calculator className="w-3 h-3 mr-2" /> Expression
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Actual value editor */}
      {value.kind === "number" && (
        <NumberEditor value={value.value} onChange={(v) => onChange({ kind: "number", value: v })} />
      )}

      {value.kind === "field" && (
        <FieldEditor
          variant={variant}
          value={value}
          onChange={onChange}
          showOffset={showOffset}
        />
      )}

      {value.kind === "arith" && (
        <ArithEditor variant={variant} value={value} onChange={onChange} depth={depth} />
      )}
    </div>
  );
}

// ── Number editor ──────────────────────────────────────────────────────────

function NumberEditor({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Input
      type="number"
      step="any"
      value={value}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        onChange(isNaN(v) ? 0 : v);
      }}
      className="h-6 w-[100px] text-xs font-mono border-transparent bg-transparent px-1 focus-visible:ring-1"
    />
  );
}

// ── Field editor ───────────────────────────────────────────────────────────

function FieldEditor({
  variant,
  value,
  onChange,
  showOffset,
}: {
  variant: Variant;
  value: Extract<ValueRef, { kind: "field" }>;
  onChange: (v: ValueRef) => void;
  showOffset: boolean;
}) {
  const catalog = getFieldCatalog(variant);
  const def = catalog.find((f) => f.name === value.field);

  const handleFieldChange = (newDef: FieldDef) => {
    onChange({
      kind: "field",
      field: newDef.name,
      period: newDef.hasPeriod ? newDef.defaultPeriod ?? 14 : undefined,
      offset: value.offset,
    });
  };

  return (
    <div className="inline-flex items-center gap-1">
      <FieldPicker variant={variant} value={value.field} onSelect={handleFieldChange} />
      {def?.hasPeriod && (
        <PeriodPicker
          value={value.period}
          commonPeriods={def.commonPeriods}
          onChange={(period) => onChange({ ...value, period })}
        />
      )}
      {showOffset && variant === "expert" && (
        <OffsetPicker
          value={value.offset}
          onChange={(offset) => onChange({ ...value, offset })}
        />
      )}
    </div>
  );
}

// ── Arith editor (recursive) ───────────────────────────────────────────────

function ArithEditor({
  variant,
  value,
  onChange,
  depth,
}: {
  variant: Variant;
  value: Extract<ValueRef, { kind: "arith" }>;
  onChange: (v: ValueRef) => void;
  depth: number;
}) {
  const [opOpen, setOpOpen] = useState(false);
  return (
    <div className="inline-flex items-center gap-1">
      <ValueChip
        variant={variant}
        value={value.lhs}
        onChange={(lhs) => onChange({ ...value, lhs })}
        depth={depth + 1}
      />
      <Popover open={opOpen} onOpenChange={setOpOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono font-bold border border-border/60 bg-muted/50 hover:bg-muted",
            )}
          >
            {value.op}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[80px] p-0" align="start">
          <Command>
            <CommandList>
              {ARITH_OPS.map((op) => (
                <CommandItem
                  key={op}
                  value={op}
                  onSelect={() => { onChange({ ...value, op }); setOpOpen(false); }}
                  className="font-mono justify-center"
                >
                  {op}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <ValueChip
        variant={variant}
        value={value.rhs}
        onChange={(rhs) => onChange({ ...value, rhs })}
        depth={depth + 1}
      />
    </div>
  );
}
