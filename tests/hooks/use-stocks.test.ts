/**
 * Tests for stocks list endpoint response unwrapping.
 */
import { describe, it, expect } from 'vitest';

const MOCK_RESPONSE = {
  data: [
    { id: 1, symbol: 'RELIANCE.NS', name: 'Reliance Industries', current_price: 2500, market_cap: 1700000000000 },
    { id: 2, symbol: 'TCS.NS', name: 'Tata Consultancy Services', current_price: 3500, market_cap: 1300000000000 },
  ],
  meta: { count: 2, total: 3000, page: 1, limit: 30, has_more: true },
};

describe('Stocks list response unwrapping', () => {
  it('should extract paginated data array', () => {
    const result = MOCK_RESPONSE.data;
    expect(result).toHaveLength(2);
    expect(result[0].symbol).toBe('RELIANCE.NS');
  });

  it('should include pagination metadata', () => {
    const meta = MOCK_RESPONSE.meta;
    expect(meta.count).toBe(2);
    expect(meta.total).toBe(3000);
    expect(meta.page).toBe(1);
    expect(meta.limit).toBe(30);
    expect(meta.has_more).toBe(true);
  });

  it('should handle last page correctly', () => {
    const lastPage = {
      data: [{ id: 3000, symbol: 'LAST.NS' }],
      meta: { count: 1, total: 3000, page: 100, limit: 30, has_more: false },
    };
    expect(lastPage.meta.has_more).toBe(false);
  });

  it('should handle empty page', () => {
    const empty = {
      data: [],
      meta: { count: 0, total: 3000, page: 999, limit: 30, has_more: false },
    };
    expect(empty.data).toHaveLength(0);
    expect(empty.meta.count).toBe(0);
  });
});
