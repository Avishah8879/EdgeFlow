/**
 * Database-Backed User Store V2
 *
 * Provides user management functions using PostgreSQL (Tiphub_auth database)
 * instead of JSON file storage. Uses bcrypt for password hashing and supports
 * session management with JWT tokens.
 *
 * This is the NEW authentication system. The old JSON-based system remains
 * in server/auth/store.ts for backward compatibility.
 */

import crypto from 'crypto';
import { query, queryOne, transaction } from '../db/auth-connection';
import { hashPasswordBcrypt, verifyPasswordBcrypt } from './password-bcrypt';
import type { UserRole, UserTier } from './jwt';

/**
 * Subscription Status Type
 */
export type SubscriptionStatus = 'none' | 'trialing' | 'active' | 'cancelled' | 'expired';

/**
 * Database User Type (matches database schema)
 */
export interface DbUser {
  id: string;
  email: string;
  username: string;
  name: string | null;
  avatar_url: string | null;
  provider: 'password' | 'google';
  password_hash: string | null;
  google_id: string | null;
  email_verified: boolean;
  is_active: boolean;
  tier: UserTier;
  role: UserRole;
  last_login_at: Date | null;
  last_login_ip: string | null;
  login_count: number;
  failed_login_attempts: number;
  locked_until: Date | null;
  created_at: Date;
  updated_at: Date;
  // Profile fields
  country_of_residence: string | null;
  date_of_birth: Date | null;
  phone_number: string | null;
  phone_verified: boolean;
  // Subscription fields
  subscription_status: SubscriptionStatus;
  subscription_plan_id: string | null;
  subscription_start: Date | null;
  subscription_end: Date | null;
  trial_end: Date | null;
  had_trial: boolean;
  cancelled_at: Date | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  // Multi-platform (added in migration 024)
  primary_platform_id: string | null;
}

/**
 * Public User Profile (safe to send to client)
 */
export interface PublicUserProfileV2 {
  id: string;
  email: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  provider: 'password' | 'google';
  tier: UserTier;
  role: UserRole;
  emailVerified: boolean;
  createdAt: string;
  // Profile fields
  countryOfResidence: string | null;
  dateOfBirth: string | null;
  phoneNumber: string | null;
  phoneVerified: boolean;
  // Subscription fields
  subscriptionStatus: SubscriptionStatus;
  subscriptionPlanId: string | null;
  subscriptionEnd: string | null;
  trialEnd: string | null;
  hadTrial: boolean;
  cancelAtPeriodEnd: boolean;
}

/**
 * Session Record
 */
export interface SessionRecord {
  id: string;
  user_id: string;
  token_hash: string;
  refresh_token_hash: string;
  device_info: string | null;
  ip_address: string | null;
  issued_at: Date;
  expires_at: Date;
  last_activity_at: Date;
  revoked: boolean;
}

/**
 * Sanitize user for public display
 */
export function sanitizeUserV2(user: DbUser): PublicUserProfileV2 {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    avatarUrl: user.avatar_url,
    provider: user.provider,
    tier: user.tier,
    role: user.role || 'user', // Default to 'user' if not set
    emailVerified: user.email_verified,
    createdAt: user.created_at.toISOString(),
    // Profile fields
    countryOfResidence: user.country_of_residence,
    dateOfBirth: user.date_of_birth ? user.date_of_birth.toISOString().split('T')[0] : null,
    phoneNumber: user.phone_number,
    phoneVerified: user.phone_verified || false,
    // Subscription fields
    subscriptionStatus: user.subscription_status || 'none',
    subscriptionPlanId: user.subscription_plan_id,
    subscriptionEnd: user.subscription_end?.toISOString() || null,
    trialEnd: user.trial_end?.toISOString() || null,
    hadTrial: user.had_trial || false,
    cancelAtPeriodEnd: user.cancel_at_period_end || false,
  };
}

/**
 * Find user by email or username
 */
export async function findUserByIdentifierV2(
  identifier: string
): Promise<DbUser | null> {
  const normalized = identifier.trim().toLowerCase();

  const sql = `
    SELECT * FROM users
    WHERE LOWER(email) = $1 OR LOWER(username) = $1
    LIMIT 1
  `;

  return await queryOne<DbUser>(sql, [normalized]);
}

