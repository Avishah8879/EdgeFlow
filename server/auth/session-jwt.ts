/**
 * JWT Session Payload Generator
 *
 * Combines JWT token generation with database session management.
 * Creates a complete authentication session for a user.
 */

import { generateTokenPair, UserRole, UserTier } from './jwt';
import { createSessionV2, sanitizeUserV2, DbUser } from './store-v2';

/**
 * Auth Session Payload (compatible with existing frontend)
 *
 * IMPORTANT: This must include ALL fields that frontend's AuthUser type expects,
 * so that when token refresh happens, the persisted session is complete.
 */
export interface AuthSessionPayloadV2 {
  token: string; // JWT access token
  refreshToken: string; // JWT refresh token
  issuedAt: string;
  expiresAt: string;
  user: {
    id: string;
    email: string;
    username: string;
    name: string | null;
    avatarUrl: string | null;
    provider: 'password' | 'google';
    tier: UserTier;
    role: UserRole;
    emailVerified: boolean;
    // Phone fields
    phoneNumber: string | null;
    phoneVerified: boolean;
    // Subscription fields
    subscriptionStatus: string | null;
    subscriptionPlanId: string | null;
    trialEnd: string | null;
    hadTrial: boolean;
  };
}

/**
 * Create a complete JWT session for a user
 *
 * This function:
 * 1. Generates JWT access and refresh tokens
 * 2. Stores session in database for revocation capability
 * 3. Returns session payload compatible with frontend
 *
 * @param user - Database user object
 * @param metadata - Optional session metadata (device info, IP)
 * @returns Complete session payload
 *
 * @example
 * const session = await createJwtSessionPayload(user, {
 *   deviceInfo: req.headers['user-agent'],
 *   ipAddress: req.ip
 * });
 * res.json(session);
 */
export async function createJwtSessionPayload(
  user: DbUser,
  metadata?: {
    deviceInfo?: string;
    ipAddress?: string;
    platformId?: string | null;
  }
): Promise<AuthSessionPayloadV2> {
  // Generate JWT token pair
  const { accessToken, refreshToken, expiresAt, issuedAt } = generateTokenPair({
    id: user.id,
    email: user.email,
    username: user.username,
    tier: user.tier,
    provider: user.provider,
    role: user.role || 'user',
    primaryPlatformId: metadata?.platformId ?? user.primary_platform_id,
  });

  // Store session in database (for revocation)
  await createSessionV2(
    user.id,
    accessToken,
    refreshToken,
    {
      deviceInfo: metadata?.deviceInfo,
      ipAddress: metadata?.ipAddress,
    },
    expiresAt
  );

  // Create session payload compatible with frontend
  // IMPORTANT: Include ALL fields that frontend's AuthUser type expects
  const sessionPayload: AuthSessionPayloadV2 = {
    token: accessToken,
    refreshToken: refreshToken,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      avatarUrl: user.avatar_url,
      provider: user.provider,
      tier: user.tier,
      role: user.role || 'user',
      emailVerified: user.email_verified,
      // Phone fields
      phoneNumber: user.phone_number,
      phoneVerified: user.phone_verified || false,
      // Subscription fields
      subscriptionStatus: user.subscription_status || null,
      subscriptionPlanId: user.subscription_plan_id || null,
      trialEnd: user.trial_end?.toISOString() || null,
      hadTrial: user.had_trial || false,
    },
  };

  return sessionPayload;
}

/**
 * Refresh an access token using a refresh token
 *
 * @param user - User to generate new token for
 * @param metadata - Optional session metadata
 * @returns New session payload with new access token
 */
export async function refreshJwtSession(
  user: DbUser,
  metadata?: {
    deviceInfo?: string;
    ipAddress?: string;
  }
): Promise<AuthSessionPayloadV2> {
  // Generate new token pair
  return await createJwtSessionPayload(user, metadata);
}

/**
 * Validate session format (for migration from old system)
 *
 * Checks if a session object has the required fields
 */
export function isValidSessionPayload(
  payload: any
): payload is AuthSessionPayloadV2 {
  return (
    payload &&
    typeof payload.token === 'string' &&
    typeof payload.refreshToken === 'string' &&
    typeof payload.issuedAt === 'string' &&
    typeof payload.expiresAt === 'string' &&
    payload.user &&
    typeof payload.user.id === 'string' &&
    typeof payload.user.email === 'string'
  );
}
