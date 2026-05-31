# EdgeFlow Production Environment

Last discovered: 2026-05-31 IST

Host: `164.52.192.245`

This file documents the observed production setup for EdgeFlow and nearby services. It intentionally avoids secrets.

## Repository

EdgeFlow deployment directory:

```powershell
E:\sites\edgeflow
```

Git remotes:

```text
origin    git@github.com:Acequant-Research-Tech/Edgeflow-Latest.git
universe  git@github.com:Avishah8879/EdgeFlow.git
```

Current branch:

```text
sync-equitypro-to-auth
```

Current HEAD:

```text
fd74aa6 feat(fii-dii): refresh NSE provisional flows
```

Pull latest code that matches the local development repository:

```powershell
Set-Location E:\sites\edgeflow
git pull universe main
```

`origin` points to `Acequant-Research-Tech/Edgeflow-Latest.git`; local development pushes have been going to the `universe` remote.

## Services

EdgeFlow services are installed through NSSM.

| Service name | Display name | Status | Startup type | Application | Working directory | Parameters |
| --- | --- | --- | --- | --- | --- | --- |
| `edgeflow-node` | `edgeflow-node` | Running | Auto | `C:\Program Files\nodejs\node.exe` | `E:\sites\edgeflow` | `E:\sites\edgeflow\dist\index.js` |
| `edgeflow-python` | `edgeflow-python` | Running | Auto | `E:\sites\edgeflow\.venv\Scripts\python.exe` | `E:\sites\edgeflow` | `E:\sites\edgeflow\main.py` |
| `edgeflow-celery` | `edgeflow-celery` | Running | Auto | `E:\sites\edgeflow\.venv\Scripts\celery.exe` | `E:\sites\edgeflow` | `-A celery_app worker --pool=solo --loglevel=info -Q celery,default,heavy,periodic` |
| `edgeflow-celery-beat` | `edgeflow-celery-beat` | Running | Auto | `E:\sites\edgeflow\.venv\Scripts\celery.exe` | `E:\sites\edgeflow` | `-A celery_app beat --loglevel=info` |
| `Memurai` | `Memurai` | Running | Auto | `C:\Program Files\Memurai\memurai.exe` | could not determine | `--service-run --service-name Memurai "C:\Program Files\Memurai\memurai.conf"` |
| `Memurai-EdgeFlow-Sessions` | `Memurai EdgeFlow Sessions` | Stopped | Auto | `C:\Program Files\Memurai\memurai.exe` | could not determine | `--service-run --service-name Memurai-EdgeFlow-Sessions "C:\Program Files\Memurai\memurai-edgeflow-sessions.conf"` |
| `optionflow-api-interactive` | `OptionFlow API Interactive` | Running | Auto | `C:\Python312\python.exe` | `E:\optionflow_api` | `E:\optionflow_api\run_interactive.py` |
| `optionflow-api-bulk-8010` | `OptionFlow API Bulk (8010)` | Running | Auto | `C:\Python312\python.exe` | `E:\optionflow_api` | `E:\optionflow_api\run_bulk_8010.py` |
| `optionflow-live` | `OptionFlow Live` | Running | Auto | `C:\Python312\python.exe` | `E:\optionflow_live\backend` | `serve_live.py` |

Service status command:

```powershell
nssm status edgeflow-node
nssm status edgeflow-python
nssm status edgeflow-celery
nssm status edgeflow-celery-beat
```

FII/DII refresh is not a separate Windows service. It is an in-process `node-cron`
job initialized by `edgeflow-node` from `server/cron/fii-dii-refresh.ts`.

## Ports

Relevant listening ports observed with `netstat -ano | findstr LISTENING` and process command-line checks:

