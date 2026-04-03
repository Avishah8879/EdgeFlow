import { useParams } from "wouter";
import { OrderBookHeatmap } from "@/components/ft/OrderBookHeatmap";

export default function OrderBook() {
  const params = useParams<{ symbol?: string }>();
  return <OrderBookHeatmap symbol={params.symbol} />;
}
