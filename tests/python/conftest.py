"""Shared pytest fixtures.

Test-isolation convention
-------------------------

Tests are partitioned into two tiers:

  - **Unit tests (default)**: no DB access. Pure logic, mocks, stubs.
    Run with bare ``pytest``.
  - **Integration tests**: marked ``@pytest.mark.integration``. They use the
    ``db_cursor`` fixture (rolled-back transaction) against a **separate
    test database**, configured via ``TEST_DB_*`` env vars. Skipped by default
    in ``pytest.ini`` via ``addopts = -m "not integration"``. Run explicitly
    with ``pytest -m integration``.

Two hard-fail safety guards reject any configuration where the test DB could
inadvertently coincide with the production DB:

  - **Guard A**: ``TEST_DB_NAME`` must be set AND must differ from ``DB_NAME``.
    Catches "forgot to point tests at the dev DB".
  - **Guard B**: if ``TEST_DB_HOST`` equals ``DB_HOST``, ``TEST_DB_NAME`` must
    still differ from ``DB_NAME``. Logically redundant with A, but kept as a
    separate check with its own error message so a developer who hits it
    understands they used the same host accidentally.

If either guard trips, the fixture raises ``RuntimeError`` rather than
``skip()`` — failing loud is the point.

This conftest also auto-loads ``EdgeFlow/.env`` once per session so all
``*_DB_*`` env vars are present in ``os.environ``.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest


# Reserved co_code range for synthetic test fixtures.
# Real CMOTS co_codes are 1..6 digits; use 999000+ for any test that writes
# to the integration DB to avoid collisions with synced data. Convention:
# pick a stable offset per test (e.g. TEST_CO_CODE_RANGE_START + 1) so two
# tests with overlapping transactions don't fight each other.
TEST_CO_CODE_RANGE_START = 999000


@pytest.fixture(scope="session", autouse=True)
def _load_dotenv() -> None:
    """Load EdgeFlow/.env once per test session (no python-dotenv dependency)."""
    env_path = Path(__file__).resolve().parents[2] / ".env.development"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _enforce_test_db_safety_guards() -> None:
    """Raise RuntimeError if the configured test DB could collide with prod.

    Called from the ``db_cursor`` fixture before any connection is opened.
    """
    test_host = os.environ.get("TEST_DB_HOST")
    test_name = os.environ.get("TEST_DB_NAME")
    prod_host = os.environ.get("DB_HOST")
    prod_name = os.environ.get("DB_NAME")

    if not test_name:
        raise RuntimeError(
            "Integration tests require TEST_DB_NAME to be set in the environment. "
            "Add TEST_DB_HOST / TEST_DB_PORT / TEST_DB_NAME / TEST_DB_USER / "
            "TEST_DB_PASSWORD to EdgeFlow/.env, pointing at a non-production "
            "database. See .env.example for the template."
        )

    # Guard A: TEST_DB_NAME must not equal DB_NAME (regardless of host).
    if prod_name is not None and test_name == prod_name:
        raise RuntimeError(
            "SAFETY GUARD A TRIPPED:\n"
            f"  TEST_DB_NAME = {test_name!r}\n"
            f"  DB_NAME      = {prod_name!r}\n"
            "Tests must run against a database whose name differs from "
            "production. Change TEST_DB_NAME to point at the dev database "
            "(e.g. equityprodata_sync_dev)."
        )

    # Guard B: if hosts coincide, names must differ. (Subsumed by A logically;
    # restated with its own error message for clarity when a dev sees it.)
    if (
        prod_host is not None
        and test_host == prod_host
        and prod_name is not None
        and test_name == prod_name
    ):
        raise RuntimeError(
            "SAFETY GUARD B TRIPPED:\n"
            f"  TEST_DB_HOST = {test_host!r}\n"
            f"  DB_HOST      = {prod_host!r}\n"
            f"  TEST_DB_NAME = {test_name!r}\n"
            f"  DB_NAME      = {prod_name!r}\n"
            "Same host AND same database — the test DB would BE the prod DB. "
            "If you intend to use the same host, change TEST_DB_NAME to a "
            "dedicated test database."
        )


@pytest.fixture
def db_cursor():
    """psycopg2 cursor against the **test** DB, inside a rolled-back transaction.

    Reads ``TEST_DB_*`` env vars exclusively — never the production ``DB_*``.
    Applies two hard-fail safety guards before opening the connection.

    Skips (rather than fails) if psycopg2 is unavailable in this environment;
    raises ``RuntimeError`` if the test-DB config is missing or unsafe.
    """
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
    except ImportError:
        pytest.skip("psycopg2 not installed")

    _enforce_test_db_safety_guards()

    conn = psycopg2.connect(
        host=os.environ["TEST_DB_HOST"],
        port=os.environ.get("TEST_DB_PORT", "5432"),
        database=os.environ["TEST_DB_NAME"],
        user=os.environ["TEST_DB_USER"],
        password=os.environ["TEST_DB_PASSWORD"],
        connect_timeout=10,
    )
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        yield cur
    finally:
        try:
            conn.rollback()
        finally:
            cur.close()
            conn.close()
