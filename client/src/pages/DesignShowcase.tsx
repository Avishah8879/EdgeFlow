/**
 * /_design — internal showcase route for the EquityPro design system.
 *
 * AuthGuard-only (mounted in App.tsx behind AuthGuard), so it doesn't
 * leak to the public surface. Renders every primitive built in Phase B
 * for visual review in light + dark.
 */
import { useState } from "react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { DeltaBadge } from "@/components/ui/delta-badge";
import { ChipFilter } from "@/components/ui/chip-filter";
import { TabBar, type TabBarItem } from "@/components/ui/tab-bar";
import { MarketStatusPill } from "@/components/ui/market-status-pill";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiTile } from "@/components/viz/kpi-tile";
import { Sparkline } from "@/components/viz/sparkline";
import { ScorecardRing } from "@/components/viz/scorecard-ring";
import { HeatmapCell } from "@/components/viz/heatmap-cell";
import { ScoreBar } from "@/components/viz/score-bar";

const upTrend = [10, 12, 11.5, 13, 12.8, 14.2, 14, 15.1, 16, 15.5, 17];
const downTrend = [17, 16.2, 16.5, 15, 14.8, 13.4, 13, 12.1, 11, 11.6, 10];

const segmentedTabs: TabBarItem<"1d" | "1w" | "1m" | "1y">[] = [
  { id: "1d", label: "1D" },
  { id: "1w", label: "1W" },
  { id: "1m", label: "1M" },
  { id: "1y", label: "1Y" },
];

const underlineTabs: TabBarItem<"overview" | "fundamentals" | "technicals">[] = [
  { id: "overview", label: "Overview" },
  { id: "fundamentals", label: "Fundamentals", count: 24 },
  { id: "technicals", label: "Technicals", count: 8 },
];

export default function DesignShowcase() {
  const [chip, setChip] = useState("all");
  const [seg, setSeg] = useState<"1d" | "1w" | "1m" | "1y">("1m");
  const [page, setPage] = useState<"overview" | "fundamentals" | "technicals">(
    "overview",
  );

  return (
    <div className="space-y-10">
      {/* Page header */}
      <header className="space-y-2">
        <Eyebrow tone="gold" rule>
          Design System · Phase B
        </Eyebrow>
        <h1 className="font-display text-4xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
          EquityPro Components
        </h1>
        <p className="max-w-[60ch] text-sm text-muted-foreground">
          Internal showcase for every primitive in the migration. Toggle the
          theme in the topbar to verify both modes.
        </p>
      </header>

      {/* Buttons + badges */}
      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="default">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
        </div>
      </Section>

      <Section title="Badges & deltas">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <DeltaBadge value={1.42} suffix="%" />
          <DeltaBadge value={-0.85} suffix="%" />
          <DeltaBadge value={0} />
          <DeltaBadge value={2.41} suffix="%" variant="badge" />
          <DeltaBadge value={-1.15} suffix="%" variant="badge" />
        </div>
      </Section>

      <Section title="Eyebrows">
        <div className="space-y-3">
          <Eyebrow>Default muted</Eyebrow>
          <br />
          <Eyebrow tone="gold" rule>
            Gold with rule
          </Eyebrow>
        </div>
      </Section>

      <Section title="Chip filters">
        <div className="flex flex-wrap gap-2">
          {["all", "gainers", "losers", "active", "sectors"].map((id) => (
            <ChipFilter
              key={id}
              active={chip === id}
              onClick={() => setChip(id)}
            >
              {id.charAt(0).toUpperCase() + id.slice(1)}
            </ChipFilter>
          ))}
        </div>
      </Section>

      <Section title="Tab bar — segmented">
        <TabBar tabs={segmentedTabs} value={seg} onChange={setSeg} variant="segmented" />
      </Section>

      <Section title="Tab bar — underline">
        <TabBar tabs={underlineTabs} value={page} onChange={setPage} />
        <p className="mt-3 text-sm text-muted-foreground">
          Active page: <span className="font-mono">{page}</span>
        </p>
      </Section>

      <Section title="Market status pill">
        <div className="flex items-center gap-3">
          <MarketStatusPill />
          <span className="text-xs text-muted-foreground">
            Sources from useMarketStatus(). Pulse animates while open.
          </span>
        </div>
      </Section>

      <Section title="KPI tiles">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <KpiTile label="NIFTY 50" value="22,415.20" delta={0.42} caption="vs prev close" />
          <KpiTile label="SENSEX" value="73,612.05" delta={0.31} />
          <KpiTile label="BANK NIFTY" value="48,114.30" delta={-0.22} />
          <KpiTile label="INDIA VIX" value="14.85" delta={2.4} caption="rising volatility" />
        </div>
      </Section>

      <Section title="Sparklines">
        <div className="flex items-center gap-6">
          <Sparkline data={upTrend} />
          <Sparkline data={downTrend} />
          <Sparkline data={[5, 5.2, 5.1, 5.3, 5.2]} tone="neutral" />
          <Sparkline data={upTrend} width={140} height={36} />
        </div>
      </Section>

      <Section title="Scorecard rings">
        <div className="flex flex-wrap items-end gap-6">
          <ScorecardRing value={82} label="Valuation" />
          <ScorecardRing value={56} label="Profitability" />
          <ScorecardRing value={28} label="Momentum" />
          <ScorecardRing value={71} label="Growth" tone="primary" />
        </div>
      </Section>

      <Section title="Sector heatmap">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <HeatmapCell label="IT" value={2.34} caption="₹4.1L Cr" />
          <HeatmapCell label="Banks" value={0.85} caption="₹6.3L Cr" />
          <HeatmapCell label="Auto" value={4.62} caption="₹2.8L Cr" />
          <HeatmapCell label="Pharma" value={-0.42} caption="₹3.1L Cr" />
          <HeatmapCell label="Energy" value={-2.18} caption="₹5.2L Cr" />
          <HeatmapCell label="FMCG" value={-3.94} caption="₹2.4L Cr" />
        </div>
      </Section>

      <Section title="Score bars">
        <div className="space-y-2">
          {[
            { label: "Magic Score", value: 87 },
            { label: "ROC", value: 64 },
            { label: "E/EV", value: 42 },
            { label: "Liquidity", value: 21 },
          ].map((row) => (
            <div key={row.label} className="grid grid-cols-[120px_1fr_60px] items-center gap-3 text-sm">
              <span className="text-muted-foreground">{row.label}</span>
              <ScoreBar value={row.value} width={200} />
              <span className="font-mono tabular-nums text-right">{row.value}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Cards & numerics">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { ticker: "RELIANCE", price: 2841.5, delta: 1.42, spark: upTrend },
            { ticker: "TCS", price: 3911.05, delta: -0.85, spark: downTrend },
            { ticker: "INFY", price: 1602.3, delta: 0.21, spark: upTrend },
          ].map((row) => (
            <Card key={row.ticker} className="shadow-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="font-mono text-base">{row.ticker}</CardTitle>
                  <Sparkline data={row.spark} />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-2xl font-semibold tabular-nums">
                    ₹{row.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                  <DeltaBadge value={row.delta} suffix="%" />
                </div>
                <p className="text-xs text-muted-foreground">Mock data — wired in Phase D.</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-card p-6">
      <Eyebrow className="mb-4 block">{title}</Eyebrow>
      {children}
    </section>
  );
}
