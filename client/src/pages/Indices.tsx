import IndexCard from "@/components/IndexCard";
import { useIndices } from "@/hooks/use-indices";
import { Skeleton } from "@/components/ui/skeleton";
import { SEO } from "@/components/SEO";
import { PAGE_SEO } from "@/lib/seo-config";
import { generateFAQSchema, INDICES_FAQS } from "@/lib/json-ld";
import { motion } from "framer-motion";
import { fadeInUp, easeOut } from "@/lib/motion";

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
        <div className="max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-12 space-y-10">

          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            transition={easeOut}
            className="space-y-2"
          >
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium">Indices</p>
            <h1 className="text-3xl md:text-5xl font-serif italic font-light tracking-tight text-foreground">
              Market indices
            </h1>
            <p className="text-sm text-muted-foreground">
              {indices.length > 0
                ? `Tracking ${indices.length} Indian market indices in real time.`
                : "Major market indices and sectoral performance."}
            </p>
          </motion.div>

          {isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...Array(9)].map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-12 text-center">
              <p className="text-destructive font-medium mb-1">Failed to load indices</p>
              <p className="text-sm text-destructive/70">Please check your connection and try again.</p>
            </div>
          )}

          {!isLoading && !error && indices.length === 0 && (
            <div className="rounded-2xl border border-border/50 bg-card px-4 py-12 text-center">
              <p className="text-muted-foreground">No indices available right now.</p>
            </div>
          )}

          {!isLoading && !error && indices.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {indices.map((index) => (
                <IndexCard key={index.id} {...index} href={`/index/${encodeURIComponent(index.symbol)}`} />
              ))}
            </div>
          )}

        </div>
      </div>
    </>
  );
}
