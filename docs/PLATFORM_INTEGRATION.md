# Platform Integration Guide

This document is for engineers integrating a **second** or **third** product
with the EquityPro auth + coin service. Your platform's backend authenticates
users against this service and spends user coins on their behalf.

The browser-facing EquityPro app (`app.equitypro.ai`) is **already** wired and
does not need to follow this guide.

---

## 1. Get a platform key

An EquityPro admin registers your platform once via the admin panel:

1. Sign in at `https://auth.equitypro.ai/admin/platforms` (admin role required)
2. Click **New Platform**, enter a slug (e.g. `statstack`) and a name
3. On the platform's row, click the chevron, then **New key**
4. **Copy the public key + secret immediately** — they're shown once and never
   recoverable from the database (only their hashes are stored)

Store both in your platform's secret manager:

```
PLATFORM_PUBLIC_KEY = pk_xxxxxxxxxxxxxxxx
PLATFORM_SECRET     = sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 2. Sign every server-to-server request

All `/auth/v3/*` and `/api/coins/debit|refund` endpoints require these three
headers:

| Header                      | Value                                                   |
|-----------------------------|---------------------------------------------------------|
| `X-Platform-Key`            | Your `PLATFORM_PUBLIC_KEY`                              |
| `X-Platform-Timestamp`      | Current Unix timestamp (seconds)                        |
| `X-Platform-Signature`      | `sha256(secretHash + '.' + timestamp + '.' + rawBody)`  |

Where `secretHash = sha256(PLATFORM_SECRET)` (computed once and cached).

Timestamps must be within ±5 minutes of server time or the request is rejected.

### Reference signer (Node.js)

```ts
import crypto from 'node:crypto';

const PUBLIC_KEY = process.env.PLATFORM_PUBLIC_KEY!;
const SECRET     = process.env.PLATFORM_SECRET!;
const SECRET_HASH = crypto.createHash('sha256').update(SECRET).digest('hex');

function sign(body: object): { headers: Record<string, string>; raw: string } {
  const raw = JSON.stringify(body ?? {});
  const ts  = Math.floor(Date.now() / 1000).toString();
  const sig = crypto
    .createHash('sha256')
    .update(`${SECRET_HASH}.${ts}.${raw}`)
    .digest('hex');
  return {
    headers: {
      'Content-Type':         'application/json',
      'X-Platform-Key':       PUBLIC_KEY,
      'X-Platform-Timestamp': ts,
      'X-Platform-Signature': sig,
    },
    raw,
  };
}
```

### Reference signer (Python)

```python
import hashlib, json, time, os

PUBLIC_KEY = os.environ['PLATFORM_PUBLIC_KEY']
SECRET     = os.environ['PLATFORM_SECRET']
SECRET_HASH = hashlib.sha256(SECRET.encode()).hexdigest()

def sign(body: dict):
    raw = json.dumps(body, separators=(',', ':'))
    ts  = str(int(time.time()))
    sig = hashlib.sha256(f"{SECRET_HASH}.{ts}.{raw}".encode()).hexdigest()
    return {
        'headers': {
            'Content-Type':         'application/json',
            'X-Platform-Key':       PUBLIC_KEY,
            'X-Platform-Timestamp': ts,
            'X-Platform-Signature': sig,
        },
        'raw': raw,
    }
```

> **Important:** the body sent on the wire must match `raw` byte-for-byte.
> If your HTTP client re-serialises JSON, use the raw string returned above
> instead of letting it serialise the object again.

---

## 3. Authenticate a user

### `POST /auth/v3/login`

Takes a user's email/username + password, returns a JWT session.

**Request body:**
```json
{ "identifier": "user@example.com", "password": "p@ssw0rd" }
```

**Response (200):**
```json
{
  "token":       "eyJhbGciOi...",
  "refreshToken":"eyJhbGciOi...",
  "issuedAt":    "2026-04-28T05:30:00.000Z",
  "expiresAt":   "2026-04-28T11:30:00.000Z",
  "user": {
    "id":    "uuid",
    "email": "user@example.com",
    "username": "alice",
    "tier":  "semi",
    "role":  "user"
  },
  "coins":    { "balance": 87, "lifetime_earned": 200, "lifetime_spent": 113 },
  "platform": { "id": "uuid", "slug": "statstack", "name": "StatStack" }
}
```

**Errors:**

| Status | Code             | Meaning                                    |
|--------|------------------|--------------------------------------------|
| 400    | —                | Missing/invalid identifier or password     |
| 401    | —                | Invalid credentials, or wrong auth provider |
| 423    | `ACCOUNT_LOCKED` | 5+ failed attempts in 30 min                |
| 403    | —                | Account deactivated                         |

### `GET /auth/v3/me`  *(Bearer JWT, no platform signature)*

Returns the authenticated user's identity, current tier, and live coin balance.

```bash
curl https://auth.equitypro.ai/auth/v3/me \
     -H "Authorization: Bearer ${ACCESS_TOKEN}"
```

### `POST /auth/v3/logout`  *(Bearer JWT, no platform signature)*

Revokes the session associated with the access token.

---

## 4. Spend coins on a user's behalf

Your platform calls these endpoints once per gated feature use. Coin balances
are global — coins purchased on EquityPro are spendable on your platform too.

### `POST /api/coins/debit`

```json
{
  "user_id":         "uuid",
  "feature_key":     "statstack.match_search",
  "reference_id":    "match-2026-04-28-A",
  "idempotency_key": "match-2026-04-28-A:debit",
  "metadata":        { "any": "json" }
}
```

**Behaviour:**

| Tier   | What happens                                                        |
|--------|---------------------------------------------------------------------|
| `pro`  | Returns `200` with no debit (transaction not written)               |
| `semi` | Debits `feature_costs[feature_key]` coins; returns `402` if balance < cost |
| `free` | Returns `402` with `code: TIER_BLOCKED`                             |

**Response (200):**
```json
{
  "data": {
    "transaction":    { "id": "...", "amount": -3, "balance_after": 84, "..." },
    "balance_after":  84
  }
}
```

**Response (402):**
```json
{
  "code":         "INSUFFICIENT_COINS",
  "message":      "Insufficient coins to perform this action",
  "transaction":  null
}
```

### `POST /api/coins/refund`

If the feature run failed and you want to return the coins:

```json
{ "transaction_id": "uuid-from-debit-response" }
```

The refund credits the user with the same amount, marked as a `refund` ledger
entry. Idempotent — calling twice with the same `transaction_id` returns the
same refund row.

---

## 5. Adding a new feature_key to the catalog

By default `feature_costs` is seeded with `backtest.run`, `screener.run`, and
`sentiment.analyze`. To register a feature your platform owns:

1. EquityPro admin navigates to `/admin/coins/feature-costs`
2. Clicks **Add feature**, enters key (e.g. `statstack.match_search`) + cost (e.g. 3)

Until the row exists, debits for that key default to **1 coin**. Always
register your features before going live.

---

## 6. Health check

```bash
curl https://auth.equitypro.ai/health
```

Returns 200 when the auth + coin service is up. Use as the readiness probe
for your platform's startup.

---

## 7. Errors and retry policy

- **5xx** errors are safe to retry with the same `idempotency_key`. Coin
  debits with the same key never charge twice.
- **402** errors should **not** be retried automatically — surface "Insufficient
  coins" + a buy-coins link to the end user.
- **401** with `code: ACCOUNT_LOCKED` should not be retried for 30 minutes.

## 8. Logs and audit

Every request is logged to `auth_logs` with the platform slug in `metadata`.
Admins can filter by your platform from `/admin/audit`.

---

## Open items (post-MVP)

- **OAuth code-exchange flow** (`POST /auth/v3/exchange-token`) — for "Sign
  in with EquityPro" buttons that redirect users through the EquityPro login
  page rather than collecting a password directly.
- **Platform-scoped `feature_costs` overrides** — currently a feature key has
  one global cost; per-platform overrides are on the roadmap.
