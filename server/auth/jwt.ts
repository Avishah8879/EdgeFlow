/**
 * JWT Token System
 *
 * Provides JSON Web Token generation and verification for secure authentication.
 * Supports both access tokens (short-lived) and refresh tokens (long-lived).
 */

import jwt from 'jsonwebtoken';

// Get JWT secret from environment — crash if missing
const _secret = process.env.JWT_SECRET;
if (!_secret) throw new Error('FATAL: JWT_SECRET environment variable is required');
const JWT_SECRET: string = _secret;
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '6h';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

/**
 * User Role Type
 */
export type UserRole = 'user' | 'moderator' | 'admin' | 'super_admin';

/**
 * User Subscription Tier
 *
 * Migration 025 replaced the basic/premium model with three tiers:
 *  - 'free' — minimal access; coin-gated features blocked.
 *  - 'semi' — pays a monthly fee; coin-gated features debit coins.
 *  - 'pro'  — pays more; coin-gated features run free, no debits.
 */
export type UserTier = 'free' | 'semi' | 'pro';

/**
 * Access Token Payload
 */
export interface AccessTokenPayload {
  userId: string;
  email: string;
  username: string;
  tier: UserTier;
  provider: 'password' | 'google';
  role?: UserRole; // Optional for backward compatibility with existing tokens
  /**
   * The platform on which this token was issued. Optional for backward
   * compatibility with tokens minted before migration 024.
   */
  platformId?: string;
  type: 'access';
  iat?: number; // Issued at (automatically added by jwt.sign)
  exp?: number; // Expiry (automatically added by jwt.sign)
}

/**
 * Refresh Token Payload
 */
export interface RefreshTokenPayload {
  userId: string;
  type: 'refresh';
  iat?: number;
  exp?: number;
}

/**
 * Generate an access token (short-lived, contains user info)
 *
 * @param user - User data to encode in token
 * @returns Signed JWT access token
 *
 * @example
 * const token = generateAccessToken({
 *   userId: '123',
 *   email: 'user@example.com',
 *   username: 'johndoe',
 *   tier: 'premium',
 *   provider: 'password'
 * });
 */
export function generateAccessToken(user: {
  id: string;
  email: string;
  username: string;
  tier: UserTier;
  provider: 'password' | 'google';
  role?: UserRole;
  primaryPlatformId?: string | null;
}): string {
  const payload: Omit<AccessTokenPayload, 'iat' | 'exp'> = {
    userId: user.id,
    email: user.email,
    username: user.username,
    tier: user.tier,
    provider: user.provider,
    role: user.role || 'user', // Default to 'user' if not provided
    type: 'access',
  };
  if (user.primaryPlatformId) {
    payload.platformId = user.primaryPlatformId;
  }

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRY as jwt.SignOptions['expiresIn'],
    issuer: 'tiphub-auth',
    audience: 'tiphub-api',
  });
}

/**
 * Generate a refresh token (long-lived, minimal data)
 *
 * @param userId - User ID to encode in token
 * @returns Signed JWT refresh token
 *
 * @example
 * const refreshToken = generateRefreshToken('user-123');
 */
export function generateRefreshToken(userId: string): string {
  const payload: Omit<RefreshTokenPayload, 'iat' | 'exp'> = {
    userId,
    type: 'refresh',
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRY as jwt.SignOptions['expiresIn'],
    issuer: 'tiphub-auth',
    audience: 'tiphub-api',
  });
}

