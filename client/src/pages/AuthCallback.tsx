import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

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
    message: "Finalizing secure login...",
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
          message: "You are now signed in. Redirecting to TipHub...",
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
          message: "The identity payload returned by the auth server is invalid.",
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

  const renderIcon = () => {
    if (state.status === "processing") {
      return <Loader2 className="h-10 w-10 animate-spin text-primary" />;
    }
    if (state.status === "success") {
      return <ShieldCheck className="h-12 w-12 text-primary" />;
    }
    return <AlertTriangle className="h-12 w-12 text-destructive" />;
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-background px-4 py-16">
      <Card className="max-w-lg w-full border-border/60 bg-card/90 text-center shadow-lg">
        <CardHeader className="flex flex-col items-center gap-4">
          {renderIcon()}
          <CardTitle className="text-2xl">
            {state.status === "processing"
              ? "Verifying Identity"
              : state.status === "success"
                ? "Login Complete"
                : "Authentication Failed"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-muted-foreground">{state.message}</p>
          {state.status === "error" && (
            <div className="flex flex-col gap-3">
              <Button variant="outline" onClick={() => navigate("/login")}>
                Back to login
              </Button>
              <Button
                onClick={() => {
                  if (typeof window === "undefined") return;
                  window.location.href = "/";
                }}
                variant="ghost"
              >
                Go to landing
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
