import { useState, useCallback } from "react";
import { useAdminGrantCoins } from "@/hooks/use-coin-wallet";
import { Label } from "@/components/ui/label";
import { Coins } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { AdminLayout } from "@/components/admin";
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
  CheckCircle2,
  XCircle,
  Download,
  X,
  Users,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";

function RoleBadge({ role }: { role: UserRole }) {
  const config: Record<UserRole, { label: string; className: string }> = {
    user: { label: "User", className: "bg-secondary text-secondary-foreground" },
    moderator: { label: "Moderator", className: "bg-blue-500 text-white" },
    admin: { label: "Admin", className: "bg-primary text-primary-foreground" },
    super_admin: { label: "Super Admin", className: "bg-destructive text-destructive-foreground" },
  };

  const { label, className } = config[role];
  return <Badge className={className}>{label}</Badge>;
}

function TierBadge({ tier }: { tier: UserTier }) {
  if (tier === "pro") return (
    <Badge variant="default" className="bg-amber-500 text-white">
      <Crown className="h-3 w-3 mr-1" /> Pro
    </Badge>
  );
  if (tier === "semi") return (
    <Badge variant="default" className="bg-primary/80 text-white">
      <Crown className="h-3 w-3 mr-1" /> Semi
    </Badge>
  );
  return (
    <Badge variant="secondary">Free</Badge>
  );
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
    <div className="pt-4 border-t space-y-3">
      <div className="flex items-center gap-2">
        <Coins className="h-4 w-4 text-primary" />
        <Label className="text-sm font-medium">Grant coins</Label>
      </div>
      <div className="flex gap-2">
        <Input
          type="number"
          min={1}
          placeholder="Amount"
          className="w-24"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Input
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="flex-1"
        />
        <Button
          size="sm"
          onClick={onGrant}
          disabled={!amount || parseInt(amount) <= 0 || grant.isPending}
        >
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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-medium">
              {(user.name || user.email).charAt(0).toUpperCase()}
            </div>
            <div>
              <p>{user.name || user.username || "N/A"}</p>
              <p className="text-sm font-normal text-muted-foreground">{user.email}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Status Row */}
          <div className="flex flex-wrap gap-2">
            <RoleBadge role={user.role} />
            <TierBadge tier={user.tier} />
            {user.isLocked ? (
              <Badge variant="destructive">
                <Lock className="h-3 w-3 mr-1" />
                Locked
              </Badge>
            ) : user.isActive ? (
              <Badge variant="outline" className="text-positive border-positive">
                Active
              </Badge>
            ) : (
              <Badge variant="secondary">Inactive</Badge>
            )}
            {user.emailVerified ? (
              <Badge variant="outline" className="text-positive border-positive">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Email Verified
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                <XCircle className="h-3 w-3 mr-1" />
                Email Not Verified
              </Badge>
            )}
          </div>

          {/* Details Grid */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <UserIcon className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Username</p>
                  <p className="text-sm text-muted-foreground">{user.username || "Not set"}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Email</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Globe className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Auth Provider</p>
                  <p className="text-sm text-muted-foreground capitalize">{user.provider}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Created</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(user.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Last Login</p>
                  <p className="text-sm text-muted-foreground">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}
                  </p>
                </div>
              </div>

              {user.isLocked && user.lockedUntil && (
                <div className="flex items-start gap-3">
                  <Lock className="h-4 w-4 mt-1 text-destructive" />
                  <div>
                    <p className="text-sm font-medium">Locked Until</p>
                    <p className="text-sm text-destructive">
                      {new Date(user.lockedUntil).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Failed attempts: {user.failedAttempts}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Grant Coins */}
          <GrantCoinsSection userId={user.id} />

          {/* User ID */}
          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              User ID: <code className="bg-muted px-1 py-0.5 rounded">{user.id}</code>
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

function UserRow({
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

  const canEditUser = () => {
    const roleHierarchy: UserRole[] = ["user", "moderator", "admin", "super_admin"];
    const currentLevel = roleHierarchy.indexOf(currentUserRole);
    const targetLevel = roleHierarchy.indexOf(user.role);
    return currentLevel > targetLevel;
  };

  const handleRoleChange = () => {
    onUpdateRole(user.id, selectedRole);
    setShowRoleDialog(false);
  };

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => onViewDetails(user)}>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onSelect(user.id, !!checked)}
          />
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
              {(user.name || user.email).charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-medium">{user.name || user.username || "N/A"}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <RoleBadge role={user.role} />
        </TableCell>
        <TableCell>
          <TierBadge tier={user.tier} />
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            {user.isLocked ? (
              <Badge variant="destructive">
                <Lock className="h-3 w-3 mr-1" />
                Locked
              </Badge>
            ) : user.isActive ? (
              <Badge variant="outline" className="text-positive border-positive">
                Active
              </Badge>
            ) : (
              <Badge variant="secondary">Inactive</Badge>
            )}
          </div>
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {user.lastLoginAt
            ? new Date(user.lastLoginAt).toLocaleDateString()
            : "Never"}
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
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
                View Details
              </DropdownMenuItem>
              {canImpersonate && user.role !== "admin" && user.role !== "super_admin" && (
                <DropdownMenuItem
                  onClick={() => onImpersonate(user.id)}
                  className="text-amber-600"
                >
                  <UserCheck className="h-4 w-4 mr-2" />
                  Impersonate User
                </DropdownMenuItem>
              )}
              {canEditUser() && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowRoleDialog(true)}>
                    <Shield className="h-4 w-4 mr-2" />
                    Change Role
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      onUpdateTier(user.id, user.tier === "free" ? "semi" : "free")
                    }
                  >
                    <Crown className="h-4 w-4 mr-2" />
                    Toggle Tier
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {user.isLocked && (
                    <DropdownMenuItem onClick={() => onUnlock(user.id)}>
                      <Unlock className="h-4 w-4 mr-2" />
                      Unlock Account
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => onRevokeSessions(user.id)}
                    className="text-destructive"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Revoke Sessions
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
            <DialogDescription>
              Update the role for {user.name || user.email}
            </DialogDescription>
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
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRoleDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRoleChange}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

export default function AdminUsers() {
  const { user } = useAuth();
  const currentUserRole = user?.role || "user";
  const { startImpersonation, canImpersonate, isLoading: impersonationLoading } = useImpersonation();

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

  // Selection handlers
  const handleSelectUser = useCallback((userId: string, selected: boolean) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(userId);
      } else {
        next.delete(userId);
      }
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
    [data?.users]
  );

  const clearSelection = useCallback(() => {
    setSelectedUserIds(new Set());
  }, []);

  // Bulk action handlers
  const handleBulkTierChange = async (tier: UserTier) => {
    const userIds = Array.from(selectedUserIds);
    if (userIds.length === 0) return;

    if (!confirm(`Update ${userIds.length} users to ${tier} tier?`)) return;

    try {
      await bulkUpdateTierMutation.mutateAsync({ userIds, tier });
      toast.success(`${userIds.length} users updated to ${tier} tier`);
      clearSelection();
    } catch (error: any) {
      toast.error(error.message || "Failed to update tiers");
    }
  };

  const handleBulkRevokeSessions = async () => {
    const userIds = Array.from(selectedUserIds);
    if (userIds.length === 0) return;

    if (!confirm(`Revoke all sessions for ${userIds.length} users? This will log them out of all devices.`)) return;

    try {
      const result = await bulkRevokeSessionsMutation.mutateAsync(userIds);
      toast.success(result.message);
      clearSelection();
    } catch (error: any) {
      toast.error(error.message || "Failed to revoke sessions");
    }
  };

  const handleExportUsers = async (exportAll: boolean = false) => {
    try {
      const userIds = exportAll ? undefined : Array.from(selectedUserIds);
      const blob = await exportUsersMutation.mutateAsync(userIds);

      // Download the file
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `users-export-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success(exportAll ? "All users exported" : `${selectedUserIds.size} users exported`);
    } catch (error: any) {
      toast.error(error.message || "Failed to export users");
    }
  };

  const isAllSelected = data?.users && data.users.length > 0 && data.users.every((u) => selectedUserIds.has(u.id));
  const isSomeSelected = selectedUserIds.size > 0;

  const handleSearch = () => {
    setFilters((prev) => ({ ...prev, search: searchInput, page: 1 }));
  };

  const handleUpdateRole = async (userId: string, role: UserRole) => {
    try {
      await updateRoleMutation.mutateAsync({ userId, role });
      toast.success("User role updated successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to update role");
    }
  };

  const handleUpdateTier = async (userId: string, tier: UserTier) => {
    try {
      await updateTierMutation.mutateAsync({ userId, tier });
      toast.success("User tier updated successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to update tier");
    }
  };

  const handleUnlock = async (userId: string) => {
    try {
      await unlockMutation.mutateAsync(userId);
      toast.success("Account unlocked successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to unlock account");
    }
  };

  const handleRevokeSessions = async (userId: string) => {
    if (!confirm("This will log the user out of all devices. Continue?")) return;
    try {
      await revokeSessionsMutation.mutateAsync(userId);
      toast.success("All sessions revoked");
    } catch (error: any) {
      toast.error(error.message || "Failed to revoke sessions");
    }
  };

  const handleImpersonate = async (userId: string) => {
    if (!confirm("This will log you in as this user. You can exit impersonation from the banner at the top of the screen. Continue?")) return;
    try {
      const success = await startImpersonation(userId);
      if (success) {
        toast.success("Impersonation started. You are now viewing as this user.");
        // Redirect to home to see the app as the user
        window.location.href = "/home";
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to start impersonation");
    }
  };

  return (
    <AdminLayout
      eyebrow="Admin · Accounts"
      title="User management"
      description="View and manage user accounts, roles, tiers, and access."
    >
      <div className="space-y-6">

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Search</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Search by email or username..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                  <Button onClick={handleSearch}>
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="w-full md:w-40">
                <label className="text-sm font-medium mb-2 block">Role</label>
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
                  <SelectTrigger>
                    <SelectValue placeholder="All roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="moderator">Moderator</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full md:w-40">
                <label className="text-sm font-medium mb-2 block">Tier</label>
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
                  <SelectTrigger>
                    <SelectValue placeholder="All tiers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tiers</SelectItem>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="semi">Semi</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full md:w-40">
                <label className="text-sm font-medium mb-2 block">Status</label>
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
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="locked">Locked</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error State */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <p className="text-destructive">
                Failed to load users: {error.message}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Bulk Actions Toolbar */}
        {isSomeSelected && (
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="py-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">
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
                        Change Tier
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => handleBulkTierChange("pro")}>
                        <Crown className="h-4 w-4 mr-2 text-amber-500" />
                        Set to Pro
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleBulkTierChange("semi")}>
                        <Crown className="h-4 w-4 mr-2 text-primary" />
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
                    Revoke Sessions
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
                    Export Selected
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Users Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Users</CardTitle>
              <CardDescription>
                {data?.pagination.total ?? 0} total users
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExportUsers(true)}
              disabled={exportUsersMutation.isPending || !data?.users.length}
            >
              <Download className="h-4 w-4 mr-2" />
              Export All
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <LoadingSkeleton />
            ) : data?.users.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No users found matching your criteria
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={isAllSelected}
                          onCheckedChange={(checked) => handleSelectAll(!!checked)}
                        />
                      </TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.users.map((u) => (
                      <UserRow
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
                  </TableBody>
                </Table>

                {/* Pagination */}
                {data && data.pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Page {data.pagination.page} of {data.pagination.totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={data.pagination.page <= 1}
                        onClick={() =>
                          setFilters((prev) => ({
                            ...prev,
                            page: (prev.page || 1) - 1,
                          }))
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
                          setFilters((prev) => ({
                            ...prev,
                            page: (prev.page || 1) + 1,
                          }))
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

        {/* User Detail Modal */}
        <UserDetailModal
          user={selectedUser}
          open={!!selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      </div>
    </AdminLayout>
  );
}
