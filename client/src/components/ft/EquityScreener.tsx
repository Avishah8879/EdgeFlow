import { FundamentalScreenerTab } from "@/components/ft/FundamentalScreenerTab";

export function EquityScreener() {
  return (
    <div className="h-full overflow-auto px-4 py-4">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-white">Fundamental Scanner</h1>
        <p className="text-xs text-[#9f9f9f]">
          Screen stocks by fundamental metrics — P/E, ROE, Market Cap, Debt/Equity, and more
        </p>
      </div>
      <FundamentalScreenerTab />
    </div>
  );
}
