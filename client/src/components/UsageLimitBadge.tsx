/**
 * Usage Limit Badge
 *
 * Compact badge showing remaining usage for a feature.
 * Shows warning state when usage is at 80% or higher.
 */

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useUsageLimits, getTimeUntilReset } from '@/hooks/use-usage-limits';
import { AlertCircle, Zap } from 'lucide-react';

type FeatureType = 'screener' | 'backtest';

interface UsageLimitBadgeProps {
  feature: FeatureType;
  showLabel?: boolean;
  className?: string;
}

const featureConfig = {
  screener: {
    label: 'Screener',
    usageKey: 'screenerRuns' as const,
    limitKey: 'screenerRunsPerHour' as const,
  },
  backtest: {
    label: 'Backtest',
    usageKey: 'backtestRuns' as const,
    limitKey: 'backtestRunsPerHour' as const,
  },
};

export function UsageLimitBadge({ feature, showLabel = false, className }: UsageLimitBadgeProps) {
  const { data: limits, isLoading } = useUsageLimits();

  if (isLoading || !limits) {
    return null;
  }

  const config = featureConfig[feature];
  const used = limits.usage[config.usageKey];
  const total = limits.limits[config.limitKey];
  const remaining = limits.remaining[config.usageKey];
  const percentage = total > 0 ? (used / total) * 100 : 100;

  // Determine state
  const isWarning = percentage >= 80;
  const isExhausted = remaining === 0;
  const isPremium = limits.tier === 'premium';

  // Don't show for premium users with high limits (100+)
  if (isPremium && total >= 100 && !isWarning) {
    return null;
  }

  const variant = isExhausted ? 'destructive' : isWarning ? 'secondary' : 'outline';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={variant}
          className={`cursor-help text-xs gap-1 ${className}`}
        >
          {isExhausted ? (
            <AlertCircle className="h-3 w-3" />
          ) : (
            <Zap className="h-3 w-3" />
          )}
          {showLabel && <span>{config.label}:</span>}
          <span>
            {remaining}/{total}
          </span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1">
          <p className="font-medium">
            {config.label} Usage ({limits.tier})
          </p>
          <p className="text-xs text-muted-foreground">
            {remaining} of {total} runs remaining this hour
          </p>
          {isExhausted && (
            <p className="text-xs text-destructive">
              Limit reached. Resets in {getTimeUntilReset(limits.resetsAt)}
            </p>
          )}
          {!isPremium && !isExhausted && (
            <p className="text-xs text-muted-foreground">
              Upgrade to Premium for higher limits
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
