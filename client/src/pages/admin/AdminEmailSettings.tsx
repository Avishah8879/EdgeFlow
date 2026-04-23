import { useState } from "react";
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  useNotificationSettings,
  useUpdateNotificationSettings,
  useSendTestNotification,
  useNotificationQueue,
  useNotificationHistory,
  useRetryNotification,
  useCancelNotification,
  useEmailTemplates,
  useNotificationStats,
  type NotificationPreference,
  type NotificationQueueItem,
  type NotificationHistoryItem,
  type EmailTemplate,
} from "@/hooks/use-admin-notifications";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminLayout } from "@/components/admin";
import { useAuth } from "@/hooks/useAuth";
import {
  Mail,
  Settings,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Loader2,
  History,
  FileText,
  Bell,
  Shield,
  Users,
  CreditCard,
  Server,
  Eye,
  Pencil,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Category configuration
const CATEGORY_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  security: { icon: Shield, color: "text-red-500", label: "Security" },
  users: { icon: Users, color: "text-blue-500", label: "Users" },
  system: { icon: Server, color: "text-purple-500", label: "System" },
  billing: { icon: CreditCard, color: "text-green-500", label: "Billing" },
};

// Severity badge
function SeverityBadge({ severity }: { severity: string }) {
  const config: Record<string, string> = {
    info: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    warning: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    critical: "bg-red-500/10 text-red-600 border-red-500/20",
  };

  return (
    <Badge variant="outline" className={cn("capitalize", config[severity] || config.info)}>
      {severity}
    </Badge>
  );
}

// Status badge for queue/history
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: React.ComponentType<{ className?: string }>; className: string }> = {
    pending: { icon: Clock, className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
    sent: { icon: CheckCircle, className: "bg-green-500/10 text-green-600 border-green-500/20" },
    failed: { icon: XCircle, className: "bg-red-500/10 text-red-600 border-red-500/20" },
    cancelled: { icon: AlertCircle, className: "bg-gray-500/10 text-gray-600 border-gray-500/20" },
  };

  const { icon: Icon, className } = config[status] || config.pending;

  return (
    <Badge variant="outline" className={cn("capitalize", className)}>
      <Icon className="h-3 w-3 mr-1" />
      {status}
    </Badge>
  );
}