/**
 * Find user by email only
 */
export async function findUserByEmailV2(email: string): Promise<DbUser | null> {
  const normalized = email.trim().toLowerCase();

  const sql = `
    SELECT * FROM users
    WHERE LOWER(email) = $1
    LIMIT 1
  `;

  return await queryOne<DbUser>(sql, [normalized]);
}

/**
 * Find user by ID
 */
export async function findUserByIdV2(userId: string): Promise<DbUser | null> {
  const sql = `SELECT * FROM users WHERE id = $1`;
  return await queryOne<DbUser>(sql, [userId]);
}

/**
 * Find user by Google ID
 */
export async function findUserByGoogleIdV2(
  googleId: string
): Promise<DbUser | null> {
  const sql = `SELECT * FROM users WHERE google_id = $1`;
  return await queryOne<DbUser>(sql, [googleId]);
}

/**
 * Check if username exists (case-insensitive)
 */
export async function checkUsernameExistsV2(username: string): Promise<boolean> {
  const normalized = username.trim().toLowerCase();
  const sql = `SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(username) = $1) as exists`;
  const result = await queryOne<{ exists: boolean }>(sql, [normalized]);
  return result?.exists ?? false;
}

/**
 * Create a new password-based user
 */
export async function createPasswordUserV2(payload: {
  email: string;
  username: string;
  password: string;
  name?: string;
  tier?: UserTier;
  countryOfResidence: string;
  dateOfBirth: string; // ISO format: YYYY-MM-DD
  phoneNumber: string;
  termsAccepted?: boolean;
  termsAcceptedAt?: Date;
  termsVersion?: string;
}): Promise<DbUser> {
  const normalizedEmail = payload.email.trim().toLowerCase();
  const normalizedUsername = payload.username.trim().toLowerCase();

  // Check if email or username already exists
  const existingByEmail = await findUserByEmailV2(normalizedEmail);
  if (existingByEmail) {
    throw new Error('An account with this email already exists.');
  }

  const existingByUsername = await query(
    'SELECT id FROM users WHERE LOWER(username) = $1',
    [normalizedUsername]
  );
  if (existingByUsername.rows.length > 0) {
    throw new Error('That username is already taken.');
  }

  // Hash password with bcrypt
  const passwordHash = await hashPasswordBcrypt(payload.password);

  // Insert user
  const sql = `
    INSERT INTO users (
      email, username, name, provider, password_hash, tier, email_verified,
      country_of_residence, date_of_birth, phone_number,
      terms_accepted, terms_accepted_at, terms_version
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *
  `;

  const user = await queryOne<DbUser>(sql, [
    normalizedEmail,
    normalizedUsername,
    payload.name || normalizedUsername,
    'password',
    passwordHash,
    payload.tier || 'premium', // TEMPORARY: Default all users to premium
    false, // Email not verified by default
    payload.countryOfResidence,
    payload.dateOfBirth,
    payload.phoneNumber,
    payload.termsAccepted || false,
    payload.termsAcceptedAt || null,
    payload.termsVersion || '1.0',
  ]);

  if (!user) {
    throw new Error('Failed to create user');
  }

  return user;
}

/**
 * Create a new Google OAuth user
 */
export async function createOAuthUserV2(payload: {
  email: string;
  username: string;
  name?: string;
  googleId: string;
  avatarUrl?: string;
  tier?: UserTier;
  countryOfResidence: string;
  dateOfBirth: string; // ISO format: YYYY-MM-DD
  phoneNumber: string;
  termsAccepted?: boolean;
  termsAcceptedAt?: Date;
  termsVersion?: string;
}): Promise<DbUser> {
  const normalizedEmail = payload.email.trim().toLowerCase();

  // Check if email already exists
  const existingByEmail = await findUserByEmailV2(normalizedEmail);
  if (existingByEmail) {
    throw new Error('An account with this email already exists.');
  }

  // Insert OAuth user
  const sql = `
    INSERT INTO users (
      email, username, name, provider, google_id, avatar_url, tier, email_verified,
      country_of_residence, date_of_birth, phone_number,
      terms_accepted, terms_accepted_at, terms_version
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *
  `;

  const user = await queryOne<DbUser>(sql, [
    normalizedEmail,
    payload.username,
    payload.name || payload.username,
    'google',
    payload.googleId,
    payload.avatarUrl || null,
    payload.tier || 'premium', // TEMPORARY: Default all users to premium
    true, // Google emails are pre-verified
    payload.countryOfResidence,
    payload.dateOfBirth,
    payload.phoneNumber,
    payload.termsAccepted || false,
    payload.termsAcceptedAt || null,
    payload.termsVersion || '1.0',
  ]);

  if (!user) {
    throw new Error('Failed to create OAuth user');
  }

  return user;
}

