import { TimeAndSalesPanel } from "@/components/ft/TimeAndSalesPanel";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function TimeSales() {
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow="Terminal · Tape"
        title="Time & sales"
        description="Tick-by-tick trade tape showing every print with size, price, and aggressor side."
      />
      <div className="flex-1 overflow-hidden">
        <TimeAndSalesPanel />
      </div>
    </div>
  );
}
