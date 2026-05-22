# CMOTS Integration — Outstanding Decisions

Open follow-ups from the §1–§4 work. Resolve **before** the eventual PROD
cutover.

> **Migration rename note (PR sync to `edgeflow-universe-auth`):** the four
> CMOTS migrations were renumbered from **030–033** to **033–036** to avoid
> filename collision with the auth branch's `030_saved_fundamental_and_portfolio_results.sql`,
> `031_user_screener_templates.sql`, and `032_user_screener_templates_type.sql`.
> PROD was applied on 2026-05-13 under the **original** 030–033 numbers
> (different database, `equityprodata` vs the auth branch's `Tiphub_auth`),
> so the rename is filename-only — no re-application is needed. References
> below to "030/031/032/033" in historical context still refer to the prod
> apply events; current filenames are 033/034/035/036.

---

## Working with CMOTS — patterns that worked

**Probe-before-trust (2026-05-14, three confirmed cases).** When a §X
spec from the plan, the schema reference doc, or §9.4-style derived
behavior describes CMOTS data shape, **probe the actual dev-DB raw cache
(or one live trial-token call) before locking the implementation**.
Documented divergences so far:

- **History depth doubled vs spec.** Schema doc said 5y annual / 20q
  quarterly; observed 10y annual / 40q quarterly across
  Profit_and_Loss_C / Quarterly_Results_C. Filed in section 2 above.
- **Company_Profile field-name casing is inconsistent.** Plan said
  `HOADD1/HOADD2/COADD1/COADD2`; actual fields are `ho_add1/ho_add2/
  ho_add3` and `co_add1/co_add2/co_add3` (lowercase + underscore + 3
  lines, not 2). Worse: `REGADD*` (no underscore) is company REGISTERED
  office, while `REG_ADD*` (with underscore) is the REGISTRAR's address
  — the schema is asymmetric across two adjacent column prefixes.
- **Rating grades are PDF-only.** §9.4 plan assumed grade tokens
  (AAA/AA+/BBB/etc.) appear within 200 chars of the agency name in
  caption+memo. Probe of 8 real rating-mentioning announcements showed
  CMOTS puts only the headline ("Credit Rating - ICRA Limited") in the
  text fields; the actual grade lives in the linked PDF. The regex
  conservatively returns NULL for these rows — correct behavior, not
  a bug.

The cost of probing is small: one psycopg2 query against the dev-DB
raw cache (or one live trial-token fetch) takes seconds. The cost of
trusting an outdated/wrong spec and discovering it during end-to-end
sync is hours of debugging through a poisoned transaction or silent
data loss. **Probe first; implement second.** Make this the default
approach for §6 onward.

---

## 1. BSE-only listings — schema extension needed before PROD

**Status:** deferred. 15 tickers were skipped in the trial sync because
they have no `NSESymbol` in CMOTS's `Company_Master` payload. The current
`tickers` table assumes an NSE-first model (`symbol` typically = NSE
symbol; `exchange` defaults to `'NSE'`). Synthesising a symbol from
`BSECode` (the original behaviour) produced numeric-only symbols
(`501477`, `503772`, …) that broke the convention and would clash with
downstream consumers that assume tradable NSE tickers.

**Current behaviour (post-fix, 2026-05-14):**
- `server/cmots_sync.py::_load_company_master` filters BSE-only rows at
  intake (no `NSESymbol` → skip; not added to `seen`; no `cmots_api_calls`
  written for them).
- `server/cmots_sync.py::_upsert_ticker_from_master_row` has a defensive
  guard that returns `None` for the same case in any non-master caller.

**Co_codes skipped in the trial sync** (captured from
`equityprodata_sync_dev` before deletion):

| co_code | Company name |
| ------: | ------------ |
| 211 | Him Teknoforge Ltd |
| 268 | Indag Rubber Ltd |
| 290 | Indo Gulf Industries Ltd |
| 296 | International Combustion (India) Ltd |
| 315 | Jyoti Ltd |
| 327 | Kaycee Industries Ltd |
| 383 | Modella Woollens Ltd |
| 394 | Saptak Chem & Business Ltd |
| 423 | Orissa Sponge Iron & Steel Ltd |
| 439 | Amal Ltd |
| 543 | Swadeshi Polytex Ltd |
| 639 | Automobile Products of India Ltd |
| 674 | Informed Technologies India Ltd |
| 684 | Muller & Phipps (India) Ltd |
| 793 | International Data Management Ltd |

**Decision needed before PROD:** how to represent BSE-only equities as
first-class tickers. Options:

1. Add a `listing_exchange` column (or columns `nse_listed: bool`,
   `bse_listed: bool`) to `tickers`. Use `BSECode` as the symbol when
   `NSESymbol` is empty, with `exchange='BSE'`. Update all downstream
   consumers to handle non-NSE tickers.
2. Add a separate `bse_only_tickers` table that mirrors the relevant
   columns. CMOTS sync writes to whichever applies. Frontend opts in.
3. Defer indefinitely. BSE-only tickers stay out of the universe.

Whatever the choice, remove the filter / defensive guard in
`server/cmots_sync.py` once the schema can absorb them, and update the
master-loop log line ("skipped X BSE-only").

---

## §10 cutover prerequisites — coexistence with the legacy yfinance writer

**Discovered 2026-05-15 during §9 visual checkpoint.** PROD's
``stock_fundamentals`` table has **3,137 rows**, all
``data_source='yfinance'``, with ``last_updated`` ranging from
2026-02-18 to 2026-05-12 — i.e. a yfinance backfill script has been
running nightly against PROD throughout. The earlier assumption
("the yfinance script was decommissioned, targets old DB
Tiphub_isin_enhancement") was incorrect for PROD; the script has been
environment-substituted to point at ``equityprodata`` and continues
to run.

### Coexistence behavior (verified against dev DB 2026-05-15)

The yfinance script's ``skip_existing=True`` default reads
``get_existing_fundamentals_ids()`` which returns ticker_ids where
``fetch_error = '' OR fetch_error IS NULL`` and **skips them** on the
next run.

§6 backfill sets ``fetch_error = NULL`` on every CMOTS-written row.
Verified on dev DB:

```
SELECT count(*) total, count(*) FILTER (WHERE fetch_error IS NULL) null_errors,
       count(*) FILTER (WHERE fetch_error = '') empty_errors,
       count(*) FILTER (WHERE fetch_error IS NOT NULL AND fetch_error != '') real_errors
  FROM stock_fundamentals WHERE data_source = 'cmots';

total | null_errors | empty_errors | real_errors
------+-------------+--------------+------------
  115 |         115 |            0 |          0
```

**Conclusion**: post-CMOTS-cutover, the yfinance script will skip
every CMOTS-backfilled row on its next run. CMOTS data is preserved
by default; the two writers coexist safely.

### Cron entry location (not in this repo)

The yfinance writer is **not located in this repo and not in local
Windows Task Scheduler**. Search results (2026-05-15):

- No ``crontab -l`` (Windows host has no crontab command)
- No matching Windows scheduled tasks (``schtasks /query`` returned
  nothing for yfinance / fundament / stock_fund / edgeflow / equitypro
  keywords)
- No files in this repo matching ``stock_fundamentals_optimised``,
  ``skip_existing``, ``get_existing_fundamentals_ids``

The writer must run on the PROD VM (``164.52.192.245``) or another
external host. **User's runbook owns the cron location** — refer to
it during §10 prep to confirm the schedule and document the cutover
sequence.

### Operational note for §10 cutover

**Do NOT** run the yfinance script with ``--no-skip`` (or any flag
that bypasses ``skip_existing``) after CMOTS cutover. The expected
operational interface for fundamentals refresh post-cutover is:
``POST /api/admin/cmots/sync`` (the §8 admin endpoint).

If a manual yfinance pass is needed for an outage / data-gap fix on
non-CMOTS-covered tickers, run with default ``skip_existing=True``
— it'll touch only the rows yfinance owns.

If at some future date all 3,000 ticker universe gets CMOTS
coverage, the yfinance writer can be decommissioned entirely.

### Drizzle (Node side) is the active schema mutator on PROD

**Discovered 2026-05-15 during §9 Path 1 dev-DB restore.** Schema
diff between the 2026-05-13 post-migration dump and a fresh PROD dump
on 2026-05-15 surfaced uncoordinated schema drift that ``equityprodata_sync_dev``
never received:

- New ``user_screener_templates`` table (UUID PK, FK to ``users(id)``
  CASCADE, UNIQUE(user_id, screener_type, name)) — 5 rows in PROD.
- New ``users.primary_platform_id`` FK → ``platforms(id)``.
- 3 trigger functions: ``update_coin_packs_updated_at()``,
  ``update_payment_intents_updated_at()``, ``update_platforms_updated_at()``.
- Removed CHECK constraints ``check_tier`` (free/semi/pro) and
  ``check_plan_tier`` (basic/premium).

None of the affected tables are referenced by the Python backend's
CMOTS code path, but the dev DB pointing at a stale schema caused
``current transaction is aborted`` 500s — likely from a startup query
or Drizzle-managed table accessed by the Node side bleeding into a
shared cursor.

**Operational implication:** the dev DB drifts from PROD whenever
Drizzle runs migrations on the Node side, and that schedule isn't
controlled from the Python codebase. Re-restore ``equityprodata_sync_dev``
from a fresh PROD dump:
- before any §10-style cutover-grade work (always)
- otherwise on a monthly cadence (or whenever a §9-style restore is
  needed to unblock a verification)

Artifacts of the 2026-05-15 restore: ``backups/dev_vs_prod_diff_20260515T094849Z.txt``
(table-level), ``backups/schema_drift_diff_20260515T095302Z.txt``
(schema-level), ``backups/pre_path1_restore_20260515T095008Z.dump``
(the actual restore source, SHA-256 ``fe13d1fe…``).

### §10 prep blockers (discovered 2026-05-15; ordered by priority)

These are HARD gates before any §10 PROD sync. Each was surfaced by a real
mistake during the §9 verification cycle, not theoretical risk.

**Gate #1 — Celery `cmots.sync` task imports cleanly + executes end-to-end.**

Fixed 2026-05-15 by:
- Adding ``server/__init__.py`` (empty file) to convert PEP 420 namespace
  package to explicit regular package.
- Hoisting ``from server.cmots_sync import run_full_sync_sync`` to module
  level in ``celery_tasks.py`` so a future breakage fails fast at worker
  boot rather than silently per-task in 33ms.

Failure mode pre-fix: HTTP dispatch returned task_id (looked successful),
but worker hit ModuleNotFoundError and acked-as-failure with no
result_backend entry surfaceable. Tasks vanished. The 20:51 trial sync
that "completed" actually ran via in-process ``cmots_sync_task.apply()``
in a subprocess, NOT via Celery. A 14h blocking in-process sync against
PROD FastAPI would render the backend unresponsive for the entire window
— architecturally unacceptable.

**§10 verification:** before any PROD sync, dispatch one trial-token-style
``cmots.sync`` via Celery and observe ``cmots_sync_state.status`` move
``idle → running → done`` with a result_backend entry in
``redis://localhost:6379/2`` matching the task_id. Verified on dev DB
2026-05-15.

**Gate #2 — All CMOTS migrations 030-033 applied to PROD.**

CMOTS migrations live in ``EdgeFlow/migrations/030_cmots_*.sql`` and are
tracked SEPARATELY from the Node/Drizzle ``migration_history`` table.
``030_cmots_tickers_extend.sql``, ``031_cmots_raw_cache.sql``, and
``032_cmots_normalized.sql`` were applied to PROD on 2026-05-13 (per
``backups/post_migration_dump_manifest.txt``). But
``033_cmots_financial_line_report_expand.sql`` was applied ONLY to the
old ``equityprodata_sync_dev`` on 2026-05-14, NEVER to PROD.

Without 033, every UPSERT for ``cmots_financial_line.report IN
('pnl','bs','cf')`` hits the CHECK constraint violation. The §5
normalizer for PNL/BS/CF data silently fails per ticker, raw cache
still commits, but hot-path PNL/BS/CF rows are missing. Frontend
``FinancialStatementsPanel`` would show empty P&L / Balance Sheet / Cash
Flow tabs for every covered ticker.

**§10 application step:** apply 033 to PROD before §10 sync starts:
```bash
psql --single-transaction --set ON_ERROR_STOP=1 \
     -h $DB_HOST -p $DB_PORT -U $DB_USER -d equityprodata \
     -f migrations/036_cmots_financial_line_report_expand.sql
```

**§10 verification:** after applying, confirm CHECK definition expanded:
```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint
  WHERE conname = 'cmots_financial_line_report_check';
-- Expect: CHECK (report IN ('pnl','bs','cf','quarter','year','half','nine'))
```

**Gate #3 — Migration audit on PROD before §10 sync.**

The 033 miss was a process failure of "we tracked it manually in
TODO_CMOTS.md and forgot." Don't rely on manual tracking. Before §10:

1. Walk ``EdgeFlow/migrations/0NN_cmots_*.sql`` files (currently 4: 030,
   031, 032, 033).
2. For each, derive a schema fingerprint it leaves behind (table existence,
   constraint definition, or column existence).
3. Probe PROD for each fingerprint via ``psql``. Any missing fingerprint
   = unapplied migration. Apply before sync.

Suggested fingerprints (verify, don't assume):
- 030 — ``tickers.co_code`` column exists; ``stock_fundamentals.data_source`` column exists.
- 031 — ``cmots_endpoints`` table exists; ``cmots_sync_state`` singleton row exists.
- 032 — ``cmots_financial_line`` table exists; all 8 hot-path tables present.
- 033 — ``cmots_financial_line_report_check`` allows ``'pnl','bs','cf'``.

If any future CMOTS migration (034+) is created in this directory before
§10, this audit catches it.

**Gate #4 — Path 1 (dev restore from PROD dump) runbook must re-apply
dev-side migrations after restore.**

Discovered 2026-05-15: restoring ``equityprodata_sync_dev`` from a PROD
dump regresses dev to PROD's schema state, discarding any migrations
that were applied to dev but never propagated to PROD. The Path 1 plan
didn't anticipate this — migration 033 was the casualty.

**Updated restore-runbook step (added to ``backups/ROLLBACK.md`` if
codifying as standard procedure):** after ``timescaledb_post_restore()``,
re-apply any ``EdgeFlow/migrations/0NN_cmots_*.sql`` that hasn't been
applied to PROD yet. Until 033 lands on PROD, this means re-applying
033 to dev after every restore-from-PROD.

**Gate #5 — CMOTS_TOKEN scope confirmation (VERIFIED 2026-05-15: TRIAL).**

Direct probe 2026-05-15: two consecutive calls to
``https://jwttoken.cmots.com/RGXResearch/api/CompanyMaster`` with the
current ``CMOTS_TOKEN`` returned **10 rows per call**, matching the
schema-doc quirk §11.10 for trial token. Sample co_codes from call #1:
[44, 292, 296, 476, 484, 544, 554, 610, 782, 810]. The two trial syncs
on 2026-05-15 against ``equityprodata_sync_dev`` (50 tickers in-process,
109 tickers Celery) reflect the orchestrator's 15-call random union
collapsing differently each run.

**§10 BLOCKER (highest priority):** the current token cannot cover the
~3,000 PROD universe. Running §10 sync with this token writes data for
~100 random tickers and reports success while missing 2,900+. **Acquire
production token before any other §10 prep work.**

Once production token acquired, repeat the probe:
1. If CALL #1 returns >500 rows → PRODUCTION token (full universe). Then
   collapse the orchestrator's bounded-retry loop to a single call per
   §5 / TODO_CMOTS.md "Decision needed before PROD" #3.
2. If still returns ~10 rows → token is still trial, escalate further.

The Gate #1 / Gate #3 verification work is wasted if Gate #5 fails. Do
this probe FIRST.

**Gate #6 — Migration audit (VERIFIED 2026-05-15, status: clean).**

Walked ``EdgeFlow/migrations/*.sql`` post-§9-verification:
- ``030_cmots_tickers_extend.sql`` — applied to PROD 2026-05-13 (in
  ``post_migration_dump_manifest.txt``). Fingerprint: ``tickers.co_code``
  column exists, ``stock_fundamentals.data_source`` column exists. ✓
- ``031_cmots_raw_cache.sql`` — applied to PROD 2026-05-13. Fingerprint:
  ``cmots_endpoints`` + ``cmots_sync_state`` tables exist. ✓
- ``032_cmots_normalized.sql`` — applied to PROD 2026-05-13. Fingerprint:
  all 8 ``cmots_*`` hot-path tables exist. ✓
- ``033_cmots_financial_line_report_expand.sql`` — applied to dev
  2026-05-15 only. **PROD STILL HAS THE NARROW CHECK.** Fingerprint:
  ``cmots_financial_line_report_check`` constraint definition.

No ``034`` or higher exists. Only one outstanding migration for §10.
**Status: stable** — the audit gate is automatable but doesn't need it
yet (4 migrations, 3 applied, 1 outstanding).

**Operational change (2026-05-15):** Celery ``cmots.sync`` task
``time_limit`` raised from 8h to 18h in ``celery_tasks.py`` (soft limit
17.5h). The 8h limit was based on a §5 ~14h projection at trial scale;
18h gives headroom for the actual PROD-token sync to run without
``SoftTimeLimitExceeded`` interrupting mid-flight.

### §10 prep operational ordering (revised 2026-05-16 — production-token-deferred)

**Status (2026-05-16):** production token expected ~2 weeks (~2026-05-30).
User decision: **do NOT run §10 against PROD with trial token.** Reasons:
~100 random ticker coverage isn't worth a 14-hour PROD sync; doing it twice
(trial now + prod in 2 weeks) doubles operational risk; the random covered
set doesn't include high-traffic tickers users actually search for (e.g.,
RELIANCE, HDFCBANK, TCS, INFY, SBIN, MARUTI, BHARTIARTL all uncovered in
the 2026-05-15 Celery trial sync).

**Hybrid coexistence is the production plan.** Architecture already supports
this: yfinance writer continues to populate stock_fundamentals nightly;
covered tickers (post-§10) flip to data_source='cmots' and yfinance's
skip_existing preserves them. PROD ships now with CMOTS panels rendering
clean empty states for every ticker (since PROD's cmots_* tables exist but
have no sync data yet). When the production token arrives, §10 sync fills
in coverage and the existing UI lights up.

#### Phase A — NOW (ship the frontend code to PROD, no PROD sync yet)

Migrations 030-032 are already on PROD. Migration 033 needs to land before
any §10 sync, but does NOT block frontend shipping (the migration affects
only the sync's write path; read accessors return empty-shape contracts on
empty tables — verified 2026-05-16 against an uncovered ticker on dev:
all 13+ CMOTS endpoints return clean empty WideTables/lists/dicts; legacy
`/stock-detail/{ticker}` continues to return yfinance-backed 45KB JSON).

Phase 3 wiring (StockDetail.tsx full integration — replacing the preview
mount with NavSection registrations + conditional rendering on
has_cmots_data) is the next priority. That's what makes the panels
production-ready even though they'll mostly show empty states for ~2 weeks.

**Verification gates before Phase 3 merge:**
- ✓ Phase 2b ⑤+⑥ built (RatiosPanel, FinancialStatementsPanel)
- ✓ All 6 CMOTS panels render covered-ticker data correctly (verified on ITC)
- ✓ All CMOTS endpoints return clean empty-shape contract for uncovered
  tickers (verified API-side on RELIANCE)
- ⏸ Browser verification on an uncovered ticker (user-side, pending)
- ⏸ Phase 3 integration (next work item)

#### Phase B — ~2026-05-30 (when production token arrives)

Verified gates from 2026-05-15 work, sequenced:

1. **Gate #5 (replay against PROD token).** Probe the new token: one
   Company_Master call directly. If returns >500 rows in one call, full
   universe is queryable; collapse the orchestrator's bounded-retry loop
   to a single call per `MAX_MASTER_CALLS` reduction. If still returns
   ~10 rows, escalate to CMOTS sales — that's not a production token.
2. **Gate #1 (re-verify against PROD).** Celery `cmots.sync` end-to-end
   was green on dev 2026-05-15. Re-verify on PROD: short HTTP dispatch +
   observe `sync_state` transition to `running` within 10s + kill after
   ~30s. Just confirming the architecture works PROD-side; don't let it
   complete.
3. **Gate #2.** Apply migration 036 to PROD before §10 sync starts:
   `psql --single-transaction --set ON_ERROR_STOP=1 -d equityprodata
   -f migrations/036_cmots_financial_line_report_expand.sql`. Verify
   CHECK definition expanded to allow `pnl/bs/cf`.
3b. **HARD GATE — §6 description-preservation fix (added 2026-05-18).**
   The current `server/cmots_fundamentals_backfill.py` overwrites
   `stock_fundamentals.description` with NULL for every CMOTS-covered
   ticker (per §6 scalar map: *"description: CMOTS has no equivalent —
   leave NULL"*). On dev this regressed ITC (verified 2026-05-18: ITC's
   yfinance description was cleared by the 2026-05-15 trial sync).
   If §10 runs against PROD with the current code, **~3,000 ticker
   descriptions get cleared** on cutover. Same regression hits
   `forward_pe`, `peg_ratio`, `quick_ratio`, `float_shares` (all marked
   "CMOTS has no equivalent — leave NULL" in §6 scalar map).

   **Fix required before §10:** edit `server/cmots_fundamentals_backfill.py`
   to omit `description`, `forward_pe`, `peg_ratio`, `quick_ratio`,
   `float_shares` from the UPDATE SET clause when CMOTS has no
   replacement value. ~5-line change. After fix, these fields are
   preserved from whatever yfinance set previously; CMOTS-covered
   tickers keep their descriptions and the four scalar fields.

   **Symmetric with existing yfinance behavior:** yfinance writer's
   `skip_existing=True` preserves CMOTS-set fields on subsequent runs.
   This fix makes §6 backfill preserve yfinance-set fields it has no
   replacement for — the writers stop overwriting each other's
   irreplaceable data.

   **Verification after fix:** trial-sync a CMOTS-covered ticker with
   non-empty existing description; confirm post-sync the description is
   unchanged + `data_source='cmots'` flips correctly + the four scalar
   fields preserved. No backwards-compat shim needed for dev tickers
   already cleared on 2026-05-15 — they'll re-populate when PROD's §10
   re-sync runs with fixed code (per 2026-05-18 user-locked decision to
   not write a recovery script).
4. **§10 prep #2 — yfinance cron documentation.** Document host +
   schedule. Cron must NOT be paused during §10 sync (writers coexist;
   yfinance's `skip_existing` preserves CMOTS rows). Confirm with ops the
   cron is healthy + scheduled run times are visible. Operational task —
   no Claude action.
5. **§10 prep #4 — Fresh pre-sync PROD backup.** Take a fresh `pg_dump`
   within 24h before §10 sync. The 2026-05-15 dump
   (`pre_path1_restore_20260515T095008Z.dump`) will be ~2 weeks stale by
   then. Same flags + SHA-256 logged in `backups/backup_log.md`.
6. **§10 prep #5 — Frontend regression audit.** Grep frontend code for
   `forward_pe`, `description`, `website` usage on stock-detail components.
   Components that render these for ALL tickers without null-handling will
   show empty strings on covered tickers post-§10 (§6 maps these to NULL
   on covered tickers). Fix or accept-and-announce. See risk addendum
   below.
7. **Dispatch §10 sync** via canonical HTTP: `POST /v1/api/admin/cmots/sync`
   with X-Admin-Secret header. Production universe ~3,000 tickers; expect
   ~14h wall-clock. Time_limit raised to 18h on 2026-05-15.
8. **Post-sync smoke test.** Verify a sample of 5-10 high-traffic tickers
   (RELIANCE, HDFCBANK, TCS, INFY, SBIN, etc.) all flipped
   `has_cmots_data=TRUE`. Hard-reload stock detail page in browser;
   confirm CMOTS panels populate, no console errors, no `forward_pe`
   regressions visible.

#### Operational items (deadlines shifted to Phase B, not deleted)

- ✓ **Celery time_limit raised** (2026-05-15, done). 8h → 18h hard, 17.5h soft.
- ⏸ **yfinance cron documentation** — host + schedule. Operational task;
  deadline shifted to before Phase B kicks off (~2026-05-28).
- ⏸ **§0.5 off-host backup copy** — recommended for the 2026-05-13 and
  2026-05-15 dumps. Not blocking but worth doing before Phase B.

#### Filter-bypass option (NOT recommended unless production token slips)

If for any reason a trial-token PROD sync becomes necessary before
production token arrives:

- Verified 2026-05-16: **Company_Master endpoint ignores all filter
  parameters** on the trial token. Tested `?limit`, `?count`, `?rows`,
  `?size`, `?top`, `?sector`, `?SectorCode`, `?mcap_type`, `?cocodes` —
  all return the same 10-random-rows-per-call payload. Specialized
  `/CompanyMasterNIFTY50` / `/Nifty50` etc. variants return 404.
- Per-ticker CMOTS endpoints (e.g., `CompanyProfile/{co_code}`) DO accept
  explicit co_codes. A "targeted sync" mode bypassing Company_Master
  entirely — explicit co_code list → per-ticker fan-out — would let us
  force-cover specific high-traffic tickers (but only if their co_codes
  are already known from prior trial syncs; the 109-ticker dev set is the
  known-co_code list).
- Cost: bespoke orchestrator mode to build and maintain. Not worth doing
  unless the production token slips materially beyond ~2026-06-15.

#### Original §10 prep #5 (data-replacement risk review — 2026-05-15 addendum)

   The §6 plan assumed ``stock_fundamentals`` was empty on PROD ("the
   original yfinance backfill targeted a now-decommissioned DB"). That
   assumption is **wrong for PROD**. Verified 2026-05-15 against the
   restored dev DB (PROD-superset): all **3,137 rows are
   ``data_source='yfinance'``** with `last_updated` ranging from
   2026-02-18 to 2026-05-12. 2,510 rows (80%) have populated
   ``income_statement`` JSONBs; 1,065 (34%) have ``forward_pe``. PROD's
   nightly yfinance writer (per §10 cron coordination, location not yet
   documented) has been populating this table continuously.

   §10 CMOTS sync therefore **REPLACES live yfinance data** for covered
   tickers, not fills empty rows. Cutover risk profile is different:
   - Scalar shifts: yfinance's PE 19.31 may become CMOTS's PE 21.x, etc.
     Frontend renders the new value; no crash but the displayed numbers
     change.
   - **``forward_pe`` becomes NULL on covered tickers** (§6 scalar map:
     "CMOTS has no equivalent — leave NULL"). 34% of users currently see
     this field on tickers that will become covered. Visible regression.
   - ``description`` and ``website`` similarly NULL'd unless CMOTS
     ``Company_Profile.LNAME``/``INTERNET`` is present.
   - The yfinance writer's ``skip_existing=True`` default reads
     ``fetch_error IS NULL OR fetch_error=''`` — §6 backfill sets
     ``fetch_error=NULL`` on every CMOTS row, so the next yfinance run
     skips them. CMOTS data is preserved; coexistence verified.

   **Audit gate before §10 (Phase B step 6 above):** grep frontend
   components for ``forward_pe``, ``description``, ``website`` usage.
   Components that render these for ALL tickers without null-handling
   will show empty strings on covered tickers post-cutover. Either
   accept the regression and announce it, or stub the §6 mapping to
   leave these yfinance-set fields untouched on covered tickers.

#### Gate #4 — Path 1 dev-restore runbook reminder

Only relevant if planning another pre-§10 dev restore. After restoring
``equityprodata_sync_dev`` from a PROD dump, re-apply migration 033 to
dev (since 033 is dev-only until Phase B step 3 lands it on PROD).
Documented at the Path 1 section above.

---

## 2. Scale extrapolation for PROD cutover — Celery timeout + storage

**Trial-token sync (measured, against `equityprodata_sync_dev`,
2026-05-14):**

| Metric | Value |
| ------ | ----- |
| Wall clock | 32 min 11 s (1931 s) |
| Covered tickers | 130 raw → 115 after BSE-only filter |
| Total calls written | 14,550 (post-cleanup) |
| Raw payload rows | 183,245 → ~165k after Brand_Logo + BSE-only cleanup |
| Failure rate (post-cleanup) | 26.5%, all "data is not available" (legit) |

**PROD extrapolation at ~3,000 NSE-listed tickers:**

| Metric | Trial (115) | PROD (~3,000) | Multiplier |
| ------ | ----------: | ------------: | ---------: |
| Wall clock | 32 min | **~14 hours** | ~26× |
| Total calls | 14.5k | **~380k** | 26× |
| Raw payload rows | 165k | **~4.3M** | 26× |
| Disk (cmots_api_rows JSONB) | ~70 MB | **~1.8 GB** | 26× |
| Plus full HTML narratives (5 per ticker, up to 200 kB) | — | **~3 GB additional** | — |

**History depth correction (2026-05-14):** the schema doc's "5y / 20q"
claim is consistently understated by 2×.

- Annual P&L (`Profit_and_Loss_C`): observed **10 years** of `Y<YYYY>03`
  columns (Y201603 → Y202503). Schema doc said 5y.
- Quarterly P&L (`Quarterly_Results_C`): observed **40 quarters** of
  `Y<YYYYMM>` columns (Y201606 → Y202603). Schema doc said 20q.

Implication for storage: the `cmots_financial_line` row count per ticker
roughly doubles vs the original estimate. The PROD extrapolation above
(`~4.3M raw payload rows`) is unchanged because it was driven by the
already-observed trial sync row count, not the schema doc estimate — but
the normalized hot-path `cmots_financial_line` projection should be
revised once we know the per-ticker row count out of `normalize_financial_line`
in §5. Tentative re-estimate: **~6 M rows in `cmots_financial_line` at
full PROD coverage** vs the original ~3 M guess.

## Post-PROD-cutover evaluation

These items don't block the cutover — they're things to **measure after the
first PROD sync completes** and decide on once real query patterns surface.

-4. **§9 design note: annotate "annual progression" labels in
   shareholding/ratios panels (2026-05-15).** The yearly view's
   ``DISTINCT ON (yrc / 100)`` query produces period labels that reflect
   "latest snapshot per calendar year", NOT fiscal-year-end snapshots.
   For March-FY companies like RELIANCE this means yearly view shows
   ``Mar 2026, Dec 2025, Dec 2024, Dec 2023, ...`` (the partial current
   year takes the latest available quarter; completed years take Dec).
   For December-FY companies like ITC the labels align naturally.

   Values drift minimally quarter-to-quarter for shareholding
   (RELIANCE promoter % is 49.11% across all 5 displayed quarters), so
   the user-perceived impact is small. The §9 ``RatiosPanel`` and
   ``ShareholdingPattern`` panels could benefit from a one-line caption
   like ``"Annual progression (latest filing per calendar year)"`` so
   users understand the labels they're seeing aren't necessarily fiscal
   year-end snapshots. Not blocking — purely a UX clarification.

-3. **§8 shareholding endpoint: custodian_pct dropped from scraper-shape
   translation (2026-05-15).** The CMOTS `cmots_shareholding.custodian_pct`
   field (~1.8–3.6% for typical tickers like RELIANCE) is intentionally
   omitted from `get_shareholding_cmots_in_scraper_shape()` because the
   frontend's `CATEGORY_KEYS = ["Promoters","FIIs","DIIs","Public","Government"]`
   is hard-coded in `ShareholdingPattern.tsx`. Adding a 6th category
   requires §9 frontend work (new color, new line on the recharts
   `<LineChart>`) and shouldn't be preempted in §8.

   Data is preserved: `cmots_shareholding.custodian_pct` stays populated,
   `raw_json` JSONB carries the original CMOTS payload. Future §9
   enhancement can surface as a 6th category by extending `CATEGORY_KEYS`
   in `ShareholdingPattern.tsx` and adding the field to `data[]` /
   `chart_data[]` in `get_shareholding_cmots_in_scraper_shape()` —
   no re-sync needed. The ~2–4% missing from the visible total is
   acceptable v1 state (less dishonest than folding Custodian into Public,
   which is structurally distinct).

-1. **§7 `get_sector_medians` cold-path profiling (2026-05-15).** Each
   first-call per sector triggers a CTE with DISTINCT ON across
   `cmots_ratio_yearly` joined to `tickers` filtered by sector. Dev-scale
   cold-call observed at 5–10 seconds (integration test suite of 36 took
   891s — most of that was sector-medians warming). At PROD scale
   (~3,000 tickers × ~50 sectors) expect **10–30 sec per cold sector**.
   Acceptable for v1 because invalidation is once per day at sync-end —
   subsequent reads hit the process-wide in-memory cache. Profile if the
   first sector-comparison panel load surfaces as a user-perceived
   latency issue (browser network panel showing 10+ second response on
   `/api/sectors/{sector}/medians`).

   Two mitigations available without re-architecting:
   - Index optimization: `CREATE INDEX ix_tickers_sector_cmots ON tickers
     (sector) WHERE has_cmots_data = TRUE AND NOT cmots_disabled` — would
     turn the sector filter into an index scan instead of seq scan.
   - Sync-end warmup: after `invalidate_all_caches()`, iterate distinct
     sectors and call `get_sector_medians(sector)` on each. Trades sync
     duration (~30 sec × 50 sectors = 25 min added) for zero cold-path
     hits during the day. Only worth it if the cold-path latency
     materializes as a real complaint.

-2. **§7 `get_pros_cons` transitive dependency on `get_sector_medians`
   (2026-05-15).** Rule 9 (valuation vs sector PE) calls
   `get_sector_medians(ticker.sector)`. If sector-medians cache is cold,
   the first `get_pros_cons` call for a ticker has the sector-medians
   cold-path cost embedded. Same mitigation as above: sync-end warmup
   call per distinct sector pre-warms both caches in one pass. Currently
   sector-medians is cached process-wide in-memory, so subsequent
   `get_pros_cons` calls for tickers in the same sector hit the cache
   regardless of which ticker triggered the cold load.

0. **§6 backfill sync-window addition + per-ticker query profiling
   (2026-05-14).** End-to-end §6 run against 115 dev DB tickers:
   115/115 OK, 0 failures, **173.2s wall clock (~1.5s/ticker steady-state)**.
   The backfill now runs as Step 6 of ``cmots_sync.run_full_sync`` after
   the universe-wide normalize step. At PROD scale (~3,000 tickers) this
   adds **~75 min to the sync window** (existing raw fetch + normalize
   was 32 + 20 = 52 min; with backfill the total projects to ~2h).

   The 1.5s/ticker steady-state is **slower than expected** for what
   should be 5-10 SELECTs + 1 UPDATE against already-indexed hot-path
   tables. Likely candidates to profile after PROD cutover:
   - Multiple separate queries fetching each statement type when one
     query with a ``statement IN ('pnl','bs','cf','quarter')`` filter
     could cover all four annual statements in a single round-trip.
   - Unindexed scan of ``cmots_api_rows`` to find ``Daily_Ratios_C`` per
     ticker (the JOIN through ``cmots_api_calls`` may not be hitting
     a covering index).
   - JSONB assembly in Python loops instead of in SQL via
     ``jsonb_object_agg`` (a single GROUP-BY-period query could build
     the entire ``income_statement`` JSONB as one column).

   At 115 tickers the duration is workable. At 3,000 tickers, 75 min
   is workable but worth profiling: a single ``EXPLAIN ANALYZE`` on
   the hot-path SELECTs after the first PROD sync may reveal an obvious
   index gap. Don't pre-optimize — measure first, then fix if needed.

1. **`cmots_financial_line` row count + partitioning evaluation
   — revised UP again 2026-05-14 (post §5 end-to-end run).** The actual
   per-ticker melt yield is **~10,346 rows/ticker** (1,189,338 rows /
   115 covered tickers from the end-to-end dev-DB normalize). At ~3,000
   tickers full PROD, the table projects to **~31 M rows**, not the
   ~21 M estimate from the schema-doc-based count. This makes
   `cmots_financial_line` by far the **dominant CMOTS table by both row
   count and storage cost**.

   At ~250 bytes/row plus the `(co_code, statement, report, period)`
   index (~700 MB at 31 M rows), the table projects to **~8-10 GB** at
   full PROD coverage. PostgreSQL handles 31 M rows fine unpartitioned,
   but **after the first PROD sync** evaluate:
   - hash partition by `co_code` (e.g. 16 partitions) for per-ticker reads,
   - or list partition by `report` (7 partitions) if frontend queries skew
     heavily by source family,
   - or leave unpartitioned if observed query latency on the financials
     panel stays under ~100 ms.

   Don't act preemptively — partitioning a populated table is more
   expensive than partitioning before load, but partitioning the wrong
   axis is also expensive. Wait for the real query pattern from the
   `useStockDetail` / `FinancialTable` accessors.

2. **VACUUM / autovacuum tuning on `cmots_financial_line`.** At ~31 M rows
   it will be the **largest table in `equityprodata`** by a wide margin
   (currently `ltp_live` at ~413k rows / ~98 MB holds that spot). PG
   autovacuum defaults are tuned for OLTP, not bulk-loaded near-static
   tables — at 20% `autovacuum_vacuum_scale_factor`, analyze runs after
   ~6 M row changes, which is reasonable for daily sync cadence but
   worth confirming. After first PROD sync verify:
   - `pg_stat_user_tables.n_dead_tup` for `cmots_financial_line` stays low,
   - autoanalyze fires after the bulk load (planner stats are fresh),
   - the table's `relfrozenxid` advances on schedule (no anti-wraparound
     emergency).
   If autovacuum lags, tune `autovacuum_vacuum_scale_factor` /
   `autovacuum_analyze_scale_factor` on the table specifically.

3. **Storage projection recheck (revised 2026-05-14).** Combining the
   updated `cmots_financial_line` estimate with the earlier raw-cache +
   narrative-HTML projections:

   | Component | PROD estimate |
   | ------ | ----: |
   | `cmots_financial_line` (31 M rows + indexes) | ~8-10 GB |
   | `cmots_api_rows` (raw cache JSONB) | ~1.8 GB |
   | `cmots_narrative` (full HTML, 5 per ticker × 200 kB) | ~3 GB |
   | Other hot-path tables combined (ratios, shareholding, corp_action, etc.) | ~500 MB |
   | **Total CMOTS footprint at full PROD** | **~13-15 GB** |

   At 29 GB current DB size, this brings the post-cutover total to
   **~42-44 GB**. Not a problem on the current VM but worth flagging:
   - the equityprodata DB host needs at least **~15 GB free disk** to
     accommodate the first PROD sync,
   - WAL archive headroom should be sized for the bulk-insert window
     (single PROD sync writes ~10-12 GB of new data; estimate WAL volume
     at 1.5-2× that).

4. **Rating extraction recall — Phase 2 PDF scrape (2026-05-14).** The
   §5 dev-DB end-to-end run extracted **0 agency/rating pairs** from
   160 covered-ticker announcements. Direct payload probe of the
   universe-wide raw cache (3,262 announcements) shows the cause is
   structural, NOT a regex bug:

   - Real credit-rating announcements DO appear in the raw cache (e.g.
     `co_code=12197` memo = `"Credit Rating - ICRA Limited"`,
     `co_code=67917` memo = `"Reaffirmation of credit rating by CRISIL
     (credit Rating Agency)"`).
   - **None of them include the actual rating grade** (AA+, AAA, BBB,
     etc.) in the caption/memo text. CMOTS puts only the headline
     ("Credit Rating - {Agency}") in the text fields; the grade is in
     the linked PDF (`fileurl` field).
   - The §9.4 plan assumption — "grade within 200 chars of agency name
     in caption+memo" — doesn't match CMOTS's data delivery for this
     endpoint.

   The conservative regex (requires a grade token) correctly produces
   NULL for these rows. False negatives (real rating events with
   `rating IS NULL`) are not data loss — the announcement still appears
   in the timeline with the `fileurl` link.

   Phase 2 enhancement (post-v1, no §5 work): a background task that
   fetches `fileurl` PDFs for `caption ILIKE '%Credit Rating%'` rows,
   runs OCR / text extraction, and parses the grade. Estimate ~50-200
   such rows per quarter at full PROD coverage. Effort: medium (PDF
   fetching, OCR, text parsing, scheduling). Defer to Phase 2 once
   the v1 timeline / corp-action panel is live and users actually
   request the grade column.

   The existing audit query in TODO_CMOTS.md (post-cutover) catches
   the case where the regex misses an actually-text-embedded grade —
   that case stays in scope for a regex tweak.

## Earlier notes (chronological)

**§7 shareholding-percent sum doesn't equal 100 (2026-05-14).** The
schema doc §7 aggregate formulas don't cover every percentage column the
payload carries. NADR / NGDR (American/Global Depository Receipts at
non-custodian holders) sit outside the (promoter + fii + dii + govt +
custodian + public) sum. Concretely on the trial fixtures:

  - RELIANCE: sum = 98.2170 (1.78% gap, mostly in the NADR/NGDR space)
  - ITC: sum = 99.9752 (0.02% gap, near-perfect)
  - BAJAJHLDNG: sum = 100.0001 (floating point)

Not a normalizer bug — a documented limitation of the §7 aggregate
definitions. When ``cmots_accessor.get_shareholding()`` is written, note
in its docstring that percentages may not sum exactly to 100 and the
frontend's gauge/pie chart should compensate (renormalize the visible
slices, or show an "other" sliver, or accept the imperfect sum).

**PCUST + PGDR potential double-count (2026-05-14).** For RELIANCE,
`PCUST = PGDR = 1.783` (identical values). Three possibilities:
  (a) coincidental equality,
  (b) CMOTS double-stores the same datum in two columns,
  (c) hierarchical relationship where PCUST is a superset of PGDR.

Following the user-specified §7 formula `custodian_pct = PCUST + PGDR`
verbatim. If post-cutover reconciliation against a ticker's actual
public disclosure shows custodian/DR percentage ~2× what disclosures
report, the fix is one line in ``normalize_shareholding``: change
`_CUSTODIAN_FIELDS = ("PCUST", "PGDR")` to `("PCUST",)`. Tests pin the
current formula, so the change is gated on the test update.

**`normalize_corporate_actions` — date_field verification status
(2026-05-14, after dev-DB probe).** Of the 10 ticker-bound dispatch
entries, 8 have date_field values verified against real CMOTS payloads
captured during the trial sync; 2 remain unverified because the trial
sample had zero successful rows for those endpoints. The 4 universe-wide
(static) entries were also verified.

**Verified (8 ticker-bound + 4 static):**

| dispatch slug                  | action_type      | date_field             | verification |
| ------------------------------ | ---------------- | ---------------------- | ------------ |
| Dividend                       | dividend         | `divdate`              | 5 rows across 3 tickers |
| AGM                            | agm              | `gmdate`               | 3 rows across 3 tickers |
| Board_Meetings                 | board_meeting    | `bmdate`               | 15 rows across 3 tickers |
| Rights                         | rights           | `RightDate`            | 3 rows (probe) |
| Split_of_Face_Value            | split            | `splitdate`            | 1 row (probe) |
| EGM                            | egm              | `gmdate`               | 10 rows (probe) |
| Book_Closure                   | book_closure     | `bcfromdate`           | 47 rows (probe) |
| Merger_Demergers               | merger_demerger  | `merger_demerger_date` | 2 rows (probe) |
| OFS                            | ofs              | `offerstartdate`       | 10 rows (static call) |
| Change_Of_Name                 | change_of_name   | `srdt`                 | 26 rows (static call) |
| DeListed                       | delisted         | `FromDate`             | 65 rows (static call) |
| Forthcoming_Corporate_Actions  | forthcoming      | `exDate`               | 1,122 of 1,142 rows non-null (vs. `recorddate` non-null in only 61 rows; chose `exDate` to avoid 95% silent-skip rate) |

**Unverified (2, will run with documented guesses):**

| dispatch slug | date_field guess | basis | risk |
| ------------- | ---------------- | ----- | ---- |
| Bonus         | `recorddate`     | standard Indian corp-action field name | silent data loss if wrong |
| Buy_Back      | `recorddate`     | same | silent data loss if wrong |

Both produced 0 successful API rows across all 115 trial-covered tickers,
so no payload was inspectable.

## PROD cutover verification — audit query for unverified date_fields

After the first PROD sync that covers tickers known to have had a recent
Bonus or Buy_Back event, run this audit to detect silent data loss:

```sql
-- For each unverified corp-action endpoint, find tickers where the
-- raw cache HAS successful rows but cmots_corporate_action has ZERO
-- rows for the same (co_code, action_type). Mismatch = date_field guess
-- is wrong; the normalizer skipped every row.
WITH raw_hits AS (
  SELECT ac.co_code, e.slug, ac.row_count
    FROM cmots_api_calls ac
    JOIN cmots_endpoints e ON ac.endpoint_id = e.id
   WHERE e.slug IN ('Bonus', 'Buy_Back')
     AND ac.success = TRUE
     AND ac.row_count > 0
), hot_hits AS (
  SELECT co_code, action_type, count(*) AS n
    FROM cmots_corporate_action
   WHERE action_type IN ('bonus', 'buyback')
   GROUP BY co_code, action_type
)
SELECT r.slug, r.co_code, r.row_count AS raw_rows,
       coalesce(h.n, 0)                AS hot_rows,
       CASE WHEN r.row_count > 0 AND coalesce(h.n, 0) = 0
            THEN 'SILENT_LOSS — verify date_field'
            ELSE 'ok'
       END AS status
  FROM raw_hits r
  LEFT JOIN hot_hits h
    ON h.co_code = r.co_code
   AND h.action_type = CASE r.slug
       WHEN 'Bonus'    THEN 'bonus'
       WHEN 'Buy_Back' THEN 'buyback'
   END
 WHERE r.row_count > 0;
```

Any row returning `SILENT_LOSS` indicates the date_field guess for that
slug was wrong. Pull a sample payload from `cmots_api_rows` for the
affected co_code, identify the actual date field, update the dispatch
entry, re-run the normalizer. Same audit applies if more "unverified"
entries are added in future.

**Skipped corp-action aggregate endpoints (2026-05-14, revised twice).**
Originally 4 candidates → expanded to 5 (added Forthcoming) → shrunk back
to **4 truly-aggregate** after Forthcoming_Corporate_Actions probe
(2026-05-14): the URL has no `{co_code}` but each row carries its own
`co_code` (1,121 unique tickers across 1,142 rows), so it is routed as a
universe-wide corp action. Final skipped set:
`Month_Year_Wise_Count`, `Eventdatewisedetails`,
`corp_action_WKMonth_details`, `Eventdatewisecount`. These are pure
calendar/statistics rollups (event counts by date or week), not
per-ticker history.

The previously-skipped `OFS`, `Change_Of_Name`, `DeListed`, and
`Forthcoming_Corporate_Actions` were all re-added to dispatch — they
ARE per-ticker events (each row carries its own co_code) just delivered
via universe-wide endpoints. Their idempotency scope is `["source_slug"]`
(wipe-and-replace the whole feed each sync).

**Universe-wide replace robustness consideration (2026-05-14).** The 4
universe-wide corp-action endpoints (OFS, Change_Of_Name, DeListed,
Forthcoming_Corporate_Actions) and the 2 announcement endpoints
(BSE_Announcement, NSE_Announcement) use full-table replace per sync —
the normalizer DELETEs all rows for the source scope and re-inserts.
If the sync crashes between DELETE and INSERT, the feed is briefly
empty until the orchestrator restarts and re-syncs. For v1 this is
acceptable because:
  - The orchestrator commits after every endpoint, so re-running the
    sync restores state without re-running migrations or losing PK data.
  - The frontend gracefully renders "no data" for empty feeds, and
    universe-wide feeds turn over slowly (a delisting list rebuilt 30
    minutes late is not user-visible damage).
If mid-sync visibility becomes a UX issue at PROD scale (e.g. constant
intra-day re-syncs), consider transactional batch-replace: stage rows
in a temp table, then `BEGIN; DELETE …; INSERT … SELECT FROM tmp; COMMIT;`
inside a single transaction so consumers never see the empty interval.

**`normalize_announcements` rating-regex hardening (2026-05-14).** Plan
§9.4 specifies a credit-rating regex over `caption + memo`, with 200-char
agency-to-rating proximity. During unit-testing the regex `…|A[+-]?|B[+-]?
|C…` produced false positives in ordinary prose — bare "A" matched the
indefinite article ("A separate report"), bare "B"/"C" matched list
labels and abbreviations. **Bare single-letter A / B / C are now excluded
from the regex** — only `A+`, `A-`, `B+`, `B-` (with explicit modifiers)
plus the multi-letter scale (AAA, AA[+-]?, BBB[+-]?, BB[+-]?, CCC, CC, D)
match. The `D` (default-grade) is kept as a bare letter because it rarely
occurs as a standalone word in announcement prose. Trade-off: a
legitimately-rated bare "A" downgrade (rare in practice) under-reports
rather than producing a false positive. This is the right direction —
silent under-reporting is recoverable (rerun sync after dispatching a
hot-fix that loosens the regex with corroborating context like "rating",
"grade", "(A)"), while polluted data in `cmots_announcement.rating`
would need a one-time backfill. If post-PROD analytics show a recall
gap on bare-A ratings, the audit is: `SELECT count(*) FROM
cmots_announcement WHERE rating IS NULL AND (caption || ' ' || memo)
ILIKE '% rating %A %' AND (caption || ' ' || memo) ILIKE
ANY(ARRAY['%CRISIL%','%ICRA%','%CARE%','%India Ratings%',…]);` — count
of plausibly-missed bare-A extractions.

**Migration 033 — `cmots_financial_line.report` CHECK widened (2026-05-14)
— PROD cutover sequence.** Migration 032 originally constrained `report` to
`('quarter','year','half','nine')`. During §5 normalizer #2 design, this
turned out to be too narrow: P&L_{S,C}, Balance_Sheet_{S,C}, and
Cash_Flow_{S,C} (6 of the 14 wide-layout endpoints) need distinct PK slots
to avoid collisions with the result-family endpoints, and BS/CF data isn't
covered by `Yearly_Results`. Migration 033 widens the CHECK to allow
`('pnl','bs','cf','quarter','year','half','nine')` — 7 distinct values,
each source family has its own PK namespace.

**Applied to TEST DB (`equityprodata_sync_dev`) on 2026-05-14. Not yet
applied to PROD.**

**PROD cutover sequence (all four schema migrations + 036):** apply in
order before the first PROD CMOTS sync:

1. `033_cmots_tickers_extend.sql` — `tickers` + `stock_fundamentals` extensions
2. `034_cmots_raw_cache.sql` — `cmots_endpoints`, `cmots_api_calls`, `cmots_api_rows`, `cmots_sync_state`
3. `035_cmots_normalized.sql` — hot-path tables (`cmots_financial_line` etc.)
4. `036_cmots_financial_line_report_expand.sql` — widens the `report` CHECK

Skipping 036 would cause the §5 normalizer's UPSERTs for P&L/BS/CF to fail
with `cmots_financial_line_report_check` violations on PROD.

**Forward-looking period codes (2026-05-14):** CMOTS sometimes publishes
the *next* quarter's planned filing in period fields. Observed on
RELIANCE's shareholding (`YRC = 202603` recorded in May 2026 = upcoming
filing) and the quarterly P&L's tail column (`Y202603`). Consumers must
treat period codes as "most recently declared" rather than asserting
`period <= current_quarter`. Document this in
`cmots_accessor.get_shareholding()` and similar when written.

**Bank-coverage gap in §5 fixture set (2026-05-14):** the trial-token sync's
random 115-ticker draw happened to **include zero banks** (no HDFCBANK,
SBIN, ICICIBANK, AXISBANK, KOTAKBANK, etc., and no NBFCs categorised as
banks). Step (f) fixture export therefore uses BAJAJHLDNG (finance-sector
holding company, co_code 50) as a stand-in for the third diverse ticker
slot — RELIANCE + ITC + BAJAJHLDNG. **Bank-specific paths in §5
normalizers will be untested by fixtures** until the full-token sync
gives us a real bank. Specifically:

  - The CMOTS quirk §11.12 / §6.4 "RatiosReturn bank vs non-bank column
    set" branch (detect via column presence — `CASA`) — fixture set
    contains only non-bank shapes.
  - Liquidity_Ratios bank-specific columns (`Loans_to_Deposits`,
    `Cash_to_Deposits`, `Investment_toDeposits`, `CASA`) — same.

**Action:** when the full token arrives, add one real bank's fixtures
(HDFCBANK / SBIN / ICICIBANK preferred — co_codes 4987, 5418, 18341) and
write the bank-path normalizer tests then.

**Bank ratio normalizer unverified against real data (2026-05-14) — PROD
cutover checkpoint.** Trial token didn't cover any banks. The
``RatiosReturn`` bank-vs-non-bank branch (CMOTS quirk §11.8 / §6.4) will
be implemented in §5 based on schema documentation alone, with synthetic
mock tests but **no real-fixture coverage**. Bank-specific columns
(`CASA`, `Loans_to_Deposits`, `Cash_to_Deposits`,
`Investment_toDeposits`) are referenced in code without ever being
exercised against a CMOTS payload.

**PROD cutover gate:** the first PROD sync of a real bank (HDFCBANK
co_code 4987 preferred, or ICICIBANK 5418, or SBIN 18341) requires
**manual payload inspection** before the bank-branch output is trusted.
Specifically: pull the bank ticker's `RatiosReturn_*`,
`Liquidity_Ratios_*`, and `Yearly_Ratio_*` rows from the raw cache,
verify column presence, run the normalizers against them by hand, and
spot-check the resulting `cmots_ratio_yearly` / `cmots_ratio_quarterly`
rows for plausibility. Only after that manual gate passes does the
bank-path normalizer get treated as production-correct. Add this step
explicitly to the PROD cutover runbook when written.

**Process lesson — investigate count deltas that don't match predictions
(2026-05-14):** During Sector_Wise_Company cleanup, the predicted
`success=FALSE` delta was −115 (all 115 cleanup-deleted calls were assumed
to be failures, since CMOTS returned "data is not available" when we
probed `…/SectorWiseComp/476`). Observed delta was −96. The 19-row gap
turned out to be Sector_Wise_Company calls that returned `success=true`
with **semantically wrong data**: CMOTS interpreted small co_codes
(those numerically matching real 8-digit-zero-padded sector_codes — e.g.
co_code 6 hitting sector_code 00000006) as sector codes, returned the
*sector's* constituents, and our pipeline happily wrote those rows as
"successful" Company-Profile-of-co_code-6 responses. Pure shape checks
would have passed. Only the count-delta anomaly surfaced the bug.

**Rule:** any future cleanup or sync-counter inspection where observed ≠
predicted is to be investigated, not waved through as "close enough."
The cost of a 10-minute investigation is much lower than the cost of
silent data corruption propagating into normalizers and accessors.

**Sector_Wise_Company resolution (2026-05-14):** dropped from registry.
Live probes against
`https://jwttoken.cmots.com/RGXResearch/api/SectorWiseComp/...` showed:
- bare path -> HTTP 404
- with sector_code (e.g. `/00000001` for Agro Chemicals) -> success=true
  with 10-row sector-constituent list
- with co_code (the original broken classification, e.g. `/476` for
  RELIANCE) -> success=false, "data is not available"

The endpoint requires a sector_code, not a co_code. Sector membership is
already covered by `CompanyMaster.SectorCode` / `.SectorName`, so the
data is redundant. If sector constituents become a needed feature later,
re-add as `Sector_Wise_Company_By_Sector` with sector-code fan-out (one
call per sector, ~10 sectors per trial token / unknown count on full).
Registry total dropped 187 → **186** with this change.

### Implications

1. **Celery `time_limit=8*3600` will be exceeded.**
   - 14 h wall-clock > 8 h hard timeout in `celery_tasks.py::cmots_sync_task`.
   - Options:
     - Increase task `time_limit` to 18 h (loose upper bound).
     - **Better: ticker-level batching.** Split into N Celery sub-tasks of
       ~500 tickers each (~2.5 h per batch). Use a chord/group with a
       finalizer that re-aggregates `cmots_sync_state`. Each batch is
       independently resumable on failure.
   - The orchestrator already commits per-ticker, so resumability via
     `WHERE NOT EXISTS (SELECT 1 FROM cmots_api_calls WHERE ...)` is
     straightforward once batching exists.

2. **Storage.** Plan for ~5 GB total CMOTS footprint in `equityprodata`
   after a full sync:
   - ~1.8 GB raw JSONB in `cmots_api_rows`
   - ~3 GB extracted narrative HTML in `cmots_narrative.body_html` /
     `body_text` (§5 work)
   - ~200 MB normalized hot-path tables

3. **`cmots_api_rows` partitioning at 4M+ rows.** Consider a partition
   strategy before the first PROD sync:
   - Hash partition by `co_code` modulo N (e.g., 16 partitions). Keeps
     per-ticker reads on a small partition; PostgreSQL handles partition
     pruning automatically when queries filter on `co_code`.
   - Alternative: range partition by `api_call_id` (less useful for our
     access pattern — we almost always look up by `(endpoint, ticker)`).
   - Easier to implement before the table is loaded (currently empty in
     PROD) than after.

4. **Trial-token coverage scaled poorly with the §3 schema doc estimate.**
   The schema doc said "trial returns 10 random rows per call"; we
   observed 130 distinct tickers over 15 calls (~9 unique per call —
   matches the doc), but the universe sampled is small (~130 of an
   eventual 3,000+). Full-token sync will cover all tickers in one pass;
   the bounded-retry loop becomes unnecessary and a single
   `Company_Master` call should suffice. Worth simplifying that loop or
   keeping it as defense-in-depth.

### Decision needed before PROD

- [ ] Pick batching strategy (single long task vs N-batch chord).
- [ ] Apply `cmots_api_rows` partitioning migration (or accept unpartitioned).
- [ ] Decide whether to keep the Company_Master bounded-retry loop or
      collapse to a single call once on full token.

---

## Cross-cutting engineering hygiene (not §10-blocking)

Recorded 2026-05-18 from observations surfaced during the stock-detail
redesign. Not blocking §10 cutover — long-term codebase hygiene items.

### API percentage-vs-fraction contract — undocumented

`GET /api/stock-detail/{ticker}` returns most percentage-like fields as
**percentages already multiplied by 100** (e.g. `return_on_equity:
27.56`) but leaves `dividend_yield` as a **fraction** (0.0466). This
inconsistency has caused **two production-grade 100× bugs** to date:

1. **ProsConsPanel adapter (fixed in §9, 2026-05-15)** — uncovered-ticker
   fallback was multiplying percentages by 100 again, rendering "3000%"
   instead of "30%" on several derived pros/cons strings.
2. **StockDetail hero ROE/ROA cells (fixed Phase B, 2026-05-18)** —
   identical pattern. Fix surfaced via visual verification, not unit
   test (no unit test exists for the page's percentage formatting).

**Pattern:** the API contract isn't documented anywhere; each call site
infers the unit by guessing or by visual inspection. New consumers of
the same fields will hit the same bug. The bug is silent at compile
time and frequently silent at first visual inspection (a 30% value
renders as "3000%" — only noticeable when a trader actually reads it).

**Refactor candidate (deferred — not §10-blocking):**

1. **Document the contract.** In `client/src/lib/types.ts` next to the
   `StockDetail` / `Fundamentals` type definitions, add a JSDoc block:
   ```
   /**
    * @remarks
    * Percentage-field unit conventions returned by /api/stock-detail/{ticker}:
    *
    *   AS PERCENTAGE (already × 100, e.g. 27.56 means 27.56%):
    *     return_on_equity, return_on_assets, profit_margin,
    *     operating_margin, payout_ratio, revenue_growth, earnings_growth
    *
    *   AS FRACTION (e.g. 0.0466 means 4.66%):
    *     dividend_yield
    *
    *   AS RATIO (not a percentage):
    *     trailing_pe, forward_pe, price_to_book, price_to_sales,
    *     peg_ratio, debt_to_equity, current_ratio, quick_ratio
    */
   ```
2. **Standardize formatting helpers.** Replace `formatPct(value: number)`
   (which accepts either unit silently) with two explicit helpers in
   `client/src/lib/format.ts`:
   - `formatPercentFromPercent(v: number, decimals?): string` — for
     fields the API returns × 100 already; calls `.toFixed(decimals) + '%'`.
   - `formatPercentFromFraction(v: number, decimals?): string` — for
     fields the API returns as fraction; multiplies by 100 then formats.
   Call sites become self-documenting; the bug class becomes
   compile-time-impossible (or at least one-glance-obvious in review).
3. **Optional follow-on:** add a server-side normalization layer so the
   API returns ALL percentage-like fields in the same unit (fraction or
   percent — pick one). Most invasive but eliminates the inconsistency
   at the source. Requires coordinated change across yfinance writer +
   §6 CMOTS backfill + frontend.

Scope: estimate 1 day for items 1 + 2 (frontend-only); 2-3 days with
item 3 (backend coordination). Recommend doing items 1 + 2 in a
quiet week post-§10 cutover.

### Sankey backend refactor (post-§10)

**Recorded 2026-05-18 during Phase C Sankey wire-up.**

`server/sankey.py` currently does **live yfinance fetch on every Sankey
toggle** (`yf.Ticker(...).financials / .cashflow / .balance_sheet`). It
does NOT read from the `stock_fundamentals.{income_statement,
balance_sheet, cash_flow}` JSONBs that are already populated by:

- The yfinance nightly writer (for uncovered tickers, all 3,137 rows)
- §6 CMOTS backfill (for the 50/3,000 covered tickers post-trial /
  post-§10 production sync)

Cost of the current design:
- **1–2s latency** on every cold-cache Sankey expand (live API call)
- **Fragile to yfinance API changes** — yfinance has had multiple breaking
  changes per year over the last 5 years
- **Doesn't benefit from §6 CMOTS-sourced data** for covered tickers —
  Sankey shows yfinance data even when CMOTS data is richer
- **BSE-only ticker silent-fail** — Phase C Option A applies a hardcoded
  `.NS` suffix to bare symbols, which produces empty results for the 24
  BSE-only tickers (~0.76% of universe, list in TODO_CMOTS.md §1
  BSE-only listings). BSE tickers would need `.BO` suffix OR
  exchange-aware suffix logic. Skipped in Phase C because the silent-fail
  affects <1% of users; full fix lives in this refactor.

**Refactor scope:** rewrite `get_income_statement`, `get_cashflow_statement`,
`get_balance_sheet` to read from `stock_fundamentals` JSONBs via a
psycopg2 query. The JSONB key vocabulary (yfinance Title Case for
uncovered, CMOTS-conformed Title Case for covered post-§6) needs
mapping verification against the Sankey value-extraction logic — e.g.
`INCOME_ALIASES` already lists multiple possible labels per Sankey node;
the refactor extends those aliases to cover the JSONB key set produced
by both writers. Same `_resolve_columns` helper handles the matching.

**Effort:** half-day backend refactor. Cache TTL drops from 24h to 1h
(JSONBs refresh nightly via yfinance writer + per-sync via CMOTS) —
fresher data, less compute, no yfinance fragility.

**Trigger:** post-§10 when CMOTS data is broadly available, OR if Sankey
reliability becomes a user-visible complaint. Currently NOT
§10-blocking. Phase C Option A keeps Sankey functional for the 99%+
NSE universe via the `.NS` suffix helper (`_yf_symbol` in sankey.py).

### Two-helper formatter pattern is not pre-emptive abstraction

Note for the reviewer: this is NOT YAGNI. Two real bugs of the same
class have shipped to dev already; the third will hit production if the
codebase keeps growing without this discipline. The two-helper pattern
is the minimum scaffolding that makes the bug class impossible. Skip
the abstraction only if the team commits to writing a percentage-unit
unit test for every page that renders one of these fields.
