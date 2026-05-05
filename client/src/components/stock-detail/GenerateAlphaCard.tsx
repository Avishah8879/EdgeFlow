import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, ExternalLink } from "lucide-react";
import { getEquityProAiUrl, EXTERNAL_LINK_PROPS } from "@/lib/external-links";

interface GenerateAlphaCardProps {
  ticker: string;
}

/**
 * GenerateAlphaCard - CTA that opens EquityPro AI in a new tab.
 *
 * Alpha Generation moved out of the platform — this card now redirects
 * users to the standalone EquityPro AI product (configured via
 * VITE_EQUITYPRO_AI_URL).
 */
export default function GenerateAlphaCard({ ticker }: GenerateAlphaCardProps) {
  const url = `${getEquityProAiUrl()}?ticker=${encodeURIComponent(ticker)}`;
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
          Build, backtest, and tune AI-driven strategies for {ticker} on the
          EquityPro AI platform. Opens in a new tab.
        </p>

        <a href={url} {...EXTERNAL_LINK_PROPS} aria-label="Open EquityPro AI in a new tab">
          <Button className="w-full gap-2">
            Open EquityPro AI
            <ExternalLink className="w-4 h-4" />
          </Button>
        </a>
      </CardContent>
    </Card>
  );
}
