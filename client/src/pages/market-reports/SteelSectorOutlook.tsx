import { useState } from "react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
} from "lucide-react";

export default function SteelSectorOutlook() {
  const [imageOpen, setImageOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [updateImageSrc, setUpdateImageSrc] = useState<string | null>(null);
  const [updateImageAlt, setUpdateImageAlt] = useState("");

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

  const handleDialogChange = (open: boolean) => {
    setImageOpen(open);
    if (!open) {
      setZoom(1);
      setPosition({ x: 0, y: 0 });
    }
  };

  const openUpdateImage = (src: string, alt: string) => {
    setUpdateImageSrc(src);
    setUpdateImageAlt(alt);
  };

  const handleUpdateDialogChange = (open: boolean) => {
    if (!open) {
      setUpdateImageSrc(null);
      setUpdateImageAlt("");
      setZoom(1);
      setPosition({ x: 0, y: 0 });
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
          <span className="text-foreground">Steel Sector Outlook</span>
        </nav>

        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <Calendar className="h-4 w-4" />
            <span>January 12, 2026</span>
          </div>
          <h1 className="text-3xl font-bold mb-4">
            Market Outlook: Steel Sector
          </h1>

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
            We analyze the relative rotation curves for key stocks in the steel
            sector, which indicate a sector-level transition from relative
            underperformance to early signs of outperformance versus the Nifty
            50. In the previous few months, the entire steel sector was
            underperforming, however, over the last week there is an improving
            trend in the sector.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            This behavior suggests renewed capital inflows into the steel
            sector, likely driven by improving macro visibility, cyclical
            bottoming dynamics, and relative valuation appeal compared to
            crowded leadership sectors. While the sector has not yet fully
            entered the <em>Leading</em> quadrant, the current trajectory
            supports a constructive medium-term outlook with scope for sustained
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
                onClick={() => setImageOpen(true)}
                className="block w-full cursor-zoom-in relative group"
              >
                <img
                  src="/images/market-reports/steel-sector-rrg.jpeg"
                  alt="Relative Rotation Graph showing steel sector stocks transitioning from Lagging to Improving quadrant"
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
                  <img
                    src="/images/market-reports/steel-sector-rrg.jpeg"
                    alt="Relative Rotation Graph showing steel sector stocks transitioning from Lagging to Improving quadrant"
                    className="max-h-[90vh] object-contain rounded-lg select-none"
                    style={{
                      transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
                      transition: isDragging
                        ? "none"
                        : "transform 0.2s ease-out",
                    }}
                    draggable={false}
                  />
                </div>

                {/* Hint */}
                {zoom === 1 && (
                  <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-xs bg-black/40 px-3 py-1 rounded-full">
                    Scroll or use buttons to zoom
                  </p>
                )}
              </DialogContent>
            </Dialog>

            <Card className="p-4 my-6">
              <h3 className="font-semibold mb-3">
                Current Steel Sector Positioning
              </h3>
              <ul className="text-muted-foreground space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-primary shrink-0">•</span>
                  <span>
                    Steel stocks form a tight cluster, indicating strong
                    intra-sector correlation and dominant sector-factor
                    influence.
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
              </ul>
            </Card>

            <p className="text-muted-foreground leading-relaxed">
              This configuration is historically consistent with early-cycle
              sector rotation, where capital shifts toward previously neglected
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
                  Capital appears to be rotating out of mature leadership
                  sectors and into deep cyclical/value segments.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary shrink-0">•</span>
                <span>
                  Steel, having underperformed for an extended period, is a
                  natural recipient of rotational inflows as investors rebalance
                  risk.
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
                  Steel stocks may already be rising in absolute terms.
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
                    <strong>Macro sensitivity:</strong> Steel remains highly
                    exposed to:
                    <ul className="ml-4 mt-1.5 space-y-1">
                      <li className="flex items-start gap-2">
                        <span className="text-muted-foreground shrink-0">
                          ○
                        </span>
                        <span>Global growth expectations</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-muted-foreground shrink-0">
                          ○
                        </span>
                        <span>China demand signals</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-muted-foreground shrink-0">
                          ○
                        </span>
                        <span>Commodity price volatility</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-muted-foreground shrink-0">
                          ○
                        </span>
                        <span>
                          Geopolitical effects (trade tariffs, supply chain
                          bottlenecks)
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

            <Card className="p-4 bg-muted/50">
              <h3 className="font-semibold mb-2">Invalidation Signals</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-start gap-2">
                  <span className="text-muted-foreground shrink-0">•</span>
                  <span>
                    Steel stocks slipping back into the Lagging quadrant
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
                      Steel continues its clockwise rotation into the Leading
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
                      Strong macro tailwinds push steel into sustained
                      leadership.
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

          {/* Conclusion */}
          <section className="mb-8">
            <Card className="p-6 bg-muted/50">
              <p className="text-muted-foreground leading-relaxed mb-4">
                While confirmation via a transition into the Leading quadrant is
                still pending, the current configuration of the relative
                rotation curves justifies increased attention and selective
                positioning in steel as part of a broader rotation away from
                crowded leadership sectors.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                <strong>Looking ahead:</strong> Given this analysis, the next
                question becomes: what are the related sectors where we can
                expect this to have an impact on? An obvious answer is the real
                estate and infrastructure sector, since steel is the material
                primarily used in construction.
                <sup className="text-primary ml-0.5">[1]</sup> Stay tuned for
                our follow-up analysis.
              </p>
            </Card>
          </section>

          {/* Update: 29 January 2026 */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-3 py-1 rounded-full">
                Update
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-positive" />
              Update: 29 January 2026
            </h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
              <Calendar className="h-4 w-4" />
              <span>17 days after initial report</span>
            </div>

            {/* Update Commentary */}
            <Card className="p-6 bg-positive/5 border-positive/20 mb-8">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <ArrowUpRight className="h-5 w-5 text-positive" />
                Thesis Validated
              </h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                As we noted in our earlier analysis, the steel sector had formed
                a cluster on the relative rotation plot, indicating strong
                intra-sector correlation and dominant sector-factor influence.
                The entire cluster had moved upward from the{" "}
                <strong>Lagging</strong> quadrant into{" "}
                <strong>Improving</strong>, indicating a positive sector-level
                outlook.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Consequently, we can see that the sector stocks did perform well
                in the subsequent days —{" "}
                <strong>
                  breaking out of important resistance levels and showing strong
                  momentum
                </strong>
                , also being reflected in the current state of the rotation
                plot.
              </p>
            </Card>

            {/* Updated RRG Chart */}
            <h3 className="font-semibold mb-3">
              Updated Relative Rotation Graph
            </h3>
            <div className="my-4 rounded-lg overflow-hidden border">
              <button
                onClick={() =>
                  openUpdateImage(
                    "/images/market-reports/steel-sector-rrg-update.png",
                    "Updated Relative Rotation Graph showing steel sector stocks moved into Leading quadrant",
                  )
                }
                className="block w-full cursor-zoom-in relative group"
              >
                <img
                  src="/images/market-reports/steel-sector-rrg-update.png"
                  alt="Updated Relative Rotation Graph showing steel sector stocks moved into Leading quadrant"
                  className="w-full group-hover:opacity-90 transition-opacity"
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                  <ZoomIn className="h-10 w-10 text-white drop-shadow-lg" />
                </div>
              </button>
              <p className="text-xs text-muted-foreground p-2 bg-muted/50">
                Updated RRG as of 29 January 2026. Steel stocks have
                transitioned into the <strong>Leading</strong> quadrant. Data
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

            <Card className="p-4 my-6">
              <h3 className="font-semibold mb-3">Key Observations</h3>
              <ul className="text-muted-foreground space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-positive shrink-0">•</span>
                  <span>
                    The steel cluster has completed its clockwise rotation from{" "}
                    <strong>Improving</strong> into the <strong>Leading</strong>{" "}
                    quadrant, confirming sector-level outperformance versus the
                    Nifty 50.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-positive shrink-0">•</span>
                  <span>
                    All four tracked stocks (SAIL, JSWSTEEL, JINDALSTEL,
                    TATASTEEL) show strong upward trajectories with breakouts
                    above key moving average levels.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-positive shrink-0">•</span>
                  <span>
                    Volume expansion across the sector supports the price
                    action, indicating genuine institutional participation
                    rather than thin liquidity-driven moves.
                  </span>
                </li>
              </ul>
            </Card>

            {/* Individual Stock Charts */}
            <h3 className="font-semibold mb-4">Stock-Level Price Action</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* JINDALSTEL */}
              <Card className="overflow-hidden">
                <div className="p-3 border-b bg-muted/30">
                  <Link href="/stocks/JINDALSTEL" className="hover:underline">
                    <h4 className="font-semibold text-sm text-primary">JINDALSTEL</h4>
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Jindal Steel Limited
                  </p>
                </div>
                <button
                  onClick={() =>
                    openUpdateImage(
                      "/images/market-reports/steel-update-jindalstel.png",
                      "Jindal Steel daily chart showing breakout above resistance with MA Ribbon",
                    )
                  }
                  className="block w-full cursor-zoom-in relative group"
                >
                  <img
                    src="/images/market-reports/steel-update-jindalstel.png"
                    alt="Jindal Steel daily chart showing breakout above resistance with MA Ribbon"
                    className="w-full group-hover:opacity-90 transition-opacity"
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                    <ZoomIn className="h-8 w-8 text-white drop-shadow-lg" />
                  </div>
                </button>
              </Card>

              {/* JSWSTEEL */}
              <Card className="overflow-hidden">
                <div className="p-3 border-b bg-muted/30">
                  <Link href="/stocks/JSWSTEEL" className="hover:underline">
                    <h4 className="font-semibold text-sm text-primary">JSWSTEEL</h4>
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    JSW Steel Limited
                  </p>
                </div>
                <button
                  onClick={() =>
                    openUpdateImage(
                      "/images/market-reports/steel-update-jswsteel.png",
                      "JSW Steel daily chart showing price recovery above moving averages",
                    )
                  }
                  className="block w-full cursor-zoom-in relative group"
                >
                  <img
                    src="/images/market-reports/steel-update-jswsteel.png"
                    alt="JSW Steel daily chart showing price recovery above moving averages"
                    className="w-full group-hover:opacity-90 transition-opacity"
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                    <ZoomIn className="h-8 w-8 text-white drop-shadow-lg" />
                  </div>
                </button>
              </Card>

              {/* SAIL */}
              <Card className="overflow-hidden">
                <div className="p-3 border-b bg-muted/30">
                  <Link href="/stocks/SAIL" className="hover:underline">
                    <h4 className="font-semibold text-sm text-primary">SAIL</h4>
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Steel Authority of India Limited
                  </p>
                </div>
                <button
                  onClick={() =>
                    openUpdateImage(
                      "/images/market-reports/steel-update-sail.png",
                      "SAIL daily chart showing strong momentum above SMA 50 and EMA 200",
                    )
                  }
                  className="block w-full cursor-zoom-in relative group"
                >
                  <img
                    src="/images/market-reports/steel-update-sail.png"
                    alt="SAIL daily chart showing strong momentum above SMA 50 and EMA 200"
                    className="w-full group-hover:opacity-90 transition-opacity"
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                    <ZoomIn className="h-8 w-8 text-white drop-shadow-lg" />
                  </div>
                </button>
              </Card>

              {/* TATASTEEL */}
              <Card className="overflow-hidden">
                <div className="p-3 border-b bg-muted/30">
                  <Link href="/stocks/TATASTEEL" className="hover:underline">
                    <h4 className="font-semibold text-sm text-primary">TATASTEEL</h4>
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tata Steel Limited
                  </p>
                </div>
                <button
                  onClick={() =>
                    openUpdateImage(
                      "/images/market-reports/steel-update-tatasteel.png",
                      "Tata Steel daily chart showing breakout with high volume",
                    )
                  }
                  className="block w-full cursor-zoom-in relative group"
                >
                  <img
                    src="/images/market-reports/steel-update-tatasteel.png"
                    alt="Tata Steel daily chart showing breakout with high volume"
                    className="w-full group-hover:opacity-90 transition-opacity"
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                    <ZoomIn className="h-8 w-8 text-white drop-shadow-lg" />
                  </div>
                </button>
              </Card>
            </div>

            <p className="text-xs text-muted-foreground mb-6">
              All charts show daily timeframe. Data as of 29 January 2026.
            </p>
          </section>

          {/* Update Image Lightbox */}
          <Dialog
            open={!!updateImageSrc}
            onOpenChange={handleUpdateDialogChange}
          >
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
                  onClick={() => handleUpdateDialogChange(false)}
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
                {updateImageSrc && (
                  <img
                    src={updateImageSrc}
                    alt={updateImageAlt}
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

        {/* References */}
        <div className="mt-8 pt-6 border-t">
          <h3 className="text-sm font-semibold mb-3">References</h3>
          <ol className="text-xs text-muted-foreground space-y-2">
            <li className="flex gap-2">
              <span className="text-primary shrink-0">[1]</span>
              <a
                href="https://www.mckinsey.com/industries/metals-and-mining/our-insights/strengthening-the-future-steel-for-growth-and-resilience"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors break-all"
              >
                McKinsey & Company - Strengthening the future: Steel for growth
                and resilience
              </a>
            </li>
          </ol>
        </div>

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
