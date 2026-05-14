import { useMemo } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConditionGroup, createCondition, newId } from "./ConditionGroup";
import { compile, isEmpty } from "@/lib/screener/compile";
import type { BuilderTree, Variant } from "@/lib/screener/types";

interface ConditionBuilderProps {
  variant: Variant;
  tree: BuilderTree;
  onTreeChange: (tree: BuilderTree) => void;
  /**
   * If provided, shows a non-blocking banner above the builder explaining that
   * the expression couldn't be parsed. Builder still functions.
   */
  unparseableReason?: string;
  /** Show compiled-expression preview (dev aid). Default true. */
  showCompiled?: boolean;
}

function emptyTree(): BuilderTree {
  return { kind: "group", id: newId(), children: [] };
}

export function ConditionBuilder({
  variant,
  tree,
  onTreeChange,
  unparseableReason,
  showCompiled = true,
}: ConditionBuilderProps) {
  const empty = isEmpty(tree);
  const compiled = useMemo(() => compile(tree), [tree]);

  const addFirstCondition = () => {
    onTreeChange({
      ...(tree ?? emptyTree()),
      kind: "group",
      id: tree?.id ?? newId(),
      children: [{ join: "and", clause: createCondition(variant) }],
    });
  };

  return (
    <div className="space-y-3">
      {unparseableReason && (
        <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          This expression uses syntax the visual builder can&apos;t render. Edit it in Expression mode.
          <details className="mt-1">
            <summary className="cursor-pointer text-[10px] uppercase tracking-wider opacity-70 hover:opacity-100">
              Why?
            </summary>
            <div className="mt-1 text-[10px] font-mono">{unparseableReason}</div>
          </details>
        </div>
      )}

      {empty ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 border border-dashed border-border rounded-lg">
          <p className="text-sm text-muted-foreground">Build a condition to start screening</p>
          <Button type="button" onClick={addFirstCondition} size="sm">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add first condition
          </Button>
        </div>
      ) : (
        <ConditionGroup
          variant={variant}
          group={tree}
          onChange={onTreeChange}
        />
      )}

      {showCompiled && !empty && (
        <div className="rounded-md bg-muted/20 border border-border/40 px-3 py-2">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
            Compiled expression
          </div>
          <code className="block text-xs font-mono text-foreground break-all">
            → {compiled || "(empty)"}
          </code>
        </div>
      )}
    </div>
  );
}
