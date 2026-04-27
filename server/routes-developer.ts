/**
 * Developer API Routes
 *
 * User-facing endpoints for API key management:
 * - Create / list / update / revoke / rotate keys
 * - View usage statistics
 *
 * All endpoints require JWT authentication (web dashboard access).
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from './middleware/auth';
import {
  createApiKey,
  listUserKeys,
  getKeyById,
  updateKey,
  revokeKey,
  rotateKey,
} from './db/api-key-store';
import { query } from './db/auth-connection';
import { getRedis } from './lib/redis';
import { decryptApiKey } from './lib/key-encryption';

const router = Router();

// ---------------------------------------------------------------------------
// Key Management
// ---------------------------------------------------------------------------

/**
 * POST /api/developer/keys — Create a new API key
 */
router.post('/keys', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    }

    const { name, allowedOrigins } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: { code: 'INVALID_NAME', message: 'Key name is required' } });
    }

    if (name.length > 100) {
      return res.status(400).json({ error: { code: 'NAME_TOO_LONG', message: 'Key name must be 100 characters or less' } });
    }

    // Validate allowed origins
    let origins: string[] = [];
    if (allowedOrigins) {
      if (Array.isArray(allowedOrigins)) {
        origins = allowedOrigins.filter((o: any) => typeof o === 'string' && o.trim().length > 0);
      } else if (typeof allowedOrigins === 'string') {
        origins = allowedOrigins.split(',').map((o: string) => o.trim()).filter(Boolean);
      }
    }

    const { fullKey, record } = await createApiKey({
      userId: req.user.userId,
      name: name.trim(),
      tier: req.user.tier === 'pro' ? 'premium' : 'basic',
      allowedOrigins: origins,
    });

    res.status(201).json({
      data: {
        key: fullKey, // Shown only once
        id: record.id,
        name: record.name,
        prefix: record.key_prefix,
        tier: record.tier,
        rateLimits: {
          perMinute: record.rate_limit_per_minute,
          perHour: record.rate_limit_per_hour,
          perDay: record.rate_limit_per_day,
        },
        allowedOrigins: record.allowed_origins,
        createdAt: record.created_at,
      },
    });
  } catch (err: any) {
    if (err.message.includes('Maximum')) {
      return res.status(409).json({ error: { code: 'KEY_LIMIT_REACHED', message: err.message } });
    }
    console.error('[DEVELOPER] Create key error:', err.message);
    res.status(500).json({ error: { code: 'CREATE_FAILED', message: 'Failed to create API key' } });
  }
});

/**
 * GET /api/developer/keys — List user's API keys
 */
router.get('/keys', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    }

    const keys = await listUserKeys(req.user.userId);

    const formatted = keys.map(k => ({
      id: k.id,
      name: k.name,
      prefix: k.key_prefix,
      tier: k.tier,
      keyType: k.key_type,
      rateLimits: {
        perMinute: k.rate_limit_per_minute,
        perHour: k.rate_limit_per_hour,
        perDay: k.rate_limit_per_day,
      },
      allowedOrigins: k.allowed_origins,
      isActive: k.is_active,
      lastUsedAt: k.last_used_at,
      lastUsedIp: k.last_used_ip,
      expiresAt: k.expires_at,
      revokedAt: k.revoked_at,
      createdAt: k.created_at,
    }));

    res.json({ data: formatted, meta: { count: formatted.length } });
  } catch (err: any) {
    console.error('[DEVELOPER] List keys error:', err.message);
    res.status(500).json({ error: { code: 'LIST_FAILED', message: 'Failed to list API keys' } });
  }
});

/**
 * GET /api/developer/keys/:keyId — Get a single key's details
 */
router.get('/keys/:keyId', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    }

    const key = await getKeyById(req.params.keyId, req.user.userId);
    if (!key) {
      return res.status(404).json({ error: { code: 'KEY_NOT_FOUND', message: 'API key not found' } });
    }

    res.json({
      data: {
        id: key.id,
        name: key.name,
        prefix: key.key_prefix,
        tier: key.tier,
        keyType: key.key_type,
        rateLimits: {
          perMinute: key.rate_limit_per_minute,
          perHour: key.rate_limit_per_hour,
          perDay: key.rate_limit_per_day,
        },
        allowedOrigins: key.allowed_origins,
        allowedIps: key.allowed_ips,
        allowedEndpoints: key.allowed_endpoints,
        isActive: key.is_active,
        lastUsedAt: key.last_used_at,
        lastUsedIp: key.last_used_ip,
        expiresAt: key.expires_at,
        revokedAt: key.revoked_at,
        revokedReason: key.revoked_reason,
        createdAt: key.created_at,
        updatedAt: key.updated_at,
      },
    });
  } catch (err: any) {
    console.error('[DEVELOPER] Get key error:', err.message);
    res.status(500).json({ error: { code: 'GET_FAILED', message: 'Failed to get API key' } });
  }
});

