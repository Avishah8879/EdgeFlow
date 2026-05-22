"""CMOTS sync orchestrator — raw cache + hot-path normalize (§4 + §5).

Owns one ``httpx.AsyncClient``, the module-level semaphore (via fetch()),
and the per-ticker fan-out. Persists every fetch result to
``cmots_api_calls`` + ``cmots_api_rows``, then applies the normalizer
dispatch table to populate the hot-path tables in the same per-ticker
transaction.

Design contracts:

- DB writes from async use the *wrapper-function* pattern: a plain
  ``def _do(conn): with conn.cursor() ...`` function is handed to
  ``asyncio.to_thread`` so the ``with`` context-manager semantics survive.
- Two psycopg2 connections per run:
    - ``state_conn`` (autocommit) for ``cmots_sync_state`` so progress is
      visible to pollers without blocking on the work transaction.
    - ``work_conn`` (manual commit) for raw cache + hot-path writes;
      commits per-ticker so a mid-run crash leaves partial-but-consistent
      state (raw cache + matching hot-path rows for every ticker that
      completed; nothing for tickers still in progress).
- An ``asyncio.Lock`` serialises every threaded DB call so we never have
  two ``to_thread`` invocations touching ``work_conn`` simultaneously.
- ``Company_Master`` retry loop: max 15 calls, exit after 3 consecutive
  zero-new-ticker calls (per plan §2 step 2).
- Failed calls still write a row (``success=False, row_count=0,
  message=...``) so the UI can distinguish "not fetched" from "API said
  no data". The raw cache is authoritative; hot-path rows are derived.
- ``CMOTSTokenExpired`` halts the sync and marks state.status='error'.

Normalize integration (§5):

- After all ~125 ticker-bound endpoints fetch for a co_code, the rows are
  fanned out to ``NORMALIZER_DISPATCH``: each slug with a dispatch entry
  is normalized + UPSERT/REPLACE'd into its target table. Unmapped slugs
  are silently skipped (not every fetched endpoint is hot-path data).
- The fan-in normalizer ``normalize_company_extended`` is invoked inline
  after the dispatch loop (option (a) — no FAN_IN_DISPATCH table).
- Universe-wide normalizers (corp-action OFS/Change_Of_Name/DeListed/
  Forthcoming, announcements BSE/NSE) run AFTER all per-ticker syncs
  complete — announcements need ``covered_co_codes`` (resolved from
  ``has_cmots_data=TRUE``), and FK constraints on ``co_code`` require
  the tickers to be present.
- A single normalizer crash does NOT roll back the ticker's raw cache.
  It is logged and counted in ``cmots_sync_state.failed``; other slugs
  for the same ticker continue.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)


# ─── Normalize action routing ──────────────────────────────────────────────
#
# Tables whose natural identity is implicit (id-keyed BIGSERIAL with no UNIQUE
# constraint on a co_code+something pair) use DELETE-then-INSERT via
# ``replace_normalized_rows``. Everything else has a natural PK and uses
# ``upsert_normalized_rows``. The dispatch table's 4th element is treated as
# DELETE-scope-columns for replace tables, and conflict_keys for upsert tables.
_REPLACE_TABLES: frozenset[str] = frozenset({
    "cmots_narrative",
    "cmots_corporate_action",
    "cmots_announcement",
})


# ─── Tunables ───────────────────────────────────────────────────────────────

MAX_MASTER_CALLS = 15
ZERO_NEW_STREAK_THRESHOLD = 3
DEFAULT_CONNECT_TIMEOUT_SEC = 10.0


# ─── DB connection helpers ──────────────────────────────────────────────────


def _get_db_config() -> dict[str, Any]:
    return {
        "host": os.environ["DB_HOST"],
        "port": os.environ.get("DB_PORT", "5432"),
        "database": os.environ["DB_NAME"],
        "user": os.environ["DB_USER"],
        "password": os.environ["DB_PASSWORD"],
        "connect_timeout": int(os.environ.get("DB_CONNECT_TIMEOUT", "30")),
    }


def _open_conn(autocommit: bool = False):
    import psycopg2

    conn = psycopg2.connect(**_get_db_config())
    conn.autocommit = autocommit
    return conn


# ─── State updates (autocommit connection) ──────────────────────────────────


def _state_set_running(state_conn, total: int) -> None:
    with state_conn.cursor() as cur:
        cur.execute(
            """
            UPDATE cmots_sync_state SET
                status='running', total=%s, done=0, failed=0,
                current=NULL, started_at=NOW(), finished_at=NULL
             WHERE id=1
            """,
            (total,),
        )


def _state_set_progress(state_conn, *, done: int, failed: int, current: str | None) -> None:
    with state_conn.cursor() as cur:
        cur.execute(
            "UPDATE cmots_sync_state SET done=%s, failed=%s, current=%s WHERE id=1",
            (done, failed, current),
        )


def _state_set_done(state_conn, *, done: int, failed: int) -> None:
    with state_conn.cursor() as cur:
        cur.execute(
            """
            UPDATE cmots_sync_state SET
                status='done', done=%s, failed=%s, current=NULL, finished_at=NOW()
             WHERE id=1
            """,
            (done, failed),
        )


def _state_set_error(state_conn, message: str) -> None:
    with state_conn.cursor() as cur:
        cur.execute(
            """
            UPDATE cmots_sync_state SET
                status='error', current=%s, finished_at=NOW()
             WHERE id=1
            """,
            (message[:500],),
        )


# ─── Sync helpers (work connection) ─────────────────────────────────────────


def _format_url(template: str, co_code: int | None) -> str:
    """Substitute ``{co_code}`` with the integer. Returns template unchanged for static."""
    if "{co_code}" in template:
        if co_code is None:
            raise ValueError(f"co_code required for template {template!r}")
        return template.replace("{co_code}", str(co_code))
    return template


def _load_endpoint_id_map(cur_or_conn) -> dict[tuple[str, str], int]:
    """Accepts a cursor OR a connection. Uses RealDictCursor explicitly."""
    from psycopg2.extras import RealDictCursor

    if hasattr(cur_or_conn, "cursor"):
        # connection
        with cur_or_conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT id, section, slug FROM cmots_endpoints")
            return {(r["section"], r["slug"]): r["id"] for r in cur.fetchall()}
    # cursor — caller is responsible for using RealDictCursor
    cur_or_conn.execute("SELECT id, section, slug FROM cmots_endpoints")
    return {(r["section"], r["slug"]): r["id"] for r in cur_or_conn.fetchall()}


def _persist_api_call(
    conn,
    *,
    endpoint_id: int,
    co_code: int | None,
    success: bool,
    message: str,
    rows: list[dict],
) -> int:
    """UPSERT one (endpoint, co_code) call; wipe + reinsert its rows. Returns api_call_id."""
    from psycopg2.extras import Json, RealDictCursor, execute_values

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            INSERT INTO cmots_api_calls
                   (endpoint_id, co_code, called_at, success, message, row_count)
            VALUES (%s, %s, NOW(), %s, %s, %s)
            ON CONFLICT (endpoint_id, co_code) DO UPDATE SET
                called_at=EXCLUDED.called_at,
                success=EXCLUDED.success,
                message=EXCLUDED.message,
                row_count=EXCLUDED.row_count
            RETURNING id
            """,
            (endpoint_id, co_code, success, message[:1000] if message else None, len(rows)),
        )
        api_call_id = cur.fetchone()["id"]
        cur.execute("DELETE FROM cmots_api_rows WHERE api_call_id = %s", (api_call_id,))
        if rows:
            execute_values(
                cur,
                "INSERT INTO cmots_api_rows (api_call_id, row_index, payload_json) VALUES %s",
                [(api_call_id, i, Json(r)) for i, r in enumerate(rows)],
                page_size=max(len(rows) + 1, 256),
            )
    return api_call_id


