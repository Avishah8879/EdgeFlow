/**
 * Cashfree Payments — Orders v3 (REST wrapper)
 *
 * We call the Cashfree REST API directly rather than using the npm SDK,
 * which has inconsistent types and requires a different version per environment.
 *
 * Env vars required (add to .env / NSSM service env):
 *   CASHFREE_APP_ID      — from Cashfree dashboard
 *   CASHFREE_SECRET_KEY  — from Cashfree dashboard
 *   CASHFREE_ENV         — 'sandbox' | 'production'  (default: sandbox)
 */

import crypto from 'crypto';

const APP_ID  = process.env.CASHFREE_APP_ID  || '';
const SECRET  = process.env.CASHFREE_SECRET_KEY || '';
const CF_ENV  = process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox';

const BASE_URL = CF_ENV === 'production'
  ? 'https://api.cashfree.com'
  : 'https://sandbox.cashfree.com';

const API_VERSION = '2023-08-01';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CashfreeOrderRequest {
  orderId:     string;   // must be unique per merchant; use payment_intent.id
  amount:      number;   // INR amount (NOT paise)
  currency:    string;   // 'INR'
  customerId:  string;   // user UUID
  customerEmail: string;
  customerPhone: string;
  orderNote?:  string;
  returnUrl?:  string;
}

export interface CashfreeOrderResponse {
  cf_order_id:    string;
  order_id:       string;
  payment_session_id: string;
  order_status:   string;
  order_amount:   number;
  order_currency: string;
  order_expiry_time: string;
}

export interface CashfreeWebhookPayload {
  data: {
    payment: {
      cf_payment_id:  string;
      payment_status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'USER_DROPPED';
      payment_amount: number;
      payment_currency: string;
      payment_time:   string;
    };
    order: {
      order_id:       string;
      order_amount:   number;
      order_currency: string;
    };
  };
  event_time: string;
  type: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function cfFetch(path: string, method: string, body?: object) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-version': API_VERSION,
      'x-client-id':     APP_ID,
      'x-client-secret': SECRET,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || `Cashfree API error ${res.status}`);
  }
  return json;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a Cashfree order. Returns the payment_session_id that the
 * frontend JS SDK uses to open the checkout drop-in.
 */
export async function createCashfreeOrder(
  req: CashfreeOrderRequest,
): Promise<CashfreeOrderResponse> {
  return cfFetch('/pg/orders', 'POST', {
    order_id:       req.orderId,
    order_amount:   req.amount,
    order_currency: req.currency,
    order_note:     req.orderNote ?? 'EquityPro purchase',
    customer_details: {
      customer_id:    req.customerId,
      customer_email: req.customerEmail,
      customer_phone: req.customerPhone || '9999999999',
    },
    order_meta: {
      return_url: req.returnUrl ?? `${process.env.VITE_AUTH_BASE_URL}/profile?tab=coins&cf_order_id={order_id}&cf_payment_id={payment_id}`,
    },
  });
}

/**
 * Verify a Cashfree webhook signature.
 *
 * Cashfree signs webhooks with HMAC-SHA256 of the timestamp + raw body
 * using the client secret. Header names: x-webhook-timestamp, x-webhook-signature.
 */
export function verifyWebhookSignature(
  rawBody:   string,
  timestamp: string,
  signature: string,
): boolean {
  if (!SECRET) return false;
  const signedData = `${timestamp}${rawBody}`;
  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(signedData)
    .digest('base64');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature),
    );
  } catch {
    return false;
  }
}

export function isCashfreeConfigured(): boolean {
  return Boolean(APP_ID && SECRET);
}
