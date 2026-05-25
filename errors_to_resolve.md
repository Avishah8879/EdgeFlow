# Errors to resolve — pending bug log

> Working list of regressions / issues identified but not yet root-caused or
> fixed. Each entry should capture the symptom, what we already know, and
> what's been tried so we can pick it up cleanly.

## How to use this file

When a bug is discovered:

1. Add a `## <short title>` section at the top of the **Open** list below.
2. Fill in: symptom, when noticed, suspected cause, what's been tried, next
   steps. Keep it terse but enough to resume work cold.
3. When fixed, move the entry under **Resolved** with the commit hash.

---

## Open

### Most active panel — `/api/most-active` 15s proxy timeout

**Symptom**

```
[PythonProxy] Request to /api/most-active?sort=volume&limit=25 failed
  (attempt 1/4), retrying in 1118ms: timeout of 15000ms exceeded
```

The Most Active page (`/most-active`) cannot load any sub-tab. All 6 sorts
(`volume` / `value` / `gainers` / `losers` / `high52w` / `low52w`) hit the
same 15-second Node-proxy timeout.

**When noticed**

After commit `f99b0dc` (the Node-proxy passthrough fix). Node side is
correctly forwarding the `sort` query param to Python now, so this is a
**downstream Python latency issue**, not a routing issue.

**What we know**

- `/api/most-active` was implemented in commit `945155d`. It runs a single
  SQL query joining `ltp_live × tickers × stock_fundamentals`, ordered by
  the chosen sort, `LIMIT 25`. On paper this should be sub-100ms.
- Backend uses `loop.run_in_executor(None, _fetch)` to run the SQL
  synchronously in a worker thread.
- A second new endpoint `/api/world-indices` (also commit `945155d`)
  performs **16 sequential `yfinance.Ticker(...).history(period="1y")`
  calls per request** in a single executor thread — up to ~80 seconds
  wall-clock blocking. Strong suspicion this is starving the default
  Python thread pool, queueing every other DB-backed endpoint behind it
  until they hit the 15s proxy boundary.
- Dashboard page (`/home`) was reported empty at the same time — and
  `/home` only consumes `/api/indices`, `/api/market-movers`,
  `/api/stock-ltp/bulk`, none of which we touched in code. That points
  strongly at runtime starvation, not a code bug.

**What's been tried**

1. ✅ Commit `f99b0dc` — fixed the unrelated Node-proxy bug where the
   route ignored the `sort` param and returned hardcoded gainer+loser
   blend. Tabs now reach Python with the correct query string.
2. ✅ Commit `88633ab` — refactored `/api/world-indices` to use
   `asyncio.gather` with `Semaphore(5)` + per-call `asyncio.wait_for`
   timeout of 6s. Total batch now bounded at ~10s.
3. ❌ User restarted Python — issue persisted. Either:
   - the restart didn't happen (process still on old code), or
   - the parallelism fix didn't fully resolve thread-pool contention,
   - or there's a separate slowness in `/api/most-active` itself.

**Hypotheses to test next**

1. **Confirm Python is on latest `main.py`**. Add a startup log line
   reporting the git hash so we know which version is live.
2. **Profile the most-active SQL in isolation**. Run the query in
   `psql` against the production-like DB; if it takes >1s, add an
   index — likely on `ltp_live(trade_volume DESC)` and
   `ltp_live(percent_change DESC)`.
3. **Move world-indices off the default executor**. Even with the
   parallel fix, 16 yfinance HTTP calls (each opening a TLS handshake)
   compete for `socket.getaddrinfo` and DNS — try a dedicated thread
   pool sized to 5–10 to keep yfinance contained.
4. **Add per-endpoint timeout logging**. Right now we know the Node
   side timed out, not how long the Python side actually took. Log the
   wall-clock per request inside the FastAPI handler to localize.
5. **Cache hit / miss telemetry**. Is the 60s server-side cache
   actually being populated? If first request times out, cache is
   never written, every subsequent request also times out — death
   spiral. Verify by hitting one sort manually with `curl` from the
   server.

**Files involved**

- [main.py:10817](EdgeFlow/main.py#L10817) — `/api/most-active` handler
- [main.py:10599](EdgeFlow/main.py#L10599) — `/api/world-indices` handler (suspected starvation source)
- [server/routes-terminal.ts:544](EdgeFlow/server/routes-terminal.ts#L544) — Node passthrough (fixed in `f99b0dc`)
- [client/src/components/ft/MostActivePanel.tsx](EdgeFlow/client/src/components/ft/MostActivePanel.tsx) — frontend (no changes needed for this bug)

**Status**: deferred. Page renders the loading spinner indefinitely. Other
parts of the app (dashboard, monitor, compare) reportedly continue to
work for the same user once `/world-indices` polling is paused.

---

## Resolved

_(empty — move entries here with their fix commit when closed)_
