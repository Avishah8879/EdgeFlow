# EdgeFlow Universe Auth Integration

This tracks the shared auth/database integration for the three-app EdgeFlow
universe. EdgeFlow is the auth authority; sibling apps such as OptionsFlow
authenticate through EdgeFlow Auth V3 and use the same shared auth database.

## Information Needed From OptionsFlow

Ask the OptionsFlow agent for:

1. Repo path and branch name they want to use for the integration.
2. Local dev URLs for frontend and backend, including ports.
3. Production/staging origins, if known.
4. Current auth implementation: JWT library, token storage location, `/me`
   endpoint shape, logout handling, route guards, and refresh-token behavior.
5. Whether OptionsFlow has a Node backend, Python backend, or both, and which
   backend should call EdgeFlow `/auth/v3/*`.
6. Where server-side secrets live in OptionsFlow (`.env`, secret manager,
   Docker, PM2, etc.).
7. Expected login UX:
   - direct OptionsFlow login form that calls EdgeFlow Auth V3 from its backend,
   - redirect to EdgeFlow `/login?platform=option-flow&returnUrl=...`,
   - or both.
8. Feature keys OptionsFlow needs for coin-gated actions.
9. Existing DB env variable names in OptionsFlow, especially whether it already
   has `DB_*`, `AUTH_DB_*`, `DATABASE_URL`, `JWT_SECRET`, and Redis variables.
10. Any existing migrations touching `users`, `sessions`, `platforms`,
    `coin_*`, `payment_*`, or API key tables.

Do not ask them to paste secrets into chat. They should report variable names
and whether values are present; actual secrets should go into env files or the
secret manager only.

## EdgeFlow-Side Contract

Auth authority:

- `POST /auth/v3/login`
- `GET /auth/v3/me`
- `POST /auth/v3/logout`

Server-to-server platform-authenticated routes require:

- `X-Platform-Key`
- `X-Platform-Timestamp`
- `X-Platform-Signature`

The signature recipe is documented in `docs/PLATFORM_INTEGRATION.md`.

For `option-flow`, mint a key from EdgeFlow after the shared DB is configured:

```bash
npm run platform:key -- option-flow local-dev
```

Store the returned public key and secret only in OptionsFlow's server-side
environment.

## EdgeFlow Environment Alignment

EdgeFlow and OptionsFlow should point at the same universe database for auth:

- `AUTH_DB_HOST`
- `AUTH_DB_PORT`
- `AUTH_DB_NAME`
- `AUTH_DB_USER`
- `AUTH_DB_PASSWORD`

If the app directly reads market data, also align:

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DATABASE_URL`

Both apps must use the same JWT settings:

- `JWT_SECRET`
- `JWT_ACCESS_EXPIRY`
- `JWT_REFRESH_EXPIRY`

EdgeFlow must trust the OptionsFlow return origin:

- `CORS_ORIGINS`
- `VITE_TRUSTED_RETURN_ORIGINS`

## Verification Checklist

1. EdgeFlow starts against the shared DB and self-heal reports no destructive
   operations.
   Read-only DB verification:
   ```bash
   npm run db:verify-shared
   ```
2. Shared DB contains active `platforms.slug = 'option-flow'`.
3. An `option-flow` platform key exists and can sign a request.
4. `POST /auth/v3/login` returns a JWT whose payload includes the `option-flow`
   platform ID.
5. `GET /auth/v3/me` returns the same user and coin balance from EdgeFlow and
   OptionsFlow.
6. `POST /auth/v3/logout` revokes the session for both apps.
7. Coin debit/refund calls write ledger rows with the `option-flow` platform ID.
8. EdgeFlow login handoff redirects only to trusted OptionsFlow origins.
