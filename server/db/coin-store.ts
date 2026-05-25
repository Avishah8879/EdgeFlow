/**
 * Coin Store
 *
 * All coin_balances mutations go through the atomic helpers in
 * server/lib/coins.ts (which use SELECT FOR UPDATE). These functions
 * here are the raw DB accessors; callers should not bypass the lib layer
 * for write operations.
 */

import { query, queryOne, transaction } from './auth-connection';

export type CoinTxType =
  | 'purchase'
  | 'debit'
  | 'refund'
  | 'admin_grant'
  | 'monthly_top_up'
  | 'expiry'
  | 'signup_bonus';

export interface CoinBalance {
  user_id: string;
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
  updated_at: Date;
}

export interface CoinTransaction {
  id: string;
  user_id: string;
  platform_id: string | null;
  type: CoinTxType;
  amount: number;
  feature_key: string | null;
  reference_id: string | null;
  balance_after: number;
  idempotency_key: string | null;
  metadata: Record<string, any>;
  created_at: Date;
}

export interface CoinPack {
  id: string;
  name: string;
  coin_amount: number;
  bonus_coins: number;
  price_inr_paise: number;
  is_active: boolean;
  sort_order: number;
}

export interface FeatureCost {
  feature_key: string;
  cost: number;
  description: string | null;
  is_active: boolean;
}

// ─── Balances ────────────────────────────────────────────────────────────────

