import { ForumChat } from "@/components/ft/ForumChat";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function Forum() {
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow="Terminal · Community"
        title="Forum"
        description="Discuss strategy, share screens, and trade ideas with the EquityPro user community."
      />
      <div className="flex-1 overflow-hidden">
        <ForumChat />
      </div>
    </div>
  );
}
