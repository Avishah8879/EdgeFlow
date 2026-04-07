import { useEffect, useMemo, useState } from "react";
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
import { EquityProLogo } from "@/components/TiphubLogo";
import { HalvorsenAttractor } from "@/components/HalvorsenAttractor";
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
      const result = await requestResetMutation.mutateAsync({
        email: email.toLowerCase().trim(),
      });
      setStep(2);
      setCooldown(RESEND_SECONDS);

      setMessage(`Code sent to ${email}`);
    } catch (error: any) {
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
      const result = await requestResetMutation.mutateAsync({
        email: email.toLowerCase().trim(),
      });
      setCooldown(RESEND_SECONDS);

      setMessage(`New code sent to ${email}`);
    } catch (error) {
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
              {/* Step 1: Email */}
              {step === 1 && (
                <Card className="bg-card/95 backdrop-blur-sm border-border/50">
                  <CardHeader className="text-center">
                  <CardTitle className="text-xl">Forgot password?</CardTitle>
                  <CardDescription>
                    Enter your email and we'll send you a reset code
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="grid gap-6" onSubmit={handleRequestCode}>
                    <div className="grid gap-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        placeholder="m@example.com"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setErrors((prev) => ({ ...prev, email: undefined }));
                          setMessage(null);
                        }}
                        aria-invalid={!!errors.email}
                      />
                      {errors.email && (
                        <p className="text-sm text-destructive">{errors.email}</p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={!canRequest}
                    >
                      {requestResetMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        "Send reset code"
                      )}
                    </Button>

                    <div className="text-center text-sm">
                      Remember your password?{" "}
                      <Link href="/login" className="underline underline-offset-4">
                        Sign in
                      </Link>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* Step 2: OTP + New Password */}
            {step === 2 && (
              <Card className="bg-card/95 backdrop-blur-sm border-border/50">
                <CardHeader className="text-center">
                  <CardTitle className="text-xl">Verify your email</CardTitle>
                  <CardDescription>
                    We sent a code to {email}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="grid gap-6" onSubmit={handleResetPassword}>
                    {/* OTP Input */}
                    <div className="grid gap-2">
                      <Label>Verification code</Label>
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
                        <p className="text-sm text-destructive text-center">
                          {errors.code}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground text-center">
                        Didn&apos;t receive a code?{" "}
                        <button
                          type="button"
                          className="underline underline-offset-4 hover:text-foreground disabled:opacity-50"
                          onClick={handleResend}
                          disabled={cooldown > 0 || requestResetMutation.isPending}
                        >
                          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend"}
                        </button>
                      </p>
                    </div>

                    {/* New Password */}
                    <div className="grid gap-2">
                      <Label htmlFor="password">New password</Label>
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
                      />
                      {password && (
                        <p className={cn("text-xs", strengthColor)}>
                          Strength: {strengthLabel}
                        </p>
                      )}
                      {errors.password && (
                        <p className="text-sm text-destructive">{errors.password}</p>
                      )}
                    </div>

                    {/* Confirm Password */}
                    <div className="grid gap-2">
                      <Label htmlFor="confirm">Confirm password</Label>
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
                      />
                      {errors.confirm && (
                        <p className="text-sm text-destructive">{errors.confirm}</p>
                      )}
                    </div>

                    {message && (
                      <p className="text-sm text-muted-foreground text-center">
                        {message}
                      </p>
                    )}

                    <Button type="submit" className="w-full" disabled={!canReset}>
                      {resetPasswordMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        "Reset password"
                      )}
                    </Button>

                    <div className="text-center text-sm">
                      <button
                        type="button"
                        className="underline underline-offset-4"
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
                </CardContent>
              </Card>
            )}

            {/* Step 3: Success */}
            {step === 3 && (
              <Card className="bg-card/95 backdrop-blur-sm border-border/50">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center gap-4 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-positive/10">
                      <CheckCircle2 className="h-8 w-8 text-positive" />
                    </div>
                    <h1 className="text-2xl font-bold">Password reset!</h1>
                    <p className="text-balance text-sm text-muted-foreground">
                      Your password has been reset successfully. Redirecting to
                      login...
                    </p>
                    <Link href="/login" className="w-full">
                      <Button className="w-full">Go to Login</Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
