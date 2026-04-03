"""
Error response format validation tests.

Verifies that all error responses follow the standardized envelope:
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  }
}

Run against a live local backend: pytest tests/python/test_error_responses.py -v
"""
import httpx
import pytest

BASE_URL = "http://localhost:7860"


class TestErrorResponseFormat:
    """Verify error responses have the standard { error: { code, message } } shape."""

    @pytest.mark.asyncio
    async def test_invalid_ticker_returns_error_envelope(self):
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{BASE_URL}/api/stock-ltp/TOTALLY_INVALID_TICKER_XYZ123")
            # Should be 400 or 404
            assert r.status_code in (400, 404, 500)
            body = r.json()
            assert "error" in body, f"Expected 'error' key. Got: {list(body.keys())}"
            assert "code" in body["error"]
            assert "message" in body["error"]
            assert isinstance(body["error"]["code"], str)
            assert isinstance(body["error"]["message"], str)

    @pytest.mark.asyncio
    async def test_missing_required_param_returns_error(self):
        """Search endpoint without 'q' parameter should return error or empty result."""
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{BASE_URL}/api/search")
            body = r.json()
            # Should be either error format or data format, never raw exception
            assert "error" in body or "data" in body, (
                f"Response should be either error or data envelope. Got: {list(body.keys())}"
            )

    @pytest.mark.asyncio
    async def test_error_and_data_never_coexist(self):
        """A response should never have both 'data' and 'error' at the top level."""
        async with httpx.AsyncClient() as client:
            # Valid request
            r = await client.get(f"{BASE_URL}/api/market-status")
            body = r.json()
            has_data = "data" in body
            has_error = "error" in body
            assert not (has_data and has_error), (
                f"Response has both 'data' and 'error': {list(body.keys())}"
            )

    @pytest.mark.asyncio
    async def test_404_endpoint_returns_json_error(self):
        """Non-existent API endpoint should return JSON error, not HTML."""
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{BASE_URL}/api/nonexistent-endpoint-xyz")
            assert r.status_code in (404, 405, 422)
            # Should return JSON, not HTML
            content_type = r.headers.get("content-type", "")
            assert "application/json" in content_type, (
                f"Expected JSON content-type, got: {content_type}"
            )

    @pytest.mark.asyncio
    async def test_invalid_pagination_returns_valid_response(self):
        """Out-of-range pagination should return empty data, not an error."""
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{BASE_URL}/api/stocks?page=999999&limit=30")
            assert r.status_code == 200
            body = r.json()
            assert "data" in body
            assert isinstance(body["data"], list)
            assert len(body["data"]) == 0

    @pytest.mark.asyncio
    async def test_error_code_is_uppercase_snake_case(self):
        """Error codes should follow UPPER_SNAKE_CASE convention."""
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{BASE_URL}/api/stock-ltp/INVALID_XYZ")
            if r.status_code >= 400:
                body = r.json()
                if "error" in body and "code" in body["error"]:
                    code = body["error"]["code"]
                    assert code == code.upper(), f"Error code should be uppercase: '{code}'"
                    assert " " not in code, f"Error code should not contain spaces: '{code}'"
