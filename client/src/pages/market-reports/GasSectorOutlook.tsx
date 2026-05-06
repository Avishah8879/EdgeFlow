import { useState } from "react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Eyebrow } from "@/components/ui/eyebrow";
import {
  ChevronRight,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Calendar,
  Activity,
  Target,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Fuel,
  LineChart,
} from "lucide-react";

export default function GasSectorOutlook() {
  const [imageOpen, setImageOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [activeImageSrc, setActiveImageSrc] = useState<string | null>(null);
  const [activeImageAlt, setActiveImageAlt] = useState("");

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.5, 4));
  const handleZoomOut = () => {
    setZoom((z) => {
      const newZoom = Math.max(z - 0.5, 1);
      if (newZoom === 1) setPosition({ x: 0, y: 0 });
      return newZoom;
    });
  };
  const handleReset = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoom((z) => Math.min(z + 0.25, 4));
    } else {
      setZoom((z) => {
        const newZoom = Math.max(z - 0.25, 1);
        if (newZoom === 1) setPosition({ x: 0, y: 0 });
        return newZoom;
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const openImage = (src: string, alt: string) => {
    setActiveImageSrc(src);
    setActiveImageAlt(alt);
    setImageOpen(true);
  };

  const handleDialogChange = (open: boolean) => {
    setImageOpen(open);
    if (!open) {
      setZoom(1);
      setPosition({ x: 0, y: 0 });
      setActiveImageSrc(null);
      setActiveImageAlt("");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link
            href="/market-reports"
            className="hover:text-foreground transition-colors"
          >
            Market Reports
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground">Gas Sector Outlook</span>
        </nav>

        {/* Header */}
        <header className="mb-8 space-y-3">
          <Eyebrow tone="gold" rule>
            Sector outlook · Gas
          </Eyebrow>
          <h1 className="font-display text-3xl md:text-5xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
            Market outlook: Gas sector
          </h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>February 6, 2026</span>
          </div>

          {/* Report Metadata */}
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Benchmark:</span>
              <span className="font-medium">Nifty 50</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Time Horizon:</span>
              <span className="font-medium">Medium-term (1-2 months)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Market Regime:</span>
              <span className="font-medium">
                Late-cycle rotation within cyclicals
              </span>
            </div>
          </div>
        </header>

        {/* Summary Card */}
        <Card className="p-6 mb-8 bg-primary/5 border-primary/20">
          <h2 className="text-lg font-semibold mb-3">Summary</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            We analyze the relative rotation curves for key stocks in the gas
            sector, which indicate a sector-level transition from relative
            underperformance to early signs of outperformance versus the Nifty
            50. In the previous few months, the gas sector was underperforming,
            however, over the last week there is an improving trend in the
            sector. We observe that this is also characterized by rising
            relative momentum with respect to the relative rotation curves for
            the stocks.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            This behavior suggests renewed capital inflows into the gas sector,
            likely driven by clean infrastructural growth, streamlined unified
            tariff zones, access to 100% FDI in upstream & private sector
            refining projects, robust results, and prolonged stock
            underperformance. While the overall sector has not yet entered the{" "}
            <em>Leading</em> quadrant, the current trajectory supports a
            constructive medium-term outlook with scope for sustained
            outperformance if momentum follow-through persists.
          </p>
        </Card>

        {/* Content */}
        <article className="prose prose-neutral dark:prose-invert max-w-none">
          {/* Section 1: Sector Rotation Overview */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              1. Sector Rotation Overview
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Relative Rotation Graphs map securities across four regimes—
              <strong>Leading</strong>, <strong>Weakening</strong>,{" "}
              <strong>Lagging</strong>, and <strong>Improving</strong>—based on
              their relative strength ratio and relative momentum versus a
              benchmark index.
            </p>

            {/* RRG Chart */}
            <div className="my-6 rounded-lg overflow-hidden border">
              <button
                onClick={() =>
                  openImage(
                    "/images/market-reports/gas-sector-rrg.png",
                    "Relative Rotation Graph showing gas sector stocks transitioning from Lagging to Improving quadrant"
                  )
                }
                className="block w-full cursor-zoom-in relative group"
              >
                <img
                  src="/images/market-reports/gas-sector-rrg.png"
                  alt="Relative Rotation Graph showing gas sector stocks transitioning from Lagging to Improving quadrant"
                  className="w-full group-hover:opacity-90 transition-opacity"
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                  <ZoomIn className="h-10 w-10 text-white drop-shadow-lg" />
                </div>
              </button>
              <p className="text-xs text-muted-foreground p-2 bg-muted/50">
                Data source:{" "}
                <a
                  href="https://finterminal.ai/terminal"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  finterminal.ai/terminal
                </a>
              </p>
            </div>

            <Card className="p-4 my-6">
              <h3 className="font-semibold mb-3">
                Current Gas Sector Positioning
              </h3>
              <ul className="text-muted-foreground space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-primary shrink-0">•</span>
                  <span>
                    Gas stocks are moderately clustered, indicating meaningful
                    intra-sector correlation with emerging stock specific
                    dispersion.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary shrink-0">•</span>
                  <div>
                    <span>
                      The cluster has moved upward from the{" "}
                      <strong>Lagging</strong> quadrant into{" "}
                      <strong>Improving</strong>, signaling:
                    </span>
                    <ul className="mt-2 space-y-1.5">
                      <li className="flex items-start gap-2">
                        <span className="text-muted-foreground shrink-0">
                          ○
                        </span>
                        <span>Waning relative selling pressure</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-muted-foreground shrink-0">
                          ○
                        </span>
                        <span>Early-stage accumulation</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-muted-foreground shrink-0">
                          ○
                        </span>
                        <span>Positive inflection in relative momentum</span>
                      </li>
                    </ul>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary shrink-0">•</span>
                  <span>
                    Leadership dispersion is increasing, with{" "}
                    <Link
                      href="/stocks/GUJGASLTD"
                      className="text-primary hover:underline font-medium"
                    >
                      Gujarat Gas
                    </Link>{" "}
                    leading the sector's momentum while others trail behind in
                    the improving stage.
                  </span>
                </li>
              </ul>
            </Card>

            <p className="text-muted-foreground leading-relaxed">
              This configuration aligns with early-cycle sector rotation, where
              capital begins reallocating toward previously underperforming
              cyclicals.
            </p>
          </section>

          {/* Section 2: Capital Flow */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              2. Capital Flow and Market Structure Implications
            </h2>
            <ul className="text-muted-foreground space-y-2 mb-6">
              <li className="flex items-start gap-2">
                <span className="text-primary shrink-0">•</span>
                <span>
                  Capital appears to be increasingly rotating out of overvalued
                  sectors like IT/Financials and into cyclical/defensive
                  segments boosted by improved rupee rate.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary shrink-0">•</span>
                <span>
                  Gas, having underperformed for an extended period, is a
                  natural recipient of rotational inflows as investors rebalance
                  risk amid increased energy demand.
                </span>
              </li>
            </ul>

            <Card className="p-4 border-l-4 border-l-primary">
              <h3 className="font-semibold mb-2">Positioning Signal</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Improving quadrant positioning typically precedes:
              </p>
              <ul className="text-sm text-muted-foreground space-y-1.5 ml-4">
                <li className="flex items-start gap-2">
                  <span className="shrink-0">○</span>
                  <span>Sector-level re-rating</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="shrink-0">○</span>
                  <span>Earnings revision cycles</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="shrink-0">○</span>
                  <span>
                    Increased participation from systematic and factor-based
                    strategies
                  </span>
                </li>
              </ul>
              <p className="text-sm text-muted-foreground mt-3">
                This positioning suggests{" "}
                <strong>incremental buying pressure</strong>, rather than
                speculative spikes.
              </p>
            </Card>
          </section>

          {/* Section 3: Relative Strength */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <Target className="h-6 w-6 text-primary" />
              3. Relative Strength vs. Absolute Price Action
            </h2>
            <Card className="p-4 bg-amber-500/10 border-l-4 border-l-amber-500 mb-4">
              <p className="text-sm text-muted-foreground">
                <strong>Important:</strong> RRG signals are relative, not
                absolute.
              </p>
            </Card>
            <ul className="text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-primary shrink-0">•</span>
                <span>
                  Gas stocks while gaining relative strength, have been
                  underperforming in absolute return terms.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary shrink-0">•</span>
                <span>
                  The current signal implies that they are now beginning to{" "}
                  <strong>outperform the broader market</strong>, not merely
                  bounce.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary shrink-0">•</span>
                <span>
                  This distinction is important: sustained alpha generation
                  comes from relative strength expansion, not just price
                  recovery.
                </span>
              </li>
            </ul>
          </section>

          {/* Section 4: Risk Assessment */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-primary" />
              4. Risk Assessment
            </h2>
            <p className="text-muted-foreground mb-4">
              While the setup is constructive, risks remain:
            </p>

            <Card className="p-4 border-l-4 border-l-negative mb-4">
              <h3 className="font-semibold text-negative mb-2">Key Risks</h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-negative shrink-0">•</span>
                  <div>
                    <strong>Failed rotation:</strong> If RS-Momentum rolls over
                    before RS-Ratio crosses into positive territory, the sector
                    could remain range-bound.
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-negative shrink-0">•</span>
                  <div>
                    <strong>Macro sensitivity:</strong> Gas remains highly
                    exposed to:
                    <ul className="ml-4 mt-1.5 space-y-1">
                      <li className="flex items-start gap-2">
                        <span className="text-muted-foreground shrink-0">
                          ○
                        </span>
                        <span>Global LNG prices</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-muted-foreground shrink-0">
                          ○
                        </span>
                        <span>USD-INR exchange rate</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-muted-foreground shrink-0">
                          ○
                        </span>
                        <span>GDP growth and industrial activity</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-muted-foreground shrink-0">
                          ○
                        </span>
                        <span>
                          Geopolitical effects like trade tariffs and supply
                          chain bottlenecks
                        </span>
                      </li>
                    </ul>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-negative shrink-0">•</span>
                  <div>
                    <strong>Crowding risk:</strong> Rapid inflows could lead to
                    short-term overheating before leadership is firmly
                    established.
                  </div>
                </li>
              </ul>
            </Card>

            <Card className="p-4 bg-muted/50 mb-6">
              <h3 className="font-semibold mb-2">Invalidation Signals</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-start gap-2">
                  <span className="text-muted-foreground shrink-0">•</span>
                  <span>
                    Gas stocks slipping back into the Lagging quadrant
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted-foreground shrink-0">•</span>
                  <span>
                    Deterioration in relative momentum while still left of the
                    RS-Ratio axis
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted-foreground shrink-0">•</span>
                  <span>Breakdown of cluster cohesion (divergent trails)</span>
                </li>
              </ul>
            </Card>

            {/* Commodity Correlation */}
            <Card className="p-4 border-l-4 border-l-amber-500 mb-4">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Fuel className="h-4 w-4" />
                Commodity Correlation
              </h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="shrink-0">•</span>
                  <span>
                    We find a relatively strong{" "}
                    <strong>anti-correlation</strong> between the gas stocks and
                    natural gas futures.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="shrink-0">•</span>
                  <span>
                    India, with a strong demand and need for gas and limited
                    domestic supply, must rely on a large share of LNG imports
                    which are linked to global prices.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="shrink-0">•</span>
                  <span>
                    Higher gas prices increase input cost which subsequently
                    lowers margin and profitability, effectively driving the gas
                    stock prices down.
                  </span>
                </li>
              </ul>
            </Card>

            {/* Commodity Seasonality */}
            <Card className="p-4 border-l-4 border-l-blue-500 mb-6">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Commodity Seasonality
              </h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="shrink-0">•</span>
                  <span>
                    Based on the global supply-demand characteristics, natural
                    gas tends to be{" "}
                    <span className="text-negative font-medium">
                      seasonally bearish
                    </span>{" "}
                    in early year (Jan-Mar),{" "}
                    <span className="text-positive font-medium">bullish</span>{" "}
                    in late spring and late summer (Apr-May, Aug-Sep), and{" "}
                    <span className="text-negative font-medium">bearish</span>{" "}
                    again toward year-end (Dec).
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="shrink-0">•</span>
                  <span>
                    To hedge the anti-correlation, take long positions during
                    late summer (Apr-May, Aug-Sep), and short positions in early
                    year and end of the year.
                  </span>
                </li>
              </ul>
            </Card>

            {/* Commodity Comparison Chart */}
            <div className="my-6 rounded-lg overflow-hidden border">
              <button
                onClick={() =>
                  openImage(
                    "/images/market-reports/gas-commodity-comparison.png",
                    "Natural Gas Futures vs Gas Stocks Performance Comparison"
                  )
                }
                className="block w-full cursor-zoom-in relative group"
              >
                <img
                  src="/images/market-reports/gas-commodity-comparison.png"
                  alt="Natural Gas Futures vs Gas Stocks Performance Comparison"
                  className="w-full group-hover:opacity-90 transition-opacity"
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                  <ZoomIn className="h-10 w-10 text-white drop-shadow-lg" />
                </div>
              </button>
              <p className="text-xs text-muted-foreground p-2 bg-muted/50">
                Natural Gas Futures (MCX) vs Gas Sector Stocks - showing
                anti-correlation pattern
              </p>
            </div>
          </section>

          {/* Section 5: Outlook and Strategy */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-primary" />
              5. Outlook and Strategy
            </h2>

            <div className="grid gap-4">
              {/* Base Case */}
              <Card className="p-4 border-l-4 border-l-primary">
                <div className="flex items-center gap-2 mb-2 not-prose">
                  <Minus className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold m-0">Base Case (Most Likely)</h3>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1.5">
                  <li className="flex items-start gap-2">
                    <span className="shrink-0">•</span>
                    <span>
                      Gas continues its clockwise rotation into the Leading
                      quadrant.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0">•</span>
                    <span>
                      Relative outperformance vs Nifty emerges over the next 1-2
                      quarters.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0">•</span>
                    <span>
                      Sector becomes a preferred overweight within cyclicals.
                    </span>
                  </li>
                </ul>
              </Card>

              {/* Bull Case */}
              <Card className="p-4 border-l-4 border-l-positive">
                <div className="flex items-center gap-2 mb-2 not-prose">
                  <ArrowUpRight className="h-4 w-4 text-positive" />
                  <h3 className="font-semibold text-positive m-0">Bull Case</h3>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1.5">
                  <li className="flex items-start gap-2">
                    <span className="shrink-0">•</span>
                    <span>
                      Strong macro tailwinds push Gas into sustained leadership.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0">•</span>
                    <span>
                      Momentum remains elevated, attracting trend-following
                      capital.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0">•</span>
                    <span>
                      Outperformance extends across both absolute and relative
                      dimensions.
                    </span>
                  </li>
                </ul>
              </Card>

              {/* Bear Case */}
              <Card className="p-4 border-l-4 border-l-negative">
                <div className="flex items-center gap-2 mb-2 not-prose">
                  <ArrowDownRight className="h-4 w-4 text-negative" />
                  <h3 className="font-semibold text-negative m-0">Bear Case</h3>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1.5">
                  <li className="flex items-start gap-2">
                    <span className="shrink-0">•</span>
                    <span>Rotation stalls in Improving.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0">•</span>
                    <span>
                      Sector reverts to being a trading range with limited
                      alpha.
                    </span>
                  </li>
                </ul>
              </Card>
            </div>
          </section>

          {/* Section 6: Pairs Trading */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <LineChart className="h-6 w-6 text-primary" />
              6. Pairs Trading Strategy
            </h2>

            <Card className="p-4 border-l-4 border-l-primary mb-6">
              <h3 className="font-semibold mb-3">GUJGASLTD vs GAIL Analysis</h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-primary shrink-0">•</span>
                  <span>
                    Given that{" "}
                    <Link
                      href="/stocks/GUJGASLTD"
                      className="text-primary hover:underline font-medium"
                    >
                      GUJGASLTD
                    </Link>{" "}
                    is in the leading quadrant, we expect it to be leading in
                    this phase of fund flow into the gas sector.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary shrink-0">•</span>
                  <span>
                    Using the historical comparison function on finterminal, we
                    look at gas stocks with the highest correlation to GUJGASLTD
                    to employ a pairs trading strategy in the near term.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary shrink-0">•</span>
                  <span>
                    We find that{" "}
                    <Link
                      href="/stocks/GAIL"
                      className="text-primary hover:underline font-medium"
                    >
                      GAIL
                    </Link>{" "}
                    has a correlation of <strong>0.76</strong> to GUJGASLTD when
                    their time series data is regressed.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary shrink-0">•</span>
                  <span>
                    Looking at the residuals data, we see the spread between the
                    two stocks have an average value of <strong>5%</strong> with
                    the range of +5% and -5%.
                  </span>
                </li>
              </ul>
            </Card>

            <Card className="p-4 bg-positive/5 border-positive/20 mb-6">
              <h3 className="font-semibold mb-2 text-positive">
                Trade Expression
              </h3>
              <p className="text-sm text-muted-foreground">
                We can express our bullish view on the gas sector as a{" "}
                <strong>pairs trade (L/S)</strong> between{" "}
                <Link
                  href="/stocks/GAIL"
                  className="text-primary hover:underline font-medium"
                >
                  GAIL
                </Link>{" "}
                and{" "}
                <Link
                  href="/stocks/GUJGASLTD"
                  className="text-primary hover:underline font-medium"
                >
                  GUJGASLTD
                </Link>
                . Considering the correlated nature of the stocks, we can expect
                the pair to <strong>mean revert</strong>, which can be taken as
                an exit point.
              </p>
            </Card>

            {/* Pairs Trading Chart */}
            <div className="my-6 rounded-lg overflow-hidden border">
              <button
                onClick={() =>
                  openImage(
                    "/images/market-reports/gas-pairs-trading.png",
                    "Pairs Trading Analysis - Performance Comparison and Regression Analysis"
                  )
                }
                className="block w-full cursor-zoom-in relative group"
              >
                <img
                  src="/images/market-reports/gas-pairs-trading.png"
                  alt="Pairs Trading Analysis - Performance Comparison and Regression Analysis"
                  className="w-full group-hover:opacity-90 transition-opacity"
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                  <ZoomIn className="h-10 w-10 text-white drop-shadow-lg" />
                </div>
              </button>
              <p className="text-xs text-muted-foreground p-2 bg-muted/50">
                Performance Comparison and Pair Regression Analysis. Data
                source:{" "}
                <a
                  href="https://finterminal.ai/terminal"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  finterminal.ai/terminal
                </a>
              </p>
            </div>

            {/* Key Gas Stocks */}
            <Card className="p-4 bg-muted/50">
              <h3 className="font-semibold mb-3">Key Gas Sector Stocks</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Link
                  href="/stocks/GAIL"
                  className="p-2 rounded-lg border bg-background hover:bg-accent transition-colors text-center"
                >
                  <span className="font-medium text-sm text-primary">GAIL</span>
                </Link>
                <Link
                  href="/stocks/MGL"
                  className="p-2 rounded-lg border bg-background hover:bg-accent transition-colors text-center"
                >
                  <span className="font-medium text-sm text-primary">MGL</span>
                </Link>
                <Link
                  href="/stocks/GUJGASLTD"
                  className="p-2 rounded-lg border bg-background hover:bg-accent transition-colors text-center"
                >
                  <span className="font-medium text-sm text-primary">
                    GUJGASLTD
                  </span>
                </Link>
                <Link
                  href="/stocks/IGL"
                  className="p-2 rounded-lg border bg-background hover:bg-accent transition-colors text-center"
                >
                  <span className="font-medium text-sm text-primary">IGL</span>
                </Link>
                <Link
                  href="/stocks/ATGL"
                  className="p-2 rounded-lg border bg-background hover:bg-accent transition-colors text-center"
                >
                  <span className="font-medium text-sm text-primary">ATGL</span>
                </Link>
              </div>
            </Card>
          </section>

          {/* Conclusion */}
          <section className="mb-8">
            <Card className="p-6 bg-muted/50">
              <p className="text-muted-foreground leading-relaxed mb-4">
                While confirmation via a transition into the Leading quadrant is
                still pending, the current configuration of the relative
                rotation curves justifies increased attention and selective
                positioning in gas as part of a broader rotation away from
                crowded leadership sectors.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                <strong>Looking ahead:</strong> Given this analysis, the next
                question becomes: what are the related sectors where we can
                expect this to have an impact on? An obvious answer is the{" "}
                <strong>chemical and fertilizer sector</strong>, since gas is
                the material primarily needed for fertilizers and chemical
                making.
              </p>
            </Card>
          </section>

          {/* Image Lightbox */}
          <Dialog open={imageOpen} onOpenChange={handleDialogChange}>
            <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 border-0 bg-transparent overflow-hidden">
              {/* Controls */}
              <div className="absolute top-2 right-2 z-50 flex items-center gap-2">
                <div className="flex items-center gap-1 bg-black/50 rounded-full p-1">
                  <button
                    onClick={handleZoomOut}
                    disabled={zoom <= 1}
                    className="p-2 rounded-full hover:bg-white/20 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Zoom out"
                  >
                    <ZoomOut className="h-5 w-5" />
                  </button>
                  <span className="text-white text-sm px-2 min-w-[3rem] text-center">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    onClick={handleZoomIn}
                    disabled={zoom >= 4}
                    className="p-2 rounded-full hover:bg-white/20 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Zoom in"
                  >
                    <ZoomIn className="h-5 w-5" />
                  </button>
                  <button
                    onClick={handleReset}
                    disabled={zoom === 1}
                    className="p-2 rounded-full hover:bg-white/20 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Reset zoom"
                  >
                    <RotateCcw className="h-5 w-5" />
                  </button>
                </div>
                <button
                  onClick={() => handleDialogChange(false)}
                  className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
                  title="Close"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Zoomable Image */}
              <div
                className={`w-full h-full flex items-center justify-center overflow-hidden ${zoom > 1 ? "cursor-grab" : "cursor-default"} ${isDragging ? "cursor-grabbing" : ""}`}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                {activeImageSrc && (
                  <img
                    src={activeImageSrc}
                    alt={activeImageAlt}
                    className="max-h-[90vh] object-contain rounded-lg select-none"
                    style={{
                      transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
                      transition: isDragging
                        ? "none"
                        : "transform 0.2s ease-out",
                    }}
                    draggable={false}
                  />
                )}
              </div>

              {/* Hint */}
              {zoom === 1 && (
                <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-xs bg-black/40 px-3 py-1 rounded-full">
                  Scroll or use buttons to zoom
                </p>
              )}
            </DialogContent>
          </Dialog>
        </article>

        {/* Disclaimer */}
        <Card className="p-3 bg-amber-500/10 border-l-4 border-l-amber-500 mt-8">
          <p className="text-xs text-muted-foreground italic">
            This report is for informational and educational purposes only and
            should not be construed as investment advice. Past performance is
            not indicative of future results. Users must conduct independent
            analysis and consult qualified professionals before any trading
            decisions.
          </p>
        </Card>

        {/* Back link */}
        <div className="mt-8">
          <Link
            href="/market-reports"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            ← Back to Market Reports
          </Link>
        </div>
      </div>
    </div>
  );
}