/** Get or create the balance row. Always returns a row. */
export async function getOrCreateBalance(userId: string): Promise<CoinBalance> {
  const existing = await queryOne<CoinBalance>(
    'SELECT * FROM coin_balances WHERE user_id = $1',
    [userId],
  );
  if (existing) return existing;

  const r = await query<CoinBalance>(
    `INSERT INTO coin_balances (user_id, balance, lifetime_earned, lifetime_spent)
     VALUES ($1, 0, 0, 0)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [userId],
  );
  return r.rows[0];
}

/** FOR UPDATE variant — must be called inside a transaction. */
export async function lockBalance(
  userId: string,
  client: { query: (sql: string, params?: any[]) => Promise<any> },
): Promise<CoinBalance | null> {
  const r = await client.query(
    'SELECT * FROM coin_balances WHERE user_id = $1 FOR UPDATE',
    [userId],
  );
  return r.rows[0] ?? null;
}

export async function updateBalance(
  userId: string,
  newBalance: number,
  deltaEarned: number,
  deltaSpent: number,
  client: { query: (sql: string, params?: any[]) => Promise<any> },
): Promise<void> {
  await client.query(
    `UPDATE coin_balances
     SET balance          = $2,
         lifetime_earned  = lifetime_earned + $3,
         lifetime_spent   = lifetime_spent  + $4,
         updated_at       = NOW()
     WHERE user_id = $1`,
    [userId, newBalance, deltaEarned, deltaSpent],
  );
}

export async function insertBalance(
  userId: string,
  client: { query: (sql: string, params?: any[]) => Promise<any> },
): Promise<void> {
  await client.query(
    `INSERT INTO coin_balances (user_id, balance, lifetime_earned, lifetime_spent)
     VALUES ($1, 0, 0, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
}

// ─── Transactions ────────────────────────────────────────────────────────────

export async function insertCoinTransaction(
  txn: {
    userId: string;
    platformId?: string | null;
    type: CoinTxType;
    amount: number;
    featureKey?: string | null;
    referenceId?: string | null;
    balanceAfter: number;
    idempotencyKey?: string | null;
    metadata?: Record<string, any>;
  },
  client: { query: (sql: string, params?: any[]) => Promise<any> },
): Promise<CoinTransaction> {
  const r = await client.query(
    `INSERT INTO coin_transactions
       (user_id, platform_id, type, amount, feature_key, reference_id,
        balance_after, idempotency_key, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      txn.userId,
      txn.platformId ?? null,
      txn.type,
      txn.amount,
      txn.featureKey ?? null,
      txn.referenceId ?? null,
      txn.balanceAfter,
      txn.idempotencyKey ?? null,
      JSON.stringify(txn.metadata ?? {}),
    ],
  );
  return r.rows[0];
}

export async function findTransactionByIdempotencyKey(
  key: string,
): Promise<CoinTransaction | null> {
  return queryOne<CoinTransaction>(
    'SELECT * FROM coin_transactions WHERE idempotency_key = $1',
    [key],
  );
}

export async function findTransactionById(id: string): Promise<CoinTransaction | null> {
  return queryOne<CoinTransaction>(
    'SELECT * FROM coin_transactions WHERE id = $1',
    [id],
  );
}

export async function listTransactionsForUser(
  userId: string,
  limit = 20,
  offset = 0,
): Promise<CoinTransaction[]> {
  const r = await query<CoinTransaction>(
    `SELECT * FROM coin_transactions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  return r.rows;
}

export async function countTransactionsForUser(userId: string): Promise<number> {
  const r = await query<{ count: string }>(
    'SELECT COUNT(*) FROM coin_transactions WHERE user_id = $1',
    [userId],
  );
  return parseInt(r.rows[0].count, 10);
}

// ─── Admin list ──────────────────────────────────────────────────────────────

export async function listAllTransactions(opts: {
  userId?: string;
  platformId?: string;
  type?: CoinTxType;
  limit?: number;
  offset?: number;
}): Promise<CoinTransaction[]> {
  const conditions: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (opts.userId)     { conditions.push(`user_id = $${i++}`);     params.push(opts.userId); }
  if (opts.platformId) { conditions.push(`platform_id = $${i++}`); params.push(opts.platformId); }
  if (opts.type)       { conditions.push(`type = $${i++}`);        params.push(opts.type); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(opts.limit ?? 50);
  params.push(opts.offset ?? 0);
  const r = await query<CoinTransaction>(
    `SELECT * FROM coin_transactions ${where}
     ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
    params,
  );
  return r.rows;
}

// ─── Packs ───────────────────────────────────────────────────────────────────

export async function listActivePacks(): Promise<CoinPack[]> {
  const r = await query<CoinPack>(
    `SELECT id, name, coin_amount, bonus_coins, price_inr_paise, is_active, sort_order
     FROM coin_packs WHERE is_active = TRUE ORDER BY sort_order`,
  );
  return r.rows;
}

export async function listAllPacks(): Promise<CoinPack[]> {
  const r = await query<CoinPack>(
    `SELECT id, name, coin_amount, bonus_coins, price_inr_paise, is_active, sort_order
     FROM coin_packs ORDER BY sort_order, created_at`,
  );
  return r.rows;
}

export async function getPackById(id: string): Promise<CoinPack | null> {
  return queryOne<CoinPack>(
    'SELECT * FROM coin_packs WHERE id = $1',
    [id],
  );
}

export async function createPack(input: {
  name: string;
  coinAmount: number;
  bonusCoins: number;
  priceInrPaise: number;
  sortOrder?: number;
}): Promise<CoinPack> {
  const r = await query<CoinPack>(
    `INSERT INTO coin_packs (name, coin_amount, bonus_coins, price_inr_paise, sort_order)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [input.name, input.coinAmount, input.bonusCoins, input.priceInrPaise, input.sortOrder ?? 0],
  );
  return r.rows[0];
}

export async function updatePack(
  id: string,
  patch: { name?: string; coinAmount?: number; bonusCoins?: number; priceInrPaise?: number; sortOrder?: number; isActive?: boolean },
): Promise<CoinPack | null> {
  const sets: string[] = []; const params: any[] = []; let i = 1;
  if (patch.name           !== undefined) { sets.push(`name = $${i++}`);            params.push(patch.name); }
  if (patch.coinAmount     !== undefined) { sets.push(`coin_amount = $${i++}`);     params.push(patch.coinAmount); }
  if (patch.bonusCoins     !== undefined) { sets.push(`bonus_coins = $${i++}`);     params.push(patch.bonusCoins); }
  if (patch.priceInrPaise  !== undefined) { sets.push(`price_inr_paise = $${i++}`); params.push(patch.priceInrPaise); }
  if (patch.sortOrder      !== undefined) { sets.push(`sort_order = $${i++}`);      params.push(patch.sortOrder); }
  if (patch.isActive       !== undefined) { sets.push(`is_active = $${i++}`);       params.push(patch.isActive); }
  if (sets.length === 0) return getPackById(id);
  params.push(id);
  const r = await query<CoinPack>(
    `UPDATE coin_packs SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    params,
  );
  return r.rows[0] ?? null;
}

export async function deletePack(id: string): Promise<void> {
  await query('DELETE FROM coin_packs WHERE id = $1', [id]);
}

// ─── Feature costs ───────────────────────────────────────────────────────────

export async function getFeatureCost(featureKey: string): Promise<number> {
  const row = await queryOne<FeatureCost>(
    'SELECT cost FROM feature_costs WHERE feature_key = $1 AND is_active = TRUE',
    [featureKey],
  );
  return row?.cost ?? 1; // default 1 coin if key not registered
}

/**
 * Fetch the full feature_costs row (including is_active). Used by the
 * coin gate to decide whether to debit at all (is_active=false → free).
 */
export async function getFeatureCostRow(featureKey: string): Promise<FeatureCost | null> {
  const row = await queryOne<FeatureCost>(
    'SELECT feature_key, cost, description, is_active FROM feature_costs WHERE feature_key = $1',
    [featureKey],
  );
  return row ?? null;
}

export async function listFeatureCosts(): Promise<FeatureCost[]> {
  const r = await query<FeatureCost>(
    'SELECT * FROM feature_costs ORDER BY feature_key',
  );
  return r.rows;
}

// ─── Coin pricing (single ₹/coin rate + signup bonus) ────────────────────────

export interface CoinPricing {
  paise_per_coin: number;
  signup_bonus_coins: number;
  updated_at: string;
}

export async function getCoinPricing(): Promise<CoinPricing> {
  const row = await queryOne<CoinPricing>(
    'SELECT paise_per_coin, signup_bonus_coins, updated_at FROM coin_pricing WHERE id = 1',
  );
  // Self-heal seeds this row, but defend against an empty result anyway.
  return row ?? {
    paise_per_coin: 100,
    signup_bonus_coins: 10,
    updated_at: new Date().toISOString(),
  };
}

export async function updateCoinPricing(
  paisePerCoin: number,
  updatedBy?: string | null,
): Promise<void> {
  await query(
    `INSERT INTO coin_pricing (id, paise_per_coin, updated_at, updated_by)
     VALUES (1, $1, NOW(), $2)
     ON CONFLICT (id) DO UPDATE
     SET paise_per_coin = $1, updated_at = NOW(), updated_by = $2`,
    [paisePerCoin, updatedBy ?? null],
  );
}

export async function updateSignupBonus(
  bonusCoins: number,
  updatedBy?: string | null,
): Promise<void> {
  await query(
    `INSERT INTO coin_pricing (id, signup_bonus_coins, updated_at, updated_by)
     VALUES (1, $1, NOW(), $2)
     ON CONFLICT (id) DO UPDATE
     SET signup_bonus_coins = $1, updated_at = NOW(), updated_by = $2`,
    [bonusCoins, updatedBy ?? null],
  );
}

export async function upsertFeatureCost(
  featureKey: string,
  cost: number,
  description?: string,
  isActive?: boolean,
): Promise<void> {
  await query(
    `INSERT INTO feature_costs (feature_key, cost, description, is_active)
     VALUES ($1, $2, $3, COALESCE($4, TRUE))
     ON CONFLICT (feature_key) DO UPDATE
     SET cost        = $2,
         description = COALESCE($3, feature_costs.description),
         is_active   = COALESCE($4, feature_costs.is_active),
         updated_at  = NOW()`,
    [featureKey, cost, description ?? null, isActive ?? null],
  );
}
