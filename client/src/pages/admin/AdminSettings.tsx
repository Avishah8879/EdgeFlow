import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminLayout } from "@/components/admin";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import {
  Settings,
  AlertCircle,
  Database,
  Shield,
  Clock,
  Save,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Key,
} from "lucide-react";
import { toast } from "sonner";
import { getAuthBaseUrl } from "@/lib/api-config";

interface ConfigValue {
  value: any;
  description: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface SystemConfig {
  [category: string]: {
    [key: string]: ConfigValue;
  };
}

function useSystemConfig() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery<{ config: SystemConfig }>({
    queryKey: ["admin-config"],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/admin/config`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch config");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 60 * 1000,
  });
}

function useUpdateConfig() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ category, key, value }: { category: string; key: string; value: any }) => {
      const response = await fetch(`${baseUrl}/api/admin/config/${category}/${key}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ value }),
      });

      if (!response.ok) {
        throw new Error("Failed to update config");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-config"] });
      toast.success("Configuration updated successfully");
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });
}

function ConfigCard({
  category,
  items,
  onEdit,
}: {
  category: string;
  items: { [key: string]: ConfigValue };
  onEdit: (key: string, currentValue: any) => void;
}) {
  const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    security: Shield,
    rate_limits: Clock,
    features: Settings,
    database: Database,
  };

  const Icon = categoryIcons[category.toLowerCase()] || Settings;
  const displayName = category.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">{displayName}</CardTitle>
        </div>
        <CardDescription>Manage {displayName.toLowerCase()} settings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(items).map(([key, config]) => (
          <div key={key} className="flex items-center justify-between py-2 border-b last:border-0">
            <div className="flex-1">
              <p className="font-medium text-sm">{key.replace(/_/g, " ")}</p>
              {config.description && (
                <p className="text-xs text-muted-foreground">{config.description}</p>
              )}
            </div>
            <div className="flex items-center gap-4">
              <Badge variant="secondary" className="font-mono text-xs">
                {typeof config.value === "boolean"
                  ? config.value
                    ? "enabled"
                    : "disabled"
                  : String(config.value)}
              </Badge>
              <Button variant="ghost" size="sm" onClick={() => onEdit(key, config.value)}>
                Edit
              </Button>
            </div>
          </div>
        ))}
        {Object.keys(items).length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No settings in this category
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function EditConfigDialog({
  open,
  onClose,
  category,
  configKey,
  currentValue,
  onSave,
  isSaving,
}: {
  open: boolean;
  onClose: () => void;
  category: string;
  configKey: string;
  currentValue: any;
  onSave: (value: any) => void;
  isSaving: boolean;
}) {
  // Auto-detect value type from current value
  const detectValueType = (val: any): "boolean" | "number" | "string" => {
    if (typeof val === "boolean") return "boolean";
    if (typeof val === "number") return "number";
    // Check if string value is "true" or "false" (stored as string but should be boolean)
    if (val === "true" || val === "false" || val === true || val === false) return "boolean";
    // Check if string value is numeric
    if (typeof val === "string" && !isNaN(Number(val)) && val.trim() !== "") return "number";
    return "string";
  };

  const valueType = detectValueType(currentValue);

  const [value, setValue] = useState<string>(() => {
    if (valueType === "boolean") {
      return String(currentValue === true || currentValue === "true");
    }
    return String(currentValue);
  });

  const handleSave = () => {
    let parsedValue: any = value;
    if (valueType === "boolean") {
      parsedValue = value === "true";
    } else if (valueType === "number") {
      parsedValue = Number(value);
    }
    onSave(parsedValue);
  };

  // Get display name for the config key
  const displayKey = configKey.replace(/_/g, " ");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Configuration</DialogTitle>
          <DialogDescription>
            Update <span className="font-medium">{displayKey}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="space-y-2">
            <Label>Value</Label>
            {valueType === "boolean" ? (
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-positive" />
                      Enabled
                    </span>
                  </SelectItem>
                  <SelectItem value="false">
                    <span className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-destructive" />
                      Disabled
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                type={valueType === "number" ? "number" : "text"}
                placeholder="Enter value"
              />
            )}
            {valueType === "number" && (
              <p className="text-xs text-muted-foreground">Enter a numeric value</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SystemHealthCard() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["admin-health"],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/admin/stats`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch health status");
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 30 * 1000,
  });

  const healthItems = [
    { name: "Database", status: data?.system?.database || "unknown" },
    { name: "Cache (Redis)", status: data?.system?.cache || "unknown" },
    { name: "API", status: data?.system?.api || "unknown" },
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircle2 className="h-4 w-4 text-positive" />;
      case "degraded":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case "down":
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">System Health</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <CardDescription>
          Real-time system status
          {data?.system?.lastCheck && (
            <span className="ml-2 text-xs">
              (Last checked: {new Date(data.system.lastCheck).toLocaleTimeString()})
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {healthItems.map((item) => (
              <div key={item.name} className="flex items-center justify-between py-2">
                <span className="text-sm">{item.name}</span>
                <div className="flex items-center gap-2">
                  {getStatusIcon(item.status)}
                  <Badge
                    variant={
                      item.status === "healthy"
                        ? "outline"
                        : item.status === "degraded"
                        ? "secondary"
                        : "destructive"
                    }
                    className={item.status === "healthy" ? "border-positive text-positive" : ""}
                  >
                    {item.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuickActionsCard() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  const [isClearing, setIsClearing] = useState(false);

  const handleClearCache = async () => {
    setIsClearing(true);
    try {
      // This would be a real endpoint in production
      toast.info("Cache clearing is not yet implemented");
    } catch (error) {
      toast.error("Failed to clear cache");
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Quick Actions</CardTitle>
        <CardDescription>Common administrative tasks</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" className="w-full justify-start" onClick={handleClearCache} disabled={isClearing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isClearing ? "animate-spin" : ""}`} />
          Clear Cache
        </Button>
        <Button variant="outline" className="w-full justify-start" disabled>
          <Database className="h-4 w-4 mr-2" />
          Run Database Maintenance
        </Button>
        <Button variant="outline" className="w-full justify-start" disabled>
          <Shield className="h-4 w-4 mr-2" />
          Force Session Cleanup
        </Button>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FyersTokenCard() {
  const authBaseUrl = getAuthBaseUrl();
  const [tokenJson, setTokenJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: statusData, refetch: refetchStatus } = useQuery<{ data: { status: string; expiry: string; generated_at: string } }>({
    queryKey: ["fyers-token-status"],
    queryFn: async () => {
      const res = await fetch(`${authBaseUrl}/api/admin/fyers-token`, { credentials: "include" });
      return res.json();
    },
    refetchInterval: 60000,
  });

  const status = statusData?.data;

  const handleSave = async () => {
    setSaveError(null);
    let parsed: any;
    try {
      parsed = JSON.parse(tokenJson.trim());
    } catch {
      setSaveError("Invalid JSON — paste the full token object");
      return;
    }
    if (!parsed.access_token) {
      setSaveError("JSON must contain an access_token field");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${authBaseUrl}/api/admin/fyers-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(parsed),
      });
      const result = await res.json();
      if (!res.ok) {
        setSaveError(result?.detail || result?.error || "Failed to save token");
      } else {
        setTokenJson("");
        refetchStatus();
        toast.success("Fyers token updated — depth ingester will reload within 60s");
      }
    } catch (e: any) {
      setSaveError(e.message || "Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Key className="h-5 w-5" />
          Fyers TBT Token
        </CardTitle>
        <CardDescription>
          Paste today's Fyers token JSON to update the Order Book depth feed. Tokens expire daily.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current status */}
        {status && (
          <div className="flex items-center gap-3 p-3 rounded-md bg-muted/30 text-sm">
            {status.status === "valid" ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            ) : status.status === "expired" ? (
              <XCircle className="h-4 w-4 text-destructive shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />
            )}
            <div>
              <span className="font-medium capitalize">{status.status}</span>
              {status.expiry && (
                <span className="text-muted-foreground ml-2">
                  Expires: {new Date(status.expiry).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Paste area */}
        <div className="space-y-2">
          <Label>Paste token JSON</Label>
          <Textarea
            placeholder={`{\n  "access_token": "eyJ...",\n  "generated_at": "2026-04-07T...",\n  "expiry": "2026-04-08T..."\n}`}
            value={tokenJson}
            onChange={(e) => { setTokenJson(e.target.value); setSaveError(null); }}
            className="font-mono text-xs min-h-[120px]"
          />
        </div>

        {saveError && (
          <p className="text-sm text-destructive flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" /> {saveError}
          </p>
        )}

        <Button onClick={handleSave} disabled={saving || !tokenJson.trim()} className="w-full sm:w-auto">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {saving ? "Saving..." : "Update Token"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AdminSettings() {
  const { data, isLoading, error, refetch } = useSystemConfig();
  const updateConfig = useUpdateConfig();

  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    category: string;
    key: string;
    value: any;
  }>({
    open: false,
    category: "",
    key: "",
    value: null,
  });

  const handleEdit = (category: string, key: string, currentValue: any) => {
    setEditDialog({
      open: true,
      category,
      key,
      value: currentValue,
    });
  };

  const handleSave = (value: any) => {
    updateConfig.mutate(
      { category: editDialog.category, key: editDialog.key, value },
      {
        onSuccess: () => {
          setEditDialog({ open: false, category: "", key: "", value: null });
        },
      }
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <FyersTokenCard />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Settings</h1>
            <p className="text-muted-foreground mt-1">
              Manage system configuration and settings
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {error && (
          <Card className="border-destructive">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <p className="text-destructive">Failed to load settings: {(error as Error).message}</p>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <LoadingSkeleton />
        ) : (
          <>
            {/* System Health and Quick Actions */}
            <div className="grid gap-6 md:grid-cols-2">
              <SystemHealthCard />
              <QuickActionsCard />
            </div>

            {/* Configuration Categories */}
            {data?.config && Object.keys(data.config).length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2">
                {Object.entries(data.config).map(([category, items]) => (
                  <ConfigCard
                    key={category}
                    category={category}
                    items={items}
                    onEdit={(key, value) => handleEdit(category, key, value)}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Settings className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No Configuration Found</h3>
                  <p className="text-muted-foreground mt-1">
                    System configuration has not been initialized yet.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        <EditConfigDialog
          open={editDialog.open}
          onClose={() => setEditDialog({ open: false, category: "", key: "", value: null })}
          category={editDialog.category}
          configKey={editDialog.key}
          currentValue={editDialog.value}
          onSave={handleSave}
          isSaving={updateConfig.isPending}
        />
      </div>
    </AdminLayout>
  );
}
