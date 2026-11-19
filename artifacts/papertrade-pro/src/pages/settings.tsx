import React, { useState } from "react";
import { Layout } from "@/components/layout";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Sun, Moon, Monitor, LogOut, ShieldAlert, Lock, Unlock, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const { logout, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const userAny = user as any;
  const isKillSwitchActive = userAny?.killSwitchActive ?? false;

  const [maxDailyLoss, setMaxDailyLoss] = useState(userAny?.maxDailyLoss ? String(userAny.maxDailyLoss) : "");
  const [maxDailyTrades, setMaxDailyTrades] = useState(userAny?.maxDailyTrades ? String(userAny.maxDailyTrades) : "20");
  const [savingRisk, setSavingRisk] = useState(false);
  const [togglingKillSwitch, setTogglingKillSwitch] = useState(false);

  // Upstox token state
  const [upstoxTokenInput, setUpstoxTokenInput] = useState("");
  const [upstoxStatus, setUpstoxStatus] = useState<any>(null);
  const [savingUpstox, setSavingUpstox] = useState(false);

  // Gemini API key state for AI Trading Mentor
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [geminiStatus, setGeminiStatus] = useState<any>(null);
  const [savingGemini, setSavingGemini] = useState(false);

  React.useEffect(() => {
    customFetch<any>("/api/market/upstox-status")
      .then((data) => setUpstoxStatus(data))
      .catch(() => {});
    customFetch<any>("/api/mentor/gemini-status")
      .then((data) => setGeminiStatus(data))
      .catch(() => {});
  }, []);

  const handleSaveGeminiKey = async () => {
    if (!geminiKeyInput.trim()) {
      toast({ variant: "destructive", title: "API Key required", description: "Please enter your Google Gemini API key." });
      return;
    }
    setSavingGemini(true);
    try {
      const res = await customFetch<{ success: boolean; message: string }>("/api/mentor/gemini-key", {
        method: "POST",
        body: JSON.stringify({ key: geminiKeyInput.trim() }),
      });
      toast({ title: "Gemini Key Saved!", description: res.message });
      setGeminiKeyInput("");
      const updated = await customFetch<any>("/api/mentor/gemini-status");
      setGeminiStatus(updated);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to save key", description: err.message });
    } finally {
      setSavingGemini(false);
    }
  };

  const handleSaveUpstoxToken = async () => {
    if (!upstoxTokenInput.trim()) {
      toast({ variant: "destructive", title: "Token required", description: "Please paste your Upstox Access Token." });
      return;
    }
    setSavingUpstox(true);
    try {
      const res = await customFetch<{ success: boolean; message: string }>("/api/market/upstox-token", {
        method: "POST",
        body: JSON.stringify({ token: upstoxTokenInput.trim() }),
      });
      toast({ title: "Upstox Connected!", description: res.message });
      setUpstoxTokenInput("");
      const updated = await customFetch<any>("/api/market/upstox-status");
      setUpstoxStatus(updated);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Connection Failed", description: err.message });
    } finally {
      setSavingUpstox(false);
    }
  };

  const themes: { value: "light" | "dark" | "system"; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: "Light", icon: <Sun className="w-4 h-4" /> },
    { value: "dark", label: "Dark", icon: <Moon className="w-4 h-4" /> },
    { value: "system", label: "System", icon: <Monitor className="w-4 h-4" /> },
  ];

  const handleToggleKillSwitch = async () => {
    setTogglingKillSwitch(true);
    try {
      const res = await customFetch<{ killSwitchActive: boolean; message: string }>("/api/auth/kill-switch/toggle", {
        method: "POST",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: res.killSwitchActive ? "Kill Switch ACTIVATED" : "Kill Switch DEACTIVATED",
        description: res.message,
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Action failed", description: err.message });
    } finally {
      setTogglingKillSwitch(false);
    }
  };

  const handleSaveRiskLimits = async () => {
    setSavingRisk(true);
    try {
      await customFetch("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({
          maxDailyLoss: maxDailyLoss ? parseFloat(maxDailyLoss) : null,
          maxDailyTrades: maxDailyTrades ? parseInt(maxDailyTrades) : null,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Risk Limits Updated", description: "Your daily loss and trade count caps have been saved." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update failed", description: err.message });
    } finally {
      setSavingRisk(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-4 max-w-xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings & Discipline</h1>
          <p className="text-muted-foreground text-sm">App preferences, account, and risk management kill switch</p>
        </div>

        {/* ================= RISK MANAGEMENT & DISCIPLINE KILL SWITCH ================= */}
        <Card className={cn("border-2 transition-all", isKillSwitchActive ? "border-red-500/50 bg-red-500/5" : "border-border")}>
          <CardHeader className="py-3 px-4 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className={cn("w-4 h-4", isKillSwitchActive ? "text-red-400" : "text-primary")} />
              <CardTitle className="text-sm">Risk Management & Discipline Controls</CardTitle>
            </div>
            <Badge variant="outline" className={cn("text-xs font-semibold", isKillSwitchActive ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-green-500/10 text-green-400 border-green-500/30")}>
              {isKillSwitchActive ? "LOCKED" : "ACTIVE"}
            </Badge>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {/* Kill Switch Toggle Banner */}
            <div className="bg-muted/30 p-3 rounded-lg border border-border flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-xs flex items-center gap-1.5">
                  {isKillSwitchActive ? <Lock className="w-3.5 h-3.5 text-red-400" /> : <Unlock className="w-3.5 h-3.5 text-green-400" />}
                  Emergency Trading Kill Switch
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {isKillSwitchActive
                    ? "Trading is currently locked. Orders cannot be placed."
                    : "Instantly halt trading if feeling emotional or experiencing revenge trading."}
                </p>
              </div>
              <Button
                size="sm"
                variant={isKillSwitchActive ? "default" : "destructive"}
                className="h-8 text-xs shrink-0"
                disabled={togglingKillSwitch}
                onClick={handleToggleKillSwitch}
              >
                {togglingKillSwitch ? "Updating..." : isKillSwitchActive ? "Deactivate" : "Activate"}
              </Button>
            </div>

            {/* Daily Loss Limit */}
            <div className="space-y-3 pt-1">
              <div>
                <label className="text-xs font-semibold block mb-1">Max Daily Loss Limit (₹)</label>
                <input
                  type="number"
                  value={maxDailyLoss}
                  onChange={(e) => setMaxDailyLoss(e.target.value)}
                  placeholder="e.g. 5000 (trading locks if daily loss reaches this)"
                  className="w-full px-3 py-1.5 rounded border border-border bg-background text-xs font-mono focus:ring-1 focus:ring-primary"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  When reached, today's trading is automatically locked to protect your capital.
                </p>
              </div>

              {/* Max Daily Trades */}
              <div>
                <label className="text-xs font-semibold block mb-1">Max Trades Per Day</label>
                <input
                  type="number"
                  value={maxDailyTrades}
                  onChange={(e) => setMaxDailyTrades(e.target.value)}
                  placeholder="e.g. 15 (prevents overtrading)"
                  className="w-full px-3 py-1.5 rounded border border-border bg-background text-xs font-mono focus:ring-1 focus:ring-primary"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Caps total order executions per calendar day.
                </p>
              </div>

              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs font-semibold"
                disabled={savingRisk}
                onClick={handleSaveRiskLimits}
              >
                {savingRisk ? "Saving Limits..." : "Save Risk & Discipline Limits"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ================= UPSTOX REAL-TIME MARKET DATA ================= */}
        <Card>
          <CardHeader className="py-3 px-4 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">📈</span>
              <CardTitle className="text-sm">Upstox Real-Time Market Feed</CardTitle>
            </div>
            {upstoxStatus && (
              <Badge
                variant="outline"
                className={cn(
                  "text-xs font-semibold",
                  upstoxStatus.connected
                    ? "bg-green-500/10 text-green-400 border-green-500/30"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                )}
              >
                {upstoxStatus.connected ? "LIVE FEED ACTIVE" : "SIMULATOR ACTIVE"}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              {upstoxStatus?.connected
                ? "Your app is actively receiving real-time NSE & BSE market feeds directly from Upstox API v2."
                : "Enter your daily Upstox OAuth Access Token to switch from simulator to live tick-by-tick market data."}
            </p>

            <div className="space-y-2">
              <label className="text-xs font-semibold block">Upstox Access Token (JWT)</label>
              <textarea
                rows={2}
                value={upstoxTokenInput}
                onChange={(e) => setUpstoxTokenInput(e.target.value)}
                placeholder="Paste your generated Upstox Access Token (starts with eyJ...)"
                className="w-full px-3 py-2 rounded border border-border bg-background text-xs font-mono focus:ring-1 focus:ring-primary"
              />
              <div className="flex justify-between items-center text-[11px] text-muted-foreground">
                <span>Tokens are generated daily in Upstox Developer Console</span>
                <Button
                  size="sm"
                  className="h-7 text-xs font-semibold"
                  disabled={savingUpstox}
                  onClick={handleSaveUpstoxToken}
                >
                  {savingUpstox ? "Connecting..." : "Test & Save Token"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ================= AI TRADING MENTOR (GEMINI API) ================= */}
        <Card className="border-border">
          <CardHeader className="py-3 px-4 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm">AI Trading Mentor — Google Gemini API</CardTitle>
            </div>
            {geminiStatus && (
              <Badge
                variant="outline"
                className={cn(
                  "text-xs font-semibold",
                  geminiStatus.configured
                    ? "bg-green-500/10 text-green-400 border-green-500/30"
                    : "bg-blue-500/10 text-blue-400 border-blue-500/30"
                )}
              >
                {geminiStatus.configured ? "GEMINI 2.5 ACTIVE" : "BUILT-IN ENGINE ACTIVE"}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Your AI Personal Trading Mentor analyzes your real trade executions to detect behavioral mistakes (FOMO, Greed, Revenge Trading). Powered by Google Gemini through the official <code className="text-primary font-mono text-[11px]">@google/genai</code> SDK.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-semibold block">Google Gemini API Key</label>
              <Input
                type="password"
                value={geminiKeyInput}
                onChange={(e) => setGeminiKeyInput(e.target.value)}
                placeholder={geminiStatus?.configured ? "•••••••••••••••••••••••••••••••• (Configured)" : "Enter Gemini API key (starts with AIzaSy...)"}
                className="text-xs font-mono"
              />
              <div className="flex justify-between items-center text-[11px] text-muted-foreground">
                <span>
                  Get a free key from{" "}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-semibold"
                  >
                    Google AI Studio ↗
                  </a>
                </span>
                <Button
                  size="sm"
                  className="h-7 text-xs font-semibold"
                  disabled={savingGemini}
                  onClick={handleSaveGeminiKey}
                >
                  {savingGemini ? "Saving..." : "Save Gemini Key"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card>
          <CardHeader className="py-3 px-4 border-b border-border">
            <CardTitle className="text-sm">Appearance</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-3">Choose your preferred colour scheme</p>
            <div className="flex gap-2">
              {themes.map(({ value, label, icon }) => (
                <Button
                  key={value}
                  variant={theme === value ? "default" : "outline"}
                  className={cn("flex-1 gap-2", theme === value && "")}
                  onClick={() => setTheme(value)}
                >
                  {icon}
                  {label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Account */}
        <Card>
          <CardHeader className="py-3 px-4 border-b border-border">
            <CardTitle className="text-sm">Account</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{user?.fullName}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/30">Active</span>
            </div>
            <div className="pt-2 border-t border-border">
              <Button
                variant="outline"
                className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-400 text-xs"
                onClick={logout}
              >
                <LogOut className="w-4 h-4 mr-2" /> Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* About */}
        <Card>
          <CardHeader className="py-3 px-4 border-b border-border">
            <CardTitle className="text-sm">About</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Platform</span>
              <span className="font-medium text-foreground">PaperTrade Pro v2.0</span>
            </div>
            <div className="flex justify-between">
              <span>Pricing & Analytics Engine</span>
              <span>Black-Scholes (Full Greeks: Δ, Γ, Θ, ν)</span>
            </div>
            <div className="flex justify-between">
              <span>Execution Engine</span>
              <span>Real-time Limit & Bracket Order Runner</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
