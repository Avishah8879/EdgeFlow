"""
API Contract Tests — Verify response shapes match the standardized envelope.

Run against a live local Python backend:
    uv run pytest tests/python/test_api_contracts.py -v

Requires: Python backend running on localhost:7860

These tests verify the STANDARDIZED format:
- Success: { "data": ..., "meta": { ... } }
- Error:   { "error": { "code": ..., "message": ... } }
"""

import httpx
import pytest

BASE_URL = "http://localhost:7860"
TIMEOUT = 15.0  # seconds


# ─── List Endpoints (return { data: [...], meta: { count, ... } }) ───────────


class TestListEndpointContracts:
    """Endpoints that return arrays of items with pagination metadata."""

    @pytest.mark.asyncio
    async def test_stocks_response_shape(self):
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.get(f"{BASE_URL}/api/stocks", params={"limit": 5, "page": 1})
            assert r.status_code == 200
            body = r.json()
            # Envelope
            assert "data" in body, f"Missing 'data'. Got keys: {list(body.keys())}"
            assert isinstance(body["data"], list)
            # Meta
            assert "meta" in body, f"Missing 'meta'. Got keys: {list(body.keys())}"
            meta = body["meta"]
            assert "count" in meta
            assert "total" in meta
            assert meta["count"] == len(body["data"])
            assert meta["count"] <= 5
            # Item shape
            if body["data"]:
                item = body["data"][0]
                assert "id" in item
                assert "symbol" in item
            # No extra top-level keys (only data + meta allowed)
            assert set(body.keys()) <= {"data", "meta"}

    @pytest.mark.asyncio
    async def test_market_movers_gainer_shape(self):
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.get(
                f"{BASE_URL}/api/market-movers",
                params={"category": "GAINER", "limit": 5},
            )
            assert r.status_code == 200
            body = r.json()
            assert "data" in body
            assert isinstance(body["data"], list)
            if body["data"]:
                item = body["data"][0]
                assert "symbol" in item
                assert "ltp" in item
                assert "category" in item

    @pytest.mark.asyncio
    async def test_market_movers_loser_shape(self):
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.get(
                f"{BASE_URL}/api/market-movers",
                params={"category": "LOSER", "limit": 5},
            )
            assert r.status_code == 200
            body = r.json()
            assert "data" in body
            assert isinstance(body["data"], list)

    @pytest.mark.asyncio
    async def test_indices_response_shape(self):
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.get(f"{BASE_URL}/api/indices")
            assert r.status_code == 200
            body = r.json()
            assert "data" in body
            assert isinstance(body["data"], list)

    @pytest.mark.asyncio
    async def test_tickers_response_shape(self):
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.get(f"{BASE_URL}/api/tickers")
            assert r.status_code == 200
            body = r.json()
            assert "data" in body
            assert isinstance(body["data"], list)

    @pytest.mark.asyncio
    async def test_marquee_stocks_response_shape(self):
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.get(f"{BASE_URL}/api/marquee-stocks", params={"limit": 2})
            assert r.status_code == 200
            body = r.json()
            assert "data" in body
            assert isinstance(body["data"], list)

    @pytest.mark.asyncio
    async def test_search_response_shape(self):
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.get(f"{BASE_URL}/api/search", params={"q": "TCS", "limit": 5})
            assert r.status_code == 200
            body = r.json()
            assert "data" in body
            assert isinstance(body["data"], list)


# ─── Single Resource Endpoints (return { data: { ... } }) ───────────────────


class TestSingleResourceContracts:
    """Endpoints that return a single object."""

    @pytest.mark.asyncio
    async def test_stock_ltp_response_shape(self):
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.get(f"{BASE_URL}/api/stock-ltp/RELIANCE.NS")
            assert r.status_code == 200
            body = r.json()
            assert "data" in body, f"Missing 'data'. Got keys: {list(body.keys())}"
            assert isinstance(body["data"], dict)
            data = body["data"]
            assert "symbol" in data
            assert "ltp" in data

    @pytest.mark.asyncio
    async def test_market_mood_response_shape(self):
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.get(f"{BASE_URL}/api/market-mood")
            assert r.status_code == 200
            body = r.json()
            assert "data" in body
            data = body["data"]
            assert "status" in data
            assert "current" in data
            assert "value" in data["current"]
            assert "category" in data["current"]

    @pytest.mark.asyncio
    async def test_market_status_response_shape(self):
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.get(f"{BASE_URL}/api/market-status")
            assert r.status_code == 200
            body = r.json()
            assert "data" in body
            data = body["data"]
            assert "is_open" in data
            assert "status" in data

    @pytest.mark.asyncio
    async def test_price_chart_response_shape(self):
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.get(
                f"{BASE_URL}/api/price-chart/RELIANCE.NS",
                params={"timeframe": "1day", "months": 1},
            )
            assert r.status_code == 200
            body = r.json()
            assert "data" in body
            data = body["data"]
            assert "price_data" in data
            assert isinstance(data["price_data"], list)

    @pytest.mark.asyncio
    async def test_technical_indicators_response_shape(self):
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.get(f"{BASE_URL}/api/technical-indicators/RELIANCE.NS")
            assert r.status_code == 200
            body = r.json()
            assert "data" in body
            assert isinstance(body["data"], dict)


# ─── Error Response Contracts ────────────────────────────────────────────────


class TestErrorContracts:
    """Verify error responses follow { error: { code, message } }."""

    @pytest.mark.asyncio
    async def test_invalid_ticker_returns_error_envelope(self):
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.get(f"{BASE_URL}/api/stock-ltp/COMPLETELY_INVALID_TICKER_XYZ123")
            # Should be 4xx error
            assert r.status_code >= 400, f"Expected 4xx, got {r.status_code}"
            body = r.json()
            assert "error" in body, f"Missing 'error' key. Got: {list(body.keys())}"
            error = body["error"]
            assert "code" in error, f"Error missing 'code'. Got: {error}"
            assert "message" in error, f"Error missing 'message'. Got: {error}"

    @pytest.mark.asyncio
    async def test_no_data_and_error_coexist(self):
        """A response should have EITHER 'data' OR 'error', never both."""
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.get(f"{BASE_URL}/api/stock-ltp/COMPLETELY_INVALID_TICKER_XYZ123")
            body = r.json()
            has_data = "data" in body
            has_error = "error" in body
            assert has_data != has_error, (
                f"Response has both 'data' and 'error' or neither. "
                f"Keys: {list(body.keys())}"
            )


# ─── Pagination Contracts ────────────────────────────────────────────────────


class TestPaginationContracts:
    """Verify pagination metadata is correct."""

    @pytest.mark.asyncio
    async def test_stocks_pagination_meta(self):
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.get(
                f"{BASE_URL}/api/stocks", params={"limit": 2, "page": 1}
            )
            assert r.status_code == 200
            body = r.json()
            meta = body.get("meta", {})
            assert "page" in meta
            assert "limit" in meta
            assert "has_more" in meta
            assert meta["page"] == 1
            assert meta["limit"] == 2

    @pytest.mark.asyncio
    async def test_stocks_page_beyond_total(self):
        """Requesting a page beyond total should return empty data, not error."""
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.get(
                f"{BASE_URL}/api/stocks", params={"limit": 2, "page": 99999}
            )
            assert r.status_code == 200
            body = r.json()
            assert "data" in body
            assert isinstance(body["data"], list)
            assert len(body["data"]) == 0
            assert body["meta"]["has_more"] is False
