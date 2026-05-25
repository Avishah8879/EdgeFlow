# IIS production failures — diagnostic plan (503 + 500)

## Context

Production (`http://164.52.192.245:4000`, Windows Server / IIS) is returning:
- **503 Service Unavailable** on every `/api/options-visualizer/*` endpoint (`exposure`, `timeseries`, `surface` for NIFTY and BANKNIFTY).
- **500 Internal Server Error** on `/api/privacy/consent`.

Local development is fine because all four backing services (Node, Python, Redis, Celery) run on one box and start cleanly. On IIS, one or more of them is missing or misconfigured. This document diagnoses the cause and prescribes the smallest fix per cause — no application-code changes are warranted; this is an operational/deployment problem.

The IIS architecture (per [docs/IIS-WINDOWS-DEPLOYMENT.md](docs/IIS-WINDOWS-DEPLOYMENT.md)):

```
Browser → IIS:4000 → Node:5000 ──proxy──> Python:8100
                                          ├── Redis:6379 (cache + Celery broker)
                                          └── Celery worker (refresh_options_visualizer)
                                              ↑
External Postgres (13.205.4.69:5432) ←── Node + Python
```

The user reports the IIS bound port is `4000`, while [.env.production:11](.env.production#L11) sets `PORT=5000` for Node. So IIS:4000 reverse-proxies into Node:5000, and Node proxies `/api/*` it doesn't itself handle to Python at `PYTHON_API_URL` ([routes.ts:17–51](server/routes.ts#L17)).

---

## Why the 503 happens (specific code path)

[main.py:8430–8460](main.py#L8430) imports `option_chain_live` and `option_chain_visualizer` at module load. **Both imports are wrapped in `try/except ImportError` that silently sets the symbols to `None`.** Then each handler short-circuits:

```python
# main.py:8912-8913
if _ft_get_cached_exposure_data is None or _ft_fetch_nse_index_option_chain is None:
    return _ft_api_error("option_chain_visualizer module unavailable", 503)
```

So a 503 means **the Python process started but one of those module imports raised**. The most plausible triggers, in order:

1. **scipy not installed in the IIS Python venv.** [option_chain_visualizer.py:21](option_chain_visualizer.py#L21) does `from scipy.stats import norm` at the top of the file. If `uv sync` / `pip install` was incomplete on the IIS box, scipy is missing and the whole module fails to import.
2. **Redis is not running on the IIS box.** [option_chain_visualizer.py:23](option_chain_visualizer.py#L23) does `from redis_cache import get_redis, cache_get, cache_set`. If `redis_cache.py` opens a Redis connection at import time (Memurai service stopped, or never installed), the module-level import explodes. **Confirm by curling another Redis-dependent endpoint** — if `/api/market-mood` or `/api/expert-screener/templates` also fails, Redis is the problem.
3. **`PYTHON_API_URL` mismatch.** Node at port 5000 proxies to whatever `PYTHON_API_URL` points at; default is `http://localhost:8100`. If the Python service is running on `7860` (dev port), or not at all, every proxied call hits a closed socket. Node's proxy converts ECONNREFUSED into a 502 or 500 (not 503), so this is a fallback hypothesis: 503 from a *Node side* timeout when the proxy's upstream Python is dead.

The 503 message body (`"option_chain_visualizer module unavailable"` vs. anything else) is the discriminator: hypothesis 1 and 2 produce that exact string; hypothesis 3 produces a Node proxy error. **The first diagnostic step is to read the response body, not just the status code.**

## Why the 500 happens (specific code path)

[server/routes-privacy.ts:31–38](server/routes-privacy.ts#L31) — the GET handler is bare: it returns `{ consentLevel: 'none', isAnonymous: true }` with no DB call. **So the 500 cannot come from the handler itself; it must come from middleware in the stack.** Likely sources:

1. **`optionalAuth` middleware crash.** It tries to verify a JWT cookie; if `JWT_SECRET` is missing in the IIS env, every request through it throws and Express returns 500.
2. **Auth DB pool init fail.** [server/db/auth-connection.ts:11–13](server/db/auth-connection.ts#L11) hard-throws at module load if `AUTH_DB_HOST` or `AUTH_DB_PASSWORD` is unset — but that would crash the Node process at boot, not return 500 on a single route. So if Node is running at all, those env vars are set. The pool can still fail at connect-time (10s connection timeout in the config) — but again, the GET privacy/consent handler doesn't touch the pool.
3. **An earlier middleware** (rate-limit, request-id, CORS, body parser) throwing on a malformed cookie or header from the browser. Less likely but possible.

The browser-side noise in the user's console — `Cross-Origin-Opener-Policy header has been ignored`, `lockdown-install.js: SES Removing unpermitted intrinsics`, `MetaMask: Connected to chain`, `tabs:outgoing.message.ready` — are **all from browser extensions (MetaMask, Lockdown/SES) and unrelated to this site**. Ignore them. The HTTPS-COOP warning will go away once a TLS cert is on the site.

---

## Diagnostic playbook (run on the IIS box, in this order)

Each step should take under 60 seconds.

### 1. Confirm what's actually running

```powershell
# Are the four required services up?
Get-Service Memurai, "EdgeFlow-Node", "EdgeFlow-Python", "EdgeFlow-Celery" 2>&1
# Or, if NSSM names differ:
nssm status <service-name>
# Listening ports — expect 6379 (Redis), 5000 (Node), 8100 (Python)
netstat -ano | findstr "LISTENING" | findstr ":6379 :5000 :8100 :4000"
```

### 2. Read the actual 503 body (not just the status)

From the IIS box itself (bypasses IIS):

```powershell
Invoke-WebRequest -Uri "http://localhost:8100/api/options-visualizer/exposure/NIFTY" -UseBasicParsing | Select-Object StatusCode, Content
```

- If body is `{"error": "option_chain_visualizer module unavailable"}` → **hypothesis 1 or 2** (Python import broke). Continue to step 3.
- If `Invoke-WebRequest` itself fails with "connection refused" → **Python service isn't running**. Start it via NSSM and recheck.
- If body is `{"error": "Unable to get spot price"}` → Python is fine, NSE upstream call failed (network egress blocked or NSE rate-limit). Different fix.

### 3. Replay the import in the Python venv

```powershell
cd "C:\path\to\EdgeFlow"
.venv\Scripts\activate
python -c "import option_chain_visualizer; print('ok')"
```

The traceback names the missing dep. Most likely:
- `ModuleNotFoundError: No module named 'scipy'` → run `uv sync` (or `pip install -r requirements.txt` / `pip install scipy`).
- `redis.exceptions.ConnectionError` → start Memurai: `Start-Service Memurai`.

### 4. Confirm Node is reachable for the 500

```powershell
Invoke-WebRequest -Uri "http://localhost:5000/api/privacy/consent" -UseBasicParsing | Select-Object StatusCode, Content
```

- If 200 with the consent JSON → IIS-to-Node proxy is wrong; check the IIS site's URL Rewrite rules.
- If 500 here too → Node-side issue. Tail Node's stdout/stderr (NSSM `AppStdout` / `AppStderr` log files): `Get-Content C:\path\to\node-stderr.log -Tail 50`. The traceback will name the failing middleware.
- If connection refused → Node service is down; restart it.

### 5. Verify env vars are present in the Node + Python service environments

NSSM-registered services do **not** inherit the user's shell `.env`. Check the service environment block:

```powershell
nssm get EdgeFlow-Node AppEnvironmentExtra
nssm get EdgeFlow-Python AppEnvironmentExtra
```

Required minimum on each:
- Node: `PORT=5000`, `NODE_ENV=production`, `PYTHON_API_URL=http://localhost:8100`, `JWT_SECRET=...`, `AUTH_DB_HOST=...`, `AUTH_DB_PASSWORD=...`, `REDIS_URL=redis://localhost:6379`.
- Python: `PYTHON_PORT=8100`, `DB_HOST=...`, `DB_PASSWORD=...`, `REDIS_URL=redis://localhost:6379`, `CELERY_BROKER_URL=redis://localhost:6379/1`.

If any are blank, set them and `nssm restart` the service.

### 6. (Only if the above pass) Check Celery and IIS rewrite rules

```powershell
# Celery worker logs — if cache prewarming never ran, cold cache hits NSE on every request
Get-Content C:\path\to\celery-stderr.log -Tail 30

# IIS rewrite — confirm /api/* gets forwarded to Node, not 404'd
Get-Content "C:\inetpub\wwwroot\<site>\web.config" | Select-String "/api/"
```

The IIS deployment doc has a sample `web.config` at [docs/IIS-WINDOWS-DEPLOYMENT.md:268–352](docs/IIS-WINDOWS-DEPLOYMENT.md#L268). If there isn't one in the deployed site at all, IIS is serving raw static files and `/api/*` is reaching the SPA's `index.html` (which then 404s — but the user is reporting 503/500, not 404, so this is unlikely).

---

## Likely fix matrix

| If the diagnostic shows… | Then the fix is… |
|--------------------------|------------------|
| `ModuleNotFoundError: No module named 'scipy'` | `uv sync` (or `pip install scipy pandas numpy`) in the project's Python venv on the IIS box, then `nssm restart EdgeFlow-Python`. |
| Redis connection refused at import | Install/start Memurai (`Start-Service Memurai`); `nssm restart EdgeFlow-Python`. |
| `Invoke-WebRequest http://localhost:8100` connection refused | Python service not running — `nssm start EdgeFlow-Python` and check stdout for startup errors (most likely env var missing or DB unreachable). |
| `PYTHON_API_URL` blank or wrong in NSSM env | `nssm set EdgeFlow-Node AppEnvironmentExtra PYTHON_API_URL=http://localhost:8100` plus the others; restart Node. |
| Privacy 500 with stack trace mentioning JWT | Set `JWT_SECRET` on the Node service; restart. |
| Privacy 500 with stack trace mentioning `AUTH_DB` | Set `AUTH_DB_HOST` / `AUTH_DB_PASSWORD`; if firewall blocks 13.205.4.69:5432 from this Indian server IP, whitelist it on the Postgres host. |
| `web.config` missing or no `/api/*` rule | Copy the template from the IIS deployment doc and `iisreset`. |

---

## Verification (after applying fixes)

From a browser at `http://164.52.192.245:4000/options-visualizer`:

1. `/api/options-visualizer/exposure/NIFTY` returns 200 with a JSON body containing `data.atm_gxoi`.
2. `/api/options-visualizer/surface/NIFTY?surface_type=iv` returns 200.
3. `/api/options-visualizer/timeseries/NIFTY` returns 200 with `is_market_open` set correctly.
4. `/api/privacy/consent` returns 200 with `{ consentLevel: "none", isAnonymous: true }`.
5. From the IIS box: `Invoke-WebRequest http://localhost:8100/healthz` (or `/`) returns 200 — proves Python is up.
6. From the IIS box: `redis-cli -h localhost -p 6379 ping` returns `PONG`.
7. Network tab in browser shows no 5xx on the page beyond the warnings noted above.

## Out of scope

- **Browser-extension noise** (SES, MetaMask, `tabs:outgoing.message.ready`) — not a site bug.
- **HTTPS / Cross-Origin-Opener-Policy warning** — fixed by putting a TLS cert on the IIS site (Let's Encrypt or otherwise). Functional but cosmetic until then.
- **Application-code changes**: none warranted from these symptoms. If hypothesis 1 or 2 is the cause, the silent `except ImportError: ... = None` pattern in [main.py:8430](main.py#L8430) is arguably bad — it hides startup failures behind 503s instead of refusing to start. That's a separate cleanup task and not blocking the deployment fix.
