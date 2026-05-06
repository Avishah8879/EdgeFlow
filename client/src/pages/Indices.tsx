import IndexCard from "@/components/IndexCard";
import { useIndices } from "@/hooks/use-indices";
import { Skeleton } from "@/components/ui/skeleton";
import { SEO } from "@/components/SEO";
import { PAGE_SEO } from "@/lib/seo-config";
import { generateFAQSchema, INDICES_FAQS } from "@/lib/json-ld";
import { motion } from "framer-motion";
import { fadeInUp, easeOut } from "@/lib/motion";
import { Eyebrow } from "@/components/ui/eyebrow";

export default function Indices() {
  const { data: indicesData, isLoading, error } = useIndices();
  const indices = indicesData?.data || [];

  return (
    <>
      <SEO
        title={PAGE_SEO.indices.title}
        description={PAGE_SEO.indices.description}
        canonical="/indices"
        jsonLd={generateFAQSchema(INDICES_FAQS)}
      />

      <div className="min-h-screen bg-background">
        {/* Page masthead */}
        <section className="border-b border-border bg-card">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-10">
            <motion.div
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              transition={easeOut}
              className="space-y-2"
            >
              <Eyebrow tone="gold" rule>
                Markets
              </Eyebrow>
              <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
                Indices
              </h1>
              <p className="text-sm text-muted-foreground max-w-2xl">
                {indices.length > 0
                  ? `Live quotes for ${indices.length} Indian benchmarks and sectoral indices.`
                  : "Live quotes for Indian benchmarks and sectoral indices."}
              </p>
            </motion.div>
          </div>
        </section>

        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-10">
          {isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(9)].map((_, i) => (
                <Skeleton key={i} className="h-[120px] rounded-xl" />
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-12 text-center">
              <p className="text-destructive font-medium mb-1">
                Failed to load indices
              </p>
              <p className="text-sm text-destructive/70">
                Please check your connection and try again.
              </p>
            </div>
          )}

          {!isLoading && !error && indices.length === 0 && (
            <div className="rounded-xl border border-border bg-card px-4 py-12 text-center">
              <p className="text-muted-foreground">
                No indices available right now.
              </p>
            </div>
          )}

          {!isLoading && !error && indices.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {indices.map((index) => (
                <IndexCard
                  key={index.id}
                  {...index}
                  href={`/index/${encodeURIComponent(index.symbol)}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