/**
 * Verify and decode an access token
 *
 * @param token - JWT access token to verify
 * @returns Decoded token payload
 * @throws Error if token is invalid, expired, or not an access token
 *
 * @example
 * try {
 *   const payload = verifyAccessToken(token);
 *   console.log('User ID:', payload.userId);
 * } catch (error) {
 *   console.error('Invalid token');
 * }
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'tiphub-auth',
      audience: 'tiphub-api',
    }) as AccessTokenPayload;

    // Ensure it's an access token
    if (decoded.type !== 'access') {
      throw new Error('Token is not an access token');
    }

    return decoded;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Access token expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid access token');
    } else {
      throw error;
    }
  }
}

/**
 * Verify and decode a refresh token
 *
 * @param token - JWT refresh token to verify
 * @returns Decoded token payload
 * @throws Error if token is invalid, expired, or not a refresh token
 *
 * @example
 * try {
 *   const payload = verifyRefreshToken(refreshToken);
 *   console.log('User ID:', payload.userId);
 * } catch (error) {
 *   console.error('Invalid refresh token');
 * }
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'tiphub-auth',
      audience: 'tiphub-api',
    }) as RefreshTokenPayload;

    // Ensure it's a refresh token
    if (decoded.type !== 'refresh') {
      throw new Error('Token is not a refresh token');
    }

    return decoded;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Refresh token expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid refresh token');
    } else {
      throw error;
    }
  }
}

/**
 * Decode a token without verifying (useful for debugging)
 *
 * @param token - JWT token to decode
 * @returns Decoded token payload (unverified!)
 *
 * @example
 * const payload = decodeTokenUnsafe(token);
 * console.log('Token expires at:', payload.exp);
 */
export function decodeTokenUnsafe(token: string): any {
  return jwt.decode(token);
}

/**
 * Get the expiration date from a token
 *
 * @param token - JWT token
 * @returns Date object representing expiration, or null if no expiry
 *
 * @example
 * const expiresAt = getTokenExpiry(token);
 * console.log('Token expires:', expiresAt);
 */
export function getTokenExpiry(token: string): Date | null {
  const decoded = decodeTokenUnsafe(token);
  if (decoded && decoded.exp) {
    return new Date(decoded.exp * 1000); // Convert Unix timestamp to Date
  }
  return null;
}

/**
 * Check if a token is expired
 *
 * @param token - JWT token
 * @returns True if token is expired, false otherwise
 *
 * @example
 * if (isTokenExpired(token)) {
 *   console.log('Token has expired');
 * }
 */
export function isTokenExpired(token: string): boolean {
  const expiry = getTokenExpiry(token);
  if (!expiry) {
    return false; // No expiry = never expires
  }
  return expiry.getTime() < Date.now();
}

/**
 * Get time until token expiration
 *
 * @param token - JWT token
 * @returns Milliseconds until expiration, or null if no expiry
 *
 * @example
 * const timeLeft = getTimeUntilExpiry(token);
 * if (timeLeft && timeLeft < 5 * 60 * 1000) {
 *   console.log('Token expires in less than 5 minutes');
 * }
 */
export function getTimeUntilExpiry(token: string): number | null {
  const expiry = getTokenExpiry(token);
  if (!expiry) {
    return null;
  }
  return expiry.getTime() - Date.now();
}

/**
 * Check if token should be refreshed soon
 *
 * @param token - JWT token
 * @param thresholdMinutes - Minutes before expiry to trigger refresh (default: 5)
 * @returns True if token should be refreshed
 *
 * @example
 * if (shouldRefreshToken(token, 10)) {
 *   const newToken = await refreshAccessToken();
 * }
 */
export function shouldRefreshToken(
  token: string,
  thresholdMinutes: number = 5
): boolean {
  const timeLeft = getTimeUntilExpiry(token);
  if (!timeLeft) {
    return false;
  }
  return timeLeft < thresholdMinutes * 60 * 1000;
}

/**
 * Generate both access and refresh tokens
 *
 * @param user - User data
 * @returns Object with both tokens and expiry info
 *
 * @example
 * const { accessToken, refreshToken, expiresAt } = generateTokenPair(user);
 */
export function generateTokenPair(user: {
  id: string;
  email: string;
  username: string;
  tier: UserTier;
  provider: 'password' | 'google';
  role?: UserRole;
  primaryPlatformId?: string | null;
}): {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  issuedAt: Date;
} {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user.id);
  const expiresAt = getTokenExpiry(accessToken) || new Date(Date.now() + 6 * 60 * 60 * 1000);
  const issuedAt = new Date();

  return {
    accessToken,
    refreshToken,
    expiresAt,
    issuedAt,
  };
}

// Export constants for external use
export const TOKEN_ISSUER = 'tiphub-auth';
export const TOKEN_AUDIENCE = 'tiphub-api';
export { JWT_ACCESS_EXPIRY, JWT_REFRESH_EXPIRY };
