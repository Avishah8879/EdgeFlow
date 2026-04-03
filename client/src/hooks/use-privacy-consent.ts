/**
 * Privacy Consent Hook
 *
 * Manages user privacy consent preferences for tracking.
 * Supports both authenticated users and anonymous sessions.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { getAuthBaseUrl } from '@/lib/api-config';

const AUTH_BASE_URL = getAuthBaseUrl();

// Types
export type ConsentLevel = 'none' | 'essential' | 'all';

// Get auth token from localStorage (for explicit auth header)
function getAuthToken(): string | null {
  try {
    const stored = localStorage.getItem('auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.token || null;
    }
  } catch {
    // Ignore
  }
  return null;
}

interface ConsentResponse {
  consentLevel: ConsentLevel;
  updatedAt?: string;
  isAnonymous: boolean;
}

interface SetConsentResponse {
  message: string;
  consentLevel: ConsentLevel;
  isAnonymous: boolean;
}

// Generate or retrieve session ID for anonymous tracking
function getSessionId(): string {
  const storageKey = 'tiphub_session_id';
  let sessionId = localStorage.getItem(storageKey);

  if (!sessionId) {
    sessionId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    localStorage.setItem(storageKey, sessionId);
  }

  return sessionId;
}

// Check if consent has been given (stored in localStorage for quick check)
function hasConsentBeenAsked(): boolean {
  return localStorage.getItem('tiphub_consent_asked') === 'true';
}

function markConsentAsked(): void {
  localStorage.setItem('tiphub_consent_asked', 'true');
}

/**
 * Fetch current consent status
 */
async function fetchConsent(): Promise<ConsentResponse> {
  const sessionId = getSessionId();
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'x-session-id': sessionId,
  };

  // Include auth token if available (for logged-in users)
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${AUTH_BASE_URL}/api/privacy/consent`, {
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to fetch consent status');
  }

  return response.json();
}

/**
 * Set consent level
 */
async function setConsent(consentLevel: ConsentLevel): Promise<SetConsentResponse> {
  const sessionId = getSessionId();
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-session-id': sessionId,
  };

  // Include auth token if available (for logged-in users)
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${AUTH_BASE_URL}/api/privacy/consent`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ consentLevel }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to set consent' }));
    throw new Error(error.message || 'Failed to set consent');
  }

  return response.json();
}

/**
 * Hook for fetching consent status
 */
export function useConsentStatus() {
  return useQuery({
    queryKey: ['privacy', 'consent'],
    queryFn: fetchConsent,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  });
}

/**
 * Hook for setting consent
 */
export function useSetConsent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: setConsent,
    onSuccess: (data) => {
      // Update the consent query cache
      queryClient.setQueryData(['privacy', 'consent'], {
        consentLevel: data.consentLevel,
        isAnonymous: data.isAnonymous,
      });
      // Mark that consent has been asked
      markConsentAsked();
    },
  });
}

/**
 * Combined hook for privacy consent banner
 */
export function usePrivacyConsent() {
  const { data: consentData, isLoading } = useConsentStatus();
  const setConsentMutation = useSetConsent();
  const [showBanner, setShowBanner] = useState(false);

  // Determine if banner should be shown
  useEffect(() => {
    // Don't show while loading
    if (isLoading) return;

    // Show if consent hasn't been asked yet and consent level is 'none'
    const shouldShow = !hasConsentBeenAsked() && consentData?.consentLevel === 'none';
    setShowBanner(shouldShow);
  }, [isLoading, consentData?.consentLevel]);

  const acceptAll = useCallback(() => {
    setConsentMutation.mutate('all');
    setShowBanner(false);
  }, [setConsentMutation]);

  const acceptEssential = useCallback(() => {
    setConsentMutation.mutate('essential');
    setShowBanner(false);
  }, [setConsentMutation]);

  const rejectAll = useCallback(() => {
    setConsentMutation.mutate('none');
    setShowBanner(false);
  }, [setConsentMutation]);

  const updateConsent = useCallback((level: ConsentLevel) => {
    setConsentMutation.mutate(level);
    setShowBanner(false);
  }, [setConsentMutation]);

  return {
    consentLevel: consentData?.consentLevel || 'none',
    isLoading,
    showBanner,
    isUpdating: setConsentMutation.isPending,
    acceptAll,
    acceptEssential,
    rejectAll,
    updateConsent,
    closeBanner: () => {
      markConsentAsked();
      setShowBanner(false);
    },
  };
}

/**
 * Check if tracking is allowed based on consent level
 */
export function isTrackingAllowed(
  consentLevel: ConsentLevel,
  trackingType: 'essential' | 'all'
): boolean {
  if (consentLevel === 'none') return false;
  if (consentLevel === 'all') return true;
  if (consentLevel === 'essential' && trackingType === 'essential') return true;
  return false;
}
