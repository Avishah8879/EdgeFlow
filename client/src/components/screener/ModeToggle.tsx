import { cn } from "@/lib/utils";
import { Blocks, Code } from "lucide-react";

export type ScreenerMode = "builder" | "expression";

interface ModeToggleProps {
  mode: ScreenerMode;
  onChange: (mode: ScreenerMode) => void;
  className?: string;
}

export function ModeToggle({ mode, onChange, className }: ModeToggleProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg border border-border/60 bg-muted/30 p-0.5 text-xs font-mono",
        className,
      )}
      role="tablist"
      aria-label="Condition input mode"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "builder"}
        onClick={() => onChange("builder")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors",
          mode === "builder"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Blocks className="w-3.5 h-3.5" />
        Builder
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "expression"}
        onClick={() => onChange("expression")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors",
          mode === "expression"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Code className="w-3.5 h-3.5" />
        Expression
      </button>
    </div>
  );
}
