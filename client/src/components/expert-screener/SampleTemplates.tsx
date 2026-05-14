import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Activity, BarChart3, Crosshair, Minimize2, LineChart, TrendingDown, Rocket } from "lucide-react";

interface Template {
  id: string;
  name: string;
  description: string;
  expression: string;
  icon: React.ReactNode;
}

const templates: Template[] = [
  {
    id: "momentum_liquidity",
    name: "Momentum & Liquidity",
    description: "Strong trend with large cash participation",
    expression: "(close > ema_50) and (ema_50 > ema_150) and (liquidity > 1000000000)",
    icon: <TrendingUp className="w-5 h-5 text-primary" />,
  },
  {
    id: "rsi_pullback",
    name: "RSI Pullback",
    description: "Oversold dip within a long-term uptrend",
    expression: "(close > sma_200) and (rsi_14 >= 35 and rsi_14 <= 50)",
    icon: <Activity className="w-5 h-5 text-primary" />,
  },
  {
    id: "52w_breakout",
    name: "52W Breakout Watch",
    description: "Price reclaiming prior highs on rising RSI",
    expression: "(close > 0.9 * high_52_W) and (ema_20 > ema_50)",
    icon: <BarChart3 className="w-5 h-5 text-primary" />,
  },
  {
    id: "golden_cross",
    name: "Golden Cross Setup",
    description: "Classic bullish crossover with liquidity confirmation",
    expression: "(ema_50 > ema_200) and (close > ema_50) and (liquidity > 500000000)",
    icon: <Crosshair className="w-5 h-5 text-primary" />,
  },
  {
    id: "volatility_squeeze",
    name: "Volatility Squeeze",
    description: "Tight Bollinger Bands signaling a potential breakout",
    expression: "((bb_upper_20_2 - bb_lower_20_2) / bb_middle_20_2 < 0.1) and (close > sma_50)",
    icon: <Minimize2 className="w-5 h-5 text-primary" />,
  },
  {
    id: "macd_bullish_crossover",
    name: "MACD Bullish Crossover",
    description: "Momentum shift catching early trend reversals",
    expression: "(macd_line > macd_signal) and (macd_histogram > 0) and (close > ema_50) and (rsi_14 > 50)",
    icon: <LineChart className="w-5 h-5 text-primary" />,
  },
  {
    id: "oversold_reversal",
    name: "Oversold Reversal",
    description: "Deeply oversold names showing signs of a bounce",
    expression: "(rsi_14 < 30) and (close > low_20_D) and (liquidity > 100000000)",
    icon: <TrendingDown className="w-5 h-5 text-primary" />,
  },
  {
    id: "ath_momentum",
    name: "ATH Momentum",
    description: "Stocks at new highs with stacked moving averages",
    expression: "(close >= high_52_W) and (close > ema_20) and (ema_20 > ema_50) and (ema_50 > ema_200)",
    icon: <Rocket className="w-5 h-5 text-primary" />,
  },
];

interface SampleTemplatesProps {
  onTemplateSelect: (expression: string) => void;
  disabled?: boolean;
}

export default function SampleTemplates({
  onTemplateSelect,
  disabled = false,
}: SampleTemplatesProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold mb-1">Sample Templates</h2>
        <p className="text-sm text-muted-foreground">
          Start from a battle-tested expression
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {templates.map((template) => (
          <Card
            key={template.id}
            className={`cursor-pointer transition-all duration-200 ${
              disabled
                ? "opacity-50 cursor-not-allowed"
                : "hover-elevate hover:border-primary/50"
            }`}
            onClick={() => !disabled && onTemplateSelect(template.expression)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    {template.icon}
                    {template.name}
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    {template.description}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="p-2 bg-accent text-accent-foreground rounded text-xs font-mono break-words">
                {template.expression}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
