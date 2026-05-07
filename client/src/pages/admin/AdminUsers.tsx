import { useState, useCallback } from "react";
import { useAdminGrantCoins } from "@/hooks/use-coin-wallet";
import { Label } from "@/components/ui/label";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AdminLayout,
  AdminPanel,
  AdminAvatar,
  AdminPill,
  AdminNumCell,
  type AdminBadgeTone,
} from "@/components/admin";
import {
  useAdminUsers,
  useUpdateUserRole,
  useUpdateUserTier,
  useUnlockUser,
  useRevokeUserSessions,
  useBulkUpdateTier,
  useBulkRevokeSessions,
  useExportUsers,
  type AdminUser,
  type UsersFilters,
} from "@/hooks/use-admin-users";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/hooks/use-impersonation";
import type { UserRole, UserTier } from "@/lib/auth";
import {
  Search,
  MoreHorizontal,
  Shield,
  Crown,
  Lock,
  Unlock,
  LogOut,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Eye,
  Mail,
  Calendar,
  Globe,
  User as UserIcon,
  Download,
  X,
  Users,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";

const ROLE_TONE: Record<UserRole, AdminBadgeTone> = {
  user: "muted",
  moderator: "navy",
  admin: "gold",
  super_admin: "negative",
};
const ROLE_LABEL: Record<UserRole, string> = {
  user: "User",
  moderator: "Moderator",
  admin: "Admin",
  super_admin: "Super",
};
const TIER_TONE: Record<UserTier, AdminBadgeTone> = {
  free: "muted",
  semi: "navy",
  pro: "gold",
};
const TIER_LABEL: Record<UserTier, string> = { free: "Free", semi: "Semi", pro: "Pro" };

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return d.toLocaleDateString();
}

function GrantCoinsSection({ userId }: { userId: string }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const grant = useAdminGrantCoins();

  const onGrant = async () => {
    const n = parseInt(amount, 10);
    if (!n || n <= 0) return;
    try {
      await grant.mutateAsync({ userId, amount: n, reason: reason.trim() || undefined });
      toast.success(`Granted ${n} coins`);
      setAmount("");
      setReason("");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to grant coins");
    }
  };

  return (
    <div className="pt-4 border-t border-border space-y-3">
      <div className="flex items-center gap-2">
        <Coins className="h-4 w-4 text-[hsl(var(--brand-gold))]" />
        <Label className="text-sm font-semibold">Grant coins</Label>
      </div>
      <div className="flex gap-2">
        <Input
          type="number"
          min={1}
          placeholder="Amount"
          className="w-24 font-mono tabular-nums"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Input
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="flex-1"
        />
        <Button size="sm" onClick={onGrant} disabled={!amount || parseInt(amount) <= 0 || grant.isPending}>
          {grant.isPending ? "…" : "Grant"}
        </Button>
      </div>
    </div>
  );
}

