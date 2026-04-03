// Market Movers Data Types

export interface MarketMover {
  id: number;
  ticker_id: number;
  symbol: string;
  ltp: number;
  change_percent: number | null;
  change_amount: number | null;
  trade_volume: number | null;
  lower_circuit: number | null;
  upper_circuit: number | null;
  week_52_low: number | null;
  week_52_high: number | null;
  proximity_percent: number | null;
  category: string;
  rank: number;
  snapshot_time: string;
  // Fundamentals from JOIN with stock_fundamentals
  market_cap: number | null;
  trailing_pe: number | null;
  price_to_book: number | null;
  dividend_yield: number | null;
  sector: string | null;
  industry: string | null;
  long_name: string | null;
}

export interface ApiMeta {
  count?: number;
  total?: number;
  page?: number;
  limit?: number;
  has_more?: boolean;
  [key: string]: unknown;
}

export interface MarketMoversResponse {
  data: MarketMover[];
  meta: ApiMeta;
}

export type CategoryType =
  | 'GAINER'
  | 'LOSER'
  | 'VOLUME_GAINER'
  | 'NEAR_52W_HIGH'
  | 'NEAR_52W_LOW';

// Stocks Data Types

export interface Stock {
  id: number;
  symbol: string;
  name: string;
  long_name: string | null;
  exchange: string;
  sector: string | null;
  industry: string | null;
  is_active: boolean;
  current_price: number | null;
  previous_close: number | null;
  price_change: number | null;
  price_change_percent: number | null;
  market_cap: number | null;
  trailing_pe: number | null;
  forward_pe: number | null;
  price_to_book: number | null;
  price_to_sales: number | null;
  peg_ratio: number | null;
  dividend_yield: number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
}

export interface StocksResponse {
  data: Stock[];
  meta: ApiMeta;
}

export type CapType = 'all' | 'large' | 'mid' | 'small';

// Real-Time LTP (Last Traded Price) Data Types

export interface StockLTP {
  ticker_id: number;
  symbol: string;
  exchange: string;
  token: string;
  ltp: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;  // Current close
  percent_change: number | null;  // Pre-computed percentage change
  trade_volume: number | null;
  lower_circuit: number | null;
  upper_circuit: number | null;
  week_52_low: number | null;
  week_52_high: number | null;
  timestamp: string;
}

// Indices Data Types

export interface Index {
  id: string;
  name: string;
  symbol: string;
  value: number;
  change: number;
  changePercent: number;
}

export interface IndicesResponse {
  data: Index[];
  meta: ApiMeta;
}

// Price Chart Data Types

export interface PriceChartDataPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface PriceChartData {
  ticker: string;
  ticker_name?: string;
  timeframe: string;
  price_data: PriceChartDataPoint[];
  error?: string;
}

export interface PriceChartResponse {
  data: PriceChartData;
}

export type TimeRange = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y";

export interface ChartPreferences {
  showVolume: boolean;
  showLegend: boolean;
}
