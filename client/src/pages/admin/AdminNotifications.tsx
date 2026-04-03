import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { AdminLayout } from "@/components/admin";
import { useAdminNotifications } from "@/hooks/use-admin-stats";
import { useAuth } from "@/hooks/useAuth";
import {
  Bell,
  Plus,
  AlertCircle,
  Info,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Edit,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { getAuthBaseUrl } from "@/lib/api-config";

type NotificationType = "info" | "warning" | "success" | "error";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  targetAudience: string | null;
  isActive: boolean;
  isDismissible: boolean;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  createdAt: string;
}

const typeConfig: Record<NotificationType, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  info: { icon: Info, color: "bg-blue-500" },
  warning: { icon: AlertTriangle, color: "bg-yellow-500" },
  success: { icon: CheckCircle2, color: "bg-green-500" },
  error: { icon: AlertCircle, color: "bg-red-500" },
};

function NotificationCard({ notification, onToggle, onDelete }: {
  notification: Notification;
  onToggle: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const { icon: Icon, color } = typeConfig[notification.type] || typeConfig.info;

  return (
    <Card className={!notification.isActive ? "opacity-60" : ""}>
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className={`p-2 rounded-full ${color}`}>
            <Icon className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium truncate">{notification.title}</h3>
              {!notification.isActive && (
                <Badge variant="secondary">Inactive</Badge>
              )}
              {notification.isDismissible && (
                <Badge variant="outline">Dismissible</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {notification.message}
            </p>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span>
                Target: {notification.targetAudience === "all" || !notification.targetAudience ? "All users" : notification.targetAudience}
              </span>
              {notification.scheduledEnd && (
                <span>
                  Expires: {new Date(notification.scheduledEnd).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onToggle(notification.id, !notification.isActive)}
              title={notification.isActive ? "Deactivate" : "Activate"}
            >
              {notification.isActive ? (
                <Eye className="h-4 w-4" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive"
              onClick={() => onDelete(notification.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateNotificationDialog({ onCreated }: { onCreated: () => void }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    message: "",
    type: "info" as NotificationType,
    targetAudience: "all",
    isDismissible: true,
    scheduledEnd: "",
  });

  const handleSubmit = async () => {
    if (!form.title || !form.message) {
      toast.error("Title and message are required");
      return;
    }

    setIsLoading(true);
    try {
      const baseUrl = getAuthBaseUrl();
      const response = await fetch(`${baseUrl}/api/admin/notifications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: form.title,
          message: form.message,
          type: form.type,
          target_audience: form.targetAudience,
          is_dismissible: form.isDismissible,
          scheduled_end: form.scheduledEnd || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create notification");
      }

      toast.success("Notification created successfully");
      setOpen(false);
      setForm({
        title: "",
        message: "",
        type: "info",
        targetAudience: "all",
        isDismissible: true,
        scheduledEnd: "",
      });
      onCreated();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create Notification
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create System Notification</DialogTitle>
          <DialogDescription>
            Send a notification to users of the platform
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Notification title"
            />
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Notification message..."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v as NotificationType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Target</Label>
              <Select
                value={form.targetAudience}
                onValueChange={(v) => setForm({ ...form, targetAudience: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  <SelectItem value="basic">Basic Tier</SelectItem>
                  <SelectItem value="premium">Premium Tier</SelectItem>
                  <SelectItem value="admin">Admins Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Expires At (optional)</Label>
            <Input
              type="datetime-local"
              value={form.scheduledEnd}
              onChange={(e) => setForm({ ...form, scheduledEnd: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="dismissible"
              checked={form.isDismissible}
              onCheckedChange={(checked: boolean) => setForm({ ...form, isDismissible: checked })}
            />
            <Label htmlFor="dismissible">Allow users to dismiss</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <Card key={i}>
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function AdminNotifications() {
  const { token } = useAuth();
  const { data, isLoading, error, refetch } = useAdminNotifications();

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      const baseUrl = getAuthBaseUrl();
      const response = await fetch(`${baseUrl}/api/admin/notifications/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive }),
      });

      if (!response.ok) throw new Error("Failed to update notification");
      toast.success(isActive ? "Notification activated" : "Notification deactivated");
      refetch();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this notification?")) return;

    try {
      const baseUrl = getAuthBaseUrl();
      const response = await fetch(`${baseUrl}/api/admin/notifications/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to delete notification");
      toast.success("Notification deleted");
      refetch();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Notifications</h1>
            <p className="text-muted-foreground mt-1">
              Manage system-wide notifications
            </p>
          </div>
          <CreateNotificationDialog onCreated={() => refetch()} />
        </div>

        {error && (
          <Card className="border-destructive">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <p className="text-destructive">Failed to load notifications: {error.message}</p>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <LoadingSkeleton />
        ) : data?.notifications.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Bell className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No notifications</h3>
              <p className="text-muted-foreground mt-1">
                Create your first system notification
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {data?.notifications.map((notification: Notification) => (
              <NotificationCard
                key={notification.id}
                notification={notification}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
