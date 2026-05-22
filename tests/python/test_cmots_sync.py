"""Tests for ``server/cmots_sync.py``.

Covers:
  - URL templating helper
  - Bounded ``Company_Master`` retry loop (max 15, exit after 3 zero-new streaks)
  - Ticker UPSERT from a Company_Master row (co_code match, symbol match, INSERT)
  - ``_persist_api_call`` writes the row + rows, idempotent on (endpoint_id, co_code)
  - Failed calls still write the row
  - ``_sync_one_endpoint`` catches CMOTSError and writes a failure row but
    propagates CMOTSTokenExpired

The orchestrator's end-to-end happy path is not tested here — that's the
live-API smoke run that follows §4. The unit tests target the parts that
can crash silently if a future change drifts them away from the design.
"""

from __future__ import annotations

import asyncio
from contextlib import contextmanager

import httpx
import pytest

from conftest import TEST_CO_CODE_RANGE_START
from server import cmots_client
from server.cmots_client import CMOTSError, CMOTSTokenExpired
from server.cmots_endpoints import ENDPOINTS, seed_endpoints
from server.cmots_sync import (
    _apply_normalized_rows,
    _call_normalizer,
    _format_url,
    _load_company_master,
    _load_endpoint_id_map,
    _persist_api_call,
    _REPLACE_TABLES,
    _run_per_ticker_normalizers,
    _run_static_normalizers,
    _sync_one_endpoint,
    _upsert_ticker_from_master_row,
)


# ─── _format_url ────────────────────────────────────────────────────────────


class TestFormatUrl:
    def test_replaces_placeholder(self):
        assert _format_url("http://x/{co_code}/y", 476) == "http://x/476/y"

    def test_no_placeholder_returns_unchanged(self):
        assert _format_url("http://x/static", None) == "http://x/static"
        assert _format_url("http://x/static", 476) == "http://x/static"

    def test_missing_co_code_raises(self):
        with pytest.raises(ValueError, match="co_code required"):
            _format_url("http://x/{co_code}/y", None)


# ─── Async helpers — stubbed fetch ──────────────────────────────────────────


@pytest.fixture(autouse=True)
def _set_token(monkeypatch):
    monkeypatch.setenv("CMOTS_TOKEN", "stub-token-for-tests")
    cmots_client._reset_sem_for_tests()
    yield
    cmots_client._reset_sem_for_tests()


@contextmanager
def _stub_master(call_responses):
    """Patches ``cmots_client.fetch`` to return successive responses.

    ``call_responses`` is a list of ``rows`` lists — each call to fetch() pops
    the next ``rows`` from the front and returns ``(True, "Sucessful", rows)``.
    When exhausted, returns the empty list (simulating "no more new tickers").
    """
    state = {"i": 0}

    async def stub(url, *, client=None):
        i = state["i"]
        state["i"] += 1
        if i < len(call_responses):
            return (True, "Sucessful", call_responses[i])
        return (True, "Sucessful", [])

    original = cmots_client.fetch
    cmots_client.fetch = stub
    # Also patch the reference held by cmots_sync (it does `from ... import fetch`
    # inside the function bodies, so the local re-import picks up the patch).
    try:
        yield state
    finally:
        cmots_client.fetch = original


@pytest.fixture
def _fake_conn_and_capture(monkeypatch):
    """Replace _upsert_ticker_from_master_row with a recorder; return (conn, captures).

    The fake conn's commit/rollback/cursor are no-ops, so the master loop's
    per-batch ``conn.commit()`` can't reach the real database. The recorder
    captures every row the loop would have UPSERTed, so we can assert against it.
    """
    from unittest.mock import MagicMock

    from server import cmots_sync

    captures: list[dict] = []

    def fake_upsert(conn, raw):
        captures.append(raw)
        from server.cmots_client import coerce_co_code
        return coerce_co_code(raw.get("co_code"))

    monkeypatch.setattr(cmots_sync, "_upsert_ticker_from_master_row", fake_upsert)

    fake_conn = MagicMock(name="fake_conn")
    return fake_conn, captures


@pytest.mark.asyncio
async def test_master_loop_exits_after_three_zero_new_streaks(_fake_conn_and_capture):
    """3 consecutive zero-new-ticker calls -> exit even if MAX_MASTER_CALLS not reached."""
    fake_conn, captures = _fake_conn_and_capture
    # First call returns 2 tickers, then 3 zero-new calls -> exit on call #4.
    responses = [
        [{"co_code": 476.0, "NSESymbol": "RELIANCE", "CompanyName": "Reliance"},
         {"co_code": 5400.0, "NSESymbol": "TCS", "CompanyName": "TCS"}],
        [],
        [],
        [],
        # Should NOT reach these.
        [{"co_code": 12345.0, "NSESymbol": "EXTRA", "CompanyName": "EXTRA"}],
    ]
    with _stub_master(responses) as state:
        async with httpx.AsyncClient() as client:
            covered = await _load_company_master(
                http_client=client, work_conn=fake_conn,
                db_lock=asyncio.Lock(),
                master_url="http://stub/CompanyMaster",
            )
    assert state["i"] == 4, f"expected exit after 4 calls, got {state['i']}"
    assert sorted(covered) == [476, 5400]
    # Upsert was called exactly twice (once per new ticker in call #1).
    assert len(captures) == 2


