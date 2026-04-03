import { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AdminNav } from "./AdminNav";
import { AdminGuard } from "@/components/AdminGuard";
import type { UserRole } from "@/lib/auth";

interface AdminLayoutProps {
  children: ReactNode;
  requiredRole?: UserRole;
}

/**
 * AdminLayout - Wraps admin pages with sidebar navigation and role protection.
 *
 * Usage:
 * <AdminLayout><AdminDashboard /></AdminLayout>
 * <AdminLayout requiredRole="admin"><AdminSettings /></AdminLayout>
 */
export function AdminLayout({ children, requiredRole = "moderator" }: AdminLayoutProps) {
  const { user } = useAuth();
  const userRole = user?.role || "user";

  return (
    <AdminGuard requiredRole={requiredRole}>
      <div className="min-h-screen bg-background">
        <AdminNav userRole={userRole} />
        <main className="ml-64 min-h-[calc(100vh-4rem)] p-6">
          {children}
        </main>
      </div>
    </AdminGuard>
  );
}

export default AdminLayout;
