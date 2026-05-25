/**
 * Shared 402 (insufficient coins) error type used by feature hooks.
 * When a feature start endpoint returns 402, hooks populate `coinError`
 * so the UI can show a "Buy coins" CTA rather than a generic error.
 */

export interface CoinError {
  code: "TIER_BLOCKED" | "INSUFFICIENT_COINS";
  message: string;
  featureKey: string;
  currentTier: string;
  upgradeUrl?: string;
  buyCoinsUrl?: string;
}

export function parseCoinError(status: number, body: any): CoinError | null {
  if (status !== 402) return null;
  if (!body?.code) return null;
  return {
    code: body.code,
    message: body.message || "Upgrade required",
    featureKey: body.featureKey || "",
    currentTier: body.currentTier || "free",
    upgradeUrl: body.upgradeUrl,
    buyCoinsUrl: body.buyCoinsUrl,
  };
}
