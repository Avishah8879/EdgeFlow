import {
  TrendingUp,
  TrendingDown,
  Activity,
  ArrowUpCircle,
  ArrowDownCircle,
  ListFilter,
  ChevronRight,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import IndexCard from "@/components/IndexCard";
import MarketMood from "@/components/MarketMood";
import TabsSection from "@/components/TabsSection";
import { Link } from "wouter";
import MarketMoversSection from "@/components/MarketMoversSection";
import NewsSection from "@/components/NewsSection";
import { FinancialCard } from "@/components/FinancialCard";
import type { CategoryType } from "@/lib/types";
import { useIndices } from "@/hooks/use-indices";
import { IndexCardSkeleton } from "@/components/LoadingSkeleton";
import { useSmartLoader } from "@/hooks/use-smart-loader";
import { AnimatePresence, motion } from "framer-motion";
import { SEO } from "@/components/SEO";
import { PAGE_SEO } from "@/lib/seo-config";
import { generateWebPageSchema } from "@/lib/json-ld";

function DashboardSection({ icon: Icon, title, action, children }: {
  icon: React.ElementType;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-7 h-7 rounded bg-primary/10 border border-primary/20">
            <Icon className="w-3.5 h-3.5 text-primary" />
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-foreground/80">{title}</h2>
          <div className="h-px w-8 bg-border/60" />
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function Home() {
  const { data: indicesData, isLoading: indicesLoading, error: indicesError } = useIndices({ limit: 6 });

  const stockTabs = [
    {
      id: "gainers",
      label: "Top Gainers",
      icon: <ArrowUpCircle className="h-4 w-4 text-positive" />,
    },
    {
      id: "losers",
      label: "Top Losers",
      icon: <ArrowDownCircle className="h-4 w-4 text-negative" />,
    },
    {
      id: "most-active",
      label: "Most Active",
      icon: <Activity className="h-4 w-4 text-primary" />,
    },
    {
      id: "52w-high",
      label: "52W High",
      icon: <TrendingUp className="h-4 w-4 text-positive" />,
    },
    {
      id: "52w-low",
      label: "52W Low",
      icon: <TrendingDown className="h-4 w-4 text-negative" />,
    },
  ];

  const indices = indicesData?.data || [];
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
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 space-y-8">

          {/* Market Indices */}
          <DashboardSection
            icon={Activity}
            title="Market Pulse"
            action={
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-primary gap-1">
                <Link href="/indices" data-testid="link-see-all-markets">
                  All Indices <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            }
          >
            <AnimatePresence mode="wait">
              {showSkeleton ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[1,2,3,4,5,6].map((i) => <IndexCardSkeleton key={i} />)}
                </div>
              ) : indicesError ? (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive/70">
                  Failed to load market indices
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
                >
                  {indices.map((index) => (
                    <IndexCard key={index.id} {...index} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </DashboardSection>

          {/* Market Intelligence Row */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Market Mood - wider */}
            <div className="lg:col-span-3">
              <DashboardSection icon={Activity} title="Market Sentiment">
                <MarketMood />
              </DashboardSection>
            </div>

            {/* Curated Screens - narrower */}
            <div className="lg:col-span-2">
              <DashboardSection icon={ListFilter} title="Quick Screens">
                <div className="space-y-2">
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
                      className="group flex items-center justify-between rounded-md border border-border/50 bg-card px-3 py-2.5 hover:border-primary/40 hover:bg-primary/5 transition-colors"
                      data-testid={`link-screen-${screen.id}`}
                    >
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-foreground block truncate">{screen.name}</span>
                        <span className="text-[11px] text-muted-foreground truncate">{screen.description}</span>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-primary shrink-0 ml-2 transition-colors" />
                    </Link>
                  ))}
                  <Link href="/screener">
                    <Button variant="outline" size="sm" className="w-full mt-1 h-8 text-xs border-dashed hover:border-primary/50 hover:text-primary">
                      <Zap className="h-3 w-3 mr-1.5" />
                      Open Expert Screener
                    </Button>
                  </Link>
                </div>
              </DashboardSection>
            </div>
          </div>

          {/* Stocks & News */}
          <DashboardSection icon={TrendingUp} title="Today's Market">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Movers - wider */}
              <div className="lg:col-span-3 rounded-lg border border-border/40 bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border/40 bg-card/80">
                  <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Stock Movers</span>
                </div>
                <div className="p-4">
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

              {/* News - narrower */}
              <div className="lg:col-span-2 rounded-lg border border-border/40 bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border/40 bg-card/80">
                  <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Market News</span>
                </div>
                <div className="p-4">
                  <NewsSection limit={10} />
                </div>
              </div>
            </div>
          </DashboardSection>

        </div>
      </div>
    </>
  );
}
