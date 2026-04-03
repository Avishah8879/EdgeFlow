/**
 * Profile Update Hooks
 *
 * Provides mutations for updating user profile:
 * - Update phone number
 * - Check if user has password set
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAuthBaseUrl } from '@/lib/api-config';
import { useAuth } from './useAuth';

const AUTH_BASE_URL = getAuthBaseUrl();

// Types
interface UpdatePhoneResponse {
  message: string;
  user: {
    id: string;
    phoneNumber: string | null;
    phoneVerified: boolean;
  };
}

interface HasPasswordResponse {
  hasPassword: boolean;
}

/**
 * Update phone number
 */
async function updatePhone(phoneNumber: string): Promise<UpdatePhoneResponse> {
  const response = await fetch(`${AUTH_BASE_URL}/auth/v2/update-phone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Update failed' }));
    throw new Error(error.error || error.message || 'Failed to update phone number');
  }

  return response.json();
}

/**
 * Check if user has password set
 */
async function checkHasPassword(): Promise<HasPasswordResponse> {
  const response = await fetch(`${AUTH_BASE_URL}/auth/v2/has-password`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Check failed' }));
    throw new Error(error.error || error.message || 'Failed to check password status');
  }

  return response.json();
}

/**
 * Hook for updating phone number
 */
export function useUpdatePhone() {
  const queryClient = useQueryClient();
  const { refreshUserProfile } = useAuth();

  return useMutation({
    mutationFn: updatePhone,
    onSuccess: () => {
      // Refresh user profile to update UI
      refreshUserProfile();
      // Invalidate any user-related queries
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });
}

/**
 * Hook for checking if user has password set
 */
export function useHasPassword() {
  return useQuery({
    queryKey: ['hasPassword'],
    queryFn: checkHasPassword,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
