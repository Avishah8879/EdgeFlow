import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useRequestPasswordReset, useResetPassword } from "@/hooks/use-password-reset";
import { toast } from "sonner";
import { SEO } from "@/components/SEO";
import { AuthShell } from "@/components/auth/AuthShell";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3; // 1: Email, 2: OTP + Password, 3: Success
type FieldErrors = {
  email?: string;
  code?: string;
  password?: string;
  confirm?: string;
};

const RESEND_SECONDS = 30;

export default function EquityProForgotPassword() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const requestResetMutation = useRequestPasswordReset();
  const resetPasswordMutation = useResetPassword();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(
      () => setCooldown((value) => (value > 0 ? value - 1 : 0)),
      1000
    );
    return () => clearInterval(timer);
  }, [cooldown]);

  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const passwordScore = useMemo(() => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  }, [password]);

  const strengthLabel = ["Too short", "Weak", "Fair", "Good", "Strong"][passwordScore];
  const strengthColor = ["text-destructive", "text-destructive", "text-yellow-500", "text-positive", "text-positive"][passwordScore];

  const handleRequestCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: FieldErrors = {
      email: isValidEmail(email) ? undefined : "Enter a valid email address.",
    };
    setErrors(nextErrors);
    if (nextErrors.email) return;

    try {
      await requestResetMutation.mutateAsync({
        email: email.toLowerCase().trim(),
      });
      setStep(2);
      setCooldown(RESEND_SECONDS);
      setMessage(`Code sent to ${email}`);
    } catch {
      setStep(2);
      setCooldown(RESEND_SECONDS);
      setMessage(`If an account exists, a code has been sent.`);
    }
  };

  const handleResetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: FieldErrors = {
      code: /^\d{6}$/.test(otp) ? undefined : "Enter the 6-digit code.",
      password:
        passwordScore >= 3
          ? undefined
          : "Use 8+ chars with upper, lower, number, and symbol.",
      confirm: confirm === password ? undefined : "Passwords must match.",
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    try {
      await resetPasswordMutation.mutateAsync({
        email: email.toLowerCase().trim(),
        otp: otp,
        newPassword: password,
      });

      setStep(3);
      setMessage("Password updated successfully!");
      toast.success("Password reset successful!");

      setTimeout(() => {
        setLocation("/login");
      }, 3000);
    } catch (error: any) {
      setErrors({ code: error.message || "Invalid or expired code" });
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;

    try {
      await requestResetMutation.mutateAsync({
        email: email.toLowerCase().trim(),
      });
      setCooldown(RESEND_SECONDS);
      setMessage(`New code sent to ${email}`);
    } catch {
      setCooldown(RESEND_SECONDS);
      setMessage(`Code resent to ${email}`);
    }
  };

  const canRequest = isValidEmail(email) && !requestResetMutation.isPending;
  const canReset =
    otp.length === 6 &&
    password.length > 0 &&
    confirm.length > 0 &&
    !Object.values(errors).some(Boolean) &&
    !resetPasswordMutation.isPending;

  return (
    <>
      <SEO
        title="Reset Password - EquityPro"
        description="Reset your EquityPro password securely."
        noIndex={true}
      />

      <AuthShell
        asideTagline={
          <>
            Quick recovery.
            <br />
            <em className="italic font-bold text-[hsl(var(--brand-gold))]">
              Back to the markets.
            </em>
          </>
        }
      >
        {/* Step 1 — Email */}
        {step === 1 && (
          <>
            <div className="mb-7">
              <h1 className="font-display text-3xl md:text-[32px] font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
                Forgot password?
              </h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                Enter your email and we'll send you a 6-digit reset code.
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleRequestCode}>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[11.5px] font-semibold">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@firm.in"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErrors((prev) => ({ ...prev, email: undefined }));
                    setMessage(null);
                  }}
                  aria-invalid={!!errors.email}
                  className="h-11"
                />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-[hsl(var(--brand-navy))] text-white hover:bg-[hsl(var(--brand-navy))]/90"
                disabled={!canRequest}
              >
                {requestResetMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  "Send reset code"
                )}
              </Button>

              <div className="text-center text-sm text-muted-foreground pt-1">
                Remember your password?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-[hsl(var(--brand-gold))] hover:underline"
                >
                  Sign in →
                </Link>
              </div>
            </form>
          </>
        )}

        {/* Step 2 — OTP + new password */}
        {step === 2 && (
          <>
            <div className="mb-7">
              <h1 className="font-display text-3xl md:text-[32px] font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
                Verify your email
              </h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                We sent a code to{" "}
                <span className="font-mono text-foreground">{email}</span>
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleResetPassword}>
              <div className="space-y-2">
                <Label className="text-[11.5px] font-semibold">
                  Verification code
                </Label>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={otp}
                    onChange={(value) => {
                      setOtp(value);
                      setErrors((prev) => ({ ...prev, code: undefined }));
                    }}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup>
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                {errors.code && (
                  <p className="text-xs text-destructive text-center">
                    {errors.code}
                  </p>
                )}
                <p className="text-xs text-muted-foreground text-center">
                  Didn't receive a code?{" "}
                  <button
                    type="button"
                    className="font-semibold text-[hsl(var(--brand-gold))] hover:underline disabled:opacity-50 disabled:no-underline"
                    onClick={handleResend}
                    disabled={cooldown > 0 || requestResetMutation.isPending}
                  >
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend"}
                  </button>
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-[11.5px] font-semibold">
                  New password
                </Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  aria-invalid={!!errors.password}
                  className="h-11"
                />
                {password && (
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
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    setErrors((prev) => ({ ...prev, confirm: undefined }));
                  }}
                  aria-invalid={!!errors.confirm}
                  className="h-11"
                />
                {errors.confirm && (
                  <p className="text-xs text-destructive">{errors.confirm}</p>
                )}
              </div>

              {message && (
                <p className="text-xs text-muted-foreground text-center">
                  {message}
                </p>
              )}

              <Button
                type="submit"
                className="w-full h-11 bg-[hsl(var(--brand-navy))] text-white hover:bg-[hsl(var(--brand-navy))]/90"
                disabled={!canReset}
              >
                {resetPasswordMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating…
                  </>
                ) : (
                  "Reset password"
                )}
              </Button>

              <div className="text-center text-sm">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground hover:underline"
                  onClick={() => {
                    setStep(1);
                    setOtp("");
                    setPassword("");
                    setConfirm("");
                    setErrors({});
                    setMessage(null);
                  }}
                >
                  Use a different email
                </button>
              </div>
            </form>
          </>
        )}

        {/* Step 3 — success */}
        {step === 3 && (
          <div className="flex flex-col items-center gap-5 text-center py-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--positive))]/15">
              <CheckCircle2 className="h-8 w-8 text-[hsl(var(--positive))]" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
                Password reset.
              </h1>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">
                Your password has been updated successfully. Redirecting to
                login…
              </p>
            </div>
            <Link href="/login" className="w-full">
              <Button className="w-full h-11 bg-[hsl(var(--brand-navy))] text-white hover:bg-[hsl(var(--brand-navy))]/90">
                Go to login
              </Button>
            </Link>
          </div>
        )}
      </AuthShell>
    </>
  );
}
