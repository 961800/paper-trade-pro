import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useLocation } from "wouter";
import { useRegister, useSendOtp } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ArrowLeft, Phone, AlertCircle, Loader2, Copy, Check, IndianRupee } from "lucide-react";
import { cn } from "@/lib/utils";

function extractErrorMessage(error: unknown): string {
  if (!error) return "Something went wrong.";
  const data = (error as any)?.data;
  if (data?.error)   return data.error;
  if (data?.message) return data.message;
  const msg = (error as any)?.message ?? "";
  const colonIdx = msg.indexOf(": ");
  if (colonIdx !== -1 && msg.startsWith("HTTP ")) return msg.slice(colonIdx + 2);
  return msg || "Something went wrong.";
}

const fullNameRegex = /^[a-zA-Z\s]+$/;
const phoneRegex    = /^[6-9]\d{9}$/;

const registerSchema = z.object({
  fullName: z.string()
    .min(3, "Please enter your full name (min 3 characters).")
    .regex(fullNameRegex, "Name should contain only letters and spaces."),
  email: z.string()
    .min(1, "Email is required.")
    .email("Please enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
  phone: z.string().regex(phoneRegex, "Please enter a valid Indian mobile number (10 digits, starts with 6-9)."),
  age: z.coerce.number().int().min(18, "You must be at least 18 years old."),
  city: z.string().min(2, "City is required."),
  initialCapital: z.coerce.number()
    .min(10000, "Minimum capital is ₹10,000.")
    .max(10000000, "Maximum capital is ₹1,00,00,000."),
  otp: z.string().length(6, "OTP must be exactly 6 digits."),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

const CAPITAL_PRESETS = [
  { label: "₹10K",   value: 10000 },
  { label: "₹25K",   value: 25000 },
  { label: "₹50K",   value: 50000 },
  { label: "₹1 Lakh", value: 100000 },
  { label: "₹5 Lakh", value: 500000 },
  { label: "Custom",  value: 0 },
];

function formatINR(n: number): string {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)} Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)} L`;
  if (n >= 1000)     return `₹${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return `₹${n}`;
}