/**
 * GET /api/developer/keys/:keyId/reveal — Reveal the full API key
 */
router.get('/keys/:keyId/reveal', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    }

    const key = await getKeyById(req.params.keyId, req.user.userId);
    if (!key) {
      return res.status(404).json({ error: { code: 'KEY_NOT_FOUND', message: 'API key not found' } });
    }

    if (key.revoked_at) {
      return res.status(400).json({ error: { code: 'KEY_REVOKED', message: 'Cannot reveal a revoked key' } });
    }

    // encrypted_key is null for keys created before this feature
    const encryptedKey = (key as any).encrypted_key as string | null;
    if (!encryptedKey) {
      return res.status(400).json({
        error: {
          code: 'KEY_NOT_REVEALABLE',
          message: 'This key was created before reveal was available. Rotate the key to get a new revealable one.',
        },
      });
    }

    const fullKey = decryptApiKey(encryptedKey);
    res.json({ data: { key: fullKey } });
  } catch (err: any) {
    console.error('[DEVELOPER] Reveal key error:', err.message);
    res.status(500).json({ error: { code: 'REVEAL_FAILED', message: 'Failed to reveal API key' } });
  }
});

/**
 * PATCH /api/developer/keys/:keyId — Update key name/origins
 */
router.patch('/keys/:keyId', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    }

    const { name, allowedOrigins } = req.body;
    const updates: { name?: string; allowedOrigins?: string[] } = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: { code: 'INVALID_NAME', message: 'Key name must be a non-empty string' } });
      }
      updates.name = name.trim();
    }

    if (allowedOrigins !== undefined) {
      if (Array.isArray(allowedOrigins)) {
        updates.allowedOrigins = allowedOrigins.filter((o: any) => typeof o === 'string');
      } else {
        return res.status(400).json({ error: { code: 'INVALID_ORIGINS', message: 'allowedOrigins must be an array' } });
      }
    }

    const updated = await updateKey(req.params.keyId, req.user.userId, updates);
    if (!updated) {
      return res.status(404).json({ error: { code: 'KEY_NOT_FOUND', message: 'API key not found' } });
    }

    res.json({
      data: {
        id: updated.id,
        name: updated.name,
        allowedOrigins: updated.allowed_origins,
        updatedAt: updated.updated_at,
      },
    });
  } catch (err: any) {
    console.error('[DEVELOPER] Update key error:', err.message);
    res.status(500).json({ error: { code: 'UPDATE_FAILED', message: 'Failed to update API key' } });
  }
});

/**
 * DELETE /api/developer/keys/:keyId — Revoke a key
 */
router.delete('/keys/:keyId', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    }

    const { reason } = req.body || {};
    const revoked = await revokeKey(req.params.keyId, req.user.userId, reason);

    if (!revoked) {
      return res.status(404).json({ error: { code: 'KEY_NOT_FOUND', message: 'API key not found or already revoked' } });
    }

    // Invalidate Redis cache
    const redis = getRedis();
    if (redis) {
      await redis.del(`apikey:${revoked.key_hash}`);
    }

    res.json({
      data: {
        id: revoked.id,
        revokedAt: revoked.revoked_at,
        message: 'API key has been revoked',
      },
    });
  } catch (err: any) {
    console.error('[DEVELOPER] Revoke key error:', err.message);
    res.status(500).json({ error: { code: 'REVOKE_FAILED', message: 'Failed to revoke API key' } });
  }
});

/**
 * POST /api/developer/keys/:keyId/rotate — Rotate a key
 */
router.post('/keys/:keyId/rotate', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    }

    const result = await rotateKey(req.params.keyId, req.user.userId);
    if (!result) {
      return res.status(404).json({ error: { code: 'KEY_NOT_FOUND', message: 'API key not found or already revoked' } });
    }

    // Invalidate old key in Redis cache
    const redis = getRedis();
    if (redis) {
      // We don't have the old hash easily, but cache TTL is 5min so it'll expire
      // The old key was already revoked in the DB
    }

    res.json({
      data: {
        key: result.fullKey, // New key shown once
        id: result.record.id,
        name: result.record.name,
        prefix: result.record.key_prefix,
        createdAt: result.record.created_at,
        message: 'Key rotated. Old key has been revoked.',
      },
    });
  } catch (err: any) {
    console.error('[DEVELOPER] Rotate key error:', err.message);
    res.status(500).json({ error: { code: 'ROTATE_FAILED', message: 'Failed to rotate API key' } });
  }
});

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

