import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Ticker } from "./ticker";
import { 
  LayoutDashboard, 
  LineChart, 
  ArrowRightLeft, 
  Briefcase, 
  ListOrdered, 
  History, 
  Star, 
  Trophy, 
  BarChart2, 
  Bell, 
  Settings, 
  User, 
  LogOut,
  Menu
} from "lucide-react";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";

interface LayoutProps {
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/market", label: "Market & Chain", icon: LineChart },
  { href: "/trade", label: "Trade Options", icon: ArrowRightLeft },
  { href: "/positions", label: "Positions", icon: Briefcase },
  { href: "/orders", label: "Order Book", icon: ListOrdered },
  { href: "/trades", label: "Trade History", icon: History },
  { href: "/watchlist", label: "Watchlist", icon: Star },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
];

export function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  const handleLogout = () => {
    logout();
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-card border-r border-border">
      <div className="p-4 border-b border-border">
        <h1 className="text-xl font-bold text-primary tracking-tight">PaperTrade<span className="text-foreground">Pro</span></h1>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors ${isActive ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-border space-y-1">
        <Link href="/notifications">
          <div className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors ${location === '/notifications' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
            <Bell className="w-5 h-5" />
            <span>Notifications</span>
          </div>
        </Link>
        <Link href="/profile">
          <div className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors ${location === '/profile' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
            <User className="w-5 h-5" />
            <span>Profile</span>
          </div>
        </Link>
        <Link href="/settings">
          <div className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors ${location === '/settings' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </div>
        </Link>
        <div onClick={handleLogout} className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer text-destructive hover:bg-destructive/10 transition-colors">
          <LogOut className="w-5 h-5" />
          <span>Logout</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:block w-64 flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <div className="flex flex-col flex-1 w-full min-w-0">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
          <h1 className="text-xl font-bold text-primary tracking-tight">PaperTrade<span className="text-foreground">Pro</span></h1>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="w-6 h-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64">
              <SidebarContent />
            </SheetContent>
          </Sheet>
        </header>

        {/* Global Ticker */}
        {user && <Ticker />}

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}