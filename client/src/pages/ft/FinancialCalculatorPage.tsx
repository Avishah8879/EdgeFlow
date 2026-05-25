import { FinancialCalculator } from "@/components/ft/FinancialCalculator";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function FinancialCalculatorPage() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow="Terminal · Tools"
        title="Financial calculator"
        description="Position sizing, risk-reward, P&L scenarios, and brokerage breakdowns for cash and F&O trades."
      />
      <div className="flex-1">
        <FinancialCalculator />
      </div>
    </div>
  );
}
