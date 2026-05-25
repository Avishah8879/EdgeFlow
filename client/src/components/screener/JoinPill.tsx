import { cn } from "@/lib/utils";

interface JoinPillProps {
  value: "and" | "or";
  onChange: (v: "and" | "or") => void;
}

export function JoinPill({ value, onChange }: JoinPillProps) {
  const toggle = () => onChange(value === "and" ? "or" : "and");
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={value === "or"}
      className={cn(
        "text-[10px] font-mono font-bold uppercase tracking-wider rounded px-1.5 py-0.5 transition-colors",
        value === "and"
          ? "bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground"
          : "bg-primary/15 text-primary hover:bg-primary/25",
      )}
      title="Click to toggle AND/OR"
    >
      {value}
    </button>
  );
}
