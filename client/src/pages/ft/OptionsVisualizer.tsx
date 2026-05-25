import { useParams } from "wouter";
import { OptionsVisualiser } from "@/components/ft/OptionsVisualiser";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

type SupportedSymbol = 'NIFTY' | 'BANKNIFTY';

const VALID_SYMBOLS: SupportedSymbol[] = ['NIFTY', 'BANKNIFTY'];

export default function OptionsVisualizer() {
  const params = useParams<{ symbol?: string }>();
  const sym = params.symbol?.toUpperCase() as SupportedSymbol | undefined;
  const defaultSymbol: SupportedSymbol = VALID_SYMBOLS.includes(sym as SupportedSymbol) ? (sym as SupportedSymbol) : 'NIFTY';
  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow={`Terminal · ${defaultSymbol}`}
        title="Options visualizer"
        description="Gamma exposure (GxOI) profile, IV surface, and ATM time-series for NIFTY and BANKNIFTY options."
      />
      <div className="flex-1 overflow-hidden">
        <OptionsVisualiser defaultSymbol={defaultSymbol} />
      </div>
    </div>
  );
}
