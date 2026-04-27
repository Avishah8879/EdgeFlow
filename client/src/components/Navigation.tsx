import { Link, useLocation } from "wouter";
import {
  TrendingUp,
  Building2,
  LineChart,
  LayoutDashboard,
  LogIn,
  LogOut,
  Monitor,
  User,
  Search,
  Crown,
  Clock,
  Code,
  CreditCard,
  Newspaper,
  Shield,
  Bookmark,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EquityProLogo } from "@/components/EquityProLogo";
import MarketStatusBadge from "@/components/MarketStatusBadge";
import { SearchBar } from "@/components/search";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useSubscriptionStatus } from "@/hooks/use-subscription";
import { usePageVisibility } from "@/contexts/PageVisibilityContext";
import type { UserTier, UserRole } from "@/lib/auth";
import { ModeToggle } from "@/components/ModeToggle";
import { MobileNav } from "@/components/MobileNav";

type InternalNavItem = {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  external?: false;
  requiredTier?: UserTier;
  pageKey?: string; // Key for page visibility check
};

type ExternalNavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  external: true;
};

type NavItem = InternalNavItem | ExternalNavItem;

// Check if user has admin access (moderator or above)
const ADMIN_ROLES: UserRole[] = ["moderator", "admin", "super_admin"];
const hasAdminAccess = (role?: UserRole) => role && ADMIN_ROLES.includes(role);

