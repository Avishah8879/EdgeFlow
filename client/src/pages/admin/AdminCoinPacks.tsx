import { useState } from "react";
import { AdminLayout } from "@/components/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Coins, Plus, Loader2, Trash2 } from "lucide-react";
import {
  useAdminCoinPacks,
  useCreateCoinPack,
  useUpdateCoinPack,
  useDeleteCoinPack,
  type AdminCoinPack,
} from "@/hooks/use-coin-wallet";
import { toast } from "sonner";

function PackForm({ initial, onSave, onCancel, isSaving }: {
  initial?: Partial<AdminCoinPack>;
  onSave: (vals: { name: string; coin_amount: number; bonus_coins: number; price_inr_paise: number; sort_order: number }) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [name,    setName]    = useState(initial?.name ?? "");
  const [coins,   setCoins]   = useState(String(initial?.coin_amount ?? ""));
  const [bonus,   setBonus]   = useState(String(initial?.bonus_coins ?? "0"));
  const [priceRs, setPriceRs] = useState(String((initial?.price_inr_paise ?? 0) / 100));
  const [order,   setOrder]   = useState(String(initial?.sort_order ?? 0));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name: name.trim(),
          coin_amount: parseInt(coins, 10),
          bonus_coins: parseInt(bonus, 10) || 0,
          price_inr_paise: Math.round(parseFloat(priceRs) * 100),
          sort_order: parseInt(order, 10) || 0,
        });
      }}
      className="space-y-4"
    >
      <div>
        <Label>Name</Label>
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Starter" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Coins</Label>
          <Input type="number" min={1} required value={coins} onChange={(e) => setCoins(e.target.value)} />
        </div>
        <div>
          <Label>Bonus coins</Label>
          <Input type="number" min={0} value={bonus} onChange={(e) => setBonus(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Price (₹)</Label>
          <Input type="number" min={1} step={0.01} required value={priceRs} onChange={(e) => setPriceRs(e.target.value)} />
        </div>
        <div>
          <Label>Sort order</Label>
          <Input type="number" min={0} value={order} onChange={(e) => setOrder(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

function CreatePackDialog() {
  const [open, setOpen] = useState(false);
  const create = useCreateCoinPack();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-1" /> New pack</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create coin pack</DialogTitle>
          <DialogDescription>Goes live on /pricing as soon as it's saved (if active).</DialogDescription>
        </DialogHeader>
        <PackForm
          isSaving={create.isPending}
          onCancel={() => setOpen(false)}
          onSave={async (vals) => {
            try { await create.mutateAsync(vals); toast.success("Pack created"); setOpen(false); }
            catch (err: any) { toast.error(err.message); }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function EditPackDialog({ pack }: { pack: AdminCoinPack }) {
  const [open, setOpen] = useState(false);
  const update = useUpdateCoinPack();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">Edit</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit “{pack.name}”</DialogTitle>
        </DialogHeader>
        <PackForm
          initial={pack}
          isSaving={update.isPending}
          onCancel={() => setOpen(false)}
          onSave={async (vals) => {
            try { await update.mutateAsync({ id: pack.id, patch: vals }); toast.success("Saved"); setOpen(false); }
            catch (err: any) { toast.error(err.message); }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export default function AdminCoinPacks() {
  const { data, isLoading } = useAdminCoinPacks();
  const update = useUpdateCoinPack();
  const remove = useDeleteCoinPack();
  const packs = data?.data ?? [];

  return (
    <AdminLayout requiredRole="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10"><Coins className="h-5 w-5 text-primary" /></div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Coin Packs</h1>
              <p className="text-sm text-muted-foreground">Edit the packs that show up on /pricing.</p>
            </div>
          </div>
          <CreatePackDialog />
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Packs ({packs.length})</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : packs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No packs yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Coins</TableHead>
                    <TableHead>Bonus</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packs.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="font-mono">{p.coin_amount.toLocaleString("en-IN")}</TableCell>
                      <TableCell className="font-mono">{p.bonus_coins > 0 ? `+${p.bonus_coins}` : "—"}</TableCell>
                      <TableCell className="font-mono">₹{(p.price_inr_paise / 100).toLocaleString("en-IN")}</TableCell>
                      <TableCell>{p.sort_order}</TableCell>
                      <TableCell>
                        <Switch
                          checked={p.is_active}
                          onCheckedChange={async (v) => {
                            try { await update.mutateAsync({ id: p.id, patch: { is_active: v } }); }
                            catch (err: any) { toast.error(err.message); }
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <EditPackDialog pack={p} />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete “{p.name}”?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Users won't see this pack anywhere. Existing payment_intents that reference it remain in history.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={async () => {
                                  try { await remove.mutateAsync(p.id); toast.success("Deleted"); }
                                  catch (err: any) { toast.error(err.message); }
                                }}
                              >Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
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
