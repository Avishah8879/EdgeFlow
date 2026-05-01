import { useState } from "react";
import { AdminLayout } from "@/components/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Coins, Search, Loader2, Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { getAuthBaseUrl } from "@/lib/api-config";
import type { CoinTransaction } from "@/hooks/use-coin-wallet";
import { usePlatforms } from "@/hooks/use-platforms";

const TX_TYPE_COLORS: Record<string, string> = {
  purchase:       "bg-positive/20 text-positive border-positive/30",
  admin_grant:    "bg-primary/15 text-primary border-primary/25",
  monthly_top_up: "bg-blue-500/15 text-blue-500 border-blue-500/25",
  signup_bonus:   "bg-positive/15 text-positive border-positive/25",
  debit:          "bg-negative/15 text-negative border-negative/25",
  refund:         "bg-yellow-500/15 text-yellow-600 border-yellow-500/25",
  expiry:         "bg-muted text-muted-foreground border-border",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
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
    const header = ["id","user_id","type","amount","feature_key","reference_id","balance_after","created_at"];
    const rows = txns.map(t => [t.id, t.user_id, t.type, t.amount, t.feature_key ?? "", t.reference_id ?? "", t.balance_after, t.created_at]);
    const csv = [header, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `coin-transactions-${Date.now()}.csv`; a.click();
  };

  return (
    <AdminLayout requiredRole="admin">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10">
            <Coins className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Coin Transactions</h1>
            <p className="text-sm text-muted-foreground">All ledger entries across every user and platform.</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Filter by user UUID…"
              value={userId}
              onChange={(e) => { setUserId(e.target.value); setOffset(0); }}
            />
          </div>
          <Select value={type} onValueChange={(v) => { setType(v); setOffset(0); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Type" />
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
          <Select value={platformId} onValueChange={(v) => { setPlatformId(v); setOffset(0); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All platforms</SelectItem>
              {platforms.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={downloadCSV} disabled={!txns.length}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ledger ({txns.length} rows shown)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : txns.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No transactions found.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Balance after</TableHead>
                      <TableHead>User ID</TableHead>
                      <TableHead>Feature</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {txns.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[11px] ${TX_TYPE_COLORS[t.type] ?? ""}`}
                          >
                            {t.type.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className={`font-mono font-semibold ${t.amount > 0 ? "text-positive" : "text-negative"}`}>
                          {t.amount > 0 ? "+" : ""}{t.amount}
                        </TableCell>
                        <TableCell className="font-mono">{t.balance_after}</TableCell>
                        <TableCell className="font-mono text-xs max-w-[140px] truncate">{t.user_id}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{t.feature_key ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          {t.platform_id ? (platformNameById.get(t.platform_id) ?? t.platform_id.slice(0, 8)) : "—"}
                        </TableCell>
                        <TableCell className="text-xs">{formatDate(t.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-muted-foreground">Showing {offset + 1}–{offset + txns.length}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}>Previous</Button>
                <Button size="sm" variant="outline" onClick={() => setOffset(offset + limit)} disabled={txns.length < limit}>Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