@pytest.mark.asyncio
async def test_master_loop_resets_streak_when_new_ticker_appears(_fake_conn_and_capture):
    """zero-new -> non-zero -> resets streak; total covered grows."""
    fake_conn, captures = _fake_conn_and_capture
    responses = [
        [{"co_code": 476.0, "NSESymbol": "RELIANCE", "CompanyName": "Reliance"}],
        [],  # streak=1
        [],  # streak=2
        [{"co_code": 5400.0, "NSESymbol": "TCS", "CompanyName": "TCS"}],  # resets
        [],  # streak=1
        [],  # streak=2
        [],  # streak=3 -> exit
    ]
    with _stub_master(responses) as state:
        async with httpx.AsyncClient() as client:
            covered = await _load_company_master(
                http_client=client, work_conn=fake_conn,
                db_lock=asyncio.Lock(),
                master_url="http://stub/CompanyMaster",
            )
    assert state["i"] == 7
    assert sorted(covered) == [476, 5400]
    assert len(captures) == 2


@pytest.mark.asyncio
async def test_master_loop_hard_caps_at_15_calls(_fake_conn_and_capture):
    """Even if every call has new tickers, stop at MAX_MASTER_CALLS=15."""
    fake_conn, captures = _fake_conn_and_capture
    responses = [[{"co_code": float(i), "NSESymbol": f"SYM{i}", "CompanyName": f"X{i}"}]
                 for i in range(990100, 990130)]  # 30 calls' worth, far from any real co_code

    with _stub_master(responses) as state:
        async with httpx.AsyncClient() as client:
            covered = await _load_company_master(
                http_client=client, work_conn=fake_conn,
                db_lock=asyncio.Lock(),
                master_url="http://stub/CompanyMaster",
            )
    assert state["i"] == 15
    assert len(covered) == 15
    assert len(captures) == 15


# ─── DB writes: _persist_api_call + _upsert_ticker (real DB, rolled back) ──


@pytest.mark.integration
def test_persist_api_call_happy_path(db_cursor):
    """Write a row + 3 payload rows; verify counts."""
    # Seed cmots_endpoints so we have a valid endpoint_id to reference.
    seed_endpoints(db_cursor)
    endpoint_id_map = _load_endpoint_id_map(db_cursor)
    eid = endpoint_id_map[("Master", "Company_Master")]

    rows = [{"a": 1}, {"a": 2, "b": "x"}, {"a": 3}]
    # _persist_api_call needs a connection (not cursor) — pull it from the
    # cursor's parent.
    conn = db_cursor.connection
    api_call_id = _persist_api_call(
        conn,
        endpoint_id=eid, co_code=None,
        success=True, message="Sucessful", rows=rows,
    )
    assert api_call_id > 0

    db_cursor.execute("SELECT * FROM cmots_api_calls WHERE id=%s", (api_call_id,))
    row = db_cursor.fetchone()
    assert row["success"] is True
    assert row["message"] == "Sucessful"
    assert row["row_count"] == 3
    assert row["co_code"] is None

    db_cursor.execute(
        "SELECT count(*) AS n FROM cmots_api_rows WHERE api_call_id=%s",
        (api_call_id,),
    )
    assert db_cursor.fetchone()["n"] == 3


@pytest.mark.integration
def test_persist_api_call_failed_writes_marker(db_cursor):
    """success=False with empty rows is still a written row."""
    seed_endpoints(db_cursor)
    eid = _load_endpoint_id_map(db_cursor)[("Master", "Company_Master")]
    conn = db_cursor.connection

    api_call_id = _persist_api_call(
        conn, endpoint_id=eid, co_code=None,
        success=False, message="API said no", rows=[],
    )
    db_cursor.execute("SELECT success, row_count FROM cmots_api_calls WHERE id=%s",
                      (api_call_id,))
    row = db_cursor.fetchone()
    assert row["success"] is False
    assert row["row_count"] == 0


@pytest.mark.integration
def test_persist_api_call_idempotent_on_endpoint_cocode(db_cursor):
    """Second persist for same (endpoint_id, co_code) overwrites prior rows."""
    seed_endpoints(db_cursor)
    eid = _load_endpoint_id_map(db_cursor)[("Master", "Company_Master")]
    conn = db_cursor.connection

    first_id = _persist_api_call(
        conn, endpoint_id=eid, co_code=None,
        success=True, message="first", rows=[{"k": 1}, {"k": 2}],
    )
    second_id = _persist_api_call(
        conn, endpoint_id=eid, co_code=None,
        success=True, message="second", rows=[{"k": 9}],
    )
    # Same row updated in place.
    assert first_id == second_id

    db_cursor.execute("SELECT message, row_count FROM cmots_api_calls WHERE id=%s",
                      (first_id,))
    row = db_cursor.fetchone()
    assert row["message"] == "second"
    assert row["row_count"] == 1

    # And the api_rows for that call were wiped + reinserted, not appended.
    db_cursor.execute(
        "SELECT count(*) AS n FROM cmots_api_rows WHERE api_call_id=%s",
        (first_id,),
    )
    assert db_cursor.fetchone()["n"] == 1


@pytest.mark.integration
def test_persist_api_call_per_ticker(db_cursor):
    """Distinct co_codes get distinct rows under the same endpoint_id.

    Uses co_codes (999998, 999999) that won't collide with anything the live
    sync writes — once the TEST DB has data from a run, hard-coded low
    co_codes (e.g. 476 RELIANCE) collide with the existing tickers' UNIQUE
    constraint and conflate the count assertion with pre-existing api_calls.
    """
    TEST_CC1 = TEST_CO_CODE_RANGE_START + 998   # 999998
    TEST_CC2 = TEST_CO_CODE_RANGE_START + 999   # 999999
    seed_endpoints(db_cursor)
    eid = _load_endpoint_id_map(db_cursor)[("Company Fundamentals", "Company_Profile")]
    conn = db_cursor.connection

    # We need real co_codes for the FK. Insert two tickers first.
    db_cursor.execute(
        "INSERT INTO tickers (symbol, name, exchange, co_code, has_cmots_data) "
        "VALUES (%s,%s,%s,%s,TRUE), (%s,%s,%s,%s,TRUE)",
        ("TEST_CC1_SYM", "Test 999998", "NSE", TEST_CC1,
         "TEST_CC2_SYM", "Test 999999", "NSE", TEST_CC2),
    )

    id1 = _persist_api_call(conn, endpoint_id=eid, co_code=TEST_CC1,
                            success=True, message="ok", rows=[{"x": 1}])
    id2 = _persist_api_call(conn, endpoint_id=eid, co_code=TEST_CC2,
                            success=True, message="ok", rows=[{"x": 2}])
    assert id1 != id2

    # Scope the count to our test co_codes — the TEST DB may have pre-existing
    # api_calls for the same endpoint_id from a prior sync run.
    db_cursor.execute(
        "SELECT count(*) AS n FROM cmots_api_calls "
        "WHERE endpoint_id=%s AND co_code IN (%s, %s)",
        (eid, TEST_CC1, TEST_CC2),
    )
    assert db_cursor.fetchone()["n"] == 2


