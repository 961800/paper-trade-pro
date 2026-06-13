import React from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans text-foreground">
      <header className="px-6 py-4 flex items-center justify-between border-b border-border/40 backdrop-blur-md sticky top-0 z-50">
        <div className="font-bold text-2xl tracking-tight text-primary">PaperTrade<span className="text-foreground">Pro</span></div>
        <div className="flex gap-4">
          <Link href="/login">
            <Button variant="ghost">Login</Button>
          </Link>
          <Link href="/register">
            <Button>Start Trading</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="py-24 px-6 md:px-12 max-w-7xl mx-auto flex flex-col items-center text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-5xl md:text-7xl font-bold tracking-tighter max-w-4xl mx-auto leading-tight">
              Master the Markets.<br />
              <span className="text-muted-foreground">Zero Capital Risk.</span>
            </h1>
            <p className="mt-6 text-xl text-muted-foreground max-w-2xl mx-auto">
              The most advanced paper trading platform for Indian markets. Get ₹1,00,000 virtual capital to trade NIFTY, BANKNIFTY, and more.
            </p>
            <div className="mt-10 flex gap-4 justify-center">
              <Link href="/register">
                <Button size="lg" className="h-12 px-8 text-base">Open Free Account</Button>
              </Link>
              <Link href="/leaderboard">
                <Button size="lg" variant="outline" className="h-12 px-8 text-base">View Leaderboard</Button>
              </Link>
            </div>
          </motion.div>
        </section>

      </main>

      <footer className="border-t border-border/40 py-8 text-center text-muted-foreground">
        <p>© 2025 PaperTrade Pro. Practice trading simulator.</p>
      </footer>
    </div>
  );
}