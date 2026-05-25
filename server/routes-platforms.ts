/**
 * Platforms Admin Routes
 *
 * CRUD for the platforms registry + per-platform HMAC keys. Admin-only — these
 * mint credentials that the two future apps will use to call this auth + coin
 * service.
 *
 * Note on key visibility: the publicKey + secret returned on creation are
 * shown to the admin **once**. Both are hashed before storage; there is no
 * "reveal" later. To rotate, the admin creates a new key and revokes the old.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from './middleware/auth';
import {
  listPlatforms,
  getPlatformById,
  getPlatformBySlug,
  createPlatform,
  updatePlatform,
  createPlatformApiKey,
  listKeysForPlatform,
  revokePlatformApiKey,
} from './db/platform-store';

const router = Router();

const createPlatformSchema = z.object({
  slug: z.string().min(2).max(64).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
    message: 'Slug must be lowercase alphanumeric with hyphens',
  }),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
});

const updatePlatformSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  is_active: z.boolean().optional(),
});

const createKeySchema = z.object({
  name: z.string().min(1).max(120),
});

const revokeKeySchema = z.object({
  reason: z.string().max(500).optional(),
});

// ─── Platforms ──────────────────────────────────────────────────────────────

router.get('/', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const platforms = await listPlatforms();
    res.json({ data: platforms });
  } catch (error: any) {
    console.error('[ADMIN_PLATFORMS] list error:', error.message);
    res.status(500).json({ message: 'Failed to list platforms' });
  }
});

router.post('/', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const parsed = createPlatformSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input', errors: parsed.error.flatten() });
    return;
  }
  try {
    const existing = await getPlatformBySlug(parsed.data.slug);
    if (existing) {
      res.status(409).json({ message: 'A platform with that slug already exists' });
      return;
    }
    const platform = await createPlatform(parsed.data);
    res.status(201).json({ data: platform });
  } catch (error: any) {
    console.error('[ADMIN_PLATFORMS] create error:', error.message);
    res.status(500).json({ message: 'Failed to create platform' });
  }
});

router.patch('/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const parsed = updatePlatformSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input', errors: parsed.error.flatten() });
    return;
  }
  try {
    const updated = await updatePlatform(req.params.id, parsed.data);
    if (!updated) {
      res.status(404).json({ message: 'Platform not found' });
      return;
    }
    res.json({ data: updated });
  } catch (error: any) {
    console.error('[ADMIN_PLATFORMS] update error:', error.message);
    res.status(500).json({ message: 'Failed to update platform' });
  }
});

// ─── Platform API keys ──────────────────────────────────────────────────────

router.get('/:id/keys', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const platform = await getPlatformById(req.params.id);
    if (!platform) {
      res.status(404).json({ message: 'Platform not found' });
      return;
    }
    const keys = await listKeysForPlatform(req.params.id);
    res.json({ data: keys });
  } catch (error: any) {
    console.error('[ADMIN_PLATFORMS] list keys error:', error.message);
    res.status(500).json({ message: 'Failed to list keys' });
  }
});

router.post('/:id/keys', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const parsed = createKeySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input', errors: parsed.error.flatten() });
    return;
  }
  try {
    const platform = await getPlatformById(req.params.id);
    if (!platform) {
      res.status(404).json({ message: 'Platform not found' });
      return;
    }
    const adminId = (req.user as any)?.userId as string | undefined;
    const result = await createPlatformApiKey({
      platformId: req.params.id,
      name: parsed.data.name,
      createdBy: adminId,
    });
    // Public key + secret are returned ONCE — admin must copy now.
    res.status(201).json({
      data: result.record,
      publicKey: result.publicKey,
      secret: result.secret,
    });
  } catch (error: any) {
    console.error('[ADMIN_PLATFORMS] create key error:', error.message);
    res.status(500).json({ message: 'Failed to create key' });
  }
});

router.post('/keys/:keyId/revoke', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const parsed = revokeKeySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input', errors: parsed.error.flatten() });
    return;
  }
  try {
    await revokePlatformApiKey(req.params.keyId, parsed.data.reason);
    res.json({ message: 'Key revoked' });
  } catch (error: any) {
    console.error('[ADMIN_PLATFORMS] revoke key error:', error.message);
    res.status(500).json({ message: 'Failed to revoke key' });
  }
});

export default router;
