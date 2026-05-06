import { IPOPanel } from "@/components/ft/IPOPanel";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function IpoPage() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow="Terminal · Primary market"
        title="IPOs"
        description="Upcoming, ongoing, and recently-listed initial public offerings on NSE and BSE."
      />
      <div className="flex-1">
        <IPOPanel />
      </div>
    </div>
  );
}