// Preferences Tab
function PreferencesTab() {
  const { data, isLoading } = useNotificationPreferences();
  const updatePreferences = useUpdateNotificationPreferences();
  const [pendingChanges, setPendingChanges] = useState<Record<number, boolean>>({});

  const handleToggle = (eventTypeId: number, emailEnabled: boolean) => {
    setPendingChanges((prev) => ({ ...prev, [eventTypeId]: emailEnabled }));
  };

  const handleSave = () => {
    const changes = Object.entries(pendingChanges).map(([eventTypeId, emailEnabled]) => ({
      eventTypeId: parseInt(eventTypeId),
      emailEnabled,
    }));

    updatePreferences.mutate(changes, {
      onSuccess: () => {
        toast.success("Preferences saved successfully");
        setPendingChanges({});
      },
      onError: (error: any) => {
        toast.error(error.message);
      },
    });
  };

  // Group preferences by category
  const groupedPreferences: Record<string, NotificationPreference[]> = {};
  data?.preferences?.forEach((pref) => {
    if (!groupedPreferences[pref.category]) {
      groupedPreferences[pref.category] = [];
    }
    groupedPreferences[pref.category].push(pref);
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">
          Choose which events you want to receive email notifications for.
        </p>
        {Object.keys(pendingChanges).length > 0 && (
          <Button onClick={handleSave} disabled={updatePreferences.isPending}>
            {updatePreferences.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        )}
      </div>

      {Object.entries(groupedPreferences).map(([category, prefs]) => {
        const { icon: CategoryIcon, color, label } = CATEGORY_CONFIG[category] || {
          icon: Bell,
          color: "text-gray-500",
          label: category,
        };

        return (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CategoryIcon className={cn("h-5 w-5", color)} />
                {label} Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {prefs.map((pref) => {
                const isEnabled = pendingChanges[pref.eventTypeId] ?? pref.emailEnabled;

                return (
                  <div
                    key={pref.eventTypeId}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{pref.name}</p>
                        <SeverityBadge severity={pref.severity} />
                      </div>
                      {pref.description && (
                        <p className="text-sm text-muted-foreground">{pref.description}</p>
                      )}
                    </div>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={(checked) => handleToggle(pref.eventTypeId, checked)}
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// SMTP Settings Tab (super_admin only)
function SettingsTab() {
  const { user } = useAuth();
  const { data, isLoading, refetch } = useNotificationSettings();
  const updateSettings = useUpdateNotificationSettings();
  const sendTest = useSendTestNotification();
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize form data when settings load
  const initializeForm = () => {
    if (data?.settings) {
      const initial: Record<string, string> = {};
      Object.entries(data.settings).forEach(([key, setting]) => {
        initial[key] = setting.value || "";
      });
      setFormData(initial);
      setHasChanges(false);
    }
  };

  if (user?.role !== "super_admin") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Shield className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Super Admin Access Required</h3>
          <p className="text-muted-foreground">
            Only super admins can modify email server settings.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    updateSettings.mutate(formData, {
      onSuccess: () => {
        toast.success("Settings saved successfully");
        setHasChanges(false);
        refetch();
      },
      onError: (error: any) => {
        toast.error(error.message);
      },
    });
  };

  const handleSendTest = () => {
    sendTest.mutate(undefined, {
      onSuccess: () => {
        toast.success("Test notification queued");
      },
      onError: (error: any) => {
        toast.error(error.message);
      },
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Email Server Settings (SMTP)
          </CardTitle>
          <CardDescription>
            Configure the SMTP server for sending email notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Email Notifications</p>
                <p className="text-sm text-muted-foreground">
                  Master switch for all email notifications
                </p>
              </div>
            </div>
            <Switch
              checked={formData.enabled === "true"}
              onCheckedChange={(checked) => handleChange("enabled", checked ? "true" : "false")}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>SMTP Host</Label>
              <Input
                value={formData.smtp_host || ""}
                onChange={(e) => handleChange("smtp_host", e.target.value)}
                placeholder="smtp.example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>SMTP Port</Label>
              <Input
                value={formData.smtp_port || ""}
                onChange={(e) => handleChange("smtp_port", e.target.value)}
                placeholder="587"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>SMTP Username</Label>
              <Input
                value={formData.smtp_user || ""}
                onChange={(e) => handleChange("smtp_user", e.target.value)}
                placeholder="username"
              />
            </div>
            <div className="space-y-2">
              <Label>SMTP Password</Label>
              <Input
                type="password"
                value={formData.smtp_password || ""}
                onChange={(e) => handleChange("smtp_password", e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>From Email</Label>
              <Input
                value={formData.from_email || ""}
                onChange={(e) => handleChange("from_email", e.target.value)}
                placeholder="noreply@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>From Name</Label>
              <Input
                value={formData.from_name || ""}
                onChange={(e) => handleChange("from_name", e.target.value)}
                placeholder="Equity Pro Notifications"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-4">
            <Button onClick={handleSave} disabled={!hasChanges || updateSettings.isPending}>
              {updateSettings.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Settings
            </Button>
            <Button
              variant="outline"
              onClick={handleSendTest}
              disabled={sendTest.isPending || formData.enabled !== "true"}
            >
              {sendTest.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Send className="h-4 w-4 mr-2" />
              Send Test Email
            </Button>
            <Button variant="ghost" onClick={initializeForm}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Queue Tab
function QueueTab() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data, isLoading, refetch } = useNotificationQueue(
    statusFilter === "all" ? undefined : statusFilter
  );
  const retryNotification = useRetryNotification();
  const cancelNotification = useCancelNotification();

  const handleRetry = (id: number) => {
    retryNotification.mutate(id, {
      onSuccess: () => toast.success("Notification queued for retry"),
      onError: (error: any) => toast.error(error.message),
    });
  };

  const handleCancel = (id: number) => {
    if (confirm("Are you sure you want to cancel this notification?")) {
      cancelNotification.mutate(id, {
        onSuccess: () => toast.success("Notification cancelled"),
        onError: (error: any) => toast.error(error.message),
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        {["pending", "sent", "failed", "cancelled"].map((status) => (
          <Card key={status} className="cursor-pointer" onClick={() => setStatusFilter(status)}>
            <CardContent className="pt-6">
              <StatusBadge status={status} />
              <p className="text-2xl font-bold mt-2">{data?.stats?.[status] || 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !data?.queue?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              No notifications in queue
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.queue.map((item: NotificationQueueItem) => (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-[200px] truncate">{item.subject}</TableCell>
                    <TableCell>{item.recipientEmail}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1 rounded">{item.eventTypeKey}</code>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell>
                      {item.attempts}/{item.maxAttempts}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(item.createdAt), "MMM d, HH:mm")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {item.status === "failed" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRetry(item.id)}
                            disabled={retryNotification.isPending}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                        {item.status === "pending" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCancel(item.id)}
                            disabled={cancelNotification.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// History Tab
function HistoryTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useNotificationHistory(page);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Notification History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !data?.history?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              No notification history
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.history.map((item: NotificationHistoryItem) => (
                    <TableRow key={item.id}>
                      <TableCell className="max-w-[200px] truncate">{item.subject}</TableCell>
                      <TableCell>{item.recipientEmail}</TableCell>
                      <TableCell>{item.eventTypeName}</TableCell>
                      <TableCell>
                        <StatusBadge status={item.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(item.sentAt), "MMM d, yyyy HH:mm")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {data.pagination.total > data.pagination.limit && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {Math.ceil(data.pagination.total / data.pagination.limit)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= Math.ceil(data.pagination.total / data.pagination.limit)}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Templates Tab
function TemplatesTab() {
  const { user } = useAuth();
  const { data, isLoading } = useEmailTemplates();
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Email Templates
          </CardTitle>
          <CardDescription>
            View and customize email notification templates
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!data?.templates?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              No templates found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Subject Template</TableHead>
                  <TableHead>Variables</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.templates.map((template: EmailTemplate) => (
                  <TableRow key={template.id}>
                    <TableCell>{template.eventTypeName}</TableCell>
                    <TableCell className="max-w-[300px] truncate">
                      {template.subjectTemplate}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {template.variables?.slice(0, 3).map((v: string) => (
                          <code key={v} className="text-xs bg-muted px-1 rounded">
                            {`{{${v}}}`}
                          </code>
                        ))}
                        {template.variables?.length > 3 && (
                          <span className="text-xs text-muted-foreground">
                            +{template.variables.length - 3} more
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(template.updatedAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedTemplate(template)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Template Preview Dialog */}
      <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Email Template: {selectedTemplate?.eventTypeName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Subject</Label>
              <p className="font-mono text-sm bg-muted p-2 rounded mt-1">
                {selectedTemplate?.subjectTemplate}
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground">Body</Label>
              <pre className="font-mono text-sm bg-muted p-4 rounded mt-1 whitespace-pre-wrap max-h-[300px] overflow-auto">
                {selectedTemplate?.bodyTextTemplate}
              </pre>
            </div>
            <div>
              <Label className="text-muted-foreground">Available Variables</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {selectedTemplate?.variables?.map((v: string) => (
                  <code key={v} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                    {`{{${v}}}`}
                  </code>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            {user?.role === "super_admin" && (
              <Button variant="outline" disabled>
                <Pencil className="h-4 w-4 mr-2" />
                Edit Template (Coming Soon)
              </Button>
            )}
            <Button onClick={() => setSelectedTemplate(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Main Component
export default function AdminEmailSettings() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Email Notifications</h1>
          <p className="text-muted-foreground">
            Configure email notification preferences and settings
          </p>
        </div>

        <Tabs defaultValue="preferences" className="space-y-6">
          <TabsList>
            <TabsTrigger value="preferences" className="gap-2">
              <Bell className="h-4 w-4" />
              My Preferences
            </TabsTrigger>
            <TabsTrigger value="queue" className="gap-2">
              <Clock className="h-4 w-4" />
              Queue
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <FileText className="h-4 w-4" />
              Templates
            </TabsTrigger>
            {isSuperAdmin && (
              <TabsTrigger value="settings" className="gap-2">
                <Settings className="h-4 w-4" />
                SMTP Settings
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="preferences">
            <PreferencesTab />
          </TabsContent>

          <TabsContent value="queue">
            <QueueTab />
          </TabsContent>

          <TabsContent value="history">
            <HistoryTab />
          </TabsContent>

          <TabsContent value="templates">
            <TemplatesTab />
          </TabsContent>

          {isSuperAdmin && (
            <TabsContent value="settings">
              <SettingsTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AdminLayout>
  );
}
