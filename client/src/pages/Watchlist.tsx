import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, Plus } from "lucide-react";

export default function Watchlist() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Watchlist</h1>
            <p className="text-muted-foreground mt-2">Monitor your favorite stocks and funds</p>
          </div>
          <Button className="gap-2" data-testid="button-add-to-watchlist">
            <Plus className="h-4 w-4" />
            Add Stock
          </Button>
        </div>

        <Card className="p-16 text-center">
          <div className="flex flex-col items-center justify-center">
            <div className="rounded-full bg-muted p-6 mb-4">
              <Heart className="h-12 w-12 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Your Watchlist is Empty</h2>
            <p className="text-muted-foreground mb-6 max-w-md">
              Start building your watchlist by adding stocks and mutual funds you want to track. Get real-time updates and alerts.
            </p>
            <Button variant="default" data-testid="button-browse-stocks">
              Browse Stocks
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
