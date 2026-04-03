import { useParams } from "wouter";
import { StockChart } from "@/components/ft/StockChart";

export default function AdvancedChart() {
  const params = useParams<{ symbol?: string }>();
  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-hidden">
      <StockChart symbol={params.symbol || "NIFTY 50"} />
    </div>
  );
}
