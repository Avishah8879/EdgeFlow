import { useParams } from "wouter";
import { StockChart } from "@/components/ft/StockChart";

export default function AdvancedChart() {
  const params = useParams<{ symbol?: string }>();
  return <StockChart symbol={params.symbol || "NIFTY 50"} />;
}
