import { useState } from "react";
import { AdminLayout } from "@/components/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

  // Create form state
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
        allowedIps: form.allowedIps ? form.allowedIps.split("\n").map((s) => s.trim()).filter(Boolean) : undefined,
        allowedEndpoints: form.allowedEndpoints ? form.allowedEndpoints.split("\n").map((s) => s.trim()).filter(Boolean) : undefined,
        allowedOrigins: form.allowedOrigins ? form.allowedOrigins.split("\n").map((s) => s.trim()).filter(Boolean) : undefined,
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
        userId: "", name: "", description: "", tier: "enterprise",
        rateLimitPerMinute: "200", rateLimitPerHour: "10000", rateLimitPerDay: "100000",
        allowedIps: "", allowedEndpoints: "", allowedOrigins: "", expiresAt: "",
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
      description="Create and manage API keys for developers and partners."
    >
      <div className="space-y-6">
        <div className="flex items-center justify-end">
          <Dialog open={createDialogOpen} onOpenChange={(v) => (v ? setCreateDialogOpen(true) : handleCloseCreate())}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Create Key
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              {createdKey ? (
                <>
                  <DialogHeader>
                    <DialogTitle>Key Created</DialogTitle>
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
                    <DialogTitle>Create Enterprise Key</DialogTitle>
                    <DialogDescription>Create an API key with custom settings.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>User ID *</Label>
                        <Input placeholder="UUID" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Key Name *</Label>
                        <Input placeholder="Partner API" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Input placeholder="Admin notes" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Tier</Label>
                        <Select value={form.tier} onValueChange={(v) => setForm({ ...form, tier: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="basic">Basic</SelectItem>
                            <SelectItem value="premium">Premium</SelectItem>
                            <SelectItem value="enterprise">Enterprise</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Expires At</Label>
                        <Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Rate/min</Label>
                        <Input type="number" value={form.rateLimitPerMinute} onChange={(e) => setForm({ ...form, rateLimitPerMinute: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Rate/hr</Label>
                        <Input type="number" value={form.rateLimitPerHour} onChange={(e) => setForm({ ...form, rateLimitPerHour: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Rate/day</Label>
                        <Input type="number" value={form.rateLimitPerDay} onChange={(e) => setForm({ ...form, rateLimitPerDay: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>IP Whitelist <span className="text-muted-foreground font-normal">(one per line, CIDR supported)</span></Label>
                      <textarea
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono min-h-[60px] resize-y"
                        placeholder="203.0.113.0/24&#10;10.0.0.1"
                        value={form.allowedIps}
                        onChange={(e) => setForm({ ...form, allowedIps: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Endpoint Scopes <span className="text-muted-foreground font-normal">(one per line, glob patterns)</span></Label>
                      <textarea
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono min-h-[60px] resize-y"
                        placeholder="/api/stocks*&#10;/api/market-*"
                        value={form.allowedEndpoints}
                        onChange={(e) => setForm({ ...form, allowedEndpoints: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>CORS Origins <span className="text-muted-foreground font-normal">(one per line)</span></Label>
                      <textarea
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono min-h-[60px] resize-y"
                        placeholder="https://partner.com"
                        value={form.allowedOrigins}
                        onChange={(e) => setForm({ ...form, allowedOrigins: e.target.value })}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={handleCloseCreate}>Cancel</Button>
                    <Button onClick={handleCreate} disabled={createKey.isPending || !form.userId || !form.name}>
                      {createKey.isPending ? "Creating..." : "Create Key"}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold">{stats.activeKeys}</div>
                <div className="text-xs text-muted-foreground">Active Keys</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold">{stats.totalKeys}</div>
                <div className="text-xs text-muted-foreground">Total Keys</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold">{stats.enterpriseKeys}</div>
                <div className="text-xs text-muted-foreground">Enterprise</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold">{stats.adminKeys}</div>
                <div className="text-xs text-muted-foreground">Admin-Created</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Input
              placeholder="Search by name, email, prefix..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button variant="outline" size="icon" onClick={handleSearch}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
          <Select
            value={filters.tier || "all"}
            onValueChange={(v) => setFilters((f) => ({ ...f, tier: v === "all" ? undefined : v, page: 1 }))}
          >
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="Tier" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              <SelectItem value="basic">Basic</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.isActive || "all"}
            onValueChange={(v) => setFilters((f) => ({ ...f, isActive: v === "all" ? undefined : v, page: 1 }))}
          >
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="true">Active</SelectItem>
              <SelectItem value="false">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Keys Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : keys.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Key className="h-8 w-8 mx-auto mb-2" />
                <p>No API keys found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Prefix</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Used</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keys.map((k) => {
                      const isRevoked = !!k.revokedAt;
                      const isExpired = k.expiresAt && new Date(k.expiresAt) < new Date();
                      return (
                        <TableRow key={k.id} className={isRevoked || isExpired ? "opacity-50" : ""}>
                          <TableCell className="font-medium">
                            <div>{k.name}</div>
                            {k.description && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{k.description}</div>}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{k.userEmail || "—"}</div>
                            <div className="text-xs text-muted-foreground">{k.userName}</div>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs font-mono">{k.keyPrefix}...</code>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{k.tier}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={k.keyType === "admin" ? "default" : "secondary"} className="text-xs">
                              {k.keyType}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {isRevoked ? (
                              <Badge variant="destructive">Revoked</Badge>
                            ) : isExpired ? (
                              <Badge variant="destructive">Expired</Badge>
                            ) : !k.isActive ? (
                              <Badge variant="secondary">Inactive</Badge>
                            ) : (
                              <Badge className="bg-positive/15 text-positive border-positive/30">Active</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {k.lastUsedAt
                              ? formatDistanceToNow(new Date(k.lastUsedAt), { addSuffix: true })
                              : "Never"}
                          </TableCell>
                          <TableCell>
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
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {meta && meta.total > meta.limit && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {(meta.page - 1) * meta.limit + 1}–
              {Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
            </p>
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
      </div>

      {/* Revoke Confirmation */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(v) => !v && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently revoke <strong>{revokeTarget?.name}</strong>? Applications using this key will stop working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRevoke}
              disabled={revokeKeyMutation.isPending}
            >
              {revokeKeyMutation.isPending ? "Revoking..." : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
