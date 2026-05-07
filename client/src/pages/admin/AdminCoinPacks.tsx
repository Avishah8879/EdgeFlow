import { useEffect, useState } from "react";
import {
  AdminLayout,
  AdminPanel,
  AdminPill,
  AdminNumCell,
} from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { Plus, Loader2, Trash2 } from "lucide-react";
import {
  useAdminCoinPacks,
  useCreateCoinPack,
  useUpdateCoinPack,
  useDeleteCoinPack,
  useCoinPricing,
  useUpdateCoinPricing,
  type AdminCoinPack,
} from "@/hooks/use-coin-wallet";
import { toast } from "sonner";

function CoinPricingPanel() {
  const { data, isLoading } = useCoinPricing();
  const update = useUpdateCoinPricing();
  const current = data?.data;
  const [rupees, setRupees] = useState("");

  useEffect(() => {
    if (current && rupees === "") {
      setRupees((current.paise_per_coin / 100).toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.paise_per_coin]);

  const dirty =
    current != null &&
    rupees !== "" &&
    Math.round(parseFloat(rupees) * 100) !== current.paise_per_coin;

  const onSave = async () => {
    const paise = Math.round(parseFloat(rupees) * 100);
    if (!Number.isFinite(paise) || paise <= 0) {
      toast.error("Rate must be a positive number");
      return;
    }
    try {
      await update.mutateAsync({ paise_per_coin: paise });
      toast.success("Rate updated");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <AdminPanel
      title="Custom-amount coin rate"
      description="Buyers on Profile → Coins pay qty × this rate. Discrete packs ignore it."
    >
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
            ₹ per coin
          </Label>
          <Input
            type="number"
            min={0.01}
            step={0.01}
            value={rupees}
            onChange={(e) => setRupees(e.target.value)}
            className="w-32 font-mono tabular-nums"
            disabled={isLoading}
          />
        </div>
        <Button onClick={onSave} disabled={!dirty || update.isPending}>
          {update.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Save rate
        </Button>
        {current && (
          <AdminNumCell tone="muted" className="text-[11px] pb-2.5">
            Last updated {new Date(current.updated_at).toLocaleString("en-IN")}
          </AdminNumCell>
        )}
      </div>
    </AdminPanel>
  );
}

function PackForm({
  initial,
  onSave,
  onCancel,
  isSaving,
}: {
  initial?: Partial<AdminCoinPack>;
  onSave: (vals: {
    name: string;
    coin_amount: number;
    bonus_coins: number;
    price_inr_paise: number;
    sort_order: number;
  }) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [coins, setCoins] = useState(String(initial?.coin_amount ?? ""));
  const [bonus, setBonus] = useState(String(initial?.bonus_coins ?? "0"));
  const [priceRs, setPriceRs] = useState(String((initial?.price_inr_paise ?? 0) / 100));
  const [order, setOrder] = useState(String(initial?.sort_order ?? 0));

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
          <Input
            type="number"
            min={1}
            required
            value={coins}
            onChange={(e) => setCoins(e.target.value)}
            className="font-mono tabular-nums"
          />
        </div>
        <div>
          <Label>Bonus coins</Label>
          <Input
            type="number"
            min={0}
            value={bonus}
            onChange={(e) => setBonus(e.target.value)}
            className="font-mono tabular-nums"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Price (₹)</Label>
          <Input
            type="number"
            min={1}
            step={0.01}
            required
            value={priceRs}
            onChange={(e) => setPriceRs(e.target.value)}
            className="font-mono tabular-nums"
          />
        </div>
        <div>
          <Label>Sort order</Label>
          <Input
            type="number"
            min={0}
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            className="font-mono tabular-nums"
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
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
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" /> New pack
        </Button>
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
            try {
              await create.mutateAsync(vals);
              toast.success("Pack created");
              setOpen(false);
            } catch (err: any) {
              toast.error(err.message);
            }
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
        <Button size="sm" variant="ghost">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit "{pack.name}"</DialogTitle>
        </DialogHeader>
        <PackForm
          initial={pack}
          isSaving={update.isPending}
          onCancel={() => setOpen(false)}
          onSave={async (vals) => {
            try {
              await update.mutateAsync({ id: pack.id, patch: vals });
              toast.success("Saved");
              setOpen(false);
            } catch (err: any) {
              toast.error(err.message);
            }
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
    <AdminLayout
      requiredRole="admin"
      eyebrow="Admin · Wallet"
      title="Coin packs"
      description="Bundles that appear on /pricing — name, coin count, bonus, INR price, sort order, active flag."
      rightSlot={<CreatePackDialog />}
    >
      <div className="space-y-4">
        <CoinPricingPanel />

        <AdminPanel
          title="Packs"
          description={`${packs.length} pack${packs.length === 1 ? "" : "s"} configured`}
          flush
        >
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-12 text-center">Loading…</p>
          ) : packs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              No packs yet — create one to enable on-platform purchases.
            </p>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="bg-muted/40">
                  <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-left">
                    Name
                  </th>
                  <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-right">
                    Coins
                  </th>
                  <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-right">
                    Bonus
                  </th>
                  <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-right">
                    Price
                  </th>
                  <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-right">
                    Order
                  </th>
                  <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-left">
                    Status
                  </th>
                  <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {packs.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="px-3 py-3 border-b border-border font-semibold">{p.name}</td>
                    <td className="px-3 py-3 border-b border-border text-right">
                      <AdminNumCell>{p.coin_amount.toLocaleString("en-IN")}</AdminNumCell>
                    </td>
                    <td className="px-3 py-3 border-b border-border text-right">
                      <AdminNumCell tone={p.bonus_coins > 0 ? "positive" : "muted"}>
                        {p.bonus_coins > 0 ? `+${p.bonus_coins}` : "—"}
                      </AdminNumCell>
                    </td>
                    <td className="px-3 py-3 border-b border-border text-right">
                      <AdminNumCell tone="gold" className="font-bold">
                        ₹{(p.price_inr_paise / 100).toLocaleString("en-IN")}
                      </AdminNumCell>
                    </td>
                    <td className="px-3 py-3 border-b border-border text-right">
                      <AdminNumCell tone="muted">{p.sort_order}</AdminNumCell>
                    </td>
                    <td className="px-3 py-3 border-b border-border">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={p.is_active}
                          onCheckedChange={async (v) => {
                            try {
                              await update.mutateAsync({ id: p.id, patch: { is_active: v } });
                            } catch (err: any) {
                              toast.error(err.message);
                            }
                          }}
                        />
                        <AdminPill tone={p.is_active ? "positive" : "muted"}>
                          {p.is_active ? "Live" : "Off"}
                        </AdminPill>
                      </div>
                    </td>
                    <td className="px-3 py-3 border-b border-border text-right space-x-1 whitespace-nowrap">
                      <EditPackDialog pack={p} />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete "{p.name}"?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Users won't see this pack anywhere. Existing payment_intents that reference it remain in
                              history.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={async () => {
                                try {
                                  await remove.mutateAsync(p.id);
                                  toast.success("Deleted");
                                } catch (err: any) {
                                  toast.error(err.message);
                                }
                              }}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminPanel>
      </div>
    </AdminLayout>
  );
}
