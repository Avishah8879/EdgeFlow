import { useState } from "react";
import {
  useFeatureFlags,
  useFeatureFlagCategories,
  useCreateFeatureFlag,
  useUpdateFeatureFlag,
  useToggleFeatureFlag,
  useDeleteFeatureFlag,
  useFeatureFlagOverrides,
  useCreateFlagOverride,
  useDeleteFlagOverride,
  useFeatureFlagAudit,
  type FeatureFlag,
  type FeatureFlagOverride,
  type FlagAuditEntry,
} from "@/hooks/use-feature-flags";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Flag,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Users,
  History,
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Target,
  Percent,
  Calendar,
  Search,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// Category colors
const CATEGORY_COLORS: Record<string, string> = {
  ui: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  features: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  limits: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  experimental: "bg-pink-500/10 text-pink-600 border-pink-500/20",
  general: "bg-gray-500/10 text-gray-600 border-gray-500/20",
};

// Tier options
const TIER_OPTIONS = ["basic", "premium"];
const ROLE_OPTIONS = ["user", "moderator", "admin", "super_admin"];

function CategoryBadge({ category }: { category: string }) {
  return (
    <Badge variant="outline" className={cn("capitalize", CATEGORY_COLORS[category] || CATEGORY_COLORS.general)}>
      {category}
    </Badge>
  );
}

