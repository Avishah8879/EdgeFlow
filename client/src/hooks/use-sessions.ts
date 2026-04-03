/**
 * Sessions Management Hook
 *
 * Provides queries and mutations for managing user sessions:
 * - List all active sessions
 * - Revoke individual sessions
 * - Revoke all other sessions
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthBaseUrl } from '@/lib/api-config';

const AUTH_BASE_URL = getAuthBaseUrl();

// Types
export interface Session {
  id: string;
  deviceInfo: string;
  ipAddress: string;
  location: string | null;
  issuedAt: string;
  expiresAt: string;
  lastActivityAt: string | null;
  isCurrent: boolean;
}

interface SessionsResponse {
  sessions: Session[];
}

interface RevokeSessionResponse {
  message: string;
}

interface RevokeAllResponse {
  message: string;
  sessionsRevoked: number;
}

/**
 * Fetch all active sessions
 */
async function fetchSessions(): Promise<Session[]> {
  const response = await fetch(`${AUTH_BASE_URL}/auth/v2/sessions`);

  if (!response.ok) {
    throw new Error('Failed to fetch sessions');
  }

  const data: SessionsResponse = await response.json();
  return data.sessions;
}

/**
 * Revoke a specific session
 */
async function revokeSession(sessionId: string): Promise<RevokeSessionResponse> {
  const response = await fetch(`${AUTH_BASE_URL}/auth/v2/sessions/${sessionId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to revoke session' }));
    throw new Error(error.error || error.message || 'Failed to revoke session');
  }

  return response.json();
}

/**
 * Revoke all sessions except current
 */
async function revokeAllSessions(): Promise<RevokeAllResponse> {
  const response = await fetch(`${AUTH_BASE_URL}/auth/v2/sessions`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to revoke sessions' }));
    throw new Error(error.error || error.message || 'Failed to revoke sessions');
  }

  return response.json();
}

/**
 * Hook for fetching user's active sessions
 */
export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: fetchSessions,
    staleTime: 60 * 1000, // 1 minute
    retry: 1,
  });
}

/**
 * Hook for revoking a specific session
 */
export function useRevokeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: revokeSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

/**
 * Hook for revoking all other sessions
 */
export function useRevokeAllSessions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: revokeAllSessions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

/**
 * Parse device info string into structured data
 */
export function parseDeviceInfo(deviceInfo: string | null): {
  browser: string;
  os: string;
  device: string;
} {
  if (!deviceInfo) {
    return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };
  }

  // Simple UA parsing
  let browser = 'Unknown';
  let os = 'Unknown';
  let device = 'Desktop';

  // Browser detection
  if (deviceInfo.includes('Chrome')) browser = 'Chrome';
  else if (deviceInfo.includes('Firefox')) browser = 'Firefox';
  else if (deviceInfo.includes('Safari')) browser = 'Safari';
  else if (deviceInfo.includes('Edge')) browser = 'Edge';

  // OS detection
  if (deviceInfo.includes('Windows')) os = 'Windows';
  else if (deviceInfo.includes('Mac')) os = 'macOS';
  else if (deviceInfo.includes('Linux')) os = 'Linux';
  else if (deviceInfo.includes('Android')) {
    os = 'Android';
    device = 'Mobile';
  } else if (deviceInfo.includes('iPhone') || deviceInfo.includes('iPad')) {
    os = 'iOS';
    device = deviceInfo.includes('iPad') ? 'Tablet' : 'Mobile';
  }

  return { browser, os, device };
}
