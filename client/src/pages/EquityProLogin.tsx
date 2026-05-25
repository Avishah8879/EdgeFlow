import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { readStoredSession } from "@/lib/auth";
import { maybeRedirectToCallingPlatform } from "@/lib/platform-handshake";
import { SEO } from "@/components/SEO";
import { AuthShell } from "@/components/auth/AuthShell";
import { cn } from "@/lib/utils";

type FormState = {
  identifier: string;
  password: string;
};

export default function EquityProLogin() {
  const {
    loginWithCredentials,
    status,
    error,
    clearError,
    startGoogleLogin,
    isAuthenticated,
    token,
    refreshToken,
    logout,
    authBaseUrl,
  } = useAuth();
  const [, navigate] = useLocation();
  const [form, setForm] = useState<FormState>({
    identifier: "",
    password: "",
  });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(false);
  const isSubmitting = status === "loading";

  useEffect(() => {
    if (error) {
      setFeedback(error);
    }
  }, [error]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    setCheckingSession(true);

    (async () => {
      let revoked = false;
      try {
        const res = await fetch(`${authBaseUrl}/auth/v3/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        // 401 = token revoked/invalid AND the interceptor's silent
        // /auth/v2/refresh also failed. Any other status or a network
        // error: proceed; a genuinely dead token is caught downstream.
        if (res.status === 401) revoked = true;
      } catch {
        revoked = false;
      }
      if (cancelled) return;

      if (revoked) {
        await logout(); // clears localStorage + session
        if (!cancelled) setCheckingSession(false);
        return; // re-render shows the form
      }

      // Valid (or interceptor silently refreshed). Forward the freshest
      // persisted tokens — the closure `token` may be the rotated-out one.
      const fresh = readStoredSession();
      const fwdToken = fresh?.token ?? token;
      const fwdRefresh = fresh?.refreshToken ?? refreshToken;
      if (maybeRedirectToCallingPlatform(fwdToken, fwdRefresh)) return;

      const searchParams = new URLSearchParams(window.location.search);
      const returnUrl = searchParams.get("returnUrl");
      const destination = returnUrl ? decodeURIComponent(returnUrl) : "/home";
      timeoutId = setTimeout(() => navigate(destination), 800);
    })();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isAuthenticated, token, refreshToken, authBaseUrl, navigate, logout]);

  const handleChange =
    (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [key]: event.target.value }));
      setFeedback(null);
      clearError();
    };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.identifier.trim() || !form.password.trim()) {
      setFeedback("Please enter your email and password.");
      return;
    }

    try {
      await loginWithCredentials({
        identifier: form.identifier.trim(),
        password: form.password,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to sign in. Please try again.";
      setFeedback(message);
    }
  };

  if (isAuthenticated && checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Checking session…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <SEO
        title="Sign In - EquityPro"
        description="Sign in to your EquityPro account to access AI-powered stock analysis, technical screener, and strategy backtesting tools."
        noIndex={true}
      />

      <AuthShell
        quote={{
          body: "The reverse DCF is the killer feature for me. I finally stopped arguing with myself about what growth rate is reasonable — the market tells me.",
          attribution: "Arjun S. · Independent investor · Pune",
        }}
      >
        {/* Headline */}
        <div className="mb-7">
          <h1 className="font-display text-3xl md:text-[32px] font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
            Welcome back.
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Sign in to your EquityPro terminal.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="identifier" className="text-[11.5px] font-semibold">
              Email
            </Label>
            <Input
              id="identifier"
              type="email"
              autoComplete="username"
              placeholder="you@firm.in"
              value={form.identifier}
              onChange={handleChange("identifier")}
              required
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-[11.5px] font-semibold">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••••"
              value={form.password}
              onChange={handleChange("password")}
              required
              className="h-11"
            />
          </div>

          <div className="flex items-center justify-end text-xs">
            <Link
              href="/forgot-password"
              className="font-semibold text-[hsl(var(--brand-gold))] hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          {feedback && (
            <p
              className={cn(
                "text-sm text-center",
                isAuthenticated ? "text-positive" : "text-destructive",
              )}
              role="alert"
            >
              {feedback}
            </p>
          )}

          <Button
            type="submit"
            className="w-full h-11 bg-[hsl(var(--brand-navy))] text-white hover:bg-[hsl(var(--brand-navy))]/90"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
              Or continue with
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full h-11"
            onClick={startGoogleLogin}
            disabled={isSubmitting}
          >
            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </Button>

          <div className="text-center text-sm text-muted-foreground pt-2">
            Don't have an account?{" "}
            <Link
              href="/signup"
              className="font-semibold text-[hsl(var(--brand-gold))] hover:underline"
            >
              Open one →
            </Link>
          </div>

          <p className="text-[11px] text-center text-muted-foreground leading-relaxed pt-2">
            By continuing you agree to our{" "}
            <Link
              href="/terms"
              className="font-semibold text-[hsl(var(--brand-gold))] hover:underline"
            >
              Terms
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="font-semibold text-[hsl(var(--brand-gold))] hover:underline"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </form>
      </AuthShell>
    </>
  );
}
