import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { NAV, isNavActive, sectionActive } from "./nav-items";

/**
 * MobileNavDrawer — hamburger trigger + slide-in Sheet rendering the same
 * NAV structure as <NavPrimary/>. Single source of truth lives in
 * ./nav-items.ts; this component is the narrow-viewport surface.
 *
 * Sections with `children` render as an accordion: tap header → expand;
 * tap a link → drawer closes and navigation proceeds.
 */
export function MobileNavDrawer() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [location] = useLocation();
  const { user } = useAuth();

  const role = user?.role ?? "user";
  const isAdmin = role === "admin" || role === "super_admin" || role === "moderator";

  const close = () => {
    setOpen(false);
    setExpanded(null);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-9 w-9"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="w-[280px] sm:w-[320px] p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border">
          <SheetTitle className="text-left text-sm font-semibold uppercase tracking-uppercase text-muted-foreground">
            Navigation
          </SheetTitle>
        </SheetHeader>

        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.filter((s) => !s.adminOnly || isAdmin).map((section) => {
            const active = sectionActive(location, section);

            // Single-link section (e.g. Dashboard) — no accordion.
            if (section.href) {
              return (
                <Link
                  key={section.title}
                  href={section.href}
                  onClick={close}
                  className={cn(
                    "block px-4 py-2.5 text-[14px] font-medium transition-colors",
                    active
                      ? "bg-accent text-[hsl(var(--brand-navy))] dark:text-[hsl(var(--brand-gold))]"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  {section.title}
                </Link>
              );
            }

            // Multi-link section — accordion.
            const isExpanded = expanded === section.title;
            return (
              <div key={section.title} className="border-b border-border/40 last:border-b-0">
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : section.title)}
                  aria-expanded={isExpanded}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-2.5 text-[14px] font-medium transition-colors",
                    active
                      ? "text-[hsl(var(--brand-navy))] dark:text-[hsl(var(--brand-gold))]"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  <span>{section.title}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 opacity-60 transition-transform duration-fast",
                      isExpanded && "rotate-180",
                    )}
                  />
                </button>

                {isExpanded && section.children && (
                  <div className="pb-2 bg-muted/30">
                    {section.children.flat().map((link) => {
                      const linkActive = isNavActive(location, link.href);
                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          onClick={close}
                          className={cn(
                            "block px-6 py-2 transition-colors",
                            linkActive
                              ? "bg-[hsl(var(--brand-gold)/0.12)]"
                              : "hover:bg-muted",
                          )}
                        >
                          <div
                            className={cn(
                              "text-[13px] font-semibold",
                              linkActive
                                ? "text-[hsl(var(--brand-navy))] dark:text-[hsl(var(--brand-gold))]"
                                : "text-foreground",
                            )}
                          >
                            {link.label}
                          </div>
                          {link.sublabel && (
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {link.sublabel}
                            </div>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export default MobileNavDrawer;
