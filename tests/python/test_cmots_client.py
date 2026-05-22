"""Tests for ``server/cmots_client.py``.

No fixtures from ``tests/python/fixtures/cmots/`` are loaded yet — those
recorded responses come in §4 with the sync orchestrator. Here we stub
``httpx`` via ``httpx.MockTransport`` (built into httpx 0.28; no extra
dep needed).
"""

from __future__ import annotations

import asyncio
import math

import httpx
import pytest

from server.cmots_client import (
    CMOTSError,
    CMOTSTokenExpired,
    _normalize_data,
    _reset_sem_for_tests,
    coerce_co_code,
    coerce_period,
    fetch,
    is_envelope_success,
)


# ─── Pure helpers (sync) ────────────────────────────────────────────────────


class TestIsEnvelopeSuccess:
    """`is_envelope_success` matches the boolean and IGNORES the message."""

    def test_true_when_success_true(self):
        assert is_envelope_success({"success": True, "message": "anything"}) is True

    def test_false_when_success_false(self):
        assert is_envelope_success({"success": False, "message": "Sucessful"}) is False

    def test_false_when_missing(self):
        assert is_envelope_success({"message": "Sucessful"}) is False

    def test_false_when_success_is_truthy_string(self):
        # quirk §11.11: never match on the misspelled message string
        assert is_envelope_success({"success": "Sucessful"}) is False
        assert is_envelope_success({"success": "true"}) is False
        assert is_envelope_success({"success": 1}) is False

    def test_false_when_body_not_dict(self):
        assert is_envelope_success(None) is False
        assert is_envelope_success([1, 2]) is False
        assert is_envelope_success("Sucessful") is False


class TestCoerceCoCode:
    """Defensive int coercion across the int/float/string variants CMOTS emits."""

    def test_int(self):
        assert coerce_co_code(476) == 476

    def test_float(self):
        assert coerce_co_code(476.0) == 476

    def test_string_int(self):
        assert coerce_co_code("476") == 476

    def test_string_float(self):
        # BSE_Announcement.co_code = "1762.0" in the wild
        assert coerce_co_code("1762.0") == 1762

    def test_string_with_whitespace(self):
        assert coerce_co_code("  476 ") == 476

    def test_none(self):
        assert coerce_co_code(None) is None

    def test_empty_string(self):
        assert coerce_co_code("") is None
        assert coerce_co_code("   ") is None

    def test_garbage(self):
        assert coerce_co_code("abc") is None
        assert coerce_co_code("4xyz") is None
        assert coerce_co_code([476]) is None
        assert coerce_co_code({"co_code": 476}) is None

    def test_nan_and_inf(self):
        assert coerce_co_code(float("nan")) is None
        assert coerce_co_code(float("inf")) is None
        assert coerce_co_code("NaN") is None

    def test_bool_is_rejected(self):
        # bool is a subclass of int; we explicitly reject it.
        assert coerce_co_code(True) is None
        assert coerce_co_code(False) is None


class TestCoercePeriod:
    """`coerce_period` matches `coerce_co_code` semantics; period fields
    (yearend / qtrend / YRC / DATE) arrive in the same int/float/string
    variants as co_code in the wild."""

    def test_int(self):
        assert coerce_period(202603) == 202603

    def test_float(self):
        # The case that prompted the helper: observed in Yearly_Ratio_C
        # where `yearend` arrives as 202503.0.
        assert coerce_period(202603.0) == 202603

    def test_string_int(self):
        assert coerce_period("202603") == 202603

    def test_string_float(self):
        # Required by the §5 normalizer contract.
        assert coerce_period("202603.0") == 202603

    def test_string_with_whitespace(self):
        assert coerce_period("  202603 ") == 202603

    def test_none(self):
        assert coerce_period(None) is None

    def test_empty_string(self):
        assert coerce_period("") is None
        assert coerce_period("   ") is None

    def test_garbage(self):
        assert coerce_period("abc") is None
        assert coerce_period("202xyz") is None
        assert coerce_period([202603]) is None
        assert coerce_period({"yearend": 202603}) is None

    def test_nan_and_inf(self):
        assert coerce_period(float("nan")) is None
        assert coerce_period(float("inf")) is None
        assert coerce_period("NaN") is None

    def test_bool_is_rejected(self):
        # bool is a subclass of int; we explicitly reject it.
        assert coerce_period(True) is None
        assert coerce_period(False) is None


class TestNormalizeData:
    """Universal envelope normaliser per CMOTS schema §2."""

    def test_null_to_empty_list(self):
        assert _normalize_data(None) == []

    def test_empty_list_to_empty_list(self):
        assert _normalize_data([]) == []

    def test_single_dict_to_singleton_list(self):
        assert _normalize_data({"co_code": 476}) == [{"co_code": 476}]

    def test_list_of_dicts_unchanged(self):
        rows = [{"a": 1}, {"a": 2}]
        assert _normalize_data(rows) == rows

    def test_list_of_scalars_wrapped(self):
        assert _normalize_data([1, "two", 3.0]) == [
            {"value": 1},
            {"value": "two"},
            {"value": 3.0},
        ]

    def test_mixed_list(self):
        assert _normalize_data([{"a": 1}, "scalar"]) == [
            {"a": 1},
            {"value": "scalar"},
        ]

    def test_scalar_at_top_wrapped(self):
        assert _normalize_data(42) == [{"value": 42}]


# ─── HTTP-level fetch (async) ───────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _set_token(monkeypatch):
    """Every test gets a stub token; also resets the shared semaphore so the
    one made under a previous loop doesn't leak into the next test's loop."""
    monkeypatch.setenv("CMOTS_TOKEN", "stub-token-for-tests")
    _reset_sem_for_tests()
    yield
    _reset_sem_for_tests()