export default function Register() {
  const [, setLocation] = useLocation();
  const { refreshUser } = useAuth();
  const { toast } = useToast();
  const registerMutation = useRegister();
  const sendOtpMutation = useSendOtp();

  const [step, setStep] = useState(1);
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [otpSentPhone, setOtpSentPhone] = useState<string | null>(null);
  const [isCustomCapital, setIsCustomCapital] = useState(false);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "", email: "", password: "",
      phone: "", age: 18, city: "",
      initialCapital: 100000,
      otp: "",
    },
  });

  const capital = form.watch("initialCapital");

  const selectPreset = (value: number) => {
    if (value === 0) {
      setIsCustomCapital(true);
      form.setValue("initialCapital", 100000);
    } else {
      setIsCustomCapital(false);
      form.setValue("initialCapital", value);
      form.clearErrors("initialCapital");
    }
  };

  const copyOtp = () => {
    if (!demoOtp) return;
    navigator.clipboard.writeText(demoOtp).then(() => {
      form.setValue("otp", demoOtp);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const onSubmit = async (data: RegisterFormValues) => {
    setFormError(null);
    try {
      const res = await registerMutation.mutateAsync({ data });
      refreshUser();
      toast({
        title: "Account created!",
        description: `${formatINR(data.initialCapital)} virtual capital credited. Happy trading!`,
      });
      setLocation("/dashboard");
    } catch (error: unknown) {
      setFormError(extractErrorMessage(error));
    }
  };

  const goToStep2 = async () => {
    setFormError(null);
    const ok = await form.trigger(["fullName", "email", "password"]);
    if (ok) setStep(2);
  };

  const sendOtp = async () => {
    setFormError(null);
    const ok = await form.trigger(["phone", "age", "city", "initialCapital"]);
    if (!ok) return;
    const phone = form.getValues("phone");
    try {
      const res = await sendOtpMutation.mutateAsync({ data: { phone } });
      setDemoOtp(res.otp ?? null);
      setOtpSentPhone(phone);
      form.setValue("otp", "");
      setCopied(false);
      setStep(3);
    } catch (error: unknown) {
      setFormError(extractErrorMessage(error));
    }
  };

  const resendOtp = async () => {
    setFormError(null);
    const phone = form.getValues("phone");
    try {
      const res = await sendOtpMutation.mutateAsync({ data: { phone } });
      setDemoOtp(res.otp ?? null);
      form.setValue("otp", "");
      setCopied(false);
      toast({ title: "New OTP generated", description: "Check the OTP box below." });
    } catch (error: unknown) {
      setFormError(extractErrorMessage(error));
    }
  };

  const stepLabels = ["Account", "Profile", "Verify"];

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />

      <Card className="w-full max-w-md z-10 border-border/50 shadow-2xl backdrop-blur-sm bg-card/90">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-3xl font-bold tracking-tight">
            <span className="text-primary">PaperTrade</span><span className="text-foreground">Pro</span>
          </CardTitle>
          <CardDescription>
            {step === 1 ? "Create your virtual trading account"
              : step === 2 ? "Set up your profile & starting capital"
              : "Verify your phone number"}
          </CardDescription>

          <div className="flex justify-center gap-2 mt-3">
            {stepLabels.map((label, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className={`h-1.5 w-12 rounded-full transition-colors ${
                  step > i ? "bg-primary" : step === i + 1 ? "bg-primary/70" : "bg-muted"
                }`} />
                <span className={`text-[10px] ${step === i + 1 ? "text-primary font-medium" : "text-muted-foreground"}`}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </CardHeader>

        <CardContent>
          {formError && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="ml-2 font-medium">{formError}</AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>

              {/* ── Step 1: Account ── */}
              {step === 1 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <FormField control={form.control} name="fullName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Arjun Sharma" autoComplete="name" {...field}
                          onChange={e => { setFormError(null); field.onChange(e); }} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input placeholder="trader@example.com" type="email" autoComplete="email" {...field}
                          onChange={e => { setFormError(null); field.onChange(e); }} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Min 6 characters" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="button" className="w-full mt-2" onClick={goToStep2}>
                    Continue <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              )}

              {/* ── Step 2: Profile + Capital ── */}
              {step === 2 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mobile Number</FormLabel>
                      <FormControl>
                        <div className="flex">
                          <span className="inline-flex items-center px-3 border border-r-0 border-border rounded-l-md bg-muted text-muted-foreground text-sm">+91</span>
                          <Input
                            placeholder="9876543210"
                            maxLength={10}
                            className="rounded-l-none"
                            {...field}
                            onChange={e => { setFormError(null); field.onChange(e.target.value.replace(/\D/g, "")); }}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="age" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Age</FormLabel>
                        <FormControl><Input type="number" min="18" max="100" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="city" render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl><Input placeholder="Mumbai" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {/* Capital Selector */}
                  <FormField control={form.control} name="initialCapital" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <IndianRupee className="w-3.5 h-3.5" />
                        Starting Virtual Capital
                      </FormLabel>

                      {/* Preset chips */}
                      <div className="grid grid-cols-3 gap-2">
                        {CAPITAL_PRESETS.map((preset) => {
                          const isSelected = preset.value === 0
                            ? isCustomCapital
                            : !isCustomCapital && field.value === preset.value;
                          return (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => selectPreset(preset.value)}
                              className={cn(
                                "rounded-lg border px-2 py-2 text-sm font-medium transition-all text-center",
                                isSelected
                                  ? "border-primary bg-primary/15 text-primary ring-1 ring-primary"
                                  : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-muted/50"
                              )}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* Custom input */}
                      {isCustomCapital && (
                        <FormControl>
                          <div className="relative mt-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">₹</span>
                            <Input
                              type="number"
                              placeholder="Enter amount (e.g. 75000)"
                              className="pl-7"
                              min={10000}
                              max={10000000}
                              {...field}
                              onChange={e => {
                                setFormError(null);
                                field.onChange(e.target.valueAsNumber || 0);
                              }}
                            />
                          </div>
                        </FormControl>
                      )}
                      <FormMessage />

                      {/* Preview */}
                      {!isNaN(capital) && capital >= 10000 && (
                        <div className="flex items-center justify-between rounded-lg bg-muted/50 border border-border px-3 py-2 mt-1">
                          <span className="text-xs text-muted-foreground">Your starting capital</span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-primary font-mono">
                              ₹{capital.toLocaleString("en-IN")}
                            </span>
                            {capital >= 100000 && (
                              <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/40 bg-green-500/10">
                                {formatINR(capital)}
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </FormItem>
                  )} />

                  <div className="flex gap-3 mt-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>
                      <ArrowLeft className="w-4 h-4 mr-2" /> Back
                    </Button>
                    <Button type="button" className="flex-1" disabled={sendOtpMutation.isPending} onClick={sendOtp}>
                      {sendOtpMutation.isPending
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</>
                        : <><Phone className="w-4 h-4 mr-2" /> Send OTP</>}
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Step 3: OTP ── */}
              {step === 3 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  {/* Capital confirmation */}
                  <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Starting capital confirmed</p>
                      <p className="font-bold text-primary font-mono text-lg">
                        ₹{(capital || 100000).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-primary underline"
                      onClick={() => setStep(2)}
                    >
                      Change
                    </button>
                  </div>

                  {/* Demo OTP Banner */}
                  {demoOtp && (
                    <div className="rounded-xl border-2 border-primary bg-primary/10 p-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-primary uppercase tracking-wider">
                          Demo Mode — Your OTP
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-primary hover:bg-primary/20"
                          onClick={copyOtp}
                        >
                          {copied
                            ? <><Check className="w-3 h-3 mr-1" /> Copied!</>
                            : <><Copy className="w-3 h-3 mr-1" /> Copy & fill</>}
                        </Button>
                      </div>
                      <p className="text-4xl font-bold font-mono tracking-[0.35em] text-primary text-center py-1">
                        {demoOtp}
                      </p>
                      <p className="text-xs text-muted-foreground text-center mt-1">
                        Valid for 5 minutes · No SMS sent (demo app)
                      </p>
                      {otpSentPhone && (
                        <p className="text-xs text-muted-foreground text-center">
                          For number: +91 {otpSentPhone}
                        </p>
                      )}
                    </div>
                  )}

                  <FormField control={form.control} name="otp" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Enter 6-Digit OTP</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="_ _ _ _ _ _"
                          maxLength={6}
                          className="text-center text-2xl font-mono tracking-[0.4em] h-12"
                          {...field}
                          onChange={e => {
                            setFormError(null);
                            field.onChange(e.target.value.replace(/\D/g, ""));
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <p className="text-xs text-muted-foreground text-center">
                    OTP expired?{" "}
                    <button
                      type="button"
                      className="text-primary hover:underline font-medium"
                      onClick={resendOtp}
                      disabled={sendOtpMutation.isPending}
                    >
                      {sendOtpMutation.isPending ? "Sending..." : "Resend OTP"}
                    </button>
                  </p>

                  <div className="flex gap-3 mt-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(2)}>
                      <ArrowLeft className="w-4 h-4 mr-2" /> Back
                    </Button>
                    <Button type="submit" className="flex-1" disabled={registerMutation.isPending}>
                      {registerMutation.isPending
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</>
                        : "Start Trading →"}
                    </Button>
                  </div>
                </div>
              )}

            </form>
          </Form>
        </CardContent>

        <CardFooter className="flex justify-center border-t p-4">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login">
              <span className="text-primary hover:underline cursor-pointer font-medium">Login</span>
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
