import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Activity, BarChart3 } from "lucide-react";

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
