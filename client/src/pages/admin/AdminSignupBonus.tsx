import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Gift, Loader2, Save } from "lucide-react";
import { useCoinPricing, useUpdateSignupBonus } from "@/hooks/use-coin-wallet";
import { toast } from "sonner";

export default function AdminSignupBonus() {
  const { data, isLoading } = useCoinPricing();
  const update = useUpdateSignupBonus();
  const current = data?.data;

  // Controlled input that hydrates once the server value loads.
  const [bonus, setBonus] = useState<string>("");
  useEffect(() => {
    if (current && bonus === "") {
      setBonus(String(current.signup_bonus_coins));
    }
    // intentional: only seed once on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.signup_bonus_coins]);

  const parsed = parseInt(bonus, 10);
  const valid = Number.isInteger(parsed) && parsed >= 0;
  const dirty = current != null && bonus !== "" && valid && parsed !== current.signup_bonus_coins;

  const onSave = async () => {
    if (!valid) {
      toast.error("Bonus must be a non-negative whole number");
      return;
    }
    try {
      await update.mutateAsync({ signup_bonus_coins: parsed });
      toast.success(parsed === 0 ? "Signup bonus disabled" : `New users will get ${parsed} coins`);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update");
    }
  };

  return (
    <AdminLayout requiredRole="admin">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10">
            <Gift className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Signup Bonus</h1>
            <p className="text-sm text-muted-foreground">
              Coins automatically credited to a user's wallet when they create a new account.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">New-user bonus</CardTitle>
            <CardDescription>
              Applies to both password and Google signups going forward. Set to{" "}
              <span className="font-medium">0</span> to disable. Existing users are not retroactively credited
              (you can grant coins manually from <span className="font-medium">Coin Ledger → Grant coins</span>{" "}
              if needed). The bonus appears in the user's ledger as a{" "}
              <span className="font-medium">Signup bonus</span> entry.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <Label htmlFor="signup-bonus-input">Coins per new signup</Label>
                  <Input
                    id="signup-bonus-input"
                    type="number"
                    min={0}
                    step={1}
                    value={bonus}
                    onChange={(e) => setBonus(e.target.value)}
                    className="w-32 font-mono"
                  />
                </div>
                <Button onClick={onSave} disabled={!dirty || update.isPending}>
                  {update.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-1" />
                  )}
                  Save
                </Button>
                {current && (
                  <span className="text-xs text-muted-foreground pb-2">
                    Currently:{" "}
                    <span className="font-medium text-foreground">
                      {current.signup_bonus_coins} {current.signup_bonus_coins === 1 ? "coin" : "coins"}
                    </span>
                    {" · "}
                    last updated {new Date(current.updated_at).toLocaleString("en-IN")}
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
