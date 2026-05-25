import { Link } from "wouter";
import { memo } from "react";
import { cn } from "@/lib/utils";

interface IndexCardProps {
  name: string;
  symbol: string;
  value: number;
  change: number;
  changePercent: number;
  href?: string;
}

const IndexCard = memo(function IndexCard({
  name,
  symbol,
  value,
  change,
  changePercent,
  href,
}: IndexCardProps) {
  const isPositive = changePercent >= 0;
  const linkHref = href ?? `/index/${encodeURIComponent(symbol)}`;

  return (
    <Link href={linkHref}>
      <div
        className="group rounded-xl border border-border bg-card p-5 cursor-pointer transition-all duration-base hover:border-[hsl(var(--brand-gold))]/50 hover:-translate-y-0.5 hover:shadow-card-lg h-full flex flex-col"
        data-testid={`card-index-${symbol}`}
      >
        <p className="text-[10.5px] uppercase tracking-uppercase font-bold text-muted-foreground truncate">
          {name}
        </p>
        <p className="font-mono text-[28px] md:text-[30px] font-bold tabular-nums leading-none text-[hsl(var(--brand-navy))] dark:text-foreground mt-1.5">
          {value.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </p>
        <div
          className={cn(
            "font-mono text-[13px] font-semibold tabular-nums mt-1",
            isPositive ? "text-positive" : "text-negative",
          )}
        >
          {isPositive ? "+" : ""}
          {change.toFixed(2)} · {isPositive ? "+" : ""}
          {changePercent.toFixed(2)}%
        </div>
      </div>
    </Link>
  );
});

export default IndexCard;