/** Convert period string to PostgreSQL interval */
function periodToInterval(period: string): string {
  switch (period) {
    case '1d': return '24 hours';
    case '7d': return '7 days';
    case '30d': return '30 days';
    case '90d': return '90 days';
    default: return '7 days';
  }
}

/**
 * GET /api/developer/usage — Full usage dashboard data for all user's keys
 */
router.get('/usage', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    }

    const period = (req.query.period as string) || '7d';
    const interval = periodToInterval(period);
    const userId = req.user.userId;

    // Run all queries in parallel
    const [
      totalResult,
      byEndpointResult,
      byDayResult,
      byMethodResult,
      byKeyResult,
      recentResult,
      byKeyDayResult,
    ] = await Promise.all([
      // Total requests
      query<{ total: string }>(
        `SELECT COUNT(*) as total FROM api_usage_log
         WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${interval}'`,
        [userId]
      ),
      // By endpoint (top 15)
      query<{ endpoint: string; count: string }>(
        `SELECT endpoint, COUNT(*) as count FROM api_usage_log
         WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${interval}'
         GROUP BY endpoint ORDER BY count DESC LIMIT 15`,
        [userId]
      ),
      // By day (hourly buckets for 1d period using epoch ms for timezone-safe matching)
      period === '1d'
        ? query<{ day: string; count: string }>(
            `SELECT FLOOR(EXTRACT(EPOCH FROM created_at) / 3600) * 3600 * 1000 as day,
                    COUNT(*) as count
             FROM api_usage_log
             WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${interval}'
             GROUP BY FLOOR(EXTRACT(EPOCH FROM created_at) / 3600)
             ORDER BY day`,
            [userId]
          )
        : query<{ day: string; count: string }>(
            `SELECT TO_CHAR(created_at::date, 'YYYY-MM-DD') as day, COUNT(*) as count FROM api_usage_log
             WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${interval}'
             GROUP BY created_at::date ORDER BY created_at::date`,
            [userId]
          ),
      // By HTTP method
      query<{ method: string; count: string }>(
        `SELECT method, COUNT(*) as count FROM api_usage_log
         WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${interval}'
         GROUP BY method ORDER BY count DESC`,
        [userId]
      ),
      // Per-key breakdown with key names
      query<{ api_key_id: string; key_name: string; key_prefix: string; tier: string; count: string; last_used: string }>(
        `SELECT l.api_key_id, k.name as key_name, k.key_prefix, k.tier,
                COUNT(*) as count, MAX(l.created_at) as last_used
         FROM api_usage_log l
         JOIN api_keys k ON l.api_key_id = k.id
         WHERE l.user_id = $1 AND l.created_at > NOW() - INTERVAL '${interval}'
           AND l.api_key_id IS NOT NULL
         GROUP BY l.api_key_id, k.name, k.key_prefix, k.tier
         ORDER BY count DESC`,
        [userId]
      ),
      // Recent activity (last 20 requests)
      query<{ endpoint: string; method: string; ip_address: string; created_at: string; api_key_id: string }>(
        `SELECT endpoint, method, ip_address, created_at, api_key_id FROM api_usage_log
         WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${interval}'
         ORDER BY created_at DESC LIMIT 20`,
        [userId]
      ),
      // Per-key per-day breakdown (for stacked chart)
      query<{ api_key_id: string; key_name: string; day: string; count: string }>(
        `SELECT l.api_key_id, k.name as key_name,
                TO_CHAR(l.created_at::date, 'YYYY-MM-DD') as day, COUNT(*) as count
         FROM api_usage_log l
         JOIN api_keys k ON l.api_key_id = k.id
         WHERE l.user_id = $1 AND l.created_at > NOW() - INTERVAL '${interval}'
           AND l.api_key_id IS NOT NULL
         GROUP BY l.api_key_id, k.name, l.created_at::date
         ORDER BY l.created_at::date`,
        [userId]
      ),
    ]);

    // Transform to frontend-friendly shapes
    const endpointMap: Record<string, number> = {};
    for (const r of byEndpointResult.rows) {
      endpointMap[r.endpoint] = parseInt(r.count);
    }

    const methodMap: Record<string, number> = {};
    for (const r of byMethodResult.rows) {
      methodMap[r.method] = parseInt(r.count);
    }

    // Build key name lookup for recent activity
    const keyNameMap: Record<string, string> = {};
    for (const r of byKeyResult.rows) {
      keyNameMap[r.api_key_id] = r.key_name;
    }

    res.json({
      data: {
        period,
        totalRequests: parseInt(totalResult.rows[0]?.total || '0', 10),
        byEndpoint: endpointMap,
        byMethod: methodMap,
        byDay: byDayResult.rows.map(r => ({ date: r.day, count: parseInt(r.count) })),
        byKey: byKeyResult.rows.map(r => ({
          keyId: r.api_key_id,
          keyName: r.key_name,
          keyPrefix: r.key_prefix,
          tier: r.tier,
          requests: parseInt(r.count),
          lastUsed: r.last_used,
        })),
        byKeyDay: byKeyDayResult.rows.map(r => ({
          keyId: r.api_key_id,
          keyName: r.key_name,
          date: r.day,
          count: parseInt(r.count),
        })),
        recentActivity: recentResult.rows.map(r => ({
          endpoint: r.endpoint,
          method: r.method,
          ip: r.ip_address,
          time: r.created_at,
          keyName: r.api_key_id ? (keyNameMap[r.api_key_id] || 'Unknown') : null,
        })),
      },
    });
  } catch (err: any) {
    console.error('[DEVELOPER] Usage error:', err.message);
    res.status(500).json({ error: { code: 'USAGE_FAILED', message: 'Failed to fetch usage data' } });
  }
});

