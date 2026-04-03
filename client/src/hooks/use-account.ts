/**
 * Account Management Hook
 *
 * Provides mutations for account management:
 * - Request account deletion
 * - Delete account with OTP
 * - Export user data (GDPR)
 */

import { useMutation } from '@tanstack/react-query';
import { getAuthBaseUrl } from '@/lib/api-config';

const AUTH_BASE_URL = getAuthBaseUrl();

// Types
interface RequestDeletionResponse {
  message: string;
  expiresInMinutes: number;
}

interface DeleteAccountResponse {
  message: string;
}

interface ExportDataResponse {
  exportedAt: string;
  user: {
    id: string;
    email: string;
    username: string;
    name: string | null;
    provider: string;
    tier: string;
    role: string;
    emailVerified: boolean;
    createdAt: string;
    lastLoginAt: string | null;
    loginCount: number;
  };
  sessions: Array<{
    device_info: string | null;
    ip_address: string | null;
    location: string | null;
    issued_at: string;
    expires_at: string;
    last_activity_at: string | null;
    revoked: boolean;
  }>;
  authLogs: Array<{
    event_type: string;
    provider: string;
    ip_address: string | null;
    success: boolean;
    created_at: string;
  }>;
  consentHistory: Array<{
    consent_level: string;
    ip_address: string | null;
    created_at: string;
  }>;
}

/**
 * Request account deletion OTP
 */
async function requestDeletion(): Promise<RequestDeletionResponse> {
  const response = await fetch(`${AUTH_BASE_URL}/auth/v2/request-deletion`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || 'Failed to request deletion');
  }

  return response.json();
}

/**
 * Delete account with OTP
 */
async function deleteAccount(otp: string): Promise<DeleteAccountResponse> {
  const response = await fetch(`${AUTH_BASE_URL}/auth/v2/delete-account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Deletion failed' }));
    throw new Error(error.error || error.message || 'Failed to delete account');
  }

  return response.json();
}

/**
 * Export user data
 */
async function exportData(): Promise<ExportDataResponse> {
  const response = await fetch(`${AUTH_BASE_URL}/auth/v2/export-my-data`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Export failed' }));
    throw new Error(error.error || error.message || 'Failed to export data');
  }

  return response.json();
}

/**
 * Hook for requesting account deletion OTP
 */
export function useRequestDeletion() {
  return useMutation({
    mutationFn: requestDeletion,
  });
}

/**
 * Hook for deleting account with OTP
 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: deleteAccount,
  });
}

/**
 * Hook for exporting user data
 */
export function useExportData() {
  return useMutation({
    mutationFn: exportData,
  });
}

/**
 * Download export data as JSON file
 */
export function downloadExportAsFile(data: ExportDataResponse) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `tiphub-data-export-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
