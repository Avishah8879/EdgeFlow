/**
 * Payment Routes — Cashfree Orders v3
 *
 * POST /api/payments/checkout        (auth) — create order, return session id
 * POST /api/payments/webhook         (no auth, signature-verified)
 * GET  /api/payments/history         (auth) — user's payment history
 * GET  /api/payments/status/:orderId (auth) — single order status
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from './middleware/auth';
import { query } from './db/auth-connection';
import {
  createCashfreeOrder,
  verifyWebhookSignature,
  isCashfreeConfigured,
  getCashfreeOrderStatus,
  getLatestSuccessfulPayment,
  type CashfreeWebhookPayload,
} from './lib/cashfree';
import {
  createPaymentIntent,
  setCashfreeOrderId,
  findIntentById,
  markIntentPaid,
  listIntentsForUser,
  type PaymentIntent,
} from './db/payment-store';
import { getPackById, getCoinPricing } from './db/coin-store';
import { getPlanById } from './db/subscription-store';
import { creditCoins } from './lib/coins';
import { activateSubscription } from './db/subscription-store';
import { findUserByIdV2 } from './auth/store-v2';

const router = Router();

// Discriminated union: { kind: 'plan' | 'coin_pack', product_id: string }
//                  OR  { kind: 'custom_coins', quantity: number }
const checkoutSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('plan'),       product_id: z.string().min(1) }),
  z.object({ kind: z.literal('coin_pack'),  product_id: z.string().min(1) }),
  z.object({ kind: z.literal('custom_coins'), quantity: z.number().int().positive().max(100_000) }),
]);

// ─── Checkout ────────────────────────────────────────────────────────────────

router.post('/api/payments/checkout', requireAuth, async (req: Request, res: Response) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input', errors: parsed.error.flatten() });
    return;
  }

  if (!isCashfreeConfigured()) {
    res.status(503).json({ message: 'Payment gateway not configured. Contact support.' });
    return;
  }

  const data = parsed.data;
  const userId = req.user!.userId;

  try {
    const user = await findUserByIdV2(userId);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    let amountPaise: number;
    let description: string;
    let productId: string;
    let metadata: Record<string, any> | undefined;

    if (data.kind === 'coin_pack') {
      const pack = await getPackById(data.product_id);
      if (!pack || !pack.is_active) {
        res.status(404).json({ message: 'Coin pack not found' });
        return;
      }
      amountPaise = pack.price_inr_paise;
      description = `${pack.name} — ${pack.coin_amount + pack.bonus_coins} coins`;
      productId = data.product_id;
    } else if (data.kind === 'plan') {
      const plan = await getPlanById(data.product_id);
      if (!plan || !plan.is_active) {
        res.status(404).json({ message: 'Plan not found' });
        return;
      }
      amountPaise = plan.price_cents;
      description = plan.name;
      productId = data.product_id;
    } else {
      // custom_coins — compute amount from admin-set ₹/coin rate
      const pricing = await getCoinPricing();
      amountPaise = data.quantity * pricing.paise_per_coin;
      description = `${data.quantity} coins (custom amount)`;
      productId = `custom:${data.quantity}`;
      metadata = { quantity: data.quantity, paise_per_coin: pricing.paise_per_coin };
    }

    // Create intent row first so we have a stable order_id
    const intent = await createPaymentIntent({
      userId,
      kind: data.kind,
      productId,
      amountPaise,
      currency: 'INR',
      metadata,
    });

    const cfOrder = await createCashfreeOrder({
      orderId:       intent.id,
      amount:        amountPaise / 100,
      currency:      'INR',
      customerId:    userId,
      customerEmail: user.email,
      customerPhone: user.phone_number || '9999999999',
      orderNote:     description,
    });

    await setCashfreeOrderId(intent.id, cfOrder.cf_order_id);

    res.json({
      data: {
        intent_id:          intent.id,
        payment_session_id: cfOrder.payment_session_id,
        cf_order_id:        cfOrder.cf_order_id,
        amount:             amountPaise / 100,
        currency:           'INR',
      },
    });
  } catch (err: any) {
    console.error('[PAYMENTS] checkout error:', err.message);
    res.status(500).json({ message: 'Failed to create payment order' });
  }
});

// ─── Shared fulfillment helper ───────────────────────────────────────────────

/**
 * Idempotently fulfill a paid intent. Used by both the webhook handler and
 * the manual `/verify/:intentId` polling endpoint. Returns:
 *   - 'fulfilled' if this call made the side-effect
 *   - 'already-fulfilled' if a previous call already did it
 *
 * Caller is responsible for verifying the payment is actually SUCCESS before
 * invoking — this function trusts its inputs.
 */