def _upsert_ticker_from_master_row(conn, raw: dict) -> int | None:
    """UPSERT a tickers row from one CMOTS ``Company_Master`` payload row.

    Returns the resolved co_code on success, ``None`` if the row was skipped.
    A row is skipped if:
      - ``co_code`` is missing/invalid, OR
      - ``NSESymbol`` is empty/null. BSE-only listings are deliberately
        excluded until the schema gains a ``listing_exchange`` column and
        we promote them to first-class tickers — see ``TODO_CMOTS.md``.

    Matching order for non-skipped rows: co_code -> nse_symbol -> INSERT.
    """
    from server.cmots_client import coerce_co_code

    co_code = coerce_co_code(raw.get("co_code"))
    if co_code is None:
        return None

    nse_symbol = (raw.get("NSESymbol") or "").strip().upper() or None
    if not nse_symbol:
        # BSE-only listing — skip per TODO_CMOTS.md (no synthetic symbols).
        # The master loop pre-filters these, but keep the guard here so
        # callers from other contexts can't accidentally bypass the rule.
        return None

    bse_code = (raw.get("BSECode") or "").strip() or None
    name = (raw.get("CompanyName") or "").strip() or None
    short_name = (raw.get("CompanyShortName") or "").strip() or None
    isin = (raw.get("isin") or "").strip() or None
    mcap_type = (raw.get("mcaptype") or "").strip() or None
    sector_name = (raw.get("SectorName") or "").strip() or None
    industry_name = (raw.get("industryname") or "").strip() or None
    nse_listed = (raw.get("NSEListed") or "").strip().lower() == "yes"

    # Reject mcap_type values that don't match the CHECK constraint.
    if mcap_type not in (None, "Large Cap", "Mid Cap", "Small Cap"):
        mcap_type = None

    symbol = nse_symbol
    exchange = "NSE" if nse_listed else "BSE"

    from psycopg2.extras import RealDictCursor

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        # 1. Try match by co_code.
        cur.execute("SELECT id FROM tickers WHERE co_code = %s", (co_code,))
        existing = cur.fetchone()
        if existing:
            cur.execute(
                """
                UPDATE tickers SET
                    isin = COALESCE(%s, isin),
                    bse_code = COALESCE(%s, bse_code),
                    mcap_type = COALESCE(%s, mcap_type),
                    sector = COALESCE(%s, sector),
                    industry = COALESCE(%s, industry),
                    has_cmots_data = TRUE,
                    cmots_last_synced_at = NOW()
                 WHERE id = %s
                """,
                (isin, bse_code, mcap_type, sector_name, industry_name, existing["id"]),
            )
            return co_code

        # 2. Try match by symbol (NSESymbol uppercase or BSECode).
        if nse_symbol:
            cur.execute(
                "SELECT id FROM tickers WHERE UPPER(symbol) = %s",
                (nse_symbol,),
            )
            existing = cur.fetchone()
            if existing:
                cur.execute(
                    """
                    UPDATE tickers SET
                        co_code = %s,
                        isin = COALESCE(%s, isin),
                        bse_code = COALESCE(%s, bse_code),
                        mcap_type = COALESCE(%s, mcap_type),
                        sector = COALESCE(%s, sector),
                        industry = COALESCE(%s, industry),
                        has_cmots_data = TRUE,
                        cmots_last_synced_at = NOW()
                     WHERE id = %s
                    """,
                    (co_code, isin, bse_code, mcap_type, sector_name, industry_name, existing["id"]),
                )
                return co_code

        # 3. INSERT new row.
        cur.execute(
            """
            INSERT INTO tickers
                   (symbol, name, exchange, sector, industry,
                    co_code, isin, bse_code, mcap_type,
                    has_cmots_data, cmots_last_synced_at)
            VALUES (%s, %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    TRUE, NOW())
            """,
            (symbol, name or short_name, exchange, sector_name, industry_name,
             co_code, isin, bse_code, mcap_type),
        )
        return co_code


