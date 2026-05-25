/**
 * Built-in Expert Screener sample templates.
 *
 * Lifted from the previously-inline list in SampleTemplates.tsx so that the
 * Sample Templates UI component can serve both Expert and Fundamental
 * screeners via a `templates` prop. Mirrored on the backend in
 * `get_expert_screener_templates()` at main.py (without icons).
 */
import {
  TrendingUp,
  Activity,
  BarChart3,
  Crosshair,
  Minimize2,
  LineChart,
  TrendingDown,
  Rocket,
} from "lucide-react";
import type { SampleTemplate } from "@/components/expert-screener/SampleTemplates";

export const EXPERT_SAMPLE_TEMPLATES: SampleTemplate[] = [
  {
    id: "momentum_liquidity",
    name: "Momentum & Liquidity",
    description: "Strong trend with large cash participation",
    expression: "(close > ema_50) and (ema_50 > ema_150) and (liquidity > 1000000000)",
    Icon: TrendingUp,
  },
  {
    id: "rsi_pullback",
    name: "RSI Pullback",
    description: "Oversold dip within a long-term uptrend",
    expression: "(close > sma_200) and (rsi_14 >= 35 and rsi_14 <= 50)",
    Icon: Activity,
  },
  {
    id: "52w_breakout",
    name: "52W Breakout Watch",
    description: "Price reclaiming prior highs on rising RSI",
    expression: "(close > 0.9 * high_52_W) and (ema_20 > ema_50)",
    Icon: BarChart3,
  },
  {
    id: "golden_cross",
    name: "Golden Cross Setup",
    description: "Classic bullish crossover with liquidity confirmation",
    expression: "(ema_50 > ema_200) and (close > ema_50) and (liquidity > 500000000)",
    Icon: Crosshair,
  },
  {
    id: "volatility_squeeze",
    name: "Volatility Squeeze",
    description: "Tight Bollinger Bands signaling a potential breakout",
    expression: "((bb_upper_20_2 - bb_lower_20_2) / bb_middle_20_2 < 0.1) and (close > sma_50)",
    Icon: Minimize2,
  },
  {
    id: "macd_bullish_crossover",
    name: "MACD Bullish Crossover",
    description: "Momentum shift catching early trend reversals",
    expression:
      "(macd_line > macd_signal) and (macd_histogram > 0) and (close > ema_50) and (rsi_14 > 50)",
    Icon: LineChart,
  },
  {
    id: "oversold_reversal",
    name: "Oversold Reversal",
    description: "Deeply oversold names showing signs of a bounce",
    expression: "(rsi_14 < 30) and (close > low_20_D) and (liquidity > 100000000)",
    Icon: TrendingDown,
  },
  {
    id: "ath_momentum",
    name: "ATH Momentum",
    description: "Stocks at new highs with stacked moving averages",
    expression:
      "(close >= high_52_W) and (close > ema_20) and (ema_20 > ema_50) and (ema_50 > ema_200)",
    Icon: Rocket,
  },
];
