import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Derive a 256-bit encryption key from JWT_SECRET via SHA-256.
 * Cached on first call.
 */
let derivedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (derivedKey) return derivedKey;

  const secret = process.env.API_KEY_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error('FATAL: API_KEY_ENCRYPTION_KEY or JWT_SECRET required');
  derivedKey = crypto.createHash('sha256').update(secret).digest();
  return derivedKey;
}

/**
 * Encrypt an API key using AES-256-GCM.
 * Returns a string in the format: iv:authTag:ciphertext (hex-encoded).
 */
export function encryptApiKey(plainKey: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plainKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an API key from the iv:authTag:ciphertext format.
 * Returns the original plaintext key.
 * Throws on tampered or invalid data.
 */
export function decryptApiKey(encryptedStr: string): string {
  const parts = encryptedStr.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted key format');
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
