import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Activity,
  BarChart3,
  TrendingUp,
  Globe,
  Zap,
  Calendar,
  LineChart,
  Newspaper,
  Link2,
  BookOpen,
  Eye,
  Search,
  Brain,
  ListChecks,
  Briefcase,
  Calculator,
  Bookmark,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "OVERVIEW",
    items: [
      { label: "Dashboard", href: "/home", icon: LayoutDashboard },
      { label: "Monitor", href: "/monitor", icon: Activity },
    ],
  },
  {
    title: "MARKETS",
    items: [
      { label: "Stocks", href: "/stocks", icon: BarChart3 },
      { label: "Indices", href: "/indices", icon: TrendingUp },
      { label: "World Indices", href: "/world-indices", icon: Globe },
      { label: "Most Active", href: "/most-active", icon: Zap },
      { label: "FII/DII", href: "/fii-dii", icon: Users },
      { label: "IPOs", href: "/ipos", icon: Calendar },
    ],
  },
  {
    title: "CHARTS & DATA",
    items: [
      { label: "Advanced Chart", href: "/chart", icon: LineChart },
      { label: "Pair Trading", href: "/pair-trading", icon: Activity },
      { label: "News", href: "/news", icon: Newspaper },
    ],
  },
  {
    title: "OPTIONS",
    items: [
      { label: "Option Chain", href: "/options", icon: Link2 },
      { label: "Options Visualizer", href: "/options-visualizer", icon: Eye },
      { label: "Order Book", href: "/order-book", icon: BookOpen },
      { label: "Black-Scholes", href: "/black-scholes", icon: Calculator },
    ],
  },
  {
    title: "ANALYSIS",
    items: [
      { label: "Technical Screener", href: "/screener", icon: Search },
      { label: "Fundamental Scanner", href: "/equity-screener", icon: ListChecks },
      { label: "Pattern Search", href: "/pattern-search", icon: Eye },
      { label: "Sector Rotation", href: "/systematic-patterns", icon: Brain },
      { label: "Seasonality", href: "/seasonality", icon: Calendar },
    ],
  },
  {
    title: "TOOLS",
    items: [
      { label: "Portfolio Optimizer", href: "/portfolio-optimizer", icon: Briefcase },
      { label: "Saved Results", href: "/saved-results", icon: Bookmark },
    ],
  },
  {
    title: "ADMIN",
    items: [
    ],
  },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [location] = useLocation();

  return (
    <aside
      className={cn(
        "fixed left-0 top-16 bottom-0 z-40 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300 overflow-hidden",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Scrollable nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2 space-y-5 scrollbar-thin">
        {navSections.map((section) => {
          if (section.items.length === 0) return null;
          return (
            <div key={section.title}>
              {!collapsed && (
                <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-uppercase text-sidebar-foreground/40">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive =
                    location === item.href ||
                    (item.href !== "/home" && location.startsWith(item.href + "/"));
                  const Icon = item.icon;

                  const linkContent = (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-fast",
                        isActive
                          ? "bg-[hsl(var(--brand-gold)/0.12)] text-[hsl(var(--sidebar-primary))]"
                          : "text-sidebar-foreground/70 hover:bg-[hsl(var(--brand-gold)/0.06)] hover:text-sidebar-foreground"
                      )}
                    >
                      {isActive && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-[hsl(var(--brand-gold))]"
                        />
                      )}
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );

                  if (collapsed) {
                    return (
                      <Tooltip key={item.href} delayDuration={0}>
                        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                        <TooltipContent side="right" className="font-medium">
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return linkContent;
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-sidebar-border p-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/60 hover:bg-[hsl(var(--brand-gold)/0.08)] hover:text-[hsl(var(--brand-gold))] transition-colors duration-fast"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

export { Sidebar };
export type { NavSection, NavItem };
