/**
 * Built-in Fundamental Scanner sample templates.
 *
 * Replaces the four hard-coded `fundamentalPresets` chips that previously
 * lived inline in FundamentalScreenerTab.tsx. Same data shape as
 * EXPERT_SAMPLE_TEMPLATES so a single <SampleTemplates> component can
 * render either set.
 *
 * Audit trail (previous chips → new cards):
 *   - "Value Pick"              → kept as `value_pick`
 *   - "Growth Monster"          → kept as `growth_monster`
 *   - "Low Debt Quality"        → broadened to `quality_compounder`
 *   - "Large Cap Dividend"      → split into `dividend_aristocrat` + `large_cap_safe`
 *
 * Note on `large_cap_safe`: market_cap > 100000000000 (~₹1 lakh crore) is
 * tight — ~50-60 NSE names qualify. If too narrow in practice, drop the
 * threshold to 50000000000 in a follow-up. Flagged but not changed here.
 */
import {
  TrendingDown,
  Sparkles,
  Rocket,
  Coins,
  ShieldCheck,
} from "lucide-react";
import type { SampleTemplate } from "@/components/expert-screener/SampleTemplates";

export const FUNDAMENTAL_SAMPLE_TEMPLATES: SampleTemplate[] = [
  {
    id: "value_pick",
    name: "Value Pick",
    description: "Cheap on P/E + P/B with a dividend floor",
    expression: "(trailing_pe < 15) and (price_to_book < 2) and (dividend_yield > 1)",
    Icon: TrendingDown,
  },
  {
    id: "quality_compounder",
    name: "Quality Compounder",
    description: "High returns on equity with conservative leverage",
    expression: "(return_on_equity > 18) and (debt_to_equity < 0.5) and (profit_margin > 12)",
    Icon: Sparkles,
  },
  {
    id: "growth_monster",
    name: "Growth Monster",
    description: "Top-line + bottom-line growth with strong ROE",
    expression: "(earnings_growth > 20) and (revenue_growth > 15) and (return_on_equity > 15)",
    Icon: Rocket,
  },
  {
    id: "dividend_aristocrat",
    name: "Dividend Aristocrat",
    description: "High yield with sustainable payout",
    expression: "(dividend_yield > 3) and (payout_ratio < 60) and (profit_margin > 10)",
    Icon: Coins,
  },
  {
    id: "large_cap_safe",
    name: "Large-Cap Safe Haven",
    description: "Big, profitable, liquid",
    expression:
      "(market_cap > 100000000000) and (current_ratio > 1.5) and (profit_margin > 10)",
    Icon: ShieldCheck,
  },
];
