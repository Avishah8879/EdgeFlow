import { Card } from "@/components/ui/card";
import StockCard from "@/components/StockCard";
import { useMarketMovers } from "@/hooks/use-market-movers";
import type { CategoryType, MarketMover } from "@/lib/types";

interface MarketMoversSectionProps {
  category: CategoryType;
}

export default function MarketMoversSection({
  category,
}: MarketMoversSectionProps) {
  const { data: marketMoversData, isLoading, error } = useMarketMovers({
    category,
    limit: 10,
  });

  // Transform MarketMover data to StockCard props format
  const transformMarketMoverToStock = (mover: MarketMover) => ({
    id: mover.id.toString(),
    symbol: mover.symbol,
    name: mover.long_name || mover.symbol, // Use long_name for display
    price: mover.ltp,
    change: mover.change_amount ?? 0,
    changePercent: mover.change_percent ?? 0,
    logo: undefined,
    // Fundamentals for hover
    marketCap: mover.market_cap,
    trailingPE: mover.trailing_pe,
    priceToBook: mover.price_to_book,
    fiftyTwoWeekHigh: mover.week_52_high,
    fiftyTwoWeekLow: mover.week_52_low,
    dividendYield: mover.dividend_yield,
    sector: mover.sector,
    industry: mover.industry,
    upperCircuit: mover.upper_circuit,
    lowerCircuit: mover.lower_circuit,
    volume: mover.trade_volume,
  });

  return (
    <Card className="mt-4">
      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">
          Loading market data...
        </div>
      ) : error ? (
        <div className="p-8 text-center text-red-600">
          Failed to load market data. Please try again later.
        </div>
      ) : marketMoversData?.data && marketMoversData.data.length > 0 ? (
        marketMoversData.data.map((mover) => (
          <StockCard key={mover.id} {...transformMarketMoverToStock(mover)} />
        ))
      ) : (
        <div className="p-8 text-center text-muted-foreground">
          No data available for this category.
        </div>
      )}
    </Card>
  );
}
