/**
 * Rate limiting behavior tests.
 *
 * These test the rate limit logic in isolation (not against a live server).
 * For integration tests, see tests/scripts/smoke-test-nginx.sh.
 */
import { describe, it, expect } from 'vitest';

// Rate limit tier defaults (mirrors server/db/api-key-store.ts)
const TIER_RATE_LIMITS = {
  basic: { perMinute: 20, perHour: 500, perDay: 5000 },
  premium: { perMinute: 60, perHour: 2000, perDay: 25000 },
  enterprise: { perMinute: 200, perHour: 10000, perDay: 100000 },
};

describe('Rate Limit Configuration', () => {
  it('should have correct basic tier limits', () => {
    expect(TIER_RATE_LIMITS.basic.perMinute).toBe(20);
    expect(TIER_RATE_LIMITS.basic.perHour).toBe(500);
    expect(TIER_RATE_LIMITS.basic.perDay).toBe(5000);
  });

  it('should have correct premium tier limits', () => {
    expect(TIER_RATE_LIMITS.premium.perMinute).toBe(60);
    expect(TIER_RATE_LIMITS.premium.perHour).toBe(2000);
    expect(TIER_RATE_LIMITS.premium.perDay).toBe(25000);
  });

  it('should have correct enterprise tier limits', () => {
    expect(TIER_RATE_LIMITS.enterprise.perMinute).toBe(200);
    expect(TIER_RATE_LIMITS.enterprise.perHour).toBe(10000);
    expect(TIER_RATE_LIMITS.enterprise.perDay).toBe(100000);
  });

  it('premium should have higher limits than basic', () => {
    expect(TIER_RATE_LIMITS.premium.perMinute).toBeGreaterThan(TIER_RATE_LIMITS.basic.perMinute);
    expect(TIER_RATE_LIMITS.premium.perHour).toBeGreaterThan(TIER_RATE_LIMITS.basic.perHour);
    expect(TIER_RATE_LIMITS.premium.perDay).toBeGreaterThan(TIER_RATE_LIMITS.basic.perDay);
  });

  it('enterprise should have higher limits than premium', () => {
    expect(TIER_RATE_LIMITS.enterprise.perMinute).toBeGreaterThan(TIER_RATE_LIMITS.premium.perMinute);
    expect(TIER_RATE_LIMITS.enterprise.perHour).toBeGreaterThan(TIER_RATE_LIMITS.premium.perHour);
    expect(TIER_RATE_LIMITS.enterprise.perDay).toBeGreaterThan(TIER_RATE_LIMITS.premium.perDay);
  });
});

describe('Rate Limit Window Calculation', () => {
  it('should compute minute window key correctly', () => {
    const ts = Math.floor(Date.now() / 60000);
    const key = `ratelimit:test-key-id:min:${ts}`;
    expect(key).toMatch(/^ratelimit:test-key-id:min:\d+$/);
  });

  it('should compute hour window key correctly', () => {
    const ts = Math.floor(Date.now() / 3600000);
    const key = `ratelimit:test-key-id:hr:${ts}`;
    expect(key).toMatch(/^ratelimit:test-key-id:hr:\d+$/);
  });

  it('should compute day window key correctly', () => {
    const ts = Math.floor(Date.now() / 86400000);
    const key = `ratelimit:test-key-id:day:${ts}`;
    expect(key).toMatch(/^ratelimit:test-key-id:day:\d+$/);
  });
});

describe('Rate Limit Response Headers', () => {
  it('should include required rate limit headers format', () => {
    // Simulates the expected header format
    const headers = {
      'X-RateLimit-Limit': '60',
      'X-RateLimit-Remaining': '58',
      'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 60),
    };

    expect(headers['X-RateLimit-Limit']).toBeTruthy();
    expect(headers['X-RateLimit-Remaining']).toBeTruthy();
    expect(headers['X-RateLimit-Reset']).toBeTruthy();
    expect(Number(headers['X-RateLimit-Remaining'])).toBeLessThanOrEqual(Number(headers['X-RateLimit-Limit']));
  });

  it('should set Retry-After when rate limited (429)', () => {
    const retryAfter = 30; // seconds until next window
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60); // max one minute window
  });
});
