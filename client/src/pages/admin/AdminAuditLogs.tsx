import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { AdminLayout } from "@/components/admin";
import {
  useAuthLogs,
  useAuditLogs,
  useFailedLoginIpSummary,
  type AuthLogEntry,
  type AuditLogEntry,
} from "@/hooks/use-admin-stats";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  LogIn,
  LogOut,
  UserPlus,
  RefreshCw,
  Lock,
  Download,
  FileText,
  Settings,
  UserCog,
  Bell,
  Shield,
  Search,
  CalendarIcon,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import { getAuthBaseUrl } from "@/lib/api-config";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";

function EventTypeBadge({ eventType, success }: { eventType: string; success: boolean }) {
  const config: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
    login: { icon: LogIn, label: "Login" },
    signup: { icon: UserPlus, label: "Signup" },
    logout: { icon: LogOut, label: "Logout" },
    failed_login: { icon: XCircle, label: "Failed Login" },
    token_refresh: { icon: RefreshCw, label: "Token Refresh" },
    account_locked: { icon: Lock, label: "Account Locked" },
  };

  const { icon: Icon, label } = config[eventType] || { icon: AlertCircle, label: eventType };

  return (
    <Badge
      variant={success ? "outline" : "destructive"}
      className={success ? "border-positive text-positive" : ""}
    >
      <Icon className="h-3 w-3 mr-1" />
      {label}
    </Badge>
  );
}

