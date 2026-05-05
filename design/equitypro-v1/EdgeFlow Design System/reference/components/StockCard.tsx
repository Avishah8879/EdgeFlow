import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Link } from "wouter";
import { useState, memo } from "react";
import { ChangeIndicator } from "@/components/ChangeIndicator";
import MiniPriceChart from "@/components/expert-screener/MiniPriceChart";

interface StockCardProps {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  logo?: string;
  // Optional fundamentals for hover display
  marketCap?: number | null;
  trailingPE?: number | null;
  forwardPE?: number | null;
  priceToBook?: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
  exchange?: string;
  sector?: string | null;
  industry?: string | null;
  // Additional fields for enhanced hover
  dividendYield?: number | null;
  volume?: number | null;
  upperCircuit?: number | null;
  lowerCircuit?: number | null;
}

const StockCard = memo(function StockCard({
  id,
  symbol,
  name,
  price,
  change,
  changePercent,
  logo,
  marketCap,
  trailingPE,
  forwardPE,
  priceToBook,
  fiftyTwoWeekHigh,
  fiftyTwoWeekLow,
  exchange,
  sector,
  industry,
  dividendYield,
  volume,
  upperCircuit,
  lowerCircuit,
}: StockCardProps) {
  const [isInWatchlist, setIsInWatchlist] = useState(false);

  // Format market cap in crores
  const formatMarketCap = (cap: number | null | undefined) => {
    if (cap === null || cap === undefined) return null;
    const crores = cap / 10000000; // Convert to crores
    if (crores >= 100000) {
      return `₹${(crores / 100000).toFixed(2)}L Cr`;
    }
    if (crores >= 1000) {
      return `₹${(crores / 1000).toFixed(2)}K Cr`;
    }
    return `₹${crores.toFixed(2)} Cr`;
  };

  // Format price values
  const formatPrice = (val: number | null | undefined) => {
    if (val === null || val === undefined) return null;
    return `₹${val.toFixed(2)}`;
  };

  // Format percentage (dividend yield is already in percentage form)
  const formatPercent = (val: number | null | undefined) => {
    if (val === null || val === undefined) return null;
    return `${val.toFixed(2)}%`;
  };

  // Format volume
  const formatVolume = (vol: number | null | undefined) => {
    if (vol === null || vol === undefined) return null;
    if (vol >= 10000000) return `${(vol / 10000000).toFixed(2)} Cr`;
    if (vol >= 100000) return `${(vol / 100000).toFixed(2)} L`;
    if (vol >= 1000) return `${(vol / 1000).toFixed(2)} K`;
    return vol.toString();
  };

  // Format number with 2 decimals
  const formatNumber = (num: number | null | undefined) => {
    if (num === null || num === undefined) return null;
    return num.toFixed(2);
  };

  // Check if we have any data to show in hover (from market_movers or fundamentals)
  const hasHoverData =
    (marketCap !== null && marketCap !== undefined) ||
    (trailingPE !== null && trailingPE !== undefined) ||
    (fiftyTwoWeekHigh !== null && fiftyTwoWeekHigh !== undefined) ||
    (upperCircuit !== null && upperCircuit !== undefined) ||
    (volume !== null && volume !== undefined);

  const cardContent = (
    <Link href={`/stocks/${symbol}`}>
      <div className="flex items-center justify-between p-4 border-b hover-elevate cursor-pointer" data-testid={`card-stock-${id}`}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
            {logo ? (
              <img src={logo} alt={name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
            ) : (
              <span className="text-xs font-bold text-muted-foreground">{symbol.slice(0, 2)}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate">{name}</h3>
            <p className="text-xs text-muted-foreground uppercase">{symbol}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="flex items-center gap-1.5 justify-end">
              {price > 0 && <p className="font-semibold font-mono">₹{price.toFixed(2)}</p>}
            </div>
            <div className="flex items-center gap-1 text-sm">
              <ChangeIndicator value={changePercent} />
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsInWatchlist(!isInWatchlist);
            }}
            data-testid={`button-watchlist-${id}`}
          >
            <Heart className={`h-4 w-4 ${isInWatchlist ? 'fill-negative text-negative' : ''}`} />
          </Button>
        </div>
      </div>
    </Link>
  );

  // If no data to show, return card without hover
  if (!hasHoverData) {
    return cardContent;
  }

  // Helper component for metric display
  const MetricItem = ({ label, value }: { label: string; value: string | null }) => (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium">{value || '-'}</p>
    </div>
  );

  // Wrap with HoverCard to show chart + fundamentals
  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>{cardContent}</HoverCardTrigger>
      <HoverCardContent className="w-[380px] p-0 z-50" align="start">
        {/* Mini Price Chart */}
        <div className="p-3 border-b">
          <MiniPriceChart ticker={symbol} />
        </div>

        {/* Header + Metrics */}
        <div className="p-3 space-y-3">
          {/* Header with name + symbol */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-semibold text-sm truncate flex-1 min-w-0">{name}</h4>
              <span className="text-xs text-muted-foreground flex-shrink-0">{symbol}</span>
            </div>
            {/* Sector · Industry */}
            {(sector || industry) && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {[sector, industry].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          {/* Primary Metrics Row */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            <MetricItem label="Market Cap" value={formatMarketCap(marketCap)} />
            <MetricItem label="P/E Ratio" value={formatNumber(trailingPE)} />
            <MetricItem label="P/B Ratio" value={formatNumber(priceToBook)} />
          </div>

          {/* 52W Range Row */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <MetricItem label="52W High" value={formatPrice(fiftyTwoWeekHigh)} />
            <MetricItem label="52W Low" value={formatPrice(fiftyTwoWeekLow)} />
          </div>

          {/* Circuit Limits Row */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <MetricItem label="Upper Circuit" value={formatPrice(upperCircuit)} />
            <MetricItem label="Lower Circuit" value={formatPrice(lowerCircuit)} />
          </div>

          {/* Dividend + Volume Row */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <MetricItem label="Div. Yield" value={formatPercent(dividendYield)} />
            <MetricItem label="Volume" value={formatVolume(volume)} />
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
});

export default StockCard;
