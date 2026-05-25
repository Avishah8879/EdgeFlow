import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { readStoredSession } from "@/lib/auth";
import { maybeRedirectToCallingPlatform } from "@/lib/platform-handshake";
import { SEO } from "@/components/SEO";
import { COUNTRIES } from "@/lib/countries";
import { AuthShell } from "@/components/auth/AuthShell";
import { cn } from "@/lib/utils";

type FormState = {
  username: string;
  email: string;
  password: string;
  confirm: string;
  phone: string;
  country: string;
  dateOfBirth: string;
  terms: boolean;
};

type FieldErrors = Partial<Record<keyof FormState, string | undefined>>;

export default function EquityProSignup() {
  const [, navigate] = useLocation();
  const {
    authBaseUrl,
    completeOAuthLogin,
    startGoogleLogin,
    isAuthenticated,
    token,
    refreshToken,
    logout,
  } = useAuth();
  const [checkingSession, setCheckingSession] = useState(false);

  // Cross-platform handshake: if /signup was opened with
  // ?platform=&returnUrl=, bounce to the originating platform with the
  // freshly minted JWT once auth flips to true. Revalidate the stored
  // token against the server first so a revoked session shows the form
  // instead of silently bouncing back to the calling platform.
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
  const [form, setForm] = useState<FormState>({
    username: "",
    email: "",
    password: "",
    confirm: "",
    phone: "",
    country: "",
    dateOfBirth: "",
    terms: false,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"default" | "error" | "success">("default");

  const passwordScore = useMemo(() => {
    const value = form.password;
    let score = 0;
    if (value.length >= 8) score++;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
    if (/\d/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;
    return score;
  }, [form.password]);

  const strengthLabel = ["Too short", "Weak", "Fair", "Good", "Strong"][passwordScore];
  const strengthColor = ["text-destructive", "text-destructive", "text-yellow-500", "text-positive", "text-positive"][passwordScore];

  const validators: Record<keyof FormState, () => string | undefined> = {
    username: () =>
      form.username.trim().length >= 3 ? undefined : "Use at least 3 characters.",
    email: () =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
        ? undefined
        : "Enter a valid email.",
    password: () =>
      passwordScore >= 3
        ? undefined
        : "Use 8+ chars with upper, lower, number, and symbol.",
    confirm: () =>
      form.confirm === form.password ? undefined : "Passwords must match.",
    phone: () => {
      if (!form.phone.trim()) return "Phone number is required.";
      const normalized = form.phone.replace(/[\s\-\(\)]/g, '');
      const phoneRegex = /^\+?[1-9]\d{6,14}$/;
      return phoneRegex.test(normalized) ? undefined : "Enter a valid phone number (e.g., +919876543210)";
    },
    country: () =>
      form.country ? undefined : "Please select your country.",
    dateOfBirth: () => {
      if (!form.dateOfBirth) return "Please enter your date of birth.";
      const date = new Date(form.dateOfBirth);
      if (isNaN(date.getTime())) return "Please enter a valid date.";
      return undefined;
    },
    terms: () => (form.terms ? undefined : "Accept the terms to continue."),
  };

  const validateField = (key: keyof FormState) => {
    const result = validators[key]();
    setErrors((prev) => ({ ...prev, [key]: result }));
    return result;
  };

  const handleInputChange =
    (key: keyof FormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value =
        event.target.type === "checkbox"
          ? (event.target as HTMLInputElement).checked
          : event.target.value;
      setForm((prev) => ({ ...prev, [key]: value as any }));
      setErrors((prev) => ({ ...prev, [key]: undefined }));
      setMessage(null);
      setMessageTone("default");
    };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: FieldErrors = Object.keys(validators).reduce(
      (acc, key) => {
        acc[key as keyof FormState] = validators[key as keyof FormState]();
        return acc;
      },
      {} as FieldErrors
    );

    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setMessageTone("default");

    const payload = {
      username: form.username.trim(),
      email: form.email.trim(),
      password: form.password,
      name: form.username.trim(),
      countryOfResidence: form.country,
      dateOfBirth: form.dateOfBirth,
      phoneNumber: form.phone.replace(/[\s\-\(\)]/g, ''),
      termsAccepted: form.terms,
    };

    try {
      const response = await fetch(`${authBaseUrl}/auth/v2/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMessage = result?.message || "Unable to create your account.";
        throw new Error(errorMessage);
      }

      completeOAuthLogin(result ?? {});
      setMessageTone("success");
      setMessage("Account created! Redirecting...");
      const searchParams = new URLSearchParams(window.location.search);
      const returnUrl = searchParams.get("returnUrl");
      const destination = returnUrl ? decodeURIComponent(returnUrl) : "/home";
      setTimeout(() => navigate(destination), 800);
    } catch (error) {
      setMessageTone("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to create your account. Try again shortly."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    !Object.values(errors).some(Boolean) &&
    form.username &&
    form.email &&
    form.password &&
    form.confirm &&
    form.phone &&
    form.country &&
    form.dateOfBirth &&
    form.terms &&
    !submitting;

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
        title="Sign Up - EquityPro"
        description="Create your free EquityPro account to access AI-powered stock analysis, technical screener, and strategy backtesting tools for Indian stocks."
        noIndex={true}
      />

      <AuthShell
        asideTagline={
          <>
            Build the kind of
            <br />
            <em className="italic font-bold text-[hsl(var(--brand-gold))]">
              research stack
            </em>{" "}
            you've always wanted.
          </>
        }
        quote={{
          body: "Setup took five minutes. The screener and reverse DCF replaced two SaaS subscriptions on day one.",
          attribution: "Sundar K. · RIA · Bangalore",
        }}
      >
        <div className="mb-7">
          <h1 className="font-display text-3xl md:text-[32px] font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
            Create your account.
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Join EquityPro and start your research workflow.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          {/* Google sign-up */}
          <Button
            type="button"
            variant="outline"
            className="w-full h-11"
            onClick={startGoogleLogin}
            disabled={submitting}
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
            Sign up with Google
          </Button>

          <div className="flex items-center gap-3 my-1">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
              Or with email
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="username" className="text-[11.5px] font-semibold">
              Username
            </Label>
            <Input
              id="username"
              autoComplete="username"
              placeholder="Choose a username"
              value={form.username}
              onChange={handleInputChange("username")}
              onBlur={() => validateField("username")}
              aria-invalid={!!errors.username}
              className="h-11"
            />
            {errors.username && (
              <p className="text-xs text-destructive">{errors.username}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-[11.5px] font-semibold">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@firm.in"
              value={form.email}
              onChange={handleInputChange("email")}
              onBlur={() => validateField("email")}
              aria-invalid={!!errors.email}
              className="h-11"
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-[11.5px] font-semibold">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={handleInputChange("password")}
              onBlur={() => validateField("password")}
              aria-invalid={!!errors.password}
              className="h-11"
            />
            {form.password && (
              <p className={cn("text-[11px] font-medium", strengthColor)}>
                Strength: {strengthLabel}
              </p>
            )}
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm" className="text-[11.5px] font-semibold">
              Confirm password
            </Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={form.confirm}
              onChange={handleInputChange("confirm")}
              onBlur={() => validateField("confirm")}
              aria-invalid={!!errors.confirm}
              className="h-11"
            />
            {errors.confirm && (
              <p className="text-xs text-destructive">{errors.confirm}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-[11.5px] font-semibold">
              Phone number
            </Label>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+91 9876543210"
              value={form.phone}
              onChange={handleInputChange("phone")}
              onBlur={() => validateField("phone")}
              aria-invalid={!!errors.phone}
              className="h-11"
            />
            {errors.phone && (
              <p className="text-xs text-destructive">{errors.phone}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="country" className="text-[11.5px] font-semibold">
                Country
              </Label>
              <Select
                value={form.country}
                onValueChange={(value) => {
                  setForm((prev) => ({ ...prev, country: value }));
                  setErrors((prev) => ({ ...prev, country: undefined }));
                  setMessage(null);
                }}
              >
                <SelectTrigger
                  id="country"
                  className="h-11"
                  aria-invalid={!!errors.country}
                >
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {COUNTRIES.map((country) => (
                    <SelectItem key={country} value={country}>
                      {country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.country && (
                <p className="text-xs text-destructive">{errors.country}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dob" className="text-[11.5px] font-semibold">
                Date of birth
              </Label>
              <Input
                id="dob"
                type="date"
                value={form.dateOfBirth}
                onChange={handleInputChange("dateOfBirth")}
                onBlur={() => validateField("dateOfBirth")}
                aria-invalid={!!errors.dateOfBirth}
                className="h-11"
              />
              {errors.dateOfBirth && (
                <p className="text-xs text-destructive">{errors.dateOfBirth}</p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2 pt-1">
            <Checkbox
              id="terms"
              checked={form.terms}
              onCheckedChange={(checked) => {
                setForm((prev) => ({ ...prev, terms: checked === true }));
                setErrors((prev) => ({ ...prev, terms: undefined }));
                setMessage(null);
              }}
            />
            <Label
              htmlFor="terms"
              className="text-xs font-normal leading-relaxed text-muted-foreground"
            >
              I agree to the{" "}
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
            </Label>
          </div>
          {errors.terms && (
            <p className="text-xs text-destructive">{errors.terms}</p>
          )}

          {message && (
            <p
              className={cn(
                "text-sm text-center",
                messageTone === "success" ? "text-positive" : "text-destructive",
              )}
              role="alert"
            >
              {message}
            </p>
          )}

          <Button
            type="submit"
            className="w-full h-11 bg-[hsl(var(--brand-navy))] text-white hover:bg-[hsl(var(--brand-navy))]/90"
            disabled={!canSubmit}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account…
              </>
            ) : (
              "Create account"
            )}
          </Button>

          <div className="text-center text-sm text-muted-foreground pt-1">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-[hsl(var(--brand-gold))] hover:underline"
            >
              Sign in →
            </Link>
          </div>
        </form>
      </AuthShell>
    </>
  );
}
