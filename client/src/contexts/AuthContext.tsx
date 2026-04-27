import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AuthSession,
  AuthUser,
  clearStoredSession,
  getAuthBaseUrl,
  persistSession,
  readStoredSession,
} from "@/lib/auth";
import {
  initializeAuthFetchInterceptor,
  updateAuthFetchToken,
} from "@/lib/auth-fetch";

type LoginPayload = {
  identifier: string;
  password: string;
};

export type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  status: "idle" | "loading";
  error: string | null;
  loginWithCredentials: (payload: LoginPayload) => Promise<AuthSession>;
  startGoogleLogin: () => void;
  completeOAuthLogin: (session: AuthSession | Record<string, unknown>) => void;
  completeOAuthSignup: (data: {
    tempToken: string;
    username: string;
    tier: string;
    countryOfResidence: string;
    dateOfBirth: string;
    phoneNumber: string;
    termsAccepted: boolean;
  }) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  authBaseUrl: string;
  // For impersonation support
  setToken: (token: string) => void;
  setUser: (user: AuthUser) => void;
  // For refreshing user profile from backend (e.g., after admin changes)
  refreshUserProfile: () => Promise<void>;
};

const storedSession = readStoredSession();
initializeAuthFetchInterceptor(
  storedSession?.token ?? null,
  storedSession?.refreshToken ?? null
);

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);

const unwrapSessionPayload = (raw: any): any => {
  if (!raw || typeof raw !== "object") return raw;
  if ("session" in raw) {
    return raw.session;
  }
  if ("data" in raw && typeof raw.data === "object") {
    if ("session" in raw.data) {
      return raw.data.session;
    }
    return raw.data;
  }
  return raw;
};

