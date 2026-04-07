/**
 * API Key Validation Middleware
 *
 * Internal endpoint for nginx auth_request subrequest.
 * Validates API keys, enforces rate limits, IP whitelists, endpoint scopes,
 * and tier-based access control.
 *
 * Four-branch authentication flow:
 * 1. Has X-API-Key → full key validation + tier enforcement
 * 2. Has Authorization: Bearer JWT → signature-only verification (web app user)
 * 3. Same-origin browser request → allow with IP rate limiting (anonymous web user)
 * 4. None of the above → 401 reject (blocks raw curl/Postman/scripts)
 */

import { Router, Request, Response } from 'express';
import { getRedis } from '../lib/redis';
import { findByHash, hashApiKey, updateLastUsed, type ApiKey } from '../db/api-key-store';
import { verifyAccessToken } from '../auth/jwt.js';

const router = Router();

// Cache TTL for validated keys (seconds)
const KEY_CACHE_TTL = 300; // 5 minutes

// Anonymous rate limit (requests per minute per IP)
const ANON_RATE_LIMIT = parseInt(process.env.ANON_RATE_LIMIT_PER_MINUTE || '60', 10);

// =============================================================================
// Endpoint tier classification
// =============================================================================

/** Endpoints accessible with any API key tier (basic/premium/enterprise) */
const PUBLIC_API_ENDPOINTS: string[] = [
  '/api/tickers*',
  '/api/market-status*',
  '/api/market-mood*',
  '/api/market-movers*',
  '/api/marquee-stocks*',
  '/api/indices*',
  '/api/stocks*',
  '/api/search*',
  '/api/stock-ltp*',
  '/api/price-chart/*',
  '/api/quote*',
  '/api/prices/bulk*',
  '/api/news*',
  '/api/stock-detail/*',
  '/api/technical-indicators/*',
  '/api/config/*',
  '/api/privacy/*',
  '/api/stock-scorecard/*',
];

/** Endpoints requiring premium or enterprise API key */
const PREMIUM_API_ENDPOINTS: string[] = [
  '/api/expert-screener*',
  '/api/strategy-backtest*',
  '/api/sentiment-analysis*',
  '/api/tip-tease*',
  '/api/sankey*',
  '/api/reverse-dcf*',
  '/api/stock-analysis*',
  '/api/shareholding*',
  '/api/screener/run*',
  '/api/analysts-hub*',
];

/** Endpoints only accessible via web app (JWT or same-origin), never via API key */
const INTERNAL_ENDPOINTS: string[] = [
  '/api/subscription*',
  '/api/developer*',
  '/api/admin*',
  '/api/saved*',
  '/api/tracking*',
  '/api/track*',
  '/api/system*',
  '/internal/*',
  '/health/*',
  '/auth/*',
];

type EndpointTier = 'public' | 'premium' | 'internal' | 'unknown';

/**
 * Classify an endpoint path into its access tier.
 * Strips /v1 prefix so both versioned and unversioned URLs match.
 */
function classifyEndpoint(endpointPath: string): EndpointTier {
  const normalized = endpointPath.startsWith('/v1/')
    ? endpointPath.substring(3)
    : endpointPath;

  // Check order: internal first (most restrictive), then premium, then public
  for (const p of INTERNAL_ENDPOINTS) {
    if (globMatch(normalized, p)) return 'internal';
  }
  for (const p of PREMIUM_API_ENDPOINTS) {
    if (globMatch(normalized, p)) return 'premium';
  }
  for (const p of PUBLIC_API_ENDPOINTS) {
    if (globMatch(normalized, p)) return 'public';
  }
  return 'unknown'; // Unclassified defaults to requiring premium (secure default)
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract API key from request.
 * Checks X-API-Key header first, then ?api_key= in the original URI.
 */
function extractApiKey(req: Request): string | null {
  // Header-based (recommended)
  const headerKey = req.headers['x-api-key'] as string | undefined;
  if (headerKey) return headerKey;

  // Query-string based (for SSE EventSource which can't set headers)
  const originalUri = req.headers['x-original-uri'] as string | undefined;
  if (originalUri) {
    try {
      const url = new URL(originalUri, 'http://localhost');
      const qKey = url.searchParams.get('api_key');
      if (qKey) return qKey;
    } catch { /* ignore parse errors */ }
  }

  return null;
}

/**
 * Check if an IP matches a list of allowed IPs/CIDRs.
 * Empty list = allow all.
 */
export function isIpAllowed(ip: string, allowedIps: string[]): boolean {
  if (!allowedIps || allowedIps.length === 0) return true;

  for (const allowed of allowedIps) {
    if (allowed.includes('/')) {
      if (cidrMatch(ip, allowed)) return true;
    } else {
      if (ip === allowed) return true;
    }
  }
  return false;
}

/**
 * Simple CIDR match for IPv4.
 */
function cidrMatch(ip: string, cidr: string): boolean {
  try {
    const [range, bits] = cidr.split('/');
    const mask = ~(2 ** (32 - parseInt(bits)) - 1);
    const ipNum = ipToInt(ip);
    const rangeNum = ipToInt(range);
    if (ipNum === null || rangeNum === null) return false;
    return (ipNum & mask) === (rangeNum & mask);
  } catch {
    return false;
  }
}

function ipToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  return parts.reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

/**
 * Check if an endpoint matches allowed endpoint glob patterns.
 * Empty list = allow all.
 */
export function isEndpointAllowed(endpoint: string, allowedEndpoints: string[]): boolean {
  if (!allowedEndpoints || allowedEndpoints.length === 0) return true;

  for (const pattern of allowedEndpoints) {
    if (globMatch(endpoint, pattern)) return true;
  }
  return false;
}

/**
 * Simple glob matching: supports trailing * only.
 * e.g. "/api/stocks*" matches "/api/stocks", "/api/stocks?page=2", "/api/stock-ltp/X"
 */
function globMatch(str: string, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    return str.startsWith(pattern.slice(0, -1));
  }
  return str === pattern;
}

