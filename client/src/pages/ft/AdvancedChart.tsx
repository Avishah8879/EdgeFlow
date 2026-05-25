import { useParams } from "wouter";
import { StockChart } from "@/components/ft/StockChart";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function AdvancedChart() {
  const params = useParams<{ symbol?: string }>();
  const symbol = params.symbol || "NIFTY 50";
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow={`Terminal · ${symbol}`}
        title="Advanced chart"
        description="OHLC chart with multi-timeframe technical indicators, drawing tools, and intraday tick data."
      />
      <div className="flex-1 overflow-hidden">
        <StockChart symbol={symbol} />
      </div>
    </div>
  );
}
