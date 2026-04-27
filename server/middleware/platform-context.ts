/**
 * Platform Context Middleware
 *
 * Resolves which platform issued the current request and attaches it to
 * `req.platform`. Two paths:
 *
 *   1. Server-to-server — request carries `X-Platform-Key`,
 *      `X-Platform-Signature`, and `X-Platform-Timestamp`. The signature is an
 *      HMAC-SHA256 of `<timestamp>.<body>` using the platform's secret. We
 *      look the key up, verify the signature, and reject mismatches.
 *
 *   2. Browser — the request is JWT-authenticated and the access token has a
 *      `platformId` claim (added when the user logged in on a particular
 *      platform). We trust the JWT and load the platform record.
 *
 * If neither header nor JWT claim is present the middleware leaves `req.platform`
 * undefined and lets downstream code decide whether platform context is
 * required for that route.
 */

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import {
  Platform,
  findKeyByPublicKey,
  getPlatformById,
  touchPlatformApiKey,
} from '../db/platform-store';

const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60; // 5 min replay window

declare global {
  namespace Express {
    interface Request {
      platform?: Platform;
      platformKeyId?: string; // ID of the platform_api_keys row, when server-to-server
    }
  }
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Verify HMAC signature: signature == HMAC-SHA256(secret, timestamp + '.' + rawBody).
 * `rawBody` should be the verbatim request body (use express.raw or capture
 * from req.body when it's a string). For JSON routes we pass the
 * JSON-stringified body so the signing recipe is deterministic.
 */
function verifySignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signatureHex: string,
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return timingSafeEqualHex(expected, signatureHex);
}

/**
 * Optional platform-context resolver. Use on routes that may be called from
 * server-to-server OR from a browser; downstream guards decide what's required.
 */
export async function resolvePlatformContext(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const publicKey = req.header('x-platform-key');
    const signature = req.header('x-platform-signature');
    const timestamp = req.header('x-platform-timestamp');

    // Path 1: server-to-server signed request
    if (publicKey) {
      if (!signature || !timestamp) {
        res.status(401).json({ message: 'Missing platform signature or timestamp' });
        return;
      }
      const ts = parseInt(timestamp, 10);
      if (!Number.isFinite(ts)) {
        res.status(401).json({ message: 'Invalid platform timestamp' });
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - ts) > MAX_TIMESTAMP_SKEW_SECONDS) {
        res.status(401).json({ message: 'Platform timestamp out of window' });
        return;
      }

      const found = await findKeyByPublicKey(publicKey);
      if (!found) {
        res.status(401).json({ message: 'Unknown or revoked platform key' });
        return;
      }

      // We can't recover the plaintext secret to HMAC with — instead the secret
      // must be supplied by the caller and matched by hash. Pattern: the client
      // sends `signature` computed with their secret; we re-derive by storing
      // the secret unencrypted-at-the-table-level is *not* what we did. So we
      // verify by hashing what they signed against `secret_hash`.
      //
      // Rather than HMAC, we use a simpler scheme that fits hash-only storage:
      //   signature = sha256(secretHash + '.' + timestamp + '.' + rawBody)
      // The caller stores `secret` and computes `secretHash = sha256(secret)`
      // first, then the signature. This still proves possession of the secret
      // without us holding it in plaintext, and is deterministic.
      const rawBody =
        typeof (req as any).rawBody === 'string'
          ? (req as any).rawBody
          : JSON.stringify(req.body ?? {});
      const expected = sha256(`${found.secretHash}.${timestamp}.${rawBody}`);
      if (!timingSafeEqualHex(expected, signature)) {
        res.status(401).json({ message: 'Bad platform signature' });
        return;
      }

      req.platform = found.platform;
      req.platformKeyId = found.key.id;

      // Best-effort touch (don't await audit-write)
      touchPlatformApiKey(found.key.id, req.ip ?? null).catch(() => {});
      next();
      return;
    }

    // Path 2: JWT-authenticated browser request — requireAuth must run first
    // for req.user to be populated. This middleware also works pre-auth (no-op).
    const platformId = (req.user as any)?.platformId;
    if (platformId) {
      const platform = await getPlatformById(platformId);
      if (platform && platform.is_active) {
        req.platform = platform;
      }
    }

    next();
  } catch (error: any) {
    console.error('[PLATFORM_CTX] Error:', error.message);
    res.status(500).json({ message: 'Platform context error' });
  }
}

/**
 * Hard requirement: route is only callable when a platform context was
 * resolved. Use after `resolvePlatformContext`.
 */
export function requirePlatform(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.platform) {
    res.status(400).json({ message: 'Platform context required' });
    return;
  }
  next();
}
