import React from "react";
import { Layout } from "@/components/layout";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sun, Moon, Monitor, LogOut } from "lucide-react";

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const { logout, user } = useAuth();

  const themes: { value: "light" | "dark" | "system"; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: "Light", icon: <Sun className="w-4 h-4" /> },
    { value: "dark", label: "Dark", icon: <Moon className="w-4 h-4" /> },
    { value: "system", label: "System", icon: <Monitor className="w-4 h-4" /> },
  ];

  return (
    <Layout>
      <div className="space-y-4 max-w-xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm">App preferences and account settings</p>
        </div>

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
                <p className="font-medium">{user?.fullName}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-500 border border-green-500/30">Active</span>
            </div>
            <div className="pt-2 border-t border-border">
              <Button
                variant="outline"
                className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-400"
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
          <CardContent className="p-4 space-y-2 text-sm text-muted-foreground">
            <div className="flex justify-between">
              <span>App</span>
              <span className="font-medium text-foreground">PaperTrade Pro</span>
            </div>
            <div className="flex justify-between">
              <span>Version</span>
              <span>1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span>Pricing Engine</span>
              <span>Black-Scholes</span>
            </div>
            <div className="flex justify-between">
              <span>Market Data</span>
              <span>Simulated · Refreshes every 10s</span>
            </div>
            <div className="flex justify-between">
              <span>Virtual Capital</span>
              <span>₹1,00,000 per account</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
