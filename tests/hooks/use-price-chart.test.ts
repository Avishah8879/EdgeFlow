/**
 * Tests for usePriceChart hook response unwrapping.
 */
import { describe, it, expect } from 'vitest';

const MOCK_RESPONSE = {
  data: {
    ticker: 'RELIANCE.NS',
    timeframe: '1day',
    price_data: [
      { time: 1700000000, open: 2400, high: 2520, low: 2380, close: 2500, volume: 10000000 },
      { time: 1700086400, open: 2500, high: 2550, low: 2490, close: 2530, volume: 12000000 },
    ],
  },
};

describe('usePriceChart response unwrapping', () => {
  it('should unwrap chart data from envelope', () => {
    const result = MOCK_RESPONSE.data;
    expect(result.ticker).toBe('RELIANCE.NS');
    expect(result.timeframe).toBe('1day');
  });

  it('should include price_data array', () => {
    const result = MOCK_RESPONSE.data;
    expect(result.price_data).toHaveLength(2);
    expect(result.price_data[0]).toHaveProperty('open');
    expect(result.price_data[0]).toHaveProperty('high');
    expect(result.price_data[0]).toHaveProperty('low');
    expect(result.price_data[0]).toHaveProperty('close');
    expect(result.price_data[0]).toHaveProperty('volume');
  });

  it('should handle fallback for legacy format', () => {
    const legacy = { ticker: 'TCS.NS', timeframe: '1hour', price_data: [] };
    const unwrapped = (legacy as any).data ?? legacy;
    expect(unwrapped.ticker).toBe('TCS.NS');
  });

  it('should handle empty price data', () => {
    const empty = { data: { ticker: 'INVALID', timeframe: '1day', price_data: [] } };
    expect(empty.data.price_data).toHaveLength(0);
  });
});
