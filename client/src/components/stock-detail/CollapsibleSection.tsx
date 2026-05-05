import { useEffect, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  id: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

const SET_ALL_EVENT = "stock-detail:set-all";

export function CollapsibleSection({
  id,
  title,
  subtitle,
  action,
  defaultOpen = true,
  children,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useLocalStorage<boolean>(`stock-detail:section:${id}`, defaultOpen);

  useEffect(() => {
    const onSetAll = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      if (typeof detail === "boolean") setOpen(detail);
    };
    const onSetOne = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; open: boolean }>).detail;
      if (detail?.id === id) setOpen(detail.open);
    };
    window.addEventListener(SET_ALL_EVENT, onSetAll);
    window.addEventListener("stock-detail:set-one", onSetOne);
    return () => {
      window.removeEventListener(SET_ALL_EVENT, onSetAll);
      window.removeEventListener("stock-detail:set-one", onSetOne);
    };
  }, [id, setOpen]);

  return (
    <section
      id={id}
      className={cn(
        "rounded-xl border border-border/50 bg-card scroll-mt-20",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={`${id}-content`}
        className="w-full flex items-start justify-between gap-3 px-5 md:px-6 py-4 text-left hover:bg-accent/30 transition-colors rounded-xl"
      >
        <div className="flex items-start gap-3 min-w-0">
          <ChevronDown
            className={cn(
              "h-4 w-4 mt-1 shrink-0 text-muted-foreground transition-transform duration-200",
              !open && "-rotate-90",
            )}
          />
          <div className="min-w-0">
            <h2 className="text-lg md:text-xl font-semibold tracking-tight text-foreground">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action && (
          <div onClick={(e) => e.stopPropagation()} className="shrink-0">
            {action}
          </div>
        )}
      </button>

      {/* Grid-rows trick: animates between 0fr and 1fr WITHOUT overflow:hidden,
          so sticky <thead> inside still works. */}
      <div
        id={`${id}-content`}
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
        aria-hidden={!open}
      >
        <div className="min-h-0">
          <div
            className={cn(
              "px-5 md:px-6 pb-5 md:pb-6 pt-0",
              !open && "invisible pointer-events-none",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

export function dispatchSetAllSections(open: boolean): void {
  window.dispatchEvent(new CustomEvent(SET_ALL_EVENT, { detail: open }));
}

export function dispatchOpenSection(id: string): void {
  window.dispatchEvent(
    new CustomEvent("stock-detail:set-one", { detail: { id, open: true } }),
  );
}
