/**
 * Field catalog for Expert Screener and Fundamental Scanner.
 * Single source of truth — used by the visual builder field picker AND
 * available as a lookup for the parser/compiler.
 *
 * Expert fields use flat naming (ema_50, rsi_14, bb_upper_20_2). Fields that
 * accept a period are defined once here with hasPeriod=true; the builder
 * lets the user pick/type the period and the compiler emits `<name>_<period>`.
 * Fields with a fixed suffix (macd_line, high_52_W) are listed as suffixOnly
 * entries so the user picks them whole from the dropdown.
 */

import type { FieldDef } from "./types";

// ── Expert Screener catalog ────────────────────────────────────────────────

export const EXPERT_FIELDS: FieldDef[] = [
  // Price / OHLCV
  { name: "close", label: "Close", group: "Price & Volume" },
  { name: "volume", label: "Volume", group: "Price & Volume" },
  { name: "liquidity", label: "Liquidity (close × volume)", group: "Price & Volume" },

  // SMA
  {
    name: "sma",
    label: "SMA",
    group: "Moving Averages",
    hasPeriod: true,
    defaultPeriod: 50,
    commonPeriods: [20, 50, 100, 200],
  },

  // EMA
  {
    name: "ema",
    label: "EMA",
    group: "Moving Averages",
    hasPeriod: true,
    defaultPeriod: 50,
    commonPeriods: [9, 12, 20, 26, 50, 150, 200],
  },

  // RSI
  {
    name: "rsi",
    label: "RSI",
    group: "Oscillators",
    hasPeriod: true,
    defaultPeriod: 14,
    commonPeriods: [7, 14, 21],
  },

  // ATR
  {
    name: "atr",
    label: "ATR",
    group: "Volatility",
    hasPeriod: true,
    defaultPeriod: 14,
    commonPeriods: [7, 14, 21],
  },

  // MACD (fixed suffixes)
  { name: "macd_line", label: "MACD Line", group: "Oscillators", suffixOnly: true },
  { name: "macd_signal", label: "MACD Signal", group: "Oscillators", suffixOnly: true },
  { name: "macd_histogram", label: "MACD Histogram", group: "Oscillators", suffixOnly: true },

  // Bollinger Bands (fixed common suffixes)
  { name: "bb_upper_20_2", label: "Bollinger Upper (20, 2)", group: "Volatility", suffixOnly: true },
  { name: "bb_middle_20_2", label: "Bollinger Middle (20, 2)", group: "Volatility", suffixOnly: true },
  { name: "bb_lower_20_2", label: "Bollinger Lower (20, 2)", group: "Volatility", suffixOnly: true },

  // Supertrend
  { name: "supertrend_7_3", label: "Supertrend (7, 3)", group: "Trend", suffixOnly: true },
  { name: "supertrend_10_3", label: "Supertrend (10, 3)", group: "Trend", suffixOnly: true },
  { name: "supertrend_direction_7_3", label: "Supertrend Direction (7, 3)", group: "Trend", suffixOnly: true },
  { name: "supertrend_direction_10_3", label: "Supertrend Direction (10, 3)", group: "Trend", suffixOnly: true },

  // 52 Week
  { name: "high_52_W", label: "52-Week High", group: "52-Week Levels", suffixOnly: true },
  { name: "low_52_W", label: "52-Week Low", group: "52-Week Levels", suffixOnly: true },
];

// ── Fundamental Scanner catalog ────────────────────────────────────────────

