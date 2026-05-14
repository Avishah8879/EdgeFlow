import { Link, useLocation } from "wouter";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { NAV, isNavActive, sectionActive } from "./nav-items";

export function NavPrimary() {
  const [location] = useLocation();
  const { user } = useAuth();
  const [open, setOpen] = useState<string | null>(null);

  const role = user?.role ?? "user";
  const isAdmin = role === "admin" || role === "super_admin" || role === "moderator";

  return (
    <nav className="hidden lg:flex items-center gap-1">
      {NAV.filter((s) => !s.adminOnly || isAdmin).map((section) => {
        const active = sectionActive(location, section);

        if (section.href) {
          return (
            <Link
              key={section.title}
              href={section.href}
              className={cn(
                "h-9 inline-flex items-center px-3 rounded-md text-[13.5px] font-medium transition-colors duration-fast",
                active
                  ? "bg-accent text-[hsl(var(--brand-navy))] dark:text-[hsl(var(--brand-gold))]"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {section.title}
            </Link>
          );
        }

        return (
          <div
            key={section.title}
            className="relative"
            onMouseEnter={() => setOpen(section.title)}
            onMouseLeave={() => setOpen(null)}
          >
            <button
              type="button"
              className={cn(
                "h-9 inline-flex items-center gap-1 px-3 rounded-md text-[13.5px] font-medium transition-colors duration-fast",
                active || open === section.title
                  ? "bg-accent text-[hsl(var(--brand-navy))] dark:text-[hsl(var(--brand-gold))]"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              aria-haspopup="menu"
              aria-expanded={open === section.title}
            >
              {section.title}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 opacity-60 transition-transform duration-fast",
                  open === section.title && "rotate-180",
                )}
              />
            </button>

            {open === section.title && section.children && (
              // Outer wrapper with transparent pt-1.5 bridges the visual gap
              // between trigger and panel — without this, the cursor crosses
              // dead space on the way down and onMouseLeave closes the menu.
              <div
                className="absolute top-full left-0 z-50 pt-1.5"
                role="presentation"
              >
                <div
                  role="menu"
                  className={cn(
                    "rounded-lg border border-border bg-popover shadow-card-lg p-3",
                    section.wide ? "grid gap-1" : "min-w-[260px]",
                  )}
                  style={
                    section.wide
                      ? {
                          gridTemplateColumns: `repeat(${section.children.length}, minmax(220px, 1fr))`,
                        }
                      : undefined
                  }
                >
                  {section.children.map((col, ci) => (
                    <div key={ci} className="flex flex-col gap-0.5">
                      {col.map((link) => {
                        const linkActive = isNavActive(location, link.href);
                        return (
                          <Link
                            key={link.href}
                            href={link.href}
                            className={cn(
                              "block rounded-sm px-2.5 py-2 transition-colors duration-fast",
                              linkActive
                                ? "bg-[hsl(var(--brand-gold)/0.12)]"
                                : "hover:bg-muted",
                            )}
                            onClick={() => setOpen(null)}
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
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default NavPrimary;
