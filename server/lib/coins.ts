/**
 * Coin Wallet — atomic operations
 *
 * Every balance mutation runs inside a PostgreSQL transaction with
 * SELECT ... FOR UPDATE on coin_balances to prevent race conditions.
 *
 * All public functions are safe to call concurrently — the DB-level
 * lock serialises simultaneous requests for the same user.
 */

import { getAuthDbPool } from '../db/auth-connection';
import type { CoinTransaction, CoinTxType } from '../db/coin-store';
import {
  getOrCreateBalance,
  lockBalance,
  insertBalance,
  updateBalance,
  insertCoinTransaction,
  findTransactionByIdempotencyKey,
  findTransactionById,
  getFeatureCost,
  getCoinPricing,
} from '../db/coin-store';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DebitOptions {
  userId: string;
  featureKey: string;
  platformId?: string | null;
  referenceId?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, any>;
  /** Override the cost from feature_costs table (used for custom amounts) */
  costOverride?: number;
}

export interface CreditOptions {
  userId: string;
  amount: number;
  type: CoinTxType;
  platformId?: string | null;
  referenceId?: string | null;
  idempotencyKey?: string | null;
  featureKey?: string | null;
  metadata?: Record<string, any>;
}

export type DebitResult =
  | { ok: true; transaction: CoinTransaction; balanceAfter: number; wasReplay: boolean }
  | { ok: false; reason: 'insufficient_coins' | 'idempotency_replay'; transaction?: CoinTransaction };

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Debit coins for a feature use. Returns ok=false when the user's balance
 * is too low. Idempotent: replaying the same idempotencyKey returns the
 * original transaction without re-debiting (caller can detect this via
 * `wasReplay: true`).
 */
export async function debitCoins(opts: DebitOptions): Promise<DebitResult> {
  // Idempotency check (outside transaction — fast path)
  if (opts.idempotencyKey) {
    const existing = await findTransactionByIdempotencyKey(opts.idempotencyKey);
    if (existing) {
      return {
        ok: true,
        transaction: existing,
        balanceAfter: existing.balance_after,
        wasReplay: true,
      };
    }
  }

  const cost = opts.costOverride ?? (await getFeatureCost(opts.featureKey));

  const pool = getAuthDbPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ensure the balance row exists
    await insertBalance(opts.userId, client);

    const bal = await lockBalance(opts.userId, client);
    if (!bal || bal.balance < cost) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'insufficient_coins' };
    }

    const newBalance = bal.balance - cost;
    await updateBalance(opts.userId, newBalance, 0, cost, client);

    const txn = await insertCoinTransaction(
      {
        userId: opts.userId,
        platformId: opts.platformId,
        type: 'debit',
        amount: -cost,
        featureKey: opts.featureKey,
        referenceId: opts.referenceId,
        balanceAfter: newBalance,
        idempotencyKey: opts.idempotencyKey,
        metadata: opts.metadata,
      },
      client,
    );

    await client.query('COMMIT');
    return { ok: true, transaction: txn, balanceAfter: newBalance, wasReplay: false };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Credit coins to a user (purchase, admin grant, monthly top-up, etc.).
 * Idempotent on idempotencyKey.
 */
export async function creditCoins(opts: CreditOptions): Promise<CoinTransaction> {
  if (opts.idempotencyKey) {
    const existing = await findTransactionByIdempotencyKey(opts.idempotencyKey);
    if (existing) return existing;
  }

  const pool = getAuthDbPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await insertBalance(opts.userId, client);
    const bal = await lockBalance(opts.userId, client);
    const current = bal?.balance ?? 0;
    const newBalance = current + opts.amount;

    await updateBalance(opts.userId, newBalance, opts.amount, 0, client);

    const txn = await insertCoinTransaction(
      {
        userId: opts.userId,
        platformId: opts.platformId,
        type: opts.type,
        amount: opts.amount,
        featureKey: opts.featureKey,
        referenceId: opts.referenceId,
        balanceAfter: newBalance,
        idempotencyKey: opts.idempotencyKey,
        metadata: opts.metadata,
      },
      client,
    );

    await client.query('COMMIT');
    return txn;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Refund coins by reversing a prior debit transaction.
 * No-ops if the original transaction was not a debit.
 */
export async function refundCoins(
  originalTxnId: string,
  platformId?: string | null,
): Promise<CoinTransaction | null> {
  const original = await findTransactionById(originalTxnId);
  if (!original || original.type !== 'debit') return null;

  const refundKey = `refund:${originalTxnId}`;
  return creditCoins({
    userId: original.user_id,
    amount: Math.abs(original.amount),
    type: 'refund',
    platformId,
    referenceId: originalTxnId,
    idempotencyKey: refundKey,
    featureKey: original.feature_key,
    metadata: { original_txn_id: originalTxnId },
  });
}

/** Read current balance (no lock). */
export async function getBalance(userId: string): Promise<number> {
  const bal = await getOrCreateBalance(userId);
  return bal.balance;
}

/**
 * Grant the configured signup-bonus coins to a brand-new user.
 *
 * - Idempotent via `signup_bonus:<userId>` idempotency key — calling twice
 *   for the same user does NOT double-credit.
 * - No-op when the admin has set the bonus to 0 (no ledger row written).
 * - Failures are caught here and logged — callers should NEVER let a coin
 *   credit failure fail the signup itself.
 */
export async function grantSignupBonus(userId: string): Promise<CoinTransaction | null> {
  try {
    const pricing = await getCoinPricing();
    const amount = pricing.signup_bonus_coins;
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }
    const txn = await creditCoins({
      userId,
      amount,
      type: 'signup_bonus',
      referenceId: userId,
      idempotencyKey: `signup_bonus:${userId}`,
      metadata: { reason: 'new_user_signup_bonus' },
    });
    console.log(`[COINS] Signup bonus credited: user=${userId} amount=${amount}`);
    return txn;
  } catch (err: any) {
    // Bonus credit failures must never block signup.
    console.error(`[COINS] grantSignupBonus failed for user=${userId}:`, err.message);
    return null;
  }
}
