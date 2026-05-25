import { EquityScreener } from "@/components/ft/EquityScreener";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function EquityScreenerPage() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow="Terminal · Research"
        title="Fundamental scanner"
        description="Screen equities by quality and value rules — ROE, ROCE, debt, growth, valuation — across NSE."
      />
      <div className="flex-1">
        <EquityScreener />
      </div>
    </div>
  );
}
