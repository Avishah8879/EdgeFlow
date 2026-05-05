import { useState } from "react";
import { AdminLayout } from "@/components/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Layers,
  Plus,
  Copy,
  Check,
  Loader2,
  Power,
  PowerOff,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import {
  usePlatforms,
  useCreatePlatform,
  useUpdatePlatform,
  usePlatformKeys,
  useCreatePlatformKey,
  useRevokePlatformKey,
  type Platform,
  type PlatformApiKey,
  type CreatedPlatformKey,
} from "@/hooks/use-platforms";
import { toast } from "sonner";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2 mt-1">
        <code className="flex-1 px-3 py-2 rounded-md border border-border bg-muted/40 text-xs font-mono break-all">
          {value}
        </code>
        <Button type="button" size="icon" variant="outline" onClick={onCopy} aria-label={`Copy ${label}`}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function CreatePlatformDialog() {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const create = useCreatePlatform();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await create.mutateAsync({
        slug: slug.trim().toLowerCase(),
        name: name.trim(),
        description: description.trim() || undefined,
      });
      toast.success("Platform created");
      setSlug("");
      setName("");
      setDescription("");
      setOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create platform");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-1" /> New Platform
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Register a Platform</DialogTitle>
            <DialogDescription>
              Each platform gets its own API key set. The slug is used in JWTs and audit logs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="platform-slug">Slug</Label>
              <Input
                id="platform-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="my-new-app"
                pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">Lowercase letters, digits, and hyphens only.</p>
            </div>
            <div>
              <Label htmlFor="platform-name">Display name</Label>
              <Input
                id="platform-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My New App"
                required
              />
            </div>
            <div>
              <Label htmlFor="platform-description">Description (optional)</Label>
              <Textarea
                id="platform-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this platform do?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateKeyDialog({ platformId }: { platformId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<CreatedPlatformKey | null>(null);
  const createKey = useCreatePlatformKey();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await createKey.mutateAsync({ platformId, name: name.trim() });
      setCreated(result);
      setName("");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create key");
    }
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      setCreated(null);
      setName("");
    }
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-3.5 w-3.5 mr-1" /> New key
        </Button>
      </DialogTrigger>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" /> Save these credentials now
              </DialogTitle>
              <DialogDescription>
                These values are shown <strong>only once</strong>. Store them in a secret manager —
                we keep only their hashes and cannot show them again.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <CopyableField label="Public key (X-Platform-Key)" value={created.publicKey} />
              <CopyableField label="Secret" value={created.secret} />
            </div>
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>I have saved them — close</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>New API key</DialogTitle>
              <DialogDescription>
                A short label so you can find this key later (e.g. "production server").
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="production server"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createKey.isPending}>
                {createKey.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Generate
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PlatformKeysPanel({ platform }: { platform: Platform }) {
  const { data, isLoading } = usePlatformKeys(platform.id);
  const revoke = useRevokePlatformKey();

  const onRevoke = async (key: PlatformApiKey) => {
    try {
      await revoke.mutateAsync({ platformId: platform.id, keyId: key.id });
      toast.success("Key revoked");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to revoke");
    }
  };

  return (
    <div className="border rounded-md bg-muted/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">API keys</h3>
        <CreateKeyDialog platformId={platform.id} />
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !data || data.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No keys yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Prefix</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.data.map((key) => (
              <TableRow key={key.id}>
                <TableCell className="font-medium">{key.name}</TableCell>
                <TableCell className="font-mono text-xs">{key.key_prefix}…</TableCell>
                <TableCell>
                  {key.is_active ? (
                    <Badge variant="secondary">Active</Badge>
                  ) : (
                    <Badge variant="outline">Revoked</Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs">{formatDate(key.last_used_at)}</TableCell>
                <TableCell className="text-xs">{formatDate(key.created_at)}</TableCell>
                <TableCell className="text-right">
                  {key.is_active && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Revoke this key?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Any platform server still using <code className="font-mono">{key.key_prefix}…</code> will start
                            getting 401 immediately. Issue a new key first if rotating.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onRevoke(key)}>Revoke</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function PlatformRow({ platform }: { platform: Platform }) {
  const [expanded, setExpanded] = useState(false);
  const update = useUpdatePlatform();

  const toggleActive = async () => {
    try {
      await update.mutateAsync({ id: platform.id, patch: { is_active: !platform.is_active } });
      toast.success(platform.is_active ? "Platform deactivated" : "Platform activated");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update");
    }
  };

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <TableCell className="font-mono text-xs">{platform.slug}</TableCell>
        <TableCell className="font-medium">{platform.name}</TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {platform.description ?? "—"}
        </TableCell>
        <TableCell>
          {platform.is_active ? (
            <Badge variant="secondary">Active</Badge>
          ) : (
            <Badge variant="outline">Inactive</Badge>
          )}
        </TableCell>
        <TableCell className="text-xs">{formatDate(platform.created_at)}</TableCell>
        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={toggleActive} disabled={update.isPending}>
            {platform.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
          </Button>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={6} className="bg-background p-4">
            <PlatformKeysPanel platform={platform} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function AdminPlatforms() {
  const { data, isLoading, error } = usePlatforms();

  return (
    <AdminLayout requiredRole="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              <Layers className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">Platforms</h1>
              <p className="text-sm text-muted-foreground">
                Apps that share this auth + coin service. Each platform holds its own API keys.
              </p>
            </div>
          </div>
          <CreatePlatformDialog />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registered platforms</CardTitle>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="text-sm text-destructive">Failed to load platforms.</div>
            ) : isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : !data || data.data.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                No platforms registered yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Slug</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((p) => (
                    <PlatformRow key={p.id} platform={p} />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
