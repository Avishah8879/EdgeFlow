import { HelpPanel } from "@/components/ft/HelpPanel";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function Help() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow="Terminal · Support"
        title="Help"
        description="Documentation, keyboard shortcuts, FAQ, and contact options for the EquityPro terminal."
      />
      <div className="flex-1">
        <HelpPanel />
      </div>
    </div>
  );
}
