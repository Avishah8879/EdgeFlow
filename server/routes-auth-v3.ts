/**
 * Auth V3 — Cross-Platform Server-to-Server Auth API
 *
 * The two new platforms (TBD) call these endpoints from their backend
 * with HMAC-signed requests. They never embed the user's password in
 * a frontend-callable URL.
 *
 * Endpoints:
 *   POST /auth/v3/login    — platform-key authenticated; takes identifier+password
 *   GET  /auth/v3/me       — Bearer JWT; returns user + tier + balance
 *   POST /auth/v3/logout   — Bearer JWT; revokes the session
 *
 * The platform context (which app made the call) is recorded on every
 * resulting JWT and on every coin transaction it triggers.
 *
 * See docs/PLATFORM_INTEGRATION.md for the HMAC signing recipe.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { resolvePlatformContext, requirePlatform } from './middleware/platform-context';
import { requireAuth } from './middleware/auth';
import {
  findUserByIdentifierV2,
  isAccountLockedV2,
  incrementFailedLoginV2,
  lockUserAccountV2,
  logAuthEventV2,
  updateLastLoginV2,
  revokeSessionV2,
  sanitizeUserV2,
  findUserByIdV2,
} from './auth/store-v2';
import { verifyPasswordBcrypt } from './auth/password-bcrypt';
import { createJwtSessionPayload } from './auth/session-jwt';
import { getOrCreateBalance } from './db/coin-store';
import { getPlatformById } from './db/platform-store';

const router = Router();

const loginSchema = z.object({
  identifier: z.string().min(1),
  password:   z.string().min(1),
});

// ─── POST /auth/v3/login ─────────────────────────────────────────────────────

router.post(
  '/v3/login',
  resolvePlatformContext,
  requirePlatform,
  async (req: Request, res: Response) => {
    const ipAddress = req.ip ?? 'unknown';
    const userAgent = req.headers['user-agent'];

    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'identifier and password are required' });
      return;
    }
    const { identifier, password } = parsed.data;

    try {
      const user = await findUserByIdentifierV2(identifier);
      if (!user) {
        await logAuthEventV2({
          eventType: 'failed_login',
          provider: 'password',
          ipAddress,
          userAgent,
          success: false,
          failureReason: 'User not found',
          metadata: { identifier, platform: req.platform!.slug },
        });
        res.status(401).json({ message: 'Invalid credentials' });
        return;
      }

      if (await isAccountLockedV2(user.id)) {
        res.status(423).json({ message: 'Account temporarily locked', code: 'ACCOUNT_LOCKED' });
        return;
      }

      if (user.provider !== 'password' || !user.password_hash) {
        res.status(401).json({
          message: 'This account uses OAuth. Use /auth/v3/exchange-token after redirecting through /auth/google.',
        });
        return;
      }

      const ok = await verifyPasswordBcrypt(password, user.password_hash);
      if (!ok) {
        const fa = await incrementFailedLoginV2(user.id);
        if (fa >= 5) {
          await lockUserAccountV2(user.id, 30);
          res.status(423).json({ message: 'Account locked', code: 'ACCOUNT_LOCKED' });
          return;
        }
        await logAuthEventV2({
          userId: user.id,
          eventType: 'failed_login',
          provider: 'password',
          ipAddress,
          userAgent,
          success: false,
          failureReason: 'Invalid password',
          metadata: { platform: req.platform!.slug, failedAttempts: fa },
        });
        res.status(401).json({ message: 'Invalid credentials' });
        return;
      }

      if (!user.is_active) {
        res.status(403).json({ message: 'Account deactivated' });
        return;
      }

      await updateLastLoginV2(user.id, ipAddress);
      await logAuthEventV2({
        userId: user.id,
        eventType: 'login',
        provider: 'password',
        ipAddress,
        userAgent,
        success: true,
        metadata: { platform: req.platform!.slug, via: 'v3' },
      });

      // Issue JWT — primaryPlatformId is embedded by createJwtSessionPayload
      // from user.primary_platform_id. The active platform on this request
      // is also recorded on the audit trail above.
      const session = await createJwtSessionPayload(user, {
        deviceInfo: userAgent,
        ipAddress,
        platformId: req.platform!.id,
      });

      // Tack on the live coin balance so callers don't need a second hop
      const bal = await getOrCreateBalance(user.id);
      res.json({
        ...session,
        coins: { balance: bal.balance, lifetime_earned: bal.lifetime_earned, lifetime_spent: bal.lifetime_spent },
        platform: { id: req.platform!.id, slug: req.platform!.slug, name: req.platform!.name },
      });
    } catch (err: any) {
      console.error('[AUTH_V3] login error:', err.message);
      res.status(500).json({ message: 'Login failed' });
    }
  },
);

// ─── GET /auth/v3/me ─────────────────────────────────────────────────────────

router.get('/v3/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await findUserByIdV2(req.user!.userId);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    const bal = await getOrCreateBalance(user.id);
    const platform = req.user!.platformId
      ? await getPlatformById(req.user!.platformId)
      : null;
    res.json({
      data: {
        user: sanitizeUserV2(user),
        coins: { balance: bal.balance, lifetime_earned: bal.lifetime_earned, lifetime_spent: bal.lifetime_spent },
        platform: platform
          ? { id: platform.id, slug: platform.slug, name: platform.name }
          : null,
      },
    });
  } catch (err: any) {
    console.error('[AUTH_V3] me error:', err.message);
    res.status(500).json({ message: 'Failed to load profile' });
  }
});

// ─── POST /auth/v3/logout ────────────────────────────────────────────────────

router.post('/v3/logout', requireAuth, async (req: Request, res: Response) => {
  try {
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (token) {
      await revokeSessionV2(token, 'logout');
    }
    await logAuthEventV2({
      userId: req.user!.userId,
      eventType: 'logout',
      provider: 'password',
      ipAddress: req.ip,
      success: true,
      metadata: { via: 'v3' },
    });
    res.json({ message: 'Logged out' });
  } catch (err: any) {
    console.error('[AUTH_V3] logout error:', err.message);
    res.status(500).json({ message: 'Logout failed' });
  }
});

export default router;
