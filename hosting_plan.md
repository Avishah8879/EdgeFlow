# Hosting Plan: Tier-B Two-Box on E2E Networks (16/32 DB + 20/64 App)

## Context

Deployment plan for **EdgeFlow + Pinescript AI + Option Flow** + their PostgreSQL/TimescaleDB across **two E2E Networks Linux nodes** in a single AZ:

- **DB box**: 16 vCPU / 32 GB RAM / 1 TB SSD — dedicated PostgreSQL 14 + TimescaleDB, fronted by PgBouncer. Private network only, no public IP.
- **App box**: 20 vCPU / 64 GB RAM / 200 GB SSD — all six application processes (Node + Python + Pinescript Next.js + OptionFlow FastAPI + 2 Celery worker pools) + local Redis + Nginx + monitoring. Public IPv4, fronted by Cloudflare.

Sized to support **500 peak simultaneous active sessions** with headroom (real ceiling ~600–700 before the next vertical bump). Single-AZ — HA is intentionally dropped for cost. Backups are non-negotiable; covered below.

The existing PG + TimescaleDB at `13.205.4.69` (~30 GB live data) is migrated to the new DB box via `pg_dump` + restore (~30–60 min downtime); the old host is kept around for ~30 days as a fallback before being decommissioned.

---

## Topology

```
                Cloudflare (DNS + free TLS + CDN + DDoS + WAF)
                              │
                              ▼  origin pull HTTPS
                  ┌────────── App box (PUBLIC IPv4) ─────────┐
                  │   20 vCPU / 64 GB RAM / 200 GB SSD       │
                  │                                          │
                  │  Nginx (443/80) — host-based routing     │
                  │   ├─ edgeflow.<domain>     → :3000       │
                  │   ├─ pinescript.<domain>   → :3001       │
                  │   └─ optionflow.<domain>   → :8000       │
                  │                                          │
                  │  Node Express :3000  │  Python FastAPI :8100 │
                  │  Pinescript Next.js :3001               │
                  │  OptionFlow FastAPI :8000               │
                  │                                          │
                  │  Local Redis :6379 (broker + cache)      │
                  │   ├─ EdgeFlow Celery (FinBERT + GA)      │
                  │   └─ OptionFlow Celery (backtest engine) │
                  │                                          │
                  │  Prometheus + Grafana + node_exporter    │
                  └────────────────────┬─────────────────────┘
                                       │ E2E private network
                                       │ (< 1 ms RTT)
                                       ▼
                  ┌──── DB box (PRIVATE NETWORK ONLY) ───────┐
                  │   16 vCPU / 32 GB RAM / 1 TB SSD         │
                  │                                          │
                  │  PgBouncer :6432 (transaction pooling)   │
                  │       │                                  │
                  │       ▼                                  │
                  │  PostgreSQL 14 + TimescaleDB :5432       │
                  │  (Tiphub, Tiphub_auth)                   │
                  │  postgres_exporter :9187                 │
                  │       │                                  │
                  │       ▼                                  │
                  │  pgbackrest (WAL → R2)                   │
                  │  Cron pg_dump → R2 (nightly)             │
                  │  E2E box snapshot (nightly)              │
                  └──────────────────────────────────────────┘
```

---

## DB box — config and capacity

### Why this size for 500 concurrent

- 8 GB `shared_buffers` (Postgres rule of thumb 25% of RAM) + ~20 GB OS file cache = **~28 GB hot capacity** vs ~30–50 GB working set after TimescaleDB compression. Hot tables stay in cache; cold scans drop only marginally to disk.
- 16 vCPU handles ~80–120 active concurrent queries comfortably; PgBouncer holds the rest idle.
- 1 TB SSD covers current 30 GB + indexes (~50% overhead) + WAL + 12 months growth + local pgbackrest cache.

### Software stack (Ubuntu 22.04 LTS)

```bash
sudo apt update && sudo apt install -y \
  postgresql-14 postgresql-contrib-14 \
  pgbouncer pgbackrest \
  prometheus-postgres-exporter
# TimescaleDB (community)
sudo apt install -y timescaledb-2-postgresql-14
sudo timescaledb-tune --quiet --yes --memory 32GB --cpus 16
sudo systemctl restart postgresql
```

### `/etc/postgresql/14/main/postgresql.conf` (Tier B values)