/**
 * Set CORS headers on response if origin is allowed.
 * Returns true if origin was allowed (or no origin present).
 */
function setCorsHeaders(res: Response, origin: string | undefined): boolean {
  if (!origin) return true; // No origin = not a browser request, no CORS needed

  const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
  const defaultOrigins = ['http://localhost:5173', 'http://localhost:5000'];
  const allAllowed = [...corsOrigins, ...defaultOrigins];

  if (allAllowed.includes(origin) || corsOrigins.includes('*')) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
    return true;
  }
  return false;
}

// =============================================================================
// Rate limiting
// =============================================================================

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

/**
 * Check and increment rate limits for an API key.
 * Uses Redis INCR with TTL-based windows.
 */
async function checkRateLimit(
  keyId: string,
  limits: { perMinute: number; perHour: number; perDay: number }
): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) {
    return { allowed: true, limit: limits.perMinute, remaining: limits.perMinute - 1, resetAt: Math.floor(Date.now() / 1000) + 60 };
  }

  const now = Math.floor(Date.now() / 1000);
  const minuteWindow = Math.floor(now / 60);
  const hourWindow = Math.floor(now / 3600);
  const dayWindow = Math.floor(now / 86400);

  const minuteKey = `ratelimit:${keyId}:min:${minuteWindow}`;
  const hourKey = `ratelimit:${keyId}:hr:${hourWindow}`;
  const dayKey = `ratelimit:${keyId}:day:${dayWindow}`;

  try {
    const pipe = redis.pipeline();
    pipe.incr(minuteKey);
    pipe.expire(minuteKey, 120);
    pipe.incr(hourKey);
    pipe.expire(hourKey, 7200);
    pipe.incr(dayKey);
    pipe.expire(dayKey, 172800);
    const results = await pipe.exec();

    const minuteCount = (results?.[0]?.[1] as number) || 0;
    const hourCount = (results?.[2]?.[1] as number) || 0;
    const dayCount = (results?.[4]?.[1] as number) || 0;

    if (minuteCount > limits.perMinute) {
      const resetAt = (minuteWindow + 1) * 60;
      return { allowed: false, limit: limits.perMinute, remaining: 0, resetAt, retryAfter: resetAt - now };
    }
    if (hourCount > limits.perHour) {
      const resetAt = (hourWindow + 1) * 3600;
      return { allowed: false, limit: limits.perHour, remaining: 0, resetAt, retryAfter: resetAt - now };
    }
    if (dayCount > limits.perDay) {
      const resetAt = (dayWindow + 1) * 86400;
      return { allowed: false, limit: limits.perDay, remaining: 0, resetAt, retryAfter: resetAt - now };
    }

    return {
      allowed: true,
      limit: limits.perMinute,
      remaining: Math.max(0, limits.perMinute - minuteCount),
      resetAt: (minuteWindow + 1) * 60,
    };
  } catch (err: any) {
    console.error('[API_KEY_AUTH] Rate limit check error:', err.message);
    return { allowed: true, limit: limits.perMinute, remaining: limits.perMinute, resetAt: now + 60 };
  }
}

