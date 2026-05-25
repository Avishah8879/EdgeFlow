# Switch from `164.52.192.245:4000` to `testing.equitypro.ai`



**Date**: 2026-05-12
**Status**: approved, ready to execute

The app code already supports this — `app.set('trust proxy', 1)` is set in
[EdgeFlow/server/index.ts:21](EdgeFlow/server/index.ts), and the OAuth
callback in [EdgeFlow/server/routes-oauth-google.ts:35-40](EdgeFlow/server/routes-oauth-google.ts)
is built dynamically from `x-forwarded-host`. So this is purely an
infrastructure cutover. No code changes required.

---

## Step 1 — DNS at GoDaddy

In GoDaddy DNS Management for `equitypro.ai`, add an **A record**:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `testing` | `164.52.192.245` | 600 |

Verify from workstation:
```powershell
nslookup testing.equitypro.ai 8.8.8.8
```
Expect → `164.52.192.245`. Propagation usually 10-60 min.

---

## Step 2 — Open ports 80 + 443 on the server

RDP into `164.52.192.245` as Administrator:
```powershell
New-NetFirewallRule -DisplayName "HTTP-80"  -Direction Inbound -LocalPort 80  -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "HTTPS-443" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow
```
Leave port 4000 open during cutover; close it once Step 6 is green.

---

## Step 3 — Install Caddy as a reverse proxy

Caddy handles HTTPS automatically — auto-issues and auto-renews Let's Encrypt certs.

1. Download `caddy_windows_amd64.zip` from <https://caddyserver.com/download>, extract `caddy.exe` to `E:\caddy\`.

2. Create `E:\caddy\Caddyfile`:
   ```
   testing.equitypro.ai {
       encode gzip
       reverse_proxy localhost:4000
       log {
           output file E:/caddy/access.log
       }
   }
   ```

3. Install as a Windows service (NSSM is already on the box):
   ```powershell
   nssm install caddy E:\caddy\caddy.exe "run" "--config" "E:\caddy\Caddyfile"
   nssm set caddy AppDirectory E:\caddy
   nssm set caddy AppStdout E:\caddy\caddy-out.log
   nssm set caddy AppStderr E:\caddy\caddy-err.log
   nssm start caddy
   ```

4. Tail `E:\caddy\caddy-out.log` and wait for `certificate obtained successfully` (~30 s after DNS is live).

---

## Step 4 — Update `.env` on the server

Edit `E:\sites\edgeflow\.env`, change/add:
```bash
CORS_ORIGINS=http://localhost:5000,http://localhost:3000,https://testing.equitypro.ai
GOOGLE_CALLBACK_URL_PROD=https://testing.equitypro.ai/auth/google/callback
```

Restart Node:
```powershell
Restart-Service edgeflow-node
```

---

## Step 5 — Google Cloud Console

Project = the one tied to `GOOGLE_CLIENT_ID=719828458566-tfume15gsseh28ssgfvqp02a2c4ousls`.

**APIs & Services → Credentials → OAuth 2.0 Client IDs → (EdgeFlow client)**:

- **Authorized JavaScript origins** — add `https://testing.equitypro.ai`
- **Authorized redirect URIs** — add `https://testing.equitypro.ai/auth/google/callback`

Keep the existing localhost entries. Save.

---

## Step 6 — Verify

```bash
curl -I https://testing.equitypro.ai/
curl -s https://testing.equitypro.ai/api/market-status
curl -s https://testing.equitypro.ai/auth/v2/check-username/getavi4
```

Then open `https://testing.equitypro.ai/` in an incognito browser, sign in with Google, and confirm the OAuth round-trip lands cleanly.

Once green, close port 4000 in the firewall — all traffic now goes through Caddy + HTTPS.
