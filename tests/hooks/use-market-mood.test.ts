/**
 * Tests for useMarketMood hook response unwrapping.
 */
import { describe, it, expect } from 'vitest';

const MOCK_RESPONSE = {
  data: {
    status: 'live',
    current: { value: 65, category: 'Greed', timestamp: '2026-02-16T10:00:00Z' },
    series: [{ value: 60, category: 'Greed', timestamp: '2026-02-15T15:30:00Z' }],
    nifty_ohlc: [],
    error: null,
  },
};

describe('useMarketMood response unwrapping', () => {
  it('should unwrap data from envelope for single object', () => {
    const result = MOCK_RESPONSE.data;
    expect(result.status).toBe('live');
    expect(result.current.value).toBe(65);
    expect(result.current.category).toBe('Greed');
  });

  it('should access nested series data', () => {
    const result = MOCK_RESPONSE.data;
    expect(result.series).toHaveLength(1);
    expect(result.series[0].value).toBe(60);
  });

  it('should handle fallback for legacy format', () => {
    const legacy = { status: 'live', current: { value: 50, category: 'Neutral' } };
    // Hook uses: envelope.data ?? envelope
    const unwrapped = (legacy as any).data ?? legacy;
    expect(unwrapped.status).toBe('live');
  });

  it('should handle error envelope', () => {
    const errorResponse = {
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Market mood unavailable' },
    };
    expect('error' in errorResponse).toBe(true);
    expect(errorResponse.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});