function FlagStatusBadge({ flag }: { flag: FeatureFlag }) {
  const now = new Date();
  const startsAt = flag.startsAt ? new Date(flag.startsAt) : null;
  const expiresAt = flag.expiresAt ? new Date(flag.expiresAt) : null;

  if (!flag.isEnabled) {
    return (
      <Badge variant="outline" className="bg-gray-500/10 text-gray-600 border-gray-500/20">
        <XCircle className="h-3 w-3 mr-1" />
        Disabled
      </Badge>
    );
  }

  if (startsAt && now < startsAt) {
    return (
      <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
        <Clock className="h-3 w-3 mr-1" />
        Scheduled
      </Badge>
    );
  }

  if (expiresAt && now > expiresAt) {
    return (
      <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Expired
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
      <CheckCircle className="h-3 w-3 mr-1" />
      Active
    </Badge>
  );
}

// Create/Edit Flag Dialog
function FlagDialog({
  open,
  onOpenChange,
  flag,
  onSave,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flag: FeatureFlag | null;
  onSave: (data: any) => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    key: flag?.key || "",
    name: flag?.name || "",
    description: flag?.description || "",
    isEnabled: flag?.isEnabled ?? false,
    targetTiers: flag?.targetTiers || [],
    targetRoles: flag?.targetRoles || [],
    rolloutPercentage: flag?.rolloutPercentage ?? 100,
    startsAt: flag?.startsAt ? flag.startsAt.split("T")[0] : "",
    expiresAt: flag?.expiresAt ? flag.expiresAt.split("T")[0] : "",
    category: flag?.category || "general",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData: any = {
      ...formData,
      startsAt: formData.startsAt || null,
      expiresAt: formData.expiresAt || null,
      targetTiers: formData.targetTiers.length > 0 ? formData.targetTiers : null,
      targetRoles: formData.targetRoles.length > 0 ? formData.targetRoles : null,
    };
    if (flag) {
      submitData.id = flag.id;
    }
    onSave(submitData);
  };

  const toggleTier = (tier: string) => {
    setFormData((prev) => ({
      ...prev,
      targetTiers: prev.targetTiers.includes(tier)
        ? prev.targetTiers.filter((t) => t !== tier)
        : [...prev.targetTiers, tier],
    }));
  };

  const toggleRole = (role: string) => {
    setFormData((prev) => ({
      ...prev,
      targetRoles: prev.targetRoles.includes(role)
        ? prev.targetRoles.filter((r) => r !== role)
        : [...prev.targetRoles, role],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{flag ? "Edit Feature Flag" : "Create Feature Flag"}</DialogTitle>
          <DialogDescription>
            {flag
              ? "Update the feature flag configuration."
              : "Create a new feature flag with targeting rules."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="key">Key (unique identifier)</Label>
              <Input
                id="key"
                value={formData.key}
                onChange={(e) => setFormData((prev) => ({ ...prev, key: e.target.value }))}
                placeholder="feature_key"
                disabled={!!flag}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Display Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Feature Name"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Describe what this feature flag controls..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, category: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ui">UI</SelectItem>
                  <SelectItem value="features">Features</SelectItem>
                  <SelectItem value="limits">Limits</SelectItem>
                  <SelectItem value="experimental">Experimental</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Enabled</Label>
              <div className="flex items-center space-x-2 pt-2">
                <Switch
                  checked={formData.isEnabled}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, isEnabled: checked }))
                  }
                />
                <span className="text-sm text-muted-foreground">
                  {formData.isEnabled ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <Label className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Targeting
            </Label>
            <div className="grid grid-cols-2 gap-4 pl-6">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Target Tiers (empty = all)</Label>
                <div className="flex flex-wrap gap-2">
                  {TIER_OPTIONS.map((tier) => (
                    <Badge
                      key={tier}
                      variant={formData.targetTiers.includes(tier) ? "default" : "outline"}
                      className="cursor-pointer capitalize"
                      onClick={() => toggleTier(tier)}
                    >
                      {tier}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Target Roles (empty = all)</Label>
                <div className="flex flex-wrap gap-2">
                  {ROLE_OPTIONS.map((role) => (
                    <Badge
                      key={role}
                      variant={formData.targetRoles.includes(role) ? "default" : "outline"}
                      className="cursor-pointer capitalize"
                      onClick={() => toggleRole(role)}
                    >
                      {role.replace("_", " ")}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <Label className="flex items-center gap-2">
              <Percent className="h-4 w-4" />
              Rollout Percentage: {formData.rolloutPercentage}%
            </Label>
            <Slider
              value={[formData.rolloutPercentage]}
              onValueChange={([value]) =>
                setFormData((prev) => ({ ...prev, rolloutPercentage: value }))
              }
              max={100}
              step={5}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Percentage of eligible users who will see this feature (deterministic per user).
            </p>
          </div>

          <div className="space-y-4">
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Time-based Targeting
            </Label>
            <div className="grid grid-cols-2 gap-4 pl-6">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Starts At (optional)</Label>
                <Input
                  type="date"
                  value={formData.startsAt}
                  onChange={(e) => setFormData((prev) => ({ ...prev, startsAt: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Expires At (optional)</Label>
                <Input
                  type="date"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData((prev) => ({ ...prev, expiresAt: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {flag ? "Update Flag" : "Create Flag"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Override Dialog
function OverrideDialog({
  open,
  onOpenChange,
  flagId,
  onSave,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flagId: number;
  onSave: (data: any) => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    userId: "",
    isEnabled: true,
    reason: "",
    expiresAt: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      flagId,
      userId: formData.userId,
      isEnabled: formData.isEnabled,
      reason: formData.reason || undefined,
      expiresAt: formData.expiresAt || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add User Override</DialogTitle>
          <DialogDescription>
            Override the feature flag setting for a specific user.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="userId">User ID</Label>
            <Input
              id="userId"
              value={formData.userId}
              onChange={(e) => setFormData((prev) => ({ ...prev, userId: e.target.value }))}
              placeholder="UUID of the user"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Override Value</Label>
            <div className="flex items-center space-x-2">
              <Switch
                checked={formData.isEnabled}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, isEnabled: checked }))
                }
              />
              <span className="text-sm">
                {formData.isEnabled ? "Feature enabled for this user" : "Feature disabled for this user"}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Input
              id="reason"
              value={formData.reason}
              onChange={(e) => setFormData((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="Why is this override needed?"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expiresAt">Expires At (optional)</Label>
            <Input
              type="date"
              id="expiresAt"
              value={formData.expiresAt}
              onChange={(e) => setFormData((prev) => ({ ...prev, expiresAt: e.target.value }))}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Override
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Overrides Panel
function OverridesPanel({
  flagId,
  onClose,
}: {
  flagId: number;
  onClose: () => void;
}) {
  const { data, isLoading } = useFeatureFlagOverrides(flagId);
  const deleteOverride = useDeleteFlagOverride();
  const createOverride = useCreateFlagOverride();
  const [showAddDialog, setShowAddDialog] = useState(false);

  const handleDelete = (overrideId: number) => {
    if (confirm("Are you sure you want to delete this override?")) {
      deleteOverride.mutate({ overrideId, flagId });
    }
  };

  const handleCreate = (data: any) => {
    createOverride.mutate(data, {
      onSuccess: () => setShowAddDialog(false),
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">User Overrides</CardTitle>
          <CardDescription>Manage per-user feature flag overrides</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Override
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data?.overrides?.length ? (
          <p className="text-center text-muted-foreground py-8">No overrides configured</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Override</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.overrides.map((override: FeatureFlagOverride) => (
                <TableRow key={override.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{override.userEmail}</p>
                      {override.userName && (
                        <p className="text-xs text-muted-foreground">{override.userName}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={override.isEnabled ? "default" : "secondary"}>
                      {override.isEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {override.reason || "-"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {override.expiresAt
                      ? format(new Date(override.expiresAt), "MMM d, yyyy")
                      : "Never"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {override.createdByEmail}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(override.id)}
                      disabled={deleteOverride.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <OverrideDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        flagId={flagId}
        onSave={handleCreate}
        isLoading={createOverride.isPending}
      />
    </Card>
  );
}

// Audit Log Panel
function AuditLogPanel({
  flagId,
  onClose,
}: {
  flagId: number;
  onClose: () => void;
}) {
  const { data, isLoading } = useFeatureFlagAudit(flagId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Audit Log</CardTitle>
          <CardDescription>History of changes to this feature flag</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data?.audit?.length ? (
          <p className="text-center text-muted-foreground py-8">No audit entries</p>
        ) : (
          <div className="space-y-4">
            {data.audit.map((entry: FlagAuditEntry) => (
              <div key={entry.id} className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="capitalize">
                    {entry.action.replace("_", " ")}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {format(new Date(entry.createdAt), "MMM d, yyyy HH:mm")}
                  </span>
                </div>
                <p className="text-sm">
                  By: <span className="font-medium">{entry.adminEmail}</span>
                  {entry.ipAddress && (
                    <span className="text-muted-foreground"> from {entry.ipAddress}</span>
                  )}
                </p>
                {entry.oldValue && entry.newValue && (
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <p className="font-medium text-muted-foreground mb-1">Before:</p>
                      <pre className="bg-muted p-2 rounded overflow-x-auto">
                        {JSON.stringify(entry.oldValue, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <p className="font-medium text-muted-foreground mb-1">After:</p>
                      <pre className="bg-muted p-2 rounded overflow-x-auto">
                        {JSON.stringify(entry.newValue, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Main Feature Flag Row
function FlagRow({
  flag,
  onEdit,
  onToggle,
  onDelete,
  onViewOverrides,
  onViewAudit,
  isToggling,
}: {
  flag: FeatureFlag;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onViewOverrides: () => void;
  onViewAudit: () => void;
  isToggling: boolean;
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <Switch
            checked={flag.isEnabled}
            onCheckedChange={onToggle}
            disabled={isToggling}
          />
        </div>
      </TableCell>
      <TableCell>
        <div>
          <p className="font-medium">{flag.name}</p>
          <code className="text-xs text-muted-foreground bg-muted px-1 rounded">
            {flag.key}
          </code>
        </div>
      </TableCell>
      <TableCell className="max-w-[200px]">
        <p className="text-sm text-muted-foreground truncate">{flag.description || "-"}</p>
      </TableCell>
      <TableCell>
        <CategoryBadge category={flag.category} />
      </TableCell>
      <TableCell>
        <FlagStatusBadge flag={flag} />
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {flag.targetTiers ? (
            flag.targetTiers.map((tier) => (
              <Badge key={tier} variant="secondary" className="text-xs capitalize">
                {tier}
              </Badge>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">All</span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="text-sm">{flag.rolloutPercentage}%</span>
          <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary"
              style={{ width: `${flag.rolloutPercentage}%` }}
            />
          </div>
        </div>
      </TableCell>
      <TableCell>
        {flag.overridesCount ? (
          <Badge variant="secondary">{flag.overridesCount}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onViewOverrides}>
              <Users className="h-4 w-4 mr-2" />
              Manage Overrides
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onViewAudit}>
              <History className="h-4 w-4 mr-2" />
              View Audit Log
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

// Main Component
export default function AdminFeatureFlags() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFlagDialog, setShowFlagDialog] = useState(false);
  const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null);
  const [viewingOverridesFor, setViewingOverridesFor] = useState<number | null>(null);
  const [viewingAuditFor, setViewingAuditFor] = useState<number | null>(null);
  const [togglingFlagId, setTogglingFlagId] = useState<number | null>(null);

  const { data: flagsData, isLoading: flagsLoading } = useFeatureFlags(
    selectedCategory === "all" ? undefined : selectedCategory
  );
  const { data: categoriesData } = useFeatureFlagCategories();

  const createFlag = useCreateFeatureFlag();
  const updateFlag = useUpdateFeatureFlag();
  const toggleFlag = useToggleFeatureFlag();
  const deleteFlag = useDeleteFeatureFlag();

  // Filter flags by search query
  const filteredFlags = flagsData?.flags?.filter((flag: FeatureFlag) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      flag.key.toLowerCase().includes(query) ||
      flag.name.toLowerCase().includes(query) ||
      (flag.description?.toLowerCase().includes(query) ?? false)
    );
  });

  const handleSaveFlag = (data: any) => {
    if (data.id) {
      updateFlag.mutate(data, {
        onSuccess: () => {
          setShowFlagDialog(false);
          setEditingFlag(null);
        },
      });
    } else {
      createFlag.mutate(data, {
        onSuccess: () => {
          setShowFlagDialog(false);
        },
      });
    }
  };

  const handleToggle = (flagId: number) => {
    setTogglingFlagId(flagId);
    toggleFlag.mutate(flagId, {
      onSettled: () => setTogglingFlagId(null),
    });
  };

  const handleDelete = (flag: FeatureFlag) => {
    if (confirm(`Are you sure you want to delete "${flag.name}"? This action cannot be undone.`)) {
      deleteFlag.mutate(flag.id);
    }
  };

  const handleEdit = (flag: FeatureFlag) => {
    setEditingFlag(flag);
    setShowFlagDialog(true);
  };

  const handleCreate = () => {
    setEditingFlag(null);
    setShowFlagDialog(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Feature Flags</h1>
          <p className="text-muted-foreground">
            Control feature availability with targeting and gradual rollouts
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Create Flag
        </Button>
      </div>

      {/* Category Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card
          className={cn(
            "cursor-pointer transition-colors",
            selectedCategory === "all" && "border-primary"
          )}
          onClick={() => setSelectedCategory("all")}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Flag className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-semibold">
                  {flagsData?.flags?.length || 0}
                </p>
                <p className="text-sm text-muted-foreground">All Flags</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {categoriesData?.categories?.map((cat) => (
          <Card
            key={cat.name}
            className={cn(
              "cursor-pointer transition-colors",
              selectedCategory === cat.name && "border-primary"
            )}
            onClick={() => setSelectedCategory(cat.name)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CategoryBadge category={cat.name} />
                <p className="text-2xl font-semibold">{cat.count}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Override/Audit Panel */}
      {viewingOverridesFor && (
        <OverridesPanel
          flagId={viewingOverridesFor}
          onClose={() => setViewingOverridesFor(null)}
        />
      )}

      {viewingAuditFor && (
        <AuditLogPanel
          flagId={viewingAuditFor}
          onClose={() => setViewingAuditFor(null)}
        />
      )}

      {/* Flags Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Feature Flags</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search flags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {flagsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredFlags?.length ? (
            <div className="text-center py-12">
              <Flag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No feature flags found</p>
              <p className="text-muted-foreground mb-4">
                {searchQuery
                  ? "Try a different search term"
                  : "Create your first feature flag to get started"}
              </p>
              {!searchQuery && (
                <Button onClick={handleCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Flag
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">On/Off</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tiers</TableHead>
                  <TableHead>Rollout</TableHead>
                  <TableHead>Overrides</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFlags.map((flag: FeatureFlag) => (
                  <FlagRow
                    key={flag.id}
                    flag={flag}
                    onEdit={() => handleEdit(flag)}
                    onToggle={() => handleToggle(flag.id)}
                    onDelete={() => handleDelete(flag)}
                    onViewOverrides={() => setViewingOverridesFor(flag.id)}
                    onViewAudit={() => setViewingAuditFor(flag.id)}
                    isToggling={togglingFlagId === flag.id}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <FlagDialog
        open={showFlagDialog}
        onOpenChange={(open) => {
          setShowFlagDialog(open);
          if (!open) setEditingFlag(null);
        }}
        flag={editingFlag}
        onSave={handleSaveFlag}
        isLoading={createFlag.isPending || updateFlag.isPending}
      />
    </div>
  );
}