/**
 * IP-based rate limiting for anonymous same-origin web users.
 */
async function checkAnonRateLimit(ip: string): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) {
    return { allowed: true, limit: ANON_RATE_LIMIT, remaining: ANON_RATE_LIMIT - 1, resetAt: Math.floor(Date.now() / 1000) + 60 };
  }

  const now = Math.floor(Date.now() / 1000);
  const minuteWindow = Math.floor(now / 60);
  const key = `ratelimit:anon:${ip}:min:${minuteWindow}`;

  try {
    const pipe = redis.pipeline();
    pipe.incr(key);
    pipe.expire(key, 120);
    const results = await pipe.exec();
    const count = (results?.[0]?.[1] as number) || 0;

    if (count > ANON_RATE_LIMIT) {
      const resetAt = (minuteWindow + 1) * 60;
      return { allowed: false, limit: ANON_RATE_LIMIT, remaining: 0, resetAt, retryAfter: resetAt - now };
    }

    return {
      allowed: true,
      limit: ANON_RATE_LIMIT,
      remaining: Math.max(0, ANON_RATE_LIMIT - count),
      resetAt: (minuteWindow + 1) * 60,
    };
  } catch {
    return { allowed: true, limit: ANON_RATE_LIMIT, remaining: ANON_RATE_LIMIT, resetAt: Math.floor(Date.now() / 1000) + 60 };
  }
}

// =============================================================================
// Usage event logging (RPUSH to Redis, flushed to PostgreSQL by cron)
// =============================================================================

/**
 * Log an API usage event to Redis for batch flushing.
 * Fire-and-forget — errors are silently ignored.
 */
function logUsageEvent(event: {
  keyId?: string;
  userId: string;
  endpoint: string;
  method: string;
  ip: string;
  tier?: string;
  authType: string;
}): void {
  const redis = getRedis();
  if (!redis) return;

  const payload = JSON.stringify({
    kid: event.keyId || null,
    uid: event.userId,
    ep: event.endpoint,
    m: event.method,
    ip: event.ip,
    t: event.tier || null,
    at: event.authType,
    ts: Date.now(),
  });

  // Use user_id as the list key so events are grouped per user
  redis.rpush(`api_usage:${event.userId}`, payload).catch(() => {});
}

// =============================================================================
// Key cache
// =============================================================================

async function getCachedKey(hash: string): Promise<ApiKey | null | 'miss'> {
  const redis = getRedis();
  if (!redis) return 'miss';

  try {
    const cached = await redis.get(`apikey:${hash}`);
    if (cached === null) return 'miss';
    if (cached === 'invalid') return null;
    return JSON.parse(cached) as ApiKey;
  } catch {
    return 'miss';
  }
}

async function cacheKey(hash: string, key: ApiKey | null): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    if (key) {
      await redis.set(`apikey:${hash}`, JSON.stringify(key), 'EX', KEY_CACHE_TTL);
    } else {
      await redis.set(`apikey:${hash}`, 'invalid', 'EX', 60);
    }
  } catch { /* ignore */ }
}

// =============================================================================
// Validation endpoint
// =============================================================================

