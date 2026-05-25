import { WorldIndicesPanel } from "@/components/ft/WorldIndicesPanel";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function WorldIndices() {
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow="Terminal · Global"
        title="World indices"
        description="Live quotes for major global benchmarks — S&P 500, Nasdaq, FTSE, Nikkei, Hang Seng, DAX, and more."
      />
      <div className="flex-1 overflow-hidden">
        <WorldIndicesPanel />
      </div>
    </div>
  );
}
