import { Link } from "wouter";
import { useMemo } from "react";
import {
  ArrowRight,
  LineChart,
  TrendingUp,
  Brain,
  Search,
  Share2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIndices } from "@/hooks/use-indices";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatNumber(n: number | null | undefined, fractionDigits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatPercent(p: number | null | undefined): string {
  if (p == null || Number.isNaN(p)) return "—";
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p.toFixed(2)} %`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Marketing topbar — minimal, only used on the public Landing page.
// ─────────────────────────────────────────────────────────────────────────────

function MarketingTopbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-md"
            style={{ background: "hsl(var(--brand-navy))" }}
          >
            <Sparkles className="h-3.5 w-3.5" style={{ color: "hsl(var(--brand-gold))" }} />
          </span>
          <span
            className="font-display text-lg font-semibold tracking-tight"
            style={{ color: "hsl(var(--brand-navy))" }}
          >
            EquityPro
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm" className="text-sm">
              Sign in
            </Button>
          </Link>
          <Link href="/signup">
            <Button size="sm" className="gap-1.5 text-sm">
              Open free account
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero — three floating cards on the right, two-column copy on the left.
// ─────────────────────────────────────────────────────────────────────────────

function HeroNiftyCard() {
  const { data } = useIndices();
  const nifty = useMemo(
    () => data?.data?.find((i) => i.name === "NIFTY 50") ?? null,
    [data],
  );
  const isUp = (nifty?.changePercent ?? 0) >= 0;

  return (
    <div
      className="absolute left-0 top-0 w-[280px] rounded-lg border border-border bg-card p-4 shadow-card-lg"
      style={{ boxShadow: "var(--shadow-card-lg)" }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        NIFTY 50
      </div>
      <div
        className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
          isUp ? "text-positive" : "text-negative"
        }`}
      >
        {nifty ? formatNumber(nifty.value) : "—"}
      </div>
      <div className="text-xs text-muted-foreground">
        {nifty ? `${formatPercent(nifty.changePercent)} · today` : "Loading…"}
      </div>
      <svg
        viewBox="0 0 200 40"
        className={`mt-2 ${isUp ? "text-positive" : "text-negative"}`}
        aria-hidden
      >
        <path
          d="M0,28 L20,25 L40,27 L60,20 L80,22 L100,15 L120,18 L140,12 L160,10 L180,8 L200,5 L200,40 L0,40 Z"
          fill="currentColor"
          opacity="0.12"
        />
        <path
          d="M0,28 L20,25 L40,27 L60,20 L80,22 L100,15 L120,18 L140,12 L160,10 L180,8 L200,5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    </div>
  );
}

