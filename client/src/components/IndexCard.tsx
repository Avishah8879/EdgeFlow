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
        className="group rounded-2xl border border-border/50 bg-card hover:border-primary/40 hover:bg-primary/5 transition-colors p-4 cursor-pointer h-full flex flex-col gap-2"
        data-testid={`card-index-${symbol}`}
      >
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium truncate">
          {name}
        </p>
        <p className="font-serif italic font-light text-2xl md:text-3xl tabular-nums leading-none text-foreground">
          {value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <div
          className={cn(
            "text-xs font-medium tabular-nums",
            isPositive ? "text-positive" : "text-negative",
          )}
        >
          {isPositive ? "+" : ""}{change.toFixed(2)} ({isPositive ? "+" : ""}{changePercent.toFixed(2)}%)
        </div>
      </div>
    </Link>
  );
});

export default IndexCard;
