import { Router, Request, Response } from 'express';
import { requireAuth } from './middleware/auth';
import {
  createApiKey,
  findActivePlatformKey,
  revealApiKey,
} from './db/api-key-store';
import { query } from './db/auth-connection';

type PlatformSlug = 'platform-a' | 'platform-b';

interface PlatformEmbedConfig {
  slug: PlatformSlug;
  name: string;
  url: string;
  origin: string;
  description: string;
}

const PLATFORM_CONFIGS: Record<PlatformSlug, PlatformEmbedConfig> = {
  'platform-a': {
    slug: 'platform-a',
    name: process.env.PLATFORM_A_NAME || 'OptionFlow',
    url: process.env.PLATFORM_A_URL || process.env.VITE_PLATFORM_A_URL || 'http://164.52.192.245:8088',
    origin: process.env.PLATFORM_A_ORIGIN || 'http://164.52.192.245:8088',
    description: process.env.PLATFORM_A_DESCRIPTION || 'Options analytics and trading workspace',
  },
  'platform-b': {
    slug: 'platform-b',
    name: process.env.PLATFORM_B_NAME || 'EquityPro AI',
    url: process.env.PLATFORM_B_URL || process.env.VITE_PLATFORM_B_URL || 'https://ai.equitypro.app',
    origin: process.env.PLATFORM_B_ORIGIN || 'https://ai.equitypro.app',
    description: process.env.PLATFORM_B_DESCRIPTION || 'PineScript AI strategy lab',
  },
};

const router = Router();

function getPlatform(slug: string): PlatformEmbedConfig | null {
  return PLATFORM_CONFIGS[slug as PlatformSlug] || null;
}

function apiTierFromUserTier(tier: string | undefined): 'basic' | 'premium' | 'enterprise' {
  if (tier === 'pro' || tier === 'semi' || tier === 'premium') return 'premium';
  return 'basic';
}

router.get('/', requireAuth, (_req: Request, res: Response) => {
  res.json({
    data: Object.values(PLATFORM_CONFIGS).map((platform) => ({
      slug: platform.slug,
      name: platform.name,
      url: platform.url,
      description: platform.description,
    })),
  });
});

router.post('/:slug/session', requireAuth, async (req: Request, res: Response) => {
  try {
    const platform = getPlatform(req.params.slug);
    if (!platform) {
      return res.status(404).json({ error: { code: 'PLATFORM_NOT_FOUND', message: 'Platform not found' } });
    }

    const user = req.user;
    if (!user?.userId) {
      return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
    }

    const existing = await findActivePlatformKey(user.userId, platform.slug);
    if (existing) {
      return res.json({
        data: {
          apiKey: revealApiKey(existing),
          userId: user.userId,
          platform: {
            name: platform.name,
            url: platform.url,
          },
        },
      });
    }

    await query(
      `UPDATE api_keys
       SET is_active = FALSE,
           revoked_at = COALESCE(revoked_at, NOW()),
           revoked_reason = COALESCE(revoked_reason, 'expired_embed_replaced')
       WHERE user_id = $1
         AND platform_slug = $2
         AND key_type = 'platform_embed'
         AND is_active = TRUE
         AND revoked_at IS NULL
         AND expires_at IS NOT NULL
         AND expires_at <= NOW()`,
      [user.userId, platform.slug]
    );

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const created = await createApiKey({
      userId: user.userId,
      name: `Embed: ${platform.name}`,
      tier: apiTierFromUserTier(user.tier),
      keyType: 'platform_embed',
      platformSlug: platform.slug,
      allowedOrigins: [platform.origin],
      description: `Auto-issued iframe embed key for ${platform.name}`,
      expiresAt,
    });

    return res.json({
      data: {
        apiKey: created.fullKey,
        userId: user.userId,
        platform: {
          name: platform.name,
          url: platform.url,
        },
      },
    });
  } catch (error: any) {
    console.error('[PLATFORM_EMBED] Failed to provision session:', error.message);
    return res.status(500).json({
      error: {
        code: 'PLATFORM_SESSION_FAILED',
        message: 'Failed to provision platform session',
      },
    });
  }
});

export default router;
