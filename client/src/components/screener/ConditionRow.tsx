import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ValueChip } from "./ValueChip";
import { OperatorPicker } from "./OperatorPicker";
import type { ConditionRow as ConditionRowType, Variant } from "@/lib/screener/types";

interface ConditionRowProps {
  variant: Variant;
  row: ConditionRowType;
  onChange: (row: ConditionRowType) => void;
  onDelete: () => void;
}

export function ConditionRow({ variant, row, onChange, onDelete }: ConditionRowProps) {
  const allowCrossovers = variant === "expert";

  return (
    <div className="flex flex-wrap items-center gap-1.5 py-1">
      <ValueChip
        variant={variant}
        value={row.lhs}
        onChange={(lhs) => onChange({ ...row, lhs })}
        showOffset={variant === "expert"}
      />
      <OperatorPicker
        value={row.op}
        onChange={(op) => onChange({ ...row, op })}
        allowCrossovers={allowCrossovers}
      />
      <ValueChip
        variant={variant}
        value={row.rhs}
        onChange={(rhs) => onChange({ ...row, rhs })}
        showOffset={variant === "expert"}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
        aria-label="Remove condition"
      >
        <X className="h-3.5 h-3.5" />
      </Button>
    </div>
  );
}
