import { Coins } from "lucide-react";
import { Link } from "wouter";
import { useCoinBalance } from "@/hooks/use-coin-wallet";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type CoinBalanceBadgeProps = {
  className?: string;
  showLabel?: boolean;
};

/**
 * Compact coin balance indicator for the topbar / navigation.
 * Links to the Profile coins tab. Invisible for unauthenticated users
 * and for Pro users (who never spend coins).
 */
export function CoinBalanceBadge({ className, showLabel = false }: CoinBalanceBadgeProps) {
  const { isAuthenticated, user } = useAuth();
  const { data } = useCoinBalance();

  // Pro users don't spend coins — hide the badge for them
  if (!isAuthenticated || user?.tier === "pro") return null;

  const balance = data?.data?.balance ?? null;

  return (
    <Link href="/profile?tab=coins">
      <div
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full",
          "text-xs font-semibold font-mono tabular-nums",
          "bg-primary/10 text-primary border border-primary/20",
          "hover:bg-primary/20 transition-colors cursor-pointer",
          className,
        )}
        data-testid="coin-balance-badge"
        title={`${balance ?? "—"} coins`}
      >
        <Coins className="w-3.5 h-3.5" />
        {balance == null ? (
          <span className="opacity-50">—</span>
        ) : (
          <span>{balance.toLocaleString("en-IN")}</span>
        )}
        {showLabel && <span className="ml-0.5 opacity-70 font-normal">coins</span>}
      </div>
    </Link>
  );
}
