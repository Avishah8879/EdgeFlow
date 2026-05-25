import { TopNewsPanel } from "@/components/ft/TopNewsPanel";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function NewsPage() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow="Terminal · News"
        title="Live news feed"
        description="Real-time financial news from NSE, BSE, and major Indian and global wires."
      />
      <div className="flex-1">
        <TopNewsPanel />
      </div>
    </div>
  );
}
