import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useLocation } from "wouter";
import { useRegister } from "@workspace/api-client-react";
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
import { ArrowRight, ArrowLeft } from "lucide-react";

const registerSchema = z.object({
  fullName: z.string().min(2, { message: "Name must be at least 2 characters" }),
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
  phone: z.string().min(10, { message: "Invalid phone number" }),
  age: z.coerce.number().min(18, { message: "You must be at least 18 years old" }),
  city: z.string().min(2, { message: "City is required" }),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function Register() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const registerMutation = useRegister();
  const [step, setStep] = useState(1);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      phone: "",
      age: 18,
      city: "",
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

  const handleNext = async () => {
    const fieldsToValidate: any[] = step === 1 
      ? ['fullName', 'email', 'password'] 
      : ['phone', 'age', 'city'];
      
    const isValid = await form.trigger(fieldsToValidate);
    if (isValid && step === 1) {
      setStep(2);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
      
      <Card className="w-full max-w-md z-10 border-border/50 shadow-2xl backdrop-blur-sm bg-card/90">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-3xl font-bold tracking-tight text-primary">PaperTrade<span className="text-foreground">Pro</span></CardTitle>
          <CardDescription>
            {step === 1 ? "Create your virtual trading account" : "Complete your trader profile"}
          </CardDescription>
          <div className="flex justify-center gap-2 mt-4">
            <div className={`h-1.5 w-12 rounded-full ${step >= 1 ? 'bg-primary' : 'bg-muted'}`} />
            <div className={`h-1.5 w-12 rounded-full ${step >= 2 ? 'bg-primary' : 'bg-muted'}`} />
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
                          <Input placeholder="John Doe" {...field} />
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
                  <Button type="button" className="w-full mt-6" onClick={handleNext}>
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
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input placeholder="+91 9876543210" {...field} />
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
              <span className="text-primary hover:underline cursor-pointer font-medium">
                Login
              </span>
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}