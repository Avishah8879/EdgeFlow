import { ReactNode } from "react";
import { Redirect, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, ShieldX } from "lucide-react";
import type { UserRole } from "@/lib/auth";

interface AdminGuardProps {
  children: ReactNode;
  requiredRole?: UserRole;
  fallback?: ReactNode;
}

/**
 * Role hierarchy for permission checking.
 * Higher index = higher privilege level.
 */
const ROLE_HIERARCHY: UserRole[] = ["user", "moderator", "admin", "super_admin"];

/**
 * Check if user's role meets the required role level.
 */
function hasRoleLevel(userRole: UserRole | undefined, requiredRole: UserRole): boolean {
  if (!userRole) return false;
  const userLevel = ROLE_HIERARCHY.indexOf(userRole);
  const requiredLevel = ROLE_HIERARCHY.indexOf(requiredRole);
  return userLevel >= requiredLevel;
}

/**
 * AdminGuard - Protects routes that require admin/moderator access.
 * Redirects unauthenticated users to /login.
 * Shows access denied for authenticated users without sufficient role.
 *
 * Usage:
 * <AdminGuard><AdminPage /></AdminGuard>
 * <AdminGuard requiredRole="super_admin"><SuperAdminPage /></AdminGuard>
 *
 * Default required role is "moderator" (moderator, admin, super_admin can access).
 */
export function AdminGuard({
  children,
  requiredRole = "moderator",
  fallback,
}: AdminGuardProps) {
  const { isAuthenticated, user, status } = useAuth();
  const [location] = useLocation();

  // Show loading state while checking authentication
  if (status === "loading") {
    return (
      fallback || (
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    const returnUrl = encodeURIComponent(location);
    return <Redirect to={`/login?returnUrl=${returnUrl}`} />;
  }

  // Check if user has required role
  const userRole = user?.role || "user";
  if (!hasRoleLevel(userRole, requiredRole)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <ShieldX className="h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-semibold">Access Denied</h1>
        <p className="text-muted-foreground">
          You don't have permission to access this page.
        </p>
        <p className="text-sm text-muted-foreground">
          Required role: <span className="font-medium">{requiredRole}</span> |
          Your role: <span className="font-medium">{userRole}</span>
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

export default AdminGuard;