router.get('/', async (req: Request, res: Response) => {
  const rawKey = extractApiKey(req);
  const origin = req.headers['origin'] as string | undefined;
  const authorization = req.headers['authorization'] as string | undefined;
  const secFetchSite = req.headers['sec-fetch-site'] as string | undefined;
  const originalUri = (req.headers['x-original-uri'] as string) || '';
  const originalMethod = (req.headers['x-original-method'] as string) || 'GET';
  const endpointPath = originalUri.split('?')[0];
  const clientIp = (req.headers['x-real-ip'] as string) || req.ip || '';

  // =========================================================================
  // BRANCH 1: Has API Key → Full validation + tier enforcement
  // =========================================================================
  if (rawKey) {
    // Validate key format
    if (!rawKey.startsWith('tphb_live_') || rawKey.length < 20) {
      res.set('X-Auth-Error-Code', 'INVALID_API_KEY');
      return res.status(401).json({
        error: { code: 'INVALID_API_KEY', message: 'Invalid API key format' },
      });
    }

    const hash = hashApiKey(rawKey);

    // Check cache first, then DB
    let apiKey: ApiKey | null;
    const cached = await getCachedKey(hash);
    if (cached === 'miss') {
      apiKey = await findByHash(hash);
      await cacheKey(hash, apiKey);
    } else {
      apiKey = cached;
    }

    if (!apiKey) {
      res.set('X-Auth-Error-Code', 'INVALID_API_KEY');
      return res.status(401).json({
        error: { code: 'INVALID_API_KEY', message: 'API key not found or invalid' },
      });
    }

    if (apiKey.revoked_at) {
      res.set('X-Auth-Error-Code', 'API_KEY_REVOKED');
      return res.status(401).json({
        error: { code: 'API_KEY_REVOKED', message: 'This API key has been revoked' },
      });
    }

    if (!apiKey.is_active) {
      res.set('X-Auth-Error-Code', 'API_KEY_INACTIVE');
      return res.status(401).json({
        error: { code: 'API_KEY_INACTIVE', message: 'This API key is inactive' },
      });
    }

    if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
      res.set('X-Auth-Error-Code', 'API_KEY_EXPIRED');
      return res.status(401).json({
        error: { code: 'API_KEY_EXPIRED', message: 'This API key has expired' },
      });
    }

    // IP whitelist check
    if (!isIpAllowed(clientIp, apiKey.allowed_ips)) {
      res.set('X-Auth-Error-Code', 'IP_NOT_ALLOWED');
      return res.status(403).json({
        error: { code: 'IP_NOT_ALLOWED', message: 'IP not allowed for this API key' },
      });
    }

    // Per-key endpoint scope check (user/admin configured restrictions)
    if (!isEndpointAllowed(endpointPath, apiKey.allowed_endpoints)) {
      res.set('X-Auth-Error-Code', 'ENDPOINT_NOT_ALLOWED');
      return res.status(403).json({
        error: { code: 'ENDPOINT_NOT_ALLOWED', message: 'Endpoint not allowed for this API key' },
      });
    }

    // Tier-based endpoint enforcement
    const endpointTier = classifyEndpoint(endpointPath);

    if (endpointTier === 'internal') {
      res.set('X-Auth-Error-Code', 'ENDPOINT_NOT_ALLOWED');
      return res.status(403).json({
        error: {
          code: 'ENDPOINT_NOT_ALLOWED',
          message: 'This endpoint is not available via API key. Use the web application.',
        },
      });
    }

    if (endpointTier === 'premium' && apiKey.tier === 'basic') {
      res.set('X-Auth-Error-Code', 'TIER_INSUFFICIENT');
      return res.status(403).json({
        error: {
          code: 'TIER_INSUFFICIENT',
          message: 'This endpoint requires a premium or enterprise API key.',
          currentTier: apiKey.tier,
          requiredTier: 'premium',
          upgrade: 'https://your-domain.com/developers',
        },
      });
    }

    if (endpointTier === 'unknown' && apiKey.tier === 'basic') {
      res.set('X-Auth-Error-Code', 'TIER_INSUFFICIENT');
      return res.status(403).json({
        error: {
          code: 'TIER_INSUFFICIENT',
          message: 'This endpoint requires a premium or enterprise API key.',
          currentTier: apiKey.tier,
          requiredTier: 'premium',
        },
      });
    }

    // CORS origin check
    if (origin && apiKey.allowed_origins && apiKey.allowed_origins.length > 0) {
      if (!apiKey.allowed_origins.includes(origin)) {
        res.set('X-Auth-Error-Code', 'ORIGIN_NOT_ALLOWED');
        return res.status(403).json({
          error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin not allowed for this API key' },
        });
      }
    }

    // Rate limit check
    const rateLimit = await checkRateLimit(apiKey.id, {
      perMinute: apiKey.rate_limit_per_minute,
      perHour: apiKey.rate_limit_per_hour,
      perDay: apiKey.rate_limit_per_day,
    });

    if (!rateLimit.allowed) {
      res.set('X-Auth-Error-Code', 'RATE_LIMIT_EXCEEDED');
      res.set('Retry-After', String(rateLimit.retryAfter || 60));
      res.set('X-RateLimit-Limit', String(rateLimit.limit));
      res.set('X-RateLimit-Remaining', '0');
      res.set('X-RateLimit-Reset', String(rateLimit.resetAt));
      return res.status(403).json({
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' },
      });
    }

    // All checks passed — return 200 with identity headers
    res.set('X-API-User-Id', apiKey.user_id);
    res.set('X-API-Key-Tier', apiKey.tier);
    res.set('X-API-Key-Id', apiKey.id);
    res.set('X-API-Key-Type', apiKey.key_type);
    res.set('X-RateLimit-Limit', String(rateLimit.limit));
    res.set('X-RateLimit-Remaining', String(rateLimit.remaining));
    res.set('X-RateLimit-Reset', String(rateLimit.resetAt));

    // Set CORS headers if browser request (Origin present)
    // If allowed_origins is configured, origin was already validated above
    // If allowed_origins is empty, any origin is allowed (user opted out of restrictions)
    if (origin) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
    }

    updateLastUsed(apiKey.id, clientIp).catch(() => {});

    // Log API key usage event
    logUsageEvent({
      keyId: apiKey.id,
      userId: apiKey.user_id,
      endpoint: endpointPath,
      method: originalMethod,
      ip: clientIp,
      tier: apiKey.tier,
      authType: 'api_key',
    });

    return res.status(200).end();
  }

  // =========================================================================
  // BRANCH 2: Has JWT Bearer token → Signature-only verification (no DB call)
  // =========================================================================
  if (authorization && authorization.startsWith('Bearer ')) {
    const token = authorization.substring(7);

    try {
      const decoded = verifyAccessToken(token);
      // Valid JWT — logged-in web app user
      setCorsHeaders(res, origin);
      res.set('X-Auth-User-Id', decoded.userId);
      res.set('X-Auth-User-Tier', decoded.tier || 'basic');
      res.set('X-Auth-Type', 'jwt');
      // Also set API-compatible headers so nginx auth_request_set captures them
      // for downstream Python endpoints (task limiting, usage tracking)
      res.set('X-API-User-Id', decoded.userId);
      res.set('X-API-Key-Tier', decoded.tier || 'basic');
      return res.status(200).end();
    } catch {
      // JWT is present but invalid/expired — still return 200.
      // The downstream requireAuth middleware in Express will handle the 401,
      // which triggers the auth-fetch.ts token refresh flow.
      // If we returned 401 here, nginx would short-circuit and the refresh
      // mechanism would never trigger.
      setCorsHeaders(res, origin);
      return res.status(200).end();
    }
  }

  // =========================================================================
  // BRANCH 3: Same-origin browser request (anonymous web user)
  // =========================================================================
  // Sec-Fetch-Site is browser-enforced and cannot be spoofed by client-side JS.
  // curl CAN spoof it, but combined with Origin check + IP rate limiting,
  // this is an acceptable tradeoff.
  // Note: EventSource (SSE) GET requests may not send Origin header, so we
  // also accept requests with just sec-fetch-site and extract origin from Referer.
  // Note: Some corporate proxies / networks strip Sec-Fetch-* headers entirely.
  // In that case we fall back to Origin/Referer-only validation (still gated
  // by the CORS_ORIGINS allowlist + IP rate limiting below).
  const refererOrigin = !origin && req.headers['referer']
    ? req.headers['referer'].toString().match(/^https?:\/\/[^/]+/)?.[0]
    : undefined;
  const effectiveOrigin = origin || refererOrigin;
  const isSameSite = secFetchSite === 'same-origin' || secFetchSite === 'same-site';
  if (effectiveOrigin && (isSameSite || !secFetchSite)) {
    const originAllowed = setCorsHeaders(res, effectiveOrigin);

    if (originAllowed) {
      // Apply IP-based rate limiting for anonymous users
      const rateLimit = await checkAnonRateLimit(clientIp);

      if (!rateLimit.allowed) {
        res.set('X-Auth-Error-Code', 'RATE_LIMIT_EXCEEDED');
        res.set('Retry-After', String(rateLimit.retryAfter || 60));
        res.set('X-RateLimit-Limit', String(rateLimit.limit));
        res.set('X-RateLimit-Remaining', '0');
        res.set('X-RateLimit-Reset', String(rateLimit.resetAt));
        return res.status(403).json({
          error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded for anonymous access' },
        });
      }

      res.set('X-Auth-Type', 'anonymous-web');
      res.set('X-RateLimit-Limit', String(rateLimit.limit));
      res.set('X-RateLimit-Remaining', String(rateLimit.remaining));
      res.set('X-RateLimit-Reset', String(rateLimit.resetAt));
      return res.status(200).end();
    }
    // Origin not in allowed list — fall through to rejection
  }

  // =========================================================================
  // BRANCH 4: No credentials → Reject with helpful error
  // =========================================================================
  res.set('X-Auth-Error-Code', 'AUTH_REQUIRED');
  return res.status(401).json({
    error: {
      code: 'AUTH_REQUIRED',
      message: 'Authentication required. Include an API key via X-API-Key header, or sign in to use the web application.',
      docs: 'https://your-domain.com/developers',
      help: [
        'Get a free API key at https://your-domain.com/developers',
        'Include it as: X-API-Key: tphb_live_YOUR_KEY',
        'For SSE streams: ?api_key=tphb_live_YOUR_KEY',
      ],
    },
  });
});

export default router;
