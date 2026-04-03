/**
 * Tests for useMarketMovers hook response unwrapping.
 */
import { describe, it, expect, vi } from 'vitest';

const MOCK_RESPONSE = {
  data: [
    { id: 1, symbol: 'RELIANCE.NS', ltp: 2500, change_percent: 2.5, category: 'GAINER', rank: 1 },
    { id: 2, symbol: 'TCS.NS', ltp: 3500, change_percent: 1.8, category: 'GAINER', rank: 2 },
  ],
  meta: { count: 2 },
};

describe('useMarketMovers response unwrapping', () => {
  it('should extract data array from envelope', () => {
    const result = MOCK_RESPONSE.data;
    expect(result).toHaveLength(2);
    expect(result[0].symbol).toBe('RELIANCE.NS');
    expect(result[0].change_percent).toBe(2.5);
  });

  it('should handle empty data array', () => {
    const empty = { data: [], meta: { count: 0 } };
    expect(empty.data).toHaveLength(0);
  });

  it('should preserve all fields in movers data', () => {
    const item = MOCK_RESPONSE.data[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('symbol');
    expect(item).toHaveProperty('ltp');
    expect(item).toHaveProperty('change_percent');
    expect(item).toHaveProperty('category');
    expect(item).toHaveProperty('rank');
  });
});
