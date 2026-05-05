import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { TrendingUp, ArrowRight, Bot, ExternalLink } from "lucide-react";
import { getEquityProAiUrl, EXTERNAL_LINK_PROPS } from "@/lib/external-links";

interface ActionCardsWidgetProps {
  ticker: string;
}

/**
 * ActionCardsWidget - Two-card CTA widget with hover-expand effect.
 *
 * Features:
 * - Generate Alpha card → opens EquityPro AI (external) in a new tab
 * - Tip Tease AI card → links to in-app Tip Tease chat with context
 * - Smooth hover expand animation (flex: 1 → flex: 4)
 * - Description and button revealed on hover
 */
export default function ActionCardsWidget({ ticker }: ActionCardsWidgetProps) {
  const equityProAiUrl = `${getEquityProAiUrl()}?ticker=${encodeURIComponent(ticker)}`;
  return (
    <div className="action-cards-widget h-full">
      {/* Generate Alpha — external EquityPro AI */}
      <a
        href={equityProAiUrl}
        {...EXTERNAL_LINK_PROPS}
        className="action-card"
        aria-label="Open EquityPro AI in a new tab"
      >
        <div className="action-card-header">
          <div className="action-card-icon">
            <TrendingUp className="w-4 h-4" />
          </div>
          <span className="action-card-title">Generate Alpha</span>
        </div>
        <div className="action-card-content">
          <p className="action-card-description">
            Build, backtest, and tune AI-driven strategies for {ticker} on the
            EquityPro AI platform. Opens in a new tab.
          </p>
          <Button size="sm" className="action-card-button gap-1">
            Open EquityPro AI
            <ExternalLink className="w-3 h-3" />
          </Button>
        </div>
      </a>

      {/* Tip Tease AI Card — in-app chat */}
      <Link
        href={`/tip-tease?context=${encodeURIComponent(ticker)}`}
        className="action-card"
      >
        <div className="action-card-header">
          <div className="action-card-icon">
            <Bot className="w-4 h-4" />
          </div>
          <span className="action-card-title">Tip Tease AI</span>
        </div>
        <div className="action-card-content">
          <p className="action-card-description">
            Ask AI about {ticker} stock, fundamentals, and market outlook.
          </p>
          <Button size="sm" className="action-card-button gap-1">
            Ask Tip Tease
            <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      </Link>
    </div>
  );
}
