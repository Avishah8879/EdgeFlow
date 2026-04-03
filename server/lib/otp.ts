/**
 * OTP (One-Time Password) System
 *
 * Provides OTP generation, storage, and verification for:
 * - Password reset
 * - Email verification
 *
 * In development mode, uses a fixed OTP "123456" for easy testing.
 * In production, generates random 6-digit codes.
 */

import crypto from 'crypto';
import { query, queryOne } from '../db/auth-connection';

// OTP Configuration
const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 15; // 15 minutes
const MAX_OTP_ATTEMPTS = 5; // Max verification attempts before lockout
const DEV_OTP = '123456'; // Fixed OTP for development

type OTPPurpose = 'password_reset' | 'email_verification' | 'account_deletion';

interface OTPRecord {
  id: string;
  user_id: string;
  email: string;
  code: string;
  purpose: OTPPurpose;
  expires_at: Date;
  attempts: number;
  verified_at: Date | null;
  created_at: Date;
}

/**
 * Generate a random 6-digit OTP code
 * In development mode, returns fixed code "123456"
 */
function generateOTPCode(): string {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[OTP] Development mode - using fixed OTP');
    return DEV_OTP;
  }

  // Generate cryptographically secure random number
  const randomBytes = crypto.randomBytes(4);
  const randomNum = randomBytes.readUInt32BE(0);
  const code = (randomNum % 1000000).toString().padStart(OTP_LENGTH, '0');
  return code;
}

/**
 * Hash OTP code for secure storage
 */
function hashOTPCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Create and store a new OTP for a user
 *
 * @param userId - User ID
 * @param email - User's email
 * @param purpose - What the OTP is for
 * @returns The plaintext OTP code (to send via email)
 */
export async function createOTP(
  userId: string,
  email: string,
  purpose: OTPPurpose
): Promise<string> {
  // Invalidate any existing OTPs for this user and purpose
  await query(
    `UPDATE otp_codes
     SET verified_at = NOW()
     WHERE user_id = $1 AND purpose = $2 AND verified_at IS NULL`,
    [userId, purpose]
  );

  // Generate new OTP
  const code = generateOTPCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Store OTP (plain text - short-lived single-use codes don't require hashing)
  await query(
    `INSERT INTO otp_codes (user_id, email, code, purpose, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, email, code, purpose, expiresAt]
  );

  return code;
}

/**
 * Verify an OTP code
 *
 * @param email - User's email
 * @param code - The OTP code to verify
 * @param purpose - What the OTP is for
 * @returns Object with success status and user_id if valid
 */
export async function verifyOTP(
  email: string,
  code: string,
  purpose: OTPPurpose
): Promise<{ valid: boolean; userId?: string; error?: string }> {
  // Find valid OTP
  const otp = await queryOne<OTPRecord>(
    `SELECT * FROM otp_codes
     WHERE email = $1 AND purpose = $2 AND verified_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [email, purpose]
  );

  if (!otp) {
    return { valid: false, error: 'No pending verification found' };
  }

  // Check if expired
  if (new Date(otp.expires_at) < new Date()) {
    return { valid: false, error: 'Verification code has expired' };
  }

  // Check if too many attempts
  if (otp.attempts >= MAX_OTP_ATTEMPTS) {
    return { valid: false, error: 'Too many failed attempts. Please request a new code.' };
  }

  // Verify code (plain text comparison)
  if (otp.code !== code) {
    // Increment attempts
    await query(
      `UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`,
      [otp.id]
    );
    return { valid: false, error: 'Invalid verification code' };
  }

  // Mark as verified
  await query(
    `UPDATE otp_codes SET verified_at = NOW() WHERE id = $1`,
    [otp.id]
  );

  return { valid: true, userId: otp.user_id };
}

/**
 * Check if user has a valid pending OTP
 */
export async function hasPendingOTP(
  userId: string,
  purpose: OTPPurpose
): Promise<boolean> {
  const result = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM otp_codes
     WHERE user_id = $1 AND purpose = $2 AND verified_at IS NULL AND expires_at > NOW()`,
    [userId, purpose]
  );
  return parseInt(result?.count || '0') > 0;
}

/**
 * Get OTP expiry time
 */
export async function getOTPExpiry(
  userId: string,
  purpose: OTPPurpose
): Promise<Date | null> {
  const result = await queryOne<{ expires_at: Date }>(
    `SELECT expires_at FROM otp_codes
     WHERE user_id = $1 AND purpose = $2 AND verified_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, purpose]
  );
  return result?.expires_at || null;
}

/**
 * Clean up expired OTPs (run periodically)
 */
export async function cleanupExpiredOTPs(): Promise<number> {
  const result = await query(
    `DELETE FROM otp_codes WHERE expires_at < NOW() - INTERVAL '24 hours'`
  );
  return result.rowCount || 0;
}

// Export constants
export const OTP_CONFIG = {
  length: OTP_LENGTH,
  expiryMinutes: OTP_EXPIRY_MINUTES,
  maxAttempts: MAX_OTP_ATTEMPTS,
};
