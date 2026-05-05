import { Link } from "wouter";
import { ModeToggle } from "@/components/ModeToggle";
import { SearchBar } from "@/components/search/SearchBar";
import MarketStatusBadge from "@/components/MarketStatusBadge";
import { CoinBalanceBadge } from "@/components/CoinBalanceBadge";
import { UserMenu } from "@/components/UserMenu";
import { EquityProLogo } from "@/components/EquityProLogo";

export default function Topbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-border bg-background/85 backdrop-blur-md backdrop-saturate-150">
      <div className="flex h-full items-center justify-between px-4 gap-6">
        {/* Brand lockup */}
        <Link href="/home" className="shrink-0" aria-label="EquityPro home">
          <EquityProLogo size="sm" />
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
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
