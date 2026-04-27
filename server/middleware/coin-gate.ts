/**
 * Coin Gate Middleware
 *
 * Intercepts feature start endpoints and enforces the 3-tier access model:
 *
 *   Pro   → passes through immediately (no coin debit)
 *   Semi  → debits coins; blocks with 402 if balance insufficient
 *   Free  → always blocks with 402 + upgrade prompt
 *
 * Usage:
 *   app.post('/api/strategy-backtest/start', requireAuth, coinGate('backtest.run'), pythonProxy)
 *
 * On success the middleware sets req.coinTxnId so downstream handlers
 * (or a later response-wrapping layer) can issue refunds if needed.
 */

import { Request, Response, NextFunction } from 'express';
import { debitCoins } from '../lib/coins';
import { canAccessFeature } from '../lib/tier-gates';
import type { UserTier } from '../auth/jwt';

declare global {
  namespace Express {
    interface Request {
      coinTxnId?: string;
    }
  }
}

export function coinGate(featureKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const tier = req.user.tier as UserTier;
    const verdict = canAccessFeature(tier, featureKey);

    if (verdict === 'blocked') {
      res.status(402).json({
        code: 'TIER_BLOCKED',
        message: 'Upgrade to Semi or Pro to use this feature.',
        featureKey,
        currentTier: tier,
        upgradeUrl: '/pricing',
      });
      return;
    }

    if (verdict === 'allowed') {
      // Pro tier — no coin debit needed
      next();
      return;
    }

    // Semi tier — debit coins
    const idempotencyKey = `${req.user.userId}:${featureKey}:${Date.now()}`;

    const result = await debitCoins({
      userId: req.user.userId,
      featureKey,
      referenceId: idempotencyKey,
      idempotencyKey,
      metadata: { ip: req.ip, path: req.path },
    }).catch((err: Error) => {
      console.error(`[COIN_GATE] debit error for ${featureKey}:`, err.message);
      return null;
    });

    if (!result) {
      res.status(500).json({ message: 'Coin service error — try again.' });
      return;
    }

    if (!result.ok) {
      res.status(402).json({
        code: 'INSUFFICIENT_COINS',
        message: 'You don\'t have enough coins to run this feature. Buy more coins to continue.',
        featureKey,
        currentTier: tier,
        buyCoinsUrl: '/profile?tab=coins',
      });
      return;
    }

    // Store transaction ID for potential downstream refund
    req.coinTxnId = result.transaction.id;
    next();
  };
}
