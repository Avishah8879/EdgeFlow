"""
Redis-based rate limiting for Fin-Terminal API.

Implements dual rate limiting (per-user AND per-IP) using the
sliding window algorithm with Redis sorted sets for accuracy.
"""

import os
import time
from dataclasses import dataclass
from typing import Optional, Tuple

import redis.asyncio as aioredis

# =============================================================================
# Configuration
# =============================================================================

RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))

# Rate limits per endpoint (requests per window)
RATE_LIMITS = {
    # Heavy computation endpoints
    "rrg-image": 20,
    "equity-screener": 10,
    "equity-screener/async": 20,

    # Standard API endpoints
    "quote": 120,  # 2 per second
    "quotes": 60,  # Batch endpoint
    "chart/intraday": 60,
    "chart/daily": 60,
    "search": 60,
    "indices": 120,
    "market-movers": 60,

    # Fundamentals (less frequent updates)
    "fundamentals": 30,
    "financial-statements": 30,
    "analyst-recommendations": 30,
    "shareholding": 30,

    # Forum/Chat
    "forum/messages:POST": 20,  # Spam prevention

    # Default for unspecified endpoints
    "default": 100,
}

# =============================================================================
# Redis Client
# =============================================================================

_rate_limit_client: Optional[aioredis.Redis] = None


async def get_rate_limit_client() -> aioredis.Redis:
    """Get Redis client for rate limiting."""
    global _rate_limit_client
    if _rate_limit_client is None:
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        _rate_limit_client = aioredis.from_url(
            redis_url,
            decode_responses=True,
        )
    return _rate_limit_client


async def close_rate_limit_client():
    """Close the rate limit Redis client."""
    global _rate_limit_client
    if _rate_limit_client:
        await _rate_limit_client.close()
        _rate_limit_client = None


# =============================================================================
# Rate Limit Result
# =============================================================================

@dataclass
class RateLimitResult:
    """Result of a rate limit check."""
    allowed: bool
    limit: int
    remaining: int
    reset_at: int
    retry_after: Optional[int] = None

    def headers(self) -> dict:
        """Generate rate limit response headers."""
        headers = {
            "X-RateLimit-Limit": str(self.limit),
            "X-RateLimit-Remaining": str(max(0, self.remaining)),
            "X-RateLimit-Reset": str(self.reset_at),
        }
        if self.retry_after is not None:
            headers["Retry-After"] = str(self.retry_after)
        return headers


# =============================================================================
# Sliding Window Rate Limiter
# =============================================================================


async def check_rate_limit(
    identifier: str,
    endpoint: str,
    window_seconds: Optional[int] = None,
    max_requests: Optional[int] = None,
) -> RateLimitResult:
    """
    Check if a request is within rate limits using sliding window.

    Args:
        identifier: User ID or IP address
        endpoint: API endpoint being accessed
        window_seconds: Custom window size (default from config)
        max_requests: Custom max requests (default from endpoint config)

    Returns:
        RateLimitResult with allowed status and headers
    """
    if not RATE_LIMIT_ENABLED:
        return RateLimitResult(
            allowed=True,
            limit=999999,
            remaining=999999,
            reset_at=int(time.time()) + 60,
        )

    client = await get_rate_limit_client()

    # Determine limits
    window = window_seconds or RATE_LIMIT_WINDOW
    limit = max_requests or RATE_LIMITS.get(endpoint, RATE_LIMITS["default"])

    # Create key
    key = f"ratelimit:{endpoint}:{identifier}"

    # Current timestamp
    now = time.time()
    window_start = now - window

    # Use Redis pipeline for atomic operations
    pipe = client.pipeline()

    # Remove old entries outside the window
    pipe.zremrangebyscore(key, 0, window_start)

    # Count current requests in window
    pipe.zcard(key)

    # Add current request
    pipe.zadd(key, {str(now): now})

    # Set expiry on key
    pipe.expire(key, window + 1)

    results = await pipe.execute()

    # Get count of requests in window (before adding current)
    current_count = results[1]

    # Calculate remaining and reset time
    remaining = limit - current_count - 1
    reset_at = int(now + window)

    if current_count >= limit:
        # Rate limited
        return RateLimitResult(
            allowed=False,
            limit=limit,
            remaining=0,
            reset_at=reset_at,
            retry_after=int(window - (now - window_start)),
        )

    return RateLimitResult(
        allowed=True,
        limit=limit,
        remaining=remaining,
        reset_at=reset_at,
    )


