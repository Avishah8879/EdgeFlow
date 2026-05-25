import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/SectionHeader";
import AskAIInput from "./AskAIInput";
import ExamplePrompts from "./ExamplePrompts";
import TodaySummary from "./TodaySummary";
import ContextualHint from "./ContextualHint";
import type { TipTeaseSummary } from "@/hooks/use-tip-tease-chat";

interface HeroSectionProps {
  onSendMessage: (message: string) => void;
  summary: TipTeaseSummary | null;
  isLoading?: boolean;
  disabled?: boolean;
}

/**
 * Hero section for TipTease - displayed when no messages yet.
 * Features tagline, input, example prompts, and today's summary.
 */
export default function HeroSection({
  onSendMessage,
  summary,
  isLoading,
  disabled,
}: HeroSectionProps) {
  const handleHintClick = () => {
    if (summary?.hint) {
      // Convert hint to a question
      const question = summary.hint.replace(" - ask why?", "").replace(" - ask what's happening?", "").replace(" - want to know more?", "");
      onSendMessage(`Why is ${question}?`);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <SectionHeader
          title="EquityPro AI"
          description="AI-powered financial insights for Indian markets"
          size="lg"
        />
      </div>

      {/* Main content card */}
      <Card className="max-w-3xl mx-auto p-8 space-y-6">
        {/* Main input */}
        <AskAIInput
          onSend={onSendMessage}
          placeholder="Ask anything about stocks, markets, or investing..."
          disabled={disabled}
        />

        {/* Contextual hint */}
        {summary?.hint && (
          <div className="flex justify-center">
            <ContextualHint hint={summary.hint} onClick={handleHintClick} />
          </div>
        )}

        {/* Example prompts */}
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground text-center">
            Try asking:
          </p>
          <ExamplePrompts onSelect={onSendMessage} disabled={disabled} />
        </div>

        {/* Today's summary */}
        <TodaySummary
          summary={summary?.summary || null}
          isMarketOpen={summary?.is_market_open}
          marketStatus={summary?.market_status}
          isLoading={isLoading}
        />
      </Card>
    </div>
  );
}
