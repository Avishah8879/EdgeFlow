import { OptionChainPanel } from "@/components/ft/OptionChainPanel";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function OptionChain() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow="Terminal · Derivatives"
        title="Option chain"
        description="Live NSE option chain with OI, IV, Greeks, and PCR for NIFTY, BANKNIFTY, and stock options."
      />
      <div className="flex-1 overflow-hidden">
        <OptionChainPanel />
      </div>
    </div>
  );
}