# ─── _upsert_ticker_from_master_row ─────────────────────────────────────────


@pytest.mark.integration
def test_upsert_ticker_match_by_co_code(db_cursor):
    """Existing tickers row with matching co_code is UPDATEd, not duplicated."""
    CC = TEST_CO_CODE_RANGE_START + 1
    db_cursor.execute(
        "INSERT INTO tickers (symbol, name, exchange, co_code) "
        "VALUES (%s, 'Pre-existing', 'NSE', %s)",
        (f"PREEX{CC}", CC),
    )
    conn = db_cursor.connection

    cc = _upsert_ticker_from_master_row(conn, {
        "co_code": float(CC), "NSESymbol": f"PREEX{CC}", "CompanyName": "Pre-existing",
        "isin": "INE000A01001", "mcaptype": "Large Cap", "SectorName": "Energy",
        "industryname": "Oil & Gas", "NSEListed": "Yes",
    })
    assert cc == CC

    db_cursor.execute("SELECT count(*) AS n, max(isin) AS isin, max(mcap_type) AS mc, "
                      "bool_or(has_cmots_data) AS has FROM tickers WHERE co_code=%s",
                      (CC,))
    row = db_cursor.fetchone()
    assert row["n"] == 1
    assert row["isin"] == "INE000A01001"
    assert row["mc"] == "Large Cap"
    assert row["has"] is True


@pytest.mark.integration
def test_upsert_ticker_match_by_symbol_assigns_co_code(db_cursor):
    """Existing tickers row matching by symbol gets its co_code populated."""
    CC = TEST_CO_CODE_RANGE_START + 2
    SYM = f"TESTSYM{CC}"
    db_cursor.execute(
        "INSERT INTO tickers (symbol, name, exchange, co_code) "
        "VALUES (%s, 'TestSym', 'NSE', NULL)",
        (SYM,),
    )
    conn = db_cursor.connection
    _upsert_ticker_from_master_row(conn, {
        "co_code": float(CC), "NSESymbol": SYM, "CompanyName": "TestSym",
        "NSEListed": "Yes",
    })
    db_cursor.execute("SELECT co_code, has_cmots_data FROM tickers WHERE symbol=%s",
                      (SYM,))
    row = db_cursor.fetchone()
    assert row["co_code"] == CC
    assert row["has_cmots_data"] is True


@pytest.mark.integration
def test_upsert_ticker_insert_new(db_cursor):
    """No match anywhere -> new row inserted."""
    CC = TEST_CO_CODE_RANGE_START + 3
    SYM = f"NEWSYM{CC}"
    conn = db_cursor.connection
    cc = _upsert_ticker_from_master_row(conn, {
        "co_code": float(CC), "NSESymbol": SYM, "CompanyName": "Brand New",
        "NSEListed": "Yes", "mcaptype": "Small Cap",
    })
    assert cc == CC

    db_cursor.execute(
        "SELECT symbol, name, exchange, co_code, mcap_type, has_cmots_data "
        "FROM tickers WHERE co_code=%s",
        (CC,),
    )
    row = db_cursor.fetchone()
    assert row["symbol"] == SYM
    assert row["name"] == "Brand New"
    assert row["exchange"] == "NSE"
    assert row["mcap_type"] == "Small Cap"
    assert row["has_cmots_data"] is True


@pytest.mark.integration
def test_upsert_ticker_rejects_invalid_mcap_type(db_cursor):
    """Free-text mcap_type that doesn't match the CHECK constraint is dropped to NULL."""
    CC = TEST_CO_CODE_RANGE_START + 4
    SYM = f"ANYSYM{CC}"
    conn = db_cursor.connection
    _upsert_ticker_from_master_row(conn, {
        "co_code": float(CC), "NSESymbol": SYM, "CompanyName": "AnySym",
        "NSEListed": "Yes", "mcaptype": "Micro Cap",  # not in our CHECK
    })
    db_cursor.execute("SELECT mcap_type FROM tickers WHERE co_code=%s", (CC,))
    assert db_cursor.fetchone()["mcap_type"] is None


@pytest.mark.integration
def test_upsert_ticker_skips_rows_without_co_code(db_cursor):
    """A row with co_code=None is a no-op (returns None, no INSERT)."""
    conn = db_cursor.connection
    cc = _upsert_ticker_from_master_row(conn, {
        "co_code": None, "NSESymbol": "BADSYM", "CompanyName": "Bad",
    })
    assert cc is None
    db_cursor.execute("SELECT count(*) AS n FROM tickers WHERE symbol='BADSYM'")
    assert db_cursor.fetchone()["n"] == 0


# ─── _sync_one_endpoint error-handling ──────────────────────────────────────


