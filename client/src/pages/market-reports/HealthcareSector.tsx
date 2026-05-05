import { useState } from "react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  ChevronRight,
  Calendar,
  Activity,
  HeartPulse,
  Building2,
  FlaskConical,
  BookOpen,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from "lucide-react";

export default function HealthcareSector() {
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
          <span className="text-foreground">Healthcare Sector</span>
        </nav>

        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <Calendar className="h-4 w-4" />
            <span>February 23, 2026</span>
          </div>
          <h1 className="font-display text-3xl md:text-5xl font-bold mb-4 tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
            Market Outlook: Healthcare Sector
          </h1>

          {/* Report Metadata */}
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Benchmark:</span>
              <span className="font-medium">Nifty 50</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Time Horizon:</span>
              <span className="font-medium">Medium-term (2–3 months)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Market Regime:</span>
              <span className="font-medium">
                Policy-driven sector rotation
              </span>
            </div>
          </div>
        </header>

        {/* Summary Card */}
        <Card className="p-6 mb-8 bg-primary/5 border-primary/20">
          <h2 className="text-lg font-semibold mb-3">Summary</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            The Indian Union Budget 2026 allocated approximately ₹1.05 lakh
            crore to healthcare, signaling a strong policy push toward hospital
            infrastructure, medical tourism, and allied health professional
            training. Prominent hospital stocks rallied on this catalyst, driven
            by their operational presence in high medical-tourism inflow states
            such as Maharashtra, Tamil Nadu, Delhi NCR, and Karnataka.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            From the relative rotation curves, we observe that while the overall
            sector has not yet entered the <em>Leading</em> quadrant, the
            current trajectory supports a constructive medium-term outlook with
            scope for sustained outperformance if momentum follow-through
            persists. Seasonal tailwinds from the Jun–Sep monsoon period and
            forward-looking catalysts in biopharma further strengthen the
            sector's outlook.
          </p>
        </Card>

        {/* Content */}
        <article className="prose prose-neutral dark:prose-invert max-w-none">
          {/* Section 1: Budget Catalyst */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <HeartPulse className="h-6 w-6 text-primary" />
              1. Budget Catalyst
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              The Indian Union Budget of 2026 outlined significant provisions
              for the healthcare sector, with approximately ₹1.05 lakh crore of
              allocation directed toward infrastructure expansion, medical
              tourism, and professional training.
            </p>

            <Card className="p-4 my-6">
              <h3 className="font-semibold mb-3">
                Key Budget Provisions
              </h3>
              <ul className="text-muted-foreground space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-primary shrink-0">•</span>
                  <span>
                    <strong>₹1.05 lakh crore</strong> allocation into the
                    healthcare sector.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary shrink-0">•</span>
                  <span>
                    New allied health professional institutions for disciplines
                    like <strong>radiology, anesthesia, and behavioral health
                    </strong> will be established in both public and private
                    sectors.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary shrink-0">•</span>
                  <span>
                    To promote medical tourism, <strong>5 regional medical hubs
                    </strong> will be established. Three all India institutes of
                    Ayurveda will also be established.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary shrink-0">•</span>
                  <span>
                    District hospitals gain <strong>trauma/emergency centers
                    </strong>, <strong>50% capacity boost</strong>, and{" "}
                    <strong>day-care cancer facilities</strong>; NIMHANS 2.0 and
                    mental health upgrades target underserved regions.
                  </span>
                </li>
              </ul>
            </Card>
          </section>

          {/* Section 2: Stock Impact Analysis */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" />
              2. Stock Impact Analysis
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-6">
              Influenced by these provisions, the most prominent publicly traded
              hospital stocks rallied. The gains were largely driven by their
              operational presence in high medical-tourism inflow states such as
              Maharashtra, Tamil Nadu, Delhi NCR, and Karnataka.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* APOLLOHOSP */}
              <Card className="p-4">
                <Link
                  href="/stocks/APOLLOHOSP"
                  className="hover:underline"
                >
                  <h4 className="font-semibold text-sm text-primary mb-1">
                    APOLLOHOSP
                  </h4>
                </Link>
                <p className="text-xs text-muted-foreground mb-2">
                  Apollo Hospitals Enterprise
                </p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="flex items-start gap-2">
                    <span className="text-primary shrink-0">•</span>
                    <span>
                      Surged on strong footprint in Chennai and Mumbai, both key
                      medical tourism centres aligned with proposed hub
                      development.
                    </span>
                  </li>
                </ul>
              </Card>

              {/* FORTIS */}
              <Card className="p-4">
                <Link
                  href="/stocks/FORTIS"
                  className="hover:underline"
                >
                  <h4 className="font-semibold text-sm text-primary mb-1">
                    FORTIS
                  </h4>
                </Link>
                <p className="text-xs text-muted-foreground mb-2">
                  Fortis Healthcare
                </p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="flex items-start gap-2">
                    <span className="text-primary shrink-0">•</span>
                    <span>
                      Benefited from Mumbai/Navi Mumbai and NCR presence,
                      positioning it to capture incremental international patient
                      flows.
                    </span>
                  </li>
                </ul>
              </Card>

              {/* NH */}
              <Card className="p-4">
                <Link
                  href="/stocks/NH"
                  className="hover:underline"
                >
                  <h4 className="font-semibold text-sm text-primary mb-1">
                    NH
                  </h4>
                </Link>
                <p className="text-xs text-muted-foreground mb-2">
                  Narayana Health
                </p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="flex items-start gap-2">
                    <span className="text-primary shrink-0">•</span>
                    <span>
                      Gained on significant Karnataka (Bengaluru) exposure, a
                      major cardiac and transplant destination for overseas
                      patients.
                    </span>
                  </li>
                </ul>
              </Card>

              {/* MAXHEALTH */}
              <Card className="p-4">
                <Link
                  href="/stocks/MAXHEALTH"
                  className="hover:underline"
                >
                  <h4 className="font-semibold text-sm text-primary mb-1">
                    MAXHEALTH
                  </h4>
                </Link>
                <p className="text-xs text-muted-foreground mb-2">
                  Max Healthcare Institute
                </p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="flex items-start gap-2">
                    <span className="text-primary shrink-0">•</span>
                    <span>
                      Rallied due to concentrated Delhi NCR footprint, one of
                      India's primary gateways for inbound medical travellers.
                    </span>
                  </li>
                </ul>
              </Card>
            </div>
          </section>

          {/* Section 3: Sector Rotation Overview */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              3. Sector Rotation Overview
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
                    "/images/market-reports/healthcare-sector-rrg.png",
                    "Relative Rotation Graph showing healthcare sector stocks including FORTIS, APOLLOHOSP, MAXHEALTH, NH, ALKEM, KIMS, and METROPOLIS"
                  )
                }
                className="block w-full cursor-zoom-in relative group"
              >
                <img
                  src="/images/market-reports/healthcare-sector-rrg.png"
                  alt="Relative Rotation Graph showing healthcare sector stocks including FORTIS, APOLLOHOSP, MAXHEALTH, NH, ALKEM, KIMS, and METROPOLIS"
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
                Current Healthcare Sector Positioning
              </h3>
              <ul className="text-muted-foreground space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-primary shrink-0">•</span>
                  <span>
                    Healthcare stocks tracked on RRG include{" "}
                    <Link
                      href="/stocks/FORTIS"
                      className="text-primary hover:underline font-medium"
                    >
                      FORTIS
                    </Link>
                    ,{" "}
                    <Link
                      href="/stocks/APOLLOHOSP"
                      className="text-primary hover:underline font-medium"
                    >
                      APOLLOHOSP
                    </Link>
                    ,{" "}
                    <Link
                      href="/stocks/MAXHEALTH"
                      className="text-primary hover:underline font-medium"
                    >
                      MAXHEALTH
                    </Link>
                    ,{" "}
                    <Link
                      href="/stocks/NH"
                      className="text-primary hover:underline font-medium"
                    >
                      NH
                    </Link>
                    ,{" "}
                    <Link
                      href="/stocks/ALKEM"
                      className="text-primary hover:underline font-medium"
                    >
                      ALKEM
                    </Link>
                    ,{" "}
                    <Link
                      href="/stocks/KIMS"
                      className="text-primary hover:underline font-medium"
                    >
                      KIMS
                    </Link>
                    , and{" "}
                    <Link
                      href="/stocks/METROPOLIS"
                      className="text-primary hover:underline font-medium"
                    >
                      METROPOLIS
                    </Link>
                    .
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary shrink-0">•</span>
                  <span>
                    While the overall sector has not yet entered the{" "}
                    <strong>Leading</strong> quadrant, the current trajectory
                    supports a constructive medium-term outlook.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary shrink-0">•</span>
                  <span>
                    Scope for sustained outperformance exists if momentum
                    follow-through persists, particularly with the budget
                    catalyst providing fundamental support.
                  </span>
                </li>
              </ul>
            </Card>
          </section>

          {/* Section 4: Seasonality */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <Calendar className="h-6 w-6 text-primary" />
              4. Seasonality
            </h2>

            <p className="text-muted-foreground leading-relaxed mb-4">
              An interesting observation with respect to the healthcare sector is
              a seasonality in stock prices:
            </p>

            <Card className="p-4 border-l-4 border-l-blue-500 mb-6">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Healthcare Seasonality
              </h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="shrink-0">•</span>
                  <span>
                    <strong>Jun–Sep:</strong> Monsoon season typically brings a
                    rise in infections, leading to higher hospital visits and
                    diagnostic activity — historically a{" "}
                    <span className="text-positive font-medium">
                      supportive phase
                    </span>{" "}
                    for the sector.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="shrink-0">•</span>
                  <span>
                    This seasonal pattern, combined with the budget catalyst,
                    creates a potential dual tailwind for healthcare stocks over
                    the medium-term horizon.
                  </span>
                </li>
              </ul>
            </Card>

            {/* Price Comparison Chart */}
            <div className="my-6 rounded-lg overflow-hidden border">
              <button
                onClick={() =>
                  openImage(
                    "/images/market-reports/healthcare-price-comparison.png",
                    "Historical price comparison of Apollo Hospitals, Max Healthcare, Fortis Healthcare, and Narayana Health"
                  )
                }
                className="block w-full cursor-zoom-in relative group"
              >
                <img
                  src="/images/market-reports/healthcare-price-comparison.png"
                  alt="Historical price comparison of Apollo Hospitals, Max Healthcare, Fortis Healthcare, and Narayana Health"
                  className="w-full group-hover:opacity-90 transition-opacity"
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                  <ZoomIn className="h-10 w-10 text-white drop-shadow-lg" />
                </div>
              </button>
              <p className="text-xs text-muted-foreground p-2 bg-muted/50">
                Historical price comparison of leading healthcare stocks —
                seasonal patterns visible in Jun–Sep periods
              </p>
            </div>
          </section>

          {/* Section 5: Related Sectors */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-primary" />
              5. Related Sectors
            </h2>

            <p className="text-muted-foreground leading-relaxed mb-4">
              The biopharma sector also rallied due to the Union Budget, with
              significant policy support for domestic manufacturing and clinical
              research infrastructure.
            </p>

            <Card className="p-4 border-l-4 border-l-primary mb-6">
              <h3 className="font-semibold mb-3">
                Biopharma SHAKTI Scheme
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                The biopharma sector also rallied due to the Union Budget. The{" "}
                <strong>₹10,000 crore Biopharma SHAKTI</strong> scheme over five
                years targets:
              </p>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-primary shrink-0">•</span>
                  <span>
                    Domestic manufacturing of{" "}
                    <strong>biologics and biosimilars</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary shrink-0">•</span>
                  <span>
                    Creating <strong>1,000 accredited clinical trial sites</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary shrink-0">•</span>
                  <span>
                    Upgrading <strong>NIPER institutes</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary shrink-0">•</span>
                  <span>
                    Strengthening the <strong>Central Drugs Standard Control
                    Organization (CDSCO)</strong> for faster approvals, enhancing
                    India's biopharma competitiveness.
                  </span>
                </li>
              </ul>
            </Card>

            {/* Key Healthcare Stocks */}
            <Card className="p-4 bg-muted/50">
              <h3 className="font-semibold mb-3">
                Key Healthcare Sector Stocks
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Link
                  href="/stocks/APOLLOHOSP"
                  className="p-2 rounded-lg border bg-background hover:bg-accent transition-colors text-center"
                >
                  <span className="font-medium text-sm text-primary">
                    APOLLOHOSP
                  </span>
                </Link>
                <Link
                  href="/stocks/FORTIS"
                  className="p-2 rounded-lg border bg-background hover:bg-accent transition-colors text-center"
                >
                  <span className="font-medium text-sm text-primary">
                    FORTIS
                  </span>
                </Link>
                <Link
                  href="/stocks/NH"
                  className="p-2 rounded-lg border bg-background hover:bg-accent transition-colors text-center"
                >
                  <span className="font-medium text-sm text-primary">NH</span>
                </Link>
                <Link
                  href="/stocks/MAXHEALTH"
                  className="p-2 rounded-lg border bg-background hover:bg-accent transition-colors text-center"
                >
                  <span className="font-medium text-sm text-primary">
                    MAXHEALTH
                  </span>
                </Link>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Also tracked on RRG:{" "}
                <Link href="/stocks/ALKEM" className="text-primary hover:underline">ALKEM</Link>,{" "}
                <Link href="/stocks/KIMS" className="text-primary hover:underline">KIMS</Link>,{" "}
                <Link href="/stocks/METROPOLIS" className="text-primary hover:underline">METROPOLIS</Link>
              </p>
            </Card>
          </section>

          {/* Conclusion */}
          <section className="mb-8">
            <Card className="p-6 bg-muted/50">
              <p className="text-muted-foreground leading-relaxed mb-4">
                The confluence of a significant budget allocation, constructive
                sector rotation dynamics, and upcoming seasonal tailwinds
                positions healthcare as a sector worthy of increased attention
                over the next 2–3 months. The budget catalyst provides a
                fundamental floor, while the RRG trajectory suggests relative
                momentum is building.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                <strong>Looking ahead:</strong> Given this analysis, the next
                question becomes: what are the related sectors where we can
                expect this to have an impact on. An obvious answer is biopharma
                and medical equipment along with healthcare infrastructure —
                particularly pharmaceutical companies with biosimilar pipelines
                and medical device manufacturers may see secondary benefits from
                this policy push.
              </p>
            </Card>
          </section>

          {/* References */}
          <section className="mb-8">
            <div className="pt-6 border-t">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                References
              </h3>
              <ol className="text-xs text-muted-foreground space-y-2">
                <li className="flex gap-2">
                  <span className="text-primary shrink-0">[1]</span>
                  <a
                    href="https://finterminal.ai/terminal"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary transition-colors break-all"
                  >
                    Finterminal — Relative Rotation Graphs and Price Comparison
                    Data
                  </a>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary shrink-0">[2]</span>
                  <a
                    href="https://www.ey.com/en_in/newsroom/2026/01/india-s-healthcare-sector-records-cumulative-deal-value-of-over-inr-10-000-crore-in-q2-fy-26-ey-parthenon-report"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary transition-colors break-all"
                  >
                    EY Parthenon — India's Healthcare Sector Records Cumulative
                    Deal Value of Over INR 10,000 Crore in Q2 FY 26
                  </a>
                </li>
              </ol>
            </div>
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
