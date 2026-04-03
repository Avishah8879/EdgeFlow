/**
 * Email Verification Hook
 *
 * Provides mutations for email verification flow:
 * - Send verification code
 * - Verify email with OTP
 */

import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthBaseUrl } from '@/lib/api-config';

const AUTH_BASE_URL = getAuthBaseUrl();

// Types
interface SendVerificationResponse {
  message: string;
  expiresInMinutes: number;
}

interface VerifyEmailResponse {
  message: string;
}

/**
 * Send email verification OTP
 */
async function sendVerificationCode(): Promise<SendVerificationResponse> {
  const response = await fetch(`${AUTH_BASE_URL}/auth/v2/send-verification`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || 'Failed to send verification code');
  }

  return response.json();
}

/**
 * Verify email with OTP
 */
async function verifyEmail(otp: string): Promise<VerifyEmailResponse> {
  const response = await fetch(`${AUTH_BASE_URL}/auth/v2/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Verification failed' }));
    throw new Error(error.error || error.message || 'Failed to verify email');
  }

  return response.json();
}

/**
 * Hook for sending email verification code
 */
export function useSendVerification() {
  return useMutation({
    mutationFn: sendVerificationCode,
  });
}

/**
 * Hook for verifying email with OTP
 * After successful verification, refreshes user profile in AuthContext
 */
export function useVerifyEmail() {
  const { refreshUserProfile } = useAuth();

  return useMutation({
    mutationFn: verifyEmail,
    onSuccess: async () => {
      console.log('[EMAIL_VERIFY] Verification successful, refreshing user profile...');
      // Refresh user profile to update emailVerified status in AuthContext
      await refreshUserProfile();
      console.log('[EMAIL_VERIFY] User profile refresh complete');
    },
  });
}
