/**
 * Vertical Table of Contents sidebar for the stock-detail page.
 *
 * Reuses useScrollSpy and the same NavSection[] shape as StockDetailNav.
 * Renders inside the right sidebar column (sticky top 80px) of the
 * stock-detail two-column layout. Numbered list, active state highlighting,
 * click-to-scroll. No expand/collapse controls (sections are always-expanded
 * on this page per §7 q11 lock 2026-05-18).
 */
import { useScrollSpy } from "@/hooks/use-scroll-spy";
import { cn } from "@/lib/utils";
import type { NavSection } from "./StockDetailNav";

interface TocSidebarProps {
  sections: NavSection[];
}

export function TocSidebar({ sections }: TocSidebarProps) {
  const ids = sections.map((s) => s.id);
  const activeId = useScrollSpy(ids);

  const handleClick = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav
      aria-label="Table of contents"
      className="rounded-xl border border-border/50 bg-card p-3"
    >
      <p className="px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Contents
      </p>
      <ul className="flex flex-col gap-0.5 mt-1">
        {sections.map((s, idx) => {
          const active = activeId === s.id;
          const num = String(idx + 1).padStart(2, "0");
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => handleClick(s.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left transition-colors text-sm",
                  active
                    ? "bg-accent/60 text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
                )}
              >
                <span
                  className={cn(
                    "font-mono tabular-nums text-[10.5px] w-5 shrink-0",
                    active ? "text-foreground/80" : "text-muted-foreground/60",
                  )}
                >
                  {num}
                </span>
                <span className="truncate">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
