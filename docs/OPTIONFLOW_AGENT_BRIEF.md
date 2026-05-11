# OptionsFlow Agent Brief

You are integrating OptionsFlow into the shared EdgeFlow auth universe.

EdgeFlow is the auth authority. It is running locally at:

- EdgeFlow Node/Auth: `http://localhost:5000`
- EdgeFlow Python market backend: `http://localhost:8100`

Live EdgeFlow should trust OptionsFlow at:

- OptionsFlow live origin: `http://164.52.192.245:8088`

The shared auth and market database is already configured on the EdgeFlow side
and verified against the real `equityprodata` database.

## Platform Credential

An `option-flow` platform API key has been minted in the shared DB.

The credential is stored locally on this machine at:

```text
C:\Users\admin\Desktop\acequant\EdgeFlow\.handoff-secrets\optionflow-platform-key.json
```

This file is intentionally git-ignored. Do not commit it.

Use its values in the OptionsFlow backend only:

```env
EDGEFLOW_AUTH_BASE_URL=http://localhost:5000
PLATFORM_PUBLIC_KEY=<publicKey from JSON>
PLATFORM_SECRET=<secret from JSON>
```

## Auth Endpoints

OptionsFlow backend should call:

```text
POST http://localhost:5000/auth/v3/login
GET  http://localhost:5000/auth/v3/me
POST http://localhost:5000/auth/v3/logout
```

`POST /auth/v3/login` requires signed platform headers:

- `X-Platform-Key`
- `X-Platform-Timestamp`
- `X-Platform-Signature`

The signing recipe is in:

```text
C:\Users\admin\Desktop\acequant\EdgeFlow\docs\PLATFORM_INTEGRATION.md
```

The broader plan/checklist is in:

```text
C:\Users\admin\Desktop\acequant\EdgeFlow\docs\EDGEFLOW_UNIVERSE_AUTH_PLAN.md
```

## Expected Login Flow

Recommended MVP:

1. OptionsFlow frontend sends identifier/password to its own backend.
2. OptionsFlow backend signs and forwards the login request to EdgeFlow
   `POST /auth/v3/login`.
3. EdgeFlow returns `token`, `refreshToken`, `user`, `coins`, and `platform`.
4. OptionsFlow stores the returned JWT according to its existing frontend auth
   pattern.
5. OptionsFlow uses `GET /auth/v3/me` to validate the token and fetch current
   user/coin state.
6. OptionsFlow uses `POST /auth/v3/logout` to revoke the EdgeFlow session.

## Feature Keys Already Seeded

Use these for coin-gated OptionsFlow features:

- `optionflow.backtest.run`
- `optionflow.live.simulate`
- `optionflow.analytics.run`

Coin debit/refund API details are in `docs/PLATFORM_INTEGRATION.md`.

## Verification Checklist

1. Use the JSON credential file to configure OptionsFlow backend env.
2. Sign an invalid login request first. A valid platform signature should reach
   credential validation and return `401 Invalid credentials`, not platform-key
   errors.
3. Sign a real login request for an existing EdgeFlow user.
4. Confirm the response has:
   - `platform.slug = "option-flow"`
   - same user ID/email as EdgeFlow
   - same coin balance as EdgeFlow
5. Call `/auth/v3/me` with the returned bearer token.
6. Log out via `/auth/v3/logout`.
7. Confirm the same token then returns `SESSION_REVOKED`.

Do not run destructive database scripts. The shared DB is real.