# ─── Master loop (bounded retry) ────────────────────────────────────────────


async def _load_company_master(
    *,
    http_client: httpx.AsyncClient,
    work_conn,
    db_lock: asyncio.Lock,
    master_url: str,
) -> list[int]:
    """Fetch ``Company_Master`` with bounded retry; UPSERT tickers; return covered co_codes."""
    from server.cmots_client import coerce_co_code, fetch

    seen: set[int] = set()
    skipped_bse_only = 0
    zero_streak = 0
    calls_used = 0

    for _ in range(MAX_MASTER_CALLS):
        success, message, rows = await fetch(master_url, client=http_client)
        calls_used += 1

        new_rows: list[dict] = []
        for raw in rows:
            cc = coerce_co_code(raw.get("co_code"))
            if cc is None or cc in seen:
                continue
            # Filter BSE-only listings (no NSE symbol) at intake. The upsert
            # function has a matching guard, but filtering here also keeps
            # the ticker out of `seen` (and therefore out of the per-ticker
            # endpoint sweep) so we don't end up with FK orphans.
            # See TODO_CMOTS.md for the planned schema extension.
            if not (raw.get("NSESymbol") or "").strip():
                skipped_bse_only += 1
                continue
            seen.add(cc)
            new_rows.append(raw)

        if not new_rows:
            zero_streak += 1
            logger.info(
                "Company_Master call #%d: 0 new tickers (streak=%d/%d, total covered=%d)",
                calls_used, zero_streak, ZERO_NEW_STREAK_THRESHOLD, len(seen),
            )
            if zero_streak >= ZERO_NEW_STREAK_THRESHOLD:
                break
            continue

        zero_streak = 0
        logger.info(
            "Company_Master call #%d: %d new tickers (total covered=%d)",
            calls_used, len(new_rows), len(seen),
        )

        async with db_lock:
            def _upsert_batch(conn=work_conn, batch=new_rows):
                for raw in batch:
                    _upsert_ticker_from_master_row(conn, raw)
                conn.commit()
            await asyncio.to_thread(_upsert_batch)

    logger.info(
        "Company_Master coverage = %d tickers after %d calls "
        "(skipped %d BSE-only; message=%r, success=%s)",
        len(seen), calls_used, skipped_bse_only, message, success,
    )
    return sorted(seen)


