import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { SEO } from "@/components/SEO";
import { TiphubLogo } from "@/components/TiphubLogo";
import { HalvorsenAttractor } from "@/components/HalvorsenAttractor";
import { cn } from "@/lib/utils";

type FormState = {
  identifier: string;
  password: string;
};

export default function TiphubLogin() {
  const {
    loginWithCredentials,
    status,
    error,
    clearError,
    startGoogleLogin,
    isAuthenticated,
  } = useAuth();
  const [, navigate] = useLocation();
  const [form, setForm] = useState<FormState>({
    identifier: "",
    password: "",
  });
  const [feedback, setFeedback] = useState<string | null>(null);
  const isSubmitting = status === "loading";

  useEffect(() => {
    if (error) {
      setFeedback(error);
    }
  }, [error]);

  useEffect(() => {
    if (isAuthenticated) {
      const searchParams = new URLSearchParams(window.location.search);
      const returnUrl = searchParams.get("returnUrl");
      const destination = returnUrl ? decodeURIComponent(returnUrl) : "/home";
      const timeout = setTimeout(() => navigate(destination), 800);
      return () => clearTimeout(timeout);
    }
  }, [isAuthenticated, navigate]);

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

  return (
    <>
      <SEO
        title="Sign In - Tiphub"
        description="Sign in to your Tiphub account to access AI-powered stock analysis, expert screener, and strategy backtesting tools."
        noIndex={true}
      />
      <div className="relative min-h-svh overflow-hidden">
        {/* Three.js Halvorsen attractor background */}
        <HalvorsenAttractor />

        {/* Content layer - pointer-events-none allows attractor interaction in empty space */}
        <div className="relative z-10 flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10 pointer-events-none">
          <div className="flex w-full max-w-sm flex-col gap-6 pointer-events-auto">
            <Link href="/" className="flex items-center gap-2 self-center">
              <TiphubLogo size="md" />
            </Link>
            <div className="flex flex-col gap-6">
              <Card className="bg-card/95 backdrop-blur-sm border-border/50">
                <CardHeader className="text-center">
                  <CardTitle className="text-xl">Welcome back</CardTitle>
                  <CardDescription>
                    Login to your Tiphub account
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="grid gap-6" onSubmit={handleSubmit} noValidate>
                    <div className="grid gap-6">
                      <div className="grid gap-2">
                        <Label htmlFor="identifier">Email</Label>
                        <Input
                          id="identifier"
                          type="email"
                          autoComplete="username"
                          placeholder="m@example.com"
                          value={form.identifier}
                          onChange={handleChange("identifier")}
                          required
                        />
                      </div>

                      <div className="grid gap-2">
                        <div className="flex items-center">
                          <Label htmlFor="password">Password</Label>
                          <Link
                            href="/forgot-password"
                            className="ml-auto text-sm underline-offset-4 hover:underline"
                          >
                            Forgot your password?
                          </Link>
                        </div>
                        <Input
                          id="password"
                          type="password"
                          autoComplete="current-password"
                          value={form.password}
                          onChange={handleChange("password")}
                          required
                        />
                      </div>

                      {feedback && (
                        <p
                          className={cn(
                            "text-sm text-center",
                            isAuthenticated ? "text-positive" : "text-destructive"
                          )}
                          role="alert"
                        >
                          {feedback}
                        </p>
                      )}

                      <Button
                        type="submit"
                        className="w-full"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Signing in...
                          </>
                        ) : (
                          "Login"
                        )}
                      </Button>
                    </div>

                    <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
                      <span className="relative z-10 bg-card px-2 text-muted-foreground">
                        Or continue with
                      </span>
                    </div>

                    <div className="flex flex-col gap-4">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={startGoogleLogin}
                        disabled={isSubmitting}
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24">
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
                        Login with Google
                      </Button>
                    </div>

                    <div className="text-center text-sm">
                      Don&apos;t have an account?{" "}
                      <Link href="/signup" className="underline underline-offset-4">
                        Sign up
                      </Link>
                    </div>
                  </form>
                </CardContent>
              </Card>
              <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary">
                By clicking continue, you agree to our{" "}
                <Link href="/terms">Terms of Service</Link> and{" "}
                <Link href="/privacy">Privacy Policy</Link>.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