| Port | Bind | PID | Process | What it serves |
| --- | --- | --- | --- | --- |
| `80` | `0.0.0.0` | `4504` | `E:\caddy\caddy.exe` | Caddy HTTP reverse proxy |
| `443` | `0.0.0.0` | `4504` | `E:\caddy\caddy.exe` | Caddy HTTPS reverse proxy |
| `3000` | `0.0.0.0` | `5672` | `node.exe` | `E:\sites\pinescript-ai\.next\standalone\server.js` |
| `4000` | `0.0.0.0` | `13180` | `node.exe` | EdgeFlow Node app, `E:\sites\edgeflow\dist\index.js` |
| `4001` | `0.0.0.0` | `3872` | `node.exe` | Node app running `dist\src\main.js`; exact app could not determine |
| `5000` | `0.0.0.0` | `7552` | `python.exe` | Python app running `app.py`; exact app could not determine |
| `5001` | `0.0.0.0` and `[::]` | `3636` | `node.exe` | `E:\fmr-telegram-bot\web` Next app |
| `5002` | `0.0.0.0` | `6340` | `python.exe` | Uvicorn app `web.main:app`; exact app could not determine |
| `5004` | `0.0.0.0` | `11736` | `python.exe` | AlphaEdge landing app, `C:\alphaedge_landing\server.py` |
| `5432` | `0.0.0.0` and `[::]` | `5336` | `postgres.exe` | PostgreSQL 16, data dir `E:\PostgreSQL\data` |
| `5555` | `0.0.0.0` | `7552` | `python.exe` | Same Python `app.py`; exact purpose could not determine |
| `6379` | `127.0.0.1` | `6760` | `memurai.exe` | Redis-compatible Memurai instance |
| `8000` | `0.0.0.0` | `6792` | `python.exe` | OptionFlow API interactive |
| `8010` | `0.0.0.0` | `6420` | `python.exe` | OptionFlow API bulk |
| `8088` | `0.0.0.0` | `3160` | `python.exe` | OptionFlow Live |
| `8100` | `0.0.0.0` | `11312` | `python.exe` | EdgeFlow Python/FastAPI app, `E:\sites\edgeflow\main.py` |
| `8765` | `0.0.0.0` | `7552` | `python.exe` | Same Python `app.py`; exact purpose could not determine |
| `8888` | `127.0.0.1` | `8092` | `node.exe` | Local Next app on `127.0.0.1:8888`; exact app could not determine |
| `8888` | `164.52.192.245` | `2284` | `3proxy.exe` | `C:\3proxy\3proxy.cfg` |

Other system/listening ports observed include SSH `22`, RDP `3389`, WinRM `5986`, SMB/Windows system ports, and Zabbix-style port `10050`.

## Environment

Production env files in the EdgeFlow repo:

```text
E:\sites\edgeflow\.env
E:\sites\edgeflow\.env.production
```

Both `.env` and `.env.production` were present with the same observed size and timestamp at discovery time.

Selected non-secret production env values:

```env
NODE_ENV=production
PORT=4000
PYTHON_API_URL=http://164.52.192.245:8100
VITE_GRADIO_BASE_URL=http://164.52.192.245:8100
CORS_ORIGINS=http://164.52.192.245:4000,http://164.52.192.245:8100,http://164.52.192.245:8088,http://164.52.192.245:3000,https://ai.equitypro.ai,http://localhost:4000,http://localhost:5173,https://testing.equitypro.ai
VITE_PLATFORM_A_URL=http://164.52.192.245:8088
PLATFORM_A_ORIGIN=http://164.52.192.245:8088
VITE_PLATFORM_B_URL=https://ai.equitypro.ai
PLATFORM_B_ORIGIN=https://ai.equitypro.ai
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1
CELERY_BEAT_ENABLED=true
```

Runtime versions:

```text
Node: v24.14.1
npm: 11.11.0
Python venv: Python 3.13.13
Celery: 5.5.3 (immunity)
```

Python venv:

```powershell
E:\sites\edgeflow\.venv
```

Observed EdgeFlow log directory:

```powershell
E:\sites\edgeflow\logs
```

Important log files:

```text
celery-err.log
celery-out.log
celerybeat-err.log
celerybeat-out.log
celery_beat.log
celery_worker.log
node-err.log
node-out.log
python-err.log
python-out.log
```

