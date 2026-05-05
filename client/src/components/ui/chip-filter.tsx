import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ChipFilterProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

/**
 * ChipFilter — pill-shaped toggle button used in segmented filter rails
 * (Stocks browser, Saved Results, Screener tabs).
 *
 *   <ChipFilter active={tab === "all"} onClick={() => setTab("all")}>All</ChipFilter>
 */
export const ChipFilter = forwardRef<HTMLButtonElement, ChipFilterProps>(
  ({ active = false, className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-pressed={active}
        className={cn(
          "inline-flex h-8 items-center rounded-pill border px-3 text-xs font-medium transition-colors duration-fast ease-out",
          active
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card text-muted-foreground hover:border-[hsl(var(--brand-gold)/0.5)] hover:text-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
ChipFilter.displayName = "ChipFilter";

export default ChipFilter;
