/**
 * Platform Store
 *
 * CRUD for the `platforms` and `platform_api_keys` tables (Tiphub_auth DB).
 * Keys are stored as SHA-256 hashes — plaintext is only returned on creation.
 */

import crypto from 'crypto';
import { query, queryOne } from './auth-connection';

export interface Platform {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PlatformApiKey {
  id: string;
  platform_id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at: Date | null;
  last_used_ip: string | null;
  created_by: string | null;
  created_at: Date;
  revoked_at: Date | null;
  revoked_reason: string | null;
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

// ─── Platforms ──────────────────────────────────────────────────────────────

export async function listPlatforms(): Promise<Platform[]> {
  const r = await query<Platform>(
    `SELECT id, slug, name, description, is_active, created_at, updated_at
     FROM platforms ORDER BY created_at ASC`,
  );
  return r.rows;
}

export async function getPlatformById(id: string): Promise<Platform | null> {
  return queryOne<Platform>(
    `SELECT id, slug, name, description, is_active, created_at, updated_at
     FROM platforms WHERE id = $1`,
    [id],
  );
}

export async function getPlatformBySlug(slug: string): Promise<Platform | null> {
  return queryOne<Platform>(
    `SELECT id, slug, name, description, is_active, created_at, updated_at
     FROM platforms WHERE slug = $1`,
    [slug],
  );
}

export async function createPlatform(input: {
  slug: string;
  name: string;
  description?: string;
}): Promise<Platform> {
  const r = await query<Platform>(
    `INSERT INTO platforms (slug, name, description, is_active)
     VALUES ($1, $2, $3, TRUE)
     RETURNING id, slug, name, description, is_active, created_at, updated_at`,
    [input.slug, input.name, input.description ?? null],
  );
  return r.rows[0];
}

export async function updatePlatform(
  id: string,
  patch: { name?: string; description?: string | null; is_active?: boolean },
): Promise<Platform | null> {
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (patch.name !== undefined) { sets.push(`name = $${i++}`); params.push(patch.name); }
  if (patch.description !== undefined) { sets.push(`description = $${i++}`); params.push(patch.description); }
  if (patch.is_active !== undefined) { sets.push(`is_active = $${i++}`); params.push(patch.is_active); }
  if (sets.length === 0) return getPlatformById(id);
  params.push(id);
  const r = await query<Platform>(
    `UPDATE platforms SET ${sets.join(', ')} WHERE id = $${i}
     RETURNING id, slug, name, description, is_active, created_at, updated_at`,
    params,
  );
  return r.rows[0] ?? null;
}

// ─── Platform API keys (HMAC) ───────────────────────────────────────────────

/**
 * Create a new API key for a platform. Returns the full secret material to the
 * caller exactly once — only hashes are stored.
 */
export async function createPlatformApiKey(input: {
  platformId: string;
  name: string;
  createdBy?: string;
}): Promise<{
  record: PlatformApiKey;
  publicKey: string;     // shown to admin once
  secret: string;        // shown to admin once
}> {
  // Public key: pk_<32 hex>; secret: sk_<48 hex>
  const publicKeyRaw = crypto.randomBytes(16).toString('hex');
  const secretRaw = crypto.randomBytes(24).toString('hex');
  const publicKey = `pk_${publicKeyRaw}`;
  const secret = `sk_${secretRaw}`;
  const keyPrefix = publicKey.slice(0, 12);
  const keyHash = sha256(publicKey);
  const secretHash = sha256(secret);

  const r = await query<PlatformApiKey>(
    `INSERT INTO platform_api_keys
       (platform_id, name, key_prefix, key_hash, secret_hash, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, platform_id, name, key_prefix, is_active, last_used_at,
               last_used_ip, created_by, created_at, revoked_at, revoked_reason`,
    [input.platformId, input.name, keyPrefix, keyHash, secretHash, input.createdBy ?? null],
  );
  return { record: r.rows[0], publicKey, secret };
}

export async function listKeysForPlatform(platformId: string): Promise<PlatformApiKey[]> {
  const r = await query<PlatformApiKey>(
    `SELECT id, platform_id, name, key_prefix, is_active, last_used_at,
            last_used_ip, created_by, created_at, revoked_at, revoked_reason
     FROM platform_api_keys
     WHERE platform_id = $1
     ORDER BY created_at DESC`,
    [platformId],
  );
  return r.rows;
}

export async function revokePlatformApiKey(
  id: string,
  reason?: string,
): Promise<void> {
  await query(
    `UPDATE platform_api_keys
     SET is_active = FALSE,
         revoked_at = NOW(),
         revoked_reason = $2
     WHERE id = $1`,
    [id, reason ?? null],
  );
}

/**
 * Look up an active key by its public key string. Returns the platform + key
 * record + secret_hash (used to verify the HMAC signature). Returns null if
 * the key is unknown, revoked, or its platform is inactive.
 */
export async function findKeyByPublicKey(publicKey: string): Promise<
  | { platform: Platform; key: PlatformApiKey; secretHash: string }
  | null
> {
  const keyHash = sha256(publicKey);
  const row = await queryOne<any>(
    `SELECT
       k.id AS k_id, k.platform_id AS k_platform_id, k.name AS k_name,
       k.key_prefix AS k_key_prefix, k.is_active AS k_is_active,
       k.last_used_at AS k_last_used_at, k.last_used_ip AS k_last_used_ip,
       k.created_by AS k_created_by, k.created_at AS k_created_at,
       k.revoked_at AS k_revoked_at, k.revoked_reason AS k_revoked_reason,
       k.secret_hash AS k_secret_hash,
       p.id AS p_id, p.slug AS p_slug, p.name AS p_name,
       p.description AS p_description, p.is_active AS p_is_active,
       p.created_at AS p_created_at, p.updated_at AS p_updated_at
     FROM platform_api_keys k
     JOIN platforms p ON p.id = k.platform_id
     WHERE k.key_hash = $1
       AND k.is_active = TRUE
       AND p.is_active = TRUE`,
    [keyHash],
  );
  if (!row) return null;
  return {
    platform: {
      id: row.p_id,
      slug: row.p_slug,
      name: row.p_name,
      description: row.p_description,
      is_active: row.p_is_active,
      created_at: row.p_created_at,
      updated_at: row.p_updated_at,
    },
    key: {
      id: row.k_id,
      platform_id: row.k_platform_id,
      name: row.k_name,
      key_prefix: row.k_key_prefix,
      is_active: row.k_is_active,
      last_used_at: row.k_last_used_at,
      last_used_ip: row.k_last_used_ip,
      created_by: row.k_created_by,
      created_at: row.k_created_at,
      revoked_at: row.k_revoked_at,
      revoked_reason: row.k_revoked_reason,
    },
    secretHash: row.k_secret_hash,
  };
}

export async function touchPlatformApiKey(id: string, ip: string | null): Promise<void> {
  await query(
    `UPDATE platform_api_keys
     SET last_used_at = NOW(), last_used_ip = $2
     WHERE id = $1`,
    [id, ip],
  );
}