async function fulfillPaidIntent(
  intent: PaymentIntent,
  cfPaymentId: string,
  rawWebhookOrStatus: object,
): Promise<'fulfilled' | 'already-fulfilled'> {
  const fulfilmentKey = `paid:${cfPaymentId}`;
  const claimed = await markIntentPaid(intent.id, cfPaymentId, fulfilmentKey, rawWebhookOrStatus);
  if (!claimed) return 'already-fulfilled';

  if (intent.kind === 'coin_pack') {
    const pack = await getPackById(intent.product_id);
    if (pack) {
      const totalCoins = pack.coin_amount + pack.bonus_coins;
      await creditCoins({
        userId:         intent.user_id,
        amount:         totalCoins,
        type:           'purchase',
        referenceId:    intent.id,
        idempotencyKey: fulfilmentKey,
        metadata: { pack_name: pack.name, cf_payment_id: cfPaymentId },
      });
    }
  } else if (intent.kind === 'custom_coins') {
    const quantity = Number(intent.metadata?.quantity);
    if (Number.isFinite(quantity) && quantity > 0) {
      await creditCoins({
        userId:         intent.user_id,
        amount:         quantity,
        type:           'purchase',
        referenceId:    intent.id,
        idempotencyKey: fulfilmentKey,
        metadata: {
          kind: 'custom_coins',
          paise_per_coin: intent.metadata?.paise_per_coin,
          cf_payment_id: cfPaymentId,
        },
      });
    } else {
      console.error('[PAYMENTS] custom_coins intent missing quantity metadata:', intent.id);
    }
  } else if (intent.kind === 'plan') {
    const plan = await getPlanById(intent.product_id);
    if (plan) {
      const subEnd = new Date();
      const intervalMonths = plan.billing_interval === 'year' ? 12 : 1;
      subEnd.setMonth(subEnd.getMonth() + intervalMonths);
      await activateSubscription(intent.user_id, intent.product_id, subEnd);
    }
  }

  console.log(`[PAYMENTS] Fulfilled intent ${intent.id} (${intent.kind}: ${intent.product_id})`);
  return 'fulfilled';
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

router.post('/api/payments/webhook', async (req: Request, res: Response) => {
  const timestamp = req.header('x-webhook-timestamp') ?? '';
  const signature = req.header('x-webhook-signature') ?? '';

  const rawBody = typeof (req as any).rawBody === 'string'
    ? (req as any).rawBody
    : JSON.stringify(req.body);

  if (isCashfreeConfigured() && !verifyWebhookSignature(rawBody, timestamp, signature)) {
    console.warn('[PAYMENTS] Webhook signature verification failed');
    res.status(401).json({ message: 'Invalid signature' });
    return;
  }

  const payload: CashfreeWebhookPayload = req.body;
  const { payment, order } = payload.data ?? {};

  if (!payment || !order) {
    res.json({ received: true });
    return;
  }

  if (payment.payment_status !== 'SUCCESS') {
    res.json({ received: true });
    return;
  }

  try {
    // Cashfree's webhook payload `data.order.order_id` is the merchant's
    // order_id (= our intent.id), NOT the cf_order_id. Look up by id.
    const intent = await findIntentById(order.order_id);
    if (!intent) {
      console.error('[PAYMENTS] No intent found for order_id:', order.order_id);
      res.json({ received: true });
      return;
    }

    await fulfillPaidIntent(intent, payment.cf_payment_id, payload);
    res.json({ received: true });
  } catch (err: any) {
    console.error('[PAYMENTS] webhook error:', err.message);
    res.json({ received: true, error: err.message });
  }
});

// ─── Manual verify (polling fallback for missed webhooks) ────────────────────

/**
 * Polls Cashfree's GET /pg/orders/{order_id} for an intent and runs the
 * same fulfillment path as the webhook if the order is PAID.
 *
 * - Authorization: only the intent's owner OR an admin may verify.
 * - Idempotent: safe to call repeatedly. Already-paid intents return
 *   { status: 'paid', already_fulfilled: true }.
 * - Always reflects authoritative Cashfree state, not cached webhook state.
 */
router.post('/api/payments/verify/:intentId', requireAuth, async (req: Request, res: Response) => {
  const intentId = req.params.intentId;
  if (!intentId) {
    res.status(400).json({ message: 'intentId required' });
    return;
  }

  if (!isCashfreeConfigured()) {
    res.status(503).json({ message: 'Payment gateway not configured' });
    return;
  }

  try {
    const intent = await findIntentById(intentId);
    if (!intent) {
      res.status(404).json({ message: 'Payment intent not found' });
      return;
    }

    const isOwner = intent.user_id === req.user!.userId;
    const role = req.user!.role;
    const isAdminUser = role === 'admin' || role === 'super_admin';
    if (!isOwner && !isAdminUser) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }

    if (intent.status === 'paid') {
      res.json({
        data: { status: 'paid', already_fulfilled: true, intent_id: intent.id },
      });
      return;
    }

    // Poll Cashfree for authoritative state
    const orderStatus = await getCashfreeOrderStatus(intent.id);
    if (orderStatus.order_status !== 'PAID') {
      res.json({
        data: {
          status: orderStatus.order_status.toLowerCase(),
          already_fulfilled: false,
          intent_id: intent.id,
          message: `Cashfree order_status=${orderStatus.order_status}; nothing to fulfill yet.`,
        },
      });
      return;
    }

    // PAID — find the successful payment row to grab cf_payment_id
    let cfPaymentId: string | null = null;
    if (orderStatus.payments?.length) {
      const succ = orderStatus.payments.find((p) => p.payment_status === 'SUCCESS');
      if (succ) cfPaymentId = String(succ.cf_payment_id);
    }
    if (!cfPaymentId) {
      const fallback = await getLatestSuccessfulPayment(intent.id);
      cfPaymentId = fallback?.cf_payment_id ?? null;
    }
    if (!cfPaymentId) {
      res.status(502).json({
        message: 'Cashfree reports order as PAID but no SUCCESS payment record found',
      });
      return;
    }

    const result = await fulfillPaidIntent(intent, cfPaymentId, {
      source: 'verify-poll',
      order_status: orderStatus,
    });

    res.json({
      data: {
        status: 'paid',
        already_fulfilled: result === 'already-fulfilled',
        intent_id: intent.id,
        cf_payment_id: cfPaymentId,
      },
    });
  } catch (err: any) {
    console.error('[PAYMENTS] verify error:', err.message);
    res.status(500).json({ message: err.message || 'Verification failed' });
  }
});

