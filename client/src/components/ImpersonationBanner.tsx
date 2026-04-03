import { useImpersonation } from "@/hooks/use-impersonation";
import { Button } from "@/components/ui/button";
import { AlertTriangle, X, Clock } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Banner shown when an admin is impersonating a user.
 * Displays warning and provides quick exit button.
 */
export function ImpersonationBanner() {
  const { isImpersonating, targetUser, endImpersonation, getTimeRemaining } = useImpersonation();
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  // Update time remaining every minute
  useEffect(() => {
    if (!isImpersonating) return;

    const updateTime = () => {
      setTimeRemaining(getTimeRemaining());
    };

    updateTime();
    const interval = setInterval(updateTime, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [isImpersonating, getTimeRemaining]);

  if (!isImpersonating || !targetUser) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-yellow-500 text-yellow-950 px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span className="font-medium">
            Impersonating: {targetUser.email}
            {targetUser.name && ` (${targetUser.name})`}
          </span>
          <span className="text-yellow-800">
            Role: {targetUser.role} | Tier: {targetUser.tier}
          </span>
          {timeRemaining && (
            <span className="flex items-center gap-1 text-yellow-800">
              <Clock className="h-4 w-4" />
              {timeRemaining}m remaining
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={endImpersonation}
          className="text-yellow-950 hover:bg-yellow-600 hover:text-yellow-950"
        >
          <X className="h-4 w-4 mr-1" />
          Exit Impersonation
        </Button>
      </div>
    </div>
  );
}

export default ImpersonationBanner;
