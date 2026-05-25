# Pinescript AI - Auth + Coin Wallet Integration Brief

> **Audience:** the agent/session working in the Pinescript AI app repo.
>
> **Source of truth:** EdgeFlow is the central auth + coin wallet authority. Treat the API contract below as fixed from the Pinescript AI side. Do not modify EdgeFlow from the Pinescript AI repo.
>
> **Platform slug:** `pinescript-ai`
>
> **Primary coin feature key:** `pinescript.generate`
>
> **Credential note:** the platform API key/secret is stored locally in a gitignored handoff file. Do not paste secrets into chat and do not commit them.

---

## 1. Goal

Pinescript AI should stop owning separate user identity or wallet behavior. It should use EdgeFlow for:

- user login/session validation
- current coin balance
- coin debit for Pine Script generation
- coin refund if generation fails after debit
- shared admin visibility in EdgeFlow's coin ledger

The result should be:

- one EdgeFlow user account
- one shared coin wallet
- one transaction ledger across EdgeFlow, OptionFlow, and Pinescript AI

---

## 2. EdgeFlow Base URL

Use environment variables, not hard-coded URLs.

Local EdgeFlow:

```env
EDGEFLOW_AUTH_BASE_URL=http://localhost:5000
VITE_EDGEFLOW_AUTH_BASE_URL=http://localhost:5000
```

Live EdgeFlow:

```env
EDGEFLOW_AUTH_BASE_URL=http://164.52.192.245:4000
VITE_EDGEFLOW_AUTH_BASE_URL=http://164.52.192.245:4000
```

Use the backend env var for server-to-server calls. Use the `VITE_` env var only in browser code.

---

## 3. Platform Credentials

Pinescript AI backend needs:

```env
EDGEFLOW_AUTH_BASE_URL=http://localhost:5000
PLATFORM_PUBLIC_KEY=<provided separately>
PLATFORM_SECRET=<provided separately>
```

These belong only on the Pinescript AI backend/server. Never expose `PLATFORM_SECRET` to frontend code.

On this machine, the credential handoff file is:

```text
C:\Users\admin\Desktop\acequant\EdgeFlow\.handoff-secrets\pinescript-ai-platform-key.json
```

This file is intentionally gitignored and should be copied only into Pinescript AI's backend secret/env setup.

EdgeFlow already has a seeded platform row:

```text
slug: pinescript-ai
name: Pinescript AI
```

If a key needs to be created from EdgeFlow:

```bash
npm run platform:key -- pinescript-ai local-dev
```

Copy the output once and store it in Pinescript AI's backend env/secrets.

---

## 4. Auth Options

There are two supported auth flows. Pick the one that best fits the current Pinescript AI app.

### Option A: Redirect Login

Frontend redirects the user to EdgeFlow:

```text
GET <EDGEFLOW_AUTH_BASE_URL>/login?platform=pinescript-ai&returnUrl=<urlencoded PinescriptAI callback URL>
```

After login/signup, EdgeFlow redirects back:

```text
<returnUrl>?token=<JWT>&refreshToken=<REFRESH_TOKEN>
```

Pinescript AI stores the returned token according to its existing auth pattern and sends it as:

```http
Authorization: Bearer <JWT>
```

Use this if Pinescript AI should show a "Sign in with EdgeFlow" button and let EdgeFlow own the login UI.

### Option B: Backend Login Proxy

Frontend sends identifier/password to the Pinescript AI backend.

Pinescript AI backend signs and forwards:

```text
POST <EDGEFLOW_AUTH_BASE_URL>/auth/v3/login
```

Body:

```json
{
  "identifier": "user@example.com",
  "password": "password"
}
```

This endpoint requires platform headers:

- `X-Platform-Key`
- `X-Platform-Timestamp`
- `X-Platform-Signature`
- `Content-Type: application/json`

Use this if Pinescript AI wants to keep its own login form but authenticate against EdgeFlow.

---

## 5. Session Validation

Pinescript AI should validate sessions by calling EdgeFlow:

```text
GET <EDGEFLOW_AUTH_BASE_URL>/auth/v3/me
```

Headers:

```http
Authorization: Bearer <JWT>
```

Success response:

```json
{
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "username": "test",
      "name": "Test User",
      "tier": "free",
      "role": "user",
      "emailVerified": true
    },
    "coins": {
      "balance": 100,
      "lifetime_earned": 100,
      "lifetime_spent": 0
    },
    "platform": {
      "id": "uuid",
      "slug": "pinescript-ai",
      "name": "Pinescript AI"
    }
  }
}
```

If this returns `401`, treat the user as logged out.

Recommended backend pattern:

- frontend sends JWT to Pinescript AI backend
- backend calls EdgeFlow `/auth/v3/me`
- backend trusts the returned `user.id`, `tier`, `role`, and `coins.balance`
- cache the `/me` result briefly, around 30 seconds, to avoid calling EdgeFlow on every request

Do not share or copy EdgeFlow's `JWT_SECRET` into Pinescript AI. Validate through the API.

---

## 6. Server-to-Server Signing

