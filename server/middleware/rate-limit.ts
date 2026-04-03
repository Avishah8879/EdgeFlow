/**
 * Rate Limiting Middleware
 *
 * Provides rate limiting for different types of requests to prevent abuse.
 * Uses express-rate-limit package with memory store.
 *
 * For production, consider using Redis store for distributed rate limiting.
 */

import rateLimit, { Options } from 'express-rate-limit';

/**
 * Login Rate Limiter
 *
 * Prevents brute force attacks on login endpoint.
 * - 5 attempts per 15 minutes per IP
 * - Stricter than other endpoints due to security sensitivity
 *
 * @example
 * app.post('/auth/v2/login', loginRateLimiter, async (req, res) => {
 *   // Login logic
 * });
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per window
  message: {
    message: 'Too many login attempts. Please try again in 15 minutes.',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: 15 * 60, // seconds
  },
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  skipSuccessfulRequests: false, // Count successful requests
  skipFailedRequests: false, // Count failed requests
});

/**
 * Signup Rate Limiter
 *
 * Prevents spam account creation.
 * - 3 signups per hour per IP
 * - Very strict to prevent bot registrations
 *
 * @example
 * app.post('/auth/v2/signup', signupRateLimiter, async (req, res) => {
 *   // Signup logic
 * });
 */
export const signupRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 signups per hour
  message: {
    message: 'Too many accounts created. Please try again in an hour.',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: 60 * 60, // seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: true, // Don't count failed signups (validation errors)
});

/**
 * Password Reset Rate Limiter
 *
 * Prevents spam password reset requests.
 * - 3 requests per hour per IP
 *
 * @example
 * app.post('/auth/v2/forgot-password', passwordResetRateLimiter, async (req, res) => {
 *   // Password reset logic
 * });
 */
export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests per hour
  message: {
    message: 'Too many password reset requests. Please try again in an hour.',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: 60 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * General API Rate Limiter
 *
 * Moderate rate limiting for general API endpoints.
 * - 100 requests per 15 minutes per IP
 *
 * @example
 * app.use('/api', apiRateLimiter);
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: {
    message: 'Too many requests. Please slow down and try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: 15 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});

/**
 * Strict API Rate Limiter (for sensitive operations)
 *
 * Very strict rate limiting for sensitive endpoints.
 * - 10 requests per 15 minutes per IP
 *
 * @example
 * app.post('/api/delete-account', requireAuth, strictApiRateLimiter, async (req, res) => {
 *   // Sensitive operation
 * });
 */
export const strictApiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per 15 minutes
  message: {
    message: 'Too many requests to sensitive endpoint. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: 15 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * OAuth Callback Rate Limiter
 *
 * Rate limit for OAuth callbacks to prevent abuse.
 * - 10 attempts per 5 minutes per IP
 *
 * @example
 * app.get('/auth/google/callback', oauthCallbackRateLimiter, async (req, res) => {
 *   // OAuth callback logic
 * });
 */
export const oauthCallbackRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 attempts per 5 minutes
  message: {
    message: 'Too many OAuth attempts. Please try again in a few minutes.',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: 5 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Token Refresh Rate Limiter
 *
 * Rate limit for token refresh endpoint.
 * - 20 refreshes per hour per IP
 *
 * @example
 * app.post('/auth/v2/refresh', tokenRefreshRateLimiter, async (req, res) => {
 *   // Token refresh logic
 * });
 */
export const tokenRefreshRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 refreshes per hour
  message: {
    message: 'Too many token refresh requests. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: 60 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Create custom rate limiter
 *
 * Factory function to create custom rate limiters with specific settings.
 *
 * @param options - Rate limiter options
 * @returns Rate limiter middleware
 *
 * @example
 * const myRateLimiter = createRateLimiter({
 *   windowMs: 10 * 60 * 1000,
 *   max: 50,
 *   message: 'Custom rate limit message'
 * });
 */
export function createRateLimiter(options: Partial<Options>) {
  const defaults: Partial<Options> = {
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  };

  return rateLimit({ ...defaults, ...options });
}

/**
 * Export all rate limiters
 */
export default {
  loginRateLimiter,
  signupRateLimiter,
  passwordResetRateLimiter,
  apiRateLimiter,
  strictApiRateLimiter,
  oauthCallbackRateLimiter,
  tokenRefreshRateLimiter,
  createRateLimiter,
};
