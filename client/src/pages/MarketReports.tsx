import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Calendar, ChevronRight, FileText } from "lucide-react";
import { SEO } from "@/components/SEO";
import { PAGE_SEO } from "@/lib/seo-config";

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
      <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-8">
        {/* Header */}
        <header className="mb-10">
          <h1 className="text-3xl font-bold mb-3">Market Reports</h1>
          <p className="text-lg text-muted-foreground">
            Weekly analysis, sector performance, and key market insights
          </p>
        </header>

        {/* Reports List */}
        <div className="space-y-4">
          {marketReports.map((report) => (
            <Link key={report.slug} href={`/market-reports/${report.slug}`}>
              <Card className="p-5 hover-elevate cursor-pointer group">
                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-primary/10 p-3 shrink-0">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold group-hover:text-primary transition-colors flex items-center gap-2">
                      {report.title}
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                    </h2>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(report.date).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>

        {/* Empty state */}
        {marketReports.length === 0 && (
          <div className="text-center py-16">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No reports yet. Check back soon!</p>
          </div>
        )}
      </div>
    </div>
  );
}
