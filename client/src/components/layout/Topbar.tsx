import { Link } from "wouter";
import { ModeToggle } from "@/components/ModeToggle";
import { SearchBar } from "@/components/search/SearchBar";
import { MarketStatusPill } from "@/components/ui/market-status-pill";
import { CoinBalanceBadge } from "@/components/CoinBalanceBadge";
import { UserMenu } from "@/components/UserMenu";
import { EquityProLogo } from "@/components/EquityProLogo";
import { NavPrimary } from "./NavPrimary";
import { MobileNavDrawer } from "./MobileNavDrawer";

export default function Topbar() {
  return (
    <header className="sticky top-0 z-50 h-16 border-b border-border bg-background/85 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex h-full max-w-[1440px] items-center gap-3 md:gap-6 px-4 md:px-8">
        {/* Mobile drawer trigger — visible below lg */}
        <MobileNavDrawer />

        {/* Brand lockup */}
        <Link href="/home" className="shrink-0" aria-label="EquityPro home">
          <EquityProLogo size="sm" />
        </Link>

        {/* Horizontal nav-primary — visible lg+ */}
        <NavPrimary />

        <div className="flex-1" />

        {/* Search */}
        <div className="hidden md:block w-64 lg:w-72 shrink-0">
          <SearchBar variant="inline" />
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <MarketStatusPill className="hidden xl:inline-flex" />
          <CoinBalanceBadge />
          <ModeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
