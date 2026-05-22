"""Async HTTPX client for the CMOTS RGX Research API.

Single public entry point: ``await fetch(url)`` returns ``(success, message, rows)``
with the universal envelope normalised per CMOTS schema §2.

Concurrency is governed by a module-level ``asyncio.Semaphore(8)``. The CMOTS
API empirically tolerates 8 concurrent requests cleanly; pushing past that
risks HTTP 429s and connection-reset storms.

Authentication uses a JWT in the ``Authorization: Bearer <token>`` header.
``CMOTS_TOKEN`` is loaded from the environment on the first ``fetch()`` call.

Retry policy:
  - HTTP 401  -> raise ``CMOTSTokenExpired`` (no retry — the token won't fix
    itself; the sync orchestrator must surface this to the operator)
  - HTTP 5xx  -> exponential backoff, up to 3 attempts total
  - network errors (timeout, connection refused) -> same backoff
  - HTTP 200 with envelope ``success: false`` -> return ``(False, message, [])``
    (this is "API said no data", not a transport-level failure)

Quirks honored (see ``cmots_schema.md`` §11):
  - §11.9  ``coerce_co_code`` handles int/float/string defensively
  - §11.11 ``is_envelope_success`` matches on the boolean, NEVER on the
           misspelled "Sucessful" string
"""

from __future__ import annotations

import asyncio
import logging
import math
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)


# ─── Tunables ───────────────────────────────────────────────────────────────

_TIMEOUT = httpx.Timeout(30.0, connect=10.0)
_CONCURRENCY = 8
_RETRIES = 3
_RETRY_BASE_SEC = 1.0


# ─── Exceptions ─────────────────────────────────────────────────────────────


class CMOTSTokenExpired(Exception):
    """Raised when CMOTS returns HTTP 401. Not retryable."""


class CMOTSError(Exception):
    """Raised for non-retryable, non-auth errors (exhausted retries, bad JSON,
    unexpected HTTP status)."""


# ─── Module-level state ─────────────────────────────────────────────────────

_sem: asyncio.Semaphore | None = None


def _get_sem() -> asyncio.Semaphore:
    """Lazy-create the shared semaphore. Recreated if event loop changed (tests)."""
    global _sem
    if _sem is None:
        _sem = asyncio.Semaphore(_CONCURRENCY)
    return _sem


def _reset_sem_for_tests() -> None:
    """Test-only: force the shared semaphore to be recreated on next access."""
    global _sem
    _sem = None


def _get_token() -> str:
    tok = os.getenv("CMOTS_TOKEN")
    if not tok:
        raise RuntimeError(
            "CMOTS_TOKEN environment variable is not set. "
            "Add it to EdgeFlow/.env and reload the process."
        )
    return tok


# ─── Helpers ────────────────────────────────────────────────────────────────


def is_envelope_success(body: Any) -> bool:
    """True iff the envelope's ``success`` field is the boolean ``True``.

    Quirk §11.11: CMOTS returns ``"message": "Sucessful"`` (sic) on success.
    Never match on that string. Always read the boolean.
    """
    if not isinstance(body, dict):
        return False
    return body.get("success") is True


def coerce_co_code(value: Any) -> int | None:
    """Defensively coerce a CMOTS co_code to int.

    Quirk §11.9: across endpoints, ``co_code`` appears as int (476), float
    (476.0), or string ("476" / "1762.0"). Anything that doesn't cleanly
    parse to an integer (NaN, empty, garbage) returns ``None``.
    """
    return _coerce_int(value)


def coerce_period(value: Any) -> int | None:
    """Defensively coerce a CMOTS period field to int.

    CMOTS period fields (``yearend``, ``qtrend``, ``YRC``, ``DATE``) follow
    the same int/float/string-of-int/string-of-float wild-typing as
    ``co_code`` (quirk §11.10 — period field name varies, but the wire
    types are identical). The §5 normalizers MUST route every period
    field through this helper before storing into a typed ``INT`` column
    (``cmots_financial_line.period``, ``cmots_ratio_yearly.yearend``,
    ``cmots_ratio_quarterly.qtrend``, ``cmots_shareholding.yrc``).

    Implementation is delegated to the same ``_coerce_int`` helper as
    ``coerce_co_code`` — the two functions are aliases by design, kept
    distinct so the call site documents intent and so we can specialise
    one without affecting the other later (e.g. add period-range
    validation to ``coerce_period`` without changing co_code logic).
    """
    return _coerce_int(value)


