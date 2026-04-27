import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  Settings,
  Bell,
  FileText,
  Shield,
  Activity,
  ChevronLeft,
  Gauge,
  Flag,
  Key,
  Mail,
  Layers,
  Coins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/auth";

interface AdminNavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredRole?: UserRole;
}

const navItems: AdminNavItem[] = [
  { label: "Dashboard", path: "/admin", icon: LayoutDashboard },
  { label: "Users", path: "/admin/users", icon: Users },
  { label: "Analytics", path: "/admin/analytics", icon: Activity },
  { label: "Notifications", path: "/admin/notifications", icon: Bell },
  { label: "Audit Logs", path: "/admin/audit", icon: FileText },
  { label: "API Keys", path: "/admin/api-keys", icon: Key, requiredRole: "admin" },
  { label: "Platforms", path: "/admin/platforms", icon: Layers, requiredRole: "admin" },
  { label: "Coin Ledger", path: "/admin/coins", icon: Coins, requiredRole: "admin" },
  { label: "Rate Limits", path: "/admin/rate-limits", icon: Gauge, requiredRole: "admin" },
  { label: "Feature Flags", path: "/admin/feature-flags", icon: Flag, requiredRole: "admin" },
  { label: "Email Settings", path: "/admin/email-settings", icon: Mail, requiredRole: "admin" },
  { label: "Settings", path: "/admin/settings", icon: Settings, requiredRole: "admin" },
  { label: "Security", path: "/admin/security", icon: Shield, requiredRole: "super_admin" },
];

interface AdminNavProps {
  userRole?: UserRole;
}

/**
 * Role hierarchy for permission checking.
 */
const ROLE_HIERARCHY: UserRole[] = ["user", "moderator", "admin", "super_admin"];

function hasRoleLevel(userRole: UserRole | undefined, requiredRole: UserRole): boolean {
  if (!userRole) return false;
  const userLevel = ROLE_HIERARCHY.indexOf(userRole);
  const requiredLevel = ROLE_HIERARCHY.indexOf(requiredRole);
  return userLevel >= requiredLevel;
}

export function AdminNav({ userRole = "user" }: AdminNavProps) {
  const [location] = useLocation();

  const filteredItems = navItems.filter(
    (item) => !item.requiredRole || hasRoleLevel(userRole, item.requiredRole)
  );

  return (
    <aside className="fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 border-r bg-background">
      <div className="flex h-full flex-col">
        <div className="border-b p-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2 w-full justify-start">
              <ChevronLeft className="h-4 w-4" />
              Back to Main Site
            </Button>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 p-4">
          {filteredItems.map((item) => {
            const isActive = location === item.path ||
              (item.path !== "/admin" && location.startsWith(item.path));

            return (
              <Link key={item.path} href={item.path}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "w-full justify-start gap-3",
                    isActive && "bg-secondary"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-4">
          <div className="rounded-lg bg-muted p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Admin Panel
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Role: <span className="capitalize font-medium">{userRole.replace("_", " ")}</span>
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default AdminNav;
