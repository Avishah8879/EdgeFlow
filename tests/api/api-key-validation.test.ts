/**
 * API Key Validation Tests
 *
 * Tests for key format generation, CIDR matching, and endpoint scope globbing.
 * These tests use pure function implementations to avoid database dependencies.
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Key format tests — local implementation (mirrors api-key-store.ts)
// ---------------------------------------------------------------------------

const KEY_PREFIX = 'tphb_live_';

function generateApiKey(): { key: string; prefix: string; hash: string } {
  const randomBytes = crypto.randomBytes(32);
  const encoded = randomBytes.toString('base64url');
  const key = `${KEY_PREFIX}${encoded}`;
  const prefix = key.substring(0, 12);
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  return { key, prefix, hash };
}

function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

describe('API Key Format', () => {
  it('should generate key with correct prefix format', () => {
    const { key, prefix, hash } = generateApiKey();

    expect(key).toMatch(/^tphb_live_[A-Za-z0-9_-]+$/);
    expect(key.length).toBeGreaterThanOrEqual(40);
    expect(prefix).toBe(key.substring(0, 12));
    expect(prefix).toMatch(/^tphb_live_[A-Za-z0-9]/);
    expect(hash).toHaveLength(64);
  });

  it('should generate unique keys', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).not.toBe(b.key);
    expect(a.hash).not.toBe(b.hash);
  });

  it('should hash key deterministically', () => {
    const key = 'tphb_live_testkey123456789';
    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });
});

// ---------------------------------------------------------------------------
// IP Whitelist (CIDR matching) — local implementation (mirrors api-key-auth.ts)
// ---------------------------------------------------------------------------

function cidrMatch(ip: string, cidr: string): boolean {
  try {
    const [range, bits] = cidr.split('/');
    const mask = ~(2 ** (32 - parseInt(bits)) - 1);
    const ipNum = ipToInt(ip);
    const rangeNum = ipToInt(range);
    if (ipNum === null || rangeNum === null) return false;
    return (ipNum & mask) === (rangeNum & mask);
  } catch {
    return false;
  }
}

function ipToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  return parts.reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

function isIpAllowed(ip: string, allowedIps: string[]): boolean {
  if (!allowedIps || allowedIps.length === 0) return true;
  for (const allowed of allowedIps) {
    if (allowed.includes('/')) {
      if (cidrMatch(ip, allowed)) return true;
    } else {
      if (ip === allowed) return true;
    }
  }
  return false;
}

describe('IP Whitelist (CIDR matching)', () => {
  it('should allow all IPs when list is empty', () => {
    expect(isIpAllowed('192.168.1.50', [])).toBe(true);
    expect(isIpAllowed('10.0.0.1', [])).toBe(true);
  });

  it('should match exact IPs', () => {
    expect(isIpAllowed('192.168.1.50', ['192.168.1.50'])).toBe(true);
    expect(isIpAllowed('192.168.1.51', ['192.168.1.50'])).toBe(false);
  });

  it('should match CIDR /24 range', () => {
    expect(isIpAllowed('192.168.1.50', ['192.168.1.0/24'])).toBe(true);
    expect(isIpAllowed('192.168.1.255', ['192.168.1.0/24'])).toBe(true);
    expect(isIpAllowed('192.168.2.1', ['192.168.1.0/24'])).toBe(false);
  });

  it('should match CIDR /16 range', () => {
    expect(isIpAllowed('10.0.5.10', ['10.0.0.0/16'])).toBe(true);
    expect(isIpAllowed('10.1.0.1', ['10.0.0.0/16'])).toBe(false);
  });

  it('should support multiple entries', () => {
    const allowed = ['203.0.113.50', '10.0.0.0/8'];
    expect(isIpAllowed('203.0.113.50', allowed)).toBe(true);
    expect(isIpAllowed('10.5.5.5', allowed)).toBe(true);
    expect(isIpAllowed('172.16.0.1', allowed)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Endpoint Scope (glob matching) — local implementation (mirrors api-key-auth.ts)
// ---------------------------------------------------------------------------

function globMatch(str: string, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    return str.startsWith(pattern.slice(0, -1));
  }
  return str === pattern;
}

function isEndpointAllowed(endpoint: string, allowedEndpoints: string[]): boolean {
  if (!allowedEndpoints || allowedEndpoints.length === 0) return true;
  for (const pattern of allowedEndpoints) {
    if (globMatch(endpoint, pattern)) return true;
  }
  return false;
}

describe('Endpoint Scope (glob matching)', () => {
  it('should allow all endpoints when list is empty', () => {
    expect(isEndpointAllowed('/api/stocks', [])).toBe(true);
    expect(isEndpointAllowed('/api/sentiment-analysis', [])).toBe(true);
  });

  it('should match exact endpoints', () => {
    expect(isEndpointAllowed('/api/search', ['/api/search'])).toBe(true);
    expect(isEndpointAllowed('/api/stocks', ['/api/search'])).toBe(false);
  });

  it('should match wildcard patterns', () => {
    expect(isEndpointAllowed('/api/stocks', ['/api/stocks*'])).toBe(true);
    expect(isEndpointAllowed('/api/stock-ltp/RELIANCE.NS', ['/api/stock*'])).toBe(true);
    expect(isEndpointAllowed('/api/sentiment-analysis', ['/api/stocks*'])).toBe(false);
  });

  it('should match multiple patterns', () => {
    const patterns = ['/api/stocks*', '/api/market-*'];
    expect(isEndpointAllowed('/api/stocks', patterns)).toBe(true);
    expect(isEndpointAllowed('/api/market-movers', patterns)).toBe(true);
    expect(isEndpointAllowed('/api/market-mood', patterns)).toBe(true);
    expect(isEndpointAllowed('/api/sentiment-analysis', patterns)).toBe(false);
  });

  it('should match price-chart patterns', () => {
    expect(isEndpointAllowed('/api/price-chart/RELIANCE.NS', ['/api/price-chart/*'])).toBe(true);
    expect(isEndpointAllowed('/api/stocks', ['/api/price-chart/*'])).toBe(false);
  });
});
