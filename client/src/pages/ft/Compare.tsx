import { GraphComparisonPanel } from "@/components/ft/GraphComparisonPanel";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function Compare() {
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow="Terminal · Charts"
        title="Compare"
        description="Overlay multiple symbols on a single chart to spot relative strength, divergence, and correlation."
      />
      <div className="flex-1 overflow-hidden">
        <GraphComparisonPanel />
      </div>
    </div>
  );
}
