import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Lock, Sparkles, LogIn } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import type { UserTier } from "@/lib/auth";

type AccessGuardProps = {
  allowedTiers?: UserTier[];
  children: ReactNode;
};

const BASIC_ALLOWED_PAGES = ["Home", "Stocks", "News", "Learn"];

export default function AccessGuard({
  allowedTiers = ["basic", "premium"],
  children,
}: AccessGuardProps) {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <Card className="max-w-lg border-border/60 bg-card/80 backdrop-blur">
          <CardHeader className="flex flex-col items-center text-center space-y-4">
            <Lock className="h-12 w-12 text-primary" />
            <CardTitle className="text-2xl">
              Sign in to continue
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center text-muted-foreground">
            <p>
              This workspace requires an authenticated session. Log in or create
              an account to continue exploring EquityPro.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button asChild>
                <Link href="/login">
                  <LogIn className="h-4 w-4 mr-2" />
                  Go to login
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/signup">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Create account
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const userTier: UserTier = user?.tier || "basic";
  if (allowedTiers.includes(userTier)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="max-w-2xl border-border/60 bg-card/85 backdrop-blur">
        <CardHeader className="flex flex-col items-center text-center space-y-3">
          <AlertTriangle className="h-12 w-12 text-amber-400" />
          <CardTitle className="text-2xl">
            Premium access required
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center text-muted-foreground">
          <p>
            Your current plan (<span className="font-semibold">{userTier}</span>{" "}
            tier) lets you use{" "}
            {BASIC_ALLOWED_PAGES.slice(0, -1).join(", ")} and{" "}
            {BASIC_ALLOWED_PAGES[BASIC_ALLOWED_PAGES.length - 1]}. Upgrade to a
            premium seat to unlock advanced research surfaces, backtesting labs,
            and portfolio workspaces.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild>
              <a href="mailto:sales@your-domain.com?subject=Premium%20Access">
                <Sparkles className="h-4 w-4 mr-2" />
                Contact sales
              </a>
            </Button>
            <Button asChild variant="outline">
              <Link href="/home">
                Return to Home
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