export const FUNDAMENTAL_FIELDS: FieldDef[] = [
  // Valuation
  { name: "market_cap", label: "Market Cap", group: "Valuation", suffixOnly: true },
  { name: "trailing_pe", label: "Trailing P/E", group: "Valuation", suffixOnly: true },
  { name: "forward_pe", label: "Forward P/E", group: "Valuation", suffixOnly: true },
  { name: "price_to_book", label: "Price / Book", group: "Valuation", suffixOnly: true },
  { name: "price_to_sales", label: "Price / Sales", group: "Valuation", suffixOnly: true },
  { name: "peg_ratio", label: "PEG Ratio", group: "Valuation", suffixOnly: true },
  { name: "enterprise_value", label: "Enterprise Value", group: "Valuation", suffixOnly: true },

  // Profitability
  { name: "profit_margin", label: "Profit Margin %", group: "Profitability", suffixOnly: true },
  { name: "operating_margin", label: "Operating Margin %", group: "Profitability", suffixOnly: true },
  { name: "return_on_equity", label: "Return on Equity %", group: "Profitability", suffixOnly: true },
  { name: "return_on_assets", label: "Return on Assets %", group: "Profitability", suffixOnly: true },

  // Growth
  { name: "earnings_growth", label: "Earnings Growth %", group: "Growth", suffixOnly: true },
  { name: "revenue_growth", label: "Revenue Growth %", group: "Growth", suffixOnly: true },

  // Dividends
  { name: "dividend_yield", label: "Dividend Yield %", group: "Dividends", suffixOnly: true },
  { name: "dividend_rate", label: "Dividend Rate", group: "Dividends", suffixOnly: true },
  { name: "payout_ratio", label: "Payout Ratio %", group: "Dividends", suffixOnly: true },

  // Debt & Liquidity
  { name: "debt_to_equity", label: "Debt / Equity", group: "Debt & Liquidity", suffixOnly: true },
  { name: "current_ratio", label: "Current Ratio", group: "Debt & Liquidity", suffixOnly: true },
  { name: "quick_ratio", label: "Quick Ratio", group: "Debt & Liquidity", suffixOnly: true },
  { name: "total_cash", label: "Total Cash", group: "Debt & Liquidity", suffixOnly: true },
  { name: "total_debt", label: "Total Debt", group: "Debt & Liquidity", suffixOnly: true },

  // Other
  { name: "avg_volume", label: "Avg Volume", group: "Other", suffixOnly: true },
  { name: "shares_outstanding", label: "Shares Outstanding", group: "Other", suffixOnly: true },
];

export function getFieldCatalog(variant: "expert" | "fundamental"): FieldDef[] {
  return variant === "expert" ? EXPERT_FIELDS : FUNDAMENTAL_FIELDS;
}

/** Group an array of FieldDef by their `.group` key, preserving input order. */
export function groupFields(fields: FieldDef[]): Array<{ group: string; fields: FieldDef[] }> {
  const order: string[] = [];
  const bucket = new Map<string, FieldDef[]>();
  for (const f of fields) {
    if (!bucket.has(f.group)) {
      bucket.set(f.group, []);
      order.push(f.group);
    }
    bucket.get(f.group)!.push(f);
  }
  return order.map((g) => ({ group: g, fields: bucket.get(g)! }));
}

/**
 * Try to resolve a flat compiled field string (e.g. "ema_50", "trailing_pe")
 * back to a FieldDef + period. Returns null if not recognised.
 */
export function resolveFieldName(
  name: string,
  variant: "expert" | "fundamental",
): { def: FieldDef; period?: number } | null {
  const catalog = getFieldCatalog(variant);

  // suffixOnly exact match first (so bb_upper_20_2 wins over "bb_upper")
  const exact = catalog.find((f) => f.suffixOnly && f.name === name);
  if (exact) return { def: exact };

  // Plain fields like "close" / "volume" / "trailing_pe"
  const plain = catalog.find((f) => !f.hasPeriod && !f.suffixOnly && f.name === name);
  if (plain) return { def: plain };

  // hasPeriod: match name_<number>
  const m = name.match(/^([a-zA-Z_]+)_(\d+)$/);
  if (m) {
    const [, base, periodStr] = m;
    const def = catalog.find((f) => f.hasPeriod && f.name === base);
    if (def) {
      return { def, period: parseInt(periodStr, 10) };
    }
  }

  return null;
}
