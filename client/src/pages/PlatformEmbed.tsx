import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SEO } from "@/components/SEO";
import { getPlatform, getPlatformOrigin, type PlatformSlug } from "@/lib/platforms";
import { usePlatformSession } from "@/hooks/use-platform-session";
import { useAuth } from "@/contexts/AuthContext";

function PlatformLoader({ label }: { label: string }) {
  return (
    <div className="flex h-[calc(100vh-9rem)] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Opening {label}...</p>
      </div>
    </div>
  );
}

export default function PlatformEmbed() {
  const params = useParams();
  const platform = getPlatform(params.slug);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const session = usePlatformSession(platform?.slug as PlatformSlug | undefined);
  const { token, refreshToken } = useAuth();

  useEffect(() => {
    if (!iframeLoaded || !platform || !session.data || !iframeRef.current?.contentWindow) {
      return;
    }

    iframeRef.current.contentWindow.postMessage(
      {
        type: "edgeflow:session",
        version: 1,
        apiKey: session.data.apiKey,
        userId: session.data.userId,
        token,
        refreshToken,
      },
      getPlatformOrigin(platform),
    );
  }, [iframeLoaded, platform, session.data, token, refreshToken]);

  if (!platform) {
    return (
      <>
        <SEO title="Platform Not Found - Equity Pro" canonical="/platforms" />
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 py-6 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            Platform not found.
          </CardContent>
        </Card>
      </>
    );
  }

  if (session.isLoading) {
    return (
      <>
        <SEO title={`${platform.name} - Equity Pro`} description={platform.description} canonical={`/platforms/${platform.slug}`} />
        <PlatformLoader label={platform.name} />
      </>
    );
  }

  if (session.error) {
    return (
      <>
        <SEO title={`${platform.name} - Equity Pro`} description={platform.description} canonical={`/platforms/${platform.slug}`} />
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 py-6 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            Unable to open {platform.name}. {session.error.message}
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <SEO title={`${platform.name} - Equity Pro`} description={platform.description} canonical={`/platforms/${platform.slug}`} />
      <div className="-mx-4 -my-6 md:-mx-8">
        {!iframeLoaded && <PlatformLoader label={platform.name} />}
        <iframe
          ref={iframeRef}
          src={platform.url}
          title={platform.name}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          className={iframeLoaded ? "h-[calc(100vh-5rem)] w-full border-0" : "hidden"}
          onLoad={() => setIframeLoaded(true)}
        />
      </div>
    </>
  );
}
