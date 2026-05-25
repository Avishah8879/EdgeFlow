import { Coins, Lock, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { CoinError } from "@/lib/coin-error";

interface CoinGateAlertProps {
  coinError: CoinError;
  className?: string;
}

/**
 * Inline alert shown when a feature start returns 402.
 * Renders different CTAs depending on whether the block is tier-based
 * (TIER_BLOCKED → upgrade to Semi/Pro) or coin-based
 * (INSUFFICIENT_COINS → buy more coins).
 */
export function CoinGateAlert({ coinError, className }: CoinGateAlertProps) {
  const isUpgradeNeeded = coinError.code === "TIER_BLOCKED";

  return (
    <Alert className={className} variant="default">
      <div className="flex items-start gap-3">
        {isUpgradeNeeded ? (
          <Lock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        ) : (
          <Coins className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <AlertDescription className="text-sm font-medium text-foreground">
            {coinError.message}
          </AlertDescription>
          <div className="flex gap-2 mt-3 flex-wrap">
            {isUpgradeNeeded ? (
              <Button asChild size="sm" className="rounded-full gap-1.5">
                <Link href={coinError.upgradeUrl ?? "/pricing"}>
                  Upgrade plan <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : (
              <Button asChild size="sm" className="rounded-full gap-1.5">
                <Link href={coinError.buyCoinsUrl ?? "/profile?tab=coins"}>
                  <Coins className="h-3.5 w-3.5" /> Buy coins
                </Link>
              </Button>
            )}
            <Button asChild size="sm" variant="outline" className="rounded-full">
              <Link href="/pricing">View plans</Link>
            </Button>
          </div>
        </div>
      </div>
    </Alert>
  );
}
