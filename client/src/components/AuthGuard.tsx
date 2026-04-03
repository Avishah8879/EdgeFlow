import { ReactNode } from "react";
import { Redirect, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

interface AuthGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * AuthGuard - Protects routes that require authentication.
 * Redirects unauthenticated users to /login with a returnUrl parameter.
 *
 * Usage:
 * <AuthGuard><ProtectedPage /></AuthGuard>
 *
 * Note: For tier-based access control, use AccessGuard instead.
 */
export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { isAuthenticated, status } = useAuth();
  const [location] = useLocation();

  // Show loading state while checking authentication
  if (status === "loading") {
    return fallback || (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    const returnUrl = encodeURIComponent(location);
    return <Redirect to={`/login?returnUrl=${returnUrl}`} />;
  }

  return <>{children}</>;
}

export default AuthGuard;
