import { useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ReferenceLine,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import {
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  TrendingUp,
  Search,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSymbolSearch } from "@/hooks/useSymbolSearch";
import {
  usePortfolioOptimizer,
  type PortfolioHolding,
  type OptimizationResult,
} from "@/hooks/usePortfolioOptimizer";

const COLORS = {
  primary: "#00FF00",
  secondary: "#FF6B47",
  accent: "#FFD700",
  buy: "#00FF00",
  sell: "#FF4444",
  hold: "#888888",
  frontier: "#FF6B47",
  current: "#FFD700",
  tangency: "#00FF00",
  cml: "#FF6B35",
  equity: "#FF6B47",
};

// Colors for rolling weights stacked area chart
const ROLLING_WEIGHT_COLORS = [
  "#00FF00", // Matrix Green
  "#FF6B47", // Coral
  "#FFD700", // Gold
  "#FF6B35", // Orange
  "#E040FB", // Purple
  "#00E5FF", // Cyan
  "#FFEB3B", // Yellow
  "#FF5252", // Red
  "#69F0AE", // Light Green
  "#448AFF", // Light Blue
];

export function PortfolioOptimizerPanel() {
  // Holdings state
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  // Search hook
  const { data: searchResults, isLoading: isSearching } =
    useSymbolSearch(searchQuery);

  // Optimizer hook
  const {
    submit,
    reset,
    isLoading,
    isSubmitting,
    isPolling,
    jobStatus,
    result,
    error,
  } = usePortfolioOptimizer();

  // Add holding from search
  const addHolding = useCallback(
    (symbol: string, name?: string) => {
      if (holdings.some((h) => h.symbol === symbol)) {
        return; // Already exists
      }
      setHoldings([...holdings, { symbol, name, quantity: 0 }]);
      setSearchQuery("");
      setShowDropdown(false);
    },
    [holdings]
  );

  // Update holding quantity
  const updateQuantity = useCallback(
    (symbol: string, quantity: number) => {
      setHoldings(
        holdings.map((h) => (h.symbol === symbol ? { ...h, quantity } : h))
      );
    },
    [holdings]
  );

  // Remove holding
  const removeHolding = useCallback(
    (symbol: string) => {
      setHoldings(holdings.filter((h) => h.symbol !== symbol));
    },
    [holdings]
  );

  // Submit optimization with default parameters
  const handleSubmit = useCallback(() => {
    const validHoldings = holdings.filter((h) => h.quantity > 0);
    if (validHoldings.length < 2) {
      return;
    }

    submit({
      holdings: validHoldings,
    });
  }, [holdings, submit]);

  const validHoldingsCount = holdings.filter((h) => h.quantity > 0).length;
  const canSubmit = validHoldingsCount >= 2 && !isLoading;

  return (
    <div className="flex flex-col h-full bg-[#0A0A0A]">
      {/* Header */}
      <div className="p-3 border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#00FF00]" />
            <span className="text-[10px] uppercase tracking-wider text-[#888888]">
              Portfolio Optimizer
            </span>
          </div>
          {result && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px]"
              onClick={reset}
            >
              Reset
            </Button>
          )}
        </div>

        {/* Stock Search */}
        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-[#888888]" />
              <Input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value.toUpperCase());
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search stock (e.g., RELIANCE)"
                className="h-8 pl-7 bg-[#000000] border-[#1a1a1a] text-[#FFFFFF] font-mono text-sm"
              />
            </div>
          </div>

          {/* Search Dropdown */}
          {showDropdown && searchQuery.length >= 2 && (
            <div className="absolute z-50 w-full mt-1 bg-[#0A0A0A] border border-[#1a1a1a] rounded max-h-48 overflow-y-auto">
              {isSearching ? (
                <div className="p-2 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-[#888888]" />
                </div>
              ) : searchResults && searchResults.length > 0 ? (
                searchResults.map((item) => (
                  <div
                    key={item.symbol}
                    className="px-3 py-2 hover:bg-[#1a1a1a] cursor-pointer flex items-center justify-between"
                    onClick={() => addHolding(item.symbol, item.name)}
                  >
                    <div>
                      <span className="text-sm text-[#00FF00] font-mono">
                        {item.symbol}
                      </span>
                      <span className="text-xs text-[#888888] ml-2">
                        {item.name}
                      </span>
                    </div>
                    <Plus className="w-3 h-3 text-[#888888]" />
                  </div>
                ))
              ) : (
                <div className="p-2 text-xs text-[#888888] text-center">
                  No results found
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Holdings Table */}
      {holdings.length > 0 && (
        <div className="border-b border-[#1a1a1a]">
          <div className="px-3 py-2">
            <div className="flex justify-between items-center mb-2">
              <div className="text-[10px] uppercase tracking-wider text-[#888888]">
                Current Holdings ({holdings.length})
              </div>
              <div className={`text-[10px] font-mono ${
                Math.abs(holdings.reduce((sum, h) => sum + (h.quantity || 0), 0) - 100) < 1
                  ? "text-[#00FF00]"
                  : "text-[#FFD700]"
              }`}>
                Total: {holdings.reduce((sum, h) => sum + (h.quantity || 0), 0).toFixed(1)}%
              </div>
            </div>
            <div className="grid grid-cols-[1fr_80px_32px] gap-2 text-[10px] uppercase tracking-wider text-[#888888] mb-1">
              <div>Symbol</div>
              <div className="text-right">Weight %</div>
              <div></div>
            </div>
            <div className="max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-[#333] scrollbar-track-transparent">
              {holdings.map((holding) => (
                <div
                  key={holding.symbol}
                  className="grid grid-cols-[1fr_80px_32px] gap-2 py-1 items-center"
                >
                  <div>
                    <span className="text-sm text-[#00FF00] font-mono">
                      {holding.symbol}
                    </span>
                    {holding.name && (
                      <span className="text-[10px] text-[#888888] ml-2 truncate">
                        {holding.name}
                      </span>
                    )}
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={holding.quantity || ""}
                    onChange={(e) =>
                      updateQuantity(
                        holding.symbol,
                        parseFloat(e.target.value) || 0
                      )
                    }
                    placeholder="33.3"
                    className="h-6 text-right bg-[#000000] border-[#1a1a1a] text-[#FFFFFF] font-mono text-sm"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => removeHolding(holding.symbol)}
                  >
                    <Trash2 className="w-3 h-3 text-[#FF4444]" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <div className="p-3 border-b border-[#1a1a1a]">
        <Button
          className="w-full bg-[#00FF00] hover:bg-[#00CC00] text-black font-semibold"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Submitting...
            </>
          ) : isPolling ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Optimizing... ({jobStatus})
            </>
          ) : (
            "Optimize Portfolio"
          )}
        </Button>
        {!canSubmit && holdings.length > 0 && validHoldingsCount < 2 && (
          <p className="text-[10px] text-[#FF4444] mt-1 text-center">
            Enter quantities for at least 2 stocks
          </p>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-3 border-b border-[#1a1a1a] bg-[#1a0000]">
          <div className="flex items-center gap-2 text-[#FF4444]">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Results */}
      {result && <OptimizationResults result={result} />}

      {/* Empty State */}
      {!result && !isLoading && holdings.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-[#888888] p-6">
          <TrendingUp className="w-12 h-12 mb-4 opacity-50" />
          <p className="text-sm text-center">
            Add stocks to your portfolio and enter the number of shares you own
          </p>
          <p className="text-xs mt-2 text-center">
            The optimizer will suggest optimal allocation using Black-Litterman
            model
          </p>
        </div>
      )}
    </div>
  );
}

// Results Component
function OptimizationResults({ result }: { result: OptimizationResult }) {
  // Find the closest date in equity curve data to OOS start for reference line
  const oosLineDate = (() => {
    if (!result.oos_start || !result.equity_curve?.length) return null;
    const oosDate = new Date(result.oos_start).getTime();
    let closestDate = result.equity_curve[0].date;
    let minDiff = Math.abs(new Date(closestDate).getTime() - oosDate);

    for (const point of result.equity_curve) {
      const diff = Math.abs(new Date(point.date).getTime() - oosDate);
      if (diff < minDiff) {
        minDiff = diff;
        closestDate = point.date;
      }
    }
    return closestDate;
  })();

  return (
    <ScrollArea className="flex-1">
      <div className="p-3 space-y-4">
        {/* Weight Comparison */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#888888] mb-2">
            Weight Comparison
          </div>
          <div className="border border-[#1a1a1a] rounded">
            <div className="grid grid-cols-4 gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-[#888888] border-b border-[#1a1a1a] bg-[#000000]">
              <div>Symbol</div>
              <div className="text-right">Current</div>
              <div className="text-right">Optimal</div>
              <div className="text-right">Change</div>
            </div>
            {result.weight_comparison.map((item) => (
              <div
                key={item.symbol}
                className="grid grid-cols-4 gap-2 px-3 py-2 border-b border-[#1a1a1a] last:border-0"
              >
                <div className="text-sm text-[#00FF00] font-mono">
                  {item.symbol}
                </div>
                <div className="text-right font-mono text-sm text-[#FFD700]">
                  {item.current_weight.toFixed(2)}%
                </div>
                <div className="text-right font-mono text-sm text-[#00FF00]">
                  {item.optimal_weight.toFixed(2)}%
                </div>
                <div
                  className={`text-right font-mono text-sm ${
                    item.change > 0
                      ? "text-[#00FF00]"
                      : item.change < 0
                      ? "text-[#FF4444]"
                      : "text-[#888888]"
                  }`}
                >
                  {item.change > 0 ? "+" : ""}
                  {item.change.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Equity Curve Chart */}
        {result.equity_curve && result.equity_curve.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#888888] mb-2">
              Equity Curve (IS + OOS)
            </div>
            <div className="h-[200px] border border-[#1a1a1a] rounded p-2 bg-[#000000]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={result.equity_curve}
                  margin={{ top: 10, right: 30, bottom: 20, left: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                  <XAxis
                    dataKey="date"
                    stroke="#888888"
                    style={{ fontSize: "9px", fontFamily: "monospace" }}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return `${date.getFullYear()}`;
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="#888888"
                    style={{ fontSize: "9px", fontFamily: "monospace" }}
                    tickFormatter={(v) => v.toFixed(1)}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0A0A0A",
                      border: "1px solid #1a1a1a",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontFamily: "monospace",
                    }}
                    labelFormatter={(value) => {
                      const date = new Date(value);
                      return date.toLocaleDateString("en-IN", {
                        month: "short",
                        year: "numeric",
                      });
                    }}
                    formatter={(value: number) => [
                      value.toFixed(4),
                      "Portfolio Value",
                    ]}
                  />
                  {/* Train/Test Split Line (OOS Start) */}
                  {oosLineDate && (
                    <ReferenceLine
                      x={oosLineDate}
                      stroke="#FFD700"
                      strokeDasharray="5 5"
                      strokeWidth={2}
                      label={{
                        value: "OOS",
                        position: "insideTopRight",
                        fill: "#FFD700",
                        fontSize: 10,
                        fontFamily: "monospace",
                      }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="value"
                    name="Equity"
                    stroke={COLORS.equity}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Efficient Frontier Chart */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#888888] mb-2">
            Efficient Frontier with Capital Market Line
          </div>
          <div className="h-[250px] border border-[#1a1a1a] rounded p-2 bg-[#000000]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart
                margin={{ top: 10, right: 30, bottom: 30, left: 50 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                <XAxis
                  type="number"
                  dataKey="volatility"
                  name="Volatility"
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
                  stroke="#888888"
                  style={{ fontSize: "10px", fontFamily: "monospace" }}
                  label={{
                    value: "Volatility",
                    position: "bottom",
                    offset: 10,
                    style: {
                      fontSize: "10px",
                      fill: "#888888",
                      fontFamily: "monospace",
                    },
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="return"
                  name="Return"
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
                  stroke="#888888"
                  style={{ fontSize: "10px", fontFamily: "monospace" }}
                  label={{
                    value: "Expected Return",
                    angle: -90,
                    position: "insideLeft",
                    style: {
                      fontSize: "10px",
                      fill: "#888888",
                      fontFamily: "monospace",
                    },
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0A0A0A",
                    border: "1px solid #1a1a1a",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontFamily: "monospace",
                  }}
                  formatter={(value: number, name: string) => [
                    `${(value * 100).toFixed(2)}%`,
                    name === "volatility" ? "Volatility" : "Return",
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: "10px", fontFamily: "monospace" }}
                />

                {/* Efficient Frontier Line */}
                <Scatter
                  name="Efficient Frontier"
                  data={result.efficient_frontier}
                  fill={COLORS.frontier}
                  line={{ stroke: COLORS.frontier, strokeWidth: 3 }}
                  shape={() => <></>}
                  legendType="line"
                />

                {/* Capital Market Line */}
                {result.capital_market_line && (
                  <Scatter
                    name="Capital Market Line"
                    data={[
                      result.capital_market_line.start,
                      result.capital_market_line.end,
                    ]}
                    fill="none"
                    line={{ stroke: COLORS.cml, strokeWidth: 2, strokeDasharray: "5 5" }}
                    shape={() => <></>}
                    legendType="line"
                  />
                )}

                {/* Current Portfolio Point */}
                <Scatter
                  name="Current Portfolio"
                  data={[result.current_point]}
                  fill={COLORS.current}
                  shape="diamond"
                  legendType="diamond"
                >
                  {/* Larger marker */}
                </Scatter>

                {/* Tangency (Optimal) Point */}
                <Scatter
                  name="Tangency Portfolio"
                  data={[result.tangency_point]}
                  fill={COLORS.tangency}
                  shape="star"
                  legendType="star"
                >
                  {/* Larger marker */}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Rolling Portfolio Weights Chart */}
        {result.rolling_weights && result.rolling_weights.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#888888] mb-2">
              Rolling Portfolio Weights
            </div>
            <div className="h-[200px] border border-[#1a1a1a] rounded p-2 bg-[#000000]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={result.rolling_weights}
                  margin={{ top: 10, right: 30, bottom: 20, left: 40 }}
                  stackOffset="expand"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                  <XAxis
                    dataKey="date"
                    stroke="#888888"
                    style={{ fontSize: "9px", fontFamily: "monospace" }}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return `${date.getFullYear()}`;
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="#888888"
                    style={{ fontSize: "9px", fontFamily: "monospace" }}
                    tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                    domain={[0, 1]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0A0A0A",
                      border: "1px solid #1a1a1a",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontFamily: "monospace",
                    }}
                    labelFormatter={(value) => {
                      const date = new Date(value);
                      return date.toLocaleDateString("en-IN", {
                        month: "short",
                        year: "numeric",
                      });
                    }}
                    formatter={(value: number) => [`${value.toFixed(1)}%`, ""]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "9px", fontFamily: "monospace" }}
                  />
                  {result.rolling_weight_symbols.map((symbol, index) => (
                    <Area
                      key={symbol}
                      type="monotone"
                      dataKey={symbol}
                      stackId="1"
                      stroke={ROLLING_WEIGHT_COLORS[index % ROLLING_WEIGHT_COLORS.length]}
                      fill={ROLLING_WEIGHT_COLORS[index % ROLLING_WEIGHT_COLORS.length]}
                      fillOpacity={0.8}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="text-[10px] text-[#888888] flex justify-between">
          <span>
            Risk-Free Rate: {(result.risk_free_rate * 100).toFixed(1)}%
          </span>
          <span>
            Rebalance: {result.optimal_rebalance_frequency === "M" ? "Monthly" : result.optimal_rebalance_frequency === "W" ? "Weekly" : "Bi-Weekly"}
          </span>
          <span>
            Computed:{" "}
            {new Date(result.computed_at).toLocaleString("en-IN", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </span>
        </div>
      </div>
    </ScrollArea>
  );
}
