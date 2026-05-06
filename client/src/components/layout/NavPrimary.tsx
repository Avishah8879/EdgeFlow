import { Link, useLocation } from "wouter";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

type NavLink = { label: string; href: string; sublabel?: string };
type NavGroup = NavLink[];

interface NavSection {
  title: string;
  href?: string;
  /** Single link if no children. */
  children?: NavGroup[];
  /** Wide multi-col dropdown (Terminal-style). */
  wide?: boolean;
  /** Role gate. */
  adminOnly?: boolean;
}

const NAV: NavSection[] = [
  { title: "Dashboard", href: "/home" },
  {
    title: "Markets",
    children: [
      [
        { label: "Stocks", href: "/stocks", sublabel: "3,000+ NSE equities" },
        { label: "Indices", href: "/indices", sublabel: "57 Indian indices" },
        { label: "World Indices", href: "/world-indices", sublabel: "Global markets" },
        { label: "Most Active", href: "/most-active", sublabel: "Volume leaders" },
        { label: "FII / DII", href: "/fii-dii", sublabel: "Institutional flows" },
        { label: "IPOs", href: "/ipos", sublabel: "Upcoming + recent" },
      ],
    ],
  },
  {
    title: "Research",
    children: [
      [
        { label: "Expert Screener", href: "/screener", sublabel: "Boolean expressions" },
        { label: "Fundamental Scanner", href: "/equity-screener", sublabel: "Quality + value rules" },
        { label: "Pattern Search", href: "/pattern-search", sublabel: "Chart pattern detection" },
        { label: "Sector Rotation", href: "/systematic-patterns", sublabel: "RRG rotation map" },
        { label: "Seasonality", href: "/seasonality", sublabel: "Weekly + monthly patterns" },
        { label: "Portfolio Optimizer", href: "/portfolio-optimizer", sublabel: "Black-Litterman" },
        { label: "Compare", href: "/compare", sublabel: "Multi-symbol overlay" },
      ],
      [
        { label: "Saved Results", href: "/saved-results", sublabel: "Library of runs" },
        { label: "Market Reports", href: "/market-reports", sublabel: "Sector outlooks" },
        { label: "Research Reports", href: "/research-reports", sublabel: "Broker reports" },
        { label: "Financial Results", href: "/financial-results", sublabel: "Quarterly + annual" },
        { label: "Corporate Actions", href: "/corporate-actions", sublabel: "Splits, dividends, bonus" },
        { label: "Blog", href: "/blog", sublabel: "Editorial + guides" },
        { label: "Notes", href: "/notes", sublabel: "Personal research" },
      ],
    ],
    wide: true,
  },
  {
    title: "Terminal",
    children: [
      [
        { label: "Advanced Chart", href: "/chart", sublabel: "OHLC + indicators" },
        { label: "Option Chain", href: "/options", sublabel: "Live NSE options" },
        { label: "Options Visualizer", href: "/options-visualizer", sublabel: "GEX + IV surface" },
        { label: "Order Book", href: "/order-book", sublabel: "L2 depth (Fyers)" },
        { label: "Time & Sales", href: "/time-sales", sublabel: "Tick-by-tick" },
      ],
      [
        { label: "Black-Scholes", href: "/black-scholes", sublabel: "Options pricing" },
        { label: "Pair Trading", href: "/pair-trading", sublabel: "Cointegration matrix" },
        { label: "Calculator", href: "/calculator", sublabel: "Position size + P&L" },
        { label: "Monitor", href: "/monitor", sublabel: "Live alerts" },
        { label: "News", href: "/news", sublabel: "Live financial feed" },
      ],
      [
        { label: "Tip-Tease AI", href: "/tip-tease", sublabel: "Conversational analysis" },
        { label: "Forum", href: "/forum", sublabel: "Community" },
        { label: "Help", href: "/help", sublabel: "Docs + support" },
      ],
    ],
    wide: true,
  },
  {
    title: "Account",
    children: [
      [
        { label: "Profile", href: "/profile", sublabel: "Account + preferences" },
        { label: "Coins wallet", href: "/profile?tab=coins", sublabel: "Buy + transactions" },
        { label: "Pricing", href: "/pricing", sublabel: "Plans + coin packs" },
        { label: "Developers", href: "/developers", sublabel: "API keys + usage" },
      ],
    ],
  },
  {
    title: "Admin",
    adminOnly: true,
    children: [
      [
        { label: "Dashboard", href: "/admin", sublabel: "Operations overview" },
        { label: "Users", href: "/admin/users", sublabel: "Manage accounts" },
        { label: "Coin Transactions", href: "/admin/coins", sublabel: "Wallet ledger" },
        { label: "Coin Packs", href: "/admin/coin-packs", sublabel: "Pricing" },
        { label: "Feature Costs", href: "/admin/feature-costs", sublabel: "Per-feature pricing" },
        { label: "Signup Bonus", href: "/admin/signup-bonus", sublabel: "Welcome coins" },
      ],
      [
        { label: "Payments", href: "/admin/payments", sublabel: "Cashfree intents" },
        { label: "Platforms", href: "/admin/platforms", sublabel: "API keys (S2S)" },
        { label: "API Keys", href: "/admin/api-keys", sublabel: "Developer keys" },
        { label: "Feature Flags", href: "/admin/feature-flags", sublabel: "Toggles" },
        { label: "Rate Limits", href: "/admin/rate-limits", sublabel: "Per-endpoint caps" },
      ],
      [
        { label: "Audit Logs", href: "/admin/audit", sublabel: "All admin actions" },
        { label: "Notifications", href: "/admin/notifications", sublabel: "System banners" },
        { label: "Email Settings", href: "/admin/email-settings", sublabel: "SES + SMTP" },
        { label: "Security", href: "/admin/security", sublabel: "Sessions + locks" },
        { label: "Settings", href: "/admin/settings", sublabel: "Platform config" },
        { label: "Analytics", href: "/admin/analytics", sublabel: "Usage stats" },
      ],
    ],
    wide: true,
  },
];

function isActive(location: string, href: string): boolean {
  if (href === "/home") return location === "/home" || location === "/";
  return location === href || location.startsWith(href + "/");
}

function sectionActive(location: string, section: NavSection): boolean {
  if (section.href) return isActive(location, section.href);
  if (!section.children) return false;
  return section.children.some((col) => col.some((l) => isActive(location, l.href)));
}

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
                        const linkActive = isActive(location, link.href);
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
