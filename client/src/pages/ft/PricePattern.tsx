import { PricePatternPanel } from "@/components/ft/PricePatternPanel";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function PricePattern() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow="Terminal · Technical"
        title="Price pattern"
        description="Detect price-action signals such as gaps, strong candles, consecutive candle runs, day-high/day-low proximity, and previous-day breakouts."
      />
      <div className="flex-1">
        <PricePatternPanel />
      </div>
    </div>
  );
}
