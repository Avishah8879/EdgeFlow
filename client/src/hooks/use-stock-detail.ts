import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-config";

export interface StockDetailData {
  ticker: string;
  basic_info: {
    id: number;
    symbol: string;
    name: string;
    long_name: string | null;
    exchange: string;
    sector: string | null;
    industry: string | null;
    website: string | null;
    description: string | null;
    suffix: string | null;
  };
  has_proprietary_report: boolean;
  proprietary_analysis: {
    ticker_symbol: string;
    sector: string | null;
    performance_benchmark: number | null;
    performance_pct_of_benchmark: number | null;
    valuation_dcf: number | null;
    valuation_metric: string | null;
    growth_expected_vs_projections: number | null;
    growth_vs_sector_rate: number | null;
    growth_notes: string | null;
    profitability_pct_of_revenue: number | null;
    profitability_metric: string | null;
    analyst_recommendation: string | null;
    entry_point: number | null;
    target_price: number | null;
    reverse_dcf: number | null;
    pdf_file_name: string | null;
    pdf_file_size: number | null;
    analysis_date: string | null;
    analyst_name: string | null;
    report_title: string | null;
    notes: string | null;
  } | null;
  fundamentals: {
    current_price: number | null;
    previous_close: number | null;
    price_change: number | null;
    price_change_percent: number | null;
    open_price: number | null;
    day_high: number | null;
    day_low: number | null;
    fifty_two_week_high: number | null;
    fifty_two_week_low: number | null;
    market_cap: number | null;
    enterprise_value: number | null;
    trailing_pe: number | null;
    forward_pe: number | null;
    price_to_book: number | null;
    price_to_sales: number | null;
    peg_ratio: number | null;
    profit_margin: number | null;
    operating_margin: number | null;
    return_on_assets: number | null;
    return_on_equity: number | null;
    revenue_growth: number | null;
    earnings_growth: number | null;
    total_cash: number | null;
    total_debt: number | null;
    debt_to_equity: number | null;
    current_ratio: number | null;
    quick_ratio: number | null;
    shares_outstanding: number | null;
    float_shares: number | null;
    dividend_rate: number | null;
    dividend_yield: number | null;
    payout_ratio: number | null;
    ex_dividend_date: string | null;
    volume: number | null;
    avg_volume: number | null;
    last_updated: string | null;
  };
  technicals: {
    sma_20: number | null;
    sma_50: number | null;
    sma_100: number | null;
    sma_200: number | null;
    ema_9: number | null;
    ema_12: number | null;
    ema_26: number | null;
    ema_50: number | null;
    ema_200: number | null;
    macd_line: number | null;
    macd_signal: number | null;
    macd_histogram: number | null;
    rsi_14: number | null;
    atr_14: number | null;
    supertrend_7_3: number | null;
    supertrend_direction_7_3: number | null;
    supertrend_10_3: number | null;
    supertrend_direction_10_3: number | null;
    bb_upper_20: number | null;
    bb_middle_20: number | null;
    bb_lower_20: number | null;
    volume_sma_20: number | null;
    indicator_timestamp: string | null;
  };
  financials: {
    income_statement: Record<string, any> | null;
    balance_sheet: Record<string, any> | null;
    cash_flow: Record<string, any> | null;
    quarterly_financials: Record<string, any> | null;
    dividends_history: Record<string, any> | null;
  };
  external_analyst: {
    ticker: string;
    company_name: string | null;
    analyst_ratings: {
      recommendation: string | null;
      recommendation_mean: number | null;
      number_of_analysts: number | null;
      target_mean_price: number | null;
      target_high_price: number | null;
      target_low_price: number | null;
      target_median_price: number | null;
      current_price: number | null;
    };
    research_reports: Array<{
      date: string | null;
      firm: string | null;
      to_grade: string | null;
      from_grade: string | null;
      action: string | null;
    }>;
    earnings_calendar: Array<{
      label: string;
      value: string | number | null;
    }>;
    earnings_dates: Array<{
      date: string | null;
      eps_actual: number | null;
      eps_estimate: number | null;
      surprise_percent: number | null;
    }>;
    announcements: Array<{
      title: string | null;
      publisher: string | null;
      link: string | null;
      published_at: string | null;
      type: string | null;
    }>;
    curated_picks: Array<{
      ticker: string;
      name: string | null;
      recommendation: string | null;
      score: number | null;
      price: number | null;
      target_price: number | null;
      upside_percent: number | null;
    }>;
  } | null;
}

export function useStockDetail(ticker: string | undefined) {
  return useQuery<StockDetailData>({
    queryKey: ["stock-detail", ticker],
    queryFn: async () => {
      if (!ticker) {
        throw new Error("Ticker is required");
      }

      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/stock-detail/${encodeURIComponent(ticker)}`);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to fetch stock detail: ${res.status} ${errorText}`);
      }

      const envelope = await res.json();
      return envelope.data ?? envelope;
    },
    enabled: !!ticker,
    staleTime: 1000 * 60 * 5, // 5 minutes
    placeholderData: (previousData) => {
      // Only keep previous data if it's for the same ticker
      return previousData?.ticker === ticker ? previousData : undefined;
    },
    retry: 2,
  });
}