# ─── Per-endpoint fetch + persist ───────────────────────────────────────────


async def _sync_one_endpoint(
    *,
    http_client: httpx.AsyncClient,
    work_conn,
    db_lock: asyncio.Lock,
    endpoint_id: int,
    co_code: int | None,
    url: str,
) -> tuple[bool, list[dict]]:
    """Fetch one (endpoint, co_code) and persist.

    Returns ``(success, rows)``. The orchestrator keeps the rows in memory
    so the per-ticker normalize step can run without a raw-cache read-back
    (the rows are still persisted to ``cmots_api_rows`` as the audit trail).
    Failed fetches return ``(False, [])``.
    """
    from server.cmots_client import CMOTSError, CMOTSTokenExpired, fetch

    try:
        success, message, rows = await fetch(url, client=http_client)
    except CMOTSTokenExpired:
        # Propagate — sync orchestrator handles this at the top level.
        raise
    except CMOTSError as exc:
        success, message, rows = False, f"client error: {exc}", []
    except Exception as exc:  # noqa: BLE001
        # Defensive: never crash the whole sync on an unexpected client error.
        success, message, rows = False, f"unexpected {type(exc).__name__}: {exc}", []

    async with db_lock:
        def _persist(conn=work_conn, eid=endpoint_id, cc=co_code,
                     s=success, m=message, r=rows):
            _persist_api_call(
                conn, endpoint_id=eid, co_code=cc,
                success=s, message=m, rows=r,
            )
        await asyncio.to_thread(_persist)

    return success, rows


# ─── Normalize step (per-ticker + universe-wide) ────────────────────────────


def _apply_normalized_rows(
    cur,
    target_table: str,
    normalized_rows: list[dict],
    scope_or_conflict: list[str],
    *,
    co_code: int | None,
    dispatch_kwargs: dict,
) -> int:
    """Route normalized rows to the right helper based on target_table.

    For id-keyed tables (in ``_REPLACE_TABLES``) the 4th tuple element is
    treated as DELETE-scope-column-names; we build the scope dict by
    resolving each column to its value (``co_code`` from the orchestrator's
    current ticker, other columns from the dispatch kwargs).

    For natural-PK tables, the 4th element is treated as conflict_keys and
    handed to ``upsert_normalized_rows``.
    """
    from server.cmots_normalizers import (
        replace_normalized_rows, upsert_normalized_rows,
    )

    if target_table in _REPLACE_TABLES:
        scope: dict[str, Any] = {}
        for col in scope_or_conflict:
            if col == "co_code":
                if co_code is None:
                    raise ValueError(
                        f"co_code required for {target_table} scope but not "
                        "provided (universe-wide normalizer should have "
                        "scope=['source_slug'] or ['source'])"
                    )
                scope[col] = co_code
            elif col in dispatch_kwargs:
                scope[col] = dispatch_kwargs[col]
            else:
                raise ValueError(
                    f"can't resolve scope column {col!r} for {target_table}: "
                    f"not in dispatch kwargs {sorted(dispatch_kwargs)}"
                )
        return replace_normalized_rows(
            cur, target_table, normalized_rows, scope=scope,
        )

    return upsert_normalized_rows(
        cur, target_table, normalized_rows, conflict_keys=scope_or_conflict,
    )


