import { useParams } from "wouter";
import { OrderBookHeatmap } from "@/components/ft/OrderBookHeatmap";

export default function OrderBook() {
  const params = useParams<{ symbol?: string }>();
  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-hidden">
      <OrderBookHeatmap symbol={params.symbol} />
    </div>
  );
}
