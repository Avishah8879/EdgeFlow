import { PatternSearchPanel } from "@/components/ft/PatternSearchPanel";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function PatternSearch() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow="Terminal · Technical"
        title="Pattern search"
        description="Detect classical chart patterns — head & shoulders, triangles, flags, double tops — across the NSE universe."
      />
      <div className="flex-1">
        <PatternSearchPanel />
      </div>
    </div>
  );
}
