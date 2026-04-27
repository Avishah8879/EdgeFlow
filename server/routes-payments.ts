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
  type CashfreeWebhookPayload,
} from './lib/cashfree';
import {
  createPaymentIntent,
  setCashfreeOrderId,
  findIntentByCfOrderId,
  markIntentPaid,
  listIntentsForUser,
} from './db/payment-store';
import { getPackById } from './db/coin-store';
import { getPlanById } from './db/subscription-store';
import { creditCoins } from './lib/coins';
import { activateSubscription } from './db/subscription-store';
import { findUserByIdV2 } from './auth/store-v2';

const router = Router();

const checkoutSchema = z.object({
  kind:       z.enum(['plan', 'coin_pack']),
  product_id: z.string().min(1),
});

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

  const { kind, product_id } = parsed.data;
  const userId = req.user!.userId;

  try {
    const user = await findUserByIdV2(userId);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    let amountPaise: number;
    let description: string;

    if (kind === 'coin_pack') {
      const pack = await getPackById(product_id);
      if (!pack || !pack.is_active) {
        res.status(404).json({ message: 'Coin pack not found' });
        return;
      }
      amountPaise = pack.price_inr_paise;
      description = `${pack.name} — ${pack.coin_amount + pack.bonus_coins} coins`;
    } else {
      const plan = await getPlanById(product_id);
      if (!plan || !plan.is_active) {
        res.status(404).json({ message: 'Plan not found' });
        return;
      }
      amountPaise = plan.price_cents;
      description = plan.name;
    }

    // Create intent row first so we have a stable order_id
    const intent = await createPaymentIntent({
      userId,
      kind,
      productId: product_id,
      amountPaise,
      currency: 'INR',
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
    res.json({ received: true }); // unknown event shape — ack silently
    return;
  }

  if (payment.payment_status !== 'SUCCESS') {
    res.json({ received: true }); // non-success — log but don't fulfil
    return;
  }

  try {
    const intent = await findIntentByCfOrderId(order.order_id);
    if (!intent) {
      console.error('[PAYMENTS] No intent found for cf_order_id:', order.order_id);
      res.json({ received: true });
      return;
    }

    const fulfilmentKey = `paid:${payment.cf_payment_id}`;
    const claimed = await markIntentPaid(
      intent.id,
      payment.cf_payment_id,
      fulfilmentKey,
      payload,
    );

    if (!claimed) {
      // Already fulfilled — idempotent ack
      res.json({ received: true });
      return;
    }

    // Apply the side-effect
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
          metadata: { pack_name: pack.name, cf_payment_id: payment.cf_payment_id },
        });
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
    res.json({ received: true });
  } catch (err: any) {
    console.error('[PAYMENTS] webhook error:', err.message);
    // Respond 200 so Cashfree doesn't keep retrying a logic error
    res.json({ received: true, error: err.message });
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
    if (kind && ['plan','coin_pack'].includes(kind)) {
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
