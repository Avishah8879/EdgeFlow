import { useState } from "react";
import {
  AdminLayout,
  AdminPanel,
  AdminKpiStrip,
  AdminKpi,
  AdminPill,
  AdminNumCell,
  type AdminBadgeTone,
} from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Key,
  Plus,
  Search,
  Copy,
  Check,
  AlertTriangle,
  Loader2,
  Trash2,
  MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useAdminApiKeys,
  useAdminApiKeyStats,
  useAdminCreateApiKey,
  useAdminRevokeApiKey,
  type AdminApiKeyFilters,
} from "@/hooks/use-admin-api-keys";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const TIER_TONE: Record<string, AdminBadgeTone> = {
  basic: "muted",
  premium: "navy",
  enterprise: "gold",
};

export default function AdminApiKeys() {
  const [filters, setFilters] = useState<AdminApiKeyFilters>({ page: 1, limit: 25 });
  const [searchInput, setSearchInput] = useState("");
  const { data: keysData, isLoading } = useAdminApiKeys(filters);
  const { data: stats } = useAdminApiKeyStats();
  const createKey = useAdminCreateApiKey();
  const revokeKeyMutation = useAdminRevokeApiKey();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);

  const [form, setForm] = useState({
    userId: "",
    name: "",
    description: "",
    tier: "enterprise",
    rateLimitPerMinute: "200",
    rateLimitPerHour: "10000",
    rateLimitPerDay: "100000",
    allowedIps: "",
    allowedEndpoints: "",
    allowedOrigins: "",
    expiresAt: "",
  });

  const handleSearch = () => {
    setFilters((f) => ({ ...f, search: searchInput || undefined, page: 1 }));
  };

  const handleCreate = async () => {
    if (!form.userId || !form.name) {
      toast.error("User ID and key name are required");
      return;
    }

    try {
      const result = await createKey.mutateAsync({
        userId: form.userId,
        name: form.name,
        description: form.description || undefined,
        tier: form.tier,
        rateLimitPerMinute: parseInt(form.rateLimitPerMinute, 10) || undefined,
        rateLimitPerHour: parseInt(form.rateLimitPerHour, 10) || undefined,
        rateLimitPerDay: parseInt(form.rateLimitPerDay, 10) || undefined,
        allowedIps: form.allowedIps
          ? form.allowedIps.split("\n").map((s) => s.trim()).filter(Boolean)
          : undefined,
        allowedEndpoints: form.allowedEndpoints
          ? form.allowedEndpoints.split("\n").map((s) => s.trim()).filter(Boolean)
          : undefined,
        allowedOrigins: form.allowedOrigins
          ? form.allowedOrigins.split("\n").map((s) => s.trim()).filter(Boolean)
          : undefined,
        expiresAt: form.expiresAt || undefined,
      });
      setCreatedKey(result.data.key);
      toast.success("API key created");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleCopyKey = async () => {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCloseCreate = () => {
    setCreateDialogOpen(false);
    setTimeout(() => {
      setCreatedKey(null);
      setCopied(false);
      setForm({
        userId: "",
        name: "",
        description: "",
        tier: "enterprise",
        rateLimitPerMinute: "200",
        rateLimitPerHour: "10000",
        rateLimitPerDay: "100000",
        allowedIps: "",
        allowedEndpoints: "",
        allowedOrigins: "",
        expiresAt: "",
      });
    }, 200);
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await revokeKeyMutation.mutateAsync({ keyId: revokeTarget.id, reason: "Revoked by admin" });
      toast.success(`Key "${revokeTarget.name}" revoked`);
      setRevokeTarget(null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const keys = keysData?.data ?? [];
  const meta = keysData?.meta;

  return (
    <AdminLayout
      requiredRole="admin"
      eyebrow="Admin · Developer"
      title="API key management"
      description="Issue, scope, and revoke API keys for partners and enterprise integrations."
      rightSlot={
        <Dialog
          open={createDialogOpen}
          onOpenChange={(v) => (v ? setCreateDialogOpen(true) : handleCloseCreate())}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Create key
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            {createdKey ? (
              <>
                <DialogHeader>
                  <DialogTitle>Key created</DialogTitle>
                  <DialogDescription>Copy the key now. It won't be shown again.</DialogDescription>
                </DialogHeader>
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md border">
                  <code className="flex-1 text-sm font-mono break-all select-all">{createdKey}</code>
                  <Button variant="ghost" size="icon" className="shrink-0" onClick={handleCopyKey}>
                    {copied ? <Check className="h-4 w-4 text-positive" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="flex items-start gap-2 text-sm text-muted-foreground bg-destructive/10 rounded-md p-3">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <span>Store this key securely. It cannot be retrieved later.</span>
                </div>
                <DialogFooter>
                  <Button onClick={handleCloseCreate}>Done</Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Create enterprise key</DialogTitle>
                  <DialogDescription>Configure tier, rate limits, IP allowlist and scope.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10.5px] font-bold uppercase tracking-uppercase">User ID *</Label>
                      <Input
                        placeholder="UUID"
                        value={form.userId}
                        onChange={(e) => setForm({ ...form, userId: e.target.value })}
                        className="font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10.5px] font-bold uppercase tracking-uppercase">Key name *</Label>
                      <Input
                        placeholder="Partner API"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10.5px] font-bold uppercase tracking-uppercase">Description</Label>
                    <Input
                      placeholder="Admin notes"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10.5px] font-bold uppercase tracking-uppercase">Tier</Label>
                      <Select value={form.tier} onValueChange={(v) => setForm({ ...form, tier: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="basic">Basic</SelectItem>
                          <SelectItem value="premium">Premium</SelectItem>
                          <SelectItem value="enterprise">Enterprise</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10.5px] font-bold uppercase tracking-uppercase">Expires at</Label>
                      <Input
                        type="date"
                        value={form.expiresAt}
                        onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                        className="font-mono tabular-nums"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10.5px] font-bold uppercase tracking-uppercase">Rate / min</Label>
                      <Input
                        type="number"
                        value={form.rateLimitPerMinute}
                        onChange={(e) => setForm({ ...form, rateLimitPerMinute: e.target.value })}
                        className="font-mono tabular-nums"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10.5px] font-bold uppercase tracking-uppercase">Rate / hr</Label>
                      <Input
                        type="number"
                        value={form.rateLimitPerHour}
                        onChange={(e) => setForm({ ...form, rateLimitPerHour: e.target.value })}
                        className="font-mono tabular-nums"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10.5px] font-bold uppercase tracking-uppercase">Rate / day</Label>
                      <Input
                        type="number"
                        value={form.rateLimitPerDay}
                        onChange={(e) => setForm({ ...form, rateLimitPerDay: e.target.value })}
                        className="font-mono tabular-nums"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10.5px] font-bold uppercase tracking-uppercase">
                      IP allowlist <span className="text-muted-foreground font-normal normal-case tracking-normal">(one per line, CIDR ok)</span>
                    </Label>
                    <textarea
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono min-h-[60px] resize-y"
                      placeholder="203.0.113.0/24&#10;10.0.0.1"
                      value={form.allowedIps}
                      onChange={(e) => setForm({ ...form, allowedIps: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10.5px] font-bold uppercase tracking-uppercase">
                      Endpoint scopes <span className="text-muted-foreground font-normal normal-case tracking-normal">(glob)</span>
                    </Label>
                    <textarea
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono min-h-[60px] resize-y"
                      placeholder="/api/stocks*&#10;/api/market-*"
                      value={form.allowedEndpoints}
                      onChange={(e) => setForm({ ...form, allowedEndpoints: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10.5px] font-bold uppercase tracking-uppercase">CORS origins</Label>
                    <textarea
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono min-h-[60px] resize-y"
                      placeholder="https://partner.com"
                      value={form.allowedOrigins}
                      onChange={(e) => setForm({ ...form, allowedOrigins: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={handleCloseCreate}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={createKey.isPending || !form.userId || !form.name}
                  >
                    {createKey.isPending ? "Creating…" : "Create key"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-4">
        {stats && (
          <AdminKpiStrip cols={4}>
            <AdminKpi label="Active keys" value={stats.activeKeys} accent="navy" />
            <AdminKpi label="Total keys" value={stats.totalKeys} />
            <AdminKpi label="Enterprise" value={stats.enterpriseKeys} accent="gold" />
            <AdminKpi label="Admin-created" value={stats.adminKeys} />
          </AdminKpiStrip>
        )}

        <AdminPanel title="Filters" description="Search by name, email, or key prefix.">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
            <div>
              <label className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                Search
              </label>
              <div className="flex gap-2 mt-1">
                <Input
                  placeholder="Name, email, prefix…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="h-9"
                />
                <Button variant="outline" size="sm" onClick={handleSearch}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="md:w-36">
              <label className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                Tier
              </label>
              <Select
                value={filters.tier || "all"}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, tier: v === "all" ? undefined : v, page: 1 }))
                }
              >
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue placeholder="Tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tiers</SelectItem>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:w-36">
              <label className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                Status
              </label>
              <Select
                value={filters.isActive || "all"}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, isActive: v === "all" ? undefined : v, page: 1 }))
                }
              >
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </AdminPanel>

        <AdminPanel
          title="Keys"
          description={`${meta?.total ?? keys.length} total · sorted by most recently used`}
          flush
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : keys.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Key className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">No API keys found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-left">
                      Name
                    </th>
                    <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-left">
                      User
                    </th>
                    <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-left">
                      Prefix
                    </th>
                    <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-left">
                      Tier
                    </th>
                    <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-left">
                      Type
                    </th>
                    <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-left">
                      Status
                    </th>
                    <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-right">
                      Last used
                    </th>
                    <th className="px-3 py-2.5 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => {
                    const isRevoked = !!k.revokedAt;
                    const isExpired = k.expiresAt && new Date(k.expiresAt) < new Date();
                    const dim = isRevoked || isExpired;
                    return (
                      <tr key={k.id} className={dim ? "opacity-50" : "hover:bg-muted/30"}>
                        <td className="px-3 py-3 border-b border-border">
                          <div className="font-semibold">{k.name}</div>
                          {k.description && (
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {k.description}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 border-b border-border">
                          <div className="text-[12.5px]">{k.userEmail || "—"}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">{k.userName}</div>
                        </td>
                        <td className="px-3 py-3 border-b border-border">
                          <AdminNumCell tone="muted" className="text-xs">
                            {k.keyPrefix}…
                          </AdminNumCell>
                        </td>
                        <td className="px-3 py-3 border-b border-border">
                          <AdminPill tone={TIER_TONE[k.tier] ?? "muted"}>{k.tier}</AdminPill>
                        </td>
                        <td className="px-3 py-3 border-b border-border">
                          <AdminPill tone={k.keyType === "admin" ? "navy" : "muted"}>
                            {k.keyType}
                          </AdminPill>
                        </td>
                        <td className="px-3 py-3 border-b border-border">
                          {isRevoked ? (
                            <AdminPill tone="negative">Revoked</AdminPill>
                          ) : isExpired ? (
                            <AdminPill tone="negative">Expired</AdminPill>
                          ) : !k.isActive ? (
                            <AdminPill>Inactive</AdminPill>
                          ) : (
                            <AdminPill tone="positive" pulse>
                              Active
                            </AdminPill>
                          )}
                        </td>
                        <td className="px-3 py-3 border-b border-border text-right">
                          <AdminNumCell tone="muted" className="text-[11px]">
                            {k.lastUsedAt
                              ? formatDistanceToNow(new Date(k.lastUsedAt), { addSuffix: true })
                              : "Never"}
                          </AdminNumCell>
                        </td>
                        <td className="px-3 py-3 border-b border-border">
                          {!isRevoked && k.isActive && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => setRevokeTarget({ id: k.id, name: k.name })}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Revoke
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {meta && meta.total > meta.limit && (
            <div className="flex items-center justify-between p-4 border-t border-border">
              <AdminNumCell tone="muted" className="text-xs">
                Showing {(meta.page - 1) * meta.limit + 1}–
                {Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
              </AdminNumCell>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={meta.page <= 1}
                  onClick={() => setFilters((f) => ({ ...f, page: (f.page || 1) - 1 }))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!meta.has_more}
                  onClick={() => setFilters((f) => ({ ...f, page: (f.page || 1) + 1 }))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </AdminPanel>
      </div>

      <AlertDialog open={!!revokeTarget} onOpenChange={(v) => !v && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API key</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently revoke <strong>{revokeTarget?.name}</strong>? Applications using this key will stop
              working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRevoke}
              disabled={revokeKeyMutation.isPending}
            >
              {revokeKeyMutation.isPending ? "Revoking…" : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
