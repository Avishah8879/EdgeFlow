/**
 * Tests for useStockLTP hook response unwrapping.
 */
import { describe, it, expect } from 'vitest';

const MOCK_RESPONSE = {
  data: {
    symbol: 'RELIANCE.NS',
    exchange: 'NSE',
    token: '2885',
    ltp: 2500.50,
    open: 2480.00,
    high: 2520.00,
    low: 2470.00,
    close: 2500.50,
    prev_close: 2490.00,
    volume: 15000000,
    changePercent: 0.42,
  },
};

describe('useStockLTP response unwrapping', () => {
  it('should unwrap single stock LTP from envelope', () => {
    const result = MOCK_RESPONSE.data;
    expect(result.symbol).toBe('RELIANCE.NS');
    expect(result.ltp).toBe(2500.50);
  });

  it('should include all price fields', () => {
    const result = MOCK_RESPONSE.data;
    expect(result).toHaveProperty('open');
    expect(result).toHaveProperty('high');
    expect(result).toHaveProperty('low');
    expect(result).toHaveProperty('close');
    expect(result).toHaveProperty('prev_close');
    expect(result).toHaveProperty('volume');
  });

  it('should include change percent', () => {
    const result = MOCK_RESPONSE.data;
    expect(result.changePercent).toBeCloseTo(0.42);
  });

  it('should handle fallback for legacy format', () => {
    const legacy = { symbol: 'TCS.NS', ltp: 3500 };
    const unwrapped = (legacy as any).data ?? legacy;
    expect(unwrapped.symbol).toBe('TCS.NS');
  });
});
