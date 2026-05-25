import { useScrollSpy } from "@/hooks/use-scroll-spy";
import { cn } from "@/lib/utils";
import { dispatchSetAllSections, dispatchOpenSection } from "./CollapsibleSection";

export interface NavSection {
  id: string;
  label: string;
}

interface StockDetailNavProps {
  sections: NavSection[];
}

export function StockDetailNav({ sections }: StockDetailNavProps) {
  const ids = sections.map((s) => s.id);
  const activeId = useScrollSpy(ids);

  const handleClick = (id: string) => {
    // Open the target section first so smooth-scroll lands at its expanded position.
    dispatchOpenSection(id);
    // Slight delay to allow the section's grid-rows transition to start before scrolling.
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div className="sticky top-0 z-30 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 bg-background/95 backdrop-blur-sm border-b border-border/60">
      <div className="flex items-center gap-3 py-2">
        <nav className="flex-1 flex items-center gap-1 overflow-x-auto scrollbar-thin">
          {sections.map((s) => {
            const active = activeId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => handleClick(s.id)}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors shrink-0",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
              >
                {s.label}
              </button>
            );
          })}
        </nav>
        <div className="hidden sm:flex items-center gap-1 shrink-0 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => dispatchSetAllSections(true)}
            className="px-2 py-1 rounded hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            Expand all
          </button>
          <span className="text-border">·</span>
          <button
            type="button"
            onClick={() => dispatchSetAllSections(false)}
            className="px-2 py-1 rounded hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            Collapse all
          </button>
        </div>
      </div>
    </div>
  );
}
