import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/AuthShell";

type CallbackState = {
  status: "processing" | "success" | "error";
  message: string;
};

const decodeProfile = (encoded: string | null) => {
  if (!encoded) return null;
  try {
    return JSON.parse(atob(encoded));
  } catch {
    return null;
  }
};

export default function AuthCallback() {
  const { completeOAuthLogin, authBaseUrl } = useAuth();
  const [, navigate] = useLocation();
  const [state, setState] = useState<CallbackState>({
    status: "processing",
    message: "Finalizing secure login…",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const refreshToken =
      params.get("refreshToken") || params.get("refresh_token");
    const profileParam = params.get("profile");
    const errorParam = params.get("error_description") || params.get("error");
    const codeParam = params.get("code");

    const redirectUri = `${window.location.origin}/auth/callback`;

    const completeLogin = async (payload: Record<string, unknown>) => {
      try {
        completeOAuthLogin(payload);
        setState({
          status: "success",
          message: "You are now signed in. Redirecting to your terminal…",
        });
        setTimeout(() => navigate("/home"), 1200);
      } catch (err) {
        setState({
          status: "error",
          message:
            err instanceof Error
              ? err.message
              : "Unable to complete the login handshake.",
        });
      }
    };

    const exchangeOAuthCode = async (code: string) => {
      try {
        const response = await fetch(`${authBaseUrl}/auth/oauth/exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, redirect_uri: redirectUri }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.message || "OAuth exchange failed.");
        }
        await completeLogin(payload ?? {});
      } catch (err) {
        setState({
          status: "error",
          message:
            err instanceof Error
              ? err.message
              : "Unable to exchange OAuth code.",
        });
      }
    };

    if (errorParam) {
      setState({
        status: "error",
        message: decodeURIComponent(errorParam),
      });
      return;
    }

    if (token && profileParam) {
      const profile = decodeProfile(profileParam);
      if (!profile) {
        setState({
          status: "error",
          message:
            "The identity payload returned by the auth server is invalid.",
        });
        return;
      }
      completeLogin({ token, refreshToken, user: profile });
      return;
    }

    if (codeParam) {
      exchangeOAuthCode(codeParam);
      return;
    }

    setState({
      status: "error",
      message: "Missing OAuth context. Start the login flow again.",
    });
  }, [authBaseUrl, completeOAuthLogin, navigate]);

  const heading =
    state.status === "processing"
      ? "Verifying identity"
      : state.status === "success"
        ? "Login complete."
        : "Authentication failed";

  return (
    <AuthShell
      asideTagline={
        <>
          One last hop —
          <br />
          <em className="italic font-bold text-[hsl(var(--brand-gold))]">
            then back to research.
          </em>
        </>
      }
    >
      <div className="flex flex-col items-center gap-5 text-center py-6">
        <div
          className={
            state.status === "error"
              ? "flex h-16 w-16 items-center justify-center rounded-full bg-destructive/15"
              : "flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--brand-gold))]/15"
          }
        >
          {state.status === "processing" && (
            <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--brand-gold))]" />
          )}
          {state.status === "success" && (
            <ShieldCheck className="h-8 w-8 text-[hsl(var(--brand-gold))]" />
          )}
          {state.status === "error" && (
            <AlertTriangle className="h-8 w-8 text-destructive" />
          )}
        </div>

        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
            {heading}
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm">
            {state.message}
          </p>
        </div>

        {state.status === "error" && (
          <div className="flex flex-col gap-2 w-full pt-2">
            <Button
              className="w-full h-11 bg-[hsl(var(--brand-navy))] text-white hover:bg-[hsl(var(--brand-navy))]/90"
              onClick={() => navigate("/login")}
            >
              Back to login
            </Button>
            <Button
              variant="outline"
              className="w-full h-11"
              onClick={() => {
                if (typeof window === "undefined") return;
                window.location.href = "/";
              }}
            >
              Go to landing
            </Button>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