Signed requests use this deterministic hash scheme:

```text
secretHash = sha256(PLATFORM_SECRET)
timestamp  = current unix timestamp in seconds
rawBody    = JSON string sent as the request body
signature  = sha256(secretHash + "." + timestamp + "." + rawBody)
```

Headers:

```http
Content-Type: application/json
X-Platform-Key: <PLATFORM_PUBLIC_KEY>
X-Platform-Timestamp: <timestamp>
X-Platform-Signature: <signature>
```

Important: sign the exact JSON string you send. Do not sign one JSON string and let the HTTP client serialize a different one.

Python helper:

```python
import hashlib
import json
import os
import time
import httpx

EDGEFLOW_AUTH_BASE_URL = os.environ["EDGEFLOW_AUTH_BASE_URL"]
PLATFORM_PUBLIC_KEY = os.environ["PLATFORM_PUBLIC_KEY"]
PLATFORM_SECRET = os.environ["PLATFORM_SECRET"]
SECRET_HASH = hashlib.sha256(PLATFORM_SECRET.encode()).hexdigest()


def sign_body(payload: dict) -> tuple[str, dict[str, str]]:
    raw_body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    timestamp = str(int(time.time()))
    signature = hashlib.sha256(
        f"{SECRET_HASH}.{timestamp}.{raw_body}".encode()
    ).hexdigest()
    headers = {
        "Content-Type": "application/json",
        "X-Platform-Key": PLATFORM_PUBLIC_KEY,
        "X-Platform-Timestamp": timestamp,
        "X-Platform-Signature": signature,
    }
    return raw_body, headers


async def signed_post(path: str, payload: dict) -> httpx.Response:
    raw_body, headers = sign_body(payload)
    async with httpx.AsyncClient(timeout=20.0) as client:
        return await client.post(
            f"{EDGEFLOW_AUTH_BASE_URL}{path}",
            content=raw_body,
            headers=headers,
        )
```

Node helper:

```ts
import crypto from "node:crypto";

const EDGEFLOW_AUTH_BASE_URL = process.env.EDGEFLOW_AUTH_BASE_URL!;
const PLATFORM_PUBLIC_KEY = process.env.PLATFORM_PUBLIC_KEY!;
const PLATFORM_SECRET = process.env.PLATFORM_SECRET!;
const SECRET_HASH = crypto.createHash("sha256").update(PLATFORM_SECRET).digest("hex");

function signBody(payload: unknown) {
  const rawBody = JSON.stringify(payload ?? {});
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHash("sha256")
    .update(`${SECRET_HASH}.${timestamp}.${rawBody}`)
    .digest("hex");

  return {
    rawBody,
    headers: {
      "Content-Type": "application/json",
      "X-Platform-Key": PLATFORM_PUBLIC_KEY,
      "X-Platform-Timestamp": timestamp,
      "X-Platform-Signature": signature,
    },
  };
}
```

---

## 7. Coin Debit For Pine Script Generation

Debit before starting an expensive generation.

Endpoint:

```text
POST <EDGEFLOW_AUTH_BASE_URL>/api/coins/debit
```

Body:

```json
{
  "user_id": "uuid-from-auth-v3-me",
  "feature_key": "pinescript.generate",
  "idempotency_key": "pinescript-ai:generate:<generation_id>",
  "reference_id": "generation_id",
  "metadata": {
    "prompt_length": 420,
    "model": "optional-model-name"
  }
}
```

Success:

```json
{
  "data": {
    "transaction": {
      "id": "uuid",
      "amount": -5,
      "balance_after": 95
    },
    "balance_after": 95,
    "was_replay": false
  }
}
```

Replay success:

```json
{
  "data": {
    "transaction": {
      "id": "same-transaction-id",
      "amount": -5,
      "balance_after": 95
    },
    "balance_after": 95,
    "was_replay": true
  }
}
```

Insufficient coins:

```json
{
  "code": "INSUFFICIENT_COINS",
  "message": "Insufficient coins to perform this action",
  "transaction": null
}
```

Current seeded price:

```text
pinescript.generate = 5 coins
```

EdgeFlow admin can change this price at:

```text
/admin/coins/feature-costs
```

---

## 8. Idempotency Rules

Every generation attempt should have a stable generation ID.

Recommended:

```text
idempotency_key = pinescript-ai:generate:<generation_id>
```

Use the same `idempotency_key` when retrying the same generation after a network timeout. EdgeFlow will return `was_replay=true` and will not charge twice.

Use a new `generation_id` when the user intentionally starts a new generation.

Do not use timestamps alone as idempotency keys.

---

## 9. Refund Rule

If Pine Script generation fails after a successful fresh debit, refund the debit.

Endpoint:

```text
POST <EDGEFLOW_AUTH_BASE_URL>/api/coins/refund
```

Body:

```json
{
  "transaction_id": "debit-transaction-id"
}
```

Refund only when:

- debit succeeded
- `was_replay === false`
- generation failed before returning useful output to the user

Do not refund when:

- `was_replay === true`
- user cancels voluntarily after generation started
- generation returns usable code but the user dislikes it

