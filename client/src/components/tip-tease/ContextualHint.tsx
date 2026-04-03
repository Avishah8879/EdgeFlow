import { TrendingUp, TrendingDown, Sparkles } from "lucide-react";

interface ContextualHintProps {
  hint: string | null;
  onClick?: () => void;
}

/**
 * Contextual hint banner like "Markets are up 1.2% - ask why?"
 */
export default function ContextualHint({ hint, onClick }: ContextualHintProps) {
  if (!hint) return null;

  // Determine icon based on hint content
  const isUp = hint.toLowerCase().includes("up");
  const isDown = hint.toLowerCase().includes("down");

  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Sparkles;
  const iconColor = isUp ? "text-positive" : isDown ? "text-negative" : "text-primary";

  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-2 px-4 py-2 rounded-full
        bg-accent/50 hover:bg-accent transition-colors duration-200
        text-sm text-foreground cursor-pointer
        border border-border/50 hover:border-border
      `}
    >
      <Icon className={`w-4 h-4 ${iconColor}`} />
      <span>{hint}</span>
    </button>
  );
}
