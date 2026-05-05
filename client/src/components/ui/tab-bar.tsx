import { cn } from "@/lib/utils";

export interface TabBarItem<T extends string = string> {
  id: T;
  label: string;
  count?: number | string;
}

interface TabBarProps<T extends string = string> {
  tabs: TabBarItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Variant: underline (page tabs) or segmented (compact toolbar). */
  variant?: "underline" | "segmented";
  className?: string;
}

/**
 * TabBar — design's two tab variants in a single component.
 *
 *   underline:  large page tabs with gold underline on active
 *   segmented:  compact button-group control (timeframe pickers etc.)
 */
export function TabBar<T extends string = string>({
  tabs,
  value,
  onChange,
  variant = "underline",
  className,
}: TabBarProps<T>) {
  if (variant === "segmented") {
    return (
      <div
        role="tablist"
        className={cn(
          "inline-flex gap-0.5 rounded-md bg-muted p-1",
          className,
        )}
      >
        {tabs.map((t) => {
          const active = t.id === value;
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => onChange(t.id)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-[calc(var(--radius-md)-2px)] px-3 text-xs font-semibold transition-colors duration-fast ease-out",
                active
                  ? "bg-card text-foreground shadow-card"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {t.count != null && (
                <span className="font-mono tabular-nums opacity-70">
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex gap-6 border-b border-border",
        className,
      )}
    >
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative inline-flex h-10 items-center gap-1.5 text-sm font-medium transition-colors duration-fast",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count != null && (
              <span className="rounded-pill bg-muted px-1.5 py-px text-[11px] font-mono tabular-nums text-muted-foreground">
                {t.count}
              </span>
            )}
            {active && (
              <span
                aria-hidden
                className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-[hsl(var(--brand-gold))]"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export default TabBar;
