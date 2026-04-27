/**
 * Tier-based feature gating
 *
 * Single source of truth for which tiers can access which features.
 * Returns one of three verdicts so callers decide how to respond:
 *
 *  'allowed'       — no coins needed; proceed.
 *  'coin_required' — user is Semi; debit coins before proceeding.
 *  'blocked'       — user is Free; return 402 with an upgrade prompt.
 *
 * Coin-gated features (Semi debits, Pro passes through):
 *   backtest.run, screener.run, sentiment.analyze
 *
 * Tier-gated features (only Pro + Semi allowed):
 *   tip_tease.chat
 */

import type { UserTier } from '../auth/jwt';

export type GateVerdict = 'allowed' | 'coin_required' | 'blocked';

const COIN_GATED_FEATURES = new Set([
  'backtest.run',
  'screener.run',
  'sentiment.analyze',
]);

const SEMI_OR_PRO_FEATURES = new Set([
  'tip_tease.chat',
  // Add more as features are introduced
]);

/**
 * Determine whether a user may access a feature.
 *
 * @param tier - The user's current tier from JWT / DB.
 * @param featureKey - Dot-notated feature key, e.g. 'backtest.run'.
 */
export function canAccessFeature(tier: UserTier, featureKey: string): GateVerdict {
  if (COIN_GATED_FEATURES.has(featureKey)) {
    if (tier === 'pro') return 'allowed';
    if (tier === 'semi') return 'coin_required';
    return 'blocked'; // free
  }

  if (SEMI_OR_PRO_FEATURES.has(featureKey)) {
    if (tier === 'free') return 'blocked';
    return 'allowed'; // semi or pro
  }

  // Unregistered feature key — assume open access.
  return 'allowed';
}

/**
 * Convenience: throw a 402-compatible object if the verdict is not 'allowed'
 * or 'coin_required'. Used in Express routes:
 *
 *   const verdict = assertTierAccess(req.user.tier, 'backtest.run', res);
 *   if (!verdict) return; // response already sent
 */
export function assertTierAccess(
  tier: UserTier,
  featureKey: string,
  res: { status: (n: number) => { json: (b: unknown) => void } },
): GateVerdict | null {
  const verdict = canAccessFeature(tier, featureKey);
  if (verdict === 'blocked') {
    res.status(402).json({
      code: 'TIER_BLOCKED',
      message: `This feature requires a paid plan. Upgrade to Semi or Pro to continue.`,
      featureKey,
      currentTier: tier,
    });
    return null;
  }
  return verdict; // 'allowed' or 'coin_required'
}
