import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useLocation } from "wouter";
import { useLogin, customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, AlertCircle, Loader2, Mail, Lock, Check, Copy, ArrowLeft, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required.").email("Please enter a valid email address."),
  password: z.string().min(1, "Password is required.").min(6, "Password must be at least 6 characters."),
});
type LoginFormValues = z.infer<typeof loginSchema>;

function extractErrorMessage(error: unknown): string {
  if (!error) return "Something went wrong. Please try again.";
  const data = (error as any)?.data;
  if (data?.error) return data.error;
  if (data?.message) return data.message;
  const msg = (error as any)?.message ?? "";
  const colonIdx = msg.indexOf(": ");
  if (colonIdx !== -1 && msg.startsWith("HTTP ")) return msg.slice(colonIdx + 2);
  return msg || "Invalid email or password.";
}

export default function Login() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, setUser } = useAuth();
  const { toast } = useToast();
  const loginMutation = useLogin();

  const [authMethod, setAuthMethod] = useState<"otp" | "password">("otp");
  const [loginError, setLoginError] = useState<string | null>(null);

  // Real-time Gmail OTP Login State
  const [otpEmail, setOtpEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [enteredOtp, setEnteredOtp] = useState("");
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  React.useEffect(() => {
    if (isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, setLocation]);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // Password Submit
  const onPasswordSubmit = async (data: LoginFormValues) => {
    setLoginError(null);
    try {
      const cleanData = { email: data.email.trim().toLowerCase(), password: data.password.trim() };
      const res = await loginMutation.mutateAsync({ data: cleanData });
      if (res.token) {
        localStorage.setItem("papertrade_token", res.token);
      }
      setUser(res.user);
      toast({ title: "Welcome back!", description: `Logged in as ${res.user.fullName}` });
      setLocation("/dashboard");
    } catch (error: unknown) {
      setLoginError(extractErrorMessage(error));
    }
  };

  // Send Real-Time Gmail OTP for Login
  const handleSendLoginOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError(null);
    const cleanEmail = otpEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setLoginError("Please enter a valid Gmail / Email address.");
      return;
    }

    setIsSendingOtp(true);
    try {
      const res = await customFetch<any>("/api/auth/login-otp/send", {
        method: "POST",
        body: JSON.stringify({ email: cleanEmail }),
      });
      setOtpSent(true);
      setDemoOtp(res.otp ?? null);
      setEnteredOtp("");
      toast({
        title: "Real-Time OTP Dispatched",
        description: res.message || `Check your Gmail inbox (${cleanEmail})`,
      });
    } catch (err: any) {
      setLoginError(extractErrorMessage(err));
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Verify Gmail OTP and Sign In
  const handleVerifyLoginOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError(null);
    if (!enteredOtp || enteredOtp.length !== 6) {
      setLoginError("Please enter the 6-digit OTP code sent to your Gmail.");
      return;
    }

    setIsVerifyingOtp(true);
    try {
      const res = await customFetch<any>("/api/auth/login-otp/verify", {
        method: "POST",
        body: JSON.stringify({
          email: otpEmail.trim().toLowerCase(),
          otp: enteredOtp.trim(),
        }),
      });

      if (res.token) {
        localStorage.setItem("papertrade_token", res.token);
      }
      setUser(res.user);
      toast({
        title: "Authentication Successful",
        description: `Welcome back, ${res.user.fullName}!`,
      });
      setLocation("/dashboard");
    } catch (err: any) {
      setLoginError(extractErrorMessage(err));
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const copyOtp = () => {
    if (!demoOtp) return;
    navigator.clipboard.writeText(demoOtp).then(() => {
      setEnteredOtp(demoOtp);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/20 via-background to-background" />

      <Card className="w-full max-w-md z-10 border-border/50 shadow-2xl backdrop-blur-sm bg-card/90">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-3xl font-bold tracking-tight">
            <span className="text-primary">PaperTrade</span><span className="text-foreground">Pro</span>
          </CardTitle>
          <CardDescription>Enter your trading cockpit</CardDescription>

          {/* Auth Method Selector Toggle */}
          <div className="flex bg-muted/60 p-1 rounded-lg border border-border mt-3">
            <button
              type="button"
              onClick={() => {
                setAuthMethod("otp");
                setLoginError(null);
              }}
              className={cn(
                "flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5",
                authMethod === "otp"
                  ? "bg-primary text-primary-foreground shadow-sm font-bold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Mail className="w-3.5 h-3.5" /> Gmail OTP Login
              <span className="text-[9px] bg-green-500/20 text-green-400 border border-green-500/30 px-1 rounded font-normal">
                Brevo
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMethod("password");
                setLoginError(null);
              }}
              className={cn(
                "flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5",
                authMethod === "password"
                  ? "bg-primary text-primary-foreground shadow-sm font-bold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Lock className="w-3.5 h-3.5" /> Password
            </button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {loginError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="ml-2 font-medium">{loginError}</AlertDescription>
            </Alert>
          )}

          {/* MODE 1: REAL-TIME GMAIL OTP LOGIN */}
          {authMethod === "otp" && (
            <div className="space-y-4">
              {!otpSent ? (
                // Step A: Enter Email to receive real-time OTP
                <form onSubmit={handleSendLoginOtp} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Registered Gmail Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="email"
                        placeholder="yourname@gmail.com"
                        className="pl-9"
                        value={otpEmail}
                        onChange={(e) => {
                          setLoginError(null);
                          setOtpEmail(e.target.value);
                        }}
                        autoFocus
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      We will dispatch a real-time 6-digit OTP code directly to your Gmail inbox.
                    </p>
                  </div>

                  <Button type="submit" className="w-full" disabled={isSendingOtp}>
                    {isSendingOtp ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Dispatching Real-Time OTP...</>
                    ) : (
                      <><Mail className="w-4 h-4 mr-2" /> Send Gmail OTP →</>
                    )}
                  </Button>
                </form>
              ) : (
                // Step B: Enter Received 6-Digit OTP
                <form onSubmit={handleVerifyLoginOtp} className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="rounded-xl border border-primary/40 bg-primary/10 p-3.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                        <Mail className="w-4 h-4 text-primary" /> OTP Sent to Gmail
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setOtpSent(false);
                          setEnteredOtp("");
                          setLoginError(null);
                        }}
                        className="text-[11px] text-muted-foreground hover:text-primary underline flex items-center gap-0.5"
                      >
                        <ArrowLeft className="w-3 h-3" /> Change Email
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Code sent to <strong className="text-primary font-mono">{otpEmail}</strong>. Check inbox &amp; spam folder.
                    </p>
                  </div>

                  {/* Fallback / Quick fill box if in testing mode */}
                  {demoOtp && (
                    <div className="rounded-xl border border-primary/50 bg-primary/5 p-3.5">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[11px] font-semibold text-primary uppercase tracking-wider">
                          Quick Fill (Testing Mode)
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-primary hover:bg-primary/20"
                          onClick={copyOtp}
                        >
                          {copied ? <><Check className="w-3 h-3 mr-1" /> Copied!</> : <><Copy className="w-3 h-3 mr-1" /> Copy &amp; fill</>}
                        </Button>
                      </div>
                      <p className="text-3xl font-bold font-mono tracking-[0.35em] text-primary text-center py-1">
                        {demoOtp}
                      </p>
                      <p className="text-[10px] text-muted-foreground text-center">
                        Real-time delivery active when Brevo API key is saved
                      </p>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Enter 6-Digit OTP</label>
                    <Input
                      placeholder="_ _ _ _ _ _"
                      maxLength={6}
                      className="text-center text-2xl font-mono tracking-[0.4em] h-12"
                      value={enteredOtp}
                      onChange={(e) => {
                        setLoginError(null);
                        setEnteredOtp(e.target.value.replace(/\D/g, ""));
                      }}
                      autoFocus
                    />
                  </div>

                  <p className="text-xs text-muted-foreground text-center">
                    Didn't receive code?{" "}
                    <button
                      type="button"
                      className="text-primary hover:underline font-medium"
                      onClick={() => handleSendLoginOtp()}
                      disabled={isSendingOtp}
                    >
                      {isSendingOtp ? "Resending..." : "Resend OTP"}
                    </button>
                  </p>

                  <Button type="submit" className="w-full" disabled={isVerifyingOtp}>
                    {isVerifyingOtp ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying OTP...</>
                    ) : (
                      "Verify & Enter Terminal →"
                    )}
                  </Button>
                </form>
              )}
            </div>
          )}

          {/* MODE 2: TRADITIONAL PASSWORD LOGIN */}
          {authMethod === "password" && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onPasswordSubmit)} className="space-y-4" noValidate>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="trader@example.com"
                          type="email"
                          autoComplete="email"
                          {...field}
                          onChange={(e) => { setLoginError(null); field.onChange(e); }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="••••••••"
                          autoComplete="current-password"
                          {...field}
                          onChange={(e) => { setLoginError(null); field.onChange(e); }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" variant="outline" disabled={loginMutation.isPending}>
                  {loginMutation.isPending
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Authenticating...</>
                    : "Login to Terminal"}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>

        <CardFooter className="flex justify-center border-t p-4">
          <p className="text-sm text-muted-foreground">
            New user?{" "}
            <Link href="/register">
              <span className="text-primary hover:underline cursor-pointer font-medium inline-flex items-center gap-1">
                Open Paper Account <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