/**
 * Link Google account to existing user
 */
export async function linkGoogleAccountV2(
  userId: string,
  googleId: string,
  avatarUrl?: string
): Promise<DbUser> {
  const sql = `
    UPDATE users
    SET google_id = $1, avatar_url = COALESCE($2, avatar_url), email_verified = TRUE, updated_at = NOW()
    WHERE id = $3
    RETURNING *
  `;

  const user = await queryOne<DbUser>(sql, [googleId, avatarUrl || null, userId]);

  if (!user) {
    throw new Error('User not found');
  }

  return user;
}

/**
 * Unlink Google account from existing user
 * Only allowed if user has a password set (provider = 'password')
 */
export async function unlinkGoogleAccountV2(userId: string): Promise<DbUser> {
  // First check if user has a password (to prevent locking themselves out)
  const checkSql = `SELECT provider, password_hash FROM users WHERE id = $1`;
  const existing = await queryOne<{ provider: string; password_hash: string | null }>(checkSql, [userId]);

  if (!existing) {
    throw new Error('User not found');
  }

  if (!existing.password_hash) {
    throw new Error('Cannot unlink Google account without a password. Please set a password first.');
  }

  const sql = `
    UPDATE users
    SET google_id = NULL, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const user = await queryOne<DbUser>(sql, [userId]);

  if (!user) {
    throw new Error('User not found');
  }

  return user;
}

/**
 * Check if user has Google linked
 */
export async function hasGoogleLinkedV2(userId: string): Promise<boolean> {
  const sql = `SELECT google_id FROM users WHERE id = $1`;
  const user = await queryOne<{ google_id: string | null }>(sql, [userId]);
  return !!(user?.google_id);
}

/**
 * Update user's last login information
 */
export async function updateLastLoginV2(
  userId: string,
  ipAddress: string
): Promise<void> {
  const sql = `
    UPDATE users
    SET
      last_login_at = NOW(),
      last_login_ip = $1,
      login_count = login_count + 1,
      failed_login_attempts = 0
    WHERE id = $2
  `;

  await query(sql, [ipAddress, userId]);
}

/**
 * Increment failed login attempts
 */
export async function incrementFailedLoginV2(userId: string): Promise<number> {
  const sql = `
    UPDATE users
    SET failed_login_attempts = failed_login_attempts + 1
    WHERE id = $1
    RETURNING failed_login_attempts
  `;

  const result = await queryOne<{ failed_login_attempts: number }>(sql, [userId]);
  return result?.failed_login_attempts || 0;
}

/**
 * Lock user account
 */
export async function lockUserAccountV2(
  userId: string,
  lockDurationMinutes: number = 30
): Promise<void> {
  const sql = `
    UPDATE users
    SET locked_until = NOW() + INTERVAL '${lockDurationMinutes} minutes'
    WHERE id = $1
  `;

  await query(sql, [userId]);
}

/**
 * Check if user account is locked
 */
export async function isAccountLockedV2(userId: string): Promise<boolean> {
  const sql = `
    SELECT locked_until FROM users WHERE id = $1
  `;

  const result = await queryOne<{ locked_until: Date | null }>(sql, [userId]);

  if (!result || !result.locked_until) {
    return false;
  }

  return result.locked_until.getTime() > Date.now();
}

/**
 * Create a session record
 * Uses ON CONFLICT to handle race conditions where the same token hash
 * might be inserted concurrently (safety net for token refresh races)
 */
export async function createSessionV2(
  userId: string,
  token: string,
  refreshToken: string,
  metadata: {
    deviceInfo?: string;
    ipAddress?: string;
  },
  expiresAt: Date
): Promise<SessionRecord> {
  // Hash tokens before storing
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const refreshTokenHash = crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');

  const sql = `
    INSERT INTO sessions (
      user_id, token_hash, refresh_token_hash, device_info, ip_address, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (token_hash) DO UPDATE SET
      refresh_token_hash = EXCLUDED.refresh_token_hash,
      device_info = EXCLUDED.device_info,
      ip_address = EXCLUDED.ip_address,
      expires_at = EXCLUDED.expires_at,
      last_activity_at = NOW(),
      revoked = FALSE
    RETURNING *
  `;

  const session = await queryOne<SessionRecord>(sql, [
    userId,
    tokenHash,
    refreshTokenHash,
    metadata.deviceInfo || null,
    metadata.ipAddress || null,
    expiresAt,
  ]);

  if (!session) {
    throw new Error('Failed to create session');
  }

  return session;
}

/**
 * Find session by token
 */
export async function findSessionByTokenV2(
  token: string
): Promise<SessionRecord | null> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const sql = `
    SELECT * FROM sessions
    WHERE token_hash = $1 AND revoked = FALSE AND expires_at > NOW()
  `;

  return await queryOne<SessionRecord>(sql, [tokenHash]);
}

/**
 * Revoke a session
 */
export async function revokeSessionV2(
  token: string,
  reason?: string
): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const sql = `
    UPDATE sessions
    SET revoked = TRUE, revoked_at = NOW(), revoked_reason = $1
    WHERE token_hash = $2
  `;

  await query(sql, [reason || 'logout', tokenHash]);
}

/**
 * Revoke a session by refresh token
 * Used during token refresh to clean up the old session
 */
export async function revokeSessionByRefreshTokenV2(
  refreshToken: string,
  reason: string = 'token_refresh'
): Promise<void> {
  const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  const sql = `
    UPDATE sessions
    SET revoked = TRUE, revoked_at = NOW(), revoked_reason = $1
    WHERE refresh_token_hash = $2 AND revoked = FALSE
  `;

  await query(sql, [reason, refreshTokenHash]);
}

/**
 * Revoke all sessions for a user
 */
export async function revokeAllUserSessionsV2(
  userId: string,
  reason?: string
): Promise<void> {
  const sql = `
    UPDATE sessions
    SET revoked = TRUE, revoked_at = NOW(), revoked_reason = $1
    WHERE user_id = $2 AND revoked = FALSE
  `;

  await query(sql, [reason || 'logout_all', userId]);
}

/**
 * Update session activity
 */
export async function updateSessionActivityV2(token: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const sql = `
    UPDATE sessions
    SET last_activity_at = NOW()
    WHERE token_hash = $1 AND revoked = FALSE
  `;

  await query(sql, [tokenHash]);
}

/**
 * Log an authentication event
 */
export async function logAuthEventV2(data: {
  userId?: string;
  eventType: string;
  provider: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  failureReason?: string;
  metadata?: any;
}): Promise<void> {
  const sql = `
    INSERT INTO auth_logs (
      user_id, event_type, provider, ip_address, user_agent, success, failure_reason, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `;

  await query(sql, [
    data.userId || null,
    data.eventType,
    data.provider,
    data.ipAddress || null,
    data.userAgent || null,
    data.success,
    data.failureReason || null,
    data.metadata ? JSON.stringify(data.metadata) : null,
  ]);
}

/**
 * Get user statistics
 */
export async function getUserStatsV2(): Promise<{
  totalUsers: number;
  passwordUsers: number;
  googleUsers: number;
  basicTier: number;
  premiumTier: number;
  activeLast7Days: number;
  activeLast30Days: number;
}> {
  const sql = `
    SELECT
      COUNT(*) as total_users,
      COUNT(*) FILTER (WHERE provider = 'password') as password_users,
      COUNT(*) FILTER (WHERE provider = 'google') as google_users,
      COUNT(*) FILTER (WHERE tier = 'basic') as basic_tier,
      COUNT(*) FILTER (WHERE tier = 'premium') as premium_tier,
      COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '7 days') as active_last_7_days,
      COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '30 days') as active_last_30_days
    FROM users
  `;

  const result = await queryOne<any>(sql);

  return {
    totalUsers: parseInt(result?.total_users || '0'),
    passwordUsers: parseInt(result?.password_users || '0'),
    googleUsers: parseInt(result?.google_users || '0'),
    basicTier: parseInt(result?.basic_tier || '0'),
    premiumTier: parseInt(result?.premium_tier || '0'),
    activeLast7Days: parseInt(result?.active_last_7_days || '0'),
    activeLast30Days: parseInt(result?.active_last_30_days || '0'),
  };
}

/**
 * Get user's role
 */
export async function getUserRoleV2(userId: string): Promise<UserRole> {
  const sql = `SELECT role FROM users WHERE id = $1`;
  const result = await queryOne<{ role: UserRole | null }>(sql, [userId]);
  return result?.role || 'user';
}

/**
 * Update user's role (admin only)
 *
 * @param userId - User to update
 * @param role - New role to assign
 * @param updatedBy - Admin user making the change
 * @returns Updated user
 */
export async function updateUserRoleV2(
  userId: string,
  role: UserRole,
  updatedBy: string
): Promise<DbUser> {
  // Validate role hierarchy: super_admin can set any role, admin can only set user/moderator
  const updaterRole = await getUserRoleV2(updatedBy);
  const targetCurrentRole = await getUserRoleV2(userId);

  // Only super_admin can create/modify admins or super_admins
  if ((role === 'admin' || role === 'super_admin' || targetCurrentRole === 'admin' || targetCurrentRole === 'super_admin')
      && updaterRole !== 'super_admin') {
    throw new Error('Only super_admin can modify admin roles');
  }

  // Admin can only set user or moderator roles
  if (updaterRole === 'admin' && (role !== 'user' && role !== 'moderator')) {
    throw new Error('Admins can only assign user or moderator roles');
  }

  const sql = `
    UPDATE users
    SET role = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING *
  `;

  const user = await queryOne<DbUser>(sql, [role, userId]);

  if (!user) {
    throw new Error('User not found');
  }

  return user;
}

/**
 * Check if user has required role level
 * Role hierarchy: user < moderator < admin < super_admin
 */
export function hasRoleLevel(userRole: UserRole | undefined, requiredRole: UserRole): boolean {
  const roleHierarchy: Record<UserRole, number> = {
    'user': 0,
    'moderator': 1,
    'admin': 2,
    'super_admin': 3,
  };

  const userLevel = roleHierarchy[userRole || 'user'];
  const requiredLevel = roleHierarchy[requiredRole];

  return userLevel >= requiredLevel;
}

/**
 * Get all users with admin roles (admin or super_admin)
 */
export async function getAdminUsersV2(): Promise<DbUser[]> {
  const sql = `
    SELECT * FROM users
    WHERE role IN ('admin', 'super_admin')
    ORDER BY role DESC, created_at ASC
  `;

  const result = await query(sql);
  return result.rows as DbUser[];
}

/**
 * Get all users with a specific role
 */
export async function getUsersByRoleV2(role: UserRole): Promise<DbUser[]> {
  const sql = `
    SELECT * FROM users
    WHERE role = $1
    ORDER BY created_at DESC
  `;

  const result = await query(sql, [role]);
  return result.rows as DbUser[];
}

/**
 * Update user's phone number
 */
export async function updatePhoneNumberV2(
  userId: string,
  phoneNumber: string
): Promise<DbUser> {
  const sql = `
    UPDATE users
    SET phone_number = $1, phone_verified = FALSE, updated_at = NOW()
    WHERE id = $2
    RETURNING *
  `;

  const user = await queryOne<DbUser>(sql, [phoneNumber, userId]);

  if (!user) {
    throw new Error('User not found');
  }

  return user;
}

/**
 * Check if user has a password set
 */
export async function hasPasswordSetV2(userId: string): Promise<boolean> {
  const sql = `SELECT password_hash FROM users WHERE id = $1`;
  const result = await queryOne<{ password_hash: string | null }>(sql, [userId]);
  return !!(result?.password_hash);
}
