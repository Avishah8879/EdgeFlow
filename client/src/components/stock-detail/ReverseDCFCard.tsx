import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertCircle,
  ChevronUp,
  ChevronDown,
  Settings2,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Info,
} from "lucide-react";
import {
  useReverseDCF,
  useReverseDCFMutation,
  formatGrowthRate,
  formatIndianCurrency,
  getValuationStatusColor,
  getGrowthRateColor,
  type ReverseDCFResult,
} from "@/hooks/use-reverse-dcf";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ReverseDCFCardProps {
  ticker: string;
  currentPrice?: number | null;
}

/**
 * ReverseDCFCard - Reverse DCF Valuation Analysis
 *
 * Shows the implied revenue growth rate the market expects based on
 * current stock price. Helps investors understand if growth expectations
 * are realistic.
 */
export default function ReverseDCFCard({ ticker, currentPrice }: ReverseDCFCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced options state
  const [targetPrice, setTargetPrice] = useState<string>("");
  const [wacc, setWacc] = useState<string>("10"); // Percentage as string for input
  const [terminalGrowth, setTerminalGrowth] = useState<string>("3"); // Percentage as string
  const [forecastYears, setForecastYears] = useState<string>("5"); // Years as string for input

  // Query for initial data with defaults
  const { data, isLoading, error, refetch } = useReverseDCF(ticker);

  // Mutation for recalculating with custom parameters
  const mutation = useReverseDCFMutation(ticker);

  // Use mutation result if available, otherwise use query result
  const result: ReverseDCFResult | undefined = mutation.data ?? data;
  const isCalculating = mutation.isPending;

  // Sync initial values from result when it loads
  useEffect(() => {
    if (data?.inputs_used) {
      setWacc(data.inputs_used.wacc.toString());
      setTerminalGrowth(data.inputs_used.terminal_growth.toString());
      setForecastYears(data.inputs_used.forecast_years.toString());
    }
  }, [data?.inputs_used]);

  const handleRecalculate = () => {
    const targetPriceValue = targetPrice ? parseFloat(targetPrice) : undefined;
    const waccValue = parseFloat(wacc) || 10;
    const terminalValue = parseFloat(terminalGrowth) || 3;
    const yearsValue = parseInt(forecastYears) || 5;

    mutation.mutate({
      targetPrice: targetPriceValue,
      wacc: waccValue / 100, // Convert to decimal
      terminalGrowth: terminalValue / 100,
      forecastYears: yearsValue,
    });
  };

  const handleReset = () => {
    setTargetPrice("");
    setWacc("10");
    setTerminalGrowth("3");
    setForecastYears("5");
    mutation.reset();
    refetch();
  };

  // Use currentPrice prop (from LTP) or fall back to result's current_price
  const displayPrice = currentPrice ?? result?.current_price ?? null;

  return (
    <div className="dcf-ripple-container">
      <div className="dcf-ripple-box" />
      <div className="dcf-ripple-box" />
      <div className="dcf-ripple-box" />
      <div className="dcf-ripple-inner">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <Card className="dcf-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Reverse DCF Valuation</CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      Reverse DCF calculates the implied growth rate the market
                      expects based on current stock price. Lower implied growth
                      may suggest the stock is overvalued.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                {isOpen ? (
                  <>
                    <ChevronUp className="w-4 h-4 mr-2" />
                    Hide
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4 mr-2" />
                    Show
                  </>
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* Loading State */}
            {isLoading && (
              <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            )}

            {/* Error State */}
            {error && !isLoading && (
              <div className="py-8">
                <div className="flex flex-col items-center justify-center text-center space-y-2">
                  <AlertCircle className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Unable to calculate Reverse DCF
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {error.message}
                  </p>
                </div>
              </div>
            )}

            {/* Results */}
            {result && !isLoading && (
              <>
                {/* Side-by-side Tables */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Inputs/Assumptions Table */}
                  <div className="dcf-table-container">
                    <div className="dcf-table-title">Model Inputs</div>
                    <div className="dcf-table">
                      <div className="dcf-table-left">
                        <div className="dcf-table-item">Revenue (TTM)</div>
                        <div className="dcf-table-item">EBIT Margin</div>
                        <div className="dcf-table-item">Tax Rate</div>
                        <div className="dcf-table-item">Net Debt</div>
                        <div className="dcf-table-item">Shares Outstanding</div>
                        <div className="dcf-table-item">Current Price</div>
                      </div>
                      <div className="dcf-table-right">
                        <div className="dcf-table-item font-mono">
                          {formatIndianCurrency(result.inputs_used.starting_revenue)}
                        </div>
                        <div className="dcf-table-item font-mono">
                          {result.inputs_used.ebit_margin.toFixed(2)}%
                        </div>
                        <div className="dcf-table-item font-mono">
                          {result.inputs_used.tax_rate.toFixed(2)}%
                        </div>
                        <div className="dcf-table-item font-mono">
                          {formatIndianCurrency(result.inputs_used.net_debt)}
                        </div>
                        <div className="dcf-table-item font-mono">
                          {(result.inputs_used.shares_outstanding / 1e7).toFixed(2)} Cr
                        </div>
                        <div className="dcf-table-item font-mono">
                          ₹{(displayPrice ?? result.current_price).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Results Table */}
                  <div className="dcf-table-container">
                    <div className="dcf-table-title">Valuation Results</div>
                    <div className="dcf-table">
                      <div className="dcf-table-left">
                        <div className="dcf-table-item">Market Implied Growth</div>
                        <div className="dcf-table-item">Enterprise Value</div>
                        <div className="dcf-table-item">Equity Value</div>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="dcf-table-item flex items-center gap-1 cursor-help">
                                Market Expectations
                                <Info className="w-3 h-3 text-muted-foreground" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <div className="text-xs space-y-1">
                                <p className="font-medium mb-2">Growth Expectations (CAGR − WACC)</p>
                                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                                  <span>Spread &lt; 0%</span>
                                  <span className="text-positive">Conservative</span>
                                  <span>Spread 0-2%</span>
                                  <span className="text-muted-foreground">Fairly valued</span>
                                  <span>Spread 2-4%</span>
                                  <span className="text-primary">Reasonable</span>
                                  <span>Spread ≥ 5%</span>
                                  <span className="text-negative">Aggressive</span>
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <div className="dcf-table-item">Data Quality</div>
                        <div className="dcf-table-item">Solver Iterations</div>
                      </div>
                      <div className="dcf-table-right">
                        <div className={`dcf-table-item font-mono font-semibold ${getGrowthRateColor(result.implied_growth_rate)}`}>
                          {formatGrowthRate(result.implied_growth_rate)} CAGR
                        </div>
                        <div className="dcf-table-item font-mono">
                          {formatIndianCurrency(result.enterprise_value)}
                        </div>
                        <div className="dcf-table-item font-mono">
                          {formatIndianCurrency(result.equity_value)}
                        </div>
                        <div className="dcf-table-item">
                          <span className={`dcf-valuation-badge ${
                            result.valuation_status === 'Conservative' ? 'conservative pulse-conservative' :
                            result.valuation_status === 'Reasonable' ? 'reasonable pulse-reasonable' :
                            result.valuation_status === 'Aggressive' ? 'aggressive pulse-aggressive' :
                            'fairly-valued pulse-fairly-valued'
                          }`}>
                            {result.valuation_status === 'Conservative' && <TrendingDown className="inline w-3 h-3 mr-1" />}
                            {result.valuation_status === 'Aggressive' && <TrendingUp className="inline w-3 h-3 mr-1" />}
                            {result.valuation_status}
                          </span>
                        </div>
                        <div className="dcf-table-item">
                          <Badge
                            variant="secondary"
                            className={
                              result.data_quality === 'Good'
                                ? 'bg-positive/20 text-positive border border-positive/30'
                                : result.data_quality === 'Partial'
                                ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                                : 'bg-orange-500/20 text-orange-500 border border-orange-500/30'
                            }
                          >
                            {result.data_quality}
                          </Badge>
                        </div>
                        <div className="dcf-table-item font-mono text-muted-foreground">
                          {result.solver_iterations}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Target Price Results (if calculated) */}
                {result.implied_growth_rate_target !== null && (
                  <div className="dcf-table-container">
                    <div className="dcf-table-title flex items-center justify-between">
                      <span>Target Price Analysis</span>
                      <Badge variant="outline" className="font-mono border-primary/50 text-primary">₹{result.target_price?.toFixed(2)}</Badge>
                    </div>
                    <div className="dcf-table">
                      <div className="dcf-table-left">
                        <div className="dcf-table-item dcf-highlight">Target Implied Growth</div>
                        <div className="dcf-table-item">Target Enterprise Value</div>
                        <div className="dcf-table-item">Target Equity Value</div>
                        <div className="dcf-table-item">Target Expectations</div>
                        <div className="dcf-table-item dcf-highlight">Upside/Downside</div>
                      </div>
                      <div className="dcf-table-right">
                        <div className={`dcf-table-item dcf-highlight font-mono font-semibold ${getGrowthRateColor(result.implied_growth_rate_target)}`}>
                          {formatGrowthRate(result.implied_growth_rate_target)} CAGR
                        </div>
                        <div className="dcf-table-item font-mono">
                          {formatIndianCurrency(result.enterprise_value_target)}
                        </div>
                        <div className="dcf-table-item font-mono">
                          {formatIndianCurrency(result.equity_value_target)}
                        </div>
                        <div className="dcf-table-item">
                          {result.valuation_status_target && (
                            <span className={`dcf-valuation-badge ${
                              result.valuation_status_target === 'Conservative' ? 'conservative' :
                              result.valuation_status_target === 'Reasonable' ? 'reasonable' :
                              result.valuation_status_target === 'Aggressive' ? 'aggressive' :
                              'fairly-valued'
                            }`}>
                              {result.valuation_status_target === 'Conservative' && <TrendingDown className="inline w-3 h-3 mr-1" />}
                              {result.valuation_status_target === 'Aggressive' && <TrendingUp className="inline w-3 h-3 mr-1" />}
                              {result.valuation_status_target}
                            </span>
                          )}
                        </div>
                        <div className={`dcf-table-item dcf-highlight font-mono font-semibold ${result.upside_percent && result.upside_percent > 0 ? 'text-positive' : 'text-negative'}`}>
                          {result.upside_percent !== null ? `${result.upside_percent > 0 ? '+' : ''}${result.upside_percent.toFixed(2)}%` : 'N/A'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {result.warnings.length > 0 && (
                  <div className="space-y-1 px-1">
                    {result.warnings.map((warning, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 text-xs text-amber-500"
                      >
                        <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span>{warning}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Advanced Options Collapsible */}
                <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="gap-2">
                        <Settings2 className="w-4 h-4" />
                        {showAdvanced ? 'Hide Options' : 'Customize Parameters'}
                        {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </CollapsibleTrigger>
                    {(mutation.data || targetPrice) && (
                      <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
                        Reset to defaults
                      </Button>
                    )}
                  </div>

                  <CollapsibleContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Target Price Input */}
                      <div className="space-y-2">
                        <Label htmlFor="target-price">Target Price (Optional)</Label>
                        <Input
                          id="target-price"
                          type="number"
                          placeholder="Enter your target price"
                          value={targetPrice}
                          onChange={(e) => setTargetPrice(e.target.value)}
                          className="font-mono"
                        />
                        <p className="text-xs text-muted-foreground">
                          Compare what growth is needed to reach your target
                        </p>
                      </div>

                      {/* Forecast Years */}
                      <div className="space-y-2">
                        <Label htmlFor="forecast-years">Forecast Period (Years)</Label>
                        <div className="flex gap-2">
                          <Input
                            id="forecast-years"
                            type="number"
                            min="1"
                            step="1"
                            placeholder="5"
                            value={forecastYears}
                            onChange={(e) => setForecastYears(e.target.value)}
                            className="font-mono flex-1"
                          />
                          <div className="flex gap-1">
                            {[1, 3, 5, 7, 10].map((yr) => (
                              <Button
                                key={yr}
                                type="button"
                                variant={forecastYears === yr.toString() ? "default" : "outline"}
                                size="sm"
                                className="px-2 h-9 min-w-[32px]"
                                onClick={() => setForecastYears(yr.toString())}
                              >
                                {yr}
                              </Button>
                            ))}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          High-growth projection period (default: 5)
                        </p>
                      </div>

                      {/* WACC Input */}
                      <div className="space-y-2">
                        <Label htmlFor="wacc">WACC (Discount Rate %)</Label>
                        <Input
                          id="wacc"
                          type="number"
                          step="0.1"
                          placeholder="10"
                          value={wacc}
                          onChange={(e) => setWacc(e.target.value)}
                          className="font-mono"
                        />
                        <p className="text-xs text-muted-foreground">
                          Weighted Average Cost of Capital (default: 10%)
                        </p>
                      </div>

                      {/* Terminal Growth Input */}
                      <div className="space-y-2">
                        <Label htmlFor="terminal-growth">Terminal Growth Rate %</Label>
                        <Input
                          id="terminal-growth"
                          type="number"
                          step="0.1"
                          placeholder="3"
                          value={terminalGrowth}
                          onChange={(e) => setTerminalGrowth(e.target.value)}
                          className="font-mono"
                        />
                        <p className="text-xs text-muted-foreground">
                          Long-term sustainable growth (default: 3%)
                        </p>
                      </div>
                    </div>

                    {/* Recalculate Button */}
                    <div className="flex justify-end pt-2">
                      <Button
                        onClick={handleRecalculate}
                        disabled={isCalculating}
                        className="gap-2"
                      >
                        {isCalculating ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Calculating...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4" />
                            Recalculate
                          </>
                        )}
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
    </div>
  );
}
