import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, X, TrendingUp, Database, Calculator, Cpu } from "lucide-react";
import type { BacktestProgress as BacktestProgressType } from "@/hooks/use-strategy-backtest";

interface BacktestProgressProps {
  progress: BacktestProgressType | null;
  isRunning: boolean;
  onCancel: () => void;
  error?: string | null;
}

const phaseConfig = {
  fetching_data: {
    icon: Database,
    label: "Fetching Data",
    description: "Retrieving historical price data from database...",
  },
  computing_indicators: {
    icon: Calculator,
    label: "Computing Indicators",
    description: "Calculating technical indicators (SMA, EMA, ATR, RSI, etc.)...",
  },
  merging_indicators: {
    icon: Cpu,
    label: "Merging Indicators",
    description: "Processing client-computed indicators...",
  },
  optimizing: {
    icon: TrendingUp,
    label: "Optimizing Strategy",
    description: "Running optimizer to find optimal trading rules...",
  },
};

export function BacktestProgress({ progress, isRunning, onCancel, error }: BacktestProgressProps) {
  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <X className="h-5 w-5" />
            Backtest Failed
          </CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={onCancel}>
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!isRunning && !progress) {
    return null;
  }

  const phase = progress?.phase || "fetching_data";
  const config = phaseConfig[phase];
  const Icon = config.icon;

  // Calculate overall progress
  let overallProgress = 0;
  if (progress) {
    // Phase weights must sum to 1.0 to avoid progress exceeding 100%
    const phaseWeights = {
      fetching_data: 0.05,
      computing_indicators: 0.10,
      merging_indicators: 0.05,
      optimizing: 0.80,
    };

    const phaseOrder = ["fetching_data", "computing_indicators", "merging_indicators", "optimizing"];
    const currentPhaseIndex = phaseOrder.indexOf(phase);

    // Add completed phases
    for (let i = 0; i < currentPhaseIndex; i++) {
      const phaseName = phaseOrder[i] as keyof typeof phaseWeights;
      overallProgress += phaseWeights[phaseName] * 100;
    }

    // Add current phase progress
    if (phase === "optimizing" && progress.total > 0) {
      const optimizingProgress = (progress.generation / progress.total) * 100;
      overallProgress += phaseWeights.optimizing * optimizingProgress;
    } else if (phase !== "optimizing") {
      // Non-optimizing phases are instant-ish, show as complete once reached
      overallProgress += phaseWeights[phase as keyof typeof phaseWeights] * 50;
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isRunning ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : (
              <Icon className="h-5 w-5 text-primary" />
            )}
            <div>
              <CardTitle className="text-lg">{config.label}</CardTitle>
              <CardDescription>{config.description}</CardDescription>
            </div>
          </div>
          {isRunning && (
            <Button variant="outline" size="sm" onClick={onCancel}>
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Overall Progress</span>
            <span>{Math.round(overallProgress)}%</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </div>

        {/* Generation progress (when optimizing) */}
        {phase === "optimizing" && progress && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>
                Generation {progress.generation} / {progress.total}
              </span>
              <span>{Math.round((progress.generation / progress.total) * 100)}%</span>
            </div>
            <Progress value={(progress.generation / progress.total) * 100} className="h-2" />
          </div>
        )}

        {/* Stats */}
        {progress && (
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-semibold">
                {progress.best_fitness > 0 ? progress.best_fitness.toFixed(2) : "-"}
              </div>
              <div className="text-xs text-muted-foreground">Best Calmar Ratio</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-semibold">{progress.elapsed.toFixed(1)}s</div>
              <div className="text-xs text-muted-foreground">Elapsed Time</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
