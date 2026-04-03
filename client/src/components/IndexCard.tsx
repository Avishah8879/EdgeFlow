import { Card } from "@/components/ui/card";
import { Link } from "wouter";
import { memo } from "react";
import { ChangeIndicator, ChangeText } from "@/components/ChangeIndicator";

interface IndexCardProps {
  name: string;
  symbol: string;
  value: number;
  change: number;
  changePercent: number;
  href?: string;
}

const IndexCard = memo(function IndexCard({ name, symbol, value, change, changePercent, href = "#" }: IndexCardProps) {
  return (
    <Link href={href}>
      <div className="gradient-glow-card">
        <Card className="gradient-glow-card-inner p-4 cursor-pointer border-0" data-testid={`card-index-${symbol}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
                {name}
              </h3>
              <p className="text-lg font-bold mt-1 font-mono">{value.toLocaleString('en-IN')}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1 text-sm font-medium">
                <ChangeIndicator value={changePercent} />
              </div>
              <div className="text-xs">
                <ChangeText value={change} showSign decimals={2} showPercent={false} />
              </div>
            </div>
          </div>
        </Card>
      </div>
    </Link>
  );
});

export default IndexCard;