Config files outside the repo:

```text
E:\caddy\Caddyfile
C:\Program Files\Memurai\memurai.conf
C:\Program Files\Memurai\memurai-edgeflow-sessions.conf
C:\3proxy\3proxy.cfg
```

Caddyfile at discovery time:

```caddyfile
{
    email tech@acequantresearch.com
}

testing.equitypro.ai {
    encode gzip
    reverse_proxy localhost:4000
    log {
        output file E:/caddy/access.log
    }
}

alphaedge-signals.com, www.alphaedge-signals.com {
    encode gzip
    reverse_proxy localhost:5004
    log {
        output file E:/caddy/access.log
    }
}
```

## Deployment Procedure

Conservative deployment steps based on the observed setup:

```powershell
Set-Location E:\sites\edgeflow
git pull universe main
cmd /c npm run build
```

Restart only the services affected by the change:

```powershell
nssm restart edgeflow-node
```

Use for Node, Express, frontend bundle, `dist\index.js` changes, and in-process
Node cron jobs such as the FII/DII refresh.

```powershell
nssm restart edgeflow-python
```

Use for FastAPI/Python route or Python backend changes.

```powershell
nssm restart edgeflow-celery-beat
nssm restart edgeflow-celery
nssm status edgeflow-celery
nssm status edgeflow-celery-beat
```

Use for Celery task, Celery config, or beat schedule changes. If `edgeflow-celery` does not come back running after restart, start it explicitly:

```powershell
nssm start edgeflow-celery
```

Recommended order for a full deploy:

1. Pull code with `git pull universe main`.
2. Build with `cmd /c npm run build`.
3. Restart `edgeflow-node` for Node/frontend changes.
4. Restart `edgeflow-python` for Python API changes.
5. Restart `edgeflow-celery-beat`, then `edgeflow-celery`, for Celery changes.
6. Check `E:\sites\edgeflow\logs\*-err.log` and service status.

## Node Cron Jobs

These cron jobs run inside the `edgeflow-node` NSSM service. Restart
`edgeflow-node` after changing any of these files or their dependent service
code.

| Job | Source file | Schedule | Time zone | Purpose | Cache/storage |
| --- | --- | --- | --- | --- | --- |
| Subscription expiration checks | `server/cron/subscription-tasks.ts` | Hourly at `:00` | Server local | Expire ended trials/subscriptions | Auth DB |
| API usage flush | `server/cron/api-usage-flush.ts` | Every 60 seconds | Server local | Flush API usage events from Redis to PostgreSQL | Redis + PostgreSQL |
| FII/DII NSE provisional refresh | `server/cron/fii-dii-refresh.ts` | `0 19 * * 1-5` | `Asia/Kolkata` | Fetch NSE provisional FII/DII cash-market data and persist it | Redis key `fii_dii:nse_cash:1D`, table `fii_dii_flows` |

FII/DII data source and behavior:

```text
NSE session page: https://www.nseindia.com
NSE JSON endpoint: https://www.nseindia.com/api/fiidiiTradeReact
Source label: NSE_PROVISIONAL
Redis cache TTL: 1 hour
DB table: fii_dii_flows
Participant rows: FII and DII
Segment: CASH
```

The FII/DII cron also runs a startup backfill check. If fewer than 30 cash-market
sessions exist in `fii_dii_flows`, it tries to fetch the NSE historical range
using the same cookie/session flow. At discovery time the public NSE endpoint was
observed to return only the latest session even when date parameters are
provided, so history will primarily accumulate through the weekday 19:00 IST
refresh.

## Redis / Memurai

Redis-compatible service:

```text
Service: Memurai
Status: Running
Port: 127.0.0.1:6379
Config: C:\Program Files\Memurai\memurai.conf
```

EdgeFlow uses:

```env
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1
```

Session-specific Memurai service:

```text
Service: Memurai-EdgeFlow-Sessions
Status: Stopped
Startup type: Auto
Config: C:\Program Files\Memurai\memurai-edgeflow-sessions.conf
```

