import { useState } from "react";
import {
  AdminLayout,
  AdminPanel,
  AdminPill,
  AdminNumCell,
  type AdminBadgeTone,
} from "@/components/admin";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Loader2, Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { getAuthBaseUrl } from "@/lib/api-config";
import type { CoinTransaction } from "@/hooks/use-coin-wallet";
import { usePlatforms } from "@/hooks/use-platforms";

const TX_TYPE_TONE: Record<string, AdminBadgeTone> = {
  purchase: "positive",
  admin_grant: "navy",
  monthly_top_up: "navy",
  signup_bonus: "positive",
  debit: "negative",
  refund: "gold",
  expiry: "muted",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminCoinTransactions() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  const [userId, setUserId] = useState("");
  const [type, setType] = useState("all");
  const [platformId, setPlatformId] = useState("all");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const { data: platformsData } = usePlatforms();
  const platforms = platformsData?.data ?? [];
  const platformNameById = new Map(platforms.map((p) => [p.id, p.name] as const));

  const params = new URLSearchParams();
  if (userId.trim()) params.set("user_id", userId.trim());
  if (type !== "all") params.set("type", type);
  if (platformId !== "all") params.set("platform_id", platformId);
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const { data, isLoading } = useQuery<{ data: CoinTransaction[] }>({
    queryKey: ["admin-coin-txns", userId, type, platformId, offset],
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/admin/coins/transactions?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Failed to fetch");
      return r.json();
    },
    enabled: !!token,
    staleTime: 15_000,
  });

  const txns = data?.data ?? [];

  const downloadCSV = () => {
    if (!txns.length) return;
    const header = ["id", "user_id", "type", "amount", "feature_key", "reference_id", "balance_after", "created_at"];
    const rows = txns.map((t) => [
      t.id,
      t.user_id,
      t.type,
      t.amount,
      t.feature_key ?? "",
      t.reference_id ?? "",
      t.balance_after,
      t.created_at,
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `coin-transactions-${Date.now()}.csv`;
    a.click();
  };

  return (
    <AdminLayout
      requiredRole="admin"
      eyebrow="Admin · Wallet"
      title="Coin transactions"
      description="Every ledger entry across all users and platforms — filterable, exportable, paginated 50 per page."
      rightSlot={
        <Button variant="outline" size="sm" onClick={downloadCSV} disabled={!txns.length}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      }
    >
      <div className="space-y-4">
        <AdminPanel title="Filters" description="Filter by user, transaction type, or originating platform.">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
            <div>
              <label className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                User UUID
              </label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 h-9 font-mono text-xs"
                  placeholder="Filter by user UUID…"
                  value={userId}
                  onChange={(e) => {
                    setUserId(e.target.value);
                    setOffset(0);
                  }}
                />
              </div>
            </div>
            <div className="md:w-44">
              <label className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                Type
              </label>
              <Select
                value={type}
                onValueChange={(v) => {
                  setType(v);
                  setOffset(0);
                }}
              >
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="purchase">Purchase</SelectItem>
                  <SelectItem value="signup_bonus">Signup bonus</SelectItem>
                  <SelectItem value="admin_grant">Admin grant</SelectItem>
                  <SelectItem value="monthly_top_up">Monthly top-up</SelectItem>
                  <SelectItem value="debit">Debit</SelectItem>
                  <SelectItem value="refund">Refund</SelectItem>
                  <SelectItem value="expiry">Expiry</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:w-48">
              <label className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                Platform
              </label>
              <Select
                value={platformId}
                onValueChange={(v) => {
                  setPlatformId(v);
                  setOffset(0);
                }}
              >
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue placeholder="All platforms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All platforms</SelectItem>
                  {platforms.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </AdminPanel>

        <AdminPanel
          title="Ledger"
          description={`${txns.length} rows shown · offset ${offset}`}
          flush
        >
          {isLoading ? (
            <div className="flex items-center gap-2 py-12 px-5 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : txns.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">No transactions found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-left">
                      Type
                    </th>
                    <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-right">
                      Amount
                    </th>
                    <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-right">
                      Balance
                    </th>
                    <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-left">
                      User ID
                    </th>
                    <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-left">
                      Feature
                    </th>
                    <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-left">
                      Platform
                    </th>
                    <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-right">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2.5 border-b border-border">
                        <AdminPill tone={TX_TYPE_TONE[t.type] ?? "muted"}>
                          {t.type.replace(/_/g, " ")}
                        </AdminPill>
                      </td>
                      <td className="px-3 py-2.5 border-b border-border text-right">
                        <AdminNumCell tone={t.amount > 0 ? "positive" : "negative"} className="font-bold">
                          {t.amount > 0 ? "+" : ""}
                          {t.amount}
                        </AdminNumCell>
                      </td>
                      <td className="px-3 py-2.5 border-b border-border text-right">
                        <AdminNumCell>{t.balance_after}</AdminNumCell>
                      </td>
                      <td className="px-3 py-2.5 border-b border-border max-w-[140px] truncate">
                        <AdminNumCell tone="muted" className="text-[11px]">
                          {t.user_id}
                        </AdminNumCell>
                      </td>
                      <td className="px-3 py-2.5 border-b border-border text-[11.5px] text-muted-foreground">
                        {t.feature_key ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 border-b border-border text-[11.5px]">
                        {t.platform_id
                          ? platformNameById.get(t.platform_id) ?? t.platform_id.slice(0, 8)
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5 border-b border-border text-right">
                        <AdminNumCell tone="muted" className="text-[11px]">
                          {formatDate(t.created_at)}
                        </AdminNumCell>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between p-4 border-t border-border">
            <AdminNumCell tone="muted" className="text-xs">
              Showing {txns.length === 0 ? 0 : offset + 1}–{offset + txns.length}
            </AdminNumCell>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOffset(offset + limit)}
                disabled={txns.length < limit}
              >
                Next
              </Button>
            </div>
          </div>
        </AdminPanel>
      </div>
    </AdminLayout>
  );
}
