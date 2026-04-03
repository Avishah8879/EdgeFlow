/**
 * Bcrypt Password Hashing Module
 *
 * Provides secure password hashing using bcrypt for the new V2 authentication system.
 * Uses cost factor 12 for strong security while maintaining reasonable performance.
 *
 * IMPORTANT: This is the NEW password hashing system.
 * The OLD SHA-256 based system remains in server/auth/store.ts for backward compatibility.
 */

import bcrypt from 'bcrypt';

// Bcrypt cost factor (number of salt rounds)
// Higher = more secure but slower
// 12 is a good balance for 2024 (takes ~200-400ms per hash)
const SALT_ROUNDS = 12;

/**
 * Hash a password using bcrypt
 *
 * @param password - Plain text password to hash
 * @returns Promise resolving to bcrypt hash string
 *
 * @example
 * const hash = await hashPasswordBcrypt('MySecurePassword123!');
 * // Returns: '$2b$12$...' (60 character string)
 */
export async function hashPasswordBcrypt(password: string): Promise<string> {
  if (!password || password.length === 0) {
    throw new Error('Password cannot be empty');
  }

  if (password.length > 72) {
    // Bcrypt max input length is 72 bytes
    throw new Error('Password is too long (max 72 characters)');
  }

  try {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    return hash;
  } catch (error: any) {
    console.error('[PASSWORD_BCRYPT] Hashing error:', error.message);
    throw new Error('Password hashing failed');
  }
}

/**
 * Verify a password against a bcrypt hash
 *
 * @param password - Plain text password to verify
 * @param hash - Bcrypt hash to compare against
 * @returns Promise resolving to true if password matches, false otherwise
 *
 * @example
 * const isValid = await verifyPasswordBcrypt('MySecurePassword123!', storedHash);
 * if (isValid) {
 *   // Password is correct
 * }
 */
export async function verifyPasswordBcrypt(
  password: string,
  hash: string
): Promise<boolean> {
  if (!password || !hash) {
    return false;
  }

  try {
    const isMatch = await bcrypt.compare(password, hash);
    return isMatch;
  } catch (error: any) {
    console.error('[PASSWORD_BCRYPT] Verification error:', error.message);
    return false;
  }
}

/**
 * Check if a hash is a valid bcrypt hash
 *
 * @param hash - String to check
 * @returns True if string is a valid bcrypt hash format
 *
 * @example
 * isBcryptHash('$2b$12$...') // true
 * isBcryptHash('sha256hash')  // false
 */
export function isBcryptHash(hash: string): boolean {
  // Bcrypt hashes start with $2a$, $2b$, or $2y$ followed by cost factor
  const bcryptRegex = /^\$2[aby]\$\d{2}\$.{53}$/;
  return bcryptRegex.test(hash);
}

/**
 * Get the cost factor (rounds) from a bcrypt hash
 *
 * @param hash - Bcrypt hash string
 * @returns Cost factor number, or null if invalid hash
 *
 * @example
 * getBcryptCost('$2b$12$...')  // 12
 */
export function getBcryptCost(hash: string): number | null {
  const match = hash.match(/^\$2[aby]\$(\d{2})\$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Check if a password meets minimum security requirements
 *
 * @param password - Password to validate
 * @returns Object with validation result and error message
 *
 * Requirements:
 * - At least 8 characters
 * - Contains at least one uppercase letter
 * - Contains at least one lowercase letter
 * - Contains at least one number
 * - Contains at least one special character
 *
 * @example
 * const result = validatePasswordStrength('weak');
 * if (!result.valid) {
 *   console.log(result.message);
 * }
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  message?: string;
} {
  if (password.length < 8) {
    return {
      valid: false,
      message: 'Password must be at least 8 characters long',
    };
  }

  if (password.length > 72) {
    return {
      valid: false,
      message: 'Password is too long (max 72 characters)',
    };
  }

  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one uppercase letter',
    };
  }

  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one lowercase letter',
    };
  }

  if (!/[0-9]/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one number',
    };
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one special character',
    };
  }

  return { valid: true };
}

/**
 * Generate a random secure password
 *
 * @param length - Password length (default: 16)
 * @returns Random password meeting strength requirements
 *
 * @example
 * const password = generateSecurePassword(20);
 * console.log(password); // 'Xy9$mP2@qR5#nL8%tV4&'
 */
export function generateSecurePassword(length: number = 16): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{};\':"|,.<>/?';
  const all = uppercase + lowercase + numbers + special;

  let password = '';

  // Ensure at least one character from each category
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];

  // Fill remaining length with random characters
  for (let i = 4; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  // Shuffle the password
  return password
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}

// Export constants for external use
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;
export const BCRYPT_COST_FACTOR = SALT_ROUNDS;
