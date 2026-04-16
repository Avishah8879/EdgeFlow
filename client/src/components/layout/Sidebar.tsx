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
  GitCompare,
  Newspaper,
  FileText,
  Link2,
  BookOpen,
  Eye,
  Search,
  Rocket,
  Brain,
  MessageSquare,
  ListChecks,
  Briefcase,
  Calculator,
  StickyNote,
  Bookmark,
  Code,
  Users,
  HelpCircle,
  History,
  ChevronLeft,
  ChevronRight,
  Shield,
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
      { label: "Compare", href: "/compare", icon: GitCompare },
      { label: "News", href: "/news", icon: Newspaper },
      { label: "Research Reports", href: "/research-reports", icon: FileText },
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
      { label: "Expert Screener", href: "/screener", icon: Search },
      { label: "Fundamental Scanner", href: "/equity-screener", icon: ListChecks },
      { label: "Pattern Search", href: "/pattern-search", icon: Eye },
      { label: "Systematic Patterns", href: "/systematic-patterns", icon: Brain },
      { label: "Seasonality", href: "/seasonality", icon: Calendar },
    ],
  },
  {
    title: "TOOLS",
    items: [
      { label: "Watchlist", href: "/watchlist", icon: Bookmark },
      { label: "Portfolio Optimizer", href: "/portfolio-optimizer", icon: Briefcase },
      { label: "Calculator", href: "/calculator", icon: Calculator },
      { label: "Notes", href: "/notes", icon: StickyNote },
      { label: "Saved Results", href: "/saved-results", icon: Bookmark },
    ],
  },
  {
    title: "COMMUNITY",
    items: [
      { label: "Blog", href: "/blog", icon: FileText },
      { label: "Market Reports", href: "/market-reports", icon: FileText },
    ],
  },
  {
    title: "ADMIN",
    items: [
    ],
  },
  {
    title: "HELP",
    items: [
      { label: "Changelog", href: "/changelog", icon: History },
      { label: "Help", href: "/help", icon: HelpCircle },
    ],
  },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [location] = useLocation();

  return (
    <aside
      className={cn(
        "fixed left-0 top-14 bottom-0 z-40 flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 overflow-hidden",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Scrollable nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-4 scrollbar-thin">
        {navSections.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
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
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary border-l-2 border-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
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
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-sidebar-border p-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" />
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
