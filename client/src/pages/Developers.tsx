import { useState } from "react";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Key,
  BarChart3,
  BookOpen,
  ExternalLink,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  useRotateApiKey,
} from "@/hooks/use-api-keys";
import { ApiKeyCard } from "@/components/developer/ApiKeyCard";
import { CreateKeyDialog } from "@/components/developer/CreateKeyDialog";
import { UsageChart } from "@/components/developer/UsageChart";
import { CodeExamples } from "@/components/developer/CodeExamples";
import { toast } from "sonner";

export default function Developers() {
  const { user } = useAuth();
  const { data: keys, isLoading: keysLoading, error: keysError } = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();
  const rotateKey = useRotateApiKey();

  const [lastCreatedKey, setLastCreatedKey] = useState<string | null>(null);

  const activeKeys = keys?.filter((k) => !k.revokedAt && k.isActive) ?? [];

  const handleCreate = async (data: {
    name: string;
    allowedOrigins?: string[];
  }) => {
    const result = await createKey.mutateAsync(data);
    setLastCreatedKey(result.key);
    return result;
  };

  const handleRevoke = (keyId: string) => {
    revokeKey.mutate(keyId, {
      onSuccess: () => toast.success("API key revoked"),
      onError: (err) => toast.error(err.message),
    });
  };

  const handleRotate = (keyId: string) => {
    rotateKey.mutate(keyId, {
      onSuccess: (result) => {
        setLastCreatedKey(result.key);
        toast.success("API key rotated — copy your new key");
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <>
      <SEO
        title="Developer API - EquityPro"
        description="Access EquityPro market data programmatically. Manage API keys, view usage, and explore code examples."
        noIndex
      />

      <div className="min-h-screen bg-background">
        <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-8">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2">
              <Eyebrow tone="gold" rule>
                Settings
              </Eyebrow>
              <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
                Developer API
              </h1>
              <p className="text-muted-foreground">
                Access EquityPro market data, screener, and analytics
                programmatically.
              </p>
            </div>
          </div>

          <Tabs defaultValue="keys">
            <TabsList>
              <TabsTrigger value="keys" className="gap-2">
                <Key className="h-4 w-4" />
                API Keys
              </TabsTrigger>
              <TabsTrigger value="usage" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Usage
              </TabsTrigger>
              <TabsTrigger value="docs" className="gap-2">
                <BookOpen className="h-4 w-4" />
                Getting Started
              </TabsTrigger>
            </TabsList>

            {/* ──────── API Keys Tab ──────── */}
            <TabsContent value="keys" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Your API Keys</h2>
                  <p className="text-sm text-muted-foreground">
                    {activeKeys.length} active key
                    {activeKeys.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <CreateKeyDialog
                  onCreate={handleCreate}
                  isCreating={createKey.isPending}
                />
              </div>

              {keysLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : keysError ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Failed to load API keys. Please try again.
                    </p>
                  </CardContent>
                </Card>
              ) : keys && keys.length > 0 ? (
                <div className="space-y-3">
                  {keys.map((k) => (
                    <ApiKeyCard
                      key={k.id}
                      apiKey={k}
                      onRevoke={handleRevoke}
                      onRotate={handleRotate}
                      isRevoking={revokeKey.isPending}
                      isRotating={rotateKey.isPending}
                    />
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Key className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <h3 className="font-medium mb-1">No API keys yet</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Create your first API key to start using the EquityPro API.
                    </p>
                    <CreateKeyDialog
                      onCreate={handleCreate}
                      isCreating={createKey.isPending}
                    />
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ──────── Usage Tab ──────── */}
            <TabsContent value="usage" className="space-y-4">
              <UsageChart />
            </TabsContent>

            {/* ──────── Getting Started Tab ──────── */}
            <TabsContent value="docs" className="space-y-6">
              {/* Quick Start */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Quick Start</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Base URL</p>
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded block">
                        https://your-domain.com/v1/api/
                      </code>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Authentication</p>
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded block">
                        X-API-Key: your_key
                      </code>
                    </div>
                  </div>
                  <Separator />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      SSE Streams (EventSource)
                    </p>
                    <p className="text-sm text-muted-foreground">
                      For streaming endpoints (screener, backtest, sentiment),
                      pass the key as a query parameter since EventSource
                      doesn't support custom headers:
                    </p>
                    <code className="text-sm font-mono bg-muted px-2 py-1 rounded block">
                      ?api_key=your_key
                    </code>
                  </div>
                </CardContent>
              </Card>

              {/* Rate Limits */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Rate Limits</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 pr-4 font-medium">
                            Window
                          </th>
                          <th className="text-right py-2 px-4 font-medium">
                            Basic
                          </th>
                          <th className="text-right py-2 px-4 font-medium">
                            Premium
                          </th>
                          <th className="text-right py-2 pl-4 font-medium">
                            Enterprise
                          </th>
                        </tr>
                      </thead>
                      <tbody className="text-muted-foreground">
                        <tr className="border-b">
                          <td className="py-2 pr-4">Per Minute</td>
                          <td className="text-right py-2 px-4">20</td>
                          <td className="text-right py-2 px-4">60</td>
                          <td className="text-right py-2 pl-4">Custom</td>
                        </tr>
                        <tr className="border-b">
                          <td className="py-2 pr-4">Per Hour</td>
                          <td className="text-right py-2 px-4">500</td>
                          <td className="text-right py-2 px-4">2,000</td>
                          <td className="text-right py-2 pl-4">Custom</td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-4">Per Day</td>
                          <td className="text-right py-2 px-4">5,000</td>
                          <td className="text-right py-2 px-4">25,000</td>
                          <td className="text-right py-2 pl-4">Custom</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Rate limit info is included in every response via{" "}
                    <code className="bg-muted px-1 rounded">
                      X-RateLimit-Limit
                    </code>
                    ,{" "}
                    <code className="bg-muted px-1 rounded">
                      X-RateLimit-Remaining
                    </code>
                    , and{" "}
                    <code className="bg-muted px-1 rounded">
                      X-RateLimit-Reset
                    </code>{" "}
                    headers.
                  </p>
                </CardContent>
              </Card>

              {/* Response format */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Response Format</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      Success (list endpoints)
                    </p>
                    <pre className="text-sm font-mono bg-muted p-3 rounded overflow-x-auto">
{`{
  "data": [ ... ],
  "meta": {
    "count": 5,
    "total": 3000,
    "page": 1,
    "limit": 5,
    "has_more": true
  }
}`}
                    </pre>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      Success (single resource)
                    </p>
                    <pre className="text-sm font-mono bg-muted p-3 rounded overflow-x-auto">
{`{
  "data": { "symbol": "RELIANCE.NS", "ltp": 2500.50, ... }
}`}
                    </pre>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Error</p>
                    <pre className="text-sm font-mono bg-muted p-3 rounded overflow-x-auto">
{`{
  "error": {
    "code": "TICKER_NOT_FOUND",
    "message": "Ticker symbol 'XYZ' not found"
  }
}`}
                    </pre>
                  </div>
                </CardContent>
              </Card>

              {/* Available Endpoints */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Available Endpoints
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    {[
                      {
                        method: "GET",
                        path: "/v1/api/stocks",
                        desc: "Paginated stock list with fundamentals",
                      },
                      {
                        method: "GET",
                        path: "/v1/api/stock-ltp/:ticker",
                        desc: "Real-time last traded price",
                      },
                      {
                        method: "POST",
                        path: "/v1/api/stock-ltp/bulk",
                        desc: "Batch LTP for multiple tickers",
                      },
                      {
                        method: "GET",
                        path: "/v1/api/market-movers",
                        desc: "Top gainers and losers",
                      },
                      {
                        method: "GET",
                        path: "/v1/api/market-mood",
                        desc: "Fear & Greed index",
                      },
                      {
                        method: "GET",
                        path: "/v1/api/market-status",
                        desc: "NSE market open/closed status",
                      },
                      {
                        method: "GET",
                        path: "/v1/api/indices",
                        desc: "Market indices with prices",
                      },
                      {
                        method: "GET",
                        path: "/v1/api/price-chart/:ticker",
                        desc: "Historical OHLC price data",
                      },
                      {
                        method: "GET",
                        path: "/v1/api/technical-indicators/:ticker",
                        desc: "Technical indicator calculations",
                      },
                      {
                        method: "GET",
                        path: "/v1/api/search",
                        desc: "Stock search by name or symbol",
                      },
                      {
                        method: "POST",
                        path: "/v1/api/expert-screener/start",
                        desc: "Start screener job (SSE stream)",
                      },
                      {
                        method: "POST",
                        path: "/v1/api/strategy-backtest/start",
                        desc: "Start backtest job (SSE stream)",
                      },
                      {
                        method: "POST",
                        path: "/v1/api/sentiment-analysis/start",
                        desc: "Start sentiment analysis (SSE stream)",
                      },
                    ].map((ep) => (
                      <div
                        key={ep.path}
                        className="flex items-center gap-3"
                      >
                        <Badge
                          variant="outline"
                          className={`font-mono text-xs w-14 justify-center shrink-0 ${
                            ep.method === "POST"
                              ? "border-primary/50 text-primary"
                              : ""
                          }`}
                        >
                          {ep.method}
                        </Badge>
                        <code className="font-mono text-xs min-w-0 truncate">
                          {ep.path}
                        </code>
                        <span className="text-muted-foreground hidden sm:block shrink-0">
                          {ep.desc}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4">
                    <a
                      href="/v1/api/docs"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                    >
                      View full API documentation
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </CardContent>
              </Card>

              {/* Code Examples */}
              <CodeExamples apiKey={lastCreatedKey ?? undefined} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}
