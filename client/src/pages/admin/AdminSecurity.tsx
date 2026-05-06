import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminLayout } from "@/components/admin";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  AlertCircle,
  Lock,
  Unlock,
  Users,
  Activity,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
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
      // Fetch locked accounts
      const lockedResponse = await fetch(`${baseUrl}/api/admin/security/locked-accounts`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Fetch active sessions
      const sessionsResponse = await fetch(`${baseUrl}/api/admin/security/active-sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Fetch stats
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

      if (!response.ok) {
        throw new Error("Failed to unlock account");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-security"] });
      toast.success("Account unlocked successfully");
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
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

      if (!response.ok) {
        throw new Error("Failed to revoke sessions");
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-security"] });
      toast.success(`Revoked ${data.sessionsRevoked} session(s)`);
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });
}

function SecurityStatsCards({ stats }: { stats: SecurityStats }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Sessions</p>
              <p className="text-3xl font-bold mt-1">{stats.totalActiveSessions}</p>
            </div>
            <div className="p-3 rounded-full bg-blue-500/10">
              <Activity className="h-6 w-6 text-blue-500" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Locked Accounts</p>
              <p className="text-3xl font-bold mt-1">{stats.lockedAccounts}</p>
            </div>
            <div className={`p-3 rounded-full ${stats.lockedAccounts > 0 ? "bg-destructive/10" : "bg-positive/10"}`}>
              <Lock className={`h-6 w-6 ${stats.lockedAccounts > 0 ? "text-destructive" : "text-positive"}`} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Failed Logins Today</p>
              <p className="text-3xl font-bold mt-1">{stats.failedLoginsToday}</p>
            </div>
            <div className={`p-3 rounded-full ${stats.failedLoginsToday > 10 ? "bg-yellow-500/10" : "bg-muted"}`}>
              <AlertTriangle className={`h-6 w-6 ${stats.failedLoginsToday > 10 ? "text-yellow-500" : "text-muted-foreground"}`} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Security Status</p>
              <p className="text-lg font-bold mt-1 text-positive">Normal</p>
            </div>
            <div className="p-3 rounded-full bg-positive/10">
              <CheckCircle2 className="h-6 w-6 text-positive" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LockedAccountsCard({
  accounts,
  onUnlock,
  isUnlocking,
}: {
  accounts: LockedAccount[];
  onUnlock: (userId: string) => void;
  isUnlocking: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-destructive" />
          <CardTitle className="text-lg">Locked Accounts</CardTitle>
        </div>
        <CardDescription>
          Accounts locked due to failed login attempts
        </CardDescription>
      </CardHeader>
      <CardContent>
        {accounts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-positive" />
            <p>No locked accounts</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Failed Attempts</TableHead>
                <TableHead>Locked Until</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{account.username}</p>
                      <p className="text-xs text-muted-foreground">{account.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="destructive">{account.failedAttempts}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(account.lockedUntil).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onUnlock(account.id)}
                      disabled={isUnlocking}
                    >
                      <Unlock className="h-4 w-4 mr-1" />
                      Unlock
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ActiveSessionsCard({
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

  // Group sessions by user
  const sessionsByUser = sessions.reduce((acc, session) => {
    if (!acc[session.userId]) {
      acc[session.userId] = {
        email: session.email,
        username: session.username,
        sessions: [],
      };
    }
    acc[session.userId].sessions.push(session);
    return acc;
  }, {} as Record<string, { email: string; username: string; sessions: ActiveSession[] }>);

  const handleRevoke = () => {
    onRevoke(confirmDialog.userId);
    setConfirmDialog({ open: false, userId: "", username: "" });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Active Sessions</CardTitle>
          </div>
          <CardDescription>
            Currently active user sessions across the platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-8 w-8 mx-auto mb-2" />
              <p>No active sessions</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(sessionsByUser).slice(0, 10).map(([userId, data]) => (
                  <TableRow key={userId}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{data.username}</p>
                        <p className="text-xs text-muted-foreground">{data.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{data.sessions.length}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {data.sessions[0]?.lastActivityAt
                        ? new Date(data.sessions[0].lastActivityAt).toLocaleString()
                        : "Unknown"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmDialog({ open: true, userId, username: data.username })}
                      >
                        <LogOut className="h-4 w-4 mr-1" />
                        Revoke All
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {Object.keys(sessionsByUser).length > 10 && (
            <p className="text-sm text-muted-foreground text-center mt-4">
              Showing 10 of {Object.keys(sessionsByUser).length} users with active sessions
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog({ open: false, userId: "", username: "" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke All Sessions?</DialogTitle>
            <DialogDescription>
              This will log out {confirmDialog.username} from all devices. They will need to log in again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog({ open: false, userId: "", username: "" })}>
              Cancel
            </Button>
            <Button onClick={handleRevoke} disabled={isRevoking}>
              Revoke Sessions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SecurityPoliciesCard() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Security Policies</CardTitle>
        </div>
        <CardDescription>Current security configuration</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between py-2 border-b">
          <div>
            <p className="font-medium text-sm">Account Lockout</p>
            <p className="text-xs text-muted-foreground">Lock after failed attempts</p>
          </div>
          <Badge variant="secondary">5 attempts</Badge>
        </div>
        <div className="flex items-center justify-between py-2 border-b">
          <div>
            <p className="font-medium text-sm">Lockout Duration</p>
            <p className="text-xs text-muted-foreground">Time until auto-unlock</p>
          </div>
          <Badge variant="secondary">30 minutes</Badge>
        </div>
        <div className="flex items-center justify-between py-2 border-b">
          <div>
            <p className="font-medium text-sm">Session Timeout</p>
            <p className="text-xs text-muted-foreground">Access token expiry</p>
          </div>
          <Badge variant="secondary">6 hours</Badge>
        </div>
        <div className="flex items-center justify-between py-2 border-b">
          <div>
            <p className="font-medium text-sm">Refresh Token</p>
            <p className="text-xs text-muted-foreground">Maximum session length</p>
          </div>
          <Badge variant="secondary">7 days</Badge>
        </div>
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="font-medium text-sm">Password Hashing</p>
            <p className="text-xs text-muted-foreground">Algorithm & strength</p>
          </div>
          <Badge variant="outline" className="border-positive text-positive">bcrypt (12 rounds)</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
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
      description="Monitor locked accounts, active sessions, and platform security events."
      rightSlot={
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      }
    >
      <div className="space-y-6">

        {error && (
          <Card className="border-destructive">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <p className="text-destructive">Failed to load security data: {(error as Error).message}</p>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <LoadingSkeleton />
        ) : data ? (
          <>
            <SecurityStatsCards stats={data.stats} />

            <div className="grid gap-6 md:grid-cols-2">
              <LockedAccountsCard
                accounts={data.lockedAccounts}
                onUnlock={(userId) => unlockAccount.mutate(userId)}
                isUnlocking={unlockAccount.isPending}
              />
              <SecurityPoliciesCard />
            </div>

            <ActiveSessionsCard
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
