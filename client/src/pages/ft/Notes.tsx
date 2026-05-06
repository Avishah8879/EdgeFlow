import { NotesEditor } from "@/components/ft/NotesEditor";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function Notes() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow="Terminal · Personal"
        title="Notes"
        description="Personal research notes — markdown, tagged by ticker, and tied to your saved screens and backtests."
      />
      <div className="flex-1">
        <NotesEditor />
      </div>
    </div>
  );
}
