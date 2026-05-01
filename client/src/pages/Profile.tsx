import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { SEO } from "@/components/SEO";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CoinsTab } from "@/components/profile/CoinsTab";
import { useAuth } from "@/hooks/useAuth";
import {
  useSubscriptionStatus,
  useCancelSubscription,
  useDowngradeSubscription,
} from "@/hooks/use-subscription";
import { useSessions, useRevokeSession, useRevokeAllSessions, parseDeviceInfo } from "@/hooks/use-sessions";
import { useSendVerification, useVerifyEmail } from "@/hooks/use-email-verification";
import { useUsageLimits, getUsagePercentage, getTimeUntilReset } from "@/hooks/use-usage-limits";
import { useRequestDeletion, useDeleteAccount, useExportData, downloadExportAsFile } from "@/hooks/use-account";
import { useOAuthLinking } from "@/hooks/use-oauth-linking";
import { useUpdatePhone, useHasPassword } from "@/hooks/use-profile-update";
import { useLocation, Link } from "wouter";
import {
  User,
  Mail,
  Shield,
  LogOut,
  Crown,
  Clock,
  AlertTriangle,
  Loader2,
  Monitor,
  Smartphone,
  Tablet,
  CheckCircle2,
  XCircle,
  Trash2,
  Download,
  Activity,
  Key,
  MailCheck,
  Link2,
  Unlink,
  Phone,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export default function Profile() {
  const { user, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();
  // Seed initial tab from ?tab= query param so links like /profile?tab=coins land on the right tab
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window === "undefined") return "account";
    const tab = new URLSearchParams(window.location.search).get("tab");
    const allowed = new Set(["account", "security", "usage", "coins", "danger"]);
    return tab && allowed.has(tab) ? tab : "account";
  });

  // Verification state
  const [showVerification, setShowVerification] = useState(false);
  const [verificationOtp, setVerificationOtp] = useState<string[]>(Array(6).fill(""));
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const verificationRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Deletion state
  const [showDeletion, setShowDeletion] = useState(false);
  const [deletionOtp, setDeletionOtp] = useState<string[]>(Array(6).fill(""));
  const [deletionMessage, setDeletionMessage] = useState<string | null>(null);
  const deletionRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Subscription hooks
  const {
    subscription,
    isPremium,
    isTrialing,
    isActive,
    isCancelled,
    canStartTrial,
    willExpire,
    trialEndsAt,
    subscriptionEndsAt,
    isLoading: subscriptionLoading,
  } = useSubscriptionStatus();

  const cancelMutation = useCancelSubscription();
  const downgradeMutation = useDowngradeSubscription();

  // Sessions hooks
  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const revokeSessionMutation = useRevokeSession();
  const revokeAllMutation = useRevokeAllSessions();

  // Verification hooks
  const sendVerificationMutation = useSendVerification();
  const verifyEmailMutation = useVerifyEmail();

  // Usage limits hooks
  const { data: usageLimits, isLoading: limitsLoading } = useUsageLimits();

  // Account hooks
  const requestDeletionMutation = useRequestDeletion();
  const deleteAccountMutation = useDeleteAccount();
  const exportDataMutation = useExportData();

  // OAuth linking hooks
  const {
    isGoogleAvailable,
    isGoogleLinked,
    linkGoogle,
    unlinkGoogle,
    isUnlinking,
    isLoading: oauthLoading,
  } = useOAuthLinking();

  // Phone editing state
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState(user?.phoneNumber || "");
  const updatePhoneMutation = useUpdatePhone();
  const { data: hasPasswordData } = useHasPassword();

  // Redirect if not authenticated
  if (!isAuthenticated || !user) {
    setLocation("/login");
    return null;
  }

  // Handle OAuth callback messages
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const error = urlParams.get('error');

    if (success === 'google_linked') {
      toast.success("Google account linked successfully!");
      // Remove query params from URL
      window.history.replaceState({}, '', '/profile');
    }

    if (error) {
      const errorMessages: Record<string, string> = {
        oauth_not_configured: "Google OAuth is not configured",
        already_linked: "Google account is already linked",
        invalid_state: "Invalid request. Please try again.",
        token_exchange_failed: "Failed to authenticate with Google",
        failed_to_get_user_info: "Failed to get Google profile",
        link_failed: "Failed to link Google account",
        no_user: "Please log in again to link your account",
        no_token: "Please log in again to link your account",
        invalid_token: "Session expired. Please log in again.",
      };
      toast.error(errorMessages[error] || "An error occurred");
      window.history.replaceState({}, '', '/profile');
    }
  }, []);

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
  };

  const handleCancelSubscription = async () => {
    if (!confirm("Are you sure you want to cancel? You'll retain access until your current period ends.")) {
      return;
    }
    try {
      const result = await cancelMutation.mutateAsync(undefined);
      toast.success(result.message);
    } catch (error: any) {
      toast.error(error.message || "Failed to cancel subscription");
    }
  };

  const handleDowngrade = async () => {
    if (!confirm("Are you sure? You'll lose Premium access immediately.")) {
      return;
    }
    try {
      const result = await downgradeMutation.mutateAsync();
      toast.success(result.message);
    } catch (error: any) {
      toast.error(error.message || "Failed to downgrade");
    }
  };

  // Verification handlers
  const handleSendVerification = async () => {
    try {
      const result = await sendVerificationMutation.mutateAsync();
      setShowVerification(true);
      setVerificationMessage("Verification code sent to your email.");
      requestAnimationFrame(() => verificationRefs.current[0]?.focus());
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleVerifyEmail = async () => {
    const otp = verificationOtp.join("");
    if (otp.length !== 6) {
      toast.error("Please enter the 6-digit code");
      return;
    }

    try {
      await verifyEmailMutation.mutateAsync(otp);
      toast.success("Email verified successfully!");
      setShowVerification(false);
      setVerificationOtp(Array(6).fill(""));
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // Deletion handlers
  const handleRequestDeletion = async () => {
    try {
      const result = await requestDeletionMutation.mutateAsync();
      setShowDeletion(true);
      setDeletionMessage("Confirmation code sent to your email.");
      requestAnimationFrame(() => deletionRefs.current[0]?.focus());
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDeleteAccount = async () => {
    const otp = deletionOtp.join("");
    if (otp.length !== 6) {
      toast.error("Please enter the 6-digit confirmation code");
      return;
    }

    try {
      await deleteAccountMutation.mutateAsync(otp);
      toast.success("Account deleted successfully");
      await logout();
      setLocation("/");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleExportData = async () => {
    try {
      const data = await exportDataMutation.mutateAsync();
      downloadExportAsFile(data);
      toast.success("Data exported successfully");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // OTP input handlers
  const createOtpHandlers = (
    otp: string[],
    setOtp: React.Dispatch<React.SetStateAction<string[]>>,
    refs: React.MutableRefObject<Array<HTMLInputElement | null>>
  ) => ({
    onChange: (index: number) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value.replace(/\D/g, "");
      if (!value) {
        setOtp((prev) => {
          const next = [...prev];
          next[index] = "";
          return next;
        });
        return;
      }
      setOtp((prev) => {
        const next = [...prev];
        next[index] = value.slice(-1);
        return next;
      });
      if (index < refs.current.length - 1) {
        refs.current[index + 1]?.focus();
      }
    },
    onKeyDown: (index: number) => (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Backspace" && !otp[index] && index > 0) {
        refs.current[index - 1]?.focus();
      }
    },
    onPaste: (event: React.ClipboardEvent<HTMLInputElement>) => {
      const digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
      if (!digits) return;
      event.preventDefault();
      const next = Array(6).fill("").map((_, idx) => digits[idx] ?? "");
      setOtp(next);
      refs.current[Math.min(digits.length, 5)]?.focus();
    },
  });

  const verificationHandlers = createOtpHandlers(verificationOtp, setVerificationOtp, verificationRefs);
  const deletionHandlers = createOtpHandlers(deletionOtp, setDeletionOtp, deletionRefs);

  // Session handlers
  const handleRevokeSession = async (sessionId: string) => {
    try {
      await revokeSessionMutation.mutateAsync(sessionId);
      toast.success("Session revoked");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleRevokeAllSessions = async () => {
    try {
      const result = await revokeAllMutation.mutateAsync();
      toast.success(`Revoked ${result.sessionsRevoked} session(s)`);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // OAuth linking handlers
  const handleLinkGoogle = () => {
    linkGoogle();
  };

  const handleUnlinkGoogle = async () => {
    try {
      unlinkGoogle();
      toast.success("Google account unlinked successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to unlink Google account");
    }
  };

  // Phone update handler
  const handleUpdatePhone = async () => {
    if (!phoneInput.trim()) {
      toast.error("Phone number is required");
      return;
    }

    const normalizedPhone = phoneInput.replace(/[\s\-\(\)]/g, '');
    const phoneRegex = /^\+?[1-9]\d{6,14}$/;
    if (!phoneRegex.test(normalizedPhone)) {
      toast.error("Enter a valid phone number (e.g., +919876543210)");
      return;
    }

    try {
      await updatePhoneMutation.mutateAsync(normalizedPhone);
      toast.success("Phone number updated successfully");
      setEditingPhone(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to update phone number");
    }
  };

  // Format date for display
  const formatDate = (date: Date | null) => {
    if (!date) return "N/A";
    return date.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Calculate days remaining
  const getDaysRemaining = (date: Date | null) => {
    if (!date) return 0;
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  // Device icon helper
  const getDeviceIcon = (device: string) => {
    switch (device) {
      case "Mobile": return <Smartphone className="h-4 w-4" />;
      case "Tablet": return <Tablet className="h-4 w-4" />;
      default: return <Monitor className="h-4 w-4" />;
    }
  };

  return (
    <>
      <SEO
        title="Profile - Equity Pro"
        description="Manage your Equity Pro account settings, subscription, and security preferences."
        noIndex={true}
      />
      <div className="min-h-screen bg-background">
        <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-8">

          {/* Profile Header */}
          <div className="flex items-center gap-6">
          <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name || user.username || 'Profile'}
                className="h-24 w-24 rounded-full object-cover"
              />
            ) : (
              <User className="h-12 w-12 text-primary" />
            )}
          </div>
          <div>
            <h1 className="text-3xl font-bold">{user.name || user.username}</h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-2">
              {user.email}
              {user.emailVerified ? (
                <Badge variant="outline" className="text-positive border-positive">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Verified
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  <XCircle className="h-3 w-3 mr-1" />
                  Unverified
                </Badge>
              )}
            </p>
            <div className="mt-2 flex items-center gap-2">
              {isPremium ? (
                <Badge className="bg-primary">
                  <Crown className="h-3 w-3 mr-1" />
                  Premium
                </Badge>
              ) : (
                <Badge variant="secondary">Basic</Badge>
              )}
              {isTrialing && (
                <Badge variant="outline">
                  <Clock className="h-3 w-3 mr-1" />
                  Trial
                </Badge>
              )}
              {willExpire && (
                <Badge variant="destructive">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Cancelling
                </Badge>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
            <TabsTrigger value="coins">Coins</TabsTrigger>
            <TabsTrigger value="danger">Danger Zone</TabsTrigger>
          </TabsList>

          {/* Account Tab */}
          <TabsContent value="account" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Account Details Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Account Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Username</p>
                    <p className="font-medium">{user.username}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Name</p>
                    <p className="font-medium">{user.name || "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Sign-in Method</p>
                    <p className="font-medium">
                      {user.provider === 'google' ? 'Google OAuth' : 'Email & Password'}
                    </p>
                  </div>

                  {/* Phone Number */}
                  <div>
                    <p className="text-sm text-muted-foreground">Phone Number</p>
                    {editingPhone ? (
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          type="tel"
                          value={phoneInput}
                          onChange={(e) => setPhoneInput(e.target.value)}
                          placeholder="+91 9876543210"
                          className="flex-1"
                        />
                        <Button
                          size="sm"
                          onClick={handleUpdatePhone}
                          disabled={updatePhoneMutation.isPending}
                        >
                          {updatePhoneMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Save"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingPhone(false);
                            setPhoneInput(user.phoneNumber || "");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="font-medium flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          {user.phoneNumber || "Not set"}
                          {user.phoneNumber && (
                            user.phoneVerified ? (
                              <Badge variant="outline" className="text-positive border-positive text-xs">
                                Verified
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground text-xs">
                                Unverified
                              </Badge>
                            )
                          )}
                        </p>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setPhoneInput(user.phoneNumber || "");
                            setEditingPhone(true);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Password Button - Different for OAuth vs Password users */}
                  {hasPasswordData?.hasPassword ? (
                    <Link href="/forgot-password">
                      <Button variant="outline" size="sm">
                        <Key className="h-4 w-4 mr-2" />
                        Change Password
                      </Button>
                    </Link>
                  ) : (
                    <Link href="/forgot-password">
                      <Button variant="outline" size="sm">
                        <Key className="h-4 w-4 mr-2" />
                        Set Password
                      </Button>
                    </Link>
                  )}
                </CardContent>
              </Card>

              {/* Email Verification Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MailCheck className="h-5 w-5" />
                    Email Verification
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      {user.email}
                    </p>
                  </div>

                  {user.emailVerified ? (
                    <div className="p-3 rounded-lg bg-positive/10 border border-positive/20">
                      <p className="text-sm text-positive flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Your email is verified
                      </p>
                    </div>
                  ) : showVerification ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Enter verification code</p>
                        <div className="flex gap-2">
                          {verificationOtp.map((value, index) => (
                            <Input
                              key={index}
                              type="text"
                              inputMode="numeric"
                              maxLength={1}
                              value={value}
                              onChange={verificationHandlers.onChange(index)}
                              onKeyDown={verificationHandlers.onKeyDown(index)}
                              onPaste={index === 0 ? verificationHandlers.onPaste : undefined}
                              ref={(node) => (verificationRefs.current[index] = node)}
                              className="h-10 w-10 text-center"
                            />
                          ))}
                        </div>
                        {verificationMessage && (
                          <p className="text-sm text-muted-foreground">{verificationMessage}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleVerifyEmail}
                          disabled={verifyEmailMutation.isPending}
                        >
                          {verifyEmailMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Verify"
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setShowVerification(false);
                            setVerificationOtp(Array(6).fill(""));
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={handleSendVerification}
                      disabled={sendVerificationMutation.isPending}
                    >
                      {sendVerificationMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Mail className="h-4 w-4 mr-2" />
                          Send Verification Code
                        </>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Subscription Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Subscription
                </CardTitle>
              </CardHeader>
              <CardContent>
                {subscriptionLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="grid md:grid-cols-3 gap-6">
                    <div>
                      <p className="text-sm text-muted-foreground">Current Plan</p>
                      <p className="font-medium text-lg flex items-center gap-2">
                        {isPremium ? (
                          <>
                            <Crown className="h-4 w-4 text-primary" />
                            {subscription?.plan?.name || "Premium"}
                          </>
                        ) : (
                          "Basic (Free)"
                        )}
                      </p>
                    </div>

                    {isTrialing && trialEndsAt && (
                      <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                        <p className="text-sm font-medium text-primary">Trial Active</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {getDaysRemaining(trialEndsAt)} days remaining
                        </p>
                      </div>
                    )}

                    {isActive && !isTrialing && subscriptionEndsAt && (
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {willExpire ? "Access Until" : "Renews On"}
                        </p>
                        <p className="font-medium">{formatDate(subscriptionEndsAt)}</p>
                      </div>
                    )}

                    {isPremium && !willExpire && (
                      <div className="flex items-center">
                        <p className="text-sm text-positive">
                          ✓ All premium features unlocked
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6 mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Monitor className="h-5 w-5" />
                    Active Sessions
                  </CardTitle>
                  <CardDescription>
                    Manage devices where you're logged in
                  </CardDescription>
                </div>
                {sessions && sessions.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRevokeAllSessions}
                    disabled={revokeAllMutation.isPending}
                  >
                    {revokeAllMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Sign out all other devices"
                    )}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {sessionsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : sessions && sessions.length > 0 ? (
                  <div className="space-y-4">
                    {sessions.map((session) => {
                      const { browser, os, device } = parseDeviceInfo(session.deviceInfo);
                      return (
                        <div
                          key={session.id}
                          className="flex items-center justify-between p-4 rounded-lg border"
                        >
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                              {getDeviceIcon(device)}
                            </div>
                            <div>
                              <p className="font-medium flex items-center gap-2">
                                {browser} on {os}
                                {session.isCurrent && (
                                  <Badge variant="secondary" className="text-xs">
                                    This device
                                  </Badge>
                                )}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {session.ipAddress || "Unknown IP"}
                                {session.location && ` • ${session.location}`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {session.lastActivityAt
                                  ? `Last active ${formatDistanceToNow(new Date(session.lastActivityAt), { addSuffix: true })}`
                                  : `Signed in ${formatDistanceToNow(new Date(session.issuedAt), { addSuffix: true })}`}
                              </p>
                            </div>
                          </div>
                          {!session.isCurrent && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRevokeSession(session.id)}
                              disabled={revokeSessionMutation.isPending}
                            >
                              Sign out
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No active sessions found</p>
                )}
              </CardContent>
            </Card>

            {/* Connected Accounts Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link2 className="h-5 w-5" />
                  Connected Accounts
                </CardTitle>
                <CardDescription>
                  Link external accounts for easier sign-in
                </CardDescription>
              </CardHeader>
              <CardContent>
                {oauthLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Google Account */}
                    <div className="flex items-center justify-between p-4 rounded-lg border">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                          <svg className="h-5 w-5" viewBox="0 0 24 24">
                            <path
                              fill="#4285F4"
                              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            />
                            <path
                              fill="#34A853"
                              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                              fill="#FBBC05"
                              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            />
                            <path
                              fill="#EA4335"
                              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium">Google</p>
                          <p className="text-sm text-muted-foreground">
                            {isGoogleLinked
                              ? "Connected"
                              : isGoogleAvailable
                              ? "Not connected"
                              : "Not available"}
                          </p>
                        </div>
                      </div>
                      <div>
                        {isGoogleLinked ? (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isUnlinking || user.provider === 'google'}
                              >
                                {isUnlinking ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Unlink className="h-4 w-4 mr-2" />
                                    Unlink
                                  </>
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Unlink Google Account?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  You won't be able to sign in with Google after unlinking.
                                  {user.provider === 'google' && (
                                    <p className="mt-2 text-destructive font-medium">
                                      You signed up with Google. Please set a password before unlinking.
                                    </p>
                                  )}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={handleUnlinkGoogle}
                                  disabled={user.provider === 'google'}
                                >
                                  Unlink
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : isGoogleAvailable ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleLinkGoogle}
                          >
                            <Link2 className="h-4 w-4 mr-2" />
                            Link
                          </Button>
                        ) : (
                          <Badge variant="secondary">Unavailable</Badge>
                        )}
                      </div>
                    </div>

                    {user.provider === 'google' && isGoogleLinked && (
                      <p className="text-sm text-muted-foreground">
                        You signed up with Google. To unlink, you must first set a password in your account settings.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Usage Tab */}
          <TabsContent value="usage" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Usage Limits
                </CardTitle>
                <CardDescription>
                  Your current usage for rate-limited features
                </CardDescription>
              </CardHeader>
              <CardContent>
                {limitsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : usageLimits ? (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Tier: <Badge variant="outline">{usageLimits.tier}</Badge></span>
                      <span>Resets in {getTimeUntilReset(usageLimits.resetsAt)}</span>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Expert Screener</span>
                          <span>
                            {usageLimits.usage.screenerRuns} / {usageLimits.limits.screenerRunsPerHour}
                          </span>
                        </div>
                        <Progress
                          value={getUsagePercentage(usageLimits.usage.screenerRuns, usageLimits.limits.screenerRunsPerHour)}
                          className="h-2"
                        />
                        <p className="text-xs text-muted-foreground">
                          {usageLimits.remaining.screenerRuns} runs remaining
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Strategy Backtest</span>
                          <span>
                            {usageLimits.usage.backtestRuns} / {usageLimits.limits.backtestRunsPerHour}
                          </span>
                        </div>
                        <Progress
                          value={getUsagePercentage(usageLimits.usage.backtestRuns, usageLimits.limits.backtestRunsPerHour)}
                          className="h-2"
                        />
                        <p className="text-xs text-muted-foreground">
                          {usageLimits.remaining.backtestRuns} runs remaining
                        </p>
                      </div>

                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">Failed to load usage limits</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Coins Tab */}
          <TabsContent value="coins" className="space-y-6 mt-6">
            <CoinsTab />
          </TabsContent>

          {/* Danger Zone Tab */}
          <TabsContent value="danger" className="space-y-6 mt-6">
            {/* Export Data Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Export Your Data
                </CardTitle>
                <CardDescription>
                  Download a copy of all your data (GDPR compliance)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  onClick={handleExportData}
                  disabled={exportDataMutation.isPending}
                >
                  {exportDataMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Download My Data
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Delete Account Card */}
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <Trash2 className="h-5 w-5" />
                  Delete Account
                </CardTitle>
                <CardDescription>
                  Permanently delete your account and all associated data. This action cannot be undone.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {showDeletion ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                      <p className="text-sm text-destructive font-medium">
                        Enter the 6-digit confirmation code sent to your email
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        {deletionOtp.map((value, index) => (
                          <Input
                            key={index}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={value}
                            onChange={deletionHandlers.onChange(index)}
                            onKeyDown={deletionHandlers.onKeyDown(index)}
                            onPaste={index === 0 ? deletionHandlers.onPaste : undefined}
                            ref={(node) => (deletionRefs.current[index] = node)}
                            className="h-10 w-10 text-center"
                          />
                        ))}
                      </div>
                      {deletionMessage && (
                        <p className="text-sm text-muted-foreground">{deletionMessage}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="destructive"
                            disabled={deletionOtp.join("").length !== 6 || deleteAccountMutation.isPending}
                          >
                            {deleteAccountMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Delete My Account"
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete your account, including:
                              <ul className="list-disc list-inside mt-2 space-y-1">
                                <li>Your profile and settings</li>
                                <li>Saved screener and backtest results</li>
                                <li>Portfolio and watchlist data</li>
                                <li>All session and authentication data</li>
                              </ul>
                              <p className="mt-2 font-medium text-destructive">
                                This action cannot be undone.
                              </p>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleDeleteAccount}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Yes, delete my account
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowDeletion(false);
                          setDeletionOtp(Array(6).fill(""));
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="destructive"
                    onClick={handleRequestDeletion}
                    disabled={requestDeletionMutation.isPending}
                  >
                    {requestDeletionMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Sending code...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Request Account Deletion
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Sign Out Card */}
            <Card>
              <CardContent className="pt-6">
                <Button
                  variant="outline"
                  className="w-full md:w-auto"
                  onClick={handleLogout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        </div>
      </div>
    </>
  );
}
