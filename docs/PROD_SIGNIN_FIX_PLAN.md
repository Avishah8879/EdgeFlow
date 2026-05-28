# Prod sign-in fix — EdgeFlow → pinescript-ai trusted return origin

## 1. Problem

Prod sign-in from EdgeFlow into the pinescript-ai handoff is failing because the
EdgeFlow client bundle currently served from prod does not know that
`http://164.52.192.245:3000` is a trusted return origin. The OAuth return /
cross-platform handoff is rejected client-side. The value
`VITE_TRUSTED_RETURN_ORIGINS=…http://164.52.192.245:3000…` is already present in
`E:\sites\edgeflow\.env.production` on the prod box, but the running client JS
predates that edit.

## 2. Why the env edit alone doesn't fix it

`VITE_*` environment variables are inlined into the JS bundle by Vite at
**build time** (statically substituted via
`import.meta.env.VITE_TRUSTED_RETURN_ORIGINS`), not read by the running Node
process. Editing `.env.production` only affects subsequent `vite build`
invocations; the existing `dist/public/*.js` files served by `edgeflow-node`
still contain the old origin list. Until the client is rebuilt with the updated
env, no Node restart and no nginx reload can pick up the new value.

EdgeFlow's `vite.config.ts` confirms this: `envDir` is the project root (so
`.env.production` is the source), and `build.outDir` is `dist/public`. The
Express server (`dist/index.js`) only serves those static files — it does not
re-read VITE_* vars at runtime.

## 3. Exact fix steps on prod (Windows)

Run in order. **Stop and surface** if any step errors instead of pushing through.

1. SSH to the prod box using the config under `~/Desktop/server-ssh/`.
2. `cd /d E:\sites\edgeflow`
3. **Backup the env file** (timestamped):
   ```cmd
   copy E:\sites\edgeflow\.env.production E:\sites\edgeflow\.env.production.bak.YYYYMMDD-HHMMSS
   ```
4. **Confirm the env value is what we expect**:
   ```cmd
   findstr /B /C:"VITE_TRUSTED_RETURN_ORIGINS=" E:\sites\edgeflow\.env.production
   ```
   Expected to include `http://164.52.192.245:3000`. If missing, halt and report.
5. **Rebuild the client bundle** (Vite + esbuild for server, per `package.json` `build`):
   ```cmd
   npm run build
   ```
   This emits `dist/public/*.js` (Vite output) and `dist/index.js` (Express
   bundle). Vite reads `.env.production` from the repo root via the `envDir`
   setting in `vite.config.ts`.
6. **Restart the Node service**:
   ```cmd
   nssm restart edgeflow-node
   ```
   (Fall back to `net stop edgeflow-node && net start edgeflow-node` if nssm
   isn't the manager — confirm at execution time by `sc query edgeflow-node`.)

## 4. Verification

- **Bundle grep** — confirm the new origin is baked in:
  ```cmd
  findstr /S /C:"164.52.192.245:3000" E:\sites\edgeflow\dist\public\*.js
  ```
  Expect at least one hit. Zero hits means the rebuild didn't pick up the env
  — investigate before touching the service.
- **Bundle freshness** — for each matching `.js` file, also report:
  ```cmd
  dir E:\sites\edgeflow\dist\public\<matched-filename>
  ```
  The modified-time must be from the just-completed build. If it shows an
  older date, the file is a stale artifact (emptyOutDir should have cleared
  dist/public, but verify rather than assume).
- **Service status**:
  ```cmd
  sc query edgeflow-node
  ```
  Expect `STATE: 4 RUNNING`.
- **Service responsiveness** — RUNNING ≠ responding. From the prod box:
  ```cmd
  curl -I https://testing.equitypro.ai/
  ```
  Expect 2xx or 3xx. 5xx or connection refused means the service is
  crash-looping despite `sc query` saying RUNNING — surface and halt.
- **Browser smoke** (user does this) — open the prod EdgeFlow URL, attempt the
  pinescript-ai sign-in handoff, confirm the return redirect to
  `http://164.52.192.245:3000` is accepted (no "untrusted origin" toast/error).

## 5. Rollback

- If `npm run build` fails: leave the service running on the **existing**
  `dist/` (the old build is still on disk because `vite build` writes into
  `dist/public` with `emptyOutDir: true`, which IS atomic-ish but only deletes
  when build succeeds enough to start writing; on early failure `dist/` is
  intact). Surface the error and stop.
- If `npm run build` succeeds but `nssm restart` fails: service is in an
  unknown state. `sc query edgeflow-node` to inspect; `nssm start edgeflow-node`
  to bring it up; if it won't start, check Windows Event Viewer + `dist/index.js`
  integrity.
- If the bundle grep shows zero hits for `164.52.192.245:3000` post-build: the
  env wasn't loaded. Possible causes: stray `.env.production.local` overriding,
  `NODE_ENV` not set correctly during build, or `envDir` not resolving to the
  repo root. Verify with `dir E:\sites\edgeflow\.env*` and a one-off `findstr`
  of all env files, then rerun build with `set NODE_ENV=production` first.
- **Hard rollback** (last resort): restore the env backup from step 3 and
  re-build to revert to the prior state.
