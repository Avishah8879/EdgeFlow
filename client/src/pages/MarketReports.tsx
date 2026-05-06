import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Calendar, ChevronRight, FileText } from "lucide-react";
import { SEO } from "@/components/SEO";
import { PAGE_SEO } from "@/lib/seo-config";
import { Eyebrow } from "@/components/ui/eyebrow";

interface MarketReport {
  slug: string;
  title: string;
  date: string;
}

const marketReports: MarketReport[] = [
  {
    slug: "healthcare-sector-outlook",
    title: "Market Outlook: Healthcare Sector",
    date: "2026-02-23",
  },
  {
    slug: "gas-sector-outlook",
    title: "Market Outlook: Gas Sector",
    date: "2026-02-06",
  },
  {
    slug: "steel-sector-outlook",
    title: "Market Outlook: Steel Sector",
    date: "2026-01-12",
  },
];

export default function MarketReports() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={PAGE_SEO.marketReports.title}
        description={PAGE_SEO.marketReports.description}
        canonical="/market-reports"
      />

      {/* Page masthead */}
      <section className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 md:py-10">
          <div className="space-y-2">
            <Eyebrow tone="gold" rule>
              Research · Sector outlooks
            </Eyebrow>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
              Market reports.
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Weekly sector outlooks, analyst perspectives, and key drivers for
              Indian equities.
            </p>
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 md:py-10">
        {/* Reports list */}
        <div className="space-y-3">
          {marketReports.map((report) => (
            <Link key={report.slug} href={`/market-reports/${report.slug}`}>
              <Card className="p-5 cursor-pointer group hover:shadow-card transition-shadow duration-base border-border">
                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-[hsl(var(--brand-gold))]/15 p-3 shrink-0">
                    <FileText className="h-5 w-5 text-[hsl(var(--brand-gold))]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-display text-lg font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground group-hover:text-[hsl(var(--brand-gold))] transition-colors flex items-center gap-2">
                      {report.title}
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 group-hover:text-[hsl(var(--brand-gold))] transition-all" />
                    </h2>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5 font-mono">
                      <Calendar className="h-3 w-3" />
                      {new Date(report.date).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>

        {marketReports.length === 0 && (
          <div className="text-center py-16 rounded-xl border border-border bg-card">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No reports yet. Check back soon!</p>
          </div>
        )}
      </div>
    </div>
  );
}
