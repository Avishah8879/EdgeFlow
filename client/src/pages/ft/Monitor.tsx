import { QuickMonitor } from "@/components/ft/QuickMonitor";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function Monitor() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow="Terminal · Alerts"
        title="Monitor"
        description="Live price and indicator alerts across your watchlist with desktop, email, and webhook delivery."
      />
      <div className="flex-1">
        <QuickMonitor />
      </div>
    </div>
  );
}
