import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Construction } from 'lucide-react';
import { PairFeasibilityPanel } from '@/components/ft/pair-trading/PairFeasibilityPanel';
import { PairScannerPanel } from '@/components/ft/pair-trading/PairScannerPanel';
import { PairWatchlistPanel } from '@/components/ft/pair-trading/PairWatchlistPanel';
import { FtPageHeader } from '@/components/ft/FtPageHeader';

function ComingSoon({ title }: { title: string }) {
  return (
    <Card className="py-16 bg-card border-border text-center">
      <Construction className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
      <h3 className="font-display text-lg font-bold text-[hsl(var(--brand-navy))] dark:text-foreground mb-1">
        {title}
      </h3>
      <p className="text-sm text-muted-foreground">Coming soon.</p>
    </Card>
  );
}

export default function PairTrading() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background">
      <FtPageHeader
        eyebrow="Terminal · Stat-arb"
        title="Pair trading"
        description="Cointegration screening and z-score signals for market-neutral pair strategies."
      />
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
        <Tabs defaultValue="feasibility" className="w-full">
          <TabsList className="grid w-full md:w-auto md:inline-grid grid-cols-4">
            <TabsTrigger value="feasibility">Feasibility</TabsTrigger>
            <TabsTrigger value="test-lab">Test Lab</TabsTrigger>
            <TabsTrigger value="scanner">Scanner</TabsTrigger>
            <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
          </TabsList>

          <TabsContent value="feasibility" className="mt-4">
            <PairFeasibilityPanel />
          </TabsContent>

          <TabsContent value="test-lab" className="mt-4">
            <ComingSoon title="Test Lab" />
          </TabsContent>

          <TabsContent value="scanner" className="mt-4">
            <PairScannerPanel />
          </TabsContent>

          <TabsContent value="watchlist" className="mt-4">
            <PairWatchlistPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
