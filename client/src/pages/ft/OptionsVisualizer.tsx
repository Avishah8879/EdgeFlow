import { useParams } from "wouter";
import { OptionsVisualiser } from "@/components/ft/OptionsVisualiser";

type SupportedSymbol = 'NIFTY' | 'BANKNIFTY';

const VALID_SYMBOLS: SupportedSymbol[] = ['NIFTY', 'BANKNIFTY'];

export default function OptionsVisualizer() {
  const params = useParams<{ symbol?: string }>();
  const sym = params.symbol?.toUpperCase() as SupportedSymbol | undefined;
  const defaultSymbol: SupportedSymbol = VALID_SYMBOLS.includes(sym as SupportedSymbol) ? (sym as SupportedSymbol) : 'NIFTY';
  return <OptionsVisualiser defaultSymbol={defaultSymbol} />;
}
