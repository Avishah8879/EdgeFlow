import { WatchlistPanel } from "@/components/ft/WatchlistPanel";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function Watchlist() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow="Terminal · Personal"
        title="Watchlist"
        description="Your saved symbols with live prices, intraday change, and one-click drill-down to stock detail."
      />
      <div className="flex-1">
        <WatchlistPanel />
      </div>
    </div>
  );
}