Refund calls are idempotent on EdgeFlow's side.

---

## 10. Suggested Backend Flow

For a `POST /api/generate` endpoint in Pinescript AI:

1. Read bearer token from request.
2. Call EdgeFlow `GET /auth/v3/me`.
3. Get `user.id` and coin balance.
4. Create `generation_id`.
5. Signed call to `POST /api/coins/debit` with:
   - `feature_key = "pinescript.generate"`
   - `idempotency_key = "pinescript-ai:generate:<generation_id>"`
6. If EdgeFlow returns `402`, return a clean insufficient-coins response to frontend.
7. Run Pine Script generation.
8. If generation succeeds, return generated code.
9. If generation fails and the debit was fresh, call refund.

Pseudocode:

```python
async def generate_pinescript(request):
    user = await edgeflow_me(request.bearer_token)
    generation_id = new_uuid()

    debit_result = await debit(
        user_id=user.id,
        feature_key="pinescript.generate",
        idempotency_key=f"pinescript-ai:generate:{generation_id}",
        reference_id=generation_id,
        metadata={"source": "pinescript-ai"},
    )

    try:
        code = await run_generation(...)
        return {"generation_id": generation_id, "code": code}
    except Exception:
        if not debit_result.was_replay:
            await refund(debit_result.transaction_id)
        raise
```

---

## 11. Frontend Requirements

Frontend should:

- show "Sign in with EdgeFlow" or use existing login UI backed by EdgeFlow
- store EdgeFlow JWT safely according to current app pattern
- attach `Authorization: Bearer <JWT>` to Pinescript AI backend calls
- show current coin balance from `/auth/v3/me`
- refresh balance after generation
- handle `402` with a clear "Buy coins" CTA

Top-up link:

```text
<EDGEFLOW_AUTH_BASE_URL>/profile?tab=coins
```

Do not recreate the coin purchase flow inside Pinescript AI. EdgeFlow owns Cashfree/payment handling.

---

## 12. EdgeFlow Configuration Checklist

Before testing redirect auth, EdgeFlow must trust the Pinescript AI return origin.

Add PineAI local/live origins to:

```env
VITE_TRUSTED_RETURN_ORIGINS=<pine-local-origin>,<pine-live-origin>
CORS_ORIGINS=<existing-origins>,<pine-local-origin>,<pine-live-origin>
```

Examples:

```env
VITE_TRUSTED_RETURN_ORIGINS=http://localhost:3002,http://164.52.192.245:<pine-port>
CORS_ORIGINS=http://localhost:5000,http://localhost:3002,http://164.52.192.245:<pine-port>
```

Replace `<pine-port>` with the actual live Pinescript AI port.

---

## 13. Verification Checklist

### Auth

1. Start EdgeFlow locally.
2. Start Pinescript AI locally.
3. Sign in from Pinescript AI.
4. Confirm EdgeFlow returns a JWT.
5. Call `/auth/v3/me` with that JWT.
6. Confirm response includes:
   - same EdgeFlow user ID/email
   - current coin balance
   - `platform.slug = "pinescript-ai"`

### Coin Debit

1. Give test user enough coins in EdgeFlow admin.
2. Generate Pine Script once.
3. Confirm generation succeeds.
4. Confirm balance decreases by cost of `pinescript.generate`.
5. Confirm EdgeFlow admin coin ledger shows:
   - transaction type `debit`
   - feature key `pinescript.generate`
   - platform `Pinescript AI`

### Idempotency

1. Retry the same generation request using the same `generation_id`.
2. Confirm EdgeFlow returns `was_replay=true`.
3. Confirm no second debit row appears.

### Insufficient Coins

1. Set test user balance below the generation cost.
2. Try generating.
3. Confirm Pinescript AI shows an insufficient-coins message.
4. Confirm no generation starts.

### Refund

1. Force the generation engine to fail after debit.
2. Confirm Pinescript AI calls `/api/coins/refund`.
3. Confirm ledger shows:
   - debit row
   - refund row
4. Confirm balance returns to previous value.

### Logout

1. Logout in Pinescript AI.
2. Clear local JWT/session state.
3. Call `/auth/v3/me` with old token after logout.
4. Confirm it is rejected.

---

## 14. Things Pinescript AI Should Not Do

- Do not connect directly to EdgeFlow DB.
- Do not copy EdgeFlow DB credentials.
- Do not copy `JWT_SECRET`.
- Do not store platform secret in frontend env.
- Do not implement a separate coin wallet.
- Do not debit coins from the frontend.
- Do not run destructive database scripts.
- Do not invent a second user table as source of truth.

---

## 15. Expected Done State

Pinescript AI integration is done when:

1. Users can sign in using EdgeFlow identity.
2. Pinescript AI can call EdgeFlow `/auth/v3/me`.
3. Pine generation debits `pinescript.generate`.
4. Failed generation refunds fresh debit.
5. EdgeFlow admin ledger shows PineAI transactions under the `pinescript-ai` platform.
6. User coin balance stays consistent across EdgeFlow, OptionFlow, and Pinescript AI.
