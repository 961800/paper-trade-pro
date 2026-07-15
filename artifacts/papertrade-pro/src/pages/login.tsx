import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, AlertCircle, Loader2, LogIn } from "lucide-react";

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
  const { login, refreshUser } = useAuth();
  const { toast } = useToast();
  const loginMutation = useLogin();
  const [loginError, setLoginError] = useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setLoginError(null);
    try {
      const res = await loginMutation.mutateAsync({ data });
      refreshUser();
      toast({ title: "Welcome back!", description: `Logged in as ${res.user.fullName}` });
      setLocation("/dashboard");
    } catch (error: unknown) {
      setLoginError(extractErrorMessage(error));
    }
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
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Replit Auth — primary sign-in */}
          <Button
            variant="default"
            className="w-full flex items-center gap-2"
            onClick={login}
          >
            <LogIn className="w-4 h-4" />
            Sign in
          </Button>

          <div className="relative">
            <Separator />
            <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
              or continue with email
            </span>
          </div>

          {loginError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="ml-2 font-medium">{loginError}</AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
