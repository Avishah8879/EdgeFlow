import { Card } from "@/components/ui/card";
import IndexCard from "@/components/IndexCard";
import { useIndices } from "@/hooks/use-indices";
import { SEO } from "@/components/SEO";
import { PAGE_SEO } from "@/lib/seo-config";
import { generateFAQSchema, INDICES_FAQS } from "@/lib/json-ld";

export default function Indices() {
  const { data: indicesData, isLoading, error } = useIndices();

  const indices = indicesData?.data || [];

  return (
    <>
      {/* SEO Meta Tags */}
      <SEO
        title={PAGE_SEO.indices.title}
        description={PAGE_SEO.indices.description}
        canonical="/indices"
        jsonLd={generateFAQSchema(INDICES_FAQS)}
      />

      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 space-y-8">
          <div>
            <h1 className="text-3xl font-bold">Market Indices</h1>
          <p className="text-muted-foreground mt-2">
            Track major market indices and sectoral performance
          </p>
          {indices.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              Showing {indices.length} indices
            </p>
          )}
        </div>

        {isLoading && (
          <div className="text-center py-12 text-muted-foreground">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
            <p className="mt-4">Loading indices...</p>
          </div>
        )}

        {error && (
          <Card className="p-8 text-center">
            <p className="text-destructive font-medium">Failed to load indices</p>
            <p className="text-sm text-muted-foreground mt-2">
              Please check your connection and try again later.
            </p>
          </Card>
        )}

        {!isLoading && !error && indices.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No indices available at the moment.</p>
          </Card>
        )}

        {!isLoading && !error && indices.length > 0 && (
          <section>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {indices.map((index) => (
                <IndexCard key={index.id} {...index} href={`/index/${encodeURIComponent(index.symbol)}`} />
              ))}
            </div>
          </section>
        )}
        </div>
      </div>
    </>
  );
}
