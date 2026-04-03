import { Progress } from "@/components/ui/progress";
import { Clock, Target } from "lucide-react";
import { useEffect, useState } from "react";

interface ProgressIndicatorProps {
  processed: number;
  total: number;
  matches: number;
}

export default function ProgressIndicator({
  processed,
  total,
  matches,
}: ProgressIndicatorProps) {
  const [elapsedTime, setElapsedTime] = useState(0);

  const percentage = total > 0 ? (processed / total) * 100 : 0;

  // Track elapsed time
  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4 p-6 bg-muted/30 rounded-lg border border-border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="animate-pulse w-2 h-2 bg-primary rounded-full" />
            <span className="text-sm font-medium">
              Processing {processed.toLocaleString()} / {total.toLocaleString()} stocks
            </span>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            <span className="font-semibold text-primary">
              {matches} {matches === 1 ? "match" : "matches"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span className="font-mono">{formatTime(elapsedTime)}</span>
          </div>
        </div>
      </div>

      <Progress value={percentage} className="h-2" />

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{percentage.toFixed(1)}% complete</span>
        <span>
          {total - processed > 0
            ? `${(total - processed).toLocaleString()} remaining`
            : "Finalizing results..."}
        </span>
      </div>
    </div>
  );
}
