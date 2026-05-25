import {
  AdminLayout,
  AdminKpiStrip,
  AdminKpi,
  AdminPanel,
  AdminFeedRow,
  AdminHealthRow,
  AdminPill,
  AdminNumCell,
} from "@/components/admin";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminStats } from "@/hooks/use-admin-stats";
import { useAdminCoinStats } from "@/hooks/use-coin-wallet";
import { AlertCircle } from "lucide-react";

const fmt = new Intl.NumberFormat("en-IN");

function formatINR(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 1_00_00_000) return `₹${(rupees / 1_00_00_000).toFixed(2)} Cr`;
  if (rupees >= 1_00_000) return `₹${(rupees / 1_00_000).toFixed(1)} L`;
  return `₹${fmt.format(Math.round(rupees))}`;
}

function StatusToText(s: "healthy" | "degraded" | "down"): { pct: number; tone: "positive" | "gold" | "negative"; label: string } {
  if (s === "healthy") return { pct: 100, tone: "positive", label: "100 %" };
  if (s === "degraded") return { pct: 92, tone: "gold", label: "Degraded" };
  return { pct: 0, tone: "negative", label: "Down" };
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-[88px] w-full" />
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
        <Skeleton className="h-[400px]" />
        <Skeleton className="h-[400px]" />
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { data: stats, isLoading, error } = useAdminStats();
  const { data: coinResp } = useAdminCoinStats();
  const coins = coinResp?.data;

  return (
    <AdminLayout
      eyebrow="Internal · Admin"
      title="Admin console"
      description="User management, system health, and feature flags · for EquityPro staff only."
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/40 bg-destructive/5 text-destructive">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">Failed to load statistics: {error.message}</p>
          </div>
        )}

        {isLoading || !stats ? (
          <LoadingState />
        ) : (
          <>
            {/* KPI strip — 5 cells, mono numerics, gold accent for revenue */}
            <AdminKpiStrip cols={5}>
              <AdminKpi
                label="Active users · 30d"
                value={fmt.format(stats.users.active)}
                delta={`+${stats.activity.signupsThisWeek} WoW`}
                tone="positive"
              />
              <AdminKpi
                label="Premium users"
                value={fmt.format(stats.users.byTier.premium)}
                delta={`${Math.round((stats.users.byTier.premium / Math.max(1, stats.users.total)) * 100)}% of total`}
                tone="positive"
              />
              <AdminKpi
                label="Revenue · 24h"
                value={coins ? formatINR(coins.revenue_paise_24h) : "—"}
                delta={coins ? `${fmt.format(coins.paid_24h)} paid · ${fmt.format(coins.pending_intents)} pending` : undefined}
                accent="gold"
              />
              <AdminKpi
                label="Logins · today"
                value={fmt.format(stats.activity.loginsToday)}
                delta={
                  stats.activity.failedLoginsToday > 0
                    ? `${fmt.format(stats.activity.failedLoginsToday)} failed`
                    : "no failures"
                }
                tone={stats.activity.failedLoginsToday > 0 ? "negative" : "positive"}
              />
              <AdminKpi
                label="Coins · 24h"
                value={coins ? fmt.format(coins.coins_issued_24h) : "—"}
                delta={coins ? `${fmt.format(coins.coins_spent_24h)} spent` : undefined}
              />
            </AdminKpiStrip>

            {/* Two-column body — recent activity / system health */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
              <AdminPanel
                title="Recent activity · 7 days"
                description="Signups, logins, and rolling totals from the auth database."
              >
                <div className="space-y-1">
                  <AdminFeedRow
                    marker={`${fmt.format(stats.activity.signupsToday)}`}
                    title="Signups · today"
                    sub={`${fmt.format(stats.activity.signupsThisWeek)} this week · ${fmt.format(stats.activity.signupsThisMonth)} this month`}
                  />
                  <AdminFeedRow
                    marker={`${fmt.format(stats.activity.loginsToday)}`}
                    title="Logins · today"
                    sub={`${fmt.format(stats.activity.loginsThisWeek)} this week`}
                  />
                  {stats.activity.failedLoginsToday > 0 && (
                    <AdminFeedRow
                      marker={
                        <AdminNumCell tone="negative">
                          {fmt.format(stats.activity.failedLoginsToday)}
                        </AdminNumCell>
                      }
                      title="Failed logins · today"
                      sub="Review the audit log to spot brute-force patterns."
                    />
                  )}
                  <AdminFeedRow
                    marker={`${fmt.format(stats.users.locked)}`}
                    title="Locked accounts"
                    sub={`${fmt.format(stats.users.emailVerified)} email-verified across the user base`}
                  />
                  <AdminFeedRow
                    marker={`${fmt.format(stats.users.byProvider.google)}`}
                    title="Google sign-in users"
                    sub={`${fmt.format(stats.users.byProvider.password)} on password auth`}
                  />
                </div>
              </AdminPanel>

              <AdminPanel
                title="System health"
                actions={
                  <AdminPill
                    tone={
                      stats.system.database === "healthy" &&
                      stats.system.api === "healthy" &&
                      stats.system.cache === "healthy"
                        ? "positive"
                        : "gold"
                    }
                    pulse
                  >
                    {stats.system.database === "healthy" && stats.system.api === "healthy" && stats.system.cache === "healthy"
                      ? "All green"
                      : "Watch"}
                  </AdminPill>
                }
                description={
                  stats.system.lastCheck
                    ? `Last checked ${new Date(stats.system.lastCheck).toLocaleTimeString()}`
                    : undefined
                }
              >
                <div className="space-y-1">
                  {(() => {
                    const db = StatusToText(stats.system.database);
                    return (
                      <AdminHealthRow label="Database (Postgres)" pct={db.pct} tone={db.tone} value={db.label} />
                    );
                  })()}
                  {(() => {
                    const cache = StatusToText(stats.system.cache);
                    return (
                      <AdminHealthRow label="Cache (Redis)" pct={cache.pct} tone={cache.tone} value={cache.label} />
                    );
                  })()}
                  {(() => {
                    const api = StatusToText(stats.system.api);
                    return (
                      <AdminHealthRow label="API server" pct={api.pct} tone={api.tone} value={api.label} />
                    );
                  })()}
                  <AdminHealthRow label="Active platforms" pct={coins ? Math.round((coins.active_platforms / Math.max(1, coins.total_platforms)) * 100) : 0} value={coins ? `${coins.active_platforms} / ${coins.total_platforms}` : "—"} />
                </div>
              </AdminPanel>
            </div>

            {/* Two-column body — user breakdown / verification */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <AdminPanel
                title="Users by role"
                description={`${fmt.format(stats.users.total)} total accounts on EquityPro`}
              >
                <div className="space-y-1">
                  <AdminFeedRow
                    marker={
                      <AdminNumCell>{fmt.format(stats.users.byRole.user)}</AdminNumCell>
                    }
                    title="Regular users"
                    sub="Standard authenticated users with no admin privileges."
                  />
                  <AdminFeedRow
                    marker={
                      <AdminNumCell>{fmt.format(stats.users.byRole.moderator)}</AdminNumCell>
                    }
                    title="Moderators"
                    sub="Read-only admin access · audit logs, user lookups."
                  />
                  <AdminFeedRow
                    marker={
                      <AdminNumCell tone="gold">{fmt.format(stats.users.byRole.admin)}</AdminNumCell>
                    }
                    title="Admins"
                    sub="Full admin write access · user management, settings."
                  />
                  <AdminFeedRow
                    marker={
                      <AdminNumCell tone="negative">{fmt.format(stats.users.byRole.super_admin)}</AdminNumCell>
                    }
                    title="Super admins"
                    sub="Plus impersonation, role changes, destructive actions."
                  />
                </div>
              </AdminPanel>

              <AdminPanel
                title="Verification & tier mix"
                description="Snapshot of verification + paid-plan health."
              >
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <div className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                      Email verified
                    </div>
                    <AdminNumCell tone="positive" className="text-2xl font-bold block">
                      {fmt.format(stats.users.emailVerified)}
                    </AdminNumCell>
                    <div className="text-xs text-muted-foreground">
                      {Math.round((stats.users.emailVerified / Math.max(1, stats.users.total)) * 100)}% of total
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                      Locked
                    </div>
                    <AdminNumCell tone="negative" className="text-2xl font-bold block">
                      {fmt.format(stats.users.locked)}
                    </AdminNumCell>
                    <div className="text-xs text-muted-foreground">
                      Admin must unlock · /admin/security
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                      Premium rate
                    </div>
                    <AdminNumCell tone="gold" className="text-2xl font-bold block">
                      {Math.round((stats.users.byTier.premium / Math.max(1, stats.users.total)) * 100)}%
                    </AdminNumCell>
                    <div className="text-xs text-muted-foreground">
                      {fmt.format(stats.users.byTier.premium)} of {fmt.format(stats.users.total)}
                    </div>
                  </div>
                </div>
              </AdminPanel>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
