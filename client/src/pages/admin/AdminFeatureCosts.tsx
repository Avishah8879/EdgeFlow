import { useState } from "react";
import { AdminLayout } from "@/components/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Settings2, Loader2, Save } from "lucide-react";
import {
  useFeatureCosts,
  useUpdateFeatureCost,
  type FeatureCost,
} from "@/hooks/use-coin-wallet";
import { toast } from "sonner";

function FeatureRow({
  row,
  onSave,
  onToggleActive,
}: {
  row: FeatureCost;
  onSave: (cost: number) => Promise<void>;
  onToggleActive: (next: boolean) => Promise<void>;
}) {
  const [cost, setCost] = useState(String(row.cost));
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const dirty = parseInt(cost, 10) !== row.cost;
  const disabled = !row.is_active;

  return (
    <TableRow className={disabled ? "opacity-70" : undefined}>
      <TableCell className="font-mono text-sm">{row.feature_key}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{row.description ?? "—"}</TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          value={cost}
          disabled={disabled}
          onChange={(e) => setCost(e.target.value)}
          className="w-24 font-mono"
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Switch
            checked={row.is_active}
            disabled={toggling}
            onCheckedChange={async (next) => {
              setToggling(true);
              try {
                await onToggleActive(next);
                toast.success(next ? "Feature gated (paid)" : "Feature is now free");
              } catch (err: any) {
                toast.error(err.message ?? "Failed to update");
              } finally {
                setToggling(false);
              }
            }}
          />
          <span className="text-xs text-muted-foreground">
            {row.is_active ? "Paid" : "Free"}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <Button
          size="sm"
          disabled={!dirty || saving || disabled}
          onClick={async () => {
            const n = parseInt(cost, 10);
            if (Number.isNaN(n) || n < 0) { toast.error("Cost must be ≥ 0"); return; }
            setSaving(true);
            try { await onSave(n); toast.success("Saved"); }
            catch (err: any) { toast.error(err.message); }
            finally { setSaving(false); }
          }}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default function AdminFeatureCosts() {
  const { data, isLoading } = useFeatureCosts();
  const update = useUpdateFeatureCost();
  const rows = data?.data ?? [];

  return (
    <AdminLayout requiredRole="admin">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10"><Settings2 className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">Feature Costs</h1>
            <p className="text-sm text-muted-foreground">
              Coins debited per use of each gated feature. Toggle a feature to <span className="font-medium">Free</span> to skip the gate entirely;
              everyone pays the configured cost when set to <span className="font-medium">Paid</span>.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Catalog ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature key</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Cost (coins)</TableHead>
                    <TableHead>Gating</TableHead>
                    <TableHead className="text-right">Save</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <FeatureRow
                      key={row.feature_key}
                      row={row}
                      onSave={(cost) =>
                        update.mutateAsync({ key: row.feature_key, cost })
                      }
                      onToggleActive={(next) =>
                        update.mutateAsync({
                          key: row.feature_key,
                          cost: row.cost,
                          is_active: next,
                        })
                      }
                    />
                  ))}
                </TableBody>
              </Table>
            )}
            <p className="text-xs text-muted-foreground mt-4">
              New feature keys auto-register on first use and default to 1 coin and Paid until edited here.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
