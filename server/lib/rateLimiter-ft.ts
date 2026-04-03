/**
 * Redis-based rate limiting for Fin-Terminal Express server.
 *
 * Implements dual rate limiting (per-user AND per-IP) using the
 * sliding window algorithm with Redis sorted sets.
 */

import type { Request, Response, NextFunction } from "express";
import { getRedisClient } from "./redis";

// =============================================================================
// Configuration
// =============================================================================

const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED !== "false";
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS || "60", 10);

// Rate limits per endpoint (requests per window)
const RATE_LIMITS: Record<string, number> = {
  // Heavy computation endpoints
  "rrg-image": 20,
  "equity-screener": 10,
  "equity-screener/async": 20,

  // Standard API endpoints
  "quote": 120, // 2 per second
  "quotes": 60, // Batch endpoint
  "chart/intraday": 60,
  "chart/daily": 60,
  "search": 60,
  "indices": 120,
  "market-movers": 60,

  // Fundamentals (less frequent updates)
  "fundamentals": 30,
  "financial-statements": 30,
  "analyst-recommendations": 30,
  "shareholding": 30,

  // Forum/Chat
  "forum/messages:POST": 20, // Spam prevention

  // Default for unspecified endpoints
  "default": 100,
};

// =============================================================================
// Rate Limit Result
// =============================================================================

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(Math.max(0, result.remaining)),
    "X-RateLimit-Reset": String(result.resetAt),
  };
  if (result.retryAfter !== undefined) {
    headers["Retry-After"] = String(result.retryAfter);
  }
  return headers;
}

// =============================================================================
// Sliding Window Rate Limiter
// =============================================================================

/**
 * Check if a request is within rate limits using sliding window.
 */
async function checkRateLimit(
  identifier: string,
  endpoint: string,
  windowSeconds?: number,
  maxRequests?: number
): Promise<RateLimitResult> {
  if (!RATE_LIMIT_ENABLED) {
    return {
      allowed: true,
      limit: 999999,
      remaining: 999999,
      resetAt: Math.floor(Date.now() / 1000) + 60,
    };
  }

  const client = getRedisClient();
  if (!client) {
    return { allowed: true, limit: 999999, remaining: 999999, resetAt: Math.floor(Date.now() / 1000) + 60 };
  }
  const window = windowSeconds || RATE_LIMIT_WINDOW;
  const limit = maxRequests || RATE_LIMITS[endpoint] || RATE_LIMITS["default"];

  const key = `ratelimit:${endpoint}:${identifier}`;
  const now = Date.now() / 1000;
  const windowStart = now - window;

  // Use Redis pipeline for atomic operations
  const pipeline = client.pipeline();

  // Remove old entries outside the window
  pipeline.zremrangebyscore(key, 0, windowStart);

  // Count current requests in window
  pipeline.zcard(key);

  // Add current request
  pipeline.zadd(key, now, String(now));

  // Set expiry on key
  pipeline.expire(key, window + 1);

  const results = await pipeline.exec();

  // Get count of requests in window (before adding current)
  const currentCount = (results?.[1]?.[1] as number) || 0;

  // Calculate remaining and reset time
  const remaining = limit - currentCount - 1;
  const resetAt = Math.floor(now + window);

  if (currentCount >= limit) {
    // Rate limited
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt,
      retryAfter: Math.ceil(window - (now - windowStart)),
    };
  }

  return {
    allowed: true,
    limit,
    remaining,
    resetAt,
  };
}

/**
 * Check both per-user and per-IP rate limits.
 * Returns the more restrictive result.
 */
async function checkDualRateLimit(
  userId: string | null,
  ipAddress: string,
  endpoint: string
): Promise<RateLimitResult> {
  // Always check IP-based limit
  const ipResult = await checkRateLimit(`ip:${ipAddress}`, endpoint);

  // If user is authenticated, also check user-based limit
  if (userId) {
    const userResult = await checkRateLimit(`user:${userId}`, endpoint);

    // Return the stricter result
    if (!userResult.allowed) {
      return userResult;
    }
    if (!ipResult.allowed) {
      return ipResult;
    }

    // Both allowed - return the one with fewer remaining
    if (userResult.remaining < ipResult.remaining) {
      return userResult;
    }
  }

  return ipResult;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract client IP from request, handling proxies.
 */
function getClientIp(req: Request): string {
  // Check for forwarded headers (behind proxy/load balancer)
  const forwardedFor = req.headers["x-forwarded-for"];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    return ips.split(",")[0].trim();
  }

  const realIp = req.headers["x-real-ip"];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  // Fall back to direct client
  return req.ip || req.socket.remoteAddress || "unknown";
}

/**
 * Convert request path to endpoint key for rate limiting.
 */
function getEndpointKey(path: string, method: string): string {
  // Remove /api/ prefix
  let endpoint = path.replace(/^\/api\//, "").replace(/^\//, "");

  // Handle parameterized routes
  const parts = endpoint.split("/");
  if (parts.length >= 2) {
    if (["quote", "chart", "fundamentals", "stream"].includes(parts[0])) {
      endpoint = parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0];
    } else {
      endpoint = parts[0];
    }
  }

  // Add method for POST endpoints
  if (method === "POST" && ["forum/messages", "equity-screener"].includes(endpoint)) {
    endpoint = `${endpoint}:POST`;
  }

  return endpoint;
}

/**
 * Extract user ID from JWT token in request.
 */
function getUserId(req: Request): string | null {
  // TODO: Implement JWT extraction
  // For now, return null (treat all requests as anonymous)
  return null;
}

// =============================================================================
// Express Middleware
// =============================================================================

/**
 * Express middleware for rate limiting.
 */
export function rateLimitMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only rate limit API routes - skip everything else (Vite dev files, static assets, etc.)
    if (!req.path.startsWith("/api/")) {
      return next();
    }

    // Skip rate limiting for health check
    if (req.path === "/api/health") {
      return next();
    }

    // Skip for SSE streams (they're long-lived)
    if (req.path.includes("/stream/")) {
      return next();
    }

    try {
      // Get identifiers
      const ipAddress = getClientIp(req);
      const userId = getUserId(req);

      // Get endpoint key
      const endpoint = getEndpointKey(req.path, req.method);

      // Check rate limit
      const result = await checkDualRateLimit(userId, ipAddress, endpoint);

      // Add rate limit headers to response
      const headers = getRateLimitHeaders(result);
      for (const [key, value] of Object.entries(headers)) {
        res.setHeader(key, value);
      }

      if (!result.allowed) {
        // Return 429 Too Many Requests
        return res.status(429).json({
          success: false,
          message: "Rate limit exceeded. Please try again later.",
        });
      }

      next();
    } catch (error) {
      // On Redis error, allow request to proceed (fail open)
      console.error("[RateLimiter] Error:", error);
      next();
    }
  };
}

// =============================================================================
// Exports
// =============================================================================

export {
  checkRateLimit,
  checkDualRateLimit,
  getClientIp,
  getEndpointKey,
  RATE_LIMITS,
  RATE_LIMIT_WINDOW,
};