def _call_normalizer(
    fn,
    rows: list[dict],
    dispatch_kwargs: dict,
    *,
    co_code: int | None = None,
    covered_co_codes: frozenset[int] | None = None,
) -> list[dict]:
    """Invoke a normalizer, injecting runtime kwargs only when the signature
    accepts them.

    Inspection-based dispatch (vs hardcoded ``if fn is normalize_X``) means
    a future normalizer that adopts the same kwarg pattern doesn't need an
    orchestrator change.

    Currently injected:
      - ``co_code``: required by ``normalize_financial_line`` and
        ``normalize_narratives``. Their wide-format payloads don't carry
        a per-row co_code (the URL was per-ticker), so the orchestrator
        must thread the current ticker through. (Other per-ticker
        normalizers like ``normalize_ratios`` read co_code from each row
        directly and don't need this injection.)
      - ``covered_co_codes``: passed only by ``normalize_announcements``
        to filter universe-wide rows to the sync'd ticker set.

    Dispatch kwargs always win on collision (in practice these never
    collide because the dispatch table doesn't carry runtime context).
    """
    call_kwargs = dict(dispatch_kwargs)
    sig_params = inspect.signature(fn).parameters
    if (
        co_code is not None
        and "co_code" in sig_params
        and "co_code" not in call_kwargs
    ):
        call_kwargs["co_code"] = co_code
    if (
        covered_co_codes is not None
        and "covered_co_codes" in sig_params
        and "covered_co_codes" not in call_kwargs
    ):
        call_kwargs["covered_co_codes"] = covered_co_codes
    return fn(rows, **call_kwargs)


def _run_per_ticker_normalizers(
    conn,
    co_code: int,
    rows_by_slug: dict[str, list[dict]],
) -> dict[str, str | None]:
    """Apply every per-ticker normalizer for a single co_code.

    Iterates ``NORMALIZER_DISPATCH``: each slug present in ``rows_by_slug``
    that has a dispatch entry is normalized + UPSERT'd. Unmapped slugs are
    skipped silently. Per-slug exceptions are caught and recorded so one
    broken normalizer can't cascade.

    Also runs the fan-in (``normalize_company_extended``) inline after the
    dispatch loop — option (a) per design discussion 2026-05-14, no
    FAN_IN_DISPATCH table.

    Returns ``{slug_or_marker: error_message_or_None}`` so the caller can
    track per-slug normalize failures separately from raw-fetch failures.
    """
    from server.cmots_normalizers import (
        NORMALIZER_DISPATCH,
        normalize_company_extended,
        upsert_normalized_rows,
    )

    results: dict[str, str | None] = {}

    with conn.cursor() as cur:
        sp_counter = 0
        for slug, rows in rows_by_slug.items():
            disp = NORMALIZER_DISPATCH.get(slug)
            if disp is None:
                # Slug fetched but not mapped to a normalizer (e.g. Company_Logo,
                # the 5 calendar/summary aggregates, IPO endpoints deferred to
                # a later phase). Raw cache is the only sink — that's fine.
                continue
            fn, kwargs, target_table, scope_or_conflict = disp
            sp_counter += 1
            sp_name = f"sp_n_{sp_counter}"
            cur.execute(f"SAVEPOINT {sp_name}")
            try:
                normalized = _call_normalizer(
                    fn, rows, kwargs, co_code=co_code, covered_co_codes=None,
                )
                _apply_normalized_rows(
                    cur, target_table, normalized, scope_or_conflict,
                    co_code=co_code, dispatch_kwargs=kwargs,
                )
                cur.execute(f"RELEASE SAVEPOINT {sp_name}")
                results[slug] = None
            except Exception as exc:  # noqa: BLE001
                # Roll back ONLY this slug's writes; other normalizers in
                # the same per-ticker transaction continue cleanly.
                cur.execute(f"ROLLBACK TO SAVEPOINT {sp_name}")
                cur.execute(f"RELEASE SAVEPOINT {sp_name}")
                logger.exception(
                    "Normalize failed for co_code=%d slug=%s: %s",
                    co_code, slug, exc,
                )
                results[slug] = f"{type(exc).__name__}: {exc}"

        # Fan-in: company_extended (option (a) — orchestrator-inline).
        sp_counter += 1
        sp_name = f"sp_n_{sp_counter}"
        cur.execute(f"SAVEPOINT {sp_name}")
        try:
            fanin_input = {
                src: rows_by_slug.get(src, [])
                for src in (
                    "Company_Profile", "Board_Of_Directors", "Bankers",
                    "Subsidiaries_JVs_Collaborations", "Locations",
                )
            }
            fanin_result = normalize_company_extended(fanin_input)
            if fanin_result is not None:
                upsert_normalized_rows(
                    cur, "cmots_company_extended",
                    [fanin_result], conflict_keys=["co_code"],
                )
            cur.execute(f"RELEASE SAVEPOINT {sp_name}")
            results["__company_extended__"] = None
        except Exception as exc:  # noqa: BLE001
            cur.execute(f"ROLLBACK TO SAVEPOINT {sp_name}")
            cur.execute(f"RELEASE SAVEPOINT {sp_name}")
            logger.exception(
                "Fan-in (company_extended) failed for co_code=%d: %s",
                co_code, exc,
            )
            results["__company_extended__"] = f"{type(exc).__name__}: {exc}"

    return results


