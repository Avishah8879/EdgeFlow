import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Key, CheckCircle2, XCircle, AlertCircle, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function FyersTokenUpdate() {
  const [tokenJson, setTokenJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: statusData, refetch: refetchStatus } = useQuery<any>({
    queryKey: ["fyers-token-status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/fyers-token");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const status = statusData?.data;

  const handleSave = async () => {
    setSaveError(null);
    let parsed: any;
    try {
      parsed = JSON.parse(tokenJson.trim());
    } catch {
      setSaveError("Invalid JSON — paste the full token object");
      return;
    }
    if (!parsed.access_token) {
      setSaveError("JSON must contain an access_token field");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/fyers-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const result = await res.json();
      if (!res.ok) {
        setSaveError(result?.detail || result?.error || "Failed to save token");
      } else {
        setTokenJson("");
        refetchStatus();
        toast.success("Fyers token updated — Order Book depth feed will refresh within 60s");
      }
    } catch (e: any) {
      setSaveError(e.message || "Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center mb-6 space-y-2.5">
          <div className="mx-auto h-12 w-12 rounded-full bg-[hsl(var(--brand-gold))]/15 flex items-center justify-center mb-3">
            <Key className="h-6 w-6 text-[hsl(var(--brand-gold))]" strokeWidth={1.75} />
          </div>
          <div className="flex justify-center">
            <Eyebrow tone="gold" rule>
              Admin · Broker
            </Eyebrow>
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
            Fyers token update
          </h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Paste today's Fyers access token JSON to enable the Order Book depth feed.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Current Token Status</CardTitle>
          </CardHeader>
          <CardContent>
            {status ? (
              <div className="flex items-center gap-3 text-sm">
                {status.status === "valid" ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                ) : status.status === "expired" ? (
                  <XCircle className="h-5 w-5 text-destructive shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0" />
                )}
                <div>
                  <span className="font-medium capitalize">{status.status}</span>
                  {status.expiry && (
                    <span className="text-muted-foreground ml-2">
                      · Expires: {new Date(status.expiry).toLocaleString("en-IN", {
                        dateStyle: "medium", timeStyle: "short"
                      })}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Loading status...</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Paste New Token</CardTitle>
            <CardDescription>
              Get today's token from Fyers API dashboard and paste the full JSON below
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Token JSON</Label>
              <Textarea
                placeholder={`{\n  "access_token": "eyJ...",\n  "generated_at": "2026-04-07T...",\n  "expiry": "2026-04-08T..."\n}`}
                value={tokenJson}
                onChange={(e) => { setTokenJson(e.target.value); setSaveError(null); }}
                className="font-mono text-xs min-h-[140px]"
              />
            </div>

            {saveError && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {saveError}
              </p>
            )}

            <Button
              onClick={handleSave}
              disabled={saving || !tokenJson.trim()}
              className="w-full"
              size="lg"
            >
              {saving
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                : <><Save className="h-4 w-4 mr-2" /> Update Token</>
              }
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Token valid until next day ~10:10 AM IST · No login required
        </p>
      </div>
    </div>
  );
}
