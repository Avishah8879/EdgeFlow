import { useMemo, useState } from "react";
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
import { SEO } from "@/components/SEO";
import { COUNTRIES } from "@/lib/countries";
import { EquityProLogo } from "@/components/TiphubLogo";
import { HalvorsenAttractor } from "@/components/HalvorsenAttractor";
import { cn } from "@/lib/utils";

type UserTierOption = "basic" | "premium";

type FormState = {
  username: string;
  email: string;
  password: string;
  confirm: string;
  phone: string;
  tier: UserTierOption;
  country: string;
  dateOfBirth: string;
  terms: boolean;
};

type FieldErrors = Partial<Record<keyof FormState, string | undefined>>;

export default function EquityProSignup() {
  const [, navigate] = useLocation();
  const { authBaseUrl, completeOAuthLogin, startGoogleLogin } = useAuth();
  const [form, setForm] = useState<FormState>({
    username: "",
    email: "",
    password: "",
    confirm: "",
    phone: "",
    tier: "premium",
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
    tier: () => undefined,
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
      tier: form.tier,
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

  return (
    <>
      <SEO
        title="Sign Up - EquityPro"
        description="Create your free EquityPro account to access AI-powered stock analysis, expert screener, and strategy backtesting tools for Indian stocks."
        noIndex={true}
      />
      <div className="relative min-h-svh overflow-hidden">
        {/* Three.js Halvorsen attractor background */}
        <HalvorsenAttractor />

        {/* Content layer - pointer-events-none allows attractor interaction in empty space */}
        <div className="relative z-10 flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10 pointer-events-none">
          <div className="flex w-full max-w-sm flex-col gap-6 pointer-events-auto">
            <Link href="/" className="flex items-center gap-2 self-center">
              <EquityProLogo size="md" />
            </Link>
            <div className="flex flex-col gap-6">
              <Card className="bg-card/95 backdrop-blur-sm border-border/50">
                <CardHeader className="text-center">
                <CardTitle className="text-xl">Create an account</CardTitle>
                <CardDescription>
                  Enter your details to get started
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-6" onSubmit={handleSubmit} noValidate>
                  <div className="flex flex-col gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={startGoogleLogin}
                      disabled={submitting}
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
                      Sign up with Google
                    </Button>
                  </div>

                  <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
                    <span className="relative z-10 bg-card px-2 text-muted-foreground">
                      Or continue with
                    </span>
                  </div>

                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="username">Username</Label>
                      <Input
                        id="username"
                        autoComplete="username"
                        placeholder="Choose a username"
                        value={form.username}
                        onChange={handleInputChange("username")}
                        onBlur={() => validateField("username")}
                        aria-invalid={!!errors.username}
                      />
                      {errors.username && (
                        <p className="text-sm text-destructive">{errors.username}</p>
                      )}
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        placeholder="m@example.com"
                        value={form.email}
                        onChange={handleInputChange("email")}
                        onBlur={() => validateField("email")}
                        aria-invalid={!!errors.email}
                      />
                      {errors.email && (
                        <p className="text-sm text-destructive">{errors.email}</p>
                      )}
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        autoComplete="new-password"
                        value={form.password}
                        onChange={handleInputChange("password")}
                        onBlur={() => validateField("password")}
                        aria-invalid={!!errors.password}
                      />
                      {form.password && (
                        <p className={cn("text-xs", strengthColor)}>
                          Strength: {strengthLabel}
                        </p>
                      )}
                      {errors.password && (
                        <p className="text-sm text-destructive">{errors.password}</p>
                      )}
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="confirm">Confirm Password</Label>
                      <Input
                        id="confirm"
                        type="password"
                        autoComplete="new-password"
                        value={form.confirm}
                        onChange={handleInputChange("confirm")}
                        onBlur={() => validateField("confirm")}
                        aria-invalid={!!errors.confirm}
                      />
                      {errors.confirm && (
                        <p className="text-sm text-destructive">{errors.confirm}</p>
                      )}
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        type="tel"
                        autoComplete="tel"
                        placeholder="+91 9876543210"
                        value={form.phone}
                        onChange={handleInputChange("phone")}
                        onBlur={() => validateField("phone")}
                        aria-invalid={!!errors.phone}
                      />
                      {errors.phone && (
                        <p className="text-sm text-destructive">{errors.phone}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="country">Country</Label>
                        <Select
                          value={form.country}
                          onValueChange={(value) => {
                            setForm((prev) => ({ ...prev, country: value }));
                            setErrors((prev) => ({ ...prev, country: undefined }));
                            setMessage(null);
                          }}
                        >
                          <SelectTrigger id="country" aria-invalid={!!errors.country}>
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
                          <p className="text-sm text-destructive">{errors.country}</p>
                        )}
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="dob">Date of Birth</Label>
                        <Input
                          id="dob"
                          type="date"
                          value={form.dateOfBirth}
                          onChange={handleInputChange("dateOfBirth")}
                          onBlur={() => validateField("dateOfBirth")}
                          aria-invalid={!!errors.dateOfBirth}
                        />
                        {errors.dateOfBirth && (
                          <p className="text-sm text-destructive">{errors.dateOfBirth}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="terms"
                        checked={form.terms}
                        onCheckedChange={(checked) => {
                          setForm((prev) => ({ ...prev, terms: checked === true }));
                          setErrors((prev) => ({ ...prev, terms: undefined }));
                          setMessage(null);
                        }}
                        onBlur={() => validateField("terms")}
                      />
                      <Label
                        htmlFor="terms"
                        className="text-sm font-normal leading-tight text-muted-foreground"
                      >
                        I agree to the{" "}
                        <Link href="/terms" className="underline underline-offset-4">
                          Terms of Service
                        </Link>{" "}
                        and{" "}
                        <Link href="/privacy" className="underline underline-offset-4">
                          Privacy Policy
                        </Link>
                      </Label>
                    </div>
                    {errors.terms && (
                      <p className="text-sm text-destructive">{errors.terms}</p>
                    )}

                    {message && (
                      <p
                        className={cn(
                          "text-sm text-center",
                          messageTone === "success" ? "text-positive" : "text-destructive"
                        )}
                        role="alert"
                      >
                        {message}
                      </p>
                    )}

                    <Button type="submit" className="w-full" disabled={!canSubmit}>
                      {submitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        "Create account"
                      )}
                    </Button>
                  </div>

                  <div className="text-center text-sm">
                    Already have an account?{" "}
                    <Link href="/login" className="underline underline-offset-4">
                      Sign in
                    </Link>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
