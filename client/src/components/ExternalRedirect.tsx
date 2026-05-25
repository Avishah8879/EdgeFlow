import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { getEquityProAiUrl } from "@/lib/external-links";

interface ExternalRedirectProps {
  /** Which external destination to send the user to. */
  kind: "equitypro-ai";
  /** Optional querystring forwarded to the destination, e.g. "?ticker=RELIANCE". */
  query?: string;
}

/**
 * ExternalRedirect — small page-level component that immediately
 * navigates the browser to an external URL. Used for routes that used
 * to host an in-platform feature (e.g. /alpha-generation) but now point
 * to a separate product.
 *
 * Renders a brief loading spinner so the user isn't staring at a blank
 * page during the in-flight navigation.
 */
export function ExternalRedirect({ kind, query = "" }: ExternalRedirectProps) {
  useEffect(() => {
    let url = "";
    if (kind === "equitypro-ai") url = getEquityProAiUrl();
    if (!url) return;
    window.location.replace(`${url}${query}`);
  }, [kind, query]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--brand-gold))]" />
      <p className="text-sm text-muted-foreground">Redirecting to EquityPro AI…</p>
    </div>
  );
}

export default ExternalRedirect;
