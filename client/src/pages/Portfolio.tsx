import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Package, TrendingUp, Plus } from "lucide-react";

export default function Portfolio() {
  return (
    <div className="min-h-screen bg-background">
      {/* Page masthead */}
      <section className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-10">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2">
              <Eyebrow tone="gold" rule>
                Personal · Holdings
              </Eyebrow>
              <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
                Portfolio.
              </h1>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Track your investments, P&amp;L, and exposure across positions.
              </p>
            </div>
            <Button
              className="rounded-full bg-[hsl(var(--brand-navy))] text-white hover:bg-[hsl(var(--brand-navy))]/90 gap-2"
              data-testid="button-add-holding"
            >
              <Plus className="h-4 w-4" />
              Add holding
            </Button>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-10">
        <Card className="p-16 text-center border-border">
          <div className="flex flex-col items-center justify-center">
            <div className="rounded-full bg-[hsl(var(--brand-gold))]/15 p-6 mb-5">
              <Package className="h-10 w-10 text-[hsl(var(--brand-gold))]" />
            </div>
            <h2 className="font-display text-xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground mb-2">
              No holdings yet
            </h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Connect your broker account or manually add holdings to track
              portfolio performance and get personalized insights.
            </p>
            <Button
              className="rounded-full bg-[hsl(var(--brand-gold))] text-white hover:bg-[hsl(var(--brand-gold))]/90 gap-2"
              data-testid="button-connect-broker"
            >
              <TrendingUp className="h-4 w-4" />
              Connect portfolio
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
