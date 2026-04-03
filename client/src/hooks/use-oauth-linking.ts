/**
 * OAuth Account Linking Hook
 *
 * Provides functionality for linking/unlinking OAuth providers (Google) to user accounts.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthBaseUrl } from '@/lib/api-config';

const AUTH_BASE_URL = getAuthBaseUrl();

// Types
interface LinkStatusResponse {
  linked: boolean;
  provider: string;
}

interface OAuthStatusResponse {
  available: boolean;
  provider: string;
  message: string;
}

interface UnlinkResponse {
  message: string;
}

/**
 * Check if Google OAuth is available/configured
 */
async function checkGoogleOAuthStatus(): Promise<OAuthStatusResponse> {
  const response = await fetch(`${AUTH_BASE_URL}/auth/google/status`);

  if (!response.ok) {
    throw new Error('Failed to check OAuth status');
  }

  return response.json();
}

/**
 * Get auth token from localStorage
 * NOTE: The session is stored at "tiphub.auth.session" with structure { token, refreshToken, user, ... }
 */
function getAuthToken(): string | null {
  try {
    const stored = localStorage.getItem('tiphub.auth.session');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.token || null;
    }
  } catch {
    // Ignore parsing errors
  }
  return null;
}

/**
 * Check if user has Google linked
 */
async function checkGoogleLinkStatus(): Promise<LinkStatusResponse> {
  const token = getAuthToken();
  const headers: Record<string, string> = {};

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${AUTH_BASE_URL}/auth/google/link-status`, {
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to check link status');
  }

  return response.json();
}

/**
 * Unlink Google account
 */
async function unlinkGoogle(): Promise<UnlinkResponse> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${AUTH_BASE_URL}/auth/google/unlink`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to unlink' }));
    throw new Error(error.error || error.message || 'Failed to unlink Google account');
  }

  return response.json();
}

/**
 * Hook to check if Google OAuth is available
 */
export function useGoogleOAuthStatus() {
  return useQuery({
    queryKey: ['google-oauth-status'],
    queryFn: checkGoogleOAuthStatus,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}

/**
 * Hook to check if user has Google linked
 */
export function useGoogleLinkStatus() {
  const token = getAuthToken();

  return useQuery({
    queryKey: ['google-link-status'],
    queryFn: checkGoogleLinkStatus,
    staleTime: 30 * 1000, // 30 seconds
    retry: 1,
    enabled: !!token, // Only run if user is authenticated
  });
}

/**
 * Hook to unlink Google account
 */
export function useUnlinkGoogle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: unlinkGoogle,
    onSuccess: () => {
      // Invalidate link status and user data
      queryClient.invalidateQueries({ queryKey: ['google-link-status'] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });
}

/**
 * Get the URL to initiate Google linking
 * User will be redirected to this URL to start the OAuth flow
 * Uses window.location.origin to work from any domain (localhost, ngrok, production)
 */
export function getGoogleLinkUrl(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : AUTH_BASE_URL;
  const token = getAuthToken();
  if (!token) {
    return `${origin}/auth/google/link`;
  }
  return `${origin}/auth/google/link?token=${encodeURIComponent(token)}`;
}

/**
 * Handle redirect to Google OAuth for linking
 * This opens the link flow in the current window
 */
export function initiateGoogleLink(): void {
  const token = getAuthToken();
  if (!token) {
    console.error('No auth token found');
    return;
  }

  // Redirect to the link endpoint with token as query parameter
  window.location.href = getGoogleLinkUrl();
}

/**
 * Combined hook for OAuth linking functionality
 */
export function useOAuthLinking() {
  const oauthStatus = useGoogleOAuthStatus();
  const linkStatus = useGoogleLinkStatus();
  const unlinkMutation = useUnlinkGoogle();

  return {
    // Status
    isGoogleAvailable: oauthStatus.data?.available ?? false,
    isGoogleLinked: linkStatus.data?.linked ?? false,
    isLoading: oauthStatus.isLoading || linkStatus.isLoading,

    // Actions
    linkGoogle: initiateGoogleLink,
    unlinkGoogle: unlinkMutation.mutate,

    // Mutation state
    isUnlinking: unlinkMutation.isPending,
    unlinkError: unlinkMutation.error,

    // Refetch
    refetch: () => {
      oauthStatus.refetch();
      linkStatus.refetch();
    },
  };
}