Whether `Memurai-EdgeFlow-Sessions` should be running could not be determined from safe probes. The observed EdgeFlow configuration points to the main `Memurai` service on `localhost:6379`.

## Celery

Worker command:

```powershell
E:\sites\edgeflow\.venv\Scripts\celery.exe -A celery_app worker --pool=solo --loglevel=info -Q celery,default,heavy,periodic
```

Beat command:

```powershell
E:\sites\edgeflow\.venv\Scripts\celery.exe -A celery_app beat --loglevel=info
```

Queues consumed:

```text
celery
default
heavy
periodic
```

Worker node name:

```text
celery@WINDOWS-SNUVT66
```

Registered tasks observed after the options visualizer cleanup:

```text
backtest.run
celery_tasks.refresh_options_visualizer
celery_tasks.snapshot_options_oi
cmots.sync
sentiment.analyze
```

Beat schedule observed after cleanup:

```text
full-prewarm-evening
full-prewarm-morning
refresh-options-visualizer-60s
snapshot-options-oi-5min
warm-ohlcv-cache-evening
```

Clean restart commands:

```powershell
nssm restart edgeflow-celery-beat
nssm restart edgeflow-celery
nssm status edgeflow-celery
nssm status edgeflow-celery-beat
```

Inspect registered tasks:

```powershell
Set-Location E:\sites\edgeflow
.\.venv\Scripts\celery.exe -A celery_app inspect registered --timeout=10
```

Inspect active tasks:

```powershell
Set-Location E:\sites\edgeflow
.\.venv\Scripts\celery.exe -A celery_app inspect active --timeout=10
```

## Other Apps On The Server

Top-level `E:\` directories observed:

```text
E:\backups
E:\caddy
E:\cold_storage
E:\cold_storage_upload
E:\db_backups
E:\fmr-telegram-bot
E:\openalgo
E:\optionflow_api
E:\optionflow_live
E:\options_pipeline
E:\PostgreSQL
E:\scripts
E:\sites
E:\ssh
```

Observed nearby applications:

| App | Path | Port(s) | Process/service |
| --- | --- | --- | --- |
| OptionFlow API interactive | `E:\optionflow_api` | `8000` | `optionflow-api-interactive` |
| OptionFlow API bulk | `E:\optionflow_api` | `8010` | `optionflow-api-bulk-8010` |
| OptionFlow Live | `E:\optionflow_live\backend` | `8088` | `optionflow-live` |
| EquityPro AI / PineScript AI | `E:\sites\pinescript-ai` | `3000` | `node.exe E:\sites\pinescript-ai\.next\standalone\server.js` |
| FMR Telegram Bot web | `E:\fmr-telegram-bot\web` | `5001` | `next start -p 5001` |
| AlphaEdge landing | `C:\alphaedge_landing` | `5004` | `python.exe C:\alphaedge_landing\server.py` |
| Caddy reverse proxy | `E:\caddy` | `80`, `443`, `2019` | `E:\caddy\caddy.exe run --config E:\caddy\Caddyfile` |
| PostgreSQL | `E:\PostgreSQL\data` | `5432` | PostgreSQL 16 |
| 3proxy | `C:\3proxy` | `164.52.192.245:8888` | `C:\3proxy\3proxy\bin64\3proxy.exe C:\3proxy\3proxy.cfg` |

Unidentified observed processes:

| Port(s) | Process | Command line |
| --- | --- | --- |
| `4001` | `node.exe` | `node.exe dist\src\main.js` |
| `5000`, `5555`, `8765` | `python.exe` | `python.exe app.py` |
| `5002` | `python.exe` | `python.exe -m uvicorn web.main:app --host 0.0.0.0 --port 5002 --log-level info` |
| `127.0.0.1:8888` | `node.exe` | `next start -p 8888 -H 127.0.0.1` |

## Conservative SSH Notes

Discovery was performed with short non-interactive commands. Anything marked "could not determine" was not probed further to avoid long-running or risky commands.
