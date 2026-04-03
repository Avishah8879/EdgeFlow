/**
 * Tests for the API response unwrap utility.
 *
 * This utility extracts .data from the standardized { data, meta } envelope
 * and provides error detection for { error: { code, message } } responses.
 */

import { describe, it, expect } from 'vitest';

// We'll test the utility functions directly once created.
// For now, define the expected behavior as spec tests.

// Placeholder: will import from '@/lib/api-utils' once created
function unwrapResponse<T>(response: { data: T; meta?: any }): T {
  return response.data;
}

function isErrorResponse(response: any): response is { error: { code: string; message: string } } {
  return response && typeof response === 'object' && 'error' in response && !('data' in response);
}

function getErrorMessage(response: any): string | null {
  if (isErrorResponse(response)) {
    return response.error.message;
  }
  return null;
}

// ─── unwrapResponse ─────────────────────────────────────────────────────────

describe('unwrapResponse', () => {
  it('should extract data array from list endpoint envelope', () => {
    const response = {
      data: [
        { id: 1, symbol: 'RELIANCE.NS', ltp: 2500 },
        { id: 2, symbol: 'TCS.NS', ltp: 3500 },
      ],
      meta: { count: 2, total: 100, page: 1, limit: 30, has_more: true },
    };

    const result = unwrapResponse(response);
    expect(result).toHaveLength(2);
    expect(result[0].symbol).toBe('RELIANCE.NS');
  });

  it('should extract data object from single resource envelope', () => {
    const response = {
      data: {
        status: 'live',
        current: { value: 65, category: 'Greed', timestamp: '2026-02-16T10:00:00Z' },
        series: [],
        error: null,
      },
    };

    const result = unwrapResponse(response);
    expect(result.status).toBe('live');
    expect(result.current.value).toBe(65);
  });

  it('should handle empty array data', () => {
    const response = {
      data: [],
      meta: { count: 0, total: 0, page: 999, limit: 30, has_more: false },
    };

    const result = unwrapResponse(response);
    expect(result).toEqual([]);
  });

  it('should preserve nested data structure', () => {
    const response = {
      data: {
        ticker: 'RELIANCE.NS',
        timeframe: '1day',
        price_data: [
          { time: 1700000000, open: 2400, high: 2550, low: 2380, close: 2500, volume: 1000000 },
        ],
      },
    };

    const result = unwrapResponse(response);
    expect(result.ticker).toBe('RELIANCE.NS');
    expect(result.price_data).toHaveLength(1);
    expect(result.price_data[0].close).toBe(2500);
  });
});

// ─── isErrorResponse ────────────────────────────────────────────────────────

describe('isErrorResponse', () => {
  it('should detect error envelope', () => {
    const response = {
      error: { code: 'TICKER_NOT_FOUND', message: "Ticker 'XYZ' not found" },
    };
    expect(isErrorResponse(response)).toBe(true);
  });

  it('should not flag success envelope as error', () => {
    const response = {
      data: [{ id: 1 }],
      meta: { count: 1 },
    };
    expect(isErrorResponse(response)).toBe(false);
  });

  it('should not flag null/undefined as error', () => {
    expect(isErrorResponse(null)).toBeFalsy();
    expect(isErrorResponse(undefined)).toBeFalsy();
  });

  it('should not flag empty object as error', () => {
    expect(isErrorResponse({})).toBe(false);
  });
});

// ─── getErrorMessage ────────────────────────────────────────────────────────

describe('getErrorMessage', () => {
  it('should extract message from error response', () => {
    const response = {
      error: { code: 'RATE_LIMITED', message: 'Too many requests' },
    };
    expect(getErrorMessage(response)).toBe('Too many requests');
  });

  it('should return null for success response', () => {
    const response = { data: { status: 'ok' } };
    expect(getErrorMessage(response)).toBeNull();
  });
});
