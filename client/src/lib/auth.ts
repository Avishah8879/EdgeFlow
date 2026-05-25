const STORAGE_KEY = "equitypro.auth.session";

export type UserTier = "free" | "semi" | "pro";
export type SubscriptionStatus = "none" | "trialing" | "active" | "cancelled" | "expired";
export type UserRole = "user" | "moderator" | "admin" | "super_admin";

export type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  provider?: string | null;
  tier: UserTier;
  role?: UserRole;
  emailVerified?: boolean;
  // Phone fields
  phoneNumber?: string | null;
  phoneVerified?: boolean;
  // Optional subscription fields (primary source is useSubscriptionStatus hook)
  subscriptionStatus?: SubscriptionStatus;
  subscriptionPlanId?: string | null;
  trialEnd?: string | null;
  hadTrial?: boolean;
};

export type AuthSession = {
  token: string;
  refreshToken?: string | null;
  user: AuthUser;
  expiresAt?: string | null;
  issuedAt?: string | null;
};

const safeWindow = typeof window === "undefined" ? undefined : window;

export const normalizeBaseUrl = (rawUrl?: string) => {
  if (!rawUrl) return "";
  return rawUrl.replace(/\/+$/, "");
};

// Re-export getAuthBaseUrl from api-config for backwards compatibility
// This ensures all auth.ts consumers use the dynamic URL resolution
export { getAuthBaseUrl } from './api-config';

export function readStoredSession(): AuthSession | null {
  if (!safeWindow) return null;
  const raw = safeWindow.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.token || !parsed?.user?.email) {
      return null;
    }
    if (!parsed.user.tier) {
      parsed.user.tier = "free";
    }
    return parsed;
  } catch {
    return null;
  }
}

export function persistSession(session: AuthSession) {
  if (!safeWindow) return;
  safeWindow.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  if (!safeWindow) return;
  safeWindow.localStorage.removeItem(STORAGE_KEY);
}