export default function Navigation() {
  const [location] = useLocation();
  const { isAuthenticated, user, logout } = useAuth();
  const { isPremium, isTrialing, trialEndsAt, canStartTrial } =
    useSubscriptionStatus();
  const { isPageVisible } = usePageVisibility();
  const userTier: UserTier = user?.tier ?? "free";
  const userInitial =
    (user?.name || user?.email || "?").trim().charAt(0).toUpperCase() || "U";
  const isAdmin = hasAdminAccess(user?.role);

  // Calculate days remaining in trial
  const getTrialDaysRemaining = () => {
    if (!trialEndsAt) return 0;
    const now = new Date();
    const diff = trialEndsAt.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const navItems: NavItem[] = [
    { label: "Markets", path: "/home", icon: LayoutDashboard, pageKey: "home" },
    { label: "Stocks", path: "/stocks", icon: TrendingUp, pageKey: "stocks" },
    {
      label: "Expert Screener",
      path: "/screener",
      icon: Search,
      requiredTier: "semi",
      pageKey: "screener",
    },
    {
      label: "Alpha Generation",
      path: "/alpha-generation",
      icon: LineChart,
      requiredTier: "semi",
      pageKey: "backtest",
    },
    {
      label: "EquityPro AI",
      path: "/tip-tease",
      icon: Bot,
      requiredTier: "semi",
      pageKey: "tip-tease",
    },
    {
      label: "EquityPro Terminal",
      href: import.meta.env.VITE_FINTERMINAL_URL || "https://your-domain.com/",
      external: true,
      icon: Monitor,
    },
    // Overflow items (appear in "More" dropdown)
    { label: "Indices", path: "/indices", icon: Building2, pageKey: "indices" },
    { label: "News", path: "/news", icon: Newspaper, pageKey: "news" },
  ];

  // Filter nav items based on page visibility
  const visibleNavItems = navItems.filter((item) => {
    if ("pageKey" in item && item.pageKey) {
      return isPageVisible(item.pageKey);
    }
    return true; // External links are always visible
  });

  const externalNavItems = visibleNavItems.filter(
    (item): item is ExternalNavItem => item.external === true
  );
  const internalNavItems = visibleNavItems.filter(
    (item): item is InternalNavItem => !item.external
  );
  const primaryInternalNavItems = internalNavItems.slice(0, 4);
  const overflowInternalNavItems = internalNavItems.slice(4);

  return (
    <nav className="sticky top-0 z-50 border-b bg-background">
      <div className="mx-auto w-full px-6">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/">
            <Button
              variant="ghost"
              className="p-0 hover:bg-transparent"
              asChild
            >
              <div data-testid="link-home">
                <EquityProLogo size="lg" />
              </div>
            </Button>
          </Link>

          <div className="hidden md:flex flex-1 max-w-sm md:max-w-md lg:max-w-lg mx-4 lg:mx-8">
            <SearchBar
              variant="inline"
              placeholder="Search stocks, funds, indices..."
              testId="input-search"
              enableGlobalShortcut
            />
          </div>

          <div className="hidden lg:flex items-center gap-1">
            {primaryInternalNavItems.map((item) => (
              <Link key={item.path} href={item.path}>
                <Button
                  variant={location === item.path ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "gap-2",
                    item.requiredTier === "semi" && userTier === "free" &&
                      !isPremium &&
                      "text-muted-foreground"
                  )}
                  data-testid={`link-${item.label
                    .toLowerCase()
                    .replace(/\s+/g, "-")}`}
                  aria-disabled={Boolean(
                    item.requiredTier === "semi" && userTier === "free" && !isPremium
                  )}
                  title={
                    item.requiredTier === "semi" && userTier === "free" && !isPremium
                      ? "Premium workspace"
                      : undefined
                  }
                >
                  <item.icon className="h-4 w-4" />
                  <span className="flex items-center gap-1">
                    {item.label}
                    {item.requiredTier === "semi" && userTier === "free" && !isPremium && (
                      <span className="rounded-full border border-primary/50 px-1.5 text-[0.6rem] uppercase tracking-widest text-primary">
                        Pro
                      </span>
                    )}
                  </span>
                </Button>
              </Link>
            ))}
            {externalNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.label}
                  variant="ghost"
                  size="sm"
                  className="gap-2"
                  asChild
                  data-testid={`link-${item.label
                    .toLowerCase()
                    .replace(/\s+/g, "-")}`}
                >
                  <a href={item.href} target="_blank" rel="noopener noreferrer">
                    {Icon && <Icon className="h-4 w-4" />}
                    {item.label}
                  </a>
                </Button>
              );
            })}
            {overflowInternalNavItems.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="button-more-menu"
                  >
                    More
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {overflowInternalNavItems.map((item) => (
                    <DropdownMenuItem key={item.path} asChild>
                      <Link href={item.path}>
                        <div className="flex items-center gap-2 w-full cursor-pointer">
                          <item.icon className="h-4 w-4" />
                          <span className="flex items-center gap-1">
                            {item.label}
                            {item.requiredTier === "semi" && userTier === "free" && !isPremium && (
                              <span className="rounded-full border border-primary/50 px-1.5 text-[0.6rem] uppercase tracking-widest text-primary">
                                Pro
                              </span>
                            )}
                          </span>
                        </div>
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div className="hidden md:flex items-center gap-2">
            <MarketStatusBadge />
            <ModeToggle />
          </div>

          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-primary font-semibold"
                    aria-label="Account menu"
                    data-testid="button-account"
                  >
                    {userInitial}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="profile-dropdown w-56"
                >
                  <div className="profile-dropdown-header">
                    <p className="profile-dropdown-name">
                      {user?.name || "Authenticated user"}
                    </p>
                    <p className="profile-dropdown-email truncate">
                      {user?.email}
                    </p>
                    {/* TEMPORARY: Tier badges hidden - all users get premium */}
                    {/* <div className="flex items-center gap-2 mt-1">
                      {isPremium ? (
                        <Badge variant="default" className="text-xs py-0 px-1.5">
                          <Crown className="h-3 w-3 mr-1" />
                          Premium
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs py-0 px-1.5">
                          Basic
                        </Badge>
                      )}
                      {isTrialing && (
                        <Badge variant="outline" className="text-xs py-0 px-1.5">
                          <Clock className="h-3 w-3 mr-1" />
                          {getTrialDaysRemaining()}d left
                        </Badge>
                      )}
                    </div> */}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/profile">
                      <div className="flex items-center gap-2 w-full cursor-pointer">
                        <User className="h-4 w-4" />
                        View Profile
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/saved-results">
                      <div className="flex items-center gap-2 w-full cursor-pointer">
                        <Bookmark className="h-4 w-4" />
                        Saved Results
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/developers">
                      <div className="flex items-center gap-2 w-full cursor-pointer">
                        <Code className="h-4 w-4" />
                        Developer API
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin">
                        <div className="flex items-center gap-2 w-full cursor-pointer">
                          <Shield className="h-4 w-4" />
                          Admin Dashboard
                        </div>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {/* TEMPORARY: Pricing link hidden - all users get premium */}
                  {/* <DropdownMenuItem asChild>
                    <Link href="/pricing">
                      <div className="flex items-center gap-2 w-full cursor-pointer">
                        <CreditCard className="h-4 w-4" />
                        {isPremium ? "Manage Subscription" : canStartTrial ? "Start Free Trial" : "View Plans"}
                      </div>
                    </Link>
                  </DropdownMenuItem> */}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="signout-item"
                    onSelect={(event) => {
                      event.preventDefault();
                      logout();
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link
                href="/login"
                className="login-button"
                data-testid="button-login"
                aria-label="EquityPro Login"
              >
                <span className="login-button-inner">
                  <LogIn />
                  Sign In
                </span>
              </Link>
            )}
            <MobileNav
              navItems={navItems}
              isAuthenticated={isAuthenticated}
              isPremium={isPremium}
              onLogout={logout}
            />
          </div>
        </div>
      </div>

      <div className="md:hidden border-t px-4 sm:px-6 py-2 space-y-3">
        <SearchBar
          variant="inline"
          placeholder="Search..."
          testId="input-search-mobile"
        />
        {isAuthenticated ? (
          <button
            onClick={logout}
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        ) : (
          <Link href="/login" className="login-button w-fit">
            <span className="login-button-inner">
              <LogIn />
              Sign In
            </span>
          </Link>
        )}
        {externalNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.label}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              {Icon && <Icon className="h-4 w-4" />}
              {item.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
