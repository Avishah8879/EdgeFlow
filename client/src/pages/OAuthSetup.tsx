import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { COUNTRIES } from "@/lib/countries";
import { AuthShell } from "@/components/auth/AuthShell";
import { cn } from "@/lib/utils";

export default function OAuthSetup() {
  const [, setLocation] = useLocation();
  const { completeOAuthSignup } = useAuth();

  const [tempToken, setTempToken] = useState("");
  const [profile, setProfile] = useState<any>(null);

  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  // Tier defaults to "free"; tier picking happens later on /pricing.
  const [tier] = useState("free");
  const [country, setCountry] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameSuggestion, setUsernameSuggestion] = useState("");
  const [checkingUsername, setCheckingUsername] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Extract token from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setError("Invalid OAuth session. Please try signing in again.");
      setTimeout(() => setLocation("/login"), 3000);
      return;
    }

    setTempToken(token);

    // Decode JWT to get profile (without verification - just for display)
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setProfile(payload.profile);

      // Suggest username from email
      const suggestedUsername = payload.profile.email
        .split("@")[0]
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase();
      setUsername(suggestedUsername);
    } catch {
      setError("Failed to load profile data");
    }
  }, [setLocation]);

  // Check username availability (debounced)
  useEffect(() => {
    if (!username || username.length < 3) {
      setUsernameAvailable(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setCheckingUsername(true);
      try {
        const response = await fetch(
          `/auth/v2/check-username/${encodeURIComponent(username)}`
        );
        const data = await response.json();

        setUsernameAvailable(data.available);
        setUsernameSuggestion(data.suggestion || "");
      } catch (err) {
        console.error("Failed to check username:", err);
      } finally {
        setCheckingUsername(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username || username.length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }

    if (usernameAvailable === false) {
      setError("Username is already taken");
      return;
    }

    if (!country) {
      setError("Please select your country");
      return;
    }

    if (!phone.trim()) {
      setError("Phone number is required");
      return;
    }

    const normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');
    const phoneRegex = /^\+?[1-9]\d{6,14}$/;
    if (!phoneRegex.test(normalizedPhone)) {
      setError("Enter a valid phone number (e.g., +919876543210)");
      return;
    }

    if (!dateOfBirth) {
      setError("Please enter your date of birth");
      return;
    }

    const dobDate = new Date(dateOfBirth);
    if (isNaN(dobDate.getTime())) {
      setError("Please enter a valid date of birth");
      return;
    }

    if (!termsAccepted) {
      setError("You must accept the Terms and Conditions");
      return;
    }

    setLoading(true);

    try {
      await completeOAuthSignup({
        tempToken,
        username,
        tier,
        countryOfResidence: country,
        dateOfBirth,
        phoneNumber: phone.replace(/[\s\-\(\)]/g, ''),
        termsAccepted: true,
      });

      setLocation("/profile");
    } catch (err: any) {
      setError(err.message || "Failed to complete signup");
    } finally {
      setLoading(false);
    }
  };

  if (!profile) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--brand-gold))]" />
          <p className="text-sm text-muted-foreground">Loading profile…</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      asideTagline={
        <>
          A few more details and
          <br />
          <em className="italic font-bold text-[hsl(var(--brand-gold))]">
            you're set up.
          </em>
        </>
      }
    >
      <div className="mb-7">
        <h1 className="font-display text-3xl md:text-[32px] font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
          Complete your profile.
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          Just a few more details to finish setting up your account.
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        {/* Profile preview chip */}
        <div className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-muted/30">
          {profile.avatarUrl && (
            <img
              src={profile.avatarUrl}
              alt={profile.name}
              className="h-11 w-11 rounded-full"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate">{profile.name}</p>
            <p className="text-xs text-muted-foreground truncate font-mono">
              {profile.email}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="username" className="text-[11.5px] font-semibold">
            Username
          </Label>
          <Input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Choose a username"
            disabled={loading}
            className={cn(
              "h-11",
              usernameAvailable === false && "border-destructive",
              usernameAvailable === true && "border-[hsl(var(--positive))]",
            )}
          />
          {checkingUsername && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking availability…
            </p>
          )}
          {!checkingUsername && usernameAvailable === true && (
            <p className="text-xs text-positive flex items-center gap-1">
              <Check className="h-3 w-3" strokeWidth={3} />
              Username available
            </p>
          )}
          {!checkingUsername && usernameAvailable === false && (
            <div className="space-y-1">
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Username already taken
              </p>
              {usernameSuggestion && (
                <button
                  type="button"
                  className="text-xs font-semibold text-[hsl(var(--brand-gold))] hover:underline"
                  onClick={() => setUsername(usernameSuggestion)}
                >
                  Try "{usernameSuggestion}" instead
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone" className="text-[11.5px] font-semibold">
            Phone number
          </Label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 9876543210"
            disabled={loading}
            className="h-11"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="country" className="text-[11.5px] font-semibold">
              Country
            </Label>
            <Select
              value={country}
              onValueChange={setCountry}
              disabled={loading}
            >
              <SelectTrigger id="country" className="h-11">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dob" className="text-[11.5px] font-semibold">
              Date of birth
            </Label>
            <Input
              id="dob"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              disabled={loading}
              className="h-11"
            />
          </div>
        </div>

        <div className="flex items-start gap-2 pt-1">
          <Checkbox
            id="terms"
            checked={termsAccepted}
            onCheckedChange={(checked) => setTermsAccepted(checked === true)}
            disabled={loading}
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

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        <Button
          type="submit"
          className="w-full h-11 bg-[hsl(var(--brand-navy))] text-white hover:bg-[hsl(var(--brand-navy))]/90"
          disabled={
            loading ||
            !usernameAvailable ||
            !phone ||
            !country ||
            !dateOfBirth ||
            !termsAccepted
          }
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating account…
            </>
          ) : (
            "Complete signup"
          )}
        </Button>

        <div className="text-center text-sm pt-1">
          <Link
            href="/login"
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            Cancel and return to login
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
