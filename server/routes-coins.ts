/**
 * Coin Routes
 *
 * Browser-facing:
 *   GET  /api/coins/balance        — current balance + last 20 txns
 *   GET  /api/coins/transactions   — paginated transaction history
 *   GET  /api/coins/packs          — purchasable coin packs (public)
 *
 * Server-to-server (requires platform key via platform-context middleware):
 *   POST /api/coins/debit          — debit coins for a feature use
 *   POST /api/coins/refund         — refund a prior debit
 *
 * Admin (requireAdmin):
 *   POST /api/admin/coins/grant                — grant coins to any user
 *   GET  /api/admin/coins/transactions         — all transactions (filterable)
 *   GET  /api/admin/coins/feature-costs        — list feature cost catalog
 *   PATCH /api/admin/coins/feature-costs/:key  — update a feature cost
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from './middleware/auth';
import {
  resolvePlatformContext,
  requirePlatform,
} from './middleware/platform-context';
import { debitCoins, creditCoins, refundCoins, getBalance } from './lib/coins';
import {
  listTransactionsForUser,
  countTransactionsForUser,
  listAllTransactions,
  listActivePacks,
  listAllPacks,
  createPack,
  updatePack,
  deletePack,
  listFeatureCosts,
  upsertFeatureCost,
  getOrCreateBalance,
  getCoinPricing,
  updateCoinPricing,
  updateSignupBonus,
} from './db/coin-store';

const router = Router();

// ─── Browser routes ─────────────────────────────────────────────────────────

router.get('/api/coins/balance', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const [bal, txns] = await Promise.all([
      getOrCreateBalance(userId),
      listTransactionsForUser(userId, 20, 0),
    ]);
    res.json({ data: { balance: bal.balance, lifetime_earned: bal.lifetime_earned, lifetime_spent: bal.lifetime_spent, recent: txns } });
  } catch (err: any) {
    console.error('[COINS] balance error:', err.message);
    res.status(500).json({ message: 'Failed to fetch balance' });
  }
});

router.get('/api/coins/transactions', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const limit  = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const [txns, total] = await Promise.all([
      listTransactionsForUser(userId, limit, offset),
      countTransactionsForUser(userId),
    ]);
    res.json({ data: txns, meta: { total, limit, offset } });
  } catch (err: any) {
    console.error('[COINS] transactions error:', err.message);
    res.status(500).json({ message: 'Failed to fetch transactions' });
  }
});

router.get('/api/coins/packs', async (_req: Request, res: Response) => {
  try {
    const packs = await listActivePacks();
    res.json({ data: packs });
  } catch (err: any) {
    console.error('[COINS] packs error:', err.message);
    res.status(500).json({ message: 'Failed to fetch packs' });
  }
});

// ─── Server-to-server routes ─────────────────────────────────────────────────

const debitSchema = z.object({
  user_id:          z.string().uuid(),
  feature_key:      z.string().min(1),
  reference_id:     z.string().optional(),
  idempotency_key:  z.string().optional(),
  cost_override:    z.number().int().positive().optional(),
  metadata:         z.record(z.unknown()).optional(),
});

router.post(
  '/api/coins/debit',
  resolvePlatformContext,
  requirePlatform,
  async (req: Request, res: Response) => {
    const parsed = debitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid input', errors: parsed.error.flatten() });
      return;
    }
    const { user_id, feature_key, reference_id, idempotency_key, cost_override, metadata } = parsed.data;
    try {
      const result = await debitCoins({
        userId: user_id,
        featureKey: feature_key,
        platformId: req.platform?.id,
        referenceId: reference_id,
        idempotencyKey: idempotency_key,
        costOverride: cost_override,
        metadata: metadata as Record<string, any> | undefined,
      });
      if (!result.ok) {
        res.status(402).json({
          code: result.reason === 'insufficient_coins' ? 'INSUFFICIENT_COINS' : 'IDEMPOTENCY_REPLAY',
          message: result.reason === 'insufficient_coins'
            ? 'Insufficient coins to perform this action'
            : 'Duplicate request — original transaction returned',
          transaction: result.transaction,
        });
        return;
      }
      res.json({
        data: {
          transaction: result.transaction,
          balance_after: result.balanceAfter,
          was_replay: result.wasReplay,
        },
      });
    } catch (err: any) {
      console.error('[COINS] debit error:', err.message);
      res.status(500).json({ message: 'Failed to debit coins' });
    }
  },
);

router.post(
  '/api/coins/refund',
  resolvePlatformContext,
  requirePlatform,
  async (req: Request, res: Response) => {
    const { transaction_id } = req.body as { transaction_id?: string };
    if (!transaction_id) {
      res.status(400).json({ message: 'transaction_id is required' });
      return;
    }
    try {
      const txn = await refundCoins(transaction_id, req.platform?.id);
      if (!txn) {
        res.status(404).json({ message: 'Original debit transaction not found' });
        return;
      }
      res.json({ data: txn });
    } catch (err: any) {
      console.error('[COINS] refund error:', err.message);
      res.status(500).json({ message: 'Failed to refund coins' });
    }
  },
);

// ─── Admin routes ─────────────────────────────────────────────────────────────

const grantSchema = z.object({
  user_id:    z.string().uuid(),
  amount:     z.number().int().min(1),
  reason:     z.string().max(500).optional(),
});

router.post('/api/admin/coins/grant', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const parsed = grantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input', errors: parsed.error.flatten() });
    return;
  }
  try {
    const txn = await creditCoins({
      userId: parsed.data.user_id,
      amount: parsed.data.amount,
      type: 'admin_grant',
      referenceId: req.user!.userId, // admin who granted
      metadata: { reason: parsed.data.reason ?? 'Admin grant', granted_by: req.user!.userId },
    });
    res.json({ data: txn });
  } catch (err: any) {
    console.error('[COINS] grant error:', err.message);
    res.status(500).json({ message: 'Failed to grant coins' });
  }
});

router.get('/api/admin/coins/transactions', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const txns = await listAllTransactions({
      userId:     req.query.user_id as string | undefined,
      platformId: req.query.platform_id as string | undefined,
      type:       req.query.type as any,
      limit:      Math.min(parseInt(req.query.limit as string) || 50, 200),
      offset:     parseInt(req.query.offset as string) || 0,
    });
    res.json({ data: txns });
  } catch (err: any) {
    console.error('[COINS] admin txns error:', err.message);
    res.status(500).json({ message: 'Failed to fetch transactions' });
  }
});

router.get('/api/admin/coins/feature-costs', requireAuth, requireAdmin, async (_req, res: Response) => {
  try {
    const costs = await listFeatureCosts();
    res.json({ data: costs });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to fetch feature costs' });
  }
});

router.patch('/api/admin/coins/feature-costs/:key', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const { cost, description, is_active } = req.body as {
    cost?: number;
    description?: string;
    is_active?: boolean;
  };
  if (cost == null || !Number.isInteger(cost) || cost < 0) {
    res.status(400).json({ message: 'cost must be a non-negative integer' });
    return;
  }
  if (is_active !== undefined && typeof is_active !== 'boolean') {
    res.status(400).json({ message: 'is_active must be a boolean' });
    return;
  }
  try {
    await upsertFeatureCost(req.params.key, cost, description, is_active);
    res.json({ message: 'Feature cost updated' });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to update feature cost' });
  }
});

// ─── Admin: coin pack CRUD ───────────────────────────────────────────────────

const packCreateSchema = z.object({
  name:            z.string().min(1).max(120),
  coin_amount:     z.number().int().positive(),
  bonus_coins:     z.number().int().min(0).default(0),
  price_inr_paise: z.number().int().positive(),
  sort_order:      z.number().int().min(0).default(0),
});

const packPatchSchema = z.object({
  name:            z.string().min(1).max(120).optional(),
  coin_amount:     z.number().int().positive().optional(),
  bonus_coins:     z.number().int().min(0).optional(),
  price_inr_paise: z.number().int().positive().optional(),
  sort_order:      z.number().int().min(0).optional(),
  is_active:       z.boolean().optional(),
});

router.get('/api/admin/coins/packs', requireAuth, requireAdmin, async (_req, res: Response) => {
  try {
    const packs = await listAllPacks();
    res.json({ data: packs });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to list packs' });
  }
});

router.post('/api/admin/coins/packs', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const parsed = packCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input', errors: parsed.error.flatten() });
    return;
  }
  try {
    const pack = await createPack({
      name:           parsed.data.name,
      coinAmount:     parsed.data.coin_amount,
      bonusCoins:     parsed.data.bonus_coins,
      priceInrPaise:  parsed.data.price_inr_paise,
      sortOrder:      parsed.data.sort_order,
    });
    res.status(201).json({ data: pack });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to create pack' });
  }
});

router.patch('/api/admin/coins/packs/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const parsed = packPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input', errors: parsed.error.flatten() });
    return;
  }
  try {
    const updated = await updatePack(req.params.id, {
      name:           parsed.data.name,
      coinAmount:     parsed.data.coin_amount,
      bonusCoins:     parsed.data.bonus_coins,
      priceInrPaise:  parsed.data.price_inr_paise,
      sortOrder:      parsed.data.sort_order,
      isActive:       parsed.data.is_active,
    });
    if (!updated) {
      res.status(404).json({ message: 'Pack not found' });
      return;
    }
    res.json({ data: updated });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to update pack' });
  }
});

router.delete('/api/admin/coins/packs/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    await deletePack(req.params.id);
    res.json({ message: 'Pack deleted' });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to delete pack' });
  }
});

// ─── Coin pricing (single ₹/coin rate) ───────────────────────────────────────

router.get('/api/coins/pricing', requireAuth, async (_req: Request, res: Response) => {
  try {
    const pricing = await getCoinPricing();
    res.json({ data: pricing });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to fetch coin pricing' });
  }
});

router.patch('/api/admin/coins/pricing', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const { paise_per_coin } = req.body as { paise_per_coin?: number };
  if (paise_per_coin == null || !Number.isInteger(paise_per_coin) || paise_per_coin <= 0) {
    res.status(400).json({ message: 'paise_per_coin must be a positive integer' });
    return;
  }
  try {
    await updateCoinPricing(paise_per_coin, req.user?.userId ?? null);
    const pricing = await getCoinPricing();
    res.json({ data: pricing, message: 'Coin pricing updated' });
  } catch (err: any) {
    console.error('[COINS] update pricing error:', err.message);
    res.status(500).json({ message: 'Failed to update coin pricing' });
  }
});

router.patch('/api/admin/coins/signup-bonus', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const { signup_bonus_coins } = req.body as { signup_bonus_coins?: number };
  if (
    signup_bonus_coins == null ||
    !Number.isInteger(signup_bonus_coins) ||
    signup_bonus_coins < 0
  ) {
    res.status(400).json({ message: 'signup_bonus_coins must be a non-negative integer' });
    return;
  }
  try {
    await updateSignupBonus(signup_bonus_coins, req.user?.userId ?? null);
    const pricing = await getCoinPricing();
    res.json({ data: pricing, message: 'Signup bonus updated' });
  } catch (err: any) {
    console.error('[COINS] update signup bonus error:', err.message);
    res.status(500).json({ message: 'Failed to update signup bonus' });
  }
});

export default router;
