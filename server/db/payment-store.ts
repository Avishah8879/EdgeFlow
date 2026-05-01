import { query, queryOne } from './auth-connection';

export type PaymentKind = 'plan' | 'coin_pack' | 'custom_coins';
export type PaymentIntentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';

export interface PaymentIntent {
  id: string;
  user_id: string;
  platform_id: string | null;
  kind: PaymentKind;
  product_id: string;
  amount_paise: number;
  currency: string;
  cashfree_order_id: string | null;
  cashfree_payment_id: string | null;
  status: PaymentIntentStatus;
  fulfilled_at: Date | null;
  fulfilment_key: string | null;
  raw_webhook: Record<string, any>;
  metadata: Record<string, any>;
  created_at: Date;
}

export async function createPaymentIntent(input: {
  userId: string;
  platformId?: string | null;
  kind: PaymentKind;
  productId: string;
  amountPaise: number;
  currency?: string;
  metadata?: Record<string, any>;
}): Promise<PaymentIntent> {
  const r = await query<PaymentIntent>(
    `INSERT INTO payment_intents
       (user_id, platform_id, kind, product_id, amount_paise, currency, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [input.userId, input.platformId ?? null, input.kind, input.productId,
     input.amountPaise, input.currency ?? 'INR',
     JSON.stringify(input.metadata ?? {})],
  );
  return r.rows[0];
}

export async function setCashfreeOrderId(
  intentId: string,
  cfOrderId: string,
): Promise<void> {
  await query(
    `UPDATE payment_intents SET cashfree_order_id = $2 WHERE id = $1`,
    [intentId, cfOrderId],
  );
}

export async function findIntentByCfOrderId(cfOrderId: string): Promise<PaymentIntent | null> {
  return queryOne<PaymentIntent>(
    'SELECT * FROM payment_intents WHERE cashfree_order_id = $1',
    [cfOrderId],
  );
}

export async function markIntentPaid(
  intentId: string,
  cfPaymentId: string,
  fulfilmentKey: string,
  rawWebhook: object,
): Promise<boolean> {
  const r = await query(
    `UPDATE payment_intents
     SET status = 'paid',
         cashfree_payment_id = $2,
         fulfilment_key = $3,
         fulfilled_at = NOW(),
         raw_webhook = $4
     WHERE id = $1 AND fulfilment_key IS NULL
     RETURNING id`,
    [intentId, cfPaymentId, fulfilmentKey, JSON.stringify(rawWebhook)],
  );
  return r.rowCount > 0;
}

export async function listIntentsForUser(
  userId: string,
  limit = 20,
  offset = 0,
): Promise<PaymentIntent[]> {
  const r = await query<PaymentIntent>(
    `SELECT * FROM payment_intents
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  return r.rows;
}
