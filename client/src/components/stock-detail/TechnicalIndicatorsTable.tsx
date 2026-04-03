import { Skeleton } from "@/components/ui/skeleton";
import { useTechnicalIndicators } from "@/hooks/use-technical-indicators";
import { AlertCircle } from "lucide-react";

interface TechnicalIndicatorsTableProps {
  ticker: string;
  ltp: number | null;
}

function formatValue(value: number | null | undefined): string {
  if (value === null || value === undefined) return "N/A";
  return value.toFixed(2);
}

type Action = 'Buy' | 'Sell' | null;

/**
 * Get action for SMA/EMA based on LTP comparison
 * LTP > value → Buy (bullish - price above moving average)
 * LTP < value → Sell (bearish - price below moving average)
 */
function getMAAction(ltp: number | null, value: number | null): Action {
  if (ltp === null || value === null) return null;
  return ltp > value ? 'Buy' : 'Sell';
}

/**
 * Get action for MACD based on Line vs Signal comparison
 * Line > Signal → Buy (bullish crossover)
 * Line < Signal → Sell (bearish crossover)
 */
function getMACDAction(line: number | null, signal: number | null): Action {
  if (line === null || signal === null) return null;
  return line > signal ? 'Buy' : 'Sell';
}

/**
 * Get action for Supertrend based on direction
 * direction = 1 → Buy (bullish)
 * direction = -1 → Sell (bearish)
 */
function getSupertrendAction(direction: number | null): Action {
  if (direction === null) return null;
  return direction === 1 ? 'Buy' : 'Sell';
}

/**
 * Action badge component with theme-aware colors
 */
function ActionBadge({ action }: { action: Action }) {
  if (action === null) {
    return <span className="text-muted-foreground">N/A</span>;
  }

  if (action === 'Buy') {
    return <span className="text-positive font-medium">Buy</span>;
  }

  return <span className="text-negative font-medium">Sell</span>;
}

export default function TechnicalIndicatorsTable({ ticker, ltp }: TechnicalIndicatorsTableProps) {
  const { data: response, isLoading, error } = useTechnicalIndicators(ticker);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8">
        <div className="flex flex-col items-center justify-center text-center space-y-2">
          <AlertCircle className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Unable to load technical indicators
          </p>
          <p className="text-xs text-muted-foreground">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!response || !response.indicators) {
    return null;
  }

  const data = response.indicators;

  // Section 1: Trend Indicators - with Action column
  const trendIndicators = [
    // Supertrend
    { name: "Supertrend (10, 3)", value: data.supertrend_10_3, action: getSupertrendAction(data.supertrend_direction_10_3) },
    // SMAs (20, 50, 100)
    { name: "Simple Moving Average (20)", value: data.sma_20, action: getMAAction(ltp, data.sma_20) },
    { name: "Simple Moving Average (50)", value: data.sma_50, action: getMAAction(ltp, data.sma_50) },
    { name: "Simple Moving Average (100)", value: data.sma_100, action: getMAAction(ltp, data.sma_100) },
    // EMAs (20, 50, 100)
    { name: "Exponential Moving Average (20)", value: data.ema_20, action: getMAAction(ltp, data.ema_20) },
    { name: "Exponential Moving Average (50)", value: data.ema_50, action: getMAAction(ltp, data.ema_50) },
    { name: "Exponential Moving Average (100)", value: data.ema_100, action: getMAAction(ltp, data.ema_100) },
    // MACD
    { name: "MACD Line", value: data.macd_line, action: getMACDAction(data.macd_line, data.macd_signal) },
    { name: "MACD Signal", value: data.macd_signal, action: getMACDAction(data.macd_line, data.macd_signal) },
    { name: "MACD Histogram", value: data.macd_histogram, action: getMACDAction(data.macd_line, data.macd_signal) },
  ];

  // Section 2: Oscillators - no Action column
  const oscillators = [
    { name: "RSI (14)", value: data.rsi_14 },
    { name: "ATR (14)", value: data.atr_14 },
    { name: "Bollinger Upper (20)", value: data.bb_upper_20 },
    { name: "Bollinger Middle (20)", value: data.bb_middle_20 },
    { name: "Bollinger Lower (20)", value: data.bb_lower_20 },
    { name: "Volume SMA (20)", value: data.volume_sma_20 },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Section 1: Trend Indicators - with Action */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Name</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">Value</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {trendIndicators.map((item, index) => (
                <tr key={item.name} className={index !== trendIndicators.length - 1 ? "border-b border-border/50" : ""}>
                  <td className="py-2 px-3">{item.name}</td>
                  <td className="py-2 px-3 text-right font-medium">{formatValue(item.value)}</td>
                  <td className="py-2 px-3 text-right">
                    <ActionBadge action={item.action} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Section 2: Oscillators - value only */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Name</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">Value</th>
              </tr>
            </thead>
            <tbody>
              {oscillators.map((item, index) => (
                <tr key={item.name} className={index !== oscillators.length - 1 ? "border-b border-border/50" : ""}>
                  <td className="py-2 px-3">{item.name}</td>
                  <td className="py-2 px-3 text-right font-medium">{formatValue(item.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {response.as_of && (
        <div className="pt-4 border-t space-y-1">
          <p className="text-xs text-muted-foreground">
            Last updated: {new Date(response.as_of).toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground">
            Data points: {response.data_points} hours
          </p>
        </div>
      )}
    </div>
  );
}
