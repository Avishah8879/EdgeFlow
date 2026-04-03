import { useMarketStatus } from "@/hooks/use-market-status";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import { getStatusColorClass } from "@/lib/theme-utils";
import { cn } from "@/lib/utils";

export default function MarketStatusBadge() {
  const { data: marketStatus, isLoading } = useMarketStatus();

  if (isLoading || !marketStatus) {
    return (
      <Badge variant="outline" className="text-xs px-2 py-1">
        <Clock className="w-3 h-3 mr-1" />
        Loading...
      </Badge>
    );
  }

  const status = marketStatus.status;
  const isOpen = status === "OPEN";

  // Get display text for status
  const getStatusText = () => {
    switch (status) {
      case "OPEN": return "Market Open";
      case "CLOSED": return "Market Closed";
      case "PRE-MARKET": return "Pre-Market";
      case "POST-MARKET": return "After Hours";
    }
  };

  return (
    <div className="market-status-container">
      {/* Main badge section */}
      <div className="market-status-main">
        <span
          className={cn(
            "market-status-dot",
            isOpen && "pulse",
            getStatusColorClass(status)
          )}
        />
        <span className={cn("text-[11px] font-medium", getStatusColorClass(status))}>
          {getStatusText()}
        </span>
      </div>

      {/* Expandable details section */}
      <div className="market-status-details">
        <span className="market-status-time">{marketStatus.message}</span>
      </div>
    </div>
  );
}
