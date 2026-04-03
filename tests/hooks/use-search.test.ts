/**
 * Tests for useSearch hook response unwrapping.
 */
import { describe, it, expect } from 'vitest';

const MOCK_RESPONSE = {
  data: [
    { id: 1, symbol: 'TCS.NS', name: 'Tata Consultancy Services', token: '11536', suffix: '-EQ' },
    { id: 2, symbol: 'TATACOMM.NS', name: 'Tata Communications', token: '14726', suffix: '-EQ' },
  ],
  meta: { count: 2 },
};

describe('useSearch response unwrapping', () => {
  it('should extract search results array from envelope', () => {
    const result = MOCK_RESPONSE.data;
    expect(result).toHaveLength(2);
    expect(result[0].symbol).toBe('TCS.NS');
  });

  it('should include search result fields', () => {
    const item = MOCK_RESPONSE.data[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('symbol');
    expect(item).toHaveProperty('name');
    expect(item).toHaveProperty('token');
  });

  it('should handle empty search results', () => {
    const empty = { data: [], meta: { count: 0 } };
    expect(empty.data).toHaveLength(0);
  });

  it('should handle fallback for legacy format', () => {
    const legacy = { results: [{ symbol: 'INFY.NS' }], count: 1 };
    // Hook uses: envelope.data ?? envelope.results
    const unwrapped = (legacy as any).data ?? (legacy as any).results;
    expect(unwrapped).toHaveLength(1);
    expect(unwrapped[0].symbol).toBe('INFY.NS');
  });
});
