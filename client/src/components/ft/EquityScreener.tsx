import { FundamentalScreenerTab } from "@/components/ft/FundamentalScreenerTab";

export function EquityScreener() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-12">
        <div className="mb-12">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
                Fundamental Scanner
              </p>
              <h1 className="text-3xl md:text-5xl font-serif italic font-light tracking-tight text-foreground">
                Find your value
              </h1>
              <p className="text-sm text-muted-foreground max-w-md">
                Screen NSE stocks by fundamental metrics — P/E, ROE, market cap, debt/equity, dividend yield, and more.
              </p>
            </div>
          </div>
        </div>

        <FundamentalScreenerTab />
      </div>
    </div>
  );
}
