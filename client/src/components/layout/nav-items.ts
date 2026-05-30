// Single source of truth for the primary navigation menu.
// Consumed by both <NavPrimary/> (desktop horizontal nav) and
// <MobileNavDrawer/> (mobile hamburger sheet). When adding a route, edit
// only this file — both surfaces pick it up.

export type NavLink = { label: string; href: string; sublabel?: string };
export type NavGroup = NavLink[];

export interface NavSection {
  title: string;
  href?: string;
  /** Multi-column dropdown panel. Each inner array is one column. */
  children?: NavGroup[];
  /** Wide multi-col dropdown (Terminal-style). */
  wide?: boolean;
  /** Role gate — section only renders for admin/moderator/super_admin. */
  adminOnly?: boolean;
}

export const NAV: NavSection[] = [
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
        { label: "Technical Screener", href: "/screener", sublabel: "Boolean expressions" },
        { label: "Fundamental Scanner", href: "/equity-screener", sublabel: "Quality + value rules" },
        { label: "Pattern Search", href: "/pattern-search", sublabel: "Chart pattern detection" },
        { label: "Price Pattern", href: "/price-pattern", sublabel: "Price-action detection" },
        { label: "Sector Rotation", href: "/systematic-patterns", sublabel: "RRG rotation map" },
        { label: "Seasonality", href: "/seasonality", sublabel: "Weekly + monthly patterns" },
      ],
      [
        { label: "Portfolio Optimizer", href: "/portfolio-optimizer", sublabel: "Black-Litterman" },
        { label: "Compare", href: "/compare", sublabel: "Multi-symbol overlay" },
        { label: "Saved Results", href: "/saved-results", sublabel: "Library of runs" },
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
        { label: "Option Chain", href: "/options", sublabel: "Live NSE options" },
        { label: "Options Visualizer", href: "/options-visualizer", sublabel: "GEX + IV surface" },
        { label: "Black-Scholes", href: "/black-scholes", sublabel: "Options pricing" },
      ],
      [
        { label: "Pair Trading", href: "/pair-trading", sublabel: "Cointegration matrix" },
        { label: "Monitor", href: "/monitor", sublabel: "Live alerts" },
        { label: "News", href: "/news", sublabel: "Live financial feed" },
      ],
    ],
    wide: true,
  },
  {
    title: "Platforms",
    children: [
      [
        { label: "OptionFlow", href: "/platforms/platform-a", sublabel: "Options analytics and trading workspace" },
        { label: "EquityPro AI", href: "/platforms/platform-b", sublabel: "PineScript AI strategy lab" },
      ],
    ],
  },
  {
    title: "Account",
    children: [
      [
        { label: "Profile", href: "/profile", sublabel: "Account + preferences" },
        { label: "Coins wallet", href: "/profile?tab=coins", sublabel: "Buy + transactions" },
        { label: "Pricing", href: "/pricing", sublabel: "Plans + coin packs" },
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

export function isNavActive(location: string, href: string): boolean {
  if (href === "/home") return location === "/home" || location === "/";
  return location === href || location.startsWith(href + "/");
}

export function sectionActive(location: string, section: NavSection): boolean {
  if (section.href) return isNavActive(location, section.href);
  if (!section.children) return false;
  return section.children.some((col) => col.some((l) => isNavActive(location, l.href)));
}
