import { PortfolioOptimizerPanel } from "@/components/ft/PortfolioOptimizerPanel";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function PortfolioOptimizer() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow="Terminal · Allocation"
        title="Portfolio optimizer"
        description="Black-Litterman + mean-variance allocation across your watchlist with views, constraints, and risk targets."
      />
      <div className="flex-1">
        <PortfolioOptimizerPanel />
      </div>
    </div>
  );
}
