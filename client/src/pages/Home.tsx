import {
  TrendingUp,
  TrendingDown,
  Activity,
  ArrowUpCircle,
  ArrowDownCircle,
  ListFilter,
  ChevronRight,
  Zap,
  BarChart3,
  LineChart,
  Layers,
  Brain,
  Newspaper,
  Globe,
  Calculator,
  GitCompare,
  BookOpen,
  PieChart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import IndexCard from "@/components/IndexCard";
import TabsSection from "@/components/TabsSection";
import { Link } from "wouter";
import MarketMoversSection from "@/components/MarketMoversSection";
import NewsSection from "@/components/NewsSection";
import MarketStatusBadge from "@/components/MarketStatusBadge";
import { HeroNumber } from "@/components/HeroNumber";
import type { CategoryType } from "@/lib/types";
import { useIndices } from "@/hooks/use-indices";
import { IndexCardSkeleton } from "@/components/LoadingSkeleton";
import { useSmartLoader } from "@/hooks/use-smart-loader";
import { motion } from "framer-motion";
import { fadeInUp, easeOut } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { SEO } from "@/components/SEO";
import { PAGE_SEO } from "@/lib/seo-config";
import { generateWebPageSchema } from "@/lib/json-ld";

function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between mb-5">
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
        {children}
      </span>
      {action}
    </div>
  );
}