const normalizeSession = (maybeRaw: any): AuthSession | null => {
  if (!maybeRaw) return null;
  const raw = unwrapSessionPayload(maybeRaw);
  if (!raw) return null;
  const rawUser = raw.user || raw.profile || raw.account;
  const token =
    raw.token || raw.accessToken || raw.access_token || raw.jwt || raw.idToken;
  if (!token || !rawUser) {
    return null;
  }
  const normalizedUser: AuthUser = {
    id: rawUser.id || rawUser.sub || rawUser.user_id || rawUser.uid || "",
    email:
      rawUser.email ||
      rawUser.mail ||
      rawUser.primaryEmail ||
      rawUser.username ||
      "",
    name: rawUser.name || rawUser.fullName || rawUser.displayName || null,
    avatarUrl: rawUser.avatarUrl || rawUser.picture || rawUser.avatar || null,
    provider: rawUser.provider || raw.provider || rawUser.identity_provider,
    tier:
      rawUser.tier ||
      raw.tier ||
      undefined ||
      "free",
    emailVerified: rawUser.emailVerified ?? rawUser.email_verified ?? false,
    // Role for admin access (must persist across page refresh)
    role: rawUser.role || raw.role || undefined,
    // Phone fields
    phoneNumber: rawUser.phoneNumber || rawUser.phone_number || null,
    phoneVerified: rawUser.phoneVerified ?? rawUser.phone_verified ?? false,
    // Optional subscription fields (if returned by backend)
    subscriptionStatus: rawUser.subscriptionStatus || rawUser.subscription_status,
    subscriptionPlanId: rawUser.subscriptionPlanId || rawUser.subscription_plan_id,
    trialEnd: rawUser.trialEnd || rawUser.trial_end,
    hadTrial: rawUser.hadTrial ?? rawUser.had_trial,
  };
  if (!normalizedUser.id) {
    normalizedUser.id = normalizedUser.email || crypto.randomUUID();
  }
  if (!normalizedUser.email) {
    normalizedUser.email = `${normalizedUser.id || "user"}@unknown`;
  }

  return {
    token,
    refreshToken:
      raw.refreshToken || raw.refresh_token || rawUser.refreshToken || null,
    expiresAt: raw.expiresAt || raw.expires_at || null,
    issuedAt: raw.issuedAt || raw.issued_at || null,
    user: normalizedUser,
  };
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(storedSession);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState<string | null>(null);
  const authBaseUrl = getAuthBaseUrl();

  const applySession = useCallback((next: AuthSession) => {
    if (!next.user.tier) {
      next.user.tier = "free";
    }
    persistSession(next);
    updateAuthFetchToken(next.token, next.refreshToken);
    setSession(next);
    setError(null);
  }, []);

  const loginWithCredentials = useCallback(
    async ({ identifier, password }: LoginPayload) => {
      setStatus("loading");
      setError(null);
      try {
        const response = await fetch(`${authBaseUrl}/auth/v2/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ identifier, password }),
        });

        const rawPayload = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            rawPayload?.message || rawPayload?.error || "Invalid credentials.";
          throw new Error(message);
        }

        const normalized = normalizeSession(rawPayload);
        if (!normalized) {
          throw new Error("Auth server returned an unexpected response.");
        }
        applySession(normalized);
        return normalized;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to complete login. Please try again.";
        setError(message);
        throw err;
      } finally {
        setStatus("idle");
      }
    },
    [applySession, authBaseUrl],
  );

  const startGoogleLogin = useCallback(() => {
    if (typeof window === "undefined") return;
    // Use window.location.origin for both redirect and auth URL
    // This ensures OAuth works from any domain (localhost, ngrok, production)
    // nginx routes /auth/* to Node.js regardless of the domain
    const origin = window.location.origin;
    const redirectUri = `${origin}/auth/callback`;
    const googleUrl = new URL(`${origin}/auth/google`);
    googleUrl.searchParams.set("redirect_uri", redirectUri);
    window.location.href = googleUrl.toString();
  }, []);

  const completeOAuthLogin = useCallback(
    (incomingSession: AuthSession | Record<string, unknown>) => {
      const normalized =
        "token" in incomingSession && "user" in incomingSession
          ? (incomingSession as AuthSession)
          : normalizeSession(incomingSession);
      if (!normalized) {
        throw new Error("Unable to parse auth response.");
      }
      if (!normalized.user.tier) {
        normalized.user.tier = "free";
      }
      applySession(normalized);
    },
    [applySession],
  );

  const completeOAuthSignup = useCallback(
    async (data: {
      tempToken: string;
      username: string;
      tier: string;
      countryOfResidence: string;
      dateOfBirth: string;
      phoneNumber: string;
      termsAccepted: boolean;
    }) => {
      setStatus("loading");
      setError(null);
      try {
        const response = await fetch(`${authBaseUrl}/auth/v2/complete-oauth-signup`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });

        const rawPayload = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            rawPayload?.error || rawPayload?.message || "Failed to complete signup.";
          throw new Error(message);
        }

        const normalized = normalizeSession(rawPayload);
        if (!normalized) {
          throw new Error("Auth server returned an unexpected response.");
        }
        applySession(normalized);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to complete signup. Please try again.";
        setError(message);
        throw err;
      } finally {
        setStatus("idle");
      }
    },
    [applySession, authBaseUrl],
  );

  const logout = useCallback(async () => {
    // Call backend to revoke session
    if (session?.token) {
      try {
        await fetch(`${authBaseUrl}/auth/v2/logout`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${session.token}`,
          },
        });
      } catch (error) {
        console.error('[AUTH] Logout error:', error);
        // Continue with local logout even if backend call fails
      }
    }

    clearStoredSession();
    updateAuthFetchToken(null, null);
    setSession(null);
    setError(null);
  }, [authBaseUrl, session?.token]);

  const clearError = useCallback(() => setError(null), []);

  // For impersonation support - allows setting token/user without full session
  const setToken = useCallback((token: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, token };
      persistSession(updated);
      updateAuthFetchToken(token, prev.refreshToken);
      return updated;
    });
  }, []);

  const setUser = useCallback((user: AuthUser) => {
    setSession((prev) => {
      const updated = prev
        ? { ...prev, user }
        : { token: "", refreshToken: null, expiresAt: null, issuedAt: null, user };
      persistSession(updated);
      return updated;
    });
  }, []);

  // Refresh user profile from backend (useful after admin changes)
  const refreshUserProfile = useCallback(async () => {
    if (!session?.token) return;

    try {
      const response = await fetch(`${authBaseUrl}/auth/v2/me`, {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });

      if (!response.ok) {
        console.error('[AUTH] Failed to refresh user profile:', response.status);
        return;
      }

      const userData = await response.json();
      console.log('[AUTH] refreshUserProfile received:', { emailVerified: userData.emailVerified });
      if (userData && session) {
        // Update user in session while preserving other session data
        const updatedUser: AuthUser = {
          ...session.user,
          id: userData.id || session.user.id,
          email: userData.email || session.user.email,
          name: userData.name || session.user.name,
          avatarUrl: userData.avatarUrl || session.user.avatarUrl,
          tier: userData.tier || session.user.tier,
          role: userData.role || session.user.role,
          emailVerified: userData.emailVerified ?? session.user.emailVerified,
          phoneNumber: userData.phoneNumber || session.user.phoneNumber,
          phoneVerified: userData.phoneVerified ?? session.user.phoneVerified,
          subscriptionStatus: userData.subscriptionStatus,
          subscriptionPlanId: userData.subscriptionPlanId,
          trialEnd: userData.trialEnd,
          hadTrial: userData.hadTrial,
        };

        // Check if tier actually changed
        if (updatedUser.tier !== session.user.tier) {
          console.log(`[AUTH] User tier updated: ${session.user.tier} → ${updatedUser.tier}`);
        }

        // Check if emailVerified changed
        if (updatedUser.emailVerified !== session.user.emailVerified) {
          console.log(`[AUTH] Email verified updated: ${session.user.emailVerified} → ${updatedUser.emailVerified}`);
        }

        setUser(updatedUser);
        console.log('[AUTH] setUser called with emailVerified:', updatedUser.emailVerified);
      }
    } catch (error) {
      console.error('[AUTH] Error refreshing user profile:', error);
    }
  }, [authBaseUrl, session, setUser]);

  // Listen for token refreshes from auth-fetch interceptor
  useEffect(() => {
    const handleTokenRefreshed = (event: CustomEvent<AuthSession>) => {
      const newSession = event.detail;
      if (newSession?.token && newSession?.user) {
        console.log('[AUTH] Token refreshed by interceptor, updating context');
        // Normalize and apply the refreshed session
        const normalized = normalizeSession(newSession);
        if (normalized) {
          applySession(normalized);
        }
      }
    };

    const handleRefreshFailed = () => {
      console.log('[AUTH] Token refresh failed, clearing session');
      clearStoredSession();
      updateAuthFetchToken(null, null);
      setSession(null);
    };

    window.addEventListener('auth-token-refreshed', handleTokenRefreshed as EventListener);
    window.addEventListener('auth-refresh-failed', handleRefreshFailed);

    return () => {
      window.removeEventListener('auth-token-refreshed', handleTokenRefreshed as EventListener);
      window.removeEventListener('auth-refresh-failed', handleRefreshFailed);
    };
  }, [applySession]);

  // Auto-refresh user profile for existing sessions that might be missing new fields
  // This ensures existing users get role, phoneNumber, etc. without needing to re-login
  useEffect(() => {
    if (session?.token && session?.user) {
      // Check if session is missing important fields that should come from backend
      const isMissingRole = session.user.role === undefined;

      if (isMissingRole) {
        console.log('[AUTH] Session missing role field, refreshing user profile...');
        refreshUserProfile();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount - refreshUserProfile is stable

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      refreshToken: session?.refreshToken ?? null,
      isAuthenticated: Boolean(session?.token),
      isLoading: status === "loading",
      status,
      error,
      loginWithCredentials,
      startGoogleLogin,
      completeOAuthLogin,
      completeOAuthSignup,
      logout,
      clearError,
      authBaseUrl,
      setToken,
      setUser,
      refreshUserProfile,
    }),
    [
      authBaseUrl,
      clearError,
      completeOAuthLogin,
      completeOAuthSignup,
      error,
      loginWithCredentials,
      logout,
      refreshUserProfile,
      session,
      setToken,
      setUser,
      startGoogleLogin,
      status,
    ],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