function UserDetailModal({
  user,
  open,
  onClose,
}: {
  user: AdminUser | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!user) return null;
  const displayName = user.name || user.username || user.email;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <AdminAvatar name={displayName} size="lg" />
            <div>
              <p className="font-display text-xl tracking-tight">{displayName}</p>
              <p className="text-xs font-normal text-muted-foreground font-mono">{user.email}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 py-3">
          <div className="flex flex-wrap gap-2">
            <AdminPill tone={ROLE_TONE[user.role]}>{ROLE_LABEL[user.role]}</AdminPill>
            <AdminPill tone={TIER_TONE[user.tier]}>
              {user.tier !== "free" && <Crown className="h-3 w-3" />}
              {TIER_LABEL[user.tier]}
            </AdminPill>
            {user.isLocked ? (
              <AdminPill tone="negative">
                <Lock className="h-3 w-3" />
                Locked
              </AdminPill>
            ) : user.isActive ? (
              <AdminPill tone="positive">Active</AdminPill>
            ) : (
              <AdminPill>Inactive</AdminPill>
            )}
            <AdminPill tone={user.emailVerified ? "positive" : "muted"}>
              {user.emailVerified ? "Email verified" : "Unverified"}
            </AdminPill>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <DetailRow icon={UserIcon} label="Username" value={user.username || "Not set"} />
              <DetailRow icon={Mail} label="Email" value={user.email} mono />
              <DetailRow icon={Globe} label="Auth provider" value={user.provider} />
            </div>
            <div className="space-y-3">
              <DetailRow icon={Calendar} label="Created" value={new Date(user.createdAt).toLocaleString()} mono />
              <DetailRow
                icon={Calendar}
                label="Last login"
                value={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}
                mono
              />
              {user.isLocked && user.lockedUntil && (
                <DetailRow
                  icon={Lock}
                  label="Locked until"
                  value={`${new Date(user.lockedUntil).toLocaleString()} · ${user.failedAttempts} failed attempts`}
                  mono
                  tone="negative"
                />
              )}
            </div>
          </div>

          <GrantCoinsSection userId={user.id} />

          <div className="pt-3 border-t border-border">
            <p className="text-[11px] text-muted-foreground">
              User ID:{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">{user.id}</code>
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  mono,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
  tone?: "negative";
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
          {label}
        </p>
        <p
          className={`text-sm break-words ${mono ? "font-mono tabular-nums" : ""} ${
            tone === "negative" ? "text-negative" : ""
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function UserTableRow({
  user,
  currentUserRole,
  isSelected,
  onSelect,
  onUpdateRole,
  onUpdateTier,
  onUnlock,
  onRevokeSessions,
  onViewDetails,
  onImpersonate,
  canImpersonate,
}: {
  user: AdminUser;
  currentUserRole: UserRole;
  isSelected: boolean;
  onSelect: (userId: string, selected: boolean) => void;
  onUpdateRole: (userId: string, role: UserRole) => void;
  onUpdateTier: (userId: string, tier: UserTier) => void;
  onUnlock: (userId: string) => void;
  onRevokeSessions: (userId: string) => void;
  onViewDetails: (user: AdminUser) => void;
  onImpersonate: (userId: string) => void;
  canImpersonate: boolean;
}) {
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>(user.role);
  const displayName = user.name || user.username || user.email;

  const canEditUser = () => {
    const order: UserRole[] = ["user", "moderator", "admin", "super_admin"];
    return order.indexOf(currentUserRole) > order.indexOf(user.role);
  };

  return (
    <>
      <tr
        className="hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={() => onViewDetails(user)}
      >
        <td className="px-3 py-3 border-b border-border w-10" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={isSelected} onCheckedChange={(checked) => onSelect(user.id, !!checked)} />
        </td>
        <td className="px-3 py-3 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <AdminAvatar name={displayName} />
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{displayName}</p>
              <p className="text-[11.5px] text-muted-foreground font-mono truncate">{user.email}</p>
            </div>
          </div>
        </td>
        <td className="px-3 py-3 border-b border-border">
          <AdminPill tone={ROLE_TONE[user.role]}>{ROLE_LABEL[user.role]}</AdminPill>
        </td>
        <td className="px-3 py-3 border-b border-border">
          <AdminPill tone={TIER_TONE[user.tier]}>
            {user.tier !== "free" && <Crown className="h-3 w-3" />}
            {TIER_LABEL[user.tier]}
          </AdminPill>
        </td>
        <td className="px-3 py-3 border-b border-border">
          {user.isLocked ? (
            <AdminPill tone="negative">
              <Lock className="h-3 w-3" />
              Locked
            </AdminPill>
          ) : user.isActive ? (
            <AdminPill tone="positive" pulse>
              Active
            </AdminPill>
          ) : (
            <AdminPill>Inactive</AdminPill>
          )}
        </td>
        <td className="px-3 py-3 border-b border-border text-right">
          <AdminNumCell tone="muted" className="text-xs">
            {relativeTime(user.lastLoginAt)}
          </AdminNumCell>
        </td>
        <td className="px-3 py-3 border-b border-border w-12" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onViewDetails(user)}>
                <Eye className="h-4 w-4 mr-2" />
                View details
              </DropdownMenuItem>
              {canImpersonate && user.role !== "admin" && user.role !== "super_admin" && (
                <DropdownMenuItem onClick={() => onImpersonate(user.id)} className="text-[hsl(var(--brand-gold))]">
                  <UserCheck className="h-4 w-4 mr-2" />
                  Impersonate user
                </DropdownMenuItem>
              )}
              {canEditUser() && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowRoleDialog(true)}>
                    <Shield className="h-4 w-4 mr-2" />
                    Change role
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onUpdateTier(user.id, user.tier === "free" ? "semi" : "free")}
                  >
                    <Crown className="h-4 w-4 mr-2" />
                    Toggle tier
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {user.isLocked && (
                    <DropdownMenuItem onClick={() => onUnlock(user.id)}>
                      <Unlock className="h-4 w-4 mr-2" />
                      Unlock account
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onRevokeSessions(user.id)} className="text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Revoke sessions
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>

      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change user role</DialogTitle>
            <DialogDescription>Update the role for {displayName}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as UserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="moderator">Moderator</SelectItem>
                {(currentUserRole === "admin" || currentUserRole === "super_admin") && (
                  <SelectItem value="admin">Admin</SelectItem>
                )}
                {currentUserRole === "super_admin" && (
                  <SelectItem value="super_admin">Super admin</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRoleDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onUpdateRole(user.id, selectedRole);
                setShowRoleDialog(false);
              }}
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-7 w-7 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-12" />
        </div>
      ))}
    </div>
  );
}

export default function AdminUsers() {
  const { user } = useAuth();
  const currentUserRole = user?.role || "user";
  const { startImpersonation, canImpersonate } = useImpersonation();

  const [filters, setFilters] = useState<UsersFilters>({
    page: 1,
    limit: 20,
    sortBy: "created_at",
    sortOrder: "desc",
  });
  const [searchInput, setSearchInput] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useAdminUsers(filters);
  const updateRoleMutation = useUpdateUserRole();
  const updateTierMutation = useUpdateUserTier();
  const unlockMutation = useUnlockUser();
  const revokeSessionsMutation = useRevokeUserSessions();
  const bulkUpdateTierMutation = useBulkUpdateTier();
  const bulkRevokeSessionsMutation = useBulkRevokeSessions();
  const exportUsersMutation = useExportUsers();

  const handleSelectUser = useCallback((userId: string, selected: boolean) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(
    (selected: boolean) => {
      if (selected && data?.users) {
        setSelectedUserIds(new Set(data.users.map((u) => u.id)));
      } else {
        setSelectedUserIds(new Set());
      }
    },
    [data?.users],
  );

  const clearSelection = useCallback(() => setSelectedUserIds(new Set()), []);

  const handleBulkTierChange = async (tier: UserTier) => {
    const userIds = Array.from(selectedUserIds);
    if (userIds.length === 0) return;
    if (!confirm(`Update ${userIds.length} users to ${tier} tier?`)) return;
    try {
      await bulkUpdateTierMutation.mutateAsync({ userIds, tier });
      toast.success(`${userIds.length} users updated to ${tier} tier`);
      clearSelection();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update tiers");
    }
  };

  const handleBulkRevokeSessions = async () => {
    const userIds = Array.from(selectedUserIds);
    if (userIds.length === 0) return;
    if (!confirm(`Revoke all sessions for ${userIds.length} users? This will log them out of all devices.`))
      return;
    try {
      const result = await bulkRevokeSessionsMutation.mutateAsync(userIds);
      toast.success(result.message);
      clearSelection();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to revoke sessions");
    }
  };

  const handleExportUsers = async (exportAll = false) => {
    try {
      const userIds = exportAll ? undefined : Array.from(selectedUserIds);
      const blob = await exportUsersMutation.mutateAsync(userIds);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `users-export-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success(exportAll ? "All users exported" : `${selectedUserIds.size} users exported`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to export users");
    }
  };

  const isAllSelected = !!data?.users?.length && data.users.every((u) => selectedUserIds.has(u.id));
  const isSomeSelected = selectedUserIds.size > 0;

  const handleSearch = () => setFilters((prev) => ({ ...prev, search: searchInput, page: 1 }));

  const handleUpdateRole = async (userId: string, role: UserRole) => {
    try {
      await updateRoleMutation.mutateAsync({ userId, role });
      toast.success("User role updated");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update role");
    }
  };

  const handleUpdateTier = async (userId: string, tier: UserTier) => {
    try {
      await updateTierMutation.mutateAsync({ userId, tier });
      toast.success("User tier updated");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update tier");
    }
  };

  const handleUnlock = async (userId: string) => {
    try {
      await unlockMutation.mutateAsync(userId);
      toast.success("Account unlocked");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to unlock account");
    }
  };

  const handleRevokeSessions = async (userId: string) => {
    if (!confirm("This will log the user out of all devices. Continue?")) return;
    try {
      await revokeSessionsMutation.mutateAsync(userId);
      toast.success("All sessions revoked");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to revoke sessions");
    }
  };

  const handleImpersonate = async (userId: string) => {
    if (
      !confirm(
        "This will log you in as this user. You can exit impersonation from the banner at the top of the screen. Continue?",
      )
    )
      return;
    try {
      const success = await startImpersonation(userId);
      if (success) {
        toast.success("Impersonation started. You are now viewing as this user.");
        window.location.href = "/home";
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to start impersonation");
    }
  };

  return (
    <AdminLayout
      eyebrow="Admin · Accounts"
      title="User management"
      description="Manage user accounts, roles, tiers, and access. Bulk actions available via row selection."
      rightSlot={
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleExportUsers(true)}
          disabled={exportUsersMutation.isPending || !data?.users.length}
        >
          {exportUsersMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Export all CSV
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Filters */}
        <AdminPanel title="Filters" description="Narrow the result set; press enter in search to apply.">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
            <div>
              <label className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                Search
              </label>
              <div className="flex gap-2 mt-1">
                <Input
                  placeholder="Email or username…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="h-9"
                />
                <Button onClick={handleSearch} size="sm" variant="outline">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="md:w-40">
              <label className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                Role
              </label>
              <Select
                value={filters.role || "all"}
                onValueChange={(v) =>
                  setFilters((prev) => ({
                    ...prev,
                    role: v === "all" ? undefined : (v as UserRole),
                    page: 1,
                  }))
                }
              >
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="moderator">Moderator</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="super_admin">Super admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:w-40">
              <label className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                Tier
              </label>
              <Select
                value={filters.tier || "all"}
                onValueChange={(v) =>
                  setFilters((prev) => ({
                    ...prev,
                    tier: v === "all" ? undefined : (v as UserTier),
                    page: 1,
                  }))
                }
              >
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue placeholder="All tiers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tiers</SelectItem>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="semi">Semi</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:w-40">
              <label className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                Status
              </label>
              <Select
                value={filters.status || "all"}
                onValueChange={(v) =>
                  setFilters((prev) => ({
                    ...prev,
                    status: v === "all" ? undefined : (v as "active" | "locked" | "inactive"),
                    page: 1,
                  }))
                }
              >
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="locked">Locked</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </AdminPanel>

        {error && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/40 bg-destructive/5 text-destructive">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">Failed to load users: {error.message}</p>
          </div>
        )}

        {/* Bulk action toolbar */}
        {isSomeSelected && (
          <div className="flex items-center justify-between gap-3 flex-wrap p-3 rounded-lg border border-[hsl(var(--brand-gold))]/40 bg-[hsl(var(--brand-gold))]/5">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[hsl(var(--brand-gold))]" />
              <span className="text-sm font-semibold">
                {selectedUserIds.size} user{selectedUserIds.size !== 1 ? "s" : ""} selected
              </span>
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={bulkUpdateTierMutation.isPending}>
                    <Crown className="h-4 w-4 mr-2" />
                    Change tier
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => handleBulkTierChange("pro")}>
                    <Crown className="h-4 w-4 mr-2 text-[hsl(var(--brand-gold))]" />
                    Set to Pro
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBulkTierChange("semi")}>
                    <Crown className="h-4 w-4 mr-2 text-[hsl(var(--brand-navy))]" />
                    Set to Semi
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBulkTierChange("free")}>
                    <Crown className="h-4 w-4 mr-2" />
                    Set to Free
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkRevokeSessions}
                disabled={bulkRevokeSessionsMutation.isPending}
                className="text-destructive hover:text-destructive"
              >
                {bulkRevokeSessionsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4 mr-2" />
                )}
                Revoke sessions
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportUsers(false)}
                disabled={exportUsersMutation.isPending}
              >
                {exportUsersMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Export selected
              </Button>
            </div>
          </div>
        )}

        {/* Users table */}
        <AdminPanel
          title="Users"
          description={`${data?.pagination.total ?? 0} total accounts`}
          flush
        >
          {isLoading ? (
            <LoadingSkeleton />
          ) : data?.users.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No users match your criteria.
            </div>
          ) : (
            <>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="px-3 py-2.5 text-left w-10">
                      <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={(checked) => handleSelectAll(!!checked)}
                      />
                    </th>
                    <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-left">
                      User
                    </th>
                    <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-left">
                      Role
                    </th>
                    <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-left">
                      Tier
                    </th>
                    <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-left">
                      Status
                    </th>
                    <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-right">
                      Last login
                    </th>
                    <th className="px-3 py-2.5 w-12" />
                  </tr>
                </thead>
                <tbody>
                  {data?.users.map((u) => (
                    <UserTableRow
                      key={u.id}
                      user={u}
                      currentUserRole={currentUserRole}
                      isSelected={selectedUserIds.has(u.id)}
                      onSelect={handleSelectUser}
                      onUpdateRole={handleUpdateRole}
                      onUpdateTier={handleUpdateTier}
                      onUnlock={handleUnlock}
                      onRevokeSessions={handleRevokeSessions}
                      onViewDetails={setSelectedUser}
                      onImpersonate={handleImpersonate}
                      canImpersonate={canImpersonate}
                    />
                  ))}
                </tbody>
              </table>

              {data && data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-border">
                  <p className="text-xs text-muted-foreground font-mono">
                    Page {data.pagination.page} of {data.pagination.totalPages} · {data.pagination.total} total
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={data.pagination.page <= 1}
                      onClick={() =>
                        setFilters((prev) => ({ ...prev, page: (prev.page || 1) - 1 }))
                      }
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={data.pagination.page >= data.pagination.totalPages}
                      onClick={() =>
                        setFilters((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))
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
        </AdminPanel>

        <UserDetailModal
          user={selectedUser}
          open={!!selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      </div>
    </AdminLayout>
  );
}
