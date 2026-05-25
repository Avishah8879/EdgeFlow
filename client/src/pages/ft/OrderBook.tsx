import { useParams } from "wouter";
import { OrderBookHeatmap } from "@/components/ft/OrderBookHeatmap";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function OrderBook() {
  const params = useParams<{ symbol?: string }>();
  const symbol = params.symbol || "NIFTY";
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow={`Terminal · ${symbol}`}
        title="Order book heatmap"
        description="Live L2 depth visualization showing bid/ask aggression and resting liquidity at each price level."
      />
      <div className="flex-1 overflow-hidden">
        <OrderBookHeatmap symbol={params.symbol} />
      </div>
    </div>
  );
}
