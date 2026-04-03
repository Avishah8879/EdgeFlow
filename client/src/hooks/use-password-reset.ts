/**
 * Password Reset Hook
 *
 * Provides mutations for password reset flow:
 * - Request OTP (forgot password)
 * - Reset password with OTP
 */

import { useMutation } from '@tanstack/react-query';
import { getAuthBaseUrl } from '@/lib/api-config';

const AUTH_BASE_URL = getAuthBaseUrl();

// Types
interface ForgotPasswordRequest {
  email: string;
}

interface ForgotPasswordResponse {
  message: string;
  expiresInMinutes: number;
}

interface ResetPasswordRequest {
  email: string;
  otp: string;
  newPassword: string;
}

interface ResetPasswordResponse {
  message: string;
}

/**
 * Request a password reset OTP
 */
async function requestPasswordReset(data: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
  const response = await fetch(`${AUTH_BASE_URL}/auth/v2/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || 'Failed to request password reset');
  }

  return response.json();
}

/**
 * Reset password with OTP
 */
async function resetPassword(data: ResetPasswordRequest): Promise<ResetPasswordResponse> {
  const response = await fetch(`${AUTH_BASE_URL}/auth/v2/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Reset failed' }));
    throw new Error(error.error || error.message || 'Failed to reset password');
  }

  return response.json();
}

/**
 * Hook for requesting password reset OTP
 */
export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: requestPasswordReset,
  });
}

/**
 * Hook for resetting password with OTP
 */
export function useResetPassword() {
  return useMutation({
    mutationFn: resetPassword,
  });
}
