import { MostActivePanel } from "@/components/ft/MostActivePanel";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function MostActive() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow="Terminal · Movers & flow"
        title="Most active"
        description="Live screen of where retail and institutional money is moving today across NSE EQ + F&O."
      />
      <div className="flex-1 overflow-hidden">
        <MostActivePanel />
      </div>
    </div>
  );
}
