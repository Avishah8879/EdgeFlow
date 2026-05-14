import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Play, StopCircle } from "lucide-react";

interface ExpressionBuilderProps {
  expression: string;
  onExpressionChange: (expression: string) => void;
  onRun: () => void;
  onCancel: () => void;
  isRunning: boolean;
  /** Combined disabled gate from the parent (validation + empty + isValidating). */
  runDisabled?: boolean;
  /** True while a validation fetch is in flight. */
  isValidating?: boolean;
  /** True if validation could not reach the backend. */
  isOffline?: boolean;
  validationError?: string;
}

export default function ExpressionBuilder({
  expression,
  onExpressionChange,
  onRun,
  onCancel,
  isRunning,
  runDisabled,
  isValidating,
  isOffline,
  validationError,
}: ExpressionBuilderProps) {
  const [isFocused, setIsFocused] = useState(false);

  // Fall back to the legacy gate when the parent doesn't pass runDisabled.
  const isRunDisabled =
    runDisabled !== undefined
      ? runDisabled
      : !expression.trim() || Boolean(validationError);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Run on Ctrl+Enter — respect the same disabled gate as the button.
    if (e.ctrlKey && e.key === "Enter" && !isRunning && !isRunDisabled) {
      onRun();
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="expression" className="text-sm font-medium">
          Condition Expression
        </label>
        <div className="relative">
          <Textarea
            id="expression"
            value={expression}
            onChange={(e) => onExpressionChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., (close > sma_50) and (ema_50 > ema_150) and (liquidity > 5000000000)"
            className={`font-mono text-sm min-h-[100px] ${
              validationError ? "border-destructive" : ""
            } ${isFocused ? "ring-2 ring-primary/20" : ""}`}
            disabled={isRunning}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Use Python-style logical operators (
          <code className="px-1 py-0.5 bg-accent text-accent-foreground rounded">and</code>,{" "}
          <code className="px-1 py-0.5 bg-accent text-accent-foreground rounded">or</code>,{" "}
          <code className="px-1 py-0.5 bg-accent text-accent-foreground rounded">not</code>) and math
          expressions. Press <kbd className="px-1.5 py-0.5 bg-accent text-accent-foreground rounded text-xs">Ctrl+Enter</kbd> to run.
        </p>
      </div>

      {validationError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      )}
      {isOffline && !validationError && (
        <p className="text-xs text-muted-foreground">
          Validation offline — Run will still try.
        </p>
      )}

      <div className="flex gap-4">
        {!isRunning ? (
          <button
            type="button"
            className="run-button"
            onClick={onRun}
            disabled={isRunDisabled}
            aria-busy={isValidating}
          >
            <span className="run-button-content">
              <Play className="w-4 h-4" />
              Run Expert Screener
            </span>
          </button>
        ) : (
          <Button
            onClick={onCancel}
            variant="destructive"
          >
            <StopCircle className="w-4 h-4 mr-2" />
            Cancel Screening
          </Button>
        )}
      </div>

      <div className="p-4 bg-muted/30 rounded-lg">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <span className="text-primary">⚡</span> Indicator Coverage
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong>Supported variables:</strong>{" "}
          <code className="px-1 py-0.5 bg-accent text-accent-foreground rounded">close</code>,{" "}
          <code className="px-1 py-0.5 bg-accent text-accent-foreground rounded">liquidity</code>,{" "}
          <code className="px-1 py-0.5 bg-accent text-accent-foreground rounded">atr_#</code>,{" "}
          <code className="px-1 py-0.5 bg-accent text-accent-foreground rounded">ema_#</code>,{" "}
          <code className="px-1 py-0.5 bg-accent text-accent-foreground rounded">sma_#</code>,{" "}
          <code className="px-1 py-0.5 bg-accent text-accent-foreground rounded">rsi_#</code>,{" "}
          <code className="px-1 py-0.5 bg-accent text-accent-foreground rounded">bb_upper/middle/lower_PER_STD</code>,{" "}
          <code className="px-1 py-0.5 bg-accent text-accent-foreground rounded">supertrend_PERIOD_MULT</code>,{" "}
          <code className="px-1 py-0.5 bg-accent text-accent-foreground rounded">high_PERIOD_FREQ</code>, and{" "}
          <code className="px-1 py-0.5 bg-accent text-accent-foreground rounded">*_shift_N</code> variants.{" "}
          <strong>Operators:</strong> +, -, *, /, **, and/or/not.
        </p>
      </div>
    </div>
  );
}
