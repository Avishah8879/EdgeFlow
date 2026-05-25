import { ResearchReportsPanel } from "@/components/ft/ResearchReportsPanel";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function ResearchReports() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow="Terminal · Research"
        title="Research reports"
        description="Latest broker research notes, target prices, and rating changes across the Indian equity universe."
      />
      <div className="flex-1">
        <ResearchReportsPanel />
      </div>
    </div>
  );
}