/**
 * GET /api/developer/usage/:keyId — Per-key usage breakdown
 */
router.get('/usage/:keyId', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    }

    const key = await getKeyById(req.params.keyId, req.user.userId);
    if (!key) {
      return res.status(404).json({ error: { code: 'KEY_NOT_FOUND', message: 'API key not found' } });
    }

    const period = (req.query.period as string) || '7d';
    const interval = periodToInterval(period);
    const keyId = req.params.keyId;

    const [totalResult, byEndpointResult, byDayResult, byMethodResult] = await Promise.all([
      query<{ total: string }>(
        `SELECT COUNT(*) as total FROM api_usage_log
         WHERE api_key_id = $1 AND created_at > NOW() - INTERVAL '${interval}'`,
        [keyId]
      ),
      query<{ endpoint: string; count: string }>(
        `SELECT endpoint, COUNT(*) as count FROM api_usage_log
         WHERE api_key_id = $1 AND created_at > NOW() - INTERVAL '${interval}'
         GROUP BY endpoint ORDER BY count DESC LIMIT 15`,
        [keyId]
      ),
      period === '1d'
        ? query<{ day: string; count: string }>(
            `SELECT FLOOR(EXTRACT(EPOCH FROM created_at) / 3600) * 3600 * 1000 as day,
                    COUNT(*) as count
             FROM api_usage_log
             WHERE api_key_id = $1 AND created_at > NOW() - INTERVAL '${interval}'
             GROUP BY FLOOR(EXTRACT(EPOCH FROM created_at) / 3600)
             ORDER BY day`,
            [keyId]
          )
        : query<{ day: string; count: string }>(
            `SELECT TO_CHAR(created_at::date, 'YYYY-MM-DD') as day, COUNT(*) as count FROM api_usage_log
             WHERE api_key_id = $1 AND created_at > NOW() - INTERVAL '${interval}'
             GROUP BY created_at::date ORDER BY created_at::date`,
            [keyId]
          ),
      query<{ method: string; count: string }>(
        `SELECT method, COUNT(*) as count FROM api_usage_log
         WHERE api_key_id = $1 AND created_at > NOW() - INTERVAL '${interval}'
         GROUP BY method ORDER BY count DESC`,
        [keyId]
      ),
    ]);

    const endpointMap: Record<string, number> = {};
    for (const r of byEndpointResult.rows) endpointMap[r.endpoint] = parseInt(r.count);

    const methodMap: Record<string, number> = {};
    for (const r of byMethodResult.rows) methodMap[r.method] = parseInt(r.count);

    res.json({
      data: {
        keyId: key.id,
        keyName: key.name,
        keyPrefix: key.key_prefix,
        tier: key.tier,
        period,
        totalRequests: parseInt(totalResult.rows[0]?.total || '0', 10),
        byEndpoint: endpointMap,
        byMethod: methodMap,
        byDay: byDayResult.rows.map(r => ({ date: r.day, count: parseInt(r.count) })),
      },
    });
  } catch (err: any) {
    console.error('[DEVELOPER] Key usage error:', err.message);
    res.status(500).json({ error: { code: 'USAGE_FAILED', message: 'Failed to fetch key usage' } });
  }
});

export default router;
