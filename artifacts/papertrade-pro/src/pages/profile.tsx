import React, { useState } from "react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import { useUpdateProfile } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PnLBadge } from "@/components/pnl-badge";
import { User, Shield, Wallet, TrendingUp, Landmark } from "lucide-react";

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateProfile = useUpdateProfile();

  const [form, setForm] = useState({
    fullName: user?.fullName ?? "",
    phone: user?.phone ?? "",
    city: user?.city ?? "",
    stopLossLimit: user?.stopLossLimit?.toString() ?? "",
    targetPrice: user?.targetPrice?.toString() ?? "",
    maxDailyLoss: user?.maxDailyLoss?.toString() ?? "",
  });

  const handleSave = async () => {
    try {
      await updateProfile.mutateAsync({
        data: {
          fullName: form.fullName || undefined,
          phone: form.phone || undefined,
          city: form.city || undefined,
          stopLossLimit: form.stopLossLimit ? parseFloat(form.stopLossLimit) : null,
          targetPrice: form.targetPrice ? parseFloat(form.targetPrice) : null,
          maxDailyLoss: form.maxDailyLoss ? parseFloat(form.maxDailyLoss) : null,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Profile updated successfully" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update failed", description: err.message });
    }
  };

  if (!user) return null;

  const totalReturn = ((user.portfolioValue - user.initialCapital) / user.initialCapital) * 100;
  const pnlAbs = user.portfolioValue - user.initialCapital;

  function fmt(n: number) {
    return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }

  return (
    <Layout>
      <div className="space-y-4 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
          <p className="text-muted-foreground text-sm">Manage your details and risk settings</p>
        </div>

        {/* Primary portfolio cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="rounded-md bg-primary/10 p-2 mt-0.5">
                <TrendingUp className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Portfolio Value</p>
                <p className="text-xl font-bold tracking-tight">{fmt(user.portfolioValue)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Cash + open positions</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <div className="rounded-md bg-muted p-2 mt-0.5">
                <Landmark className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Initial Capital</p>
                <p className="text-xl font-bold tracking-tight">{fmt(user.initialCapital)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Selected at registration</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Wallet className="w-3 h-3" /> Cash Balance</p>
              <div className="mt-1 font-bold">{fmt(user.balance)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Unrealized in Positions</p>
              <div className="mt-1 font-bold">{fmt(user.portfolioValue - user.balance)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Overall Return</p>
              <div className="mt-1">
                <PnLBadge amount={pnlAbs} showPercent percentValue={totalReturn} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Personal Info */}
        <Card>
          <CardHeader className="py-3 px-4 border-b border-border">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="w-4 h-4" /> Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Full Name</Label>
                <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input value={user.email} disabled className="opacity-60" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">City</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Age</Label>
                <Input value={user.age} disabled className="opacity-60" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Member Since</Label>
                <Input value={new Date(user.createdAt).toLocaleDateString("en-IN")} disabled className="opacity-60" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Risk Settings */}
        <Card>
          <CardHeader className="py-3 px-4 border-b border-border">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="w-4 h-4" /> Risk Management
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <p className="text-xs text-muted-foreground">Set guardrails to protect your virtual capital. Leave blank to disable.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Stop Loss Limit (₹)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 5000"
                  value={form.stopLossLimit}
                  onChange={(e) => setForm({ ...form, stopLossLimit: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Max loss per trade</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Daily Loss Limit (₹)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 10000"
                  value={form.maxDailyLoss}
                  onChange={(e) => setForm({ ...form, maxDailyLoss: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Stop trading if daily loss exceeds</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Target Price (₹)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 20000"
                  value={form.targetPrice}
                  onChange={(e) => setForm({ ...form, targetPrice: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Daily profit target</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={updateProfile.isPending} className="w-full">
          {updateProfile.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </Layout>
  );
}
