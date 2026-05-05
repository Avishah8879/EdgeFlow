import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminLayout } from "@/components/admin";
import { useAdminStats } from "@/hooks/use-admin-stats";
import { useAdminCoinStats } from "@/hooks/use-coin-wallet";
import {
  Users,
  UserCheck,
  UserX,
  Crown,
  Shield,
  Activity,
  AlertCircle,
  CheckCircle2,
  XCircle,
  TrendingUp,
  LogIn,
  Coins,
  Layers,
  CreditCard,
  TrendingDown,
} from "lucide-react";

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { value: number; label: string };
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
        {trend && (
          <div className="flex items-center gap-1 mt-2">
            <TrendingUp className="h-3 w-3 text-positive" />
            <span className="text-xs text-positive">+{trend.value}</span>
            <span className="text-xs text-muted-foreground">{trend.label}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SystemStatusBadge({ status }: { status: "healthy" | "degraded" | "down" }) {
  const config = {
    healthy: { icon: CheckCircle2, label: "Healthy", variant: "default" as const, className: "bg-positive text-positive-foreground" },
    degraded: { icon: AlertCircle, label: "Degraded", variant: "secondary" as const, className: "bg-yellow-500 text-white" },
    down: { icon: XCircle, label: "Down", variant: "destructive" as const, className: "" },
  };

  const { icon: Icon, label, variant, className } = config[status];

  return (
    <Badge variant={variant} className={className}>
      <Icon className="h-3 w-3 mr-1" />
      {label}
    </Badge>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-32 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { data: stats, isLoading, error } = useAdminStats();
  const { data: coinStats } = useAdminCoinStats();
  const cs = coinStats?.data;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Overview of system statistics and health
          </p>
        </div>

        {error && (
          <Card className="border-destructive">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <p className="text-destructive">
                Failed to load statistics: {error.message}
              </p>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <LoadingSkeleton />
        ) : stats ? (
          <>
            {/* User Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Total Users"
                value={stats.users.total}
                icon={Users}
                trend={{
                  value: stats.activity.signupsThisWeek,
                  label: "this week",
                }}
              />
              <StatCard
                title="Active Users"
                value={stats.users.active}
                description={`${stats.users.locked} locked accounts`}
                icon={UserCheck}
              />
              <StatCard
                title="Premium Users"
                value={stats.users.byTier.premium}
                description={`${Math.round((stats.users.byTier.premium / stats.users.total) * 100)}% of total`}
                icon={Crown}
              />
              <StatCard
                title="Logins Today"
                value={stats.activity.loginsToday}
                description={`${stats.activity.failedLoginsToday} failed attempts`}
                icon={LogIn}
              />
            </div>

            {/* Monetization Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Coins Issued (24h)"
                value={cs?.coins_issued_24h ?? 0}
                description={`${cs?.active_users_24h ?? 0} active users`}
                icon={Coins}
              />
              <StatCard
                title="Coins Spent (24h)"
                value={cs?.coins_spent_24h ?? 0}
                description={`${cs?.txns_24h ?? 0} ledger entries`}
                icon={TrendingDown}
              />
              <StatCard
                title="Revenue (24h)"
                value={cs ? `₹${(cs.revenue_paise_24h / 100).toLocaleString("en-IN")}` : "₹0"}
                description={`${cs?.paid_24h ?? 0} paid · ${cs?.pending_intents ?? 0} pending`}
                icon={CreditCard}
              />
              <StatCard
                title="Active Platforms"
                value={cs?.active_platforms ?? 0}
                description={`${cs?.total_platforms ?? 0} total registered`}
                icon={Layers}
              />
            </div>

            {/* Secondary Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* User Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">User Breakdown</CardTitle>
                  <CardDescription>By role and provider</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Regular Users
                      </span>
                      <span className="font-medium">{stats.users.byRole.user}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Moderators
                      </span>
                      <span className="font-medium">{stats.users.byRole.moderator}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        Admins
                      </span>
                      <span className="font-medium">{stats.users.byRole.admin}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-destructive" />
                        Super Admins
                      </span>
                      <span className="font-medium">{stats.users.byRole.super_admin}</span>
                    </div>
                  </div>
                  <div className="border-t pt-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Password Auth</span>
                      <span className="font-medium">{stats.users.byProvider.password}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Google Auth</span>
                      <span className="font-medium">{stats.users.byProvider.google}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent Activity</CardTitle>
                  <CardDescription>Signups and logins</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Signups Today</span>
                      <Badge variant="secondary">{stats.activity.signupsToday}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Signups This Week</span>
                      <Badge variant="secondary">{stats.activity.signupsThisWeek}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Signups This Month</span>
                      <Badge variant="secondary">{stats.activity.signupsThisMonth}</Badge>
                    </div>
                  </div>
                  <div className="border-t pt-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Logins This Week</span>
                      <Badge variant="outline">{stats.activity.loginsThisWeek}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-destructive">Failed Logins Today</span>
                      <Badge variant="destructive">{stats.activity.failedLoginsToday}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* System Health */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">System Health</CardTitle>
                  <CardDescription>
                    Last checked: {stats.system.lastCheck ? new Date(stats.system.lastCheck).toLocaleTimeString() : "N/A"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm">
                      <Activity className="h-4 w-4" />
                      Database
                    </span>
                    <SystemStatusBadge status={stats.system.database} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm">
                      <Activity className="h-4 w-4" />
                      Cache (Redis)
                    </span>
                    <SystemStatusBadge status={stats.system.cache} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm">
                      <Activity className="h-4 w-4" />
                      API Server
                    </span>
                    <SystemStatusBadge status={stats.system.api} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Verification Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-full bg-positive/10">
                      <UserCheck className="h-5 w-5 text-positive" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stats.users.emailVerified}</p>
                      <p className="text-sm text-muted-foreground">Email Verified</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-full bg-destructive/10">
                      <UserX className="h-5 w-5 text-destructive" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stats.users.locked}</p>
                      <p className="text-sm text-muted-foreground">Locked Accounts</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-full bg-primary/10">
                      <Crown className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        {Math.round((stats.users.byTier.premium / stats.users.total) * 100)}%
                      </p>
                      <p className="text-sm text-muted-foreground">Premium Rate</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
}