```
shared_buffers              = 8GB
effective_cache_size        = 24GB
work_mem                    = 64MB
maintenance_work_mem        = 2GB
max_connections             = 200          # PgBouncer in front holds 500+ idle
random_page_cost            = 1.1          # SSD
effective_io_concurrency    = 200          # SSD
checkpoint_completion_target = 0.9
wal_buffers                 = 64MB
default_statistics_target   = 200
max_worker_processes        = 16
max_parallel_workers_per_gather = 4
max_parallel_workers        = 16
shared_preload_libraries    = 'timescaledb,pg_stat_statements'

# Archiving for pgbackrest
archive_mode    = on
archive_command = 'pgbackrest --stanza=main archive-push %p'
wal_level       = replica
max_wal_senders = 3
```

### `/etc/postgresql/14/main/pg_hba.conf` — restrict to app box

```
# IPv4 — only the app box's private IP
host    Tiphub        edgeflow_app     <APP_PRIVATE_CIDR>     scram-sha-256
host    Tiphub_auth   edgeflow_app     <APP_PRIVATE_CIDR>     scram-sha-256

# Local replication for pgbackrest
local   replication   pgbackrest                              peer
host    replication   pgbackrest       127.0.0.1/32           scram-sha-256
```

(Replace `<APP_PRIVATE_CIDR>` with E2E's private subnet for your project, e.g. `10.0.0.0/24` or the app box's private IP `/32`.)

### TimescaleDB compression (the biggest single performance win)

After data is migrated:
```sql
ALTER TABLE fno_ohlcv          SET (timescaledb.compress, timescaledb.compress_orderby = 'ts DESC');
ALTER TABLE ohlc_1min_intraday SET (timescaledb.compress, timescaledb.compress_orderby = 'ts DESC');
ALTER TABLE ohlc_1hour         SET (timescaledb.compress, timescaledb.compress_orderby = 'ts DESC');

SELECT add_compression_policy('fno_ohlcv',          INTERVAL '7 days');
SELECT add_compression_policy('ohlc_1min_intraday', INTERVAL '7 days');
SELECT add_compression_policy('ohlc_1hour',         INTERVAL '7 days');
```
Typical 8–12× compression on time-series. This is what makes the 32 GB DB box comfortably hold a much larger logical dataset.

### PgBouncer (`/etc/pgbouncer/pgbouncer.ini`)

```ini
[databases]
Tiphub      = host=127.0.0.1 port=5432 dbname=Tiphub
Tiphub_auth = host=127.0.0.1 port=5432 dbname=Tiphub_auth

[pgbouncer]
listen_addr        = 0.0.0.0          ; private network only — DB box has no public IP
listen_port        = 6432
auth_type          = scram-sha-256
auth_file          = /etc/pgbouncer/userlist.txt
pool_mode          = transaction
max_client_conn    = 500
default_pool_size  = 50
reserve_pool_size  = 10
server_idle_timeout = 600
```

App box connects to `<dbbox-private-ip>:6432`, never directly to Postgres on `:5432`.

---

## App box — config and capacity

### Software stack

```bash
sudo apt update && sudo apt install -y \
  nginx redis-server \
  nodejs npm \
  python3.11 python3.11-venv python3-pip \
  prometheus prometheus-node-exporter
# Grafana via official repo (optional but recommended)
```

### Resource budget (committed at 500 concurrent)

| Service | RAM | vCPU peak | Notes |
|--|--|--|--|
| OS + system | 1 GB | <1 | |
| Nginx | 200 MB | <1 | Reverse proxy + TLS termination via Cloudflare origin cert |
| Local Redis | 512 MB | <1 | DB 0 cache, DB 1 EdgeFlow Celery, DB 2 OptionFlow Celery |
| EdgeFlow Node Express :3000 | 1 GB | 1–2 | Auth, admin, payments, coin wallet |
| EdgeFlow Python FastAPI :8100 | 1.5 GB | 2–4 | Stock/index/screener APIs |
| EdgeFlow Celery — sentiment | 3.5 GB | 1–2 | FinBERT loaded once |
| EdgeFlow Celery — backtest GA | 2 GB | 4–6 | 4-process pool |
| Pinescript Next.js :3001 | 600 MB | 1 | LLM proxy, mostly IO-wait |
| OptionFlow FastAPI :8000 | 1 GB | 1–2 | |
| OptionFlow Celery | 2.5 GB | 3–5 | Backtest engine |
| Prometheus + Grafana | 700 MB | <1 | |
| **Total committed** | **~14 GB** | **~14–20 vCPU peak** | Free for OS cache + spikes: ~50 GB |

