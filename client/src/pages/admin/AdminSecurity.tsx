import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AdminLayout,
  AdminPanel,
  AdminKpiStrip,
  AdminKpi,
  AdminPill,
  AdminAvatar,
  AdminNumCell,
} from "@/components/admin";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  AlertCircle,
  Lock,
  Unlock,
  Activity,
  RefreshCw,
  CheckCircle2,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";
import { getAuthBaseUrl } from "@/lib/api-config";

interface LockedAccount {
  id: string;
  email: string;
  username: string;
  lockedUntil: string;
  failedAttempts: number;
}

interface ActiveSession {
  id: string;
  userId: string;
  email: string;
  username: string;
  deviceInfo: string | null;
  ipAddress: string | null;
  issuedAt: string;
  lastActivityAt: string | null;
}

interface SecurityStats {
  totalActiveSessions: number;
  lockedAccounts: number;
  failedLoginsToday: number;
  failedLoginsWeek: number;
}

function useSecurityData() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();

  return useQuery({
    queryKey: ["admin-security"],
    queryFn: async () => {
      const lockedResponse = await fetch(`${baseUrl}/api/admin/security/locked-accounts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const sessionsResponse = await fetch(`${baseUrl}/api/admin/security/active-sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const statsResponse = await fetch(`${baseUrl}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const locked = lockedResponse.ok ? await lockedResponse.json() : { accounts: [] };
      const sessions = sessionsResponse.ok ? await sessionsResponse.json() : { sessions: [] };
      const stats = statsResponse.ok ? await statsResponse.json() : null;

      return {
        lockedAccounts: locked.accounts as LockedAccount[],
        activeSessions: sessions.sessions as ActiveSession[],
        stats: {
          totalActiveSessions: sessions.sessions?.length || 0,
          lockedAccounts: locked.accounts?.length || 0,
          failedLoginsToday: stats?.activity?.failedLoginsToday || 0,
          failedLoginsWeek: 0,
        } as SecurityStats,
      };
    },
    enabled: !!token,
    staleTime: 30 * 1000,
  });
}

function useUnlockAccount() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(`${baseUrl}/api/admin/users/${userId}/unlock`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to unlock account");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-security"] });
      toast.success("Account unlocked");
    },
    onError: (error: any) => toast.error(error.message),
  });
}

function useRevokeAllSessions() {
  const { token } = useAuth();
  const baseUrl = getAuthBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(`${baseUrl}/api/admin/users/${userId}/sessions`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to revoke sessions");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-security"] });
      toast.success(`Revoked ${data.sessionsRevoked} session(s)`);
    },
    onError: (error: any) => toast.error(error.message),
  });
}

function LockedAccountsPanel({
  accounts,
  onUnlock,
  isUnlocking,
}: {
  accounts: LockedAccount[];
  onUnlock: (userId: string) => void;
  isUnlocking: boolean;
}) {
  return (
    <AdminPanel
      title="Locked accounts"
      description="Auto-locked after 5 failed attempts. 30-minute lockout window."
      flush
    >
      {accounts.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-positive" />
          <p className="text-sm text-muted-foreground">No locked accounts.</p>
        </div>
      ) : (
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-muted/40">
              <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-left">
                User
              </th>
              <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-right">
                Failed
              </th>
              <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-right">
                Locked until
              </th>
              <th className="px-3 py-2.5 w-24 text-right" />
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id} className="hover:bg-muted/30">
                <td className="px-3 py-3 border-b border-border">
                  <div className="flex items-center gap-3 min-w-0">
                    <AdminAvatar name={account.username || account.email} />
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{account.username || "—"}</p>
                      <p className="text-[11px] text-muted-foreground font-mono truncate">{account.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 border-b border-border text-right">
                  <AdminNumCell tone="negative" className="font-bold">
                    {account.failedAttempts}
                  </AdminNumCell>
                </td>
                <td className="px-3 py-3 border-b border-border text-right">
                  <AdminNumCell tone="muted" className="text-[11px]">
                    {new Date(account.lockedUntil).toLocaleString()}
                  </AdminNumCell>
                </td>
                <td className="px-3 py-3 border-b border-border text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onUnlock(account.id)}
                    disabled={isUnlocking}
                  >
                    <Unlock className="h-3.5 w-3.5 mr-1" />
                    Unlock
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminPanel>
  );
}

function ActiveSessionsPanel({
  sessions,
  onRevoke,
  isRevoking,
}: {
  sessions: ActiveSession[];
  onRevoke: (userId: string) => void;
  isRevoking: boolean;
}) {
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; userId: string; username: string }>({
    open: false,
    userId: "",
    username: "",
  });

  const sessionsByUser = sessions.reduce(
    (acc, session) => {
      if (!acc[session.userId]) {
        acc[session.userId] = { email: session.email, username: session.username, sessions: [] };
      }
      acc[session.userId].sessions.push(session);
      return acc;
    },
    {} as Record<string, { email: string; username: string; sessions: ActiveSession[] }>,
  );

  const handleRevoke = () => {
    onRevoke(confirmDialog.userId);
    setConfirmDialog({ open: false, userId: "", username: "" });
  };

  const userIds = Object.entries(sessionsByUser).slice(0, 10);

  return (
    <>
      <AdminPanel
        title="Active sessions"
        description={`${Object.keys(sessionsByUser).length} users with live JWTs · showing top 10 by session count`}
        flush
      >
        {sessions.length === 0 ? (
          <div className="text-center py-12">
            <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No active sessions.</p>
          </div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-muted/40">
                <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-left">
                  User
                </th>
                <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-right">
                  Sessions
                </th>
                <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground text-right">
                  Last activity
                </th>
                <th className="px-3 py-2.5 w-32 text-right" />
              </tr>
            </thead>
            <tbody>
              {userIds.map(([userId, data]) => (
                <tr key={userId} className="hover:bg-muted/30">
                  <td className="px-3 py-3 border-b border-border">
                    <div className="flex items-center gap-3 min-w-0">
                      <AdminAvatar name={data.username || data.email} />
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{data.username || "—"}</p>
                        <p className="text-[11px] text-muted-foreground font-mono truncate">{data.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 border-b border-border text-right">
                    <AdminNumCell className="font-bold">{data.sessions.length}</AdminNumCell>
                  </td>
                  <td className="px-3 py-3 border-b border-border text-right">
                    <AdminNumCell tone="muted" className="text-[11px]">
                      {data.sessions[0]?.lastActivityAt
                        ? new Date(data.sessions[0].lastActivityAt).toLocaleString()
                        : "Unknown"}
                    </AdminNumCell>
                  </td>
                  <td className="px-3 py-3 border-b border-border text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setConfirmDialog({ open: true, userId, username: data.username || data.email })
                      }
                    >
                      <LogOut className="h-3.5 w-3.5 mr-1" />
                      Revoke all
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AdminPanel>

      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) =>
          !open && setConfirmDialog({ open: false, userId: "", username: "" })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke all sessions?</DialogTitle>
            <DialogDescription>
              This will log out {confirmDialog.username} from all devices. They will need to log in again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialog({ open: false, userId: "", username: "" })}
            >
              Cancel
            </Button>
            <Button onClick={handleRevoke} disabled={isRevoking}>
              Revoke sessions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SecurityPoliciesPanel() {
  return (
    <AdminPanel
      title="Security policies"
      description="Current platform-wide security configuration."
    >
      <div className="space-y-1">
        {[
          { label: "Account lockout", desc: "Lock after failed attempts", value: "5 attempts" },
          { label: "Lockout duration", desc: "Time until auto-unlock", value: "30 minutes" },
          { label: "Access token TTL", desc: "Session timeout", value: "6 hours" },
          { label: "Refresh token TTL", desc: "Maximum session length", value: "7 days" },
          { label: "Password hashing", desc: "Algorithm & strength", value: "bcrypt (12 rounds)", positive: true },
        ].map((p) => (
          <div
            key={p.label}
            className="flex items-center justify-between py-3 border-b border-border last:border-0"
          >
            <div>
              <p className="text-sm font-semibold">{p.label}</p>
              <p className="text-[11.5px] text-muted-foreground">{p.desc}</p>
            </div>
            <AdminPill tone={p.positive ? "positive" : "muted"}>{p.value}</AdminPill>
          </div>
        ))}
      </div>
    </AdminPanel>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-[88px] w-full" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-[300px]" />
        <Skeleton className="h-[300px]" />
      </div>
    </div>
  );
}

export default function AdminSecurity() {
  const { data, isLoading, error, refetch } = useSecurityData();
  const unlockAccount = useUnlockAccount();
  const revokeAllSessions = useRevokeAllSessions();

  return (
    <AdminLayout
      requiredRole="super_admin"
      eyebrow="Admin · Security"
      title="Security"
      description="Monitor locked accounts, active sessions, and platform security events. Super-admin only."
      rightSlot={
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/40 bg-destructive/5 text-destructive">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">Failed to load security data: {(error as Error).message}</p>
          </div>
        )}

        {isLoading ? (
          <LoadingState />
        ) : data ? (
          <>
            <AdminKpiStrip cols={4}>
              <AdminKpi label="Active sessions" value={data.stats.totalActiveSessions} accent="navy" />
              <AdminKpi
                label="Locked accounts"
                value={data.stats.lockedAccounts}
                tone={data.stats.lockedAccounts > 0 ? "negative" : "positive"}
                delta={data.stats.lockedAccounts > 0 ? "needs review" : "all clear"}
              />
              <AdminKpi
                label="Failed logins · today"
                value={data.stats.failedLoginsToday}
                tone={data.stats.failedLoginsToday > 10 ? "negative" : "positive"}
              />
              <AdminKpi
                label="Posture"
                value={
                  <span className="inline-flex items-center gap-1.5 text-[hsl(var(--positive))]">
                    <Shield className="w-5 h-5" />
                    Normal
                  </span>
                }
              />
            </AdminKpiStrip>

            <div className="grid gap-4 lg:grid-cols-2">
              <LockedAccountsPanel
                accounts={data.lockedAccounts}
                onUnlock={(userId) => unlockAccount.mutate(userId)}
                isUnlocking={unlockAccount.isPending}
              />
              <SecurityPoliciesPanel />
            </div>

            <ActiveSessionsPanel
              sessions={data.activeSessions}
              onRevoke={(userId) => revokeAllSessions.mutate(userId)}
              isRevoking={revokeAllSessions.isPending}
            />
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
}
