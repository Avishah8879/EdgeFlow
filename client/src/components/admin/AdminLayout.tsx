import { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AdminNav } from "./AdminNav";
import { AdminGuard } from "@/components/AdminGuard";
import { Eyebrow } from "@/components/ui/eyebrow";
import type { UserRole } from "@/lib/auth";

interface AdminLayoutProps {
  children: ReactNode;
  requiredRole?: UserRole;
  /** Optional masthead — when `title` is provided, renders the design-spec
      Eyebrow + display H1 + descriptor band on a card-bg surface. */
  eyebrow?: string;
  title?: string;
  description?: string;
  /** Optional right-aligned slot in the masthead (refresh button, filters, etc.) */
  rightSlot?: ReactNode;
}

/**
 * AdminLayout - Wraps admin pages with sidebar navigation, role protection,
 * and an optional design-spec masthead band.
 *
 * Pages should pass `title` (and optionally `eyebrow` / `description`) so the
 * masthead is consistent across all admin screens; older pages that still
 * inline their own H1 continue to work.
 *
 * Usage:
 *   <AdminLayout title="Dashboard" eyebrow="Admin · Overview" description="...">
 *     ...page body...
 *   </AdminLayout>
 */
export function AdminLayout({
  children,
  requiredRole = "moderator",
  eyebrow,
  title,
  description,
  rightSlot,
}: AdminLayoutProps) {
  const { user } = useAuth();
  const userRole = user?.role || "user";

  return (
    <AdminGuard requiredRole={requiredRole}>
      <div className="min-h-screen bg-background">
        <AdminNav userRole={userRole} />
        <div className="ml-64 min-h-[calc(100vh-4rem)] flex flex-col">
          {title && (
            <section className="border-b border-border bg-card">
              <div className="px-6 py-6 md:py-7">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1.5 min-w-0">
                    <Eyebrow tone="gold" rule>
                      {eyebrow ?? "Admin"}
                    </Eyebrow>
                    <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
                      {title}
                    </h1>
                    {description && (
                      <p className="text-sm text-muted-foreground max-w-3xl">
                        {description}
                      </p>
                    )}
                  </div>
                  {rightSlot && (
                    <div className="flex-shrink-0 flex items-center gap-2">
                      {rightSlot}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </AdminGuard>
  );
}

export default AdminLayout;
