import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Home, ChevronRight, Construction } from 'lucide-react';
import { PairFeasibilityPanel } from '@/components/ft/pair-trading/PairFeasibilityPanel';

function ComingSoon({ title }: { title: string }) {
  return (
    <Card className="py-16 bg-card/50 border-primary/20 text-center">
      <Construction className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground">Coming soon.</p>
    </Card>
  );
}

export default function PairTrading() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-card p-4 md:p-6 space-y-4 overflow-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Home className="w-4 h-4" />
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium">Pair Trading Feasibility</span>
      </div>

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
          <ComingSoon title="Scanner" />
        </TabsContent>

        <TabsContent value="watchlist" className="mt-4">
          <ComingSoon title="Watchlist" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