async def check_dual_rate_limit(
    user_id: Optional[str],
    ip_address: str,
    endpoint: str,
) -> RateLimitResult:
    """
    Check both per-user and per-IP rate limits.

    Returns the more restrictive result.

    Args:
        user_id: Authenticated user ID (None for anonymous)
        ip_address: Client IP address
        endpoint: API endpoint being accessed

    Returns:
        RateLimitResult with the stricter limit applied
    """
    # Always check IP-based limit
    ip_result = await check_rate_limit(f"ip:{ip_address}", endpoint)

    # If user is authenticated, also check user-based limit
    if user_id:
        user_result = await check_rate_limit(f"user:{user_id}", endpoint)

        # Return the stricter result
        if not user_result.allowed:
            return user_result
        if not ip_result.allowed:
            return ip_result

        # Both allowed - return the one with fewer remaining
        if user_result.remaining < ip_result.remaining:
            return user_result

    return ip_result


# =============================================================================
# FastAPI Middleware
# =============================================================================


def get_client_ip(request) -> str:
    """Extract client IP from request, handling proxies."""
    # Check for forwarded headers (behind proxy/load balancer)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # Take the first IP in the chain
        return forwarded_for.split(",")[0].strip()

    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip

    # Fall back to direct client
    return request.client.host if request.client else "unknown"


def get_endpoint_key(path: str, method: str) -> str:
    """Convert request path to endpoint key for rate limiting."""
    # Remove /api/ prefix
    endpoint = path.lstrip("/").replace("api/", "")

    # Handle parameterized routes
    parts = endpoint.split("/")
    if len(parts) >= 2:
        # Keep first two parts for most endpoints
        # e.g., /api/chart/daily/RELIANCE -> chart/daily
        # e.g., /api/quote/RELIANCE -> quote
        if parts[0] in ["quote", "chart", "fundamentals", "stream"]:
            endpoint = "/".join(parts[:2]) if len(parts) > 1 else parts[0]
        else:
            endpoint = parts[0]

    # Add method for POST endpoints
    if method == "POST" and endpoint in ["forum/messages", "equity-screener"]:
        endpoint = f"{endpoint}:POST"

    return endpoint


async def rate_limit_middleware(request, call_next):
    """
    FastAPI middleware for rate limiting.

    Usage:
        app.middleware("http")(rate_limit_middleware)
    """
    from fastapi import Response

    # Skip rate limiting for health check
    if request.url.path in ["/api/health", "/health", "/"]:
        return await call_next(request)

    # Skip for SSE streams (they're long-lived)
    if "/stream/" in request.url.path:
        return await call_next(request)

    # Get identifiers
    ip_address = get_client_ip(request)
    user_id = None  # TODO: Extract from JWT token if authenticated

    # Get endpoint key
    endpoint = get_endpoint_key(request.url.path, request.method)

    # Check rate limit
    result = await check_dual_rate_limit(user_id, ip_address, endpoint)

    if not result.allowed:
        # Return 429 Too Many Requests
        return Response(
            content='{"success": false, "message": "Rate limit exceeded. Please try again later."}',
            status_code=429,
            media_type="application/json",
            headers=result.headers(),
        )

    # Process request and add rate limit headers to response
    response = await call_next(request)

    # Add rate limit headers
    for key, value in result.headers().items():
        response.headers[key] = value

    return response


# =============================================================================
# Rate Limit Statistics
# =============================================================================


async def get_rate_limit_stats(identifier: str) -> dict:
    """
    Get current rate limit statistics for an identifier.

    Args:
        identifier: User ID or IP address

    Returns:
        Dict with rate limit info per endpoint
    """
    client = await get_rate_limit_client()
    stats = {}

    for endpoint, limit in RATE_LIMITS.items():
        key = f"ratelimit:{endpoint}:{identifier}"

        now = time.time()
        window_start = now - RATE_LIMIT_WINDOW

        # Count requests in current window
        count = await client.zcount(key, window_start, now)

        stats[endpoint] = {
            "limit": limit,
            "used": count,
            "remaining": max(0, limit - count),
            "window_seconds": RATE_LIMIT_WINDOW,
        }

    return stats


async def reset_rate_limit(identifier: str, endpoint: Optional[str] = None) -> int:
    """
    Reset rate limit for an identifier.

    Args:
        identifier: User ID or IP address
        endpoint: Specific endpoint (None = all endpoints)

    Returns:
        Number of keys deleted
    """
    client = await get_rate_limit_client()

    if endpoint:
        key = f"ratelimit:{endpoint}:{identifier}"
        return await client.delete(key)
    else:
        # Delete all rate limit keys for this identifier
        pattern = f"ratelimit:*:{identifier}"
        keys = []
        async for key in client.scan_iter(match=pattern):
            keys.append(key)

        if keys:
            return await client.delete(*keys)
        return 0
