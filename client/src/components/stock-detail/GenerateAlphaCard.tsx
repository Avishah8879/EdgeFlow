import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";
import { Link } from "wouter";

interface GenerateAlphaCardProps {
  ticker: string;
}

/**
 * GenerateAlphaCard - CTA card to redirect users to Alpha Generation page
 *
 * Features:
 * - Clickable card that links to /alpha-generation with ticker pre-selected
 * - Does not auto-run optimization - user triggers it manually
 * - Fills remaining space below StockScorecard
 */
export default function GenerateAlphaCard({ ticker }: GenerateAlphaCardProps) {
  return (
    <Card className="flex-1 flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Generate Alpha
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-center space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Run AI-powered strategy optimization using {ticker}'s historical data to discover profitable trading conditions.
        </p>

        <Link href={`/alpha-generation?ticker=${encodeURIComponent(ticker)}`}>
          <Button className="w-full gap-2">
            Generate Strategy
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
