import { BlackScholesPanel } from "@/components/ft/BlackScholesPanel";
import { FtPageHeader } from "@/components/ft/FtPageHeader";

export default function BlackScholes() {
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <FtPageHeader
        eyebrow="Terminal · Pricing"
        title="Black-Scholes calculator"
        description="Closed-form European-option pricing with full Greeks (delta, gamma, theta, vega, rho) and IV solver."
      />
      <div className="flex-1 overflow-hidden">
        <BlackScholesPanel />
      </div>
    </div>
  );
}
