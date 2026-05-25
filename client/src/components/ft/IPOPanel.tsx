import { Briefcase, Sparkles, BellRing, Clock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';

/**
 * IPOPanel — placeholder card while backend integration is pending.
 *
 * The reference design (`design/equitypro-v1/ipo.html`) shows a featured IPO
 * with GMP card, sub-tabs (Open now / Upcoming / Recently listed / SME / My
 * applications / GMP tracker), grid cards with subscription multiples, GMP
 * badges, and listing P&L for already-listed IPOs.
 *
 * None of that data exists in the current DB:
 *   - no IPO calendar table (issue dates, price bands, share counts)
 *   - no GMP source (Grey Market Premium scraper not yet built)
 *   - no subscription tracker (QIB / NII / Retail multiples)
 *   - no allotment status table
 *
 * Building this requires either an NSE primary-market data feed or a paid
 * third-party (chittorgarh-style scraper). Per the policy in
 * `design/equitypro-v1/CLAUDE.md`: "Do not hard-code mock data. Every number,
 * ticker, news item, and chart series in the reference is mock. Replace with
 * real hooks/queries from the existing data layer." So no mock cards.
 *
 * Until that data layer exists this is the panel — a clean coming-soon card
 * that explains what's planned and points users at adjacent in-platform tools
 * they can use today.
 */
export function IPOPanel() {
  const features: Array<{
    icon: typeof Sparkles;
    title: string;
    description: string;
  }> = [
    {
      icon: Sparkles,
      title: 'Open & upcoming IPOs',
      description:
        'Issue calendar with price bands, lot sizes, subscription windows, and lead underwriters.',
    },
    {
      icon: BellRing,
      title: 'GMP tracker',
      description:
        'Live grey-market premiums vs. issue price, implied listing gain, and trend direction.',
    },
    {
      icon: Clock,
      title: 'Recently listed',
      description:
        'Listing-day P&L vs. issue price, allotment status, and subscription multiples (QIB / NII / Retail).',
    },
  ];

  return (
    <div className="h-full bg-background overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-12">
        {/* Hero coming-soon card */}
        <div className="rounded-2xl border-2 border-[hsl(var(--brand-gold))]/30 bg-card p-8 md:p-10 shadow-card-lg">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="h-14 w-14 rounded-full bg-[hsl(var(--brand-gold))]/15 flex items-center justify-center flex-shrink-0">
              <Briefcase className="h-6 w-6 text-[hsl(var(--brand-gold))]" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="inline-flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-uppercase text-[hsl(var(--brand-gold))] mb-2">
                <span className="inline-block h-px w-[18px] bg-[hsl(var(--brand-gold))]" />
                Coming soon
              </span>
              <h2 className="font-display text-2xl md:text-[28px] font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground mb-2">
                IPO calendar &amp; GMP tracker
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                We&apos;re building a full primary-market dashboard — open and
                upcoming issues, grey-market premiums, allotment status, and
                listing-day P&amp;L for recent IPOs. The backend data feed isn&apos;t
                wired up yet, so we&apos;re holding the shipped page back rather
                than ship mock numbers.
              </p>
            </div>
          </div>

          {/* Feature preview grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="rounded-xl border border-border bg-background/40 p-4"
                >
                  <Icon className="h-4 w-4 text-[hsl(var(--brand-gold))] mb-2" />
                  <h3 className="font-display text-sm font-bold text-[hsl(var(--brand-navy))] dark:text-foreground mb-1.5">
                    {f.title}
                  </h3>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">
                    {f.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Footer with adjacent tools */}
          <div className="mt-8 pt-6 border-t border-border">
            <p className="text-[11px] font-bold uppercase tracking-uppercase text-muted-foreground mb-3">
              In the meantime
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="rounded-full"
              >
                <Link href="/most-active">
                  Most active
                  <ArrowRight className="h-3 w-3 ml-1.5" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="rounded-full"
              >
                <Link href="/financial-results">
                  Earnings calendar
                  <ArrowRight className="h-3 w-3 ml-1.5" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="rounded-full"
              >
                <Link href="/news">
                  News tape
                  <ArrowRight className="h-3 w-3 ml-1.5" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="rounded-full"
              >
                <Link href="/saved-results">
                  Saved screens
                  <ArrowRight className="h-3 w-3 ml-1.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
