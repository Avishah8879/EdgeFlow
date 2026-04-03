import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth";
import { getAuthBaseUrl } from "@/lib/api-config";

// Storage keys
const IMPERSONATION_KEY = "tiphub_impersonation";
const ORIGINAL_TOKEN_KEY = "tiphub_original_token";
const ORIGINAL_USER_KEY = "tiphub_original_user";

export interface ImpersonationState {
  isImpersonating: boolean;
  targetUser: {
    id: string;
    email: string;
    username: string | null;
    name: string | null;
    role: string;
    tier: string;
  } | null;
  adminUserId: string | null;
  expiresAt: number | null;
}

/**
 * Hook for managing user impersonation.
 * Allows super_admins to log in as other users for debugging.
 */
export function useImpersonation() {
  const { token, user, setToken, setUser } = useAuth();
  const [impersonationState, setImpersonationState] = useState<ImpersonationState>(() => {
    // Initialize from localStorage
    const stored = localStorage.getItem(IMPERSONATION_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Check if impersonation has expired
        if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
          // Expired - clean up
          localStorage.removeItem(IMPERSONATION_KEY);
          return {
            isImpersonating: false,
            targetUser: null,
            adminUserId: null,
            expiresAt: null,
          };
        }
        return parsed;
      } catch {
        localStorage.removeItem(IMPERSONATION_KEY);
      }
    }
    return {
      isImpersonating: false,
      targetUser: null,
      adminUserId: null,
      expiresAt: null,
    };
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if impersonation has expired on interval
  useEffect(() => {
    if (!impersonationState.isImpersonating) return;

    const checkExpiry = () => {
      if (impersonationState.expiresAt && Date.now() > impersonationState.expiresAt) {
        endImpersonation();
      }
    };

    const interval = setInterval(checkExpiry, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [impersonationState.isImpersonating, impersonationState.expiresAt]);

  /**
   * Start impersonating a user.
   */
  const startImpersonation = useCallback(
    async (userId: string) => {
      if (!token || !user) {
        setError("Not authenticated");
        return false;
      }

      if (user.role !== "super_admin") {
        setError("Only super admins can impersonate users");
        return false;
      }

      setIsLoading(true);
      setError(null);

      try {
        const baseUrl = getAuthBaseUrl();
        const response = await fetch(`${baseUrl}/api/admin/impersonate/${userId}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to start impersonation");
        }

        const data = await response.json();

        // Store original auth state
        localStorage.setItem(ORIGINAL_TOKEN_KEY, token);
        localStorage.setItem(ORIGINAL_USER_KEY, JSON.stringify(user));

        // Set impersonation state
        const newState: ImpersonationState = {
          isImpersonating: true,
          targetUser: data.targetUser,
          adminUserId: user.id,
          expiresAt: Date.now() + data.expiresIn * 1000,
        };
        localStorage.setItem(IMPERSONATION_KEY, JSON.stringify(newState));
        setImpersonationState(newState);

        // Update auth context with impersonation token
        setToken(data.impersonationToken);
        setUser({
          id: data.targetUser.id,
          email: data.targetUser.email,
          username: data.targetUser.username,
          name: data.targetUser.name,
          avatarUrl: null,
          role: data.targetUser.role,
          tier: data.targetUser.tier,
          provider: "password",
        });

        setIsLoading(false);
        return true;
      } catch (err: any) {
        setError(err.message);
        setIsLoading(false);
        return false;
      }
    },
    [token, user, setToken, setUser]
  );

  /**
   * End impersonation and restore admin session.
   */
  const endImpersonation = useCallback(async () => {
    const originalToken = localStorage.getItem(ORIGINAL_TOKEN_KEY);
    const originalUserJson = localStorage.getItem(ORIGINAL_USER_KEY);

    if (!originalToken || !originalUserJson) {
      // No original session to restore
      setImpersonationState({
        isImpersonating: false,
        targetUser: null,
        adminUserId: null,
        expiresAt: null,
      });
      localStorage.removeItem(IMPERSONATION_KEY);
      return;
    }

    try {
      // Log impersonation end on server
      const baseUrl = getAuthBaseUrl();
      await fetch(`${baseUrl}/api/admin/impersonate/end`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          adminUserId: impersonationState.adminUserId,
          targetUserId: impersonationState.targetUser?.id,
        }),
      });
    } catch {
      // Ignore errors - best effort logging
    }

    // Restore original auth state
    const originalUser = JSON.parse(originalUserJson);
    setToken(originalToken);
    setUser(originalUser);

    // Clear impersonation state
    localStorage.removeItem(IMPERSONATION_KEY);
    localStorage.removeItem(ORIGINAL_TOKEN_KEY);
    localStorage.removeItem(ORIGINAL_USER_KEY);

    setImpersonationState({
      isImpersonating: false,
      targetUser: null,
      adminUserId: null,
      expiresAt: null,
    });
  }, [token, impersonationState, setToken, setUser]);

  /**
   * Get time remaining in impersonation session.
   */
  const getTimeRemaining = useCallback(() => {
    if (!impersonationState.expiresAt) return null;
    const remaining = impersonationState.expiresAt - Date.now();
    if (remaining <= 0) return null;
    return Math.ceil(remaining / 1000 / 60); // minutes
  }, [impersonationState.expiresAt]);

  return {
    ...impersonationState,
    isLoading,
    error,
    startImpersonation,
    endImpersonation,
    getTimeRemaining,
    canImpersonate: user?.role === "super_admin",
  };
}
