import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminLayout, AdminKpiStrip, AdminKpi } from "@/components/admin";
import {
  useAdminStats,
  useSignupAnalytics,
  useLoginAnalytics,
  useRetentionAnalytics,
  useGrowthAnalytics,
  useActiveUsers,
  usePageStats,
  useFeatureUsageStats,
  useSearchStats,
  useUserTimeStats,
} from "@/hooks/use-admin-stats";
import {
  Users,
  TrendingUp,
  UserPlus,
  LogIn,
  AlertCircle,
  Activity,
  UserMinus,
  BarChart3,
  Eye,
  Clock,
  Search,
  Zap,
  Monitor,
  Smartphone,
  Globe,
  Timer,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";

function MetricCard({
  title,
  value,
  subValue,
  icon: Icon,
  trend,
}: {
  title: string;
  value: number;
  subValue?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-1">{value.toLocaleString()}</p>
            {subValue && (
              <p className="text-xs text-muted-foreground mt-1">{subValue}</p>
            )}
          </div>
          <div className={`p-3 rounded-full ${
            trend === "up" ? "bg-positive/10" :
            trend === "down" ? "bg-destructive/10" :
            "bg-muted"
          }`}>
            <Icon className={`h-6 w-6 ${
              trend === "up" ? "text-positive" :
              trend === "down" ? "text-destructive" :
              "text-muted-foreground"
            }`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressBar({ label, value, max, color }: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">{value.toLocaleString()}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function RetentionFunnel({ data }: { data: { day1: number; day7: number; day30: number; day90: number } }) {
  const maxValue = Math.max(data.day90, 1);
  const stages = [
    { label: "90-Day Active", value: data.day90, color: "bg-blue-300" },
    { label: "30-Day Active", value: data.day30, color: "bg-blue-400" },
    { label: "7-Day Active", value: data.day7, color: "bg-blue-500" },
    { label: "Daily Active", value: data.day1, color: "bg-blue-600" },
  ];

  return (
    <div className="space-y-3">
      {stages.map((stage, index) => {
        const width = Math.max((stage.value / maxValue) * 100, 10);
        return (
          <div key={stage.label} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>{stage.label}</span>
              <span className="font-medium">{stage.value.toLocaleString()}</span>
            </div>
            <div
              className={`h-8 ${stage.color} rounded transition-all duration-500 flex items-center justify-center`}
              style={{ width: `${width}%` }}
            >
              {width > 30 && (
                <span className="text-xs text-white font-medium">
                  {Math.round((stage.value / maxValue) * 100)}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function ChartLoadingSkeleton() {
  return (
    <div className="h-64 flex items-center justify-center">
      <Skeleton className="h-full w-full" />
    </div>
  );
}

export default function AdminAnalytics() {
  const [days, setDays] = useState(30);
  const { data: stats, isLoading: statsLoading, error: statsError } = useAdminStats();
  const { data: signupData, isLoading: signupsLoading } = useSignupAnalytics(days);
  const { data: loginData, isLoading: loginsLoading } = useLoginAnalytics(days);
  const { data: retentionData, isLoading: retentionLoading } = useRetentionAnalytics();
  const { data: growthData, isLoading: growthLoading } = useGrowthAnalytics();

  // User activity analytics
  const { data: activeUsers, isLoading: activeUsersLoading } = useActiveUsers(5);
  const { data: pageStats, isLoading: pageStatsLoading } = usePageStats(days);
  const { data: featureUsage, isLoading: featureUsageLoading } = useFeatureUsageStats(days);
  const { data: searchStats, isLoading: searchStatsLoading } = useSearchStats(days);
  const { data: userTimeStats, isLoading: userTimeStatsLoading } = useUserTimeStats(days);

  // Expanded user state for showing detailed top pages
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  // Format date for chart display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  };

  // Format duration
  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "—";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
  };

  // Device icon
  const DeviceIcon = ({ type }: { type: string }) => {
    if (type === "mobile") return <Smartphone className="h-4 w-4" />;
    if (type === "tablet") return <Monitor className="h-4 w-4" />;
    return <Monitor className="h-4 w-4" />;
  };

  return (
    <AdminLayout
      eyebrow="Admin · Insights"
      title="Analytics"
      description="User growth, engagement, and retention metrics."
    >
      <div className="space-y-6">
        <div className="flex items-center justify-end">
          <Select value={String(days)} onValueChange={(v) => setDays(parseInt(v))}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {statsError && (
          <Card className="border-destructive">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <p className="text-destructive">Failed to load analytics: {statsError.message}</p>
            </CardContent>
          </Card>
        )}

        {statsLoading ? (
          <LoadingSkeleton />
        ) : stats ? (
          <>
            {/* Key Metrics */}
            <AdminKpiStrip cols={4}>
              <AdminKpi
                label="Total users"
                value={stats.users.total.toLocaleString()}
              />
              <AdminKpi
                label="New · this week"
                value={stats.activity.signupsThisWeek.toLocaleString()}
                delta={`${stats.activity.signupsToday} today`}
                tone="positive"
              />
              <AdminKpi
                label="Active logins"
                value={stats.activity.loginsThisWeek.toLocaleString()}
                delta={`${stats.activity.loginsToday} today`}
                tone="positive"
              />
              <AdminKpi
                label="Growth · 30d"
                value={`${
                  stats.users.total > 0
                    ? Math.round(
                        (stats.activity.signupsThisMonth / stats.users.total) * 100,
                      )
                    : 0
                }%`}
                delta="of total user base"
                accent="gold"
              />
            </AdminKpiStrip>

            <Tabs defaultValue="signups" className="space-y-4">
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="signups">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Signups
                </TabsTrigger>
                <TabsTrigger value="logins">
                  <Activity className="h-4 w-4 mr-2" />
                  Login Activity
                </TabsTrigger>
                <TabsTrigger value="retention">
                  <UserMinus className="h-4 w-4 mr-2" />
                  Retention
                </TabsTrigger>
                <TabsTrigger value="growth">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Growth
                </TabsTrigger>
                <TabsTrigger value="active-users">
                  <Eye className="h-4 w-4 mr-2" />
                  Live Users
                  {activeUsers && (
                    <Badge variant="secondary" className="ml-2">
                      {activeUsers.totalActive}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="pages">
                  <Globe className="h-4 w-4 mr-2" />
                  Pages
                </TabsTrigger>
                <TabsTrigger value="features">
                  <Zap className="h-4 w-4 mr-2" />
                  Features
                </TabsTrigger>
                <TabsTrigger value="searches">
                  <Search className="h-4 w-4 mr-2" />
                  Searches
                </TabsTrigger>
                <TabsTrigger value="user-time">
                  <Timer className="h-4 w-4 mr-2" />
                  User Time
                </TabsTrigger>
              </TabsList>

              {/* Signups Tab */}
              <TabsContent value="signups" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Daily Signups</CardTitle>
                    <CardDescription>New user registrations over time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {signupsLoading ? (
                      <ChartLoadingSkeleton />
                    ) : signupData?.data ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={signupData.data}>
                          <defs>
                            <linearGradient id="colorSignups" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorPremium" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={formatDate}
                            tick={{ fontSize: 12 }}
                            className="text-muted-foreground"
                          />
                          <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                          <Tooltip
                            labelFormatter={(label) => formatDate(label as string)}
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                            }}
                          />
                          <Legend />
                          <Area
                            type="monotone"
                            dataKey="count"
                            name="Total Signups"
                            stroke="hsl(var(--primary))"
                            fill="url(#colorSignups)"
                            strokeWidth={2}
                          />
                          <Area
                            type="monotone"
                            dataKey="premium"
                            name="Premium"
                            stroke="#f59e0b"
                            fill="url(#colorPremium)"
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">No data available</p>
                    )}
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Signup Sources</CardTitle>
                      <CardDescription>How users are signing up</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ProgressBar
                        label="Password Auth"
                        value={stats.users.byProvider.password}
                        max={stats.users.total}
                        color="bg-blue-500"
                      />
                      <ProgressBar
                        label="Google OAuth"
                        value={stats.users.byProvider.google}
                        max={stats.users.total}
                        color="bg-red-500"
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Tier Distribution</CardTitle>
                      <CardDescription>Free vs Premium breakdown</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ProgressBar
                        label="Basic (Free)"
                        value={stats.users.byTier.basic}
                        max={stats.users.total}
                        color="bg-slate-500"
                      />
                      <ProgressBar
                        label="Premium"
                        value={stats.users.byTier.premium}
                        max={stats.users.total}
                        color="bg-amber-500"
                      />
                      <div className="pt-4 border-t">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Conversion Rate</span>
                          <span className="font-medium">
                            {stats.users.total > 0
                              ? Math.round((stats.users.byTier.premium / stats.users.total) * 100)
                              : 0}%
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Logins Tab */}
              <TabsContent value="logins" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Login Activity</CardTitle>
                    <CardDescription>Successful vs failed login attempts</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {loginsLoading ? (
                      <ChartLoadingSkeleton />
                    ) : loginData?.data ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <ComposedChart data={loginData.data}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={formatDate}
                            tick={{ fontSize: 12 }}
                            className="text-muted-foreground"
                          />
                          <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                          <Tooltip
                            labelFormatter={(label) => formatDate(label as string)}
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                            }}
                          />
                          <Legend />
                          <Bar dataKey="success" name="Successful" fill="hsl(var(--positive))" stackId="a" />
                          <Bar dataKey="failed" name="Failed" fill="hsl(var(--destructive))" stackId="a" />
                          <Line
                            type="monotone"
                            dataKey="uniqueUsers"
                            name="Unique Users"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2}
                            dot={false}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">No data available</p>
                    )}
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <p className="text-3xl font-bold text-positive">
                        {loginData?.data?.reduce((sum, d) => sum + d.success, 0).toLocaleString() || 0}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">Successful Logins</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <p className="text-3xl font-bold text-destructive">
                        {loginData?.data?.reduce((sum, d) => sum + d.failed, 0).toLocaleString() || 0}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">Failed Logins</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <p className="text-3xl font-bold">
                        {loginData?.data && loginData.data.length > 0
                          ? Math.round(
                              loginData.data.reduce((sum, d) => sum + d.uniqueUsers, 0) /
                                loginData.data.length
                            )
                          : 0}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">Avg Daily Active Users</p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Retention Tab */}
              <TabsContent value="retention" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>User Retention Funnel</CardTitle>
                      <CardDescription>Users active within time periods</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {retentionLoading ? (
                        <ChartLoadingSkeleton />
                      ) : retentionData ? (
                        <RetentionFunnel data={retentionData.activeUsers} />
                      ) : (
                        <p className="text-center text-muted-foreground py-8">No data available</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Retention Rates</CardTitle>
                      <CardDescription>Percentage of users returning</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {retentionLoading ? (
                        <ChartLoadingSkeleton />
                      ) : retentionData ? (
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart
                            data={[
                              { name: "1 Day", rate: retentionData.retentionRates.day1 },
                              { name: "7 Days", rate: retentionData.retentionRates.day7 },
                              { name: "30 Days", rate: retentionData.retentionRates.day30 },
                              { name: "90 Days", rate: retentionData.retentionRates.day90 },
                            ]}
                            layout="vertical"
                          >
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
                            <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={80} />
                            <Tooltip
                              formatter={(value) => [`${value}%`, "Retention Rate"]}
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                              }}
                            />
                            <Bar dataKey="rate" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <p className="text-center text-muted-foreground py-8">No data available</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <p className="text-3xl font-bold text-destructive">
                        {retentionData?.churnedUsers.toLocaleString() || 0}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">Churned Users (30+ days)</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <p className="text-3xl font-bold">
                        {retentionData?.newUserRetention.newUsers.toLocaleString() || 0}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">New Users (Last 7 Days)</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <p className="text-3xl font-bold text-positive">
                        {retentionData?.newUserRetention.rate || 0}%
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">New User Retention</p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Growth Tab */}
              <TabsContent value="growth" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Monthly Growth</CardTitle>
                    <CardDescription>Cumulative user growth over 12 months</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {growthLoading ? (
                      <ChartLoadingSkeleton />
                    ) : growthData?.monthly ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <ComposedChart data={growthData.monthly}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis
                            dataKey="month"
                            tickFormatter={formatMonth}
                            tick={{ fontSize: 12 }}
                            className="text-muted-foreground"
                          />
                          <YAxis yAxisId="left" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                          <YAxis
                            yAxisId="right"
                            orientation="right"
                            tick={{ fontSize: 12 }}
                            className="text-muted-foreground"
                          />
                          <Tooltip
                            labelFormatter={(label) => formatMonth(label as string)}
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                            }}
                          />
                          <Legend />
                          <Bar
                            yAxisId="left"
                            dataKey="signups"
                            name="Monthly Signups"
                            fill="hsl(var(--primary))"
                          />
                          <Bar
                            yAxisId="left"
                            dataKey="premium"
                            name="Premium Signups"
                            fill="#f59e0b"
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="cumulative"
                            name="Cumulative Users"
                            stroke="hsl(var(--positive))"
                            strokeWidth={2}
                            dot={false}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">No data available</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Week-over-Week Growth</CardTitle>
                    <CardDescription>Percentage change in signups week over week</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {growthLoading ? (
                      <ChartLoadingSkeleton />
                    ) : growthData?.weeklyGrowth && growthData.weeklyGrowth.length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={growthData.weeklyGrowth}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis
                            dataKey="week"
                            tickFormatter={formatDate}
                            tick={{ fontSize: 12 }}
                            className="text-muted-foreground"
                          />
                          <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                          <Tooltip
                            labelFormatter={(label) => `Week of ${formatDate(label as string)}`}
                            formatter={(value) => [`${value}%`, "Growth"]}
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                            }}
                          />
                          <Bar
                            dataKey="growth"
                            name="Growth %"
                            fill="hsl(var(--primary))"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        Not enough data for week-over-week comparison
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Live Users Tab */}
              <TabsContent value="active-users" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Total Active</p>
                          <p className="text-3xl font-bold mt-1">{activeUsers?.totalActive || 0}</p>
                        </div>
                        <div className="p-3 rounded-full bg-positive/10">
                          <Eye className="h-6 w-6 text-positive" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Logged In Users</p>
                          <p className="text-3xl font-bold mt-1">{activeUsers?.loggedInUsers.length || 0}</p>
                        </div>
                        <div className="p-3 rounded-full bg-primary/10">
                          <Users className="h-6 w-6 text-primary" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Anonymous Sessions</p>
                          <p className="text-3xl font-bold mt-1">{activeUsers?.anonymousSessions.length || 0}</p>
                        </div>
                        <div className="p-3 rounded-full bg-muted">
                          <Globe className="h-6 w-6 text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Currently Active Users</CardTitle>
                    <CardDescription>Users who viewed a page in the last 5 minutes</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {activeUsersLoading ? (
                      <ChartLoadingSkeleton />
                    ) : activeUsers?.loggedInUsers && activeUsers.loggedInUsers.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>Current Page</TableHead>
                            <TableHead>Device</TableHead>
                            <TableHead>Browser</TableHead>
                            <TableHead>Last Activity</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activeUsers.loggedInUsers.map((user) => (
                            <TableRow key={user.userId}>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{user.userName || user.userEmail}</p>
                                  {user.userName && (
                                    <p className="text-xs text-muted-foreground">{user.userEmail}</p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{user.currentPage}</Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <DeviceIcon type={user.deviceType} />
                                  <span className="text-sm capitalize">{user.deviceType}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">{user.browser}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatDistanceToNow(new Date(user.lastActivity), { addSuffix: true })}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        No active logged-in users at the moment
                      </p>
                    )}
                  </CardContent>
                </Card>

                {activeUsers?.anonymousSessions && activeUsers.anonymousSessions.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Anonymous Sessions</CardTitle>
                      <CardDescription>Visitors without logged-in accounts</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Session</TableHead>
                            <TableHead>Current Page</TableHead>
                            <TableHead>Device</TableHead>
                            <TableHead>Browser</TableHead>
                            <TableHead>Last Activity</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activeUsers.anonymousSessions.slice(0, 10).map((session) => (
                            <TableRow key={session.sessionId}>
                              <TableCell>
                                <code className="text-xs">{session.sessionId.substring(0, 16)}...</code>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{session.currentPage}</Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <DeviceIcon type={session.deviceType} />
                                  <span className="text-sm capitalize">{session.deviceType}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">{session.browser}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatDistanceToNow(new Date(session.lastActivity), { addSuffix: true })}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Pages Tab */}
              <TabsContent value="pages" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Page Views Over Time</CardTitle>
                      <CardDescription>Daily page views and unique visitors</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {pageStatsLoading ? (
                        <ChartLoadingSkeleton />
                      ) : pageStats?.overTime && pageStats.overTime.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                          <AreaChart data={pageStats.overTime}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis
                              dataKey="date"
                              tickFormatter={formatDate}
                              tick={{ fontSize: 12 }}
                              className="text-muted-foreground"
                            />
                            <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                            <Tooltip
                              labelFormatter={(label) => formatDate(label as string)}
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                              }}
                            />
                            <Legend />
                            <Area
                              type="monotone"
                              dataKey="pageViews"
                              name="Page Views"
                              stroke="hsl(var(--primary))"
                              fill="hsl(var(--primary))"
                              fillOpacity={0.2}
                            />
                            <Area
                              type="monotone"
                              dataKey="uniqueUsers"
                              name="Unique Users"
                              stroke="hsl(var(--positive))"
                              fill="hsl(var(--positive))"
                              fillOpacity={0.2}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <p className="text-center text-muted-foreground py-8">
                          No page view data available
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Device Breakdown</CardTitle>
                      <CardDescription>Page views by device type</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {pageStatsLoading ? (
                        <ChartLoadingSkeleton />
                      ) : pageStats?.byDevice && pageStats.byDevice.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                          <BarChart data={pageStats.byDevice} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis type="number" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                            <YAxis
                              dataKey="deviceType"
                              type="category"
                              tick={{ fontSize: 12 }}
                              className="text-muted-foreground"
                              width={80}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                              }}
                            />
                            <Bar dataKey="count" name="Views" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <p className="text-center text-muted-foreground py-8">
                          No device data available
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Top Pages</CardTitle>
                    <CardDescription>Most viewed pages with average time spent</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {pageStatsLoading ? (
                      <ChartLoadingSkeleton />
                    ) : pageStats?.byPage && pageStats.byPage.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Page</TableHead>
                            <TableHead className="text-right">Views</TableHead>
                            <TableHead className="text-right">Unique Users</TableHead>
                            <TableHead className="text-right">Avg. Time</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pageStats.byPage.slice(0, 15).map((page) => (
                            <TableRow key={page.pagePath}>
                              <TableCell>
                                <code className="text-sm">{page.pagePath}</code>
                              </TableCell>
                              <TableCell className="text-right font-medium">{page.viewCount}</TableCell>
                              <TableCell className="text-right">{page.uniqueUsers}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Clock className="h-3 w-3 text-muted-foreground" />
                                  {formatDuration(page.avgDurationSeconds)}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        No page data available
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Features Tab */}
              <TabsContent value="features" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Feature Usage Summary</CardTitle>
                    <CardDescription>Usage statistics for main features</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {featureUsageLoading ? (
                      <ChartLoadingSkeleton />
                    ) : featureUsage?.byFeature && featureUsage.byFeature.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Feature</TableHead>
                            <TableHead className="text-right">Total Uses</TableHead>
                            <TableHead className="text-right">Unique Users</TableHead>
                            <TableHead className="text-right">Avg. Execution</TableHead>
                            <TableHead className="text-right">Success Rate</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {featureUsage.byFeature.map((feature) => (
                            <TableRow key={feature.featureType}>
                              <TableCell>
                                <Badge variant="outline" className="capitalize">
                                  {feature.featureType.replace("_", " ")}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-medium">{feature.usageCount}</TableCell>
                              <TableCell className="text-right">{feature.uniqueUsers}</TableCell>
                              <TableCell className="text-right">
                                {feature.avgExecutionMs ? `${Math.round(feature.avgExecutionMs)}ms` : "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                {feature.usageCount > 0 ? (
                                  <span className={feature.successCount / feature.usageCount > 0.9 ? "text-positive" : "text-amber-500"}>
                                    {Math.round((feature.successCount / feature.usageCount) * 100)}%
                                  </span>
                                ) : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        No feature usage data available
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Top Feature Users</CardTitle>
                    <CardDescription>Most active users by feature usage</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {featureUsageLoading ? (
                      <ChartLoadingSkeleton />
                    ) : featureUsage?.topUsers && featureUsage.topUsers.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead className="text-right">Total Uses</TableHead>
                            <TableHead>Features Used</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {featureUsage.topUsers.slice(0, 10).map((user) => (
                            <TableRow key={user.userId}>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{user.userName || user.userEmail}</p>
                                  {user.userName && (
                                    <p className="text-xs text-muted-foreground">{user.userEmail}</p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-medium">{user.usageCount}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {user.featuresUsed.map((f) => (
                                    <Badge key={f} variant="secondary" className="text-xs capitalize">
                                      {f.replace("_", " ")}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        No top users data available
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Searches Tab */}
              <TabsContent value="searches" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Search Trends</CardTitle>
                    <CardDescription>Search activity over time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {searchStatsLoading ? (
                      <ChartLoadingSkeleton />
                    ) : searchStats?.overTime && searchStats.overTime.length > 0 ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <AreaChart data={searchStats.overTime}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={formatDate}
                            tick={{ fontSize: 12 }}
                            className="text-muted-foreground"
                          />
                          <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                          <Tooltip
                            labelFormatter={(label) => formatDate(label as string)}
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                            }}
                          />
                          <Legend />
                          <Area
                            type="monotone"
                            dataKey="searchCount"
                            name="Searches"
                            stroke="hsl(var(--primary))"
                            fill="hsl(var(--primary))"
                            fillOpacity={0.2}
                          />
                          <Area
                            type="monotone"
                            dataKey="uniqueSearchers"
                            name="Unique Searchers"
                            stroke="hsl(var(--positive))"
                            fill="hsl(var(--positive))"
                            fillOpacity={0.2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        No search data available
                      </p>
                    )}
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Top Search Queries</CardTitle>
                      <CardDescription>Most searched terms</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {searchStatsLoading ? (
                        <ChartLoadingSkeleton />
                      ) : searchStats?.topQueries && searchStats.topQueries.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Query</TableHead>
                              <TableHead className="text-right">Count</TableHead>
                              <TableHead className="text-right">Avg. Results</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {searchStats.topQueries.slice(0, 10).map((query, i) => (
                              <TableRow key={i}>
                                <TableCell>
                                  <code className="text-sm">{query.query}</code>
                                </TableCell>
                                <TableCell className="text-right font-medium">{query.searchCount}</TableCell>
                                <TableCell className="text-right">
                                  {query.avgResults ? Math.round(query.avgResults) : "—"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-center text-muted-foreground py-8">
                          No search queries yet
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Most Selected Results</CardTitle>
                      <CardDescription>Top clicked search results</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {searchStatsLoading ? (
                        <ChartLoadingSkeleton />
                      ) : searchStats?.topSelections && searchStats.topSelections.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Result</TableHead>
                              <TableHead className="text-right">Selections</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {searchStats.topSelections.slice(0, 10).map((selection, i) => (
                              <TableRow key={i}>
                                <TableCell>
                                  <Badge variant="secondary">{selection.selectedResult}</Badge>
                                </TableCell>
                                <TableCell className="text-right font-medium">{selection.selectionCount}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-center text-muted-foreground py-8">
                          No search selections yet
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* User Time Tab */}
              <TabsContent value="user-time" className="space-y-4">
                {/* Overview Cards */}
                <div className="grid gap-4 md:grid-cols-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Active Users</p>
                          <p className="text-3xl font-bold mt-1">{userTimeStats?.overview.activeUsers || 0}</p>
                        </div>
                        <div className="p-3 rounded-full bg-primary/10">
                          <Users className="h-6 w-6 text-primary" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Total Platform Time</p>
                          <p className="text-3xl font-bold mt-1">
                            {formatDuration(userTimeStats?.overview.totalPlatformTime || 0)}
                          </p>
                        </div>
                        <div className="p-3 rounded-full bg-positive/10">
                          <Timer className="h-6 w-6 text-positive" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Avg Time Per Page</p>
                          <p className="text-3xl font-bold mt-1">
                            {formatDuration(userTimeStats?.overview.avgPageTime || 0)}
                          </p>
                        </div>
                        <div className="p-3 rounded-full bg-muted">
                          <Clock className="h-6 w-6 text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Total Page Views</p>
                          <p className="text-3xl font-bold mt-1">
                            {userTimeStats?.overview.totalPageViews.toLocaleString() || 0}
                          </p>
                        </div>
                        <div className="p-3 rounded-full bg-muted">
                          <Eye className="h-6 w-6 text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* User Time Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Time Spent Per User</CardTitle>
                    <CardDescription>Detailed breakdown of time spent on the platform by each user</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {userTimeStatsLoading ? (
                      <ChartLoadingSkeleton />
                    ) : userTimeStats?.users && userTimeStats.users.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[40px]"></TableHead>
                            <TableHead>User</TableHead>
                            <TableHead className="text-right">Total Time</TableHead>
                            <TableHead className="text-right">Page Views</TableHead>
                            <TableHead className="text-right">Unique Pages</TableHead>
                            <TableHead className="text-right">Avg Time/Page</TableHead>
                            <TableHead className="text-right">Sessions</TableHead>
                            <TableHead>Last Activity</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {userTimeStats.users.map((user) => (
                            <>
                              <TableRow
                                key={user.userId}
                                className="cursor-pointer hover:bg-muted/50"
                                onClick={() => {
                                  const newSet = new Set(expandedUsers);
                                  if (newSet.has(user.userId)) {
                                    newSet.delete(user.userId);
                                  } else {
                                    newSet.add(user.userId);
                                  }
                                  setExpandedUsers(newSet);
                                }}
                              >
                                <TableCell>
                                  {user.topPages.length > 0 && (
                                    expandedUsers.has(user.userId) ? (
                                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    )
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <p className="font-medium">{user.userName || user.userEmail}</p>
                                    {user.userName && (
                                      <p className="text-xs text-muted-foreground">{user.userEmail}</p>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  <Badge variant="outline" className="font-mono">
                                    {formatDuration(user.totalTimeSeconds)}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">{user.pageViews}</TableCell>
                                <TableCell className="text-right">{user.uniquePages}</TableCell>
                                <TableCell className="text-right">{formatDuration(user.avgTimePerPage)}</TableCell>
                                <TableCell className="text-right">{user.sessions.sessionCount}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {formatDistanceToNow(new Date(user.lastActivity), { addSuffix: true })}
                                </TableCell>
                              </TableRow>
                              {/* Expanded row showing top pages */}
                              {expandedUsers.has(user.userId) && user.topPages.length > 0 && (
                                <TableRow key={`${user.userId}-expanded`} className="bg-muted/30">
                                  <TableCell colSpan={8} className="p-4">
                                    <div className="space-y-2">
                                      <p className="text-sm font-medium text-muted-foreground">Top Pages by Time Spent:</p>
                                      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                                        {user.topPages.map((page, idx) => (
                                          <div
                                            key={`${user.userId}-page-${idx}`}
                                            className="flex items-center justify-between p-2 rounded bg-background border"
                                          >
                                            <code className="text-xs truncate max-w-[200px]">{page.pagePath}</code>
                                            <div className="flex items-center gap-2 text-sm">
                                              <span className="text-muted-foreground">{page.viewCount}×</span>
                                              <Badge variant="secondary" className="font-mono text-xs">
                                                {formatDuration(page.totalTime)}
                                              </Badge>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                      {user.sessions.avgSessionDuration > 0 && (
                                        <p className="text-xs text-muted-foreground mt-2">
                                          Avg session: {formatDuration(user.sessions.avgSessionDuration)} •
                                          Max session: {formatDuration(user.sessions.maxSessionDuration)}
                                        </p>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        No user time data available
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Account Health - Always visible */}
            <Card>
              <CardHeader>
                <CardTitle>Account Health</CardTitle>
                <CardDescription>Verification and security status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="text-center p-4 rounded-lg bg-positive/10">
                    <p className="text-3xl font-bold text-positive">{stats.users.emailVerified}</p>
                    <p className="text-sm text-muted-foreground mt-1">Email Verified</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted">
                    <p className="text-3xl font-bold">{stats.users.active}</p>
                    <p className="text-sm text-muted-foreground mt-1">Active Accounts</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-destructive/10">
                    <p className="text-3xl font-bold text-destructive">{stats.users.locked}</p>
                    <p className="text-sm text-muted-foreground mt-1">Locked Accounts</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-amber-500/10">
                    <p className="text-3xl font-bold text-amber-500">
                      {stats.activity.failedLoginsToday}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">Failed Logins Today</p>
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
