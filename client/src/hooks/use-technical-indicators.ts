import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/api-config';

interface TechnicalIndicators {
  // SMAs (20, 50, 100)
  sma_20: number | null;
  sma_50: number | null;
  sma_100: number | null;
  // EMAs (20, 50, 100)
  ema_20: number | null;
  ema_50: number | null;
  ema_100: number | null;
  macd_line: number | null;
  macd_signal: number | null;
  macd_histogram: number | null;
  rsi_14: number | null;
  atr_14: number | null;
  bb_upper_20: number | null;
  bb_middle_20: number | null;
  bb_lower_20: number | null;
  supertrend_7_3: number | null;
  supertrend_direction_7_3: number | null;
  supertrend_10_3: number | null;
  supertrend_direction_10_3: number | null;
  volume_sma_20: number | null;
}

interface TechnicalIndicatorsResponse {
  ticker: string;
  as_of: string;
  data_points: number;
  indicators: TechnicalIndicators;
}

export function useTechnicalIndicators(ticker: string | undefined) {
  const baseUrl = getApiBaseUrl();

  return useQuery<TechnicalIndicatorsResponse>({
    queryKey: ['technical-indicators', ticker],
    queryFn: async () => {
      if (!ticker) {
        throw new Error('Ticker is required');
      }

      const response = await fetch(`${baseUrl}/api/technical-indicators/${ticker}`);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to fetch technical indicators' }));
        throw new Error(error.detail || 'Failed to fetch technical indicators');
      }

      const envelope = await response.json();
      // Unwrap standardized { data } envelope
      return (envelope.data ?? envelope) as TechnicalIndicatorsResponse;
    },
    enabled: !!ticker,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}
