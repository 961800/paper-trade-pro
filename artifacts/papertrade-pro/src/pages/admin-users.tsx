import React, { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useGetAdminUsers, customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PnLBadge } from "@/components/pnl-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Users,
  Search,
  TrendingUp,
  Wallet,
  Landmark,
  Briefcase,
  ShieldAlert,
  ShieldCheck,
  Ban,
  Unlock,
  RotateCcw,
  MoreVertical,
  Lock,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  UserCheck,
  UserX,
} from "lucide-react";

interface AdminUser {
  id: number;
  fullName: string;
  email: string;
  phone: string | null;
  city: string | null;
  balance: number;
  initialCapital: number;
  portfolioValue: number;
  totalPnl: number;
  openPositionsCount: number;
  isBanned: boolean;
  killSwitchActive: boolean;
  isAdmin: boolean;
  createdAt: string;
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function AdminUsers() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = (user as any)?.isAdmin === true;

  const { data, isLoading } = useGetAdminUsers({
    query: {
      queryKey: ["/api/admin/users"],
      enabled: isAdmin,
    },
  });

  const [search, setSearch] = useState("");

  // Modal / Action states
  const [selectedUserForReset, setSelectedUserForReset] = useState<AdminUser | null>(null);
  const [resetAmount, setResetAmount] = useState<number>(100000);
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);

  const [selectedUserForBan, setSelectedUserForBan] = useState<AdminUser | null>(null);
  const [isBanning, setIsBanning] = useState(false);

  const [selectedUserForDelete, setSelectedUserForDelete] = useState<AdminUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isAdmin) {
    return (
      <Layout>
        <div className="py-24 text-center space-y-4 max-w-md mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/30 flex items-center justify-center mx-auto text-destructive shadow-sm">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Access Restricted</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This dashboard displays sensitive trader account controls and is restricted to system administrators only.
          </p>
          <Button onClick={() => setLocation("/dashboard")} className="mt-2">
            Back to Dashboard
          </Button>
        </div>
      </Layout>
    );
  }

  const rawUsers = (data?.users ?? []) as unknown as AdminUser[];
  const users: AdminUser[] = rawUsers.map((u) => ({
    ...u,
    isBanned: Boolean((u as any).isBanned),
    killSwitchActive: Boolean((u as any).killSwitchActive),
    isAdmin: Boolean((u as any).isAdmin),
  }));

  const filtered = users.filter(
    (u) =>
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  const totalPortfolio = users.reduce((s, u) => s + u.portfolioValue, 0);
  const totalCapital = users.reduce((s, u) => s + u.initialCapital, 0);
  const totalPnl = users.reduce((s, u) => s + u.totalPnl, 0);
  const bannedCount = users.filter((u) => u.isBanned).length;
  const activeCount = users.length - bannedCount;

  // Toggle Ban Handler
  const handleToggleBan = async (target: AdminUser, shouldBan: boolean) => {
    setIsBanning(true);
    try {
      const res = await customFetch<{ success: boolean; isBanned: boolean; message: string }>(
        `/api/admin/users/${target.id}/ban`,
        {
          method: "POST",
          body: JSON.stringify({ banned: shouldBan }),
        },
      );
      toast({
        title: res.isBanned ? "User Account Suspended" : "User Account Restored",
        description: res.message,
        variant: res.isBanned ? "destructive" : "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setSelectedUserForBan(null);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Action Failed",
        description: err?.data?.error || err?.message || "Failed to update user ban status",
      });
    } finally {
      setIsBanning(false);
    }
  };

  // Reset Capital Handler
  const handleResetCapital = async () => {
    if (!selectedUserForReset) return;
    setIsSubmittingReset(true);
    try {
      const res = await customFetch<{ success: boolean; message: string }>(
        `/api/admin/users/${selectedUserForReset.id}/reset-capital`,
        {
          method: "POST",
          body: JSON.stringify({ amount: resetAmount }),
        },
      );
      toast({
        title: "Capital Reset Successful",
        description: res.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setSelectedUserForReset(null);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Reset Failed",
        description: err?.data?.error || err?.message || "Failed to reset capital",
      });
    } finally {
      setIsSubmittingReset(false);
    }
  };

  // Toggle Freeze (Kill Switch) Handler
  const handleToggleFreeze = async (target: AdminUser) => {
    try {
      const res = await customFetch<{ success: boolean; killSwitchActive: boolean; message: string }>(
        `/api/admin/users/${target.id}/toggle-kill-switch`,
        {
          method: "POST",
          body: JSON.stringify({ active: !target.killSwitchActive }),
        },
      );
      toast({
        title: res.killSwitchActive ? "Trading Freeze Activated" : "Trading Freeze Deactivated",
        description: res.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Action Failed",
        description: err?.data?.error || err?.message || "Failed to update trading freeze",
      });
    }
  };

  // Delete User Handler
  const handleDeleteUser = async () => {
    if (!selectedUserForDelete) return;
    setIsDeleting(true);
    try {
      const res = await customFetch<{ success: boolean; message: string }>(
        `/api/admin/users/${selectedUserForDelete.id}`,
        {
          method: "DELETE",
        },
      );
      toast({
        title: "User Account Deleted",
        description: res.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setSelectedUserForDelete(null);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: err?.data?.error || err?.message || "Failed to delete user",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Users className="w-6 h-6 text-primary" /> Admin User Management
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Full administrative authority: ban/unban users, reset virtual capital, and manage trading permissions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 px-3 py-1">
              <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Admin Cockpit Active
            </Badge>
          </div>
        </div>

        {/* Aggregate stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="w-3 h-3" /> Total Traders
              </p>
              <p className="text-xl font-bold mt-1">{users.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-emerald-400" /> Active / Banned
              </p>
              <p className="text-xl font-bold mt-1">
                <span className="text-emerald-400">{activeCount}</span>
                <span className="text-muted-foreground text-sm font-normal"> / </span>
                <span className={bannedCount > 0 ? "text-destructive" : "text-muted-foreground"}>{bannedCount}</span>
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Landmark className="w-3 h-3" /> Total Capital
              </p>
              <p className="text-xl font-bold mt-1">{fmt(totalCapital)}</p>
            </CardContent>
          </Card>
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-primary" /> Total Portfolio
              </p>
              <p className="text-xl font-bold mt-1">{fmt(totalPortfolio)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Wallet className="w-3 h-3" /> Aggregate P&amp;L
              </p>
              <div className="mt-1">
                <PnLBadge amount={totalPnl} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* User table */}
        <Card>
          <CardHeader className="py-3 px-4 border-b border-border">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                All Trader Accounts &amp; Admin Controls
              </CardTitle>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-16 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" /> Loading trader records…
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground text-sm">No traders found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                      <th className="text-left px-4 py-2.5 font-medium">User Profile</th>
                      <th className="text-center px-3 py-2.5 font-medium">Status</th>
                      <th className="text-right px-3 py-2.5 font-medium">Initial Capital</th>
                      <th className="text-right px-3 py-2.5 font-medium">Cash Balance</th>
                      <th className="text-right px-3 py-2.5 font-medium">Portfolio</th>
                      <th className="text-right px-3 py-2.5 font-medium">P&amp;L</th>
                      <th className="text-center px-3 py-2.5 font-medium">Positions</th>
                      <th className="text-right px-3 py-2.5 font-medium">Joined</th>
                      <th className="text-right px-4 py-2.5 font-medium">Admin Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u, i) => (
                      <tr
                        key={u.id}
                        className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors ${
                          u.isBanned ? "bg-destructive/5" : i % 2 === 0 ? "" : "bg-muted/10"
                        }`}
                      >
                        {/* User Profile */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                u.isBanned
                                  ? "bg-destructive/20 text-destructive border border-destructive/30"
                                  : u.isAdmin
                                  ? "bg-primary/20 text-primary border border-primary/30"
                                  : "bg-muted text-foreground border border-border"
                              }`}
                            >
                              {u.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium leading-tight truncate flex items-center gap-1.5">
                                {u.fullName}
                                {u.isAdmin && (
                                  <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.2 rounded font-semibold">
                                    ADMIN
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                              {u.phone && <p className="text-[11px] text-muted-foreground/80">{u.phone}</p>}
                            </div>
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          {u.isBanned ? (
                            <Badge
                              variant="destructive"
                              className="bg-destructive/20 text-destructive border-destructive/40 text-[11px] px-2 py-0.5 inline-flex items-center gap-1"
                            >
                              <Ban className="w-3 h-3" /> Banned
                            </Badge>
                          ) : (
                            <div className="inline-flex items-center gap-1">
                              <Badge
                                variant="outline"
                                className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[11px] px-2 py-0.5 inline-flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Active
                              </Badge>
                              {u.killSwitchActive && (
                                <Badge
                                  variant="outline"
                                  className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0.5"
                                  title="Emergency trade freeze active"
                                >
                                  Frozen
                                </Badge>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Initial Capital */}
                        <td className="px-3 py-3 text-right tabular-nums text-xs">{fmt(u.initialCapital)}</td>

                        {/* Cash Balance */}
                        <td className="px-3 py-3 text-right tabular-nums text-xs font-medium">{fmt(u.balance)}</td>

                        {/* Portfolio Value */}
                        <td className="px-3 py-3 text-right tabular-nums text-xs font-semibold">{fmt(u.portfolioValue)}</td>

                        {/* P&L */}
                        <td className="px-3 py-3 text-right">
                          <PnLBadge amount={u.totalPnl} />
                        </td>

                        {/* Open Positions */}
                        <td className="px-3 py-3 text-center">
                          {u.openPositionsCount > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs bg-blue-500/10 text-blue-400 rounded px-1.5 py-0.5 font-medium">
                              <Briefcase className="w-3 h-3" /> {u.openPositionsCount}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>

                        {/* Joined Date */}
                        <td className="px-3 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(u.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>

                        {/* Admin Action Buttons */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {u.isAdmin ? (
                            <span className="text-xs text-muted-foreground/80 px-2.5 py-1 bg-muted/40 rounded border border-border/50">
                              Owner Account
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Ban / Unban Button */}
                              {u.isBanned ? (
                                <Button
                                  onClick={() => handleToggleBan(u, false)}
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 gap-1 px-2.5"
                                  title="Restore and unban this user account"
                                >
                                  <Unlock className="w-3 h-3" /> Unban
                                </Button>
                              ) : (
                                <Button
                                  onClick={() => setSelectedUserForBan(u)}
                                  size="sm"
                                  variant="destructive"
                                  className="h-7 text-xs bg-destructive/80 hover:bg-destructive text-destructive-foreground gap-1 px-2.5"
                                  title="Immediately ban user and terminate sessions"
                                >
                                  <Ban className="w-3 h-3" /> Ban User
                                </Button>
                              )}

                              {/* Reset Capital Button */}
                              <Button
                                onClick={() => {
                                  setSelectedUserForReset(u);
                                  setResetAmount(100000);
                                }}
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-border hover:bg-muted gap-1 px-2.5"
                                title="Reset user virtual cash and initial capital"
                              >
                                <RotateCcw className="w-3 h-3" /> Reset ₹
                              </Button>

                              {/* More Dropdown */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                                    <MoreVertical className="w-3.5 h-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48 text-xs">
                                  <DropdownMenuItem
                                    onClick={() => handleToggleFreeze(u)}
                                    className="cursor-pointer gap-2"
                                  >
                                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                                    {u.killSwitchActive ? "Lift Trading Freeze" : "Emergency Freeze Trading"}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => setSelectedUserForDelete(u)}
                                    className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete User Account
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 1. Reset Capital Dialog */}
      <Dialog open={!!selectedUserForReset} onOpenChange={(open) => !open && setSelectedUserForReset(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <RotateCcw className="w-5 h-5 text-primary" /> Reset Virtual Capital
            </DialogTitle>
            <DialogDescription>
              Adjust the virtual trading balance and initial capital for{" "}
              <strong className="text-foreground">{selectedUserForReset?.fullName}</strong> (
              {selectedUserForReset?.email}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1.5 font-medium">Quick Presets</p>
              <div className="grid grid-cols-4 gap-2">
                {[50000, 100000, 200000, 500000].map((amt) => (
                  <Button
                    key={amt}
                    type="button"
                    variant={resetAmount === amt ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => setResetAmount(amt)}
                  >
                    {fmt(amt)}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Custom Capital Amount (₹)
              </label>
              <Input
                type="number"
                min={1000}
                max={100000000}
                step={5000}
                value={resetAmount}
                onChange={(e) => setResetAmount(Number(e.target.value))}
                className="h-9 text-sm"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Will set cash balance and initial capital to ₹{resetAmount.toLocaleString("en-IN")}.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedUserForReset(null)}
              disabled={isSubmittingReset}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleResetCapital}
              disabled={isSubmittingReset || resetAmount <= 0}
            >
              {isSubmittingReset ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Saving…
                </>
              ) : (
                "Confirm Capital Reset"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Ban Confirmation Dialog */}
      <Dialog open={!!selectedUserForBan} onOpenChange={(open) => !open && setSelectedUserForBan(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive text-lg">
              <Ban className="w-5 h-5" /> Ban User Account
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2">
              <p>
                Are you sure you want to ban{" "}
                <strong className="text-foreground">{selectedUserForBan?.fullName}</strong> (
                {selectedUserForBan?.email})?
              </p>
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-xs text-destructive space-y-1">
                <p className="font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> What happens when banned:
                </p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>All active login sessions are revoked immediately.</li>
                  <li>User is blocked from logging in with password or Gmail OTP.</li>
                  <li>User cannot place orders or execute option trades.</li>
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedUserForBan(null)}
              disabled={isBanning}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => selectedUserForBan && handleToggleBan(selectedUserForBan, true)}
              disabled={isBanning}
            >
              {isBanning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Banning…
                </>
              ) : (
                "Confirm Ban User"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 3. Delete User Confirmation Dialog */}
      <Dialog open={!!selectedUserForDelete} onOpenChange={(open) => !open && setSelectedUserForDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive text-lg">
              <Trash2 className="w-5 h-5" /> Permanently Delete User
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2">
              <p>
                Permanently delete{" "}
                <strong className="text-foreground">{selectedUserForDelete?.fullName}</strong> (
                {selectedUserForDelete?.email})?
              </p>
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded p-2.5">
                <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                This action is irreversible. All portfolio positions, orders, trade history, AI mentor records, and
                sessions will be permanently erased.
              </p>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedUserForDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDeleteUser}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Deleting…
                </>
              ) : (
                "Delete Account Forever"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
