import { useMemo } from "react";
import { Plus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
        <Alert variant="default" className="border-yellow-500/40 bg-yellow-500/10">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <AlertDescription className="text-xs">
            <span className="font-semibold text-yellow-500">This expression is too complex to render visually.</span>{" "}
            Edit it in Expression mode or click below to start fresh.
            <div className="mt-1 text-[10px] text-muted-foreground font-mono">({unparseableReason})</div>
          </AlertDescription>
        </Alert>
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