function HeroSentimentCard() {
  return (
    <div
      className="absolute right-0 top-[140px] w-[300px] rounded-lg border border-border bg-card p-4"
      style={{ boxShadow: "var(--shadow-card-lg)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          AI Sentiment · TCS
        </div>
        <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Example
        </span>
      </div>
      <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-positive">
        Bullish · 72
      </div>
      <div className="text-xs text-muted-foreground">31 articles · 24h window</div>
      <div className="mt-3 flex h-1.5 gap-1 overflow-hidden rounded-full">
        <div className="bg-[hsl(var(--positive))]" style={{ flex: 74 }} />
        <div className="bg-muted-foreground/50" style={{ flex: 18 }} />
        <div className="bg-[hsl(var(--negative))]" style={{ flex: 8 }} />
      </div>
    </div>
  );
}

function HeroBacktestCard() {
  return (
    <div
      className="absolute bottom-0 left-[60px] w-[340px] rounded-lg border border-border bg-card p-4"
      style={{ boxShadow: "var(--shadow-card-lg)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Backtest · MOMO-BB
          </div>
          <div
            className="mt-1 font-mono text-2xl font-bold tabular-nums"
            style={{ color: "hsl(var(--brand-gold))" }}
          >
            +38.4 %
          </div>
          <div className="text-xs text-muted-foreground">CAGR · 5 yr · Sharpe 1.42</div>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]"
          style={{
            background: "hsl(var(--brand-gold) / 0.16)",
            color: "hsl(var(--brand-gold))",
          }}
        >
          Generated
        </span>
      </div>
      <svg
        viewBox="0 0 300 40"
        className="mt-3"
        style={{ color: "hsl(var(--brand-gold))" }}
        aria-hidden
      >
        <path
          d="M0,32 L30,28 L60,30 L90,22 L120,24 L150,18 L180,14 L210,16 L240,8 L270,10 L300,4 L300,40 L0,40 Z"
          fill="currentColor"
          opacity="0.18"
        />
        <path
          d="M0,32 L30,28 L60,30 L90,22 L120,24 L150,18 L180,14 L210,16 L240,8 L270,10 L300,4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    </div>
  );
}

const TRUST_KPIS = [
  { value: "3,142", label: "NSE stocks" },
  { value: "5 yr", label: "history" },
  { value: "24", label: "indicators" },
  { value: "₹0", label: "to start" },
];

function HeroSection() {
  return (
    <section
      className="relative overflow-hidden border-b border-border"
      style={{
        background:
          "linear-gradient(180deg, hsl(var(--card)), hsl(var(--background)))",
        padding: "80px 0 100px",
      }}
    >
      {/* gold radial glow */}
      <div
        className="pointer-events-none absolute -right-[200px] -top-[200px] h-[600px] w-[600px] rounded-full blur-[40px]"
        style={{
          background:
            "radial-gradient(circle, hsl(var(--brand-gold) / 0.18), transparent 65%)",
        }}
        aria-hidden
      />

      <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-[60px] px-6 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            EquityPro · Equity research, reimagined
          </span>
          <h1
            className="font-display mb-5 mt-4 font-bold leading-[1.05] tracking-[-0.03em]"
            style={{
              color: "hsl(var(--brand-navy))",
              fontSize: "clamp(40px, 6vw, 64px)",
            }}
          >
            Markets at the
            <br />
            <em className="italic" style={{ color: "hsl(var(--brand-gold))" }}>
              speed of thought.
            </em>
          </h1>
          <p className="max-w-[48ch] text-lg leading-relaxed text-muted-foreground">
            An AI-native research terminal for Indian equities. Real-time data on
            3,000+ NSE stocks, quantum-inspired backtesting, and institutional-grade
            fundamentals — all in one workspace.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup">
              <Button size="lg" className="gap-2">
                Open free account
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/home">
              <Button size="lg" variant="ghost" className="gap-2">
                Live demo
              </Button>
            </Link>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-6 border-t border-border pt-7 sm:grid-cols-4">
            {TRUST_KPIS.map((k) => (
              <div key={k.label}>
                <div
                  className="font-mono text-2xl font-bold tabular-nums tracking-[-0.01em]"
                  style={{ color: "hsl(var(--brand-navy))" }}
                >
                  {k.value}
                </div>
                <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {k.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Floating cards */}
        <div className="relative hidden h-[520px] lg:block">
          <HeroNiftyCard />
          <HeroSentimentCard />
          <HeroBacktestCard />
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Features — six pillars.
// ─────────────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: LineChart,
    title: "Technical precision",
    desc: "24 institutional-grade indicators on hourly & daily timeframes, with multi-timeframe consensus signals.",
  },
  {
    icon: TrendingUp,
    title: "Fundamental insight",
    desc: "20-quarter financials, peer comparison, reverse DCF, and shareholding flows — refreshed within hours of filings.",
  },
  {
    icon: Sparkles,
    title: "Quantitative rigor",
    desc: "Quantum-inspired Genetic Algorithm engine searches a 10⁹-strategy space in seconds. No coding required.",
  },
  {
    icon: Brain,
    title: "AI sentiment, live",
    desc: "Every news headline scored on a −1 to +1 axis, mapped to a stock-level sentiment gauge updated every 5 minutes.",
  },
  {
    icon: Search,
    title: "Technical screener",
    desc: "40+ pre-built screens (Magic Formula, Piotroski F, dividend champions) plus a no-code custom screen builder.",
  },
  {
    icon: Share2,
    title: "Saved & shareable",
    desc: "Save backtests, screens, and stock notes. Share via signed URLs with your study group or analysts.",
  },
];

function FeaturesSection() {
  return (
    <section className="py-[100px]">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-[640px]">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            The terminal
          </span>
          <h2
            className="font-display mt-4 text-4xl font-bold leading-[1.1] tracking-[-0.02em] sm:text-[44px]"
            style={{ color: "hsl(var(--brand-navy))" }}
          >
            Four pillars of equity research, in one place.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            EquityPro replaces the patchwork of scanners, brokerage research, and
            Excel models that retail investors have lived with for decades.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-lg border border-border bg-card p-7 transition-all hover:-translate-y-0.5"
              style={{
                ["--hover-border" as string]: "hsl(var(--brand-gold) / 0.5)",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.borderColor = "hsl(var(--brand-gold) / 0.5)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.borderColor = "hsl(var(--border))")
              }
            >
              <div
                className="mb-4 flex h-11 w-11 items-center justify-center rounded-[10px]"
                style={{
                  background: "hsl(var(--brand-gold) / 0.12)",
                  color: "hsl(var(--brand-gold))",
                }}
              >
                <f.icon className="h-5 w-5" />
              </div>
              <h3
                className="font-display mb-2 text-xl font-bold"
                style={{ color: "hsl(var(--brand-navy))" }}
              >
                {f.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CTA band — navy gradient with gold glow.
// ─────────────────────────────────────────────────────────────────────────────

function CtaBand() {
  return (
    <section className="pb-0 pt-0">
      <div className="mx-auto max-w-7xl px-6">
        <div
          className="relative my-[60px] overflow-hidden rounded-2xl p-[60px] text-white"
          style={{
            background:
              "linear-gradient(155deg, hsl(var(--brand-navy)), hsl(var(--brand-navy-deep)))",
          }}
        >
          <div
            className="pointer-events-none absolute -bottom-[100px] -left-[100px] h-[400px] w-[400px] rounded-full blur-[40px]"
            style={{
              background:
                "radial-gradient(circle, hsl(var(--brand-gold) / 0.3), transparent 70%)",
            }}
            aria-hidden
          />
          <div className="relative z-10 grid items-center gap-10 lg:grid-cols-[2fr_1fr]">
            <div>
              <span
                className="block text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "hsl(var(--brand-gold))" }}
              >
                Generate alpha
              </span>
              <h2 className="font-display mt-3 text-[44px] font-bold leading-[1.1] tracking-[-0.02em] text-white">
                Find your edge in 60 seconds.
              </h2>
              <p
                className="mt-3 text-base leading-relaxed"
                style={{ color: "hsl(38 30% 88%)" }}
              >
                Tell EquityPro what you believe — momentum, mean-reversion, breakout —
                and our quantum-inspired engine returns the optimal indicator
                combination, ranked by Sharpe and Calmar, on five years of NSE data.
              </p>
            </div>
            <div className="lg:text-right">
              <Link href="/alpha-generation">
                <Button
                  size="lg"
                  className="gap-2 font-semibold"
                  style={{
                    background: "hsl(var(--brand-gold))",
                    color: "hsl(var(--brand-navy-deep))",
                  }}
                >
                  Try the backtester
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Testimonials.
// ─────────────────────────────────────────────────────────────────────────────

const TESTIMONIALS = [
  {
    quote:
      "The reverse DCF is the killer feature for me. I finally stopped arguing with myself about what growth rate is \"reasonable\" — the market tells me.",
    initials: "AS",
    name: "Arjun S.",
    role: "Independent investor · Pune",
  },
  {
    quote:
      "I run a small advisory and the screener has cut my Sunday-evening prep time in half. The data hygiene is genuinely better than what I pay 40k/month for elsewhere.",
    initials: "RP",
    name: "Rhea P.",
    role: "SEBI RIA · Bengaluru",
  },
  {
    quote:
      "The genetic-algorithm backtester surfaced a momentum filter on Bank Nifty constituents I would never have tried. Three months live, +14 % vs. benchmark.",
    initials: "VK",
    name: "Vikram K.",
    role: "Prop desk · Mumbai",
  },
];

function Testimonials() {
  return (
    <section className="pb-[100px] pt-0">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-9 max-w-[640px]">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Loved by serious retail
          </span>
          <h2
            className="font-display mt-4 text-4xl font-bold leading-[1.1] tracking-[-0.02em] sm:text-[44px]"
            style={{ color: "hsl(var(--brand-navy))" }}
          >
            Trusted by 18,000+ Indian investors.
          </h2>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className="relative rounded-lg border border-border bg-card p-8"
            >
              <span
                className="font-display absolute left-5 top-3.5 text-5xl leading-none"
                style={{ color: "hsl(var(--brand-gold))" }}
                aria-hidden
              >
                ❝
              </span>
              <p className="mb-5 mt-8 text-[15px] leading-[1.7] text-foreground">
                {t.quote}
              </p>
              <div className="flex items-center gap-3">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full font-mono text-xs font-bold tabular-nums text-white"
                  style={{ background: "hsl(var(--brand-navy))" }}
                >
                  {t.initials}
                </div>
                <div className="text-sm">
                  <div className="font-semibold text-foreground">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Footer.
// ─────────────────────────────────────────────────────────────────────────────

function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-card/40 py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 text-sm text-muted-foreground md:flex-row">
        <div className="flex items-center gap-2">
          <span
            className="flex h-5 w-5 items-center justify-center rounded-sm"
            style={{ background: "hsl(var(--brand-navy))" }}
          >
            <Sparkles className="h-2.5 w-2.5" style={{ color: "hsl(var(--brand-gold))" }} />
          </span>
          <span
            className="font-display font-semibold"
            style={{ color: "hsl(var(--brand-navy))" }}
          >
            EquityPro
          </span>
          <span className="text-xs">· Market data for NSE/BSE India</span>
        </div>
        <nav className="flex items-center gap-5 text-xs">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/help" className="hover:text-foreground">
            Help
          </Link>
          <Link href="/blog" className="hover:text-foreground">
            Blog
          </Link>
        </nav>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page export.
// ─────────────────────────────────────────────────────────────────────────────

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingTopbar />
      <main className="pt-14">
        <HeroSection />
        <FeaturesSection />
        <CtaBand />
        <Testimonials />
      </main>
      <MarketingFooter />
    </div>
  );
}
