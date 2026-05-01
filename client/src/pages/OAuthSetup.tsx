import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { COUNTRIES } from "@/lib/countries";
import { EquityProLogo } from "@/components/EquityProLogo";
import { HalvorsenAttractor } from "@/components/HalvorsenAttractor";
import { cn } from "@/lib/utils";

export default function OAuthSetup() {
  const [, setLocation] = useLocation();
  const { completeOAuthSignup } = useAuth();

  const [tempToken, setTempToken] = useState("");
  const [profile, setProfile] = useState<any>(null);

  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  // Tier defaults to "free"; tier picking happens later on /pricing.
  // Migration 025 dropped the legacy "premium" value, which would fail the check_tier constraint.
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
    } catch (err) {
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
      <div className="relative min-h-svh overflow-hidden">
        <HalvorsenAttractor />
        <div className="relative z-10 min-h-svh flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
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
              <CardTitle className="text-xl">Complete your profile</CardTitle>
              <CardDescription>
                Just a few more details to get started
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-6" onSubmit={handleSubmit}>
                {/* Profile Preview */}
                <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                  {profile.avatarUrl && (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.name}
                      className="h-12 w-12 rounded-full"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{profile.name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {profile.email}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4">
                  {/* Username Field */}
                  <div className="grid gap-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Choose a username"
                      disabled={loading}
                      className={cn(
                        usernameAvailable === false && "border-destructive",
                        usernameAvailable === true && "border-positive"
                      )}
                    />
                    {checkingUsername && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Checking availability...
                      </p>
                    )}
                    {!checkingUsername && usernameAvailable === true && (
                      <p className="text-sm text-positive flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        Username available
                      </p>
                    )}
                    {!checkingUsername && usernameAvailable === false && (
                      <div className="space-y-1">
                        <p className="text-sm text-destructive flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Username already taken
                        </p>
                        {usernameSuggestion && (
                          <button
                            type="button"
                            className="text-sm text-primary underline underline-offset-4"
                            onClick={() => setUsername(usernameSuggestion)}
                          >
                            Try "{usernameSuggestion}" instead
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Phone Number Field */}
                  <div className="grid gap-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 9876543210"
                      disabled={loading}
                    />
                  </div>

                  {/* Country & DOB row */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="country">Country</Label>
                      <Select
                        value={country}
                        onValueChange={setCountry}
                        disabled={loading}
                      >
                        <SelectTrigger id="country">
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

                    <div className="grid gap-2">
                      <Label htmlFor="dob">Date of Birth</Label>
                      <Input
                        id="dob"
                        type="date"
                        value={dateOfBirth}
                        onChange={(e) => setDateOfBirth(e.target.value)}
                        disabled={loading}
                      />
                    </div>
                  </div>

                  {/* Terms & Conditions */}
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="terms"
                      checked={termsAccepted}
                      onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                      disabled={loading}
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

                  {/* Error Message */}
                  {error && (
                    <p className="text-sm text-destructive text-center">{error}</p>
                  )}

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    className="w-full"
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
                        Creating account...
                      </>
                    ) : (
                      "Complete signup"
                    )}
                  </Button>
                </div>

                <div className="text-center text-sm">
                  <Link href="/login" className="underline underline-offset-4">
                    Cancel and return to login
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  </div>
  );
}
