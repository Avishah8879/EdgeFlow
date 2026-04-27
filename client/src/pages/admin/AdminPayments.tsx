import { useState } from "react";
import { AdminLayout } from "@/components/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CreditCard, Search, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { getAuthBaseUrl } from "@/lib/api-config";

interface AdminPaymentIntent {
  id: string;
  user_id: string;
  user_email: string | null;
  user_username: string | null;
  kind: "plan" | "coin_pack";
  product_id: string;
  amount_paise: number;
  currency: string;
  cashfree_order_id: string | null;
  cashfree_payment_id: string | null;
  status: "pending" | "paid" | "failed" | "expired" | "refunded";
  fulfilled_at: string | null;
  created_at: string;
}

const STATUS_BADGE: Record<string, string> = {
  pending:  "bg-muted text-muted-foreground border-border",
  paid:     "bg-positive/15 text-positive border-positive/30",
  failed:   "bg-negative/15 text-negative border-negative/30",
  expired:  "bg-muted text-muted-foreground border-border",
  refunded: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminPayments() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  const [status, setStatus] = useState("all");
  const [kind,   setKind]   = useState("all");
  const [userId, setUserId] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (kind   !== "all") params.set("kind", kind);
  if (userId.trim())    params.set("user_id", userId.trim());
  params.set("limit",  String(limit));
  params.set("offset", String(offset));

  const { data, isLoading } = useQuery<{ data: AdminPaymentIntent[] }>({
    queryKey: ["admin-payments", status, kind, userId, offset],
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/admin/payments?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Failed to fetch");
      return r.json();
    },
    enabled: !!token,
    staleTime: 15_000,
  });

  const intents = data?.data ?? [];

  return (
    <AdminLayout requiredRole="admin">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10"><CreditCard className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
            <p className="text-sm text-muted-foreground">Cashfree payment intents — every checkout attempt.</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Filter by user UUID…"
                   value={userId} onChange={(e) => { setUserId(e.target.value); setOffset(0); }} />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setOffset(0); }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
            </SelectContent>
          </Select>
          <Select value={kind} onValueChange={(v) => { setKind(v); setOffset(0); }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              <SelectItem value="plan">Plan</SelectItem>
              <SelectItem value="coin_pack">Coin pack</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Intents ({intents.length} shown)</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : intents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No payment intents found.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>CF order</TableHead>
                      <TableHead>Fulfilled</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {intents.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>
                          <Badge variant="outline" className={`text-[11px] ${STATUS_BADGE[i.status] ?? ""}`}>
                            {i.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono">₹{(i.amount_paise / 100).toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-sm">{i.kind === "coin_pack" ? "Coin pack" : "Plan"}</TableCell>
                        <TableCell className="font-mono text-xs">{i.product_id}</TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium">{i.user_email ?? "—"}</div>
                          <div className="text-muted-foreground">{i.user_username ?? ""}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{i.cashfree_order_id ?? "—"}</TableCell>
                        <TableCell className="text-xs">{formatDate(i.fulfilled_at)}</TableCell>
                        <TableCell className="text-xs">{formatDate(i.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-muted-foreground">Showing {offset + 1}–{offset + intents.length}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}>Previous</Button>
                <Button size="sm" variant="outline" onClick={() => setOffset(offset + limit)} disabled={intents.length < limit}>Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
