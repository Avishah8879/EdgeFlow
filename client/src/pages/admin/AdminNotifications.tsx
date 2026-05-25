import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  AdminLayout,
  AdminPanel,
  AdminPill,
  AdminNumCell,
  type AdminBadgeTone,
} from "@/components/admin";
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

const typeMeta: Record<
  NotificationType,
  {
    icon: React.ComponentType<{ className?: string }>;
    pillTone: AdminBadgeTone;
    badgeColor: string;
  }
> = {
  info: { icon: Info, pillTone: "navy", badgeColor: "bg-[hsl(var(--brand-navy))]" },
  warning: { icon: AlertTriangle, pillTone: "gold", badgeColor: "bg-[hsl(var(--brand-gold))]" },
  success: { icon: CheckCircle2, pillTone: "positive", badgeColor: "bg-[hsl(var(--positive))]" },
  error: { icon: AlertCircle, pillTone: "negative", badgeColor: "bg-[hsl(var(--negative))]" },
};

function NotificationCard({
  notification,
  onToggle,
  onDelete,
}: {
  notification: Notification;
  onToggle: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const meta = typeMeta[notification.type] || typeMeta.info;
  const Icon = meta.icon;

  return (
    <div
      className={`flex items-start gap-4 p-4 rounded-lg border ${
        notification.isActive ? "border-border bg-card" : "border-border bg-muted/30 opacity-70"
      }`}
    >
      <div className={`p-2 rounded-full ${meta.badgeColor} flex-shrink-0`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-display text-base font-bold tracking-tight truncate">
            {notification.title}
          </h3>
          <AdminPill tone={meta.pillTone}>{notification.type}</AdminPill>
          {!notification.isActive && <AdminPill>Inactive</AdminPill>}
          {notification.isDismissible && <AdminPill tone="muted">Dismissible</AdminPill>}
        </div>
        <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{notification.message}</p>
        <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground">
          <span>
            <span className="text-[10.5px] font-bold uppercase tracking-uppercase mr-1">Target ·</span>
            {notification.targetAudience === "all" || !notification.targetAudience
              ? "All users"
              : notification.targetAudience}
          </span>
          {notification.scheduledEnd && (
            <AdminNumCell tone="muted" className="text-[11px]">
              Expires {new Date(notification.scheduledEnd).toLocaleDateString()}
            </AdminNumCell>
          )}
          <AdminNumCell tone="muted" className="text-[11px]">
            Created {new Date(notification.createdAt).toLocaleDateString()}
          </AdminNumCell>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onToggle(notification.id, !notification.isActive)}
          title={notification.isActive ? "Deactivate" : "Activate"}
        >
          {notification.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
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

      toast.success("Notification created");
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
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          New notification
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create system notification</DialogTitle>
          <DialogDescription>
            Broadcast a banner to a tier, role, or all users.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-[10.5px] font-bold uppercase tracking-uppercase">Title</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Notification title"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10.5px] font-bold uppercase tracking-uppercase">Message</Label>
            <Textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Notification message…"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10.5px] font-bold uppercase tracking-uppercase">Type</Label>
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
            <div className="space-y-1.5">
              <Label className="text-[10.5px] font-bold uppercase tracking-uppercase">Target</Label>
              <Select
                value={form.targetAudience}
                onValueChange={(v) => setForm({ ...form, targetAudience: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  <SelectItem value="basic">Basic tier</SelectItem>
                  <SelectItem value="premium">Premium tier</SelectItem>
                  <SelectItem value="admin">Admins only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10.5px] font-bold uppercase tracking-uppercase">
              Expires at (optional)
            </Label>
            <Input
              type="datetime-local"
              value={form.scheduledEnd}
              onChange={(e) => setForm({ ...form, scheduledEnd: e.target.value })}
              className="font-mono tabular-nums"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="dismissible"
              checked={form.isDismissible}
              onCheckedChange={(checked: boolean) => setForm({ ...form, isDismissible: checked })}
            />
            <Label htmlFor="dismissible" className="text-sm font-normal">
              Allow users to dismiss
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <Skeleton key={i} className="h-[88px] w-full rounded-lg" />
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to delete notification");
      toast.success("Notification deleted");
      refetch();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const list: Notification[] = data?.notifications ?? [];
  const activeCount = list.filter((n) => n.isActive).length;
  const dismissibleCount = list.filter((n) => n.isDismissible).length;

  return (
    <AdminLayout
      eyebrow="Admin · Comms"
      title="System notifications"
      description="Broadcast banners and templates that appear across the platform."
      rightSlot={<CreateNotificationDialog onCreated={() => refetch()} />}
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/40 bg-destructive/5 text-destructive">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">Failed to load notifications: {error.message}</p>
          </div>
        )}

        <AdminPanel
          title="Notifications"
          description={`${list.length} total · ${activeCount} active · ${dismissibleCount} dismissible`}
        >
          {isLoading ? (
            <LoadingState />
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="h-10 w-10 text-muted-foreground mb-3" />
              <h3 className="font-display text-lg font-bold tracking-tight">No notifications</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Create your first system-wide banner.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {list.map((n) => (
                <NotificationCard
                  key={n.id}
                  notification={n}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </AdminPanel>
      </div>
    </AdminLayout>
  );
}
