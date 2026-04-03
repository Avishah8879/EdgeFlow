import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, TrendingUp, Plus } from "lucide-react";

export default function Portfolio() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Portfolio</h1>
            <p className="text-muted-foreground mt-2">Track your investments and performance</p>
          </div>
          <Button className="gap-2" data-testid="button-add-holding">
            <Plus className="h-4 w-4" />
            Add Holding
          </Button>
        </div>

        <Card className="p-16 text-center">
          <div className="flex flex-col items-center justify-center">
            <div className="rounded-full bg-muted p-6 mb-4">
              <Package className="h-12 w-12 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No Holdings Yet</h2>
            <p className="text-muted-foreground mb-6 max-w-md">
              Connect your broker account or manually add your holdings to track your portfolio performance and get personalized insights.
            </p>
            <Button variant="default" className="gap-2" data-testid="button-connect-broker">
              <TrendingUp className="h-4 w-4" />
              Connect Portfolio
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
