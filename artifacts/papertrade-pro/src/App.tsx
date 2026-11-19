import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import Market from "@/pages/market";
import Trade from "@/pages/trade";
import Positions from "@/pages/positions";
import Orders from "@/pages/orders";
import Trades from "@/pages/trades";
import Watchlist from "@/pages/watchlist";
import Leaderboard from "@/pages/leaderboard";
import Analytics from "@/pages/analytics";
import Notifications from "@/pages/notifications";
import Profile from "@/pages/profile";
import Settings from "@/pages/settings";
import AdminUsers from "@/pages/admin-users";

const queryClient = new QueryClient();

// Protected route wrapper
function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  const token = typeof window !== "undefined" ? localStorage.getItem("papertrade_token") : null;

  if (isLoading || (token && !isAuthenticated)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading trading terminal...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/leaderboard" component={Leaderboard} />
      
      {/* Protected Routes */}
      <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
      <Route path="/market"><ProtectedRoute component={Market} /></Route>
      <Route path="/trade"><ProtectedRoute component={Trade} /></Route>
      <Route path="/positions"><ProtectedRoute component={Positions} /></Route>
      <Route path="/orders"><ProtectedRoute component={Orders} /></Route>
      <Route path="/trades"><ProtectedRoute component={Trades} /></Route>
      <Route path="/watchlist"><ProtectedRoute component={Watchlist} /></Route>
      <Route path="/analytics"><ProtectedRoute component={Analytics} /></Route>
      <Route path="/notifications"><ProtectedRoute component={Notifications} /></Route>
      <Route path="/profile"><ProtectedRoute component={Profile} /></Route>
      <Route path="/settings"><ProtectedRoute component={Settings} /></Route>
      <Route path="/admin/users"><ProtectedRoute component={AdminUsers} /></Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="papertrade-theme">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;