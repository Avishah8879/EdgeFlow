import { FinancialResultsPanel } from "@/components/ft/FinancialResultsPanel";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function FinancialResultsPage() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow="Terminal · Earnings"
        title="Financial results"
        description="Quarterly and annual earnings releases — revenue, profit, margins, EPS, and YoY comparisons."
      />
      <div className="flex-1">
        <FinancialResultsPanel />
      </div>
    </div>
  );
}
