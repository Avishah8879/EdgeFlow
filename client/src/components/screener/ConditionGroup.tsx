import { Plus, FolderPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConditionRow } from "./ConditionRow";
import { JoinPill } from "./JoinPill";
import { ValueChip } from "./ValueChip";
import { getFieldCatalog } from "@/lib/screener/fields";
import type {
  Clause,
  ConditionRow as ConditionRowType,
  Group,
  GroupChild,
  Variant,
} from "@/lib/screener/types";

interface ConditionGroupProps {
  variant: Variant;
  group: Group;
  onChange: (group: Group) => void;
  /** True when rendered as a nested group (adds border + indent). */
  nested?: boolean;
  /** Called when this group should be removed from its parent (nested only). */
  onDelete?: () => void;
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function createCondition(variant: Variant): ConditionRowType {
  const catalog = getFieldCatalog(variant);
  const first = catalog[0];
  const second = catalog.find((f) => f.name !== first.name) ?? first;
  return {
    kind: "condition",
    id: newId(),
    lhs: {
      kind: "field",
      field: first.name,
      period: first.hasPeriod ? first.defaultPeriod ?? 14 : undefined,
    },
    op: ">",
    rhs: second.hasPeriod || second.suffixOnly
      ? { kind: "field", field: second.name, period: second.hasPeriod ? second.defaultPeriod ?? 14 : undefined }
      : { kind: "number", value: 0 },
  };
}

function createGroup(variant: Variant): Group {
  return {
    kind: "group",
    id: newId(),
    children: [{ join: "and", clause: createCondition(variant) }],
  };
}

export function ConditionGroup({ variant, group, onChange, nested = false, onDelete }: ConditionGroupProps) {
  const updateChild = (index: number, next: Partial<GroupChild>) => {
    const copy = [...group.children];
    copy[index] = { ...copy[index], ...next };
    onChange({ ...group, children: copy });
  };

  const deleteChild = (index: number) => {
    const copy = group.children.filter((_, i) => i !== index);
    onChange({ ...group, children: copy });
  };

  const addChild = (join: "and" | "or", clause: Clause) => {
    onChange({
      ...group,
      children: [...group.children, { join, clause }],
    });
  };

  return (
    <div
      className={cn(
        "space-y-1",
        nested && "border border-border/50 rounded-lg p-3 ml-3 border-l-2 border-l-primary/40",
      )}
    >
      {nested && onDelete && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Group</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            aria-label="Remove group"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {group.children.map((child, i) => (
        <div key={child.clause.id} className="space-y-1">
          {i > 0 && (
            <div className="flex items-center">
              <JoinPill value={child.join} onChange={(join) => updateChild(i, { join })} />
            </div>
          )}
          {child.clause.kind === "condition" ? (
            <ConditionRow
              variant={variant}
              row={child.clause}
              onChange={(row) => updateChild(i, { clause: row })}
              onDelete={() => deleteChild(i)}
            />
          ) : (
            <ConditionGroup
              variant={variant}
              group={child.clause}
              nested
              onChange={(g) => updateChild(i, { clause: g })}
              onDelete={() => deleteChild(i)}
            />
          )}
        </div>
      ))}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-[11px]"
          onClick={() => addChild("and", createCondition(variant))}
        >
          <Plus className="w-3 h-3 mr-1" />
          AND
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-[11px]"
          onClick={() => addChild("or", createCondition(variant))}
        >
          <Plus className="w-3 h-3 mr-1" />
          OR
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-[11px]"
          onClick={() => addChild("and", createGroup(variant))}
        >
          <FolderPlus className="w-3 h-3 mr-1" />
          Group
        </Button>
      </div>
    </div>
  );
}

// Helpers exported for builder bootstrap
export { createCondition, createGroup, newId };