def _client_with(handler):
    """Build an httpx.AsyncClient whose responses come from ``handler``."""
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.mark.asyncio
async def test_envelope_success_returns_rows():
    def handler(request):
        return httpx.Response(
            200,
            json={"success": True, "message": "Sucessful", "data": [{"co_code": 476}]},
        )
    async with _client_with(handler) as client:
        success, msg, rows = await fetch("https://x/y", client=client)
    assert success is True
    assert msg == "Sucessful"
    assert rows == [{"co_code": 476}]


@pytest.mark.asyncio
async def test_envelope_success_with_null_data():
    def handler(request):
        return httpx.Response(
            200,
            json={"success": True, "message": "Sucessful", "data": None},
        )
    async with _client_with(handler) as client:
        success, msg, rows = await fetch("https://x/y", client=client)
    assert success is True
    assert rows == []


@pytest.mark.asyncio
async def test_envelope_success_with_dict_data_wrapped():
    def handler(request):
        return httpx.Response(
            200,
            json={"success": True, "data": {"co_code": 476, "name": "X"}},
        )
    async with _client_with(handler) as client:
        success, _, rows = await fetch("https://x/y", client=client)
    assert success is True
    assert rows == [{"co_code": 476, "name": "X"}]


@pytest.mark.asyncio
async def test_envelope_success_with_scalar_list():
    def handler(request):
        return httpx.Response(200, json={"success": True, "data": [1, 2, 3]})
    async with _client_with(handler) as client:
        _, _, rows = await fetch("https://x/y", client=client)
    assert rows == [{"value": 1}, {"value": 2}, {"value": 3}]


@pytest.mark.asyncio
async def test_envelope_success_false_returns_empty_no_raise():
    def handler(request):
        return httpx.Response(
            200,
            json={"success": False, "message": "data is not available", "data": None},
        )
    async with _client_with(handler) as client:
        success, msg, rows = await fetch("https://x/y", client=client)
    assert success is False
    assert msg == "data is not available"
    assert rows == []


@pytest.mark.asyncio
async def test_http_401_raises_token_expired():
    def handler(request):
        return httpx.Response(401, text="unauthorized")
    async with _client_with(handler) as client:
        with pytest.raises(CMOTSTokenExpired):
            await fetch("https://x/y", client=client)


@pytest.mark.asyncio
async def test_http_500_retries_then_raises(monkeypatch):
    # Speed up the retries — neutralise the backoff sleeps.
    monkeypatch.setattr("server.cmots_client._RETRY_BASE_SEC", 0.0)

    call_count = {"n": 0}

    def handler(request):
        call_count["n"] += 1
        return httpx.Response(500, text="boom")

    async with _client_with(handler) as client:
        with pytest.raises(CMOTSError):
            await fetch("https://x/y", client=client)
    assert call_count["n"] == 3  # _RETRIES


@pytest.mark.asyncio
async def test_network_error_retries_then_raises(monkeypatch):
    monkeypatch.setattr("server.cmots_client._RETRY_BASE_SEC", 0.0)
    call_count = {"n": 0}

    def handler(request):
        call_count["n"] += 1
        raise httpx.ConnectError("simulated connection refused")

    async with _client_with(handler) as client:
        with pytest.raises(CMOTSError):
            await fetch("https://x/y", client=client)
    assert call_count["n"] == 3


@pytest.mark.asyncio
async def test_missing_token_raises_runtime_error(monkeypatch):
    monkeypatch.delenv("CMOTS_TOKEN", raising=False)
    with pytest.raises(RuntimeError, match="CMOTS_TOKEN"):
        await fetch("https://x/y")


@pytest.mark.asyncio
async def test_semaphore_limits_concurrency_to_8(monkeypatch):
    """Fire 20 concurrent fetches against a slow handler; max-in-flight ≤ 8."""
    monkeypatch.setattr("server.cmots_client._RETRY_BASE_SEC", 0.0)

    in_flight = 0
    max_in_flight = 0
    lock = asyncio.Lock()
    payload = {"success": True, "data": []}

    async def slow_handler(request):
        nonlocal in_flight, max_in_flight
        async with lock:
            in_flight += 1
            if in_flight > max_in_flight:
                max_in_flight = in_flight
        # Let other coroutines progress so the high-water mark can settle.
        await asyncio.sleep(0.05)
        async with lock:
            in_flight -= 1
        return httpx.Response(200, json=payload)

    transport = httpx.MockTransport(slow_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        await asyncio.gather(
            *(fetch(f"https://x/{i}", client=client) for i in range(20))
        )

    assert max_in_flight <= 8, f"semaphore breached: {max_in_flight} concurrent"
    assert max_in_flight >= 2, "semaphore is so restrictive it might be 1; expected fan-out"


@pytest.mark.asyncio
async def test_non_dict_envelope_returns_empty_failure():
    def handler(request):
        return httpx.Response(200, json=[1, 2, 3])  # list at top instead of dict
    async with _client_with(handler) as client:
        success, _, rows = await fetch("https://x/y", client=client)
    assert success is False
    assert rows == []


@pytest.mark.asyncio
async def test_invalid_json_raises_cmots_error():
    def handler(request):
        return httpx.Response(200, content=b"not-json-{{{")
    async with _client_with(handler) as client:
        with pytest.raises(CMOTSError, match="Invalid JSON"):
            await fetch("https://x/y", client=client)


def test_normalize_data_via_math_isnan_consistent():
    """Sanity: NaN guard works for the path coerce_co_code uses."""
    assert math.isnan(float("nan"))
    assert coerce_co_code(float("nan")) is None