def _coerce_int(value: Any) -> int | None:
    """Shared defensive int coercion used by ``coerce_co_code`` and
    ``coerce_period``. Returns ``None`` for None / bool / NaN / Inf /
    empty string / unparseable string / non-numeric types.
    """
    if value is None:
        return None
    if isinstance(value, bool):
        # bool is a subclass of int; reject explicitly.
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return int(value)
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        try:
            return int(s)
        except ValueError:
            try:
                f = float(s)
            except ValueError:
                return None
            if math.isnan(f) or math.isinf(f):
                return None
            return int(f)
    return None


def _normalize_data(data: Any) -> list[dict]:
    """Normalise the envelope's ``data`` field to a list-of-dicts.

    CMOTS schema §2:
      - ``null``           -> ``[]``
      - ``{...}`` dict     -> ``[{...}]``
      - ``[<dict>, ...]``  -> unchanged
      - ``[<scalar>, ...]`` -> ``[{"value": s}, ...]``
    """
    if data is None:
        return []
    if isinstance(data, dict):
        return [data]
    if isinstance(data, list):
        if not data:
            return []
        out: list[dict] = []
        for item in data:
            if isinstance(item, dict):
                out.append(item)
            else:
                out.append({"value": item})
        return out
    # Unexpected scalar at the top level — wrap defensively.
    return [{"value": data}]


# ─── Main fetch ─────────────────────────────────────────────────────────────


async def fetch(
    url: str,
    *,
    client: httpx.AsyncClient | None = None,
) -> tuple[bool, str, list[dict]]:
    """GET a CMOTS URL with retries + envelope normalisation.

    Args:
        url: Fully-qualified CMOTS URL (already templatized with co_code).
        client: Optional pre-built ``httpx.AsyncClient``. If omitted, a new
            client is created per call (less efficient — prefer passing one
            from the sync orchestrator for bulk runs).

    Returns:
        ``(success, message, rows)`` where:
          - ``success`` is the envelope's boolean
          - ``message`` is the envelope's message string (or empty)
          - ``rows`` is the normalised list-of-dicts (always a list)

    Raises:
        CMOTSTokenExpired: HTTP 401 — token is invalid/expired.
        CMOTSError: exhausted retries on 5xx/network errors, or unparseable
            response.
    """
    token = _get_token()
    headers = {"Authorization": f"Bearer {token}"}
    sem = _get_sem()

    async with sem:
        owns_client = client is None
        c = client or httpx.AsyncClient(timeout=_TIMEOUT)
        try:
            for attempt in range(_RETRIES):
                try:
                    response = await c.get(url, headers=headers, timeout=_TIMEOUT)
                except (httpx.TimeoutException, httpx.NetworkError) as exc:
                    if attempt == _RETRIES - 1:
                        raise CMOTSError(
                            f"Network error after {_RETRIES} attempts on {url}: {exc}"
                        ) from exc
                    await asyncio.sleep(_RETRY_BASE_SEC * (2 ** attempt))
                    continue

                status = response.status_code

                if status == 401:
                    raise CMOTSTokenExpired(
                        f"CMOTS token rejected (HTTP 401) for {url}"
                    )

                if 500 <= status < 600:
                    if attempt == _RETRIES - 1:
                        raise CMOTSError(
                            f"HTTP {status} after {_RETRIES} attempts on {url}"
                        )
                    await asyncio.sleep(_RETRY_BASE_SEC * (2 ** attempt))
                    continue

                if status != 200:
                    raise CMOTSError(
                        f"HTTP {status} (non-retryable) on {url}: "
                        f"{response.text[:200]}"
                    )

                # 200 — parse envelope.
                try:
                    body = response.json()
                except Exception as exc:  # noqa: BLE001 - httpx/json variants
                    raise CMOTSError(f"Invalid JSON from {url}: {exc}") from exc

                if not isinstance(body, dict):
                    # Envelope itself isn't a dict — treat as empty failure.
                    return (False, "envelope not a dict", [])

                message = body.get("message") or ""
                if not is_envelope_success(body):
                    # API said no data / failure — not an exception, just empty.
                    return (False, message, [])

                rows = _normalize_data(body.get("data"))
                return (True, message, rows)

            # Loop fell through without returning/raising — unreachable in practice
            # but kept defensive.
            raise CMOTSError(f"Unreachable retry loop exit for {url}")
        finally:
            if owns_client:
                await c.aclose()
