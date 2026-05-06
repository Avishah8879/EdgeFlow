import { Link } from "wouter";
import { EquityProLogo } from "@/components/EquityProLogo";

interface AuthShellProps {
  /** Form pane content — usually a card with title + fields. */
  children: React.ReactNode;
  /** H1 displayed at the top of the navy aside. The italic-gold em is rendered via `asideTaglineEm`. */
  asideTagline?: React.ReactNode;
  /** Optional pull quote at the bottom of the aside. */
  quote?: { body: string; attribution: string };
}

/**
 * AuthShell — split-screen auth layout per EquityPro v1 design.
 *
 *   ┌─────────────────────────┬─────────────────────────┐
 *   │  navy-gradient aside    │      form pane          │
 *   │  brand · tagline · quote│   (children)            │
 *   └─────────────────────────┴─────────────────────────┘
 *
 * Stacks to a single column on mobile (aside hidden, form takes full width).
 */
export function AuthShell({ children, asideTagline, quote }: AuthShellProps) {
  return (
    <div className="min-h-svh grid grid-cols-1 lg:grid-cols-2 bg-background">
      {/* Navy gradient aside — desktop only */}
      <aside className="hidden lg:flex relative overflow-hidden flex-col justify-between p-16 text-white bg-gradient-to-br from-[hsl(var(--brand-navy))] to-[hsl(var(--brand-navy-deep,212_56%_15%))]">
        {/* Decorative gold radial glow */}
        <span
          aria-hidden
          className="absolute -left-[150px] -bottom-[150px] w-[500px] h-[500px] rounded-full opacity-30 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, hsl(var(--brand-gold) / 0.5), transparent 70%)",
          }}
        />

        <Link href="/" className="relative z-10 inline-flex items-center gap-2 self-start">
          <EquityProLogo size="md" forceLight />
        </Link>

        <h2 className="relative z-10 font-display text-4xl xl:text-[42px] leading-[1.1] tracking-tight font-bold mt-auto mb-6">
          {asideTagline ?? (
            <>
              Markets at the
              <br />
              <em className="italic font-bold text-[hsl(var(--brand-gold))]">
                speed of thought.
              </em>
            </>
          )}
        </h2>

        {quote && (
          <div className="relative z-10 pt-5 border-t border-white/20">
            <p className="text-sm leading-relaxed text-white/80 mb-3">
              {quote.body}
            </p>
            <div className="text-xs font-bold text-[hsl(var(--brand-gold))]">
              {quote.attribution}
            </div>
          </div>
        )}
      </aside>

      {/* Form pane */}
      <main className="flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md">
          {/* Mobile-only brand */}
          <div className="lg:hidden flex justify-center mb-8">
            <Link href="/">
              <EquityProLogo size="md" />
            </Link>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

export default AuthShell;