def _run_static_normalizers(
    conn,
    static_rows_by_slug: dict[str, list[dict]],
    covered_co_codes: frozenset[int],
) -> dict[str, str | None]:
    """Apply universe-wide normalizers after per-ticker syncs complete.

    Routes through the same dispatch + helper machinery; injects
    ``covered_co_codes`` into normalizers that accept it (announcements).
    Per-slug exceptions are caught and recorded.

    Runs in a single transaction; the caller commits after this returns.
    """
    from server.cmots_normalizers import NORMALIZER_DISPATCH

    results: dict[str, str | None] = {}

    with conn.cursor() as cur:
        sp_counter = 0
        for slug, rows in static_rows_by_slug.items():
            disp = NORMALIZER_DISPATCH.get(slug)
            if disp is None:
                continue
            fn, kwargs, target_table, scope_or_conflict = disp
            sp_counter += 1
            sp_name = f"sp_s_{sp_counter}"
            cur.execute(f"SAVEPOINT {sp_name}")
            try:
                normalized = _call_normalizer(
                    fn, rows, kwargs, co_code=None,
                    covered_co_codes=covered_co_codes,
                )
                _apply_normalized_rows(
                    cur, target_table, normalized, scope_or_conflict,
                    co_code=None, dispatch_kwargs=kwargs,
                )
                cur.execute(f"RELEASE SAVEPOINT {sp_name}")
                results[slug] = None
            except Exception as exc:  # noqa: BLE001
                # Isolate per-slug failures so one bad feed doesn't poison
                # the whole universe-wide normalize batch.
                cur.execute(f"ROLLBACK TO SAVEPOINT {sp_name}")
                cur.execute(f"RELEASE SAVEPOINT {sp_name}")
                logger.exception(
                    "Static normalize failed slug=%s: %s", slug, exc,
                )
                results[slug] = f"{type(exc).__name__}: {exc}"

    return results


# ─── Main orchestrator ──────────────────────────────────────────────────────


async def sync_one_ticker(
    co_code: int,
    *,
    http_client: httpx.AsyncClient,
    work_conn,
    db_lock: asyncio.Lock,
    endpoint_id_map: dict[tuple[str, str], int],
    ticker_endpoints: list[dict],
    concurrency: int = 8,
) -> dict[str, Any]:
    """Fetch + normalize + commit one ticker. Extracted from ``run_full_sync``
    for direct testability.

    Workflow:
      1. Fan out the ~125 ticker-bound endpoints under ``asyncio.Semaphore``.
      2. Accumulate (slug, rows) in memory for every successful fetch.
      3. Run ``_run_per_ticker_normalizers`` against the in-memory rows
         (single threaded DB transaction; per-slug exceptions captured).
      4. Mark the ticker last-synced and commit.

    Returns a summary dict with per-step counters and the per-slug normalize
    result map.
    """
    sem_local = asyncio.Semaphore(concurrency)

    async def _one(ep_local: dict) -> tuple[str, bool, list[dict]]:
        async with sem_local:
            eid = endpoint_id_map[(ep_local["section"], ep_local["slug"])]
            url = _format_url(ep_local["url_template"], co_code)
            ok, rows = await _sync_one_endpoint(
                http_client=http_client, work_conn=work_conn,
                db_lock=db_lock,
                endpoint_id=eid, co_code=co_code, url=url,
            )
            return ep_local["slug"], ok, rows

    fetch_results = await asyncio.gather(
        *(_one(ep) for ep in ticker_endpoints), return_exceptions=False,
    )

    n_raw_ok = sum(1 for _, ok, _ in fetch_results if ok)
    n_raw_fail = len(fetch_results) - n_raw_ok

    rows_by_slug: dict[str, list[dict]] = {}
    for slug, ok, rows in fetch_results:
        if ok and rows:
            rows_by_slug[slug] = rows

    # Run normalizers + finalise + commit inside a single threaded section.
    async with db_lock:
        def _normalize_and_finalise(conn=work_conn, cc=co_code, rbs=rows_by_slug):
            norm_results = _run_per_ticker_normalizers(conn, cc, rbs)
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE tickers SET cmots_last_synced_at = NOW(), "
                    "has_cmots_data = TRUE WHERE co_code = %s",
                    (cc,),
                )
            conn.commit()
            return norm_results
        norm_results = await asyncio.to_thread(_normalize_and_finalise)

    n_norm_fail = sum(1 for v in norm_results.values() if v is not None)

    return {
        "co_code":            co_code,
        "raw_success":        n_raw_ok,
        "raw_failed":         n_raw_fail,
        "normalize_results":  norm_results,
        "normalize_failed":   n_norm_fail,
    }


