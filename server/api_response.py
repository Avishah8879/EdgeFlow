"""
Standardized API Response Helpers for Tiphub.

All public API responses follow this shape:

Success:
    {"data": ..., "meta": {...}}

Error:
    {"error": {"code": "...", "message": "..."}}

Usage:
    from server.api_response import success_response, paginated_response, error_response

    @app.get("/api/stocks")
    async def get_stocks():
        return paginated_response(data=stocks, total=total, page=page, limit=limit)

    @app.get("/api/stock-ltp/{ticker}")
    async def get_stock_ltp(ticker: str):
        return success_response(data=ltp_data)
"""

from fastapi import HTTPException
from typing import Any, Optional, Dict


def success_response(data: Any, meta: Optional[Dict[str, Any]] = None) -> dict:
    """Wrap data in the standard success envelope."""
    response = {"data": data}
    if meta is not None:
        response["meta"] = meta
    return response


def paginated_response(
    data: list,
    total: int,
    page: int,
    limit: int,
) -> dict:
    """Wrap paginated list data in the standard envelope with pagination metadata."""
    return {
        "data": data,
        "meta": {
            "count": len(data),
            "total": total,
            "page": page,
            "limit": limit,
            "has_more": (page * limit) < total,
        },
    }


def list_response(data: list, meta: Optional[Dict[str, Any]] = None) -> dict:
    """Wrap list data in the standard envelope with a count meta."""
    base_meta = {"count": len(data)}
    if meta:
        base_meta.update(meta)
    return {
        "data": data,
        "meta": base_meta,
    }


def error_response(code: str, message: str, status_code: int = 400) -> None:
    """Raise an HTTPException with the standard error envelope."""
    raise HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
    )
