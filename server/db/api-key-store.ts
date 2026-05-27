/**
 * API Key Store
 *
 * CRUD operations for API keys in the Tiphub_auth database.
 * Handles key generation, hashing, lookup, and revocation.
 */

import crypto from 'crypto';
import { query, queryOne, transaction } from './auth-connection';
import { decryptApiKey, encryptApiKey } from '../lib/key-encryption';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  encrypted_key?: string;
  tier: 'basic' | 'premium' | 'enterprise';
  key_type: 'standard' | 'admin' | 'platform_embed';
  platform_slug: string | null;
  rate_limit_per_minute: number;
  rate_limit_per_hour: number;
  rate_limit_per_day: number;
  allowed_origins: string[];
  allowed_ips: string[];
  allowed_endpoints: string[];
  created_by: string | null;
  description: string | null;
  is_active: boolean;
  last_used_at: string | null;
  last_used_ip: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateKeyOptions {
  userId: string;
  name: string;
  allowedOrigins?: string[];
  // Admin key options (only used when creating admin/enterprise keys)
  tier?: 'basic' | 'premium' | 'enterprise';
  keyType?: 'standard' | 'admin' | 'platform_embed';
  platformSlug?: string;
  rateLimitPerMinute?: number;
  rateLimitPerHour?: number;
  rateLimitPerDay?: number;
  allowedIps?: string[];
  allowedEndpoints?: string[];
  createdBy?: string;
  description?: string;
  expiresAt?: string;
}

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

const KEY_PREFIX = 'tphb_live_';

/**
 * Generate a new API key with its prefix and hash.
 * Returns the full key (shown once to user), the display prefix, and SHA-256 hash.
 */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const randomBytes = crypto.randomBytes(32);
  const encoded = randomBytes.toString('base64url'); // ~43 chars
  const key = `${KEY_PREFIX}${encoded}`;
  const prefix = key.substring(0, 12);
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  return { key, prefix, hash };
}

/**
 * Hash a raw API key for lookup.
 */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/** Default rate limits by tier */
const TIER_DEFAULTS: Record<string, { min: number; hr: number; day: number }> = {
  basic: { min: 20, hr: 500, day: 5000 },
  premium: { min: 60, hr: 2000, day: 25000 },
  enterprise: { min: 200, hr: 10000, day: 100000 },
};

/** Max keys per user tier */
const MAX_KEYS: Record<string, number> = {
  basic: 2,
  premium: 10,
};

/**
 * Create a new API key.
 * Returns the full key (shown once) and the persisted record.
 */
export async function createApiKey(opts: CreateKeyOptions): Promise<{ fullKey: string; record: ApiKey }> {
  const tier = opts.tier || 'basic';
  const keyType = opts.keyType || 'standard';
  const defaults = TIER_DEFAULTS[tier] || TIER_DEFAULTS.basic;

  // Enforce max key limit for standard keys
  if (keyType === 'standard') {
    const existing = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM api_keys WHERE user_id = $1 AND is_active = TRUE AND revoked_at IS NULL`,
      [opts.userId]
    );
    const count = parseInt(existing.rows[0]?.count || '0', 10);
    const limit = MAX_KEYS[tier] || MAX_KEYS.basic;
    if (count >= limit) {
      throw new Error(`Maximum ${limit} active API keys allowed for ${tier} tier`);
    }
  }

  const { key, prefix, hash } = generateApiKey();
  const encrypted = encryptApiKey(key);

  const result = await queryOne<ApiKey>(
    `INSERT INTO api_keys (
      user_id, name, key_prefix, key_hash, encrypted_key, tier, key_type,
      platform_slug,
      rate_limit_per_minute, rate_limit_per_hour, rate_limit_per_day,
      allowed_origins, allowed_ips, allowed_endpoints,
      created_by, description, expires_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    RETURNING *`,
    [
      opts.userId,
      opts.name,
      prefix,
      hash,
      encrypted,
      tier,
      keyType,
      opts.platformSlug || null,
      opts.rateLimitPerMinute ?? defaults.min,
      opts.rateLimitPerHour ?? defaults.hr,
      opts.rateLimitPerDay ?? defaults.day,
      opts.allowedOrigins || [],
      opts.allowedIps || [],
      opts.allowedEndpoints || [],
      opts.createdBy || null,
      opts.description || null,
      opts.expiresAt || null,
    ]
  );

  return { fullKey: key, record: result! };
}

/**
 * Find an active, non-expired embed key for a user/platform pair.
 */
export async function findActivePlatformKey(userId: string, slug: string): Promise<ApiKey | null> {
  return queryOne<ApiKey>(
    `SELECT *
     FROM api_keys
     WHERE user_id = $1
       AND platform_slug = $2
       AND key_type = 'platform_embed'
       AND is_active = TRUE
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, slug]
  );
}

/**
 * Decrypt the stored plaintext representation for reveal-style flows.
 */
export function revealApiKey(record: ApiKey): string {
  if (!record.encrypted_key) {
    throw new Error('API key cannot be revealed because encrypted_key is missing');
  }
  return decryptApiKey(record.encrypted_key);
}

