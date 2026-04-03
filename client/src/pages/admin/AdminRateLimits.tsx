import { useState } from "react";
import {
  useRateLimitConfigs,
  useUpdateRateLimitConfig,
  useCreateRateLimitConfig,
  useDeleteRateLimitConfig,
  useRateLimitOverrides,
  useCreateRateLimitOverride,
  useDeleteRateLimitOverride,
  useRateLimitViolations,
  useRateLimitViolationStats,
  useCleanupRateLimitData,
  formatWindowDuration,
  type RateLimitConfig,
  type RateLimitOverride,
} from "@/hooks/use-rate-limits";
import { AdminLayout } from "@/components/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Shield,
  AlertTriangle,
  Plus,
  Trash2,
  Edit2,
  Clock,
  Hash,
  Users,
  Activity,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

// Skeleton components
function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function CardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-24" />
      </CardContent>
    </Card>
  );
}

// Stat card component
function StatCard({
  title,
  value,
  icon: Icon,
  variant = "default",
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  variant?: "default" | "warning" | "danger";
}) {
  const variantClasses = {
    default: "text-foreground",
    warning: "text-yellow-500",
    danger: "text-red-500",
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${variantClasses[variant]}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${variantClasses[variant]}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

// Edit config dialog
function EditConfigDialog({
  config,
  open,
  onOpenChange,
}: {
  config: RateLimitConfig | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [windowMs, setWindowMs] = useState(config?.windowMs || 900000);
  const [maxRequests, setMaxRequests] = useState(config?.maxRequests || 100);
  const [isActive, setIsActive] = useState(config?.isActive ?? true);
  const updateConfig = useUpdateRateLimitConfig();

  const handleSave = async () => {
    if (!config) return;
    try {
      await updateConfig.mutateAsync({
        id: config.id,
        windowMs,
        maxRequests,
        isActive,
      });
      toast.success("Rate limit updated successfully");
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Rate Limit</DialogTitle>
          <DialogDescription>
            Update rate limit for {config?.endpointKey} ({config?.tier} tier)
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Window (ms)</Label>
            <Select
              value={String(windowMs)}
              onValueChange={(v) => setWindowMs(parseInt(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="60000">1 minute</SelectItem>
                <SelectItem value="300000">5 minutes</SelectItem>
                <SelectItem value="900000">15 minutes</SelectItem>
                <SelectItem value="3600000">1 hour</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Max Requests</Label>
            <Input
              type="number"
              value={maxRequests}
              onChange={(e) => setMaxRequests(parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label>Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateConfig.isPending}>
            {updateConfig.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Create config dialog
function CreateConfigDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [endpointKey, setEndpointKey] = useState("");
  const [tier, setTier] = useState("all");
  const [windowMs, setWindowMs] = useState(900000);
  const [maxRequests, setMaxRequests] = useState(100);
  const [description, setDescription] = useState("");
  const createConfig = useCreateRateLimitConfig();

  const handleCreate = async () => {
    if (!endpointKey) {
      toast.error("Endpoint key is required");
      return;
    }
    try {
      await createConfig.mutateAsync({
        endpointKey,
        tier,
        windowMs,
        maxRequests,
        description: description || undefined,
      });
      toast.success("Rate limit created successfully");
      onOpenChange(false);
      setEndpointKey("");
      setDescription("");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Rate Limit</DialogTitle>
          <DialogDescription>Add a new rate limit configuration</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Endpoint Key</Label>
            <Input
              placeholder="e.g., api_custom"
              value={endpointKey}
              onChange={(e) => setEndpointKey(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Tier</Label>
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="basic">Basic</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Window</Label>
            <Select
              value={String(windowMs)}
              onValueChange={(v) => setWindowMs(parseInt(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="60000">1 minute</SelectItem>
                <SelectItem value="300000">5 minutes</SelectItem>
                <SelectItem value="900000">15 minutes</SelectItem>
                <SelectItem value="3600000">1 hour</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Max Requests</Label>
            <Input
              type="number"
              value={maxRequests}
              onChange={(e) => setMaxRequests(parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              placeholder="Optional description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={createConfig.isPending}>
            {createConfig.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Create override dialog
function CreateOverrideDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [userId, setUserId] = useState("");
  const [endpointKey, setEndpointKey] = useState("");
  const [windowMs, setWindowMs] = useState(900000);
  const [maxRequests, setMaxRequests] = useState(100);
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const createOverride = useCreateRateLimitOverride();

  const handleCreate = async () => {
    if (!userId || !endpointKey) {
      toast.error("User ID and endpoint key are required");
      return;
    }
    try {
      await createOverride.mutateAsync({
        userId,
        endpointKey,
        windowMs,
        maxRequests,
        reason: reason || undefined,
        expiresAt: expiresAt || undefined,
      });
      toast.success("Override created successfully");
      onOpenChange(false);
      setUserId("");
      setEndpointKey("");
      setReason("");
      setExpiresAt("");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create User Override</DialogTitle>
          <DialogDescription>Add a custom rate limit for a specific user</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>User ID</Label>
            <Input
              placeholder="UUID of the user"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Endpoint Key</Label>
            <Input
              placeholder="e.g., api_screener"
              value={endpointKey}
              onChange={(e) => setEndpointKey(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Window</Label>
            <Select
              value={String(windowMs)}
              onValueChange={(v) => setWindowMs(parseInt(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="60000">1 minute</SelectItem>
                <SelectItem value="300000">5 minutes</SelectItem>
                <SelectItem value="900000">15 minutes</SelectItem>
                <SelectItem value="3600000">1 hour</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Max Requests</Label>
            <Input
              type="number"
              value={maxRequests}
              onChange={(e) => setMaxRequests(parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Input
              placeholder="Why this override?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Expires At (optional)</Label>
            <Input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={createOverride.isPending}>
            {createOverride.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Rate Limit Configurations Tab
function ConfigurationsTab() {
  const { data, isLoading, error } = useRateLimitConfigs();
  const [editingConfig, setEditingConfig] = useState<RateLimitConfig | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const deleteConfig = useDeleteRateLimitConfig();

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this rate limit?")) return;
    try {
      await deleteConfig.mutateAsync(id);
      toast.success("Rate limit deleted");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // Group configs by endpoint
  const groupedConfigs = data?.configs.reduce(
    (acc, config) => {
      if (!acc[config.endpointKey]) {
        acc[config.endpointKey] = [];
      }
      acc[config.endpointKey].push(config);
      return acc;
    },
    {} as Record<string, RateLimitConfig[]>
  );

  if (isLoading) return <TableSkeleton rows={8} />;
  if (error) return <div className="text-red-500">Error: {error.message}</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Rate Limit Configurations</h3>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Rate Limit
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Endpoint</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Window</TableHead>
              <TableHead>Max Requests</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(groupedConfigs || {}).map(([endpoint, configs]) =>
              configs.map((config, idx) => (
                <TableRow key={config.id}>
                  {idx === 0 && (
                    <TableCell rowSpan={configs.length} className="font-medium">
                      {endpoint}
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge
                      variant={
                        config.tier === "premium"
                          ? "default"
                          : config.tier === "admin"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {config.tier}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatWindowDuration(config.windowMs)}</TableCell>
                  <TableCell>{config.maxRequests}</TableCell>
                  <TableCell>
                    <Badge variant={config.isActive ? "default" : "outline"}>
                      {config.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {config.description || "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingConfig(config)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(config.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <EditConfigDialog
        config={editingConfig}
        open={!!editingConfig}
        onOpenChange={(open) => !open && setEditingConfig(null)}
      />
      <CreateConfigDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
    </div>
  );
}

// User Overrides Tab
function OverridesTab() {
  const { data, isLoading, error } = useRateLimitOverrides();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const deleteOverride = useDeleteRateLimitOverride();

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this override?")) return;
    try {
      await deleteOverride.mutateAsync(id);
      toast.success("Override deleted");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  if (isLoading) return <TableSkeleton rows={5} />;
  if (error) return <div className="text-red-500">Error: {error.message}</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">User-Specific Overrides</h3>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Override
        </Button>
      </div>

      {data?.overrides.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No user-specific rate limit overrides configured.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Window</TableHead>
                <TableHead>Max Requests</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.overrides.map((override) => (
                <TableRow key={override.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{override.userEmail}</div>
                      {override.userName && (
                        <div className="text-sm text-muted-foreground">
                          {override.userName}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {override.endpointKey}
                  </TableCell>
                  <TableCell>{formatWindowDuration(override.windowMs)}</TableCell>
                  <TableCell>{override.maxRequests}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {override.reason || "-"}
                  </TableCell>
                  <TableCell>
                    {override.expiresAt
                      ? new Date(override.expiresAt).toLocaleDateString()
                      : "Never"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(override.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateOverrideDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
    </div>
  );
}

// Violations Tab
function ViolationsTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useRateLimitViolations({ page, limit: 20 });
  const { data: stats, isLoading: statsLoading } = useRateLimitViolationStats();
  const cleanup = useCleanupRateLimitData();

  const handleCleanup = async () => {
    if (!confirm("This will delete old rate limit data. Continue?")) return;
    try {
      const result = await cleanup.mutateAsync(30);
      toast.success(
        `Cleaned up ${result.usageDeleted} usage records, ${result.violationsDeleted} violations, ${result.expiredOverridesDeleted} expired overrides`
      );
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  if (isLoading || statsLoading)
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <TableSkeleton rows={10} />
      </div>
    );

  if (error) return <div className="text-red-500">Error: {error.message}</div>;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Violations (24h)"
          value={stats?.totalLast24h || 0}
          icon={AlertTriangle}
          variant={stats?.totalLast24h && stats.totalLast24h > 100 ? "danger" : "default"}
        />
        <StatCard
          title="Top Endpoint"
          value={stats?.byEndpoint[0]?.endpointKey || "-"}
          icon={Activity}
        />
        <StatCard
          title="Top IP"
          value={stats?.byIp[0]?.ipAddress || "-"}
          icon={Shield}
        />
        <StatCard
          title="Top User"
          value={stats?.byUser[0]?.userEmail?.split("@")[0] || "-"}
          icon={Users}
        />
      </div>

      {/* Hourly Trend Chart */}
      {stats?.hourlyTrend && stats.hourlyTrend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Violations Over Time (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.hourlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="hour"
                    tickFormatter={(v) => new Date(v).getHours() + ":00"}
                    className="text-xs"
                  />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                    }}
                    labelFormatter={(v) => new Date(v).toLocaleString()}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--destructive))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Violations Table */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Recent Violations</h3>
        <Button variant="outline" onClick={handleCleanup} disabled={cleanup.isPending}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {cleanup.isPending ? "Cleaning..." : "Cleanup Old Data"}
        </Button>
      </div>

      {data?.violations.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No rate limit violations recorded.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Requests</TableHead>
                  <TableHead>Limit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.violations.map((violation) => (
                  <TableRow key={violation.id}>
                    <TableCell className="text-sm">
                      {new Date(violation.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {violation.userEmail || (
                        <span className="text-muted-foreground">Anonymous</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {violation.ipAddress}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {violation.endpointKey}
                    </TableCell>
                    <TableCell className="text-red-500 font-medium">
                      {violation.requestCount}
                    </TableCell>
                    <TableCell>{violation.limitMax}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data?.pagination && data.pagination.totalPages > 1 && (
            <div className="flex justify-center items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {data.pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                disabled={page === data.pagination.totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Main component
export default function AdminRateLimits() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rate Limit Management</h1>
          <p className="text-muted-foreground">
            Configure API rate limits by tier and manage user-specific overrides
          </p>
        </div>

        <Tabs defaultValue="configs" className="space-y-4">
          <TabsList>
            <TabsTrigger value="configs" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Configurations
            </TabsTrigger>
            <TabsTrigger value="overrides" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              User Overrides
            </TabsTrigger>
            <TabsTrigger value="violations" className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Violations
            </TabsTrigger>
          </TabsList>

          <TabsContent value="configs">
            <ConfigurationsTab />
          </TabsContent>

          <TabsContent value="overrides">
            <OverridesTab />
          </TabsContent>

          <TabsContent value="violations">
            <ViolationsTab />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
