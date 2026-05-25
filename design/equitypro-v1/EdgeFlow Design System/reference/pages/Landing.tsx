import { Link } from "wouter";
import {
  ArrowRight, BarChart2, Zap, Brain, TrendingUp, Shield,
  Globe, LineChart, Activity, Search, BookOpen, Terminal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HalvorsenAttractor } from "@/components/HalvorsenAttractor";

const features = [
  {
    icon: LineChart,
    title: "Advanced Charts",
    desc: "TradingView-grade candlestick charts with 24+ technical indicators, multi-timeframe analysis, and pattern detection.",
  },
  {
    icon: Activity,
    title: "Options Analytics",
    desc: "Live NSE option chain with Greeks, GEX exposure heatmaps, IV surface 3D visualization, and real-time depth.",
  },
  {
    icon: Brain,
    title: "AI Sentiment",
    desc: "FinBERT ML sentiment analysis across global news. Understand the narrative before the price moves.",
  },
  {
    icon: Search,
    title: "Expert Screener",
    desc: "AST-based boolean expression screener with 24 indicators. Run `sma_50 > sma_200 and rsi_14 < 70` across all NSE stocks.",
  },
  {
    icon: TrendingUp,
    title: "Alpha Generation",
    desc: "Quantum-inspired genetic algorithm discovers optimal strategies. Backtest with real tick data, train/test splits, and equity curves.",
  },
  {
    icon: BarChart2,
    title: "Portfolio Optimizer",
    desc: "Black-Litterman portfolio construction with efficient frontier visualization and risk-adjusted allocation.",
  },
  {
    icon: Globe,
    title: "Global Markets",
    desc: "57 NSE indices, FII/DII flows, world indices, IPO calendar, corporate actions, and real-time market movers.",
  },
  {
    icon: BookOpen,
    title: "Deep Fundamentals",
    desc: "Financial Sankey diagrams, reverse DCF calculator, shareholding patterns, stock scorecard, and analyst recommendations.",
  },
  {
    icon: Shield,
    title: "Real Data Only",
    desc: "Zero tolerance for mock data. Every price, chart, and metric is sourced live. Unavailable data shows a clear error state.",
  },
];

const stats = [
  { value: "3,014+", label: "NSE/BSE Symbols" },
  { value: "64", label: "Feature Pages" },
  { value: "24", label: "Technical Indicators" },
  { value: "57", label: "Market Indices" },
];

export default function Landing() {
  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-x-hidden">
      <HalvorsenAttractor />

      <div className="relative z-10">
        {/* Nav */}
        <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-border/40 bg-background/70 backdrop-blur-md flex items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/15 border border-primary/30">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <span className="text-lg font-bold tracking-tight">
              <span className="text-primary">Edge</span>
              <span className="text-foreground">Flow</span>
            </span>
          </Link>
          <Link href="/home">
            <Button size="sm" className="gap-1.5">
              <Terminal className="h-3.5 w-3.5" />
              Launch Terminal
            </Button>
          </Link>
        </header>

        {/* Hero */}
        <section className="flex flex-col items-center justify-center min-h-screen text-center px-4 pt-14 pb-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary mb-8">
            Professional-grade financial intelligence
          </span>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6 leading-tight">
            <span className="text-foreground">Markets at the</span>
            <br />
            <span className="text-primary drop-shadow-[0_0_30px_rgba(0,191,255,0.4)]">
              speed of thought
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
            EdgeFlow combines Bloomberg-terminal analytics with AI-powered research —
            real-time charts, options Greeks, expert screener, strategy backtesting,
            and sentiment analysis for NSE/BSE markets.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/home">
              <Button size="lg" className="gap-2 px-8 py-6 text-base font-semibold shadow-[0_0_20px_rgba(0,191,255,0.3)]">
                Launch Terminal
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/chart">
              <Button size="lg" variant="outline" className="gap-2 px-8 py-6 text-base border-primary/30 hover:border-primary/60">
                <LineChart className="h-4 w-4" />
                View Charts
              </Button>
            </Link>
          </div>
        </section>

        {/* Stats */}
        <section className="border-y border-border/30 bg-card/30 backdrop-blur-sm py-12">
          <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="text-3xl font-bold text-primary mb-1">{s.value}</div>
                <div className="text-sm text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Features Grid */}
        <section className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Everything a trader needs
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              64 feature pages. One unified interface. No compromises on data quality.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-xl border border-border/40 bg-card/50 p-6 backdrop-blur-sm hover:border-primary/40 hover:bg-card/80 transition-all duration-200"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 mb-4 group-hover:bg-primary/20 transition-colors">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-3xl mx-auto text-center px-6 py-24">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-12 backdrop-blur-sm">
            <Zap className="h-10 w-10 text-primary mx-auto mb-6 drop-shadow-[0_0_12px_rgba(0,191,255,0.6)]" />
            <h2 className="text-3xl font-bold mb-4">Ready to trade smarter?</h2>
            <p className="text-muted-foreground mb-8 text-lg">
              Access all 64 feature pages — charts, screeners, options, AI analysis,
              and more. No account required to explore.
            </p>
            <Link href="/home">
              <Button size="lg" className="gap-2 px-10 py-6 text-base font-semibold shadow-[0_0_30px_rgba(0,191,255,0.25)]">
                Open Dashboard
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border/30 py-8 text-center text-sm text-muted-foreground">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold text-foreground">EdgeFlow</span>
          </div>
          <p>
            Market data for NSE/BSE India. &nbsp;
            <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">Privacy</Link>
            &nbsp;·&nbsp;
            <Link href="/help" className="underline underline-offset-2 hover:text-foreground">Help</Link>
          </p>
        </footer>
      </div>
    </div>
  );
}
