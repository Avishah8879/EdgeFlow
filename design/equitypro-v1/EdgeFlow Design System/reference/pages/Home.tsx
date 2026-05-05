import {
  TrendingUp,
  TrendingDown,
  Activity,
  ArrowUpCircle,
  ArrowDownCircle,
  ListFilter,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import IndexCard from "@/components/IndexCard";
import MarketMood from "@/components/MarketMood";
import TabsSection from "@/components/TabsSection";
import { Link } from "wouter";
import MarketMoversSection from "@/components/MarketMoversSection";
import NewsSection from "@/components/NewsSection";
import { SectionHeader } from "@/components/SectionHeader";
import { FinancialCard } from "@/components/FinancialCard";
import type { CategoryType } from "@/lib/types";
import { useIndices } from "@/hooks/use-indices";
import { IndexCardSkeleton } from "@/components/LoadingSkeleton";
import { useSmartLoader } from "@/hooks/use-smart-loader";
import { AnimatePresence, motion } from "framer-motion";
import { SEO } from "@/components/SEO";
import { PAGE_SEO } from "@/lib/seo-config";
import { generateWebPageSchema } from "@/lib/json-ld";

export default function Home() {
  // Fetch top 6 indices for home page display
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

  // Split top 6 indices into two rows for display (3 per row)
  const indices = indicesData?.data || [];
  const firstRow = indices.slice(0, 3);
  const secondRow = indices.slice(3, 6);

  // Smart loader: show skeleton only if loading takes > 300ms
  const { showSkeleton } = useSmartLoader(indicesLoading);

  return (
    <>
      {/* SEO Meta Tags */}
      <SEO
        title={PAGE_SEO.home.title}
        description={PAGE_SEO.home.description}
        canonical="/home"
        jsonLd={generateWebPageSchema(
          'Market Dashboard',
          PAGE_SEO.home.description,
          '/home'
        )}
      />

      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 space-y-8">

          <section>
            <SectionHeader
              title="Market Overview"
              size="lg"
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/indices" data-testid="link-see-all-markets">
                    See All <ChevronRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
            }
            className="mb-6"
          />

          <AnimatePresence mode="wait">
            {showSkeleton ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  {[1, 2, 3].map((i) => (
                    <IndexCardSkeleton key={i} />
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[4, 5, 6].map((i) => (
                    <IndexCardSkeleton key={i} />
                  ))}
                </div>
              </>
            ) : indicesError ? (
              <div className="text-center py-8 text-destructive">
                Failed to load indices. Please try again later.
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  {firstRow.map((index) => (
                    <IndexCard key={index.id} {...index} />
                  ))}
                </div>
                {secondRow.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {secondRow.map((index) => (
                      <IndexCard key={index.id} {...index} />
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <MarketMood />
          </div>
          <FinancialCard
            variant="elevated"
            title="Curated Screens"
            description="Pre-built technical strategies for quick screening"
            headerAction={<ListFilter className="h-5 w-5 text-primary" />}
          >
            <div className="hover-blur-group">
              {(() => {
                // Define curated screens matching Sample Templates from Screener
                const curatedScreens = [
                  {
                    id: "1",
                    name: "Momentum & Liquidity",
                    description: "Strong trend with large cash participation",
                    expression: "(close > ema_50) and (ema_50 > ema_150) and (liquidity > 1000000000)",
                  },
                  {
                    id: "2",
                    name: "RSI Pullback",
                    description: "Oversold dip within a long-term uptrend",
                    expression: "(close > sma_200) and (rsi_14 >= 35 and rsi_14 <= 50)",
                  },
                  {
                    id: "3",
                    name: "52W Breakout Watch",
                    description: "Price reclaiming prior highs on rising RSI",
                    expression: "(close > 0.9 * high_52_W) and (ema_20 > ema_50)",
                  },
                ];

                return curatedScreens.map((screen) => {
                  const href = `/screener?expr=${encodeURIComponent(screen.expression)}`;
                  return (
                    <Link
                      key={screen.id}
                      href={href}
                      className="hover-blur-item flex items-center justify-between p-3 rounded-lg border bg-card"
                      data-testid={`link-screen-${screen.id}`}
                    >
                      <div>
                        <span className="text-sm font-medium block">{screen.name}</span>
                        <span className="text-xs text-muted-foreground">{screen.description}</span>
                      </div>
                      <ChevronRight className="hover-arrow-icon h-4 w-4 text-muted-foreground" />
                    </Link>
                  );
                });
              })()}
            </div>
          </FinancialCard>
        </section>

        <section>
          <SectionHeader
            title="Today's Stocks & News"
            size="lg"
            className="mb-6"
          />
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left: Stocks with tabs - defines container height */}
            <div className="lg:w-[55%]">
              <div className="neumorphic-card p-4 overflow-visible">
                <TabsSection tabs={stockTabs}>
                  {(activeTab) => {
                    // Map tab IDs to category
                    const categoryMap: Record<string, CategoryType> = {
                      gainers: "GAINER",
                      losers: "LOSER",
                      "most-active": "VOLUME_GAINER",
                      "52w-high": "NEAR_52W_HIGH",
                      "52w-low": "NEAR_52W_LOW",
                    };

                    return (
                      <MarketMoversSection category={categoryMap[activeTab]} />
                    );
                  }}
                </TabsSection>
              </div>
            </div>

            {/* Right: Market News - absolute positioning to match movers height */}
            <div className="lg:w-[45%] relative">
              <div className="neumorphic-card p-4 lg:absolute lg:inset-0">
                <NewsSection limit={10} />
              </div>
            </div>
          </div>
        </section>
        </div>
      </div>
    </>
  );
}
