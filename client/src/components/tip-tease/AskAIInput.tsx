import { useState, useRef, useEffect } from "react";
import { Sparkles } from "lucide-react";

interface AskAIInputProps {
  onSend: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Fancy AI input with animated effects.
 * Features floating dots, ripple effect, and brand-colored animations.
 */
export default function AskAIInput({
  onSend,
  placeholder = "Ask anything about stocks, markets...",
  disabled = false,
}: AskAIInputProps) {
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus on mount
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim() && !disabled) {
      onSend(value.trim());
      setValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const isActive = isFocused || value.length > 0;

  return (
    <form onSubmit={handleSubmit} className="ask-ai-wrapper w-full">
      <div className={`ai-input-container ${isActive ? "active" : ""}`}>
        {/* Background fade */}
        <div className="bg-fade" />

        {/* Ripple circle */}
        <div className="ripple-circle" />

        {/* Floating dots */}
        <div className="floating-dots">
          <span />
          <span />
          <span />
          <span />
        </div>

        {/* Input field */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          className="ai-input"
        />

        {/* Icon container */}
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="icon-container"
          title="Send message"
        >
          <Sparkles className="ai-icon w-6 h-6" />
        </button>

        {/* Underline effect */}
        <div className="underline-effect" />
      </div>
    </form>
  );
}