/**
 * Find a key by its SHA-256 hash.
 * Used during request validation.
 */
export async function findByHash(hash: string): Promise<ApiKey | null> {
  return queryOne<ApiKey>(
    `SELECT * FROM api_keys WHERE key_hash = $1`,
    [hash]
  );
}

/**
 * List keys for a user (no full key or hash exposed).
 */
export async function listUserKeys(userId: string): Promise<ApiKey[]> {
  const result = await query<ApiKey>(
    `SELECT * FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * Get a single key by ID (must belong to user or be requested by admin).
 */
export async function getKeyById(keyId: string, userId?: string): Promise<ApiKey | null> {
  if (userId) {
    return queryOne<ApiKey>(
      `SELECT * FROM api_keys WHERE id = $1 AND user_id = $2`,
      [keyId, userId]
    );
  }
  return queryOne<ApiKey>(
    `SELECT * FROM api_keys WHERE id = $1`,
    [keyId]
  );
}

/**
 * Update a key's name and allowed_origins.
 */
export async function updateKey(
  keyId: string,
  updatesOrUserId: string | Record<string, any>,
  updatesLegacy?: { name?: string; allowedOrigins?: string[] }
): Promise<ApiKey | null> {
  // Support both old signature (keyId, userId, updates) and new (keyId, updates)
  let updates: Record<string, any>;
  let userId: string | undefined;

  if (typeof updatesOrUserId === 'string') {
    // Legacy: updateKey(keyId, userId, { name, allowedOrigins })
    userId = updatesOrUserId;
    updates = {};
    if (updatesLegacy?.name !== undefined) updates.name = updatesLegacy.name;
    if (updatesLegacy?.allowedOrigins !== undefined) updates.allowed_origins = updatesLegacy.allowedOrigins;
  } else {
    // New: updateKey(keyId, { name, tier, rate_limit_per_minute, ... })
    updates = updatesOrUserId;
  }

  const allowedColumns = [
    'name', 'description', 'tier',
    'rate_limit_per_minute', 'rate_limit_per_hour', 'rate_limit_per_day',
    'allowed_origins', 'allowed_ips', 'allowed_endpoints', 'expires_at',
  ];

  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;

  for (const col of allowedColumns) {
    if (updates[col] !== undefined) {
      sets.push(`${col} = $${idx++}`);
      params.push(updates[col]);
    }
  }

  if (sets.length === 0) return getKeyById(keyId, userId);

  let whereClause = `id = $${idx++}`;
  params.push(keyId);

  if (userId) {
    whereClause += ` AND user_id = $${idx}`;
    params.push(userId);
  }

  return queryOne<ApiKey>(
    `UPDATE api_keys SET ${sets.join(', ')} WHERE ${whereClause} RETURNING *`,
    params
  );
}

/**
 * Revoke (soft-delete) a key.
 */
export async function revokeKey(
  keyId: string,
  userId: string,
  reason?: string
): Promise<ApiKey | null> {
  return queryOne<ApiKey>(
    `UPDATE api_keys SET
      is_active = FALSE,
      revoked_at = NOW(),
      revoked_reason = $3
    WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
    RETURNING *`,
    [keyId, userId, reason || null]
  );
}

/**
 * Rotate a key: revoke old, create new with same settings.
 * Returns the new full key and record.
 */
export async function rotateKey(
  keyId: string,
  userId: string
): Promise<{ fullKey: string; record: ApiKey } | null> {
  const old = await getKeyById(keyId, userId);
  if (!old || old.revoked_at) return null;

  return transaction(async (client) => {
    // Revoke old key
    await client.query(
      `UPDATE api_keys SET is_active = FALSE, revoked_at = NOW(), revoked_reason = 'rotated' WHERE id = $1`,
      [keyId]
    );

    // Create new key with same settings
    const { key, prefix, hash } = generateApiKey();
    const encrypted = encryptApiKey(key);
    const result = await client.query(
      `INSERT INTO api_keys (
        user_id, name, key_prefix, key_hash, encrypted_key, tier, key_type,
        platform_slug,
        rate_limit_per_minute, rate_limit_per_hour, rate_limit_per_day,
        allowed_origins, allowed_ips, allowed_endpoints,
        created_by, description, expires_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *`,
      [
        old.user_id, old.name, prefix, hash, encrypted, old.tier, old.key_type,
        old.platform_slug,
        old.rate_limit_per_minute, old.rate_limit_per_hour, old.rate_limit_per_day,
        old.allowed_origins, old.allowed_ips, old.allowed_endpoints,
        old.created_by, old.description, old.expires_at,
      ]
    );

    return { fullKey: key, record: result.rows[0] as ApiKey };
  });
}

/**
 * Update last_used_at and last_used_ip for a key.
 * Fire-and-forget — errors are logged but not thrown.
 */
export async function updateLastUsed(keyId: string, ip: string): Promise<void> {
  try {
    await query(
      `UPDATE api_keys SET last_used_at = NOW(), last_used_ip = $2 WHERE id = $1`,
      [keyId, ip]
    );
  } catch (err: any) {
    console.error('[API_KEY_STORE] Failed to update last_used:', err.message);
  }
}