@pytest.mark.integration
@pytest.mark.asyncio
async def test_sync_one_endpoint_writes_failure_row_on_cmots_error(db_cursor):
    """CMOTSError from fetch() -> failure row is still written."""
    seed_endpoints(db_cursor)
    eid = _load_endpoint_id_map(db_cursor)[("Master", "Company_Master")]
    conn = db_cursor.connection

    async def boom(*a, **kw):
        raise CMOTSError("simulated network exhaustion")

    original = cmots_client.fetch
    cmots_client.fetch = boom
    try:
        ok, rows = await _sync_one_endpoint(
            http_client=None, work_conn=conn, db_lock=asyncio.Lock(),
            endpoint_id=eid, co_code=None, url="http://stub/anything",
        )
    finally:
        cmots_client.fetch = original

    assert ok is False
    assert rows == []
    db_cursor.execute(
        "SELECT success, message FROM cmots_api_calls WHERE endpoint_id=%s",
        (eid,),
    )
    row = db_cursor.fetchone()
    assert row["success"] is False
    assert "simulated" in row["message"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_sync_one_endpoint_propagates_token_expired(db_cursor):
    """CMOTSTokenExpired bubbles up — no row written, no swallowing."""
    seed_endpoints(db_cursor)
    eid = _load_endpoint_id_map(db_cursor)[("Master", "Company_Master")]
    conn = db_cursor.connection

    async def boom(*a, **kw):
        raise CMOTSTokenExpired("simulated 401")

    original = cmots_client.fetch
    cmots_client.fetch = boom
    try:
        with pytest.raises(CMOTSTokenExpired):
            await _sync_one_endpoint(
                http_client=None, work_conn=conn, db_lock=asyncio.Lock(),
                endpoint_id=eid, co_code=None, url="http://stub/anything",
            )
    finally:
        cmots_client.fetch = original

    # Verify no row was written for this endpoint.
    db_cursor.execute(
        "SELECT count(*) AS n FROM cmots_api_calls WHERE endpoint_id=%s AND co_code IS NULL",
        (eid,),
    )
    assert db_cursor.fetchone()["n"] == 0


# ═══════════════════════════════════════════════════════════════════════════
# Normalize integration helpers (§5 → orchestrator)
# ═══════════════════════════════════════════════════════════════════════════


# ─── _REPLACE_TABLES set is the action-routing source-of-truth ────────────


def test_replace_tables_covers_id_keyed_tables_only():
    """Sanity-lock the set: any future hot-path table goes EITHER into
    _REPLACE_TABLES (id-keyed) or stays out (natural-PK with UPSERT). A
    table added to neither will route through upsert_normalized_rows with
    the dispatch entry's 4th element as conflict_keys.
    """
    assert _REPLACE_TABLES == frozenset({
        "cmots_narrative",
        "cmots_corporate_action",
        "cmots_announcement",
    })


# ─── _call_normalizer: covered_co_codes injection ─────────────────────────


def test_call_normalizer_injects_covered_co_codes_when_accepted():
    """Functions whose signature accepts ``covered_co_codes`` receive it;
    functions that don't, receive only the dispatch kwargs."""
    seen_kwargs: dict = {}

    def fn_accepts(rows, *, source, covered_co_codes=None):
        seen_kwargs["source"] = source
        seen_kwargs["covered_co_codes"] = covered_co_codes
        return []

    _call_normalizer(
        fn_accepts, rows=[], dispatch_kwargs={"source": "BSE"},
        covered_co_codes=frozenset({1, 2, 3}),
    )
    assert seen_kwargs["source"] == "BSE"
    assert seen_kwargs["covered_co_codes"] == frozenset({1, 2, 3})


def test_call_normalizer_skips_injection_when_not_accepted():
    """Normalizers without a ``covered_co_codes`` parameter must NOT
    receive the kwarg — would raise TypeError."""
    seen_kwargs: dict = {}

    def fn_rejects(rows, *, source_slug, action_type, date_field):
        seen_kwargs.update(
            source_slug=source_slug, action_type=action_type, date_field=date_field,
        )
        return []

    # Would crash with TypeError if covered_co_codes were unconditionally injected.
    _call_normalizer(
        fn_rejects, rows=[],
        dispatch_kwargs={
            "source_slug": "Dividend", "action_type": "dividend", "date_field": "divdate",
        },
        covered_co_codes=frozenset({1, 2, 3}),
    )
    assert "covered_co_codes" not in seen_kwargs


def test_call_normalizer_skips_injection_when_none():
    """Even if the signature accepts it, None means 'no filter applied'."""
    seen_kwargs: dict = {}

    def fn_accepts(rows, *, source, covered_co_codes=None):
        seen_kwargs["covered_co_codes"] = covered_co_codes
        return []

    _call_normalizer(
        fn_accepts, rows=[], dispatch_kwargs={"source": "BSE"},
        covered_co_codes=None,
    )
    # Default value preserved (None) — no injection at the orchestrator level.
    assert seen_kwargs["covered_co_codes"] is None


def test_call_normalizer_injects_co_code_for_wide_format_normalizers():
    """normalize_financial_line and normalize_narratives require co_code as
    a kwarg (their wide-format payloads don't carry per-row co_code). The
    orchestrator must inject it. Normalizers that don't accept co_code
    (ratios, corp_actions) must NOT receive it — would TypeError."""
    seen = {}

    def fn_needs_cocode(rows, *, co_code, statement):
        seen["co_code"]   = co_code
        seen["statement"] = statement
        return []

    _call_normalizer(
        fn_needs_cocode, rows=[],
        dispatch_kwargs={"statement": "C"},
        co_code=476,
    )
    assert seen["co_code"]   == 476
    assert seen["statement"] == "C"


def test_call_normalizer_skips_co_code_when_signature_rejects():
    """normalize_ratios takes statement+period_field but NOT co_code (it
    reads co_code from each input row). Orchestrator must NOT inject it."""
    seen_kwargs: dict = {}

    def fn_no_cocode(rows, *, statement, period_field):
        seen_kwargs["statement"]    = statement
        seen_kwargs["period_field"] = period_field
        return []

    # Would crash with unexpected-keyword if co_code were unconditionally injected.
    _call_normalizer(
        fn_no_cocode, rows=[],
        dispatch_kwargs={"statement": "C", "period_field": "yearend"},
        co_code=476,
    )
    assert "co_code" not in seen_kwargs


def test_call_normalizer_dispatch_kwargs_win_on_collision():
    """If a dispatch entry already provides co_code, the runtime injection
    must not override it. Defensive — currently no dispatch entry carries
    co_code, but the contract should be safe."""
    seen_kwargs: dict = {}

    def fn_needs_cocode(rows, *, co_code):
        seen_kwargs["co_code"] = co_code
        return []

    _call_normalizer(
        fn_needs_cocode, rows=[],
        dispatch_kwargs={"co_code": 999},  # static
        co_code=476,                        # runtime — should be ignored
    )
    assert seen_kwargs["co_code"] == 999


# ─── _apply_normalized_rows: action routing ───────────────────────────────


class _FakeCursor:
    """Minimal cursor stub recording (sql, params) tuples. Sufficient to
    verify the orchestrator routes through UPSERT vs REPLACE without a
    real DB connection."""

    def __init__(self):
        self.calls: list[tuple[str, list | tuple]] = []
        self._rowcount = 0

    def execute(self, sql, params=()):
        self.calls.append(("execute", sql, list(params) if params else []))
        self._rowcount = 1

    @property
    def rowcount(self):
        return self._rowcount


def test_apply_normalized_rows_routes_replace_table_to_delete_then_insert(monkeypatch):
    """Target in _REPLACE_TABLES -> replace_normalized_rows is called with
    a resolved scope dict (from co_code + dispatch kwargs)."""
    captured = {}

    def fake_replace(cur, table, rows, *, scope):
        captured["fn"] = "replace"
        captured["table"] = table
        captured["scope"] = scope
        return len(rows)

    def fake_upsert(cur, table, rows, *, conflict_keys):
        captured["fn"] = "upsert"
        captured["conflict_keys"] = conflict_keys
        return len(rows)

    monkeypatch.setattr("server.cmots_normalizers.replace_normalized_rows", fake_replace)
    monkeypatch.setattr("server.cmots_normalizers.upsert_normalized_rows", fake_upsert)

    cur = _FakeCursor()
    n = _apply_normalized_rows(
        cur, "cmots_corporate_action",
        [{"co_code": 476, "action_type": "dividend"}],
        ["co_code", "source_slug"],
        co_code=476,
        dispatch_kwargs={"source_slug": "Dividend", "action_type": "dividend",
                          "date_field": "divdate"},
    )
    assert n == 1
    assert captured["fn"] == "replace"
    assert captured["table"] == "cmots_corporate_action"
    assert captured["scope"] == {"co_code": 476, "source_slug": "Dividend"}


def test_apply_normalized_rows_routes_natural_pk_to_upsert(monkeypatch):
    """Target NOT in _REPLACE_TABLES -> upsert_normalized_rows is called
    with the 4th tuple element as conflict_keys."""
    captured = {}

    def fake_upsert(cur, table, rows, *, conflict_keys):
        captured["fn"] = "upsert"
        captured["table"] = table
        captured["conflict_keys"] = conflict_keys
        return len(rows)

    monkeypatch.setattr("server.cmots_normalizers.upsert_normalized_rows", fake_upsert)

    cur = _FakeCursor()
    n = _apply_normalized_rows(
        cur, "cmots_ratio_yearly",
        [{"co_code": 476, "statement": "C", "yearend": 202503}],
        ["co_code", "statement", "yearend"],
        co_code=476,
        dispatch_kwargs={"statement": "C", "period_field": "yearend"},
    )
    assert n == 1
    assert captured["fn"] == "upsert"
    assert captured["table"] == "cmots_ratio_yearly"
    assert captured["conflict_keys"] == ["co_code", "statement", "yearend"]


def test_apply_normalized_rows_universe_wide_no_co_code(monkeypatch):
    """Universe-wide scope (no 'co_code' in scope list) resolves entirely
    from dispatch kwargs. co_code=None must be acceptable."""
    captured = {}

    def fake_replace(cur, table, rows, *, scope):
        captured["scope"] = scope
        return len(rows)

    monkeypatch.setattr("server.cmots_normalizers.replace_normalized_rows", fake_replace)

    _apply_normalized_rows(
        _FakeCursor(), "cmots_announcement",
        [{"co_code": 476, "source": "BSE"}],
        ["source"],
        co_code=None,
        dispatch_kwargs={"source": "BSE"},
    )
    assert captured["scope"] == {"source": "BSE"}


def test_apply_normalized_rows_raises_when_co_code_missing_for_per_ticker_scope():
    """If the scope list mentions 'co_code' but co_code=None, raise rather
    than silently building a scope with None (would DELETE WHERE co_code IS NULL
    — wrong rows)."""
    cur = _FakeCursor()
    with pytest.raises(ValueError, match="co_code required"):
        _apply_normalized_rows(
            cur, "cmots_corporate_action",
            [{"co_code": 476}],
            ["co_code", "source_slug"],
            co_code=None,
            dispatch_kwargs={"source_slug": "Dividend"},
        )


def test_apply_normalized_rows_raises_when_scope_column_unresolvable():
    """Scope column not in dispatch kwargs and not == 'co_code' -> raise."""
    cur = _FakeCursor()
    with pytest.raises(ValueError, match="can't resolve scope column"):
        _apply_normalized_rows(
            cur, "cmots_announcement",
            [{"co_code": 476}],
            ["nonexistent_column"],
            co_code=476,
            dispatch_kwargs={"source": "BSE"},
        )


# ─── _run_per_ticker_normalizers: dispatch iteration + failure isolation ─


class _ConnStub:
    """Mock connection whose .cursor() returns a context-manager-wrapped
    fake cursor. Just enough for the orchestrator's normalize loop."""

    def __init__(self):
        self.cur = _FakeCursor()

    @contextmanager
    def cursor(self, **_):
        yield self.cur


def test_run_per_ticker_normalizers_skips_unmapped_slugs(monkeypatch):
    """Slugs not in NORMALIZER_DISPATCH are skipped silently (not every
    fetched endpoint maps to a hot-path table — Company_Logo, calendar
    aggregates, IPO endpoints, etc.)."""
    # Use a minimal dispatch with just one entry that we know about.
    monkeypatch.setattr(
        "server.cmots_normalizers.NORMALIZER_DISPATCH",
        {
            "Yearly_Ratio_C": (
                lambda rows, **k: [{"co_code": 476, "yearend": 202503}],
                {"statement": "C", "period_field": "yearend"},
                "cmots_ratio_yearly",
                ["co_code", "statement", "yearend"],
            ),
        },
    )
    # Bypass real upsert + fan-in.
    monkeypatch.setattr(
        "server.cmots_normalizers.upsert_normalized_rows",
        lambda *a, **k: 1,
    )
    monkeypatch.setattr(
        "server.cmots_normalizers.normalize_company_extended",
        lambda rbs: None,
    )

    conn = _ConnStub()
    results = _run_per_ticker_normalizers(
        conn, 476,
        {
            "Yearly_Ratio_C":  [{"x": 1}],   # mapped
            "Company_Logo":    [{"y": 1}],   # unmapped, must skip silently
            "Some_Future_Ep":  [{"z": 1}],   # unmapped, must skip silently
        },
    )
    # Only the mapped slug appears in results (plus the company_ext marker).
    assert "Yearly_Ratio_C" in results
    assert results["Yearly_Ratio_C"] is None
    assert "Company_Logo" not in results
    assert "Some_Future_Ep" not in results


def test_run_per_ticker_normalizers_failure_isolation(monkeypatch):
    """One broken normalizer must not block others. Failures are captured
    in the result dict; the loop continues."""
    def good_fn(rows, **k):
        return [{"co_code": 476}]

    def bad_fn(rows, **k):
        raise RuntimeError("simulated normalizer crash")

    monkeypatch.setattr(
        "server.cmots_normalizers.NORMALIZER_DISPATCH",
        {
            "Good_Slug": (good_fn, {}, "cmots_ratio_yearly", ["co_code"]),
            "Bad_Slug":  (bad_fn,  {}, "cmots_ratio_yearly", ["co_code"]),
            "Another_Good": (good_fn, {}, "cmots_ratio_yearly", ["co_code"]),
        },
    )
    monkeypatch.setattr(
        "server.cmots_normalizers.upsert_normalized_rows",
        lambda *a, **k: 1,
    )
    monkeypatch.setattr(
        "server.cmots_normalizers.normalize_company_extended",
        lambda rbs: None,
    )

    conn = _ConnStub()
    results = _run_per_ticker_normalizers(
        conn, 476,
        {"Good_Slug": [{}], "Bad_Slug": [{}], "Another_Good": [{}]},
    )
    assert results["Good_Slug"]    is None
    assert results["Another_Good"] is None
    assert results["Bad_Slug"]     is not None
    assert "simulated normalizer crash" in results["Bad_Slug"]


def test_run_per_ticker_normalizers_runs_fanin_after_dispatch(monkeypatch):
    """Fan-in (company_extended) is called inline after the dispatch loop
    with rows from the 5 source endpoints — even if some sources are absent."""
    monkeypatch.setattr(
        "server.cmots_normalizers.NORMALIZER_DISPATCH",
        {},  # no dispatch entries — fan-in is the only work
    )
    seen_fanin = {}

    def fake_fanin(rows_by_slug):
        seen_fanin["rows_by_slug"] = rows_by_slug
        return {"co_code": 476, "chairman": "Test Person"}

    upserts = []
    monkeypatch.setattr(
        "server.cmots_normalizers.normalize_company_extended",
        fake_fanin,
    )
    monkeypatch.setattr(
        "server.cmots_normalizers.upsert_normalized_rows",
        lambda cur, table, rows, *, conflict_keys: upserts.append((table, rows, conflict_keys)) or 1,
    )

    conn = _ConnStub()
    results = _run_per_ticker_normalizers(
        conn, 476,
        {
            "Company_Profile":     [{"CO_CODE": 476}],
            "Board_Of_Directors":  [{"slno": 1}],
            # Bankers, Subsidiaries, Locations absent — fanin gets [] for those.
        },
    )
    # Fan-in marker present.
    assert results["__company_extended__"] is None
    # Absent sources defaulted to [].
    assert seen_fanin["rows_by_slug"]["Company_Profile"]    == [{"CO_CODE": 476}]
    assert seen_fanin["rows_by_slug"]["Board_Of_Directors"] == [{"slno": 1}]
    assert seen_fanin["rows_by_slug"]["Bankers"]            == []
    assert seen_fanin["rows_by_slug"]["Subsidiaries_JVs_Collaborations"] == []
    assert seen_fanin["rows_by_slug"]["Locations"]          == []
    # UPSERT happened against cmots_company_extended.
    assert upserts == [
        ("cmots_company_extended",
         [{"co_code": 476, "chairman": "Test Person"}],
         ["co_code"]),
    ]


def test_run_per_ticker_normalizers_fanin_failure_isolation(monkeypatch):
    """Fan-in crash captured in results, doesn't propagate."""
    monkeypatch.setattr("server.cmots_normalizers.NORMALIZER_DISPATCH", {})
    monkeypatch.setattr(
        "server.cmots_normalizers.normalize_company_extended",
        lambda rbs: (_ for _ in ()).throw(RuntimeError("fanin crash")),
    )
    conn = _ConnStub()
    results = _run_per_ticker_normalizers(conn, 476, {})
    assert "fanin crash" in results["__company_extended__"]


# ─── _run_static_normalizers: covered_co_codes injection at universe scope ─


def test_run_static_normalizers_injects_covered_co_codes(monkeypatch):
    """Announcement-style normalizers receive covered_co_codes; corp-action-
    style normalizers do not (they don't accept the kwarg)."""
    seen = {"ann": None, "ofs": None}

    def fake_ann(rows, *, source, covered_co_codes=None):
        seen["ann"] = covered_co_codes
        return []

    def fake_ofs(rows, *, source_slug, action_type, date_field):
        seen["ofs"] = "called_without_covered_kwarg"
        return []

    monkeypatch.setattr(
        "server.cmots_normalizers.NORMALIZER_DISPATCH",
        {
            "BSE_Announcement": (
                fake_ann, {"source": "BSE"},
                "cmots_announcement", ["source"],
            ),
            "OFS": (
                fake_ofs,
                {"source_slug": "OFS", "action_type": "ofs", "date_field": "offerstartdate"},
                "cmots_corporate_action", ["source_slug"],
            ),
        },
    )
    monkeypatch.setattr(
        "server.cmots_normalizers.replace_normalized_rows",
        lambda *a, **k: 0,
    )

    conn = _ConnStub()
    covered = frozenset({1, 2, 3, 476})
    results = _run_static_normalizers(
        conn,
        {"BSE_Announcement": [{}], "OFS": [{}]},
        covered,
    )
    assert seen["ann"] == covered  # injected
    assert seen["ofs"] == "called_without_covered_kwarg"  # not injected
    assert results == {"BSE_Announcement": None, "OFS": None}


# ─── Savepoint isolation: per-slug failure doesn't poison transaction ─────


@pytest.mark.integration
def test_run_per_ticker_normalizers_savepoint_isolates_real_pg_errors(db_cursor, monkeypatch):
    """REAL psycopg2 transaction test (not a mock): one normalizer raises a
    PG error mid-loop, the SAVEPOINT machinery must roll back ONLY that
    slug's writes, and subsequent normalizers must continue to write
    successfully. Without savepoints this regression would surface as
    'current transaction is aborted, commands ignored' — the bug we hit
    in dev when first wiring §5 into the orchestrator (2026-05-14).
    """
    from server.cmots_sync import _run_per_ticker_normalizers

    test_cc = TEST_CO_CODE_RANGE_START + 50

    # FK target so the announcement write succeeds.
    db_cursor.execute(
        "INSERT INTO tickers (symbol, co_code) VALUES (%s, %s)",
        (f"_TEST_SP_{test_cc}", test_cc),
    )

    def fn_good(rows, *, source_slug, action_type, date_field):
        # Produces one valid row that should be inserted successfully.
        return [{
            "co_code": test_cc,
            "action_type": action_type,
            "action_date": __import__("datetime").date(2026, 5, 14),
            "payload": {"co_code": test_cc},
            "source_slug": source_slug,
        }]

    def fn_db_crash(rows, *, source_slug, action_type, date_field):
        # Produce a row that will trigger an FK error on insert (bad co_code).
        return [{
            "co_code": 99999999,  # not in tickers -> FK violation
            "action_type": action_type,
            "action_date": __import__("datetime").date(2026, 5, 14),
            "payload": {},
            "source_slug": source_slug,
        }]

    monkeypatch.setattr(
        "server.cmots_normalizers.NORMALIZER_DISPATCH",
        {
            "Good_Slug_A": (
                fn_good,
                {"source_slug": "Good_Slug_A", "action_type": "good_a", "date_field": "x"},
                "cmots_corporate_action", ["co_code", "source_slug"],
            ),
            "Bad_Slug": (
                fn_db_crash,
                {"source_slug": "Bad_Slug", "action_type": "bad", "date_field": "x"},
                "cmots_corporate_action", ["co_code", "source_slug"],
            ),
            "Good_Slug_B": (
                fn_good,
                {"source_slug": "Good_Slug_B", "action_type": "good_b", "date_field": "x"},
                "cmots_corporate_action", ["co_code", "source_slug"],
            ),
        },
    )

    # Suppress fan-in for this test (test focus is the dispatch loop).
    monkeypatch.setattr(
        "server.cmots_normalizers.normalize_company_extended",
        lambda rbs: None,
    )

    # _run_per_ticker_normalizers opens its own cursor on the connection.
    conn = db_cursor.connection

    results = _run_per_ticker_normalizers(
        conn, test_cc,
        {"Good_Slug_A": [{}], "Bad_Slug": [{}], "Good_Slug_B": [{}]},
    )

    # Good_Slug_A and Good_Slug_B succeeded.
    assert results["Good_Slug_A"] is None
    assert results["Good_Slug_B"] is None
    # Bad_Slug captured the FK error but did NOT poison the transaction.
    assert results["Bad_Slug"] is not None
    assert "foreign key" in results["Bad_Slug"].lower() or "FK" in results["Bad_Slug"]

    # Confirm both Good_Slug_* rows ARE persisted in the (still-open) txn.
    db_cursor.execute(
        "SELECT source_slug FROM cmots_corporate_action "
        "WHERE co_code = %s ORDER BY source_slug",
        (test_cc,),
    )
    persisted = [r["source_slug"] for r in db_cursor.fetchall()]
    assert persisted == ["Good_Slug_A", "Good_Slug_B"], (
        "savepoint failed: either Bad_Slug poisoned the transaction (good "
        "rows missing) or Bad_Slug's row leaked through (extra rows present)"
    )


# ═══════════════════════════════════════════════════════════════════════════
# Per-ticker integration: sync_one_ticker against the dev DB
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.integration
def test_sync_one_ticker_populates_hot_path_tables_and_is_idempotent(db_cursor):
    """Drive ``sync_one_ticker`` directly with a stubbed HTTP fetch that
    returns the recorded raw cache for one ticker (RELIANCE / co_code=476).

    Verifies every hot-path table has rows after the sync, and that a
    re-run produces identical counts (idempotent UPSERT / REPLACE).
    """
    import asyncio as _asyncio
    from server import cmots_client
    from server.cmots_endpoints import ENDPOINTS
    from server.cmots_sync import sync_one_ticker, _load_endpoint_id_map

    co_code = 476  # RELIANCE — known to be synced in the dev DB

    # Use the existing dev-DB raw cache as the fetch source so we don't
    # need a live CMOTS token. The fetch stub looks up the slug from the
    # URL and returns the saved payload_json rows.
    db_cursor.execute(
        """
        SELECT e.slug, c.success, c.message, c.row_count, e.url_template
          FROM cmots_api_calls c JOIN cmots_endpoints e ON e.id = c.endpoint_id
         WHERE c.co_code = %s
        """,
        (co_code,),
    )
    call_rows = {r["slug"]: dict(r) for r in db_cursor.fetchall()}

    # Build URL -> rows map from the recorded raw cache.
    url_to_payload: dict[str, tuple[bool, str, list[dict]]] = {}
    db_cursor.execute(
        """
        SELECT e.slug, e.url_template, c.success, c.message, r.payload_json
          FROM cmots_api_rows r
          JOIN cmots_api_calls c ON c.id = r.api_call_id
          JOIN cmots_endpoints e ON e.id = c.endpoint_id
         WHERE c.co_code = %s
         ORDER BY r.row_index ASC
        """,
        (co_code,),
    )
    payload_by_slug: dict[str, list[dict]] = {}
    for r in db_cursor.fetchall():
        payload_by_slug.setdefault(r["slug"], []).append(r["payload_json"])

    for slug, meta in call_rows.items():
        url = meta["url_template"].replace("{co_code}", str(co_code))
        url_to_payload[url] = (
            meta["success"], meta["message"] or "",
            payload_by_slug.get(slug, []),
        )

    original_fetch = cmots_client.fetch

    async def stub_fetch(url, *, client=None):
        if url in url_to_payload:
            return url_to_payload[url]
        return (False, "stub: url not in fixture map", [])

    cmots_client.fetch = stub_fetch  # type: ignore[assignment]

    # Use the integration db_cursor's connection for the sync's work_conn
    # so writes happen inside the rolled-back transaction. Wrap in a proxy
    # that no-ops .commit() — otherwise the orchestrator's per-ticker
    # commit would leak rows past the fixture's teardown rollback.
    class _NoCommitProxy:
        def __init__(self, conn):
            self._conn = conn

        def __getattr__(self, name):
            return getattr(self._conn, name)

        def commit(self):
            pass  # rely on fixture rollback at teardown

    work_conn = _NoCommitProxy(db_cursor.connection)

    try:
        ticker_endpoints = [e for e in ENDPOINTS if e["is_ticker_bound"]]
        endpoint_id_map = _load_endpoint_id_map(work_conn)

        async def _run_once():
            async with httpx.AsyncClient() as client:
                return await sync_one_ticker(
                    co_code,
                    http_client=client,
                    work_conn=work_conn,
                    db_lock=_asyncio.Lock(),
                    endpoint_id_map=endpoint_id_map,
                    ticker_endpoints=ticker_endpoints,
                    concurrency=4,
                )

        first = _asyncio.run(_run_once())
    finally:
        cmots_client.fetch = original_fetch  # type: ignore[assignment]

    # Sanity: at least some endpoints succeeded against the stub.
    assert first["raw_success"] > 0
    # Per-slug normalize failures should be zero (real recorded payloads).
    assert first["normalize_failed"] == 0, (
        f"normalize failures: {[k for k, v in first['normalize_results'].items() if v]}"
    )

    # Hot-path tables now have rows for this co_code.
    expected_present_tables = (
        "cmots_financial_line",
        "cmots_ratio_yearly",
        "cmots_shareholding",
        "cmots_corporate_action",
        "cmots_narrative",
        "cmots_company_extended",
    )
    counts_first: dict[str, int] = {}
    for tbl in expected_present_tables:
        db_cursor.execute(
            f"SELECT count(*) AS n FROM {tbl} WHERE co_code = %s", (co_code,),
        )
        counts_first[tbl] = db_cursor.fetchone()["n"]
    for tbl, n in counts_first.items():
        assert n > 0, f"hot-path table {tbl} has 0 rows for co_code={co_code}"

    # Spot-check the fan-in row.
    db_cursor.execute(
        "SELECT chairman FROM cmots_company_extended WHERE co_code = %s", (co_code,),
    )
    assert db_cursor.fetchone()["chairman"] == "Mukesh D Ambani"

    # Re-run the sync — counts must be identical (idempotent UPSERT/REPLACE).
    cmots_client.fetch = stub_fetch  # type: ignore[assignment]
    try:
        second = _asyncio.run(_run_once())
    finally:
        cmots_client.fetch = original_fetch  # type: ignore[assignment]
    assert second["raw_success"] == first["raw_success"]
    assert second["normalize_failed"] == 0

    counts_second = {}
    for tbl in expected_present_tables:
        db_cursor.execute(
            f"SELECT count(*) AS n FROM {tbl} WHERE co_code = %s", (co_code,),
        )
        counts_second[tbl] = db_cursor.fetchone()["n"]
    assert counts_second == counts_first, (
        f"re-run changed counts: first={counts_first}, second={counts_second}"
    )