function AuthLogRow({ log, onClick }: { log: AuthLogEntry; onClick: () => void }) {
  return (
    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={onClick}>
      <TableCell className="font-mono text-xs">
        {new Date(log.createdAt).toLocaleString()}
      </TableCell>
      <TableCell>
        <EventTypeBadge eventType={log.eventType} success={log.success} />
      </TableCell>
      <TableCell>
        <div>
          <p className="text-sm">{log.email || log.username}</p>
          {log.userId && (
            <p className="text-xs text-muted-foreground font-mono">{log.userId.slice(0, 8)}...</p>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{log.provider}</Badge>
      </TableCell>
      <TableCell>
        {log.success ? (
          <CheckCircle2 className="h-4 w-4 text-positive" />
        ) : (
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-destructive" />
            {log.failureReason && (
              <span className="text-xs text-destructive">{log.failureReason}</span>
            )}
          </div>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground font-mono">
        {log.ipAddress || "N/A"}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {log.metadata ? (
          <div className="flex items-center gap-1 flex-wrap">
            {log.metadata.identifier && (
              <span className="font-mono text-xs">{log.metadata.identifier}</span>
            )}
            {log.metadata.failedAttempts !== undefined && (
              <Badge variant="outline" className="text-[10px] px-1 py-0">
                #{log.metadata.failedAttempts}
              </Badge>
            )}
          </div>
        ) : (
          <span>-</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function AuthLogDetailSheet({
  log,
  open,
  onOpenChange,
}: {
  log: AuthLogEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!log) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <EventTypeBadge eventType={log.eventType} success={log.success} />
            <span className="text-sm font-normal text-muted-foreground">#{log.id}</span>
          </SheetTitle>
          <SheetDescription>
            {new Date(log.createdAt).toLocaleString()}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* User Info */}
          <section>
            <h4 className="text-sm font-semibold mb-3">User</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email</span>
                <span className="font-mono">{log.email || "N/A"}</span>
              </div>
              {log.username && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Username</span>
                  <span>{log.username}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">User ID</span>
                <span className="font-mono text-xs">{log.userId || "Unknown user"}</span>
              </div>
            </div>
          </section>

          <Separator />

          {/* Event Details */}
          <section>
            <h4 className="text-sm font-semibold mb-3">Event Details</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Event Type</span>
                <span className="font-mono">{log.eventType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Provider</span>
                <Badge variant="secondary">{log.provider}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className={log.success ? "text-positive font-medium" : "text-destructive font-medium"}>
                  {log.success ? "Success" : "Failed"}
                </span>
              </div>
              {log.failureReason && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Failure Reason</span>
                  <span className="text-destructive text-right max-w-[220px]">
                    {log.failureReason}
                  </span>
                </div>
              )}
            </div>
          </section>

          <Separator />

          {/* Network Info */}
          <section>
            <h4 className="text-sm font-semibold mb-3">Network</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">IP Address</span>
                <span className="font-mono">{log.ipAddress || "N/A"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-1.5">User Agent</span>
                <p className="text-xs bg-muted rounded-md p-2.5 font-mono break-all leading-relaxed">
                  {log.userAgent || "N/A"}
                </p>
              </div>
            </div>
          </section>

          {/* Metadata */}
          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <>
              <Separator />
              <section>
                <h4 className="text-sm font-semibold mb-3">Metadata</h4>
                <div className="space-y-2 text-sm">
                  {log.metadata.identifier && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Identifier Tried</span>
                      <span className="font-mono">{log.metadata.identifier}</span>
                    </div>
                  )}
                  {log.metadata.failedAttempts !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Failed Attempts</span>
                      <Badge variant="destructive">#{log.metadata.failedAttempts}</Badge>
                    </div>
                  )}
                  {Object.entries(log.metadata)
                    .filter(([key]) => !["identifier", "failedAttempts"].includes(key))
                    .map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-muted-foreground">{key}</span>
                        <span className="font-mono text-xs max-w-[220px] text-right break-all">
                          {typeof value === "object" ? JSON.stringify(value) : String(value)}
                        </span>
                      </div>
                    ))}
                </div>
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ActionTypeBadge({ action }: { action: string }) {
  const config: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    update_user_role: { icon: Shield, label: "Role Change", variant: "default" },
    update_user_tier: { icon: UserCog, label: "Tier Change", variant: "secondary" },
    unlock_user: { icon: Lock, label: "Unlock User", variant: "outline" },
    revoke_sessions: { icon: LogOut, label: "Revoke Sessions", variant: "destructive" },
    create_notification: { icon: Bell, label: "Create Notification", variant: "secondary" },
    update_notification: { icon: Bell, label: "Update Notification", variant: "secondary" },
    delete_notification: { icon: Bell, label: "Delete Notification", variant: "destructive" },
    update_config: { icon: Settings, label: "Config Change", variant: "default" },
    emergency_revoke_all: { icon: Shield, label: "Emergency Revoke", variant: "destructive" },
  };

  const { icon: Icon, label, variant } = config[action] || { icon: FileText, label: action, variant: "secondary" as const };

  return (
    <Badge variant={variant}>
      <Icon className="h-3 w-3 mr-1" />
      {label}
    </Badge>
  );
}

function AuditLogRow({ log }: { log: AuditLogEntry }) {
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">
        {new Date(log.createdAt).toLocaleString()}
      </TableCell>
      <TableCell>
        <ActionTypeBadge action={log.action} />
      </TableCell>
      <TableCell>
        <div>
          <p className="text-sm">{log.adminUsername || log.adminEmail}</p>
          {log.adminId && (
            <p className="text-xs text-muted-foreground font-mono">{log.adminId.slice(0, 8)}...</p>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{log.targetType || "system"}</Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
        {log.targetId || "N/A"}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {log.ipAddress || "N/A"}
      </TableCell>
    </TableRow>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(10)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

type DatePreset = "all" | "today" | "7d" | "30d" | "custom";

export default function AdminAuditLogs() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState("auth");
  const [isExporting, setIsExporting] = useState(false);

  // Detail drawer state
  const [selectedLog, setSelectedLog] = useState<AuthLogEntry | null>(null);

  // Date range state
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [customRange, setCustomRange] = useState<DateRange | undefined>();

  // Search state
  const [searchInput, setSearchInput] = useState("");

  const [authFilters, setAuthFilters] = useState<{
    page: number;
    limit: number;
    eventType?: string;
    success?: boolean;
    startDate?: string;
    endDate?: string;
    search?: string;
  }>({
    page: 1,
    limit: 20,
  });

  const [auditFilters, setAuditFilters] = useState<{
    page: number;
    limit: number;
    action?: string;
  }>({
    page: 1,
    limit: 20,
  });

  const authLogsQuery = useAuthLogs(authFilters);
  const auditLogsQuery = useAuditLogs(auditFilters);

  // IP summary - enabled when filtering for failed events
  const showIpSummary = authFilters.success === false || authFilters.eventType === "failed_login";
  const ipSummaryQuery = useFailedLoginIpSummary({
    startDate: authFilters.startDate,
    endDate: authFilters.endDate,
    minAttempts: 1,
    enabled: showIpSummary,
  });

  const suspiciousIps = useMemo(() => {
    if (!ipSummaryQuery.data?.summary) return [];
    return ipSummaryQuery.data.summary.filter(ip => Number(ip.attemptCount) >= 5);
  }, [ipSummaryQuery.data]);

  const handleDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    const now = new Date();
    let startDate: string | undefined;
    let endDate: string | undefined;

    switch (preset) {
      case "today":
        startDate = startOfDay(now).toISOString();
        endDate = endOfDay(now).toISOString();
        break;
      case "7d":
        startDate = startOfDay(subDays(now, 7)).toISOString();
        endDate = endOfDay(now).toISOString();
        break;
      case "30d":
        startDate = startOfDay(subDays(now, 30)).toISOString();
        endDate = endOfDay(now).toISOString();
        break;
      case "custom":
        return;
      case "all":
      default:
        startDate = undefined;
        endDate = undefined;
        break;
    }

    setCustomRange(undefined);
    setAuthFilters(prev => ({ ...prev, startDate, endDate, page: 1 }));
  };

  const handleCustomRange = (range: DateRange | undefined) => {
    setCustomRange(range);
    if (range?.from) {
      setDatePreset("custom");
      setAuthFilters(prev => ({
        ...prev,
        startDate: startOfDay(range.from!).toISOString(),
        endDate: range.to ? endOfDay(range.to).toISOString() : endOfDay(range.from!).toISOString(),
        page: 1,
      }));
    }
  };

  const handleSearch = () => {
    setAuthFilters(prev => ({
      ...prev,
      search: searchInput.trim() || undefined,
      page: 1,
    }));
  };

  const handleExport = async (type: "auth" | "audit") => {
    setIsExporting(true);
    try {
      const baseUrl = getAuthBaseUrl();
      const endpoint = type === "auth" ? "/api/admin/auth-logs/export" : "/api/admin/audit-logs/export";

      const response = await fetch(`${baseUrl}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Export failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}-logs-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(`${type === "auth" ? "Authentication" : "Admin"} logs exported successfully`);
    } catch (error: any) {
      toast.error(error.message || "Failed to export logs");
    } finally {
      setIsExporting(false);
    }
  };

  const dateLabel = datePreset === "custom" && customRange?.from
    ? `${format(customRange.from, "MMM d")}${customRange.to ? ` - ${format(customRange.to, "MMM d")}` : ""}`
    : null;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">Audit Logs</h1>
            <p className="text-muted-foreground mt-1">
              Authentication and security event history
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => handleExport(activeTab as "auth" | "audit")}
            disabled={isExporting}
          >
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? "Exporting..." : "Export CSV"}
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="auth">Authentication Logs</TabsTrigger>
            <TabsTrigger value="admin">Admin Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="auth" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:flex-wrap">
                  {/* Search */}
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-sm font-medium mb-2 block">Search</label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Search by email or username..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                        className="flex-1"
                      />
                      <Button variant="outline" size="icon" onClick={handleSearch}>
                        <Search className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Event Type */}
                  <div className="w-full md:w-44">
                    <label className="text-sm font-medium mb-2 block">Event Type</label>
                    <Select
                      value={authFilters.eventType || "all"}
                      onValueChange={(v) =>
                        setAuthFilters((prev) => ({
                          ...prev,
                          eventType: v === "all" ? undefined : v,
                          page: 1,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All events" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Events</SelectItem>
                        <SelectItem value="login">Login</SelectItem>
                        <SelectItem value="signup">Signup</SelectItem>
                        <SelectItem value="logout">Logout</SelectItem>
                        <SelectItem value="failed_login">Failed Login</SelectItem>
                        <SelectItem value="token_refresh">Token Refresh</SelectItem>
                        <SelectItem value="account_locked">Account Locked</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Status */}
                  <div className="w-full md:w-44">
                    <label className="text-sm font-medium mb-2 block">Status</label>
                    <Select
                      value={authFilters.success === undefined ? "all" : authFilters.success ? "success" : "failed"}
                      onValueChange={(v) =>
                        setAuthFilters((prev) => ({
                          ...prev,
                          success: v === "all" ? undefined : v === "success",
                          page: 1,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="success">Successful</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Date Range */}
                  <div className="w-full md:w-auto">
                    <label className="text-sm font-medium mb-2 block">Date Range</label>
                    <div className="flex gap-1">
                      {(["today", "7d", "30d", "all"] as DatePreset[]).map((preset) => (
                        <Button
                          key={preset}
                          variant={datePreset === preset ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleDatePreset(preset)}
                          className="text-xs"
                        >
                          {preset === "all" ? "All" : preset === "today" ? "Today" : preset}
                        </Button>
                      ))}
                      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant={datePreset === "custom" ? "default" : "outline"}
                            size="sm"
                            className="text-xs"
                          >
                            <CalendarIcon className="h-3 w-3 mr-1" />
                            {dateLabel || "Custom"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                          <Calendar
                            mode="range"
                            selected={customRange}
                            onSelect={(range) => {
                              handleCustomRange(range);
                              if (range?.to) setCalendarOpen(false);
                            }}
                            numberOfMonths={2}
                            disabled={{ after: new Date() }}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* IP Summary - shown when filtering failed logins */}
            {showIpSummary && ipSummaryQuery.data && ipSummaryQuery.data.summary.length > 0 && (
              <Card className={suspiciousIps.length > 0 ? "border-orange-500/50" : ""}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    IP Address Summary
                    {suspiciousIps.length > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {suspiciousIps.length} suspicious
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Failed attempts grouped by source IP
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {ipSummaryQuery.data.summary.slice(0, 9).map((ip) => {
                      const count = Number(ip.attemptCount);
                      const isSuspicious = count >= 5;
                      return (
                        <div
                          key={ip.ipAddress || "unknown"}
                          className={`p-3 rounded-lg border ${
                            isSuspicious
                              ? "border-destructive/50 bg-destructive/5"
                              : "border-border"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-sm">
                              {ip.ipAddress || "Unknown"}
                            </span>
                            <Badge variant={isSuspicious ? "destructive" : "secondary"}>
                              {count} attempt{count !== 1 ? "s" : ""}
                            </Badge>
                          </div>
                          <div className="mt-1.5 text-xs text-muted-foreground space-y-0.5">
                            <p>{ip.uniqueUsers} user(s) targeted</p>
                            {ip.targetEmails?.length > 0 && (
                              <p className="truncate">
                                {ip.targetEmails.slice(0, 2).join(", ")}
                                {ip.targetEmails.length > 2 ? ` +${ip.targetEmails.length - 2} more` : ""}
                              </p>
                            )}
                            <p className="font-mono">
                              {new Date(ip.firstAttempt).toLocaleTimeString()} - {new Date(ip.lastAttempt).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Error State */}
            {authLogsQuery.error && (
              <Card className="border-destructive">
                <CardContent className="flex items-center gap-3 py-4">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <p className="text-destructive">Failed to load logs: {authLogsQuery.error.message}</p>
                </CardContent>
              </Card>
            )}

            {/* Logs Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Authentication Events
                  {authFilters.search && (
                    <Badge variant="secondary" className="font-normal">
                      search: {authFilters.search}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {authLogsQuery.data?.pagination.total ?? 0} total events
                  {showIpSummary && " (click a row for details)"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {authLogsQuery.isLoading ? (
                  <LoadingSkeleton />
                ) : authLogsQuery.data?.logs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No logs found matching your criteria
                  </div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Event</TableHead>
                          <TableHead>User</TableHead>
                          <TableHead>Provider</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>IP Address</TableHead>
                          <TableHead>Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {authLogsQuery.data?.logs.map((log) => (
                          <AuthLogRow
                            key={log.id}
                            log={log}
                            onClick={() => setSelectedLog(log)}
                          />
                        ))}
                      </TableBody>
                    </Table>

                    {/* Pagination */}
                    {authLogsQuery.data && authLogsQuery.data.pagination.totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4">
                        <p className="text-sm text-muted-foreground">
                          Page {authLogsQuery.data.pagination.page} of {authLogsQuery.data.pagination.totalPages}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={authLogsQuery.data.pagination.page <= 1}
                            onClick={() =>
                              setAuthFilters((prev) => ({ ...prev, page: prev.page - 1 }))
                            }
                          >
                            <ChevronLeft className="h-4 w-4" />
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={authLogsQuery.data.pagination.page >= authLogsQuery.data.pagination.totalPages}
                            onClick={() =>
                              setAuthFilters((prev) => ({ ...prev, page: prev.page + 1 }))
                            }
                          >
                            Next
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="admin" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-end">
                  <div className="w-full md:w-48">
                    <label className="text-sm font-medium mb-2 block">Action Type</label>
                    <Select
                      value={auditFilters.action || "all"}
                      onValueChange={(v) =>
                        setAuditFilters((prev) => ({
                          ...prev,
                          action: v === "all" ? undefined : v,
                          page: 1,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All actions" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Actions</SelectItem>
                        <SelectItem value="update_user_role">Role Changes</SelectItem>
                        <SelectItem value="update_user_tier">Tier Changes</SelectItem>
                        <SelectItem value="unlock_user">Unlock User</SelectItem>
                        <SelectItem value="revoke_sessions">Revoke Sessions</SelectItem>
                        <SelectItem value="create_notification">Create Notification</SelectItem>
                        <SelectItem value="update_notification">Update Notification</SelectItem>
                        <SelectItem value="delete_notification">Delete Notification</SelectItem>
                        <SelectItem value="update_config">Config Changes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Error State */}
            {auditLogsQuery.error && (
              <Card className="border-destructive">
                <CardContent className="flex items-center gap-3 py-4">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <p className="text-destructive">Failed to load logs: {auditLogsQuery.error.message}</p>
                </CardContent>
              </Card>
            )}

            {/* Logs Table */}
            <Card>
              <CardHeader>
                <CardTitle>Admin Actions</CardTitle>
                <CardDescription>
                  {auditLogsQuery.data?.pagination.total ?? 0} total actions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {auditLogsQuery.isLoading ? (
                  <LoadingSkeleton />
                ) : auditLogsQuery.data?.logs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No admin actions found matching your criteria
                  </div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Admin</TableHead>
                          <TableHead>Target Type</TableHead>
                          <TableHead>Target ID</TableHead>
                          <TableHead>IP Address</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {auditLogsQuery.data?.logs.map((log) => (
                          <AuditLogRow key={log.id} log={log} />
                        ))}
                      </TableBody>
                    </Table>

                    {/* Pagination */}
                    {auditLogsQuery.data && auditLogsQuery.data.pagination.totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4">
                        <p className="text-sm text-muted-foreground">
                          Page {auditLogsQuery.data.pagination.page} of {auditLogsQuery.data.pagination.totalPages}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={auditLogsQuery.data.pagination.page <= 1}
                            onClick={() =>
                              setAuditFilters((prev) => ({ ...prev, page: prev.page - 1 }))
                            }
                          >
                            <ChevronLeft className="h-4 w-4" />
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={auditLogsQuery.data.pagination.page >= auditLogsQuery.data.pagination.totalPages}
                            onClick={() =>
                              setAuditFilters((prev) => ({ ...prev, page: prev.page + 1 }))
                            }
                          >
                            Next
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Detail Drawer */}
      <AuthLogDetailSheet
        log={selectedLog}
        open={!!selectedLog}
        onOpenChange={(open) => !open && setSelectedLog(null)}
      />
    </AdminLayout>
  );
}
