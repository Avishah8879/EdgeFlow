import { useState } from "react";
import { AdminLayout } from "@/components/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Settings2, Loader2, Save } from "lucide-react";
import { useFeatureCosts, useUpdateFeatureCost } from "@/hooks/use-coin-wallet";
import { toast } from "sonner";

function FeatureRow({ row, onSave }: {
  row: { feature_key: string; cost: number; description: string | null; is_active: boolean };
  onSave: (cost: number) => Promise<void>;
}) {
  const [cost, setCost] = useState(String(row.cost));
  const [saving, setSaving] = useState(false);
  const dirty = parseInt(cost, 10) !== row.cost;
  return (
    <TableRow>
      <TableCell className="font-mono text-sm">{row.feature_key}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{row.description ?? "—"}</TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          className="w-24 font-mono"
        />
      </TableCell>
      <TableCell>
        {row.is_active ? (
          <Badge variant="secondary">Active</Badge>
        ) : (
          <Badge variant="outline">Inactive</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Button
          size="sm"
          disabled={!dirty || saving}
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
            <h1 className="text-2xl font-semibold tracking-tight">Feature Costs</h1>
            <p className="text-sm text-muted-foreground">
              Coins debited per use of each gated feature. Pro tier always pays 0; Semi pays this amount.
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
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Save</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <FeatureRow
                      key={row.feature_key}
                      row={row}
                      onSave={(cost) => update.mutateAsync({ key: row.feature_key, cost })}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
            <p className="text-xs text-muted-foreground mt-4">
              Adding new feature keys: Platform-2/Platform-3 features auto-register on first use,
              defaulting to 1 coin until edited here.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