export default function Home() {
  const { data: indicesData, isLoading: indicesLoading, error: indicesError } = useIndices({ limit: 6 });

  const stockTabs = [
    { id: "gainers", label: "Top Gainers", icon: <ArrowUpCircle className="h-4 w-4 text-positive" /> },
    { id: "losers", label: "Top Losers", icon: <ArrowDownCircle className="h-4 w-4 text-negative" /> },
    { id: "most-active", label: "Most Active", icon: <Activity className="h-4 w-4 text-primary" /> },
    { id: "52w-high", label: "52W High", icon: <TrendingUp className="h-4 w-4 text-positive" /> },
    { id: "52w-low", label: "52W Low", icon: <TrendingDown className="h-4 w-4 text-negative" /> },
  ];

  const indices = indicesData?.data || [];
  const hero = indices[0];
  const heroPositive = (hero?.changePercent ?? 0) >= 0;
  const { showSkeleton } = useSmartLoader(indicesLoading);

  return (
    <>
      <SEO
        title={PAGE_SEO.home.title}
        description={PAGE_SEO.home.description}
        canonical="/home"
        jsonLd={generateWebPageSchema("Market Dashboard", PAGE_SEO.home.description, "/home")}
      />

      <div className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-16 space-y-16 md:space-y-20">

          {/* HERO — Today */}
          <motion.section
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            transition={easeOut}
          >
            <div className="flex items-center gap-3 mb-4">
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground font-medium">Today</p>
              <MarketStatusBadge />
            </div>

            {hero ? (
              <div className="space-y-3">
                <h1 className="leading-none text-foreground">
                  <HeroNumber
                    value={hero.value}
                    decimals={2}
                    className="text-6xl md:text-8xl"
                  />
                </h1>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-base md:text-lg text-muted-foreground font-medium">
                    {hero.name}
                  </span>
                  <span className={cn(
                    "text-xl md:text-2xl font-medium tabular-nums",
                    heroPositive ? "text-positive" : "text-negative",
                  )}>
                    {heroPositive ? "+" : ""}{hero.change.toFixed(2)} ({heroPositive ? "+" : ""}{hero.changePercent.toFixed(2)}%)
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="h-20 md:h-32 w-2/3 bg-muted/50 animate-pulse rounded-md" />
                <div className="h-6 w-1/3 bg-muted/40 animate-pulse rounded-md" />
              </div>
            )}
          </motion.section>

          {/* INDICES — horizontal scroll on mobile, grid on desktop */}
          <section>
            <SectionLabel
              action={
                <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-primary gap-1">
                  <Link href="/indices" data-testid="link-see-all-markets">
                    All Indices <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              }
            >
              Indices
            </SectionLabel>
            {showSkeleton ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[1,2,3,4,5,6].map((i) => <IndexCardSkeleton key={i} />)}
              </div>
            ) : indicesError ? (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive/70">
                Failed to load market indices
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-3 -mx-4 px-4 lg:grid lg:grid-cols-6 lg:overflow-visible lg:mx-0 lg:px-0 lg:pb-0">
                {indices.map((index) => (
                  <div key={index.id} className="snap-start shrink-0 w-[200px] lg:w-auto">
                    <IndexCard {...index} />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* MOVERS */}
          <section>
            <SectionLabel>Stock Movers</SectionLabel>
            <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
              <div className="p-5 md:p-6">
                <TabsSection tabs={stockTabs}>
                  {(activeTab) => {
                    const categoryMap: Record<string, CategoryType> = {
                      gainers: "GAINER",
                      losers: "LOSER",
                      "most-active": "VOLUME_GAINER",
                      "52w-high": "NEAR_52W_HIGH",
                      "52w-low": "NEAR_52W_LOW",
                    };
                    return <MarketMoversSection category={categoryMap[activeTab]} />;
                  }}
                </TabsSection>
              </div>
            </div>
          </section>

          {/* QUICK SCREENS */}
          <section>
            <SectionLabel
              action={
                <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-primary gap-1">
                  <Link href="/screener">
                    Open Screener <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              }
            >
              Quick Screens
            </SectionLabel>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                {
                  id: "1",
                  name: "Momentum & Liquidity",
                  description: "Strong trend + large cash flow",
                  expression: "(close > ema_50) and (ema_50 > ema_150) and (liquidity > 1000000000)",
                },
                {
                  id: "2",
                  name: "RSI Pullback",
                  description: "Oversold dip in long-term uptrend",
                  expression: "(close > sma_200) and (rsi_14 >= 35 and rsi_14 <= 50)",
                },
                {
                  id: "3",
                  name: "52W Breakout Watch",
                  description: "Price reclaiming prior highs",
                  expression: "(close > 0.9 * high_52_W) and (ema_20 > ema_50)",
                },
              ].map((screen) => (
                <Link
                  key={screen.id}
                  href={`/screener?expr=${encodeURIComponent(screen.expression)}`}
                  className="group flex flex-col gap-1.5 rounded-xl border border-border/50 bg-card p-4 hover:border-primary/40 hover:bg-primary/5 transition-colors"
                  data-testid={`link-screen-${screen.id}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">{screen.name}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                  </div>
                  <span className="text-xs text-muted-foreground">{screen.description}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* NEWS */}
          <section>
            <SectionLabel>Market News</SectionLabel>
            <div className="rounded-2xl border border-border/50 bg-card p-5 md:p-6">
              <NewsSection limit={10} />
            </div>
          </section>

          {/* EXPLORE */}
          <section>
            <SectionLabel>Explore</SectionLabel>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {[
                { icon: LineChart, name: "Advanced Chart", desc: "TradingView-style OHLC charts", href: "/chart" },
                { icon: Layers, name: "Option Chain", desc: "Live NSE options with Greeks", href: "/options" },
                { icon: BarChart3, name: "Options Visualizer", desc: "GEX exposure & IV surface", href: "/options-visualizer" },
                { icon: Calculator, name: "Black-Scholes", desc: "Options pricing calculator", href: "/black-scholes" },
                { icon: PieChart, name: "Portfolio Optimizer", desc: "Black-Litterman optimization", href: "/portfolio-optimizer" },
                { icon: GitCompare, name: "Compare Stocks", desc: "Multi-security overlay charts", href: "/compare" },
                { icon: Brain, name: "Alpha Generation", desc: "AI strategy backtesting", href: "/alpha-generation" },
                { icon: Globe, name: "World Indices", desc: "Global market overview", href: "/world-indices" },
                { icon: Newspaper, name: "Market News", desc: "Live financial news feed", href: "/news" },
                { icon: BookOpen, name: "Research Reports", desc: "Sector analysis & outlook", href: "/research-reports" },
                { icon: Zap, name: "Expert Screener", desc: "Boolean stock screening", href: "/screener" },
                { icon: Activity, name: "Tip Tease AI", desc: "Conversational analysis", href: "/tip-tease" },
              ].map((feature) => (
                <Link
                  key={feature.href}
                  href={feature.href}
                  className="group flex flex-col gap-2 rounded-xl border border-border/50 bg-card p-4 hover:border-primary/40 hover:bg-primary/5 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <feature.icon className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground truncate">{feature.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground leading-snug">{feature.desc}</span>
                </Link>
              ))}
            </div>
          </section>

        </div>
      </div>
    </>
  );
}
