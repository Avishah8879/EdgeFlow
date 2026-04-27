import { Link } from "wouter";
import { ModeToggle } from "@/components/ModeToggle";
import { SearchBar } from "@/components/search/SearchBar";
import MarketStatusBadge from "@/components/MarketStatusBadge";
import { CoinBalanceBadge } from "@/components/CoinBalanceBadge";
import { Zap } from "lucide-react";

export default function Topbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="flex h-full items-center justify-between px-4 gap-4">
        {/* Logo */}
        <Link href="/home" className="flex items-center gap-2 shrink-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/15 border border-primary/30">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <span className="text-lg font-bold tracking-tight">
            <span className="text-primary">Edge</span>
            <span className="text-foreground">Flow</span>
          </span>
        </Link>

        {/* Search — center */}
        <div className="flex-1 max-w-md mx-auto hidden md:block">
          <SearchBar variant="inline" />
        </div>

        {/* Right section */}
        <div className="flex items-center gap-3 shrink-0">
          <MarketStatusBadge />
          <CoinBalanceBadge />
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