async def run_full_sync() -> dict[str, Any]:
    """Top-level sync. Returns a summary dict with covered count, call counts, errors."""
    from server.cmots_endpoints import ENDPOINTS, seed_endpoints

    state_conn = _open_conn(autocommit=True)
    work_conn = _open_conn(autocommit=False)
    # Set RealDictCursor so the helpers can use row["id"] etc.
    from psycopg2.extras import RealDictCursor
    work_conn.cursor_factory = RealDictCursor
    state_conn.cursor_factory = RealDictCursor

    db_lock = asyncio.Lock()
    summary: dict[str, Any] = {
        "covered_tickers": 0,
        "static_calls_success": 0,
        "static_calls_failed": 0,
        "ticker_calls_success": 0,
        "ticker_calls_failed": 0,
        "normalize_failed": 0,
        "halted": False,
        "halt_reason": None,
    }

    try:
        # 1. Seed registry + load endpoint id map (one short transaction).
        with work_conn.cursor() as cur:
            seed_endpoints(cur)
            endpoint_id_map = _load_endpoint_id_map(cur)
        work_conn.commit()

        # Resolve Master.Company_Master URL.
        master_entry = next(
            e for e in ENDPOINTS
            if e["section"] == "Master" and e["slug"] == "Company_Master"
        )
        master_url = master_entry["url_template"]

        # Identify the ticker-bound and static endpoint lists.
        ticker_endpoints = [e for e in ENDPOINTS if e["is_ticker_bound"]]
        static_endpoints = [
            e for e in ENDPOINTS
            if not e["is_ticker_bound"] and e["slug"] != "Company_Master"
        ]

        # Initial state: we'll know total once master returns.
        _state_set_running(state_conn, total=len(static_endpoints))

        async with httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=DEFAULT_CONNECT_TIMEOUT_SEC)
        ) as http_client:
            # 2. Company_Master + ticker UPSERT.
            _state_set_progress(state_conn, done=0, failed=0, current="Company_Master")
            covered = await _load_company_master(
                http_client=http_client,
                work_conn=work_conn,
                db_lock=db_lock,
                master_url=master_url,
            )
            summary["covered_tickers"] = len(covered)
            covered_set: frozenset[int] = frozenset(covered)

            total_calls = len(static_endpoints) + len(covered) * len(ticker_endpoints)
            _state_set_running(state_conn, total=total_calls)
            done = 0
            failed = 0

            # 3. Static endpoint fetch. We accumulate rows in memory because
            # the universe-wide normalizers (universe-wide corp actions,
            # BSE/NSE announcements) must run AFTER per-ticker syncs complete:
            # announcements need ``covered_co_codes``, and the FK constraint
            # on cmots_announcement.co_code requires the per-ticker pass to
            # have flipped has_cmots_data=TRUE first.
            static_rows_by_slug: dict[str, list[dict]] = {}
            for ep in static_endpoints:
                eid = endpoint_id_map[(ep["section"], ep["slug"])]
                url = _format_url(ep["url_template"], None)
                _state_set_progress(state_conn, done=done, failed=failed,
                                    current=f"static: {ep['slug']}")
                ok, rows = await _sync_one_endpoint(
                    http_client=http_client, work_conn=work_conn, db_lock=db_lock,
                    endpoint_id=eid, co_code=None, url=url,
                )
                if ok:
                    done += 1
                    summary["static_calls_success"] += 1
                    if rows:
                        static_rows_by_slug[ep["slug"]] = rows
                else:
                    failed += 1
                    summary["static_calls_failed"] += 1

            # Commit static-endpoint raw-cache batch (universe-wide normalize
            # happens at step 5).
            async with db_lock:
                await asyncio.to_thread(work_conn.commit)

            # 4. Ticker-bound endpoints, per co_code: fetch + normalize + commit.
            for co_code in covered:
                _state_set_progress(state_conn, done=done, failed=failed,
                                    current=f"ticker: {co_code}")
                try:
                    ticker_summary = await sync_one_ticker(
                        co_code,
                        http_client=http_client,
                        work_conn=work_conn,
                        db_lock=db_lock,
                        endpoint_id_map=endpoint_id_map,
                        ticker_endpoints=ticker_endpoints,
                    )
                except Exception:
                    # Per-ticker rollback so a crash doesn't leave half-written rows.
                    async with db_lock:
                        await asyncio.to_thread(work_conn.rollback)
                    raise

                done += ticker_summary["raw_success"]
                failed += ticker_summary["raw_failed"]
                summary["ticker_calls_success"] += ticker_summary["raw_success"]
                summary["ticker_calls_failed"] += ticker_summary["raw_failed"]
                summary["normalize_failed"] += ticker_summary["normalize_failed"]

            # 5. Universe-wide normalize step. Runs after every per-ticker
            # sync so covered_co_codes is resolved (announcements need it)
            # and tickers have has_cmots_data=TRUE (FK target).
            _state_set_progress(state_conn, done=done, failed=failed,
                                current="universe-wide normalizers")
            async with db_lock:
                def _run_universe_norm(conn=work_conn, rbs=static_rows_by_slug,
                                       cs=covered_set):
                    norm_results = _run_static_normalizers(conn, rbs, cs)
                    conn.commit()
                    return norm_results
                static_norm_results = await asyncio.to_thread(_run_universe_norm)
            n_static_norm_fail = sum(
                1 for v in static_norm_results.values() if v is not None
            )
            summary["normalize_failed"] += n_static_norm_fail
            failed += n_static_norm_fail

            # 6. stock_fundamentals backfill (§6). Rebuilds the legacy
            # yfinance-shape JSONB columns + analytics scalars from the
            # hot-path tables so useStockDetail / FinancialTable /
            # StockScorecard render covered tickers without code changes.
            # Live-data columns (current_price, OHLC, 52w range, volume)
            # are NOT touched — owned by ltp_live / OHLC pipeline.
            # Per-ticker failures are logged but do NOT fail the sync.
            _state_set_progress(state_conn, done=done, failed=failed,
                                current="stock_fundamentals backfill")
            from server.cmots_fundamentals_backfill import backfill_covered_tickers
            async with db_lock:
                def _run_backfill(conn=work_conn):
                    result = backfill_covered_tickers(conn)
                    conn.commit()
                    return result
                try:
                    backfill_result = await asyncio.to_thread(_run_backfill)
                    summary["backfill_total"]   = backfill_result["total"]
                    summary["backfill_ok"]      = backfill_result["ok"]
                    summary["backfill_skipped"] = backfill_result["skipped"]
                    summary["backfill_failed"]  = backfill_result["failed"]
                    summary["backfill_elapsed_sec"] = backfill_result["elapsed_sec"]
                    failed += backfill_result["failed"]
                except Exception as exc:  # noqa: BLE001
                    # Backfill failure must NOT fail the sync (raw cache +
                    # hot-path are already committed). Log and continue.
                    logger.exception("stock_fundamentals backfill crashed: %s", exc)
                    summary["backfill_halted"] = f"{type(exc).__name__}: {exc}"
                    try:
                        async with db_lock:
                            await asyncio.to_thread(work_conn.rollback)
                    except Exception:  # noqa: BLE001
                        pass

            # 7. Cache invalidation (§7). Drop Redis-cached accessor results
            # AND the process-wide sector-medians cache so the next read
            # recomputes against the freshly-synced data. Failures here do
            # NOT fail the sync — caches just stay warm with stale data
            # until they TTL out (1h).
            try:
                from server.cmots_accessor import invalidate_all_caches
                n_keys = invalidate_all_caches()
                summary["cache_keys_invalidated"] = n_keys
                logger.info("CMOTS cache invalidated: %d Redis keys + sector medians", n_keys)
            except Exception as exc:  # noqa: BLE001
                logger.exception("Cache invalidation failed (non-fatal): %s", exc)
                summary["cache_invalidation_error"] = f"{type(exc).__name__}: {exc}"

            _state_set_done(state_conn, done=done, failed=failed)
            return summary

    except Exception as exc:  # noqa: BLE001
        summary["halted"] = True
        summary["halt_reason"] = f"{type(exc).__name__}: {exc}"
        try:
            _state_set_error(state_conn, summary["halt_reason"])
        except Exception:
            logger.exception("Failed to update cmots_sync_state on error")
        try:
            work_conn.rollback()
        except Exception:
            pass
        raise
    finally:
        try:
            work_conn.close()
        except Exception:
            pass
        try:
            state_conn.close()
        except Exception:
            pass


def run_full_sync_sync() -> dict[str, Any]:
    """Synchronous entrypoint — runs ``run_full_sync`` under ``asyncio.run``.

    For direct CLI invocation during development. The Celery task uses this
    same wrapping pattern.
    """
    return asyncio.run(run_full_sync())
