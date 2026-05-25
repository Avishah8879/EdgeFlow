import { QuickMonitor } from "@/components/ft/QuickMonitor";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function Monitor() {
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow="Terminal · Workspace"
        title="Monitor"
        description="Multi-asset workspace — live indices, top movers, FII/DII flows, news tape, and sector heat in one view."
      />
      <div className="flex-1 overflow-hidden">
        <QuickMonitor />
      </div>
    </div>
  );
}
