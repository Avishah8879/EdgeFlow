import { CorporateActionsPanel } from "@/components/ft/CorporateActionsPanel";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function CorporateActions() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow="Terminal · Events"
        title="Corporate actions"
        description="Splits, dividends, bonus issues, rights, and buybacks — past announcements and upcoming ex-dates."
      />
      <div className="flex-1">
        <CorporateActionsPanel />
      </div>
    </div>
  );
}
