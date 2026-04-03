import { Badge } from "@/components/ui/badge";

interface ExamplePromptsProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

const EXAMPLE_PROMPTS = [
  "How is RELIANCE stock?",
  "Explain Nifty 50",
  "IT sector outlook",
  "Compare TCS vs Infosys",
  "What is P/E ratio?",
  "Banking sector analysis",
];

/**
 * Clickable example prompt chips for quick suggestions.
 */
export default function ExamplePrompts({ onSelect, disabled }: ExamplePromptsProps) {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {EXAMPLE_PROMPTS.map((prompt) => (
        <Badge
          key={prompt}
          variant="outline"
          className={`
            cursor-pointer transition-all duration-200
            hover:bg-accent hover:text-accent-foreground
            ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          `}
          onClick={() => !disabled && onSelect(prompt)}
        >
          {prompt}
        </Badge>
      ))}
    </div>
  );
}