CPU oversubscription (14–20 vCPU demand on 20 cores) is comfortable. Most processes are IO-bound.

### systemd units (one per service) with hard resource limits

`/etc/systemd/system/<service>.service`:

```ini
# edgeflow-celery.service (representative — repeat pattern for each service)
[Unit]
Description=EdgeFlow Celery worker
After=network.target redis-server.service

[Service]
User=deploy
WorkingDirectory=/srv/edgeflow
Environment=PYTHONUNBUFFERED=1
EnvironmentFile=/srv/edgeflow/.env
ExecStart=/srv/edgeflow/.venv/bin/celery -A celery_app worker --pool=solo --concurrency=4 --loglevel=info
MemoryMax=8G
CPUQuota=600%
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Resource caps per service prevent any one runaway worker (e.g. a stuck FinBERT inference) from OOM-killing the entire box and taking all three platforms down.

| Unit | MemoryMax | CPUQuota |
|--|--|--|
| `edgeflow-node` | 2G | 200% |
| `edgeflow-python` | 3G | 400% |
| `edgeflow-celery` | 8G | 600% |
| `pinescript` | 2G | 200% |
| `optionflow-api` | 2G | 200% |
| `optionflow-celery` | 6G | 500% |
| Redis, Nginx, Prometheus | OS defaults | — |

### Nginx host-based routing (`/etc/nginx/sites-enabled/edgeflow`)

```nginx
server {
  listen 443 ssl http2;
  server_name edgeflow.<domain>;
  ssl_certificate     /etc/ssl/cloudflare/origin.crt;
  ssl_certificate_key /etc/ssl/cloudflare/origin.key;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    # SSE endpoints — disable buffering, raise timeout
    proxy_buffering off;
    proxy_read_timeout 600s;
  }
}
# Repeat with server_name pinescript.<domain> → :3001
# Repeat with server_name optionflow.<domain> → :8000
```

TLS via **Cloudflare Origin Certificate** (free, 15-year validity) on origin; Cloudflare terminates HTTPS to the user.

### Local Redis (`/etc/redis/redis.conf`)

```
bind 127.0.0.1
port 6379
maxmemory 1gb
maxmemory-policy allkeys-lru
appendonly no              # cache only — losing it on restart is acceptable
save ""                    # no RDB snapshots
```

Three logical DBs separated by index: `/0` cache, `/1` EdgeFlow Celery, `/2` OptionFlow Celery.

---

## Network setup between the two boxes

| Box | Public IPv4 | Inbound rules |
|--|--|--|
| **App box** | Yes | 80, 443 (Cloudflare IP ranges only); 22 (your office IP only) |
| **DB box** | **No** | Private network only: 6432 from app box's private IP; 9187 (postgres_exporter) from app box; 22 from your office IP |

**Why no public IP on the DB box**: removes an entire class of attacks. The DB is reachable only from inside E2E's private network. Private network RTT is < 1 ms, so co-locating vs splitting is performance-equivalent.

**Cloudflare → app box**:
- Cloudflare IP ranges are well-known; Nginx restricts inbound to those CIDRs only via `set_real_ip_from` directives.
- Cloudflare runs on "Full (strict)" SSL mode using the origin cert.

---

## Storage planning

### DB box — 1 TB SSD layout

| Path | Purpose | Allocation |
|--|--|--|
| `/var/lib/postgresql/14/main/` | Postgres data dir + indexes | ~150 GB |
| `/var/lib/postgresql/14/main/pg_wal/` | WAL pre-archive | 50 GB |
| `/var/lib/pgbackrest/` | Local backup cache before R2 push | 100 GB |
| `/var/log/postgresql/` | Logs (rotate weekly) | 10 GB |
| OS + monitoring exporters | | 20 GB |
| **Headroom for 12 months growth** | | ~600+ GB free |

### App box — 200 GB SSD

| Path | Purpose | Allocation |
|--|--|--|
| `/srv/edgeflow/`, `/srv/pinescript/`, `/srv/optionflow/` | App code + venvs + node_modules | 30 GB |
| `/var/log/edgeflow/` | App logs (rotate weekly) | 20 GB |
| `/var/lib/prometheus/`, `/var/lib/grafana/` | Metrics retention 30 days | 50 GB |
| OS + system | | 20 GB |
| **Headroom** | | ~80 GB |

---

## Migration: 13.205.4.69 → DB box (~30–60 min downtime)

1. **Provision both boxes** on E2E. Mumbai region. Private network attached. Public IPv4 only on app box.
2. **Bootstrap DB box**: install Postgres 14 + TimescaleDB, apply tuning above, install PgBouncer, create roles:
   ```sql
   CREATE ROLE edgeflow_app LOGIN PASSWORD '...';
   CREATE ROLE pgbackrest LOGIN REPLICATION PASSWORD '...';
   CREATE DATABASE Tiphub OWNER edgeflow_app;
   CREATE DATABASE Tiphub_auth OWNER edgeflow_app;
   \c Tiphub
   CREATE EXTENSION timescaledb;
   CREATE EXTENSION pg_stat_statements;
   ```
3. **Bootstrap app box**: install Node, Python, Redis, Nginx, deploy the three apps with `.env` still pointing at `13.205.4.69` for now. Smoke-test.
4. **Maintenance window starts** — put apps in maintenance mode (or fully offline).
5. **On the OLD host (13.205.4.69)**:
   ```bash
   pg_dump -Fc -d Tiphub      -f /tmp/Tiphub.dump
   pg_dump -Fc -d Tiphub_auth -f /tmp/Tiphub_auth.dump
   scp /tmp/*.dump deploy@<dbbox-private-ip>:/tmp/
   ```
6. **On the NEW DB box** (run as `postgres` user):
   ```bash
   pg_restore -d Tiphub      --no-owner --role=edgeflow_app /tmp/Tiphub.dump      # ~10–30 min for 30 GB
   pg_restore -d Tiphub_auth --no-owner --role=edgeflow_app /tmp/Tiphub_auth.dump
   ```
   Reapply hypertable conversions if `pg_dump` didn't preserve them:
   ```sql
   SELECT create_hypertable('ohlc_1hour',         'ts', if_not_exists => TRUE, migrate_data => TRUE);
   SELECT create_hypertable('ohlc_1min_intraday', 'ts', if_not_exists => TRUE, migrate_data => TRUE);
   SELECT create_hypertable('fno_ohlcv',          'ts', if_not_exists => TRUE, migrate_data => TRUE);
   -- then enable compression policies (see TimescaleDB section above)
   ```
7. **Update app-box `.env`**:
   ```
   DB_HOST=<dbbox-private-ip>
   DB_PORT=6432
   AUTH_DB_HOST=<dbbox-private-ip>
   AUTH_DB_PORT=6432
   ```
   Restart all systemd app services. Smoke-test.
8. **Take Cloudflare DNS off maintenance** — point `edgeflow.<domain>`, `pinescript.<domain>`, `optionflow.<domain>` at app box's public IPv4 (orange-cloud proxied).
9. **Decommission window**: keep `13.205.4.69` running with a snapshot for ~30 days as a fallback before fully shutting it down.

---

## Backups (non-negotiable now)

Three layers on the **DB box**:

### 1. WAL archiving via pgbackrest → Cloudflare R2 (RPO < 5 min)

`/etc/pgbackrest/pgbackrest.conf`:
```ini
[main]
pg1-path = /var/lib/postgresql/14/main
pg1-port = 5432
pg1-user = pgbackrest

[global]
repo1-type = s3
repo1-s3-bucket  = edgeflow-backups
repo1-s3-endpoint = <r2-endpoint>.r2.cloudflarestorage.com
repo1-s3-region  = auto
repo1-s3-key     = <r2-access-key>
repo1-s3-key-secret = <r2-secret-key>
repo1-retention-full   = 4    ; keep 4 weekly fulls
repo1-retention-diff   = 14   ; keep 14 daily diffs
process-max = 4
```

Initial setup:
```bash
sudo -u postgres pgbackrest --stanza=main stanza-create
sudo -u postgres pgbackrest --stanza=main --type=full backup
```

Cron on DB box:
```
00 02 * * 0   pgbackrest --stanza=main --type=full backup    # weekly full
00 02 * * 1-6 pgbackrest --stanza=main --type=diff backup    # daily diff
```

### 2. Nightly `pg_dump` → R2 (cold backup, 30-day retention)

```bash
# /etc/cron.d/pg-dump
00 03 * * * postgres /usr/local/bin/pg-dump-to-r2.sh
```
Script `pg_dump`s both databases, gzip's, uses `aws s3 cp` (with R2 endpoint) to upload. Lifecycle rule on the bucket auto-deletes after 30 days.

### 3. E2E box snapshots nightly (RPO 24h, fastest restore)

DB box snapshot covers OS + Postgres + pgbackrest local cache in one shot. 30-day retention via E2E dashboard.

### Restore drills — monthly

Spin up a throwaway E2E node, run `pgbackrest --stanza=main --type=time --target='YYYY-MM-DD HH:MM:SS' restore`, query `SELECT count(*) FROM ohlc_1hour` and confirm it matches production. **Untested backups are not backups.**

---

## Cloudflare setup

1. Create Cloudflare account, add domain (free plan).
2. Add three DNS A records, all pointing to app box's public IPv4, all proxied (orange cloud):
   - `edgeflow.<domain>`
   - `pinescript.<domain>`
   - `optionflow.<domain>`
3. SSL/TLS mode: **Full (strict)**.
4. Origin Certificate: SSL/TLS → Origin Server → Create Certificate → save `.pem` + `.key` to app box at `/etc/ssl/cloudflare/origin.crt` + `.key`.
5. (Optional) Cloudflare Page Rules to cache static assets for 24h.
6. (Optional) WAF — turn on the "OWASP" managed ruleset in monitor mode, then block after 1 week.

---

## Cost (Tier B)

| Line item | ₹/mo | $/mo |
|--|--|--|
| **DB box** (16 vCPU / 32 GB / 1 TB SSD) | ~₹22,000–28,000 | ~$265–335 |
| **App box** (20 vCPU / 64 GB / 200 GB SSD) | ~₹18,000–22,000 | ~$215–265 |
| Cloudflare (DNS + CDN + TLS + WAF) | 0 | 0 |
| Cloudflare R2 (~1 TB backups stored) | ~₹1,300 | ~$16 |
| AWS SES (transactional email) | ~₹400 | ~$5 |
| Self-hosted Redis / Prometheus / Grafana | 0 | 0 |
| pgbackrest (open source) | 0 | 0 |
| **Total monthly** | **~₹41,700–51,700** | **~$500–620** |

(Pricing approximate — verify current SKU pricing on E2E's dashboard.)

Versus AWS Multi-AZ ($1,120/mo): saves ~$500–620/mo. Versus AWS single-AZ ($784/mo): saves ~$165–285/mo with better DB isolation.

**Excluded:** Anthropic API spend (~₹25K–₹150K/mo at 500 users), Cashfree fees, domain registration.

---

## Critical files / paths to know (reference, no edits in this plan)

| Concern | Where |
|--|--|
| EdgeFlow Node entry | [server/index.ts](server/index.ts) |
| EdgeFlow Python entry | [main.py](main.py) |
| EdgeFlow Celery | [celery_app.py](celery_app.py) |
| Pinescript AI | `D:\Alpha Generator Pine\pinescript-ai` (Next.js) |
| Option Flow | `f:\Option Flow\repo` (FastAPI + Vite) |
| App env (DB_HOST etc.) | [.env](.env) — change `DB_HOST`, `AUTH_DB_HOST` to DB-box private IP and ports to 6432 |
| Cashfree integration | [server/lib/cashfree.ts](server/lib/cashfree.ts) |
| Schema reference | [CLAUDE.md](CLAUDE.md) |

Application code is unchanged by this plan — only deployment topology, env vars, and the DB host endpoint change.

---

## Verification

After both boxes are provisioned and the migration is complete:

1. **`htop` baseline** (both boxes idle): DB box ~10 GB resident (Postgres `shared_buffers` + connections + OS), app box ~14 GB.
2. **Private network sanity**: from app box, `ping <dbbox-private-ip>` < 1 ms RTT. From public internet, `nc -zv <dbbox-public-attempt> 5432` should fail (no public IP).
3. **PgBouncer healthy**: from app box, `psql -h <dbbox-private-ip> -p 6432 -U edgeflow_app -d Tiphub -c "SELECT 1"` succeeds.
4. **Migration sanity**:
   - `SELECT count(*) FROM ohlc_1hour` returns 13.3M (within drift).
   - `SELECT * FROM hypertable_size('ohlc_1hour')` returns sane numbers.
   - `SELECT count(*) FROM users` from `Tiphub_auth` matches the old host's count exactly.
5. **TimescaleDB compression**: after running compression policies for ≥ 1 day, `SELECT * FROM hypertable_compression_stats('fno_ohlcv')` shows ratios > 5×.
6. **Web load test**: `k6 run --vus 500 --duration 5m` against `/api/indices` on each of 3 hosts. p95 < 500 ms, no 5xx, Postgres connection count stable < 50 active (PgBouncer holding rest idle).
7. **Concurrent backtest stress**: 30 EdgeFlow + 10 Option Flow backtests within 60s. Queue drains < 5 min. DB CPU < 60% throughout, app CPU < 75%.
8. **FinBERT memory residency**: 5 sentiment analyses concurrent. `ps aux` shows ONE FinBERT-loaded worker at ~3.5 GB.
9. **Cross-platform isolation**: Pinescript generation + EdgeFlow backtest + Option Flow backtest, all simultaneous. None block.
10. **Coin debit cross-platform**: log in to EdgeFlow, kick off Pinescript generation, then Option Flow backtest from the same auth token. Balance updates from `/auth/v3/me` within 30s.
11. **`systemctl status` on every unit (both boxes)** — all green, no restart loops.
12. **Backups**:
    - `pgbackrest info --stanza=main` shows base backup + WAL flowing.
    - Most recent `pg_dump` in R2 < 24h old.
    - **Restore drill** on a throwaway E2E node — pgbackrest restores cleanly, row counts match.
13. **Cloudflare TLS**: `curl -vI https://edgeflow.<domain>` — valid CF cert, HTTP/2, < 100 ms TTFB.
14. **Failure drills**:
    - Stop `edgeflow-python.service` → only EdgeFlow Python endpoints fail; other 2 platforms keep serving.
    - Stop Postgres on DB box → all apps fail gracefully (502 from Nginx). Restart, full recovery in < 60s.
    - Network partition between app and DB (firewall rule) → app retries reconnect after PgBouncer pool reopens.

Fourteen green boxes = healthy two-box deployment.

---

## When to upgrade and what to do

| Signal | Action |
|--|--|
| DB CPU > 70% sustained, OR `pg_stat_statements` shows query p95 > 200 ms | Resize DB box to 24 vCPU / 64 GB. E2E supports vertical resize without rebuild — ~10 min downtime. |
| App CPU > 80% sustained | Resize app box, OR move OptionFlow Celery to a small dedicated 3rd node. |
| Concurrent connections > 80% of `max_connections` (200) | Increase PgBouncer `default_pool_size`; if that's already saturated, you're at the next DB tier. |
| Disk > 70% on DB box | Resize SSD volume online. |
| > 5,000 DAU OR paying-customer SLA tightens | Add a second app box behind Cloudflare Load Balancer. Add a Postgres streaming replica on a tiny secondary node for read scaling + DB HA. |
| pgbackrest restore drill fails | Stop everything, fix backups before any other work. |

---

## Out of scope (explicitly)

- **Multi-AZ HA / Postgres streaming replication.** Optional next step after backups are proven; adds a hot standby on a tiny secondary node for ~₹6,000–8,000/mo if/when desired.
- **Auto-scaling.** Vertical resize only at this stage.
- **Application code changes.** None required.

---

## Pre-execution checklist

Before kicking off the work, confirm:

1. **E2E region**: Mumbai (default) or Delhi/NCR.
2. **E2E SKUs**: closest match to "16 vCPU / 32 GB / 1 TB SSD" for DB and "20 vCPU / 64 GB / 200 GB SSD" for app from E2E's current pricing page.
3. **Domain**: 3 hostnames (`edgeflow.<domain>`, `pinescript.<domain>`, `optionflow.<domain>`). Cloudflare account.
4. **Cloudflare R2 bucket** for backups (`edgeflow-backups` or similar) + access keys.
5. **Migration window**: 30–60 min downtime acceptable for `pg_dump`/restore. Otherwise → logical replication path (≤ 5-min cutover, ~half a day extra setup).
6. **Plan to keep `13.205.4.69` alive for ~30 days post-migration** as a fallback before final decommission.
