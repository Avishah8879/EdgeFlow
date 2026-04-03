import { Button } from '@/components/ui/button';
import { RefreshCw, AlertCircle } from 'lucide-react';

interface DataUnavailableProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  showRetryButton?: boolean;
  variant?: 'error' | 'warning' | 'info';
}

export function DataUnavailable({
  title = 'DATA UNAVAILABLE',
  message = 'Unable to fetch data from market feed',
  onRetry,
  showRetryButton = true,
  variant = 'error'
}: DataUnavailableProps) {
  const variantStyles = {
    error: 'border-red-500/50 shadow-red-500/20 text-red-400',
    warning: 'border-orange-500/50 shadow-orange-500/20 text-orange-400',
    info: 'border-matrix-green/50 shadow-matrix-green/20 text-matrix-green'
  };

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] p-6">
      {/* Terminal ASCII Art */}
      <div className="mb-4 font-mono text-xs text-muted-foreground/60 select-none">
        <pre className="leading-tight">
{`╔══════════════════════════════════════╗
║     [ SYSTEM STATUS: OFFLINE ]       ║
╚══════════════════════════════════════╝`}
        </pre>
      </div>

      {/* Main Error Container */}
      <div className={`
        relative p-6 rounded-lg border-2 bg-background/50 backdrop-blur-sm
        ${variantStyles[variant]}
        animate-pulse-border
        w-full max-w-md
      `}>
        {/* Blinking Cursor Effect */}
        <div className="absolute top-2 right-2">
          <span className="animate-blink text-xs font-mono">█</span>
        </div>

        {/* Icon */}
        <div className="flex justify-center mb-3">
          <AlertCircle className="w-8 h-8" />
        </div>

        {/* Title */}
        <h3 className="text-center font-mono text-lg font-semibold mb-2">
          [ {title} ]
        </h3>

        {/* Message */}
        <p className="text-center text-sm text-muted-foreground mb-4 font-mono">
          &gt; {message}
        </p>

        {/* Terminal-style status */}
        <div className="text-xs font-mono text-muted-foreground/40 text-center mb-4">
          <span>STATUS CODE: </span>
          <span className={variant === 'error' ? 'text-red-400' : 'text-orange-400'}>
            {variant === 'error' ? '503' : '404'}
          </span>
          <span> | RETRY: </span>
          <span className="text-matrix-green">AVAILABLE</span>
        </div>

        {/* Retry Button */}
        {showRetryButton && onRetry && (
          <div className="flex justify-center">
            <Button
              onClick={onRetry}
              size="sm"
              variant="outline"
              className="font-mono text-xs border-current hover-elevate"
              data-testid="button-retry-data"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              RETRY CONNECTION
            </Button>
          </div>
        )}

        {/* Terminal Command Hint */}
        <div className="mt-4 pt-3 border-t border-current/20">
          <div className="text-xs font-mono text-muted-foreground/40 text-center">
            $ check_connection --status
          </div>
        </div>
      </div>

      {/* Bottom Terminal Output */}
      <div className="mt-4 text-xs font-mono text-muted-foreground/40 text-center">
        <span className="animate-pulse">Waiting for data feed...</span>
      </div>
    </div>
  );
}

// Empty state variant for lists/tables
export function DataUnavailableList({
  title = 'NO DATA',
  message = 'No records available',
  onRetry,
  showRetryButton = false
}: DataUnavailableProps) {
  return (
    <div className="flex items-center justify-between p-3 border border-border/50 rounded bg-muted/10">
      <div className="flex items-center gap-3">
        <AlertCircle className="w-4 h-4 text-muted-foreground/60" />
        <div>
          <span className="font-mono text-sm text-muted-foreground">{title}</span>
          {message && (
            <span className="ml-2 text-xs text-muted-foreground/60">• {message}</span>
          )}
        </div>
      </div>
      {showRetryButton && onRetry && (
        <Button
          onClick={onRetry}
          size="sm"
          variant="ghost"
          className="h-7 px-2 font-mono text-xs"
          data-testid="button-retry-list"
        >
          <RefreshCw className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}

// Inline variant for table cells or small spaces
export function DataUnavailableInline() {
  return (
    <span className="font-mono text-xs text-muted-foreground/60">--</span>
  );
}