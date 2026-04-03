/**
 * SEO Component for Tiphub
 * Handles meta tags, Open Graph, Twitter Cards, and JSON-LD structured data
 */

import { Helmet } from 'react-helmet-async';
import { SEO_CONFIG, getCanonicalUrl, getOgImageUrl, truncateDescription } from '@/lib/seo-config';

interface SEOProps {
  /** Page title - will be appended with site name if not ending with "Tiphub" */
  title?: string;
  /** Meta description - will be truncated to 155 chars if longer */
  description?: string;
  /** Canonical URL path (e.g., "/stocks/RELIANCE") */
  canonical?: string;
  /** Open Graph image path or full URL */
  ogImage?: string;
  /** Open Graph type (default: website) */
  ogType?: 'website' | 'article' | 'product';
  /** Keywords for meta keywords tag */
  keywords?: string;
  /** Prevent search engines from indexing this page */
  noIndex?: boolean;
  /** Prevent search engines from following links on this page */
  noFollow?: boolean;
  /** JSON-LD structured data schemas (can be single object or array) */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  /** Additional meta tags */
  additionalMeta?: Array<{ name?: string; property?: string; content: string }>;
}

export function SEO({
  title,
  description,
  canonical,
  ogImage,
  ogType = 'website',
  keywords,
  noIndex = false,
  noFollow = false,
  jsonLd,
  additionalMeta = [],
}: SEOProps) {
  // Build the full title
  const fullTitle = title
    ? title.includes('Tiphub')
      ? title
      : `${title} | Tiphub`
    : SEO_CONFIG.defaultTitle;

  // Get truncated description
  const metaDescription = truncateDescription(description || SEO_CONFIG.defaultDescription);

  // Build canonical URL
  const canonicalUrl = canonical ? getCanonicalUrl(canonical) : undefined;

  // Build OG image URL
  const ogImageUrl = getOgImageUrl(ogImage);

  // Build robots directive
  const robotsDirective = [
    noIndex ? 'noindex' : 'index',
    noFollow ? 'nofollow' : 'follow',
  ].join(', ');

  // Convert JSON-LD to array if needed
  const jsonLdArray = jsonLd
    ? Array.isArray(jsonLd)
      ? jsonLd
      : [jsonLd]
    : [];

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={metaDescription} />
      {keywords && <meta name="keywords" content={keywords} />}
      <meta name="robots" content={robotsDirective} />

      {/* Canonical URL */}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

      {/* Open Graph Tags */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:type" content={ogType} />
      <meta property="og:image" content={ogImageUrl} />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
      <meta property="og:site_name" content={SEO_CONFIG.siteName} />
      <meta property="og:locale" content={SEO_CONFIG.locale} />

      {/* Twitter Card Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={ogImageUrl} />
      <meta name="twitter:site" content={SEO_CONFIG.twitterHandle} />

      {/* Additional Meta Tags */}
      {additionalMeta.map((meta, index) => (
        <meta
          key={index}
          {...(meta.name && { name: meta.name })}
          {...(meta.property && { property: meta.property })}
          content={meta.content}
        />
      ))}

      {/* JSON-LD Structured Data */}
      {jsonLdArray.map((schema, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(schema, null, 0),
          }}
        />
      ))}
    </Helmet>
  );
}

/**
 * Global SEO Component - Add to App.tsx
 * Includes Organization and WebSite schemas that appear on all pages
 */
export function GlobalSEO() {
  return (
    <Helmet>
      {/* Default meta tags - will be overridden by page-specific SEO */}
      <html lang="en" />
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
      <meta name="theme-color" content={SEO_CONFIG.themeColor} />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

      {/* Default Open Graph */}
      <meta property="og:site_name" content={SEO_CONFIG.siteName} />
      <meta property="og:locale" content={SEO_CONFIG.locale} />

      {/* Default Twitter */}
      <meta name="twitter:site" content={SEO_CONFIG.twitterHandle} />
    </Helmet>
  );
}

/**
 * JSON-LD Only Component - For adding structured data without meta tags
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const schemas = Array.isArray(data) ? data : [data];

  return (
    <Helmet>
      {schemas.map((schema, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(schema, null, 0),
          }}
        />
      ))}
    </Helmet>
  );
}

export default SEO;