// ─── History ─────────────────────────────────────────────────────────────────

router.get('/api/payments/history', requireAuth, async (req: Request, res: Response) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const intents = await listIntentsForUser(req.user!.userId, limit, offset);
    res.json({ data: intents });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to fetch payment history' });
  }
});

// ─── Admin: payment intents explorer ─────────────────────────────────────────

router.get('/api/admin/payments', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string | undefined;
    const kind   = req.query.kind as string | undefined;
    const userId = req.query.user_id as string | undefined;

    const conditions: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (status && ['pending','paid','failed','expired','refunded'].includes(status)) {
      conditions.push(`p.status = $${i++}::payment_intent_status`); params.push(status);
    }
    if (kind && ['plan','coin_pack','custom_coins'].includes(kind)) {
      conditions.push(`p.kind = $${i++}::payment_kind`); params.push(kind);
    }
    if (userId) {
      conditions.push(`p.user_id = $${i++}`); params.push(userId);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit); params.push(offset);

    const r = await query(
      `SELECT p.*, u.email AS user_email, u.username AS user_username
       FROM payment_intents p
       LEFT JOIN users u ON u.id = p.user_id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      params,
    );
    res.json({ data: r.rows });
  } catch (err: any) {
    console.error('[PAYMENTS] admin list error:', err.message);
    res.status(500).json({ message: 'Failed to list payments' });
  }
});

// ─── Admin: dashboard stats (coins + payments today) ────────────────────────

router.get('/api/admin/coins/stats', requireAuth, requireAdmin, async (_req, res: Response) => {
  try {
    const r = await query<any>(
      `SELECT
         COALESCE(SUM(CASE WHEN type IN ('purchase','admin_grant','monthly_top_up','refund')
                            AND created_at >= NOW() - INTERVAL '24 hours'
                       THEN amount ELSE 0 END), 0) AS coins_issued_24h,
         COALESCE(SUM(CASE WHEN type = 'debit'
                            AND created_at >= NOW() - INTERVAL '24 hours'
                       THEN -amount ELSE 0 END), 0) AS coins_spent_24h,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS txns_24h,
         COUNT(DISTINCT user_id) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS active_users_24h
       FROM coin_transactions`,
    );
    const p = await query<any>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending') AS pending_intents,
         COUNT(*) FILTER (WHERE status = 'paid' AND fulfilled_at >= NOW() - INTERVAL '24 hours') AS paid_24h,
         COALESCE(SUM(amount_paise) FILTER (WHERE status = 'paid' AND fulfilled_at >= NOW() - INTERVAL '24 hours'), 0) AS revenue_paise_24h
       FROM payment_intents`,
    );
    const pl = await query<any>(
      `SELECT COUNT(*) FILTER (WHERE is_active = TRUE) AS active_platforms,
              COUNT(*) AS total_platforms FROM platforms`,
    );
    res.json({
      data: {
        coins_issued_24h:  parseInt(r.rows[0].coins_issued_24h),
        coins_spent_24h:   parseInt(r.rows[0].coins_spent_24h),
        txns_24h:          parseInt(r.rows[0].txns_24h),
        active_users_24h:  parseInt(r.rows[0].active_users_24h),
        pending_intents:   parseInt(p.rows[0].pending_intents),
        paid_24h:          parseInt(p.rows[0].paid_24h),
        revenue_paise_24h: parseInt(p.rows[0].revenue_paise_24h),
        active_platforms:  parseInt(pl.rows[0].active_platforms),
        total_platforms:   parseInt(pl.rows[0].total_platforms),
      },
    });
  } catch (err: any) {
    console.error('[COINS] stats error:', err.message);
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
});

export default router;
