/**
 * Coin Gate Middleware (tier-agnostic)
 *
 * Intercepts feature start endpoints and enforces a single rule:
 *
 *   feature_costs.is_active = FALSE → pass through (free for everyone)
 *   feature_costs.is_active = TRUE  → debit feature_costs.cost coins;
 *                                     402 INSUFFICIENT_COINS if balance is too low.
 *
 * Tier no longer matters at this layer. Differentiation for Semi/Pro
 * (e.g. monthly free coin allowance, discounts) is delivered separately
 * via credits/grants, not by skipping the gate.
 *
 * Usage:
 *   app.post('/api/strategy-backtest/start', requireAuth, coinGate('backtest.run'), pythonProxy)
 *
 * On success the middleware sets req.coinTxnId so downstream handlers
 * (or a later response-wrapping layer) can issue refunds if needed.
 */

import { Request, Response, NextFunction } from 'express';
import { debitCoins } from '../lib/coins';
import { getFeatureCostRow } from '../db/coin-store';

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

    // Look up the feature's gating config. If the row is missing we still
    // gate (debitCoins falls back to cost=1) — only an explicit is_active=false
    // turns the gate off.
    const featureRow = await getFeatureCostRow(featureKey).catch(() => null);

    if (featureRow && featureRow.is_active === false) {
      // Feature flagged free for everyone — skip debit entirely.
      console.log(`[COIN_GATE] ${featureKey} is_active=false → free, skipping debit (user=${req.user.userId})`);
      next();
      return;
    }

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
      console.log(`[COIN_GATE] ${featureKey} → 402 INSUFFICIENT_COINS (user=${req.user.userId})`);
      res.status(402).json({
        code: 'INSUFFICIENT_COINS',
        message: "You don't have enough coins to run this feature. Buy more coins to continue.",
        featureKey,
        buyCoinsUrl: '/profile?tab=coins',
      });
      return;
    }

    // Store transaction ID for potential downstream refund
    console.log(`[COIN_GATE] ${featureKey} debited → balance=${result.balanceAfter} (user=${req.user.userId}, txn=${result.transaction.id})`);
    req.coinTxnId = result.transaction.id;
    next();
  };
}
