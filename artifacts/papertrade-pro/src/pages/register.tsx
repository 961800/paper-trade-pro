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
import { ArrowRight, ArrowLeft, Phone, ShieldCheck } from "lucide-react";

const fullNameRegex = /^[a-zA-Z\s]+$/;
const phoneRegex    = /^[6-9]\d{9}$/;
const emailRegex    = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const registerSchema = z.object({
  fullName: z.string()
    .min(3, "Please enter a valid name.")
    .regex(fullNameRegex, "Please enter a valid name."),
  email: z.string()
    .min(1, "Please enter a valid email address.")
    .email("Please enter a valid email address.")
    .regex(emailRegex, "Please enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
  phone: z.string().regex(phoneRegex, "Please enter a valid Indian mobile number."),
  age: z.coerce.number().int().min(18, "You must be at least 18 years old."),
  city: z.string().min(2, "City is required."),
  otp: z.string().length(6, "OTP must be exactly 6 digits."),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function Register() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const registerMutation = useRegister();
  const sendOtpMutation = useSendOtp();
  const [step, setStep] = useState(1);
  const [demoOtp, setDemoOtp] = useState<string | null>(null);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      phone: "",
      age: 18,
      city: "",
      otp: "",
    },
  });

  const onSubmit = async (data: RegisterFormValues) => {
    try {
      const res = await registerMutation.mutateAsync({ data });
      login(res.token, res.user);
      toast({
        title: "Registration successful",
        description: "Welcome to PaperTrade Pro! ₹1,00,000 has been credited to your virtual account.",
      });
      setLocation("/dashboard");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Registration failed",
        description: error.message || "Please check your details and try again.",
      });
    }
  };

  const handleNextStep1 = async () => {
    const isValid = await form.trigger(["fullName", "email", "password"]);
    if (isValid) setStep(2);
  };

  const handleNextStep2 = async () => {
    const isValid = await form.trigger(["phone", "age", "city"]);
    if (!isValid) return;

    const phone = form.getValues("phone");
    try {
      const res = await sendOtpMutation.mutateAsync({ data: { phone } });
      setDemoOtp(res.otp ?? null);
      setStep(3);
      toast({ title: "OTP sent", description: "Check below for your demo OTP." });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to send OTP",
        description: error.message || "Please check your phone number.",
      });
    }
  };

  const resendOtp = async () => {
    const phone = form.getValues("phone");
    try {
      const res = await sendOtpMutation.mutateAsync({ data: { phone } });
      setDemoOtp(res.otp ?? null);
      form.setValue("otp", "");
      toast({ title: "OTP resent", description: "New OTP generated." });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to resend OTP",
        description: error.message || "Please try again.",
      });
    }
  };

  const stepLabels = ["Account", "Profile", "Verify"];

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />

      <Card className="w-full max-w-md z-10 border-border/50 shadow-2xl backdrop-blur-sm bg-card/90">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-3xl font-bold tracking-tight text-primary">
            PaperTrade<span className="text-foreground">Pro</span>
          </CardTitle>
          <CardDescription>
            {step === 1 ? "Create your virtual trading account" : step === 2 ? "Complete your trader profile" : "Verify your phone number"}
          </CardDescription>
          <div className="flex justify-center gap-2 mt-4">
            {stepLabels.map((label, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className={`h-1.5 w-12 rounded-full transition-colors ${step > i ? "bg-primary" : step === i + 1 ? "bg-primary/70" : "bg-muted"}`} />
                <span className={`text-[10px] ${step === i + 1 ? "text-primary" : "text-muted-foreground"}`}>{label}</span>
              </div>
            ))}
          </div>
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

              {step === 1 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Arjun Sharma" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="trader@example.com" type="email" {...field} />
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
                          <Input type="password" placeholder="••••••••" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="button" className="w-full mt-6" onClick={handleNextStep1}>
                    Continue <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number (Indian mobile)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="9876543210"
                            maxLength={10}
                            {...field}
                            onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ""))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="age"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Age</FormLabel>
                          <FormControl>
                            <Input type="number" min="18" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input placeholder="Mumbai" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="flex gap-4 mt-6">
                    <Button type="button" variant="outline" className="w-full" onClick={() => setStep(1)}>
                      <ArrowLeft className="w-4 h-4 mr-2" /> Back
                    </Button>
                    <Button
                      type="button"
                      className="w-full"
                      disabled={sendOtpMutation.isPending}
                      onClick={handleNextStep2}
                    >
                      {sendOtpMutation.isPending ? "Sending..." : <><Phone className="w-4 h-4 mr-2" /> Send OTP</>}
                    </Button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  {demoOtp && (
                    <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 text-center">
                      <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> Demo mode — your OTP is:
                      </p>
                      <p className="text-3xl font-bold font-mono tracking-[0.3em] text-primary">{demoOtp}</p>
                      <p className="text-xs text-muted-foreground mt-1">Valid for 10 minutes</p>
                    </div>
                  )}
                  <FormField
                    control={form.control}
                    name="otp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Enter 6-digit OTP</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="123456"
                            maxLength={6}
                            className="text-center text-xl font-mono tracking-widest"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ""))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    Didn't receive OTP?{" "}
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={resendOtp}
                      disabled={sendOtpMutation.isPending}
                    >
                      Resend
                    </button>
                  </p>
                  <div className="flex gap-4 mt-4">
                    <Button type="button" variant="outline" className="w-full" onClick={() => setStep(2)}>
                      <ArrowLeft className="w-4 h-4 mr-2" /> Back
                    </Button>
                    <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                      {registerMutation.isPending ? "Creating..." : "Start Trading"}
                    </Button>
                  </div>
                </div>
              )}

            </form>
          </Form>
        </CardContent>

        <CardFooter className="flex justify-center border-t p-4 mt-4">
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
