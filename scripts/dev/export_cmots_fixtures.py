"""Step (f) — Export CMOTS fixtures from the dev TEST DB.

Reads TEST DB (equityprodata_sync_dev) read-only. Writes JSON files under
tests/python/fixtures/cmots/. Each file is the full envelope as it would
have been returned by ``server.cmots_client.fetch()``:

    {"success": true, "message": <message>, "data": [<rows...>]}

Plus one shared empty-data envelope under ``_shared/data_not_available.json``
representing the canonical CMOTS "no data" response.

Narrative HTML bodies (DIRECTORREP / CHAIRREPORT / MEMO / CMDA) are
truncated to first 2000 chars + last 200 chars with a [... truncated ...]
marker so the fixture corpus stays under 50 MB. Any other string field
longer than 4000 chars is similarly truncated.

TARGET: TEST DB equityprodata_sync_dev. Refuses to run against PROD
(DB_NAME = equityprodata).

Lives under ``scripts/dev/`` so it doesn't pollute production imports.
Re-runnable safely — overwrites existing fixture files in place.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


# ─── Load EdgeFlow/.env ─────────────────────────────────────────────────────

env_path = Path(__file__).resolve().parents[2] / ".env.development"
for line in env_path.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, _, v = line.partition("=")
    k, v = k.strip(), v.strip().strip('"').strip("'")
    if k and k not in os.environ:
        os.environ[k] = v

import psycopg2
from psycopg2.extras import RealDictCursor


# ─── Safety guard ───────────────────────────────────────────────────────────


def _safety_guard() -> None:
    test_name = os.environ.get("TEST_DB_NAME", "")
    prod_name = os.environ.get("DB_NAME", "")
    if not test_name:
        raise RuntimeError("TEST_DB_NAME is unset; refusing to proceed.")
    if test_name == prod_name:
        raise RuntimeError(
            f"REFUSING TO RUN: TEST_DB_NAME={test_name!r} equals "
            f"DB_NAME={prod_name!r}. This script reads from the TEST DB only."
        )


# ─── Config ─────────────────────────────────────────────────────────────────

# (symbol, co_code, fixture_dir_name)
TICKERS: list[tuple[str, int, str]] = [
    ("RELIANCE",    476, "reliance"),
    ("ITC",         301, "itc"),
    ("BAJAJHLDNG",   50, "bajajhldng"),  # finance/holding stand-in (no banks in trial set)
]

FIXTURES_ROOT = (
    Path(__file__).resolve().parents[2] / "tests" / "python" / "fixtures" / "cmots"
)

# Narrative bodies are large HTML strings — truncate aggressively.
# Map slug -> body field name. Other long strings get caught by the
# generic > 4000-char fallback.
NARRATIVE_BODY_FIELDS = {
    "Director_s_Report":      "DIRECTORREP",
    "Chairman_s_Report":      "CHAIRREPORT",
    "Auditor_s_Report":       "MEMO",
    "Notes_toAccount":        "MEMO",
    "Management_Discussion":  "CMDA",
}

TRUNC_HEAD_CHARS = 2000
TRUNC_TAIL_CHARS = 200
TRUNC_MIN_LEN = 4000  # don't truncate strings shorter than this


# ─── Helpers ────────────────────────────────────────────────────────────────


def _truncate(s: str) -> str:
    head = s[:TRUNC_HEAD_CHARS]
    tail = s[-TRUNC_TAIL_CHARS:]
    return f"{head}\n\n[... truncated; full body was {len(s)} chars ...]\n\n{tail}"


def _maybe_truncate_row(row: dict, slug: str) -> dict:
    """Truncate the known narrative body field and any string > TRUNC_MIN_LEN."""
    out = dict(row)
    for k, v in row.items():
        if isinstance(v, str) and len(v) >= TRUNC_MIN_LEN:
            out[k] = _truncate(v)
    return out


def _slug_to_filename(slug: str) -> str:
    return slug.lower() + ".json"


def _envelope(message: str | None, rows: list[dict]) -> dict:
    return {
        "success": True,
        "message": message or "",
        "data": rows,
    }


# ─── Export per ticker ─────────────────────────────────────────────────────


def export_ticker(conn, co_code: int, ticker_dir: Path) -> tuple[int, int]:
    """Export every success=TRUE api_call for this co_code.

    Returns (files_written, total_bytes).
    """
    ticker_dir.mkdir(parents=True, exist_ok=True)

    cur = conn.cursor()
    cur.execute(
        """
        SELECT ac.id AS api_call_id, ac.message, e.slug
          FROM cmots_api_calls ac
          JOIN cmots_endpoints e ON ac.endpoint_id = e.id
         WHERE ac.co_code = %s AND ac.success = TRUE
         ORDER BY e.slug
        """,
        (co_code,),
    )
    calls = cur.fetchall()
    cur.close()

    files_written = 0
    total_bytes = 0
    for call in calls:
        slug = call["slug"]
        cur2 = conn.cursor()
        cur2.execute(
            """
            SELECT row_index, payload_json
              FROM cmots_api_rows
             WHERE api_call_id = %s
             ORDER BY row_index
            """,
            (call["api_call_id"],),
        )
        raw_rows = cur2.fetchall()
        cur2.close()

        rows = [_maybe_truncate_row(r["payload_json"], slug) for r in raw_rows]
        envelope = _envelope(call["message"], rows)

        out_path = ticker_dir / _slug_to_filename(slug)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(envelope, f, indent=2, ensure_ascii=False, default=str)
        files_written += 1
        total_bytes += out_path.stat().st_size

    return files_written, total_bytes


def export_shared(conn, root: Path) -> Path:
    """Write the canonical empty-data envelope."""
    shared = root / "_shared"
    shared.mkdir(parents=True, exist_ok=True)

    cur = conn.cursor()
    cur.execute(
        """
        SELECT message
          FROM cmots_api_calls
         WHERE success = FALSE AND message IS NOT NULL
         LIMIT 1
        """
    )
    row = cur.fetchone()
    cur.close()
    message = (row["message"] if row else "data is not available")

    envelope = {"success": False, "message": message, "data": None}
    out_path = shared / "data_not_available.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(envelope, f, indent=2, ensure_ascii=False)
    return out_path


# ─── Main ───────────────────────────────────────────────────────────────────


def main() -> int:
    _safety_guard()

    target = (
        f"postgresql://{os.environ['TEST_DB_USER']}:***"
        f"@{os.environ['TEST_DB_HOST']}:{os.environ.get('TEST_DB_PORT','5432')}"
        f"/{os.environ['TEST_DB_NAME']}"
    )
    print(f"TARGET: TEST DB {os.environ['TEST_DB_NAME']}")
    print(f"  {target}")
    print(f"Fixtures root: {FIXTURES_ROOT}")
    print()

    conn = psycopg2.connect(
        host=os.environ["TEST_DB_HOST"],
        port=os.environ.get("TEST_DB_PORT", "5432"),
        database=os.environ["TEST_DB_NAME"],
        user=os.environ["TEST_DB_USER"],
        password=os.environ["TEST_DB_PASSWORD"],
    )
    conn.cursor_factory = RealDictCursor

    summary = []
    grand_total_bytes = 0

    for symbol, co_code, dir_name in TICKERS:
        ticker_dir = FIXTURES_ROOT / dir_name
        count, size = export_ticker(conn, co_code, ticker_dir)
        summary.append((symbol, co_code, dir_name, count, size))
        grand_total_bytes += size
        print(f"  {symbol:12s} (co_code={co_code:5d}) -> {count:3d} files,"
              f"  {size/1024:7.1f} KB  -> {ticker_dir.name}/")

    shared_path = export_shared(conn, FIXTURES_ROOT)
    shared_size = shared_path.stat().st_size
    grand_total_bytes += shared_size
    print(f"  _shared/data_not_available.json -> {shared_size} bytes")

    conn.close()

    print()
    print(f"Total fixture set size: {grand_total_bytes:,} bytes"
          f"  ({grand_total_bytes/1024/1024:.2f} MB)")

    if grand_total_bytes > 50 * 1024 * 1024:
        print()
        print(f"WARNING: fixture set exceeds 50 MB threshold.")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
