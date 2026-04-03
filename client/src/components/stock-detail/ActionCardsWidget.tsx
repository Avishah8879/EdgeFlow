import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { TrendingUp, ArrowRight, Bot } from "lucide-react";

interface ActionCardsWidgetProps {
  ticker: string;
}

/**
 * ActionCardsWidget - Two-card CTA widget with hover-expand effect.
 *
 * Features:
 * - Generate Alpha card → links to Strategy Backtesting
 * - TipTease AI card → links to TipTease chat with context
 * - Smooth hover expand animation (flex: 1 → flex: 4)
 * - Description and button revealed on hover
 */
export default function ActionCardsWidget({ ticker }: ActionCardsWidgetProps) {
  return (
    <div className="action-cards-widget h-full">
      {/* Generate Alpha Card */}
      <Link
        href={`/alpha-generation?ticker=${encodeURIComponent(ticker)}`}
        className="action-card"
      >
        <div className="action-card-header">
          <div className="action-card-icon">
            <TrendingUp className="w-4 h-4" />
          </div>
          <span className="action-card-title">Generate Alpha</span>
        </div>
        <div className="action-card-content">
          <p className="action-card-description">
            Run AI-powered strategy optimization using {ticker}'s historical data.
          </p>
          <Button size="sm" className="action-card-button gap-1">
            Generate Strategy
            <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      </Link>

      {/* TipHub AI Card */}
      <Link
        href={`/tip-tease?context=${encodeURIComponent(ticker)}`}
        className="action-card"
      >
        <div className="action-card-header">
          <div className="action-card-icon">
            <Bot className="w-4 h-4" />
          </div>
          <span className="action-card-title">TipHub AI</span>
        </div>
        <div className="action-card-content">
          <p className="action-card-description">
            Ask AI about {ticker} stock, fundamentals, and market outlook.
          </p>
          <Button size="sm" className="action-card-button gap-1">
            Ask TipHub
            <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      </Link>
    </div>
  );
}
