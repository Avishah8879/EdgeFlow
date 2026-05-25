/**
 * Curated 2–6 char "ticker mark" abbreviations for high-traffic NSE tickers.
 *
 * Used by `TickerMark.tsx` for the hero badge on the stock-detail page.
 * Approved 2026-05-18 for 45 NIFTY 50 + 7 high-volume non-NIFTY entries.
 *
 * **Maintenance:** refresh roughly yearly when NIFTY 50 rebalances or when
 * new high-volume names emerge. Single-file edit; no codegen, no migration.
 *
 * **Lookup contract:** keys are uppercase NSE symbols (e.g. "RELIANCE",
 * "BAJAJ-AUTO", "M&M"). Verified 2026-05-18 against `tickers.symbol` —
 * column stores bare uppercase symbols with no `.NS` / `.BO` suffixes
 * (3,175-row scan returned 0 dot-suffixed rows). The `-EQ` series suffix
 * lives in a separate column.
 *
 * **Fallback:** unknown symbols use `symbol.slice(0, 3)` — preserves brand
 * recognition for 3-char tickers (ITC, TCS, NTPC, ONGC, …) while keeping
 * 4+ char tickers compact (HDFCBANK → "HDF" if not curated).
 */
export const TICKER_SHORT_FORMS: Record<string, string> = {
  // NIFTY 50 — curated entries where slice(0,3) loses brand recognition
  ADANIENT:    "ADANI",
  ADANIPORTS:  "APSEZ",
  APOLLOHOSP:  "APOLLO",
  ASIANPAINT:  "APL",
  AXISBANK:    "AXIS",
  "BAJAJ-AUTO": "BJAUT",
  BAJAJFINSV:  "BFS",
  BAJFINANCE:  "BAF",
  BHARTIARTL:  "AIRTEL",
  BPCL:        "BPCL",
  BRITANNIA:   "BRIT",
  CIPLA:       "CIPLA",
  COALINDIA:   "CIL",
  DIVISLAB:    "DIVIS",
  DRREDDY:     "DRL",
  EICHERMOT:   "EICHER",
  GRASIM:      "GRASIM",
  HCLTECH:     "HCL",
  HDFCBANK:    "HDFC",
  HDFCLIFE:    "HDFCL",
  HEROMOTOCO:  "HERO",
  HINDALCO:    "HINDAL",
  HINDUNILVR:  "HUL",
  ICICIBANK:   "ICICI",
  INDUSINDBK:  "INDUS",
  INFY:        "INFY",
  JSWSTEEL:    "JSW",
  KOTAKBANK:   "KOTAK",
  LTIM:        "LTIM",
  MARUTI:      "MARUTI",
  NESTLEIND:   "NESTLE",
  NTPC:        "NTPC",
  ONGC:        "ONGC",
  POWERGRID:   "PGCIL",
  RELIANCE:    "RIL",
  SBILIFE:     "SBIL",
  SBIN:        "SBI",
  SHRIRAMFIN:  "SHF",
  TATACONSUM:  "TCP",
  TATAMOTORS:  "TML",
  TATASTEEL:   "TSL",
  TECHM:       "TECHM",
  TITAN:       "TITAN",
  ULTRACEMCO:  "UTCL",
  WIPRO:       "WIPRO",

  // High-volume non-NIFTY-50
  ADANIGREEN:  "AGEL",
  GODREJCP:    "GCPL",
  IRCTC:       "IRCTC",
  PIDILITIND:  "PIDILITE",
  TATAPOWER:   "TPCL",
  ZEEL:        "ZEEL",
};

/**
 * Resolve a 2–6 char display abbreviation for an NSE ticker symbol.
 * Uses the curated map first; falls back to `symbol.slice(0, 3)` for
 * unknown symbols. Always returns uppercase.
 */
export function getTickerShortForm(symbol: string): string {
  const upper = symbol.toUpperCase();
  return TICKER_SHORT_FORMS[upper] ?? upper.slice(0, 3);
}
